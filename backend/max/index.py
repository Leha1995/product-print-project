import hashlib
import json
import re
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request

import psycopg2

from tasks import handle_callback, handle_dialog_text
from report import (
    SUMMARY_BUTTON, build_report, build_staff_report, flush_overdue_queue, report_settings, reports_due,
    save_overdue_settings, save_report_settings, send_daily_reports,
)

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}
API = 'https://platform-api.max.ru'
ALLOWED_ROLES = ('admin', 'manager', 'technician', 'superadmin')
BOSS_ROLES = ('admin', 'manager', 'superadmin')
WEBHOOK_PREFIX = 'https://functions.poehali.dev/'
SUMMARY_WORDS = ('/summary', '/svodka', 'сводка', 'отчет', 'отчёт')
STAFF_WORDS = ('/staff', 'сотрудники', 'сводка по сотрудникам', 'персонал')
TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


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


def webhook_key() -> str:
    return hashlib.sha256(('max-hook:' + bot_token()).encode()).hexdigest()[:40]


def send_text(user_id, text: str, button: bool = False) -> None:
    body = {'text': text[:3900], 'format': 'html'}
    if button:
        body['attachments'] = SUMMARY_BUTTON
    max_api('POST', '/messages', {'user_id': int(user_id)}, body, 3)


def ensure_webhook(hook_url: str) -> None:
    if not hook_url.startswith(WEBHOOK_PREFIX):
        return
    target = f'{hook_url}?hook={webhook_key()}'
    status, data = max_api('GET', '/subscriptions', None, None, 3)
    if status == 200 and any(s.get('url') == target for s in data.get('subscriptions') or []):
        return
    subs = (data.get('subscriptions') or []) if status == 200 else []
    if any(not s.get('url', '').startswith(WEBHOOK_PREFIX) for s in subs):
        return
    for sub in subs:
        max_api('DELETE', '/subscriptions', {'url': sub['url']}, None, 3)
    status, data = max_api('POST', '/subscriptions', None, {
        'url': target,
        'update_types': ['bot_started', 'message_created', 'message_callback'],
    }, 3)
    print(f'max subscribe {status}: {data}')


def send_summary(cur, max_uid, kind: str = 'points') -> None:
    cur.execute(
        'SELECT u.id, u.role FROM max_links l JOIN app_users u ON u.id = l.user_id '
        f'WHERE l.max_user_id = {int(max_uid)} AND u.active'
    )
    row = cur.fetchone()
    if not row:
        send_text(max_uid, 'Аккаунт не подключён. Нажмите «Подключить MAX» в приложении.')
        return
    if row[1] not in BOSS_ROLES:
        send_text(max_uid, 'Сводка по точкам доступна админам, управляющим и супер-админу.')
        return
    text = build_staff_report(cur, int(row[0]), row[1]) if kind == 'staff' else build_report(cur, int(row[0]), row[1], False)
    send_text(max_uid, text, True)


def handle_update(cur, upd: dict) -> None:
    kind = upd.get('update_type')
    if kind == 'bot_started':
        apply_code(cur, str(upd.get('payload') or ''), upd.get('user') or {})
    elif kind == 'message_callback':
        cb = upd.get('callback') or {}
        user = cb.get('user') or {}
        payload = str(cb.get('payload') or '')
        uid = user.get('user_id')
        notice = 'Готовлю сводку…' if payload in ('summary', 'staff') else 'Принято'
        if cb.get('callback_id'):
            max_api('POST', '/answers', {'callback_id': cb['callback_id']}, {'notification': notice}, 3)
        if not uid:
            return
        if payload in ('summary', 'staff'):
            send_summary(cur, uid, 'staff' if payload == 'staff' else 'points')
        else:
            handle_callback(cur, uid, payload, lambda t: send_text(uid, t))
    elif kind == 'message_created':
        msg = upd.get('message') or {}
        text = str((msg.get('body') or {}).get('text') or '').strip()
        sender = msg.get('sender') or {}
        low = text.lower()
        if not sender.get('user_id'):
            return
        if low.startswith('/start'):
            apply_code(cur, text[6:].strip(), sender)
        elif low == '/stop':
            cur.execute(f"DELETE FROM max_links WHERE max_user_id = {int(sender['user_id'])}")
            send_text(sender['user_id'], 'Уведомления отключены.')
        elif handle_dialog_text(cur, sender['user_id'], text):
            return
        elif any(low.startswith(w) for w in STAFF_WORDS):
            send_summary(cur, sender['user_id'], 'staff')
        elif any(low.startswith(w) for w in SUMMARY_WORDS):
            send_summary(cur, sender['user_id'])
        else:
            send_text(
                sender['user_id'],
                'Я присылаю уведомления о заявках, ремонтах и передачах оборудования, а в 23:00 — итоги дня.\n'
                'Сводку по точкам или по сотрудникам можно получить кнопками ниже или словами «сводка» и «сотрудники».',
                True,
            )


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
    cfg = report_settings(cur, uid) if role in BOSS_ROLES else None
    return {
        'canReport': role in BOSS_ROLES,
        'reportTime': cfg['time'] if cfg else None,
        'reportEnabled': cfg['enabled'] if cfg else False,
        'overdueEnabled': cfg['overdueEnabled'] if cfg else False,
        'overdueFrom': cfg['overdueFrom'] if cfg else None,
        'overdueTo': cfg['overdueTo'] if cfg else None,
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
    boss = user[0] in BOSS_ROLES
    send_text(
        max_uid,
        f'Готово! Аккаунт «{user[1]}» подключён — уведомления будут приходить сюда.'
        + ('\nКаждый день в 23:00 пришлю итоги дня, а сводку по точкам можно запросить кнопкой ниже или словом «сводка».' if boss else ''),
        boss,
    )


def poll_updates(cur) -> None:
    """Забирает новые события у бота MAX (нажатие «Начать», команды) и привязывает аккаунты."""
    cur.execute('SELECT marker FROM max_state WHERE id = 1')
    row = cur.fetchone()
    params = {'timeout': 0, 'limit': 100, 'types': 'bot_started,message_created,message_callback'}
    if row and row[0]:
        params['marker'] = row[0]
    status, data = max_api('GET', '/updates', params, None, 4)
    if status != 200:
        print(f'max updates failed {status}: {data}')
        return
    for upd in data.get('updates') or []:
        try:
            handle_update(cur, upd)
        except Exception as err:
            print(f'max update failed: {err}')
    marker = data.get('marker')
    if marker:
        cur.execute(
            f'INSERT INTO max_state (id, marker) VALUES (1, {int(marker)}) '
            'ON CONFLICT (id) DO UPDATE SET marker = EXCLUDED.marker'
        )


def handler(event: dict, context) -> dict:
    """Бот MAX: привязка аккаунта, приём сообщений (сводка по точкам) и итоги дня в 23:00."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    qs = event.get('queryStringParameters') or {}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()

    def finish(payload: dict, status: int = 200):
        cur.close()
        conn.close()
        return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload, ensure_ascii=False)}

    if qs.get('hook'):
        if not bot_token() or qs.get('hook') != webhook_key():
            return finish({'error': 'forbidden'}, 403)
        try:
            handle_update(cur, json.loads(event.get('body') or '{}'))
        except Exception as err:
            print(f'max webhook failed: {err}')
        return finish({'ok': True})

    if qs.get('task') == 'diag':
        info = {'configured': bool(bot_token())}
        if bot_token():
            st, bot = max_api('GET', '/me', None, None, 4)
            info['bot'] = bot.get('username') if st == 200 else f'error {st}'
            st, subs = max_api('GET', '/subscriptions', None, None, 4)
            info['subscriptions'] = [
                {'url': re.sub(r'hook=[^&]+', 'hook=***', str(x.get('url') or '')), 'types': x.get('update_types')}
                for x in (subs.get('subscriptions') or [])
            ] if st == 200 else f'error {st}'
        return finish(info)

    if qs.get('task') == 'daily':
        sent = 0
        try:
            sent = send_daily_reports(cur)
        except Exception as err:
            print(f'daily reports failed: {err}')
        try:
            sent += flush_overdue_queue(cur)
        except Exception as err:
            print(f'overdue queue failed: {err}')
        return finish({'ok': True, 'sent': sent})

    me = session_user(cur, token)
    if not me:
        return finish({'error': 'unauthorized'}, 401)

    if method == 'GET':
        try:
            if reports_due(cur):
                send_daily_reports(cur, 4)
            flush_overdue_queue(cur, 4)
        except Exception as err:
            print(f'daily reports failed: {err}')
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

    if action == 'report_settings':
        if me['role'] not in BOSS_ROLES:
            return finish({'error': 'forbidden_role'}, 403)
        time_str = str(body.get('time') or '')
        if not TIME_RE.match(time_str):
            return finish({'error': 'bad_time'}, 400)
        try:
            tz = max(-840, min(840, int(body.get('tzOffset'))))
        except (TypeError, ValueError):
            tz = -180
        save_report_settings(cur, me['id'], time_str, bool(body.get('enabled', True)), tz)
        return finish(link_status(cur, me['id'], me['role']))

    if action == 'overdue_settings':
        if me['role'] not in BOSS_ROLES:
            return finish({'error': 'forbidden_role'}, 403)
        start = str(body.get('from') or '00:00')
        end = str(body.get('to') or '23:59')
        if not TIME_RE.match(start) or not TIME_RE.match(end):
            return finish({'error': 'bad_time'}, 400)
        try:
            tz = max(-840, min(840, int(body.get('tzOffset'))))
        except (TypeError, ValueError):
            tz = -180
        save_overdue_settings(cur, me['id'], bool(body.get('enabled', True)), start, end, tz)
        return finish(link_status(cur, me['id'], me['role']))

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
            ensure_webhook(str(body.get('webhookUrl') or ''))
        except Exception as err:
            print(f'max webhook setup failed: {err}')
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
