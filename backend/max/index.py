import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}
API = 'https://platform-api.max.ru'
ALLOWED_ROLES = ('admin', 'manager', 'technician', 'superadmin')


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def bot_token() -> str:
    return os.environ.get('MAX_BOT_TOKEN', '').strip()


def max_api(method: str, path: str, params: dict | None = None, payload: dict | None = None, timeout: float = 4.0):
    url = f'{API}{path}'
    if params:
        url += '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode() if payload is not None else None,
        method=method,
        headers={'Authorization': bot_token(), 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode() or '{}')
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read().decode() or '{}')
        except ValueError:
            return err.code, {}


def send_text(user_id, text: str) -> None:
    max_api('POST', '/messages', {'user_id': int(user_id)}, {'text': text[:3900], 'format': 'html'}, 3)


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        "SELECT u.id, u.role, COALESCE(NULLIF(u.full_name, ''), u.username) FROM app_sessions s "
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} AND s.expires_at > NOW() AND u.active'
    )
    row = cur.fetchone()
    return {'id': row[0], 'role': row[1], 'name': row[2]} if row else None


def link_status(cur, uid: int, role: str) -> dict:
    cur.execute(f'SELECT max_name, linked_at FROM max_links WHERE user_id = {int(uid)}')
    row = cur.fetchone()
    return {
        'allowed': role in ALLOWED_ROLES,
        'configured': bool(bot_token()),
        'linked': bool(row),
        'name': row[0] if row else '',
        'linkedAt': row[1].isoformat() + 'Z' if row and row[1] else None,
    }


def person_name(user: dict) -> str:
    name = user.get('name') or ' '.join(filter(None, [user.get('first_name'), user.get('last_name')]))
    return (name or (('@' + user['username']) if user.get('username') else '')).strip()[:120]


def apply_code(cur, code: str, max_user: dict) -> None:
    max_uid = max_user.get('user_id')
    if not max_uid:
        return
    code = (code or '').strip()[:128]
    if not code:
        send_text(max_uid, 'Чтобы получать уведомления, нажмите «Подключить MAX» в приложении.')
        return
    cur.execute(f'SELECT user_id FROM max_link_codes WHERE code = {q(code)} AND expires_at > NOW()')
    row = cur.fetchone()
    cur.execute(f'DELETE FROM max_link_codes WHERE code = {q(code)}')
    if not row:
        send_text(max_uid, 'Ссылка устарела. Нажмите «Подключить MAX» в приложении ещё раз.')
        return
    uid = int(row[0])
    cur.execute(f"SELECT role, COALESCE(NULLIF(full_name, ''), username) FROM app_users WHERE id = {uid} AND active")
    user = cur.fetchone()
    if not user or user[0] not in ALLOWED_ROLES:
        send_text(max_uid, 'Уведомления доступны только админам, управляющим, техникам и супер-админу.')
        return
    cur.execute(f'DELETE FROM max_links WHERE max_user_id = {int(max_uid)} AND user_id <> {uid}')
    cur.execute(
        'INSERT INTO max_links (user_id, max_user_id, max_name, linked_at) '
        f'VALUES ({uid}, {int(max_uid)}, {q(person_name(max_user))}, NOW()) '
        'ON CONFLICT (user_id) DO UPDATE SET max_user_id = EXCLUDED.max_user_id, '
        'max_name = EXCLUDED.max_name, linked_at = NOW()'
    )
    send_text(max_uid, f'Готово! Аккаунт «{user[1]}» подключён — уведомления будут приходить сюда.')


def poll_updates(cur) -> None:
    """Забирает новые события у бота MAX (нажатие «Начать», команды) и привязывает аккаунты."""
    cur.execute('SELECT marker FROM max_state WHERE id = 1')
    row = cur.fetchone()
    params = {'timeout': 0, 'limit': 100, 'types': 'bot_started,message_created'}
    if row and row[0]:
        params['marker'] = row[0]
    status, data = max_api('GET', '/updates', params, None, 4)
    if status != 200:
        print(f'max updates failed {status}: {data}')
        return
    for upd in data.get('updates') or []:
        kind = upd.get('update_type')
        try:
            if kind == 'bot_started':
                apply_code(cur, str(upd.get('payload') or ''), upd.get('user') or {})
            elif kind == 'message_created':
                msg = upd.get('message') or {}
                text = str((msg.get('body') or {}).get('text') or '').strip()
                sender = msg.get('sender') or {}
                if text.startswith('/start'):
                    apply_code(cur, text[6:].strip(), sender)
                elif text == '/stop' and sender.get('user_id'):
                    cur.execute(f"DELETE FROM max_links WHERE max_user_id = {int(sender['user_id'])}")
                    send_text(sender['user_id'], 'Уведомления отключены.')
        except Exception as err:
            print(f'max update failed: {err}')
    marker = data.get('marker')
    if marker:
        cur.execute(
            f'INSERT INTO max_state (id, marker) VALUES (1, {int(marker)}) '
            'ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker'
        )


def handler(event: dict, context) -> dict:
    """Подключение уведомлений в мессенджере MAX: привязка аккаунта через бота и отключение."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()

    def finish(payload: dict, status: int = 200):
        cur.close()
        conn.close()
        return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload, ensure_ascii=False)}

    me = session_user(cur, token)
    if not me:
        return finish({'error': 'unauthorized'}, 401)

    if method == 'GET':
        if bot_token():
            cur.execute(f"SELECT 1 FROM max_link_codes WHERE user_id = {int(me['id'])} AND expires_at > NOW()")
            if cur.fetchone():
                try:
                    poll_updates(cur)
                except Exception as err:
                    print(f'max poll failed: {err}')
        return finish(link_status(cur, me['id'], me['role']))

    body = json.loads(event.get('body') or '{}')
    action = body.get('action')

    if action == 'unlink':
        cur.execute(f"SELECT max_user_id FROM max_links WHERE user_id = {int(me['id'])}")
        row = cur.fetchone()
        cur.execute(f"DELETE FROM max_links WHERE user_id = {int(me['id'])}")
        if row and bot_token():
            try:
                send_text(row[0], 'Уведомления отключены в приложении.')
            except Exception as err:
                print(f'max unlink notify failed: {err}')
        return finish(link_status(cur, me['id'], me['role']))

    if action == 'link':
        if me['role'] not in ALLOWED_ROLES:
            return finish({'error': 'forbidden_role'}, 403)
        if not bot_token():
            return finish({'error': 'not_configured'}, 400)
        try:
            status, bot = max_api('GET', '/me', None, None, 4)
        except Exception as err:
            print(f'max api failed: {err}')
            return finish({'error': 'max_unavailable'}, 502)
        if status == 401:
            return finish({'error': 'bad_token'}, 400)
        if status != 200 or not bot.get('username'):
            return finish({'error': 'max_unavailable'}, 502)
        try:
            poll_updates(cur)
        except Exception as err:
            print(f'max poll failed: {err}')
        code = secrets.token_urlsafe(12)
        cur.execute(f"DELETE FROM max_link_codes WHERE user_id = {int(me['id'])} OR expires_at < NOW()")
        cur.execute(
            'INSERT INTO max_link_codes (code, user_id, expires_at) '
            f"VALUES ({q(code)}, {int(me['id'])}, NOW() + INTERVAL '30 minutes')"
        )
        return finish({'url': f"https://max.ru/{bot['username']}?start={code}", 'botName': bot['username']})

    return finish({'error': 'bad_action'}, 400)
