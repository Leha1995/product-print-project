import hashlib
import json
import os
import secrets
import urllib.request

import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}
WEBHOOK_PREFIX = 'https://functions.poehali.dev/'


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def bot_token() -> str:
    return os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()


def webhook_secret() -> str:
    return hashlib.sha256(('tg-hook:' + bot_token()).encode()).hexdigest()[:48]


def tg(method: str, payload: dict, timeout: float = 4.0) -> dict:
    req = urllib.request.Request(
        f'https://api.telegram.org/bot{bot_token()}/{method}',
        data=json.dumps(payload).encode(),
        headers={'Content-Type': 'application/json'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.loads(res.read().decode())


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        "SELECT u.id, u.role, COALESCE(NULLIF(u.full_name, ''), u.username) FROM app_sessions s "
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} AND s.expires_at > NOW() AND u.active'
    )
    row = cur.fetchone()
    return {'id': row[0], 'role': row[1], 'name': row[2]} if row else None


def link_status(cur, uid: int) -> dict:
    cur.execute(f'SELECT tg_name, linked_at FROM telegram_links WHERE user_id = {int(uid)}')
    row = cur.fetchone()
    return {
        'configured': bool(bot_token()),
        'linked': bool(row),
        'tgName': row[0] if row else '',
        'linkedAt': row[1].isoformat() if row else None,
    }


def handle_update(cur, update: dict) -> None:
    msg = update.get('message') or {}
    chat = msg.get('chat') or {}
    text = str(msg.get('text') or '').strip()
    chat_id = chat.get('id')
    if not chat_id or chat.get('type') != 'private':
        return
    sender = msg.get('from') or {}
    tg_name = ' '.join(filter(None, [sender.get('first_name'), sender.get('last_name')])) or (
        '@' + sender['username'] if sender.get('username') else ''
    )
    if text.startswith('/start'):
        code = text[6:].strip()
        if not code:
            tg('sendMessage', {'chat_id': chat_id, 'text': 'Чтобы получать уведомления, нажмите «Подключить Telegram» в приложении.'})
            return
        cur.execute(
            f'DELETE FROM telegram_link_codes WHERE code = {q(code[:64])} AND expires_at > NOW() RETURNING user_id'
        )
        row = cur.fetchone()
        if not row:
            tg('sendMessage', {'chat_id': chat_id, 'text': 'Ссылка устарела. Нажмите «Подключить Telegram» в приложении ещё раз.'})
            return
        uid = int(row[0])
        cur.execute(f'DELETE FROM telegram_links WHERE chat_id = {int(chat_id)} AND user_id <> {uid}')
        cur.execute(
            'INSERT INTO telegram_links (user_id, chat_id, tg_name, linked_at) '
            f'VALUES ({uid}, {int(chat_id)}, {q(tg_name[:120])}, NOW()) '
            'ON CONFLICT (user_id) DO UPDATE SET chat_id = EXCLUDED.chat_id, tg_name = EXCLUDED.tg_name, linked_at = NOW()'
        )
        cur.execute(f"SELECT COALESCE(NULLIF(full_name, ''), username) FROM app_users WHERE id = {uid}")
        name = (cur.fetchone() or [''])[0]
        tg('sendMessage', {'chat_id': chat_id, 'text': f'Готово! Аккаунт «{name}» подключён — уведомления будут приходить сюда.'})
        return
    if text == '/stop':
        cur.execute(f'DELETE FROM telegram_links WHERE chat_id = {int(chat_id)}')
        tg('sendMessage', {'chat_id': chat_id, 'text': 'Уведомления отключены.'})


def handler(event: dict, context) -> dict:
    """Telegram-бот уведомлений: привязка аккаунта к чату и приём сообщений от Telegram."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = {str(k).lower(): v for k, v in (event.get('headers') or {}).items()}
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()

    def finish(payload: dict, status: int = 200):
        cur.close()
        conn.close()
        return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload)}

    hook_secret = headers.get('x-telegram-bot-api-secret-token')
    if hook_secret is not None:
        if not bot_token() or not secrets.compare_digest(hook_secret, webhook_secret()):
            return finish({'ok': False}, 403)
        try:
            handle_update(cur, json.loads(event.get('body') or '{}'))
        except Exception as err:
            print(f'update failed: {err}')
        return finish({'ok': True})

    me = session_user(cur, headers.get('x-auth-token') or '')
    if not me:
        return finish({'error': 'unauthorized'}, 401)

    if method == 'GET':
        return finish(link_status(cur, me['id']))

    body = json.loads(event.get('body') or '{}')
    action = body.get('action')

    if action == 'unlink':
        cur.execute(f"SELECT chat_id FROM telegram_links WHERE user_id = {int(me['id'])}")
        row = cur.fetchone()
        cur.execute(f"DELETE FROM telegram_links WHERE user_id = {int(me['id'])}")
        if row and bot_token():
            try:
                tg('sendMessage', {'chat_id': row[0], 'text': 'Уведомления отключены в приложении.'}, 3)
            except Exception as err:
                print(f'unlink notify failed: {err}')
        return finish(link_status(cur, me['id']))

    if action == 'link':
        if not bot_token():
            return finish({'error': 'not_configured'}, 400)
        hook_url = str(body.get('webhookUrl') or '')
        try:
            info = tg('getWebhookInfo', {}, 3).get('result') or {}
            if hook_url.startswith(WEBHOOK_PREFIX) and info.get('url') != hook_url:
                tg('setWebhook', {
                    'url': hook_url,
                    'secret_token': webhook_secret(),
                    'allowed_updates': ['message'],
                }, 3)
            bot = tg('getMe', {}, 3).get('result') or {}
        except Exception as err:
            print(f'telegram api failed: {err}')
            return finish({'error': 'telegram_unavailable'}, 502)
        if not bot.get('username'):
            return finish({'error': 'bad_token'}, 400)
        code = secrets.token_urlsafe(18)
        cur.execute(f"DELETE FROM telegram_link_codes WHERE user_id = {int(me['id'])} OR expires_at < NOW()")
        cur.execute(
            'INSERT INTO telegram_link_codes (code, user_id, expires_at) '
            f"VALUES ({q(code)}, {int(me['id'])}, NOW() + INTERVAL '30 minutes')"
        )
        return finish({'url': f"https://t.me/{bot['username']}?start={code}", 'botName': bot['username']})

    return finish({'error': 'bad_action'}, 400)
