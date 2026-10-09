import json
import os
import re
import secrets
import time

import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Print-Key',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

IP_RE = re.compile(r'^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$')
POLL_WAIT = 3.5
JOB_TTL_MIN = 10
ONLINE_SEC = 30
MAX_DATA = 2_000_000


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def valid_ip(ip: str) -> bool:
    m = IP_RE.match(ip or '')
    return bool(m) and all(0 <= int(p) <= 255 for p in m.groups())


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        'SELECT u.id, u.role, u.active, u.manager_id FROM app_sessions s '
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} AND s.expires_at > NOW()'
    )
    row = cur.fetchone()
    if not row or not row[2]:
        return None
    return {'id': row[0], 'role': row[1], 'managerId': row[3]}


def owner_of(me) -> int:
    if me['role'] == 'user' and me['managerId']:
        return int(me['managerId'])
    return int(me['id'])


def shares_structure(owner: int) -> str:
    """Условие: пользователь u состоит хотя бы в одной структуре вместе с owner (или у owner нет структур)."""
    return (
        f'(NOT EXISTS (SELECT 1 FROM structure_members p WHERE p.user_id = {int(owner)}) '
        'OR EXISTS (SELECT 1 FROM structure_members a JOIN structure_members b ON a.structure_id = b.structure_id '
        f'WHERE a.user_id = app_users.id AND b.user_id = {int(owner)}))'
    )


def team_ids(cur, owner: int) -> list:
    ids = [owner]
    level = [owner]
    for _ in range(8):
        cur.execute(
            'SELECT id FROM app_users WHERE manager_id IN (' + ','.join(str(i) for i in level) + ') '
            f'AND {shares_structure(owner)}'
        )
        level = [int(r[0]) for r in cur.fetchall() if int(r[0]) not in ids]
        if not level:
            break
        ids.extend(level)
    return ids


def chain_ids(cur, owner: int) -> list:
    ids = [owner]
    current = owner
    for _ in range(8):
        cur.execute(f'SELECT manager_id FROM app_users WHERE id = {current} AND {shares_structure(owner)}')
        row = cur.fetchone()
        if not row or not row[0] or int(row[0]) in ids:
            break
        current = int(row[0])
        ids.append(current)
    return ids


def ensure_key(cur, owner: int):
    cur.execute(f'SELECT key, printers, last_seen FROM print_keys WHERE owner_id = {owner}')
    row = cur.fetchone()
    if row:
        return row
    key = secrets.token_hex(20)
    cur.execute(
        f"INSERT INTO print_keys (owner_id, key, printers) VALUES ({owner}, {q(key)}, '[]') "
        'ON CONFLICT (owner_id) DO NOTHING'
    )
    cur.execute(f'SELECT key, printers, last_seen FROM print_keys WHERE owner_id = {owner}')
    return cur.fetchone()


def is_online(cur, owner: int) -> bool:
    ids = ','.join(str(i) for i in chain_ids(cur, owner))
    cur.execute(
        f'SELECT 1 FROM print_keys WHERE owner_id IN ({ids}) '
        f"AND last_seen > NOW() - INTERVAL '{ONLINE_SEC} seconds'"
    )
    return cur.fetchone() is not None


def clean_printers(raw) -> list:
    result = []
    for p in raw if isinstance(raw, list) else []:
        ip = str(p.get('ip') or '').strip()
        if not valid_ip(ip):
            continue
        try:
            port = int(p.get('port') or 9100)
        except (TypeError, ValueError):
            port = 9100
        result.append(
            {
                'id': str(p.get('id') or secrets.token_hex(4))[:40],
                'name': str(p.get('name') or ip).strip()[:60],
                'ip': ip,
                'port': port if 0 < port < 65536 else 9100,
            }
        )
    return result[:20]


def can_edit_staff(cur, me, target: int) -> bool:
    """Админ настраивает своих сотрудников, супер-админ — любых сотрудников."""
    cur.execute(f'SELECT role, manager_id FROM app_users WHERE id = {int(target)}')
    row = cur.fetchone()
    if not row or row[0] != 'user':
        return False
    if me['role'] == 'superadmin':
        return True
    return me['role'] == 'admin' and row[1] == me['id']


def staff_printers(cur, uid: int):
    cur.execute(f'SELECT printers FROM user_printers WHERE user_id = {int(uid)}')
    row = cur.fetchone()
    return json.loads(row[0] or '[]') if row else None


def take_jobs(cur, team: list):
    ids = ','.join(str(i) for i in team)
    cur.execute(
        f"UPDATE print_jobs SET status = 'expired' WHERE owner_id IN ({ids}) AND status = 'pending' "
        f"AND created_at < NOW() - INTERVAL '{JOB_TTL_MIN} minutes'"
    )
    cur.execute(
        "UPDATE print_jobs SET status = 'taken', taken_at = NOW() WHERE id IN ("
        f"SELECT id FROM print_jobs WHERE owner_id IN ({ids}) AND status = 'pending' "
        'ORDER BY id LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING id, printer_ip, printer_port, data'
    )
    rows = sorted(cur.fetchall(), key=lambda r: r[0])
    return [{'id': r[0], 'ip': r[1], 'port': r[2], 'data': r[3]} for r in rows]


def handler(event: dict, context) -> dict:
    """Сетевая печать: очередь заданий для принтеров по IP. Помощник печатает задания своего аккаунта и всех привязанных к нему сотрудников."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = {k.lower(): v for k, v in (event.get('headers') or {}).items()}
    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except ValueError:
            body = {}
    action = body.get('action') or params.get('action') or ''

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()

    def done(payload, code=200):
        cur.close()
        conn.close()
        return {'statusCode': code, 'headers': CORS, 'body': json.dumps(payload, default=str)}

    print_key = headers.get('x-print-key', '')
    if print_key:
        cur.execute(f'SELECT owner_id FROM print_keys WHERE key = {q(print_key)}')
        row = cur.fetchone()
        if not row:
            return done({'error': 'bad_key'}, 403)
        owner = int(row[0])
        cur.execute(f'UPDATE print_keys SET last_seen = NOW() WHERE owner_id = {owner}')
        team = team_ids(cur, owner)
        team_sql = ','.join(str(i) for i in team)

        if action == 'report':
            status = 'done' if body.get('ok') else 'failed'
            cur.execute(
                f"UPDATE print_jobs SET status = {q(status)}, error = {q(str(body.get('error') or '')[:300])} "
                f"WHERE id = {int(body.get('id') or 0)} AND owner_id IN ({team_sql})"
            )
            return done({'ok': True})

        started = time.time()
        jobs = take_jobs(cur, team)
        while not jobs and time.time() - started < POLL_WAIT:
            time.sleep(0.5)
            jobs = take_jobs(cur, team)
        return done({'jobs': jobs})

    me = session_user(cur, headers.get('x-auth-token', ''))
    if not me:
        return done({'error': 'unauthorized'}, 401)
    owner = owner_of(me)
    can_setup = me['role'] in ('admin', 'superadmin', 'manager')

    if action in ('staff_printers', 'save_staff_printers'):
        target = int(body.get('userId') or params.get('userId') or 0)
        if not can_edit_staff(cur, me, target):
            return done({'error': 'forbidden'}, 403)
        if action == 'save_staff_printers':
            printers = clean_printers(body.get('printers'))
            cur.execute(
                'INSERT INTO user_printers (user_id, printers, updated_by, updated_at) VALUES '
                f"({target}, {q(json.dumps(printers, ensure_ascii=False))}, {int(me['id'])}, NOW()) "
                'ON CONFLICT (user_id) DO UPDATE SET printers = EXCLUDED.printers, '
                'updated_by = EXCLUDED.updated_by, updated_at = NOW()'
            )
        personal = staff_printers(cur, target)
        return done({'printers': personal or []})

    if action == 'config':
        key, printers, _ = ensure_key(cur, owner)
        own = json.loads(printers or '[]')
        personal = staff_printers(cur, me['id']) if me['role'] == 'user' else None
        if personal:
            own = personal
        if not own:
            for upper in chain_ids(cur, owner)[1:]:
                cur.execute(f'SELECT printers FROM print_keys WHERE owner_id = {upper}')
                row = cur.fetchone()
                own = json.loads(row[0] or '[]') if row else []
                if own:
                    break
        return done(
            {
                'printers': own,
                'online': is_online(cur, owner),
                'key': key if can_setup else None,
                'canSetup': can_setup,
                'personal': bool(personal),
            }
        )

    if action == 'printers':
        if not can_setup:
            return done({'error': 'forbidden'}, 403)
        ensure_key(cur, owner)
        printers = clean_printers(body.get('printers'))
        cur.execute(
            f'UPDATE print_keys SET printers = {q(json.dumps(printers, ensure_ascii=False))} '
            f'WHERE owner_id = {owner}'
        )
        return done({'printers': printers})

    if action == 'regen_key':
        if not can_setup:
            return done({'error': 'forbidden'}, 403)
        ensure_key(cur, owner)
        key = secrets.token_hex(20)
        cur.execute(f'UPDATE print_keys SET key = {q(key)}, last_seen = NULL WHERE owner_id = {owner}')
        return done({'key': key})

    if action == 'job':
        ip = str(body.get('ip') or '').strip()
        data = str(body.get('data') or '')
        if not valid_ip(ip) or not data or len(data) > MAX_DATA:
            return done({'error': 'invalid_input'}, 400)
        try:
            port = int(body.get('port') or 9100)
        except (TypeError, ValueError):
            port = 9100
        cur.execute(
            'INSERT INTO print_jobs (owner_id, printer_ip, printer_port, data, created_by) VALUES '
            f"({owner}, {q(ip)}, {port}, {q(data)}, {me['id']}) RETURNING id"
        )
        job_id = cur.fetchone()[0]
        cur.execute(
            f"DELETE FROM print_jobs WHERE owner_id = {owner} AND created_at < NOW() - INTERVAL '2 days'"
        )
        return done({'id': job_id, 'online': is_online(cur, owner)})

    if action == 'status':
        cur.execute(
            f"SELECT status, error FROM print_jobs WHERE id = {int(params.get('id') or body.get('id') or 0)} "
            f'AND owner_id = {owner}'
        )
        row = cur.fetchone()
        if not row:
            return done({'error': 'not_found'}, 404)
        return done({'status': row[0], 'error': row[1], 'online': is_online(cur, owner)})

    return done({'error': 'unknown_action'}, 400)
