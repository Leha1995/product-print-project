import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta

import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

SESSION_DAYS = 365
ROLES = ('user', 'admin', 'superadmin')


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def hash_password(password: str, salt: str = '') -> str:
    salt = salt or secrets.token_hex(8)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt.encode(), 60000).hex()
    return f'{salt}${digest}'


def check_password(password: str, stored: str) -> bool:
    salt, _, _ = stored.partition('$')
    if not salt:
        return False
    return secrets.compare_digest(hash_password(password, salt), stored)


def connect():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def ensure_seed(cur) -> None:
    cur.execute('SELECT COUNT(*) FROM app_users')
    if cur.fetchone()[0]:
        return
    cur.execute(
        'INSERT INTO app_users (username, full_name, password_hash, role) VALUES '
        f"({q('superadmin')}, {q('Супер-админ')}, {q(hash_password('15271527'))}, {q('superadmin')})"
    )


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        'SELECT u.id, u.username, u.full_name, u.role, u.active FROM app_sessions s '
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} '
        'AND s.expires_at > NOW()'
    )
    row = cur.fetchone()
    if not row or not row[4]:
        return None
    cur.execute(
        f"UPDATE app_sessions SET expires_at = NOW() + INTERVAL '{SESSION_DAYS} days' "
        f'WHERE token = {q(token)}'
    )
    return {'id': row[0], 'username': row[1], 'fullName': row[2], 'role': row[3]}


def list_users(cur, me=None):
    where = ''
    if me and me['role'] == 'admin':
        where = f"WHERE manager_id = {me['id']} OR id = {me['id']}"
    cur.execute(
        'SELECT id, username, full_name, role, active, created_at, manager_id '
        f'FROM app_users {where} ORDER BY id'
    )
    return [
        {
            'id': r[0],
            'username': r[1],
            'fullName': r[2],
            'role': r[3],
            'active': r[4],
            'createdAt': r[5].isoformat() if r[5] else None,
            'managerId': r[6],
        }
        for r in cur.fetchall()
    ]


def managed_ids(cur, me):
    """Список id пользователей, чьим каталогом может управлять текущий аккаунт."""
    if me['role'] == 'superadmin':
        cur.execute('SELECT id FROM app_users WHERE active ORDER BY id')
    elif me['role'] == 'admin':
        cur.execute(
            f"SELECT id FROM app_users WHERE active AND (manager_id = {me['id']} OR id = {me['id']}) ORDER BY id"
        )
    else:
        return [me['id']]
    return [r[0] for r in cur.fetchall()]


def handler(event: dict, context) -> dict:
    """Вход по логину и паролю, сессии и управление пользователями (супер-админ)."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    params = event.get('queryStringParameters') or {}
    body = {}
    if event.get('body'):
        try:
            body = json.loads(event['body'])
        except Exception:
            body = {}
    action = body.get('action') or params.get('action') or ('me' if method == 'GET' else '')

    def done(payload, code=200):
        return {'statusCode': code, 'headers': CORS, 'isBase64Encoded': False, 'body': json.dumps(payload)}

    conn = connect()
    conn.autocommit = True
    cur = conn.cursor()
    ensure_seed(cur)

    try:
        if action == 'login':
            username = str(body.get('username', '')).strip().lower()
            password = str(body.get('password', ''))
            cur.execute(
                f'SELECT id, username, full_name, password_hash, role, active FROM app_users '
                f'WHERE lower(username) = {q(username)}'
            )
            row = cur.fetchone()
            if not row or not row[5] or not check_password(password, row[3]):
                return done({'error': 'invalid_credentials'}, 401)
            new_token = secrets.token_hex(24)
            expires = datetime.utcnow() + timedelta(days=SESSION_DAYS)
            cur.execute(
                'INSERT INTO app_sessions (token, user_id, expires_at) VALUES '
                f"({q(new_token)}, {row[0]}, {q(expires.isoformat(sep=' ', timespec='seconds'))})"
            )
            return done({
                'token': new_token,
                'user': {'id': row[0], 'username': row[1], 'fullName': row[2], 'role': row[4]},
            })

        me = session_user(cur, token)

        if action == 'me':
            if not me:
                return done({'user': None}, 200)
            return done({'user': me})

        if action == 'logout':
            if token:
                cur.execute(f'UPDATE app_sessions SET expires_at = NOW() WHERE token = {q(token)}')
            return done({'ok': True})

        if not me:
            return done({'error': 'unauthorized'}, 401)

        if action == 'change_password':
            if me['role'] != 'superadmin':
                return done({'error': 'forbidden'}, 403)
            new_password = str(body.get('password', ''))
            if len(new_password) < 4:
                return done({'error': 'weak_password'}, 400)
            cur.execute(
                f'UPDATE app_users SET password_hash = {q(hash_password(new_password))} WHERE id = {me["id"]}'
            )
            return done({'ok': True})

        if action == 'managed':
            cur.execute(
                'SELECT id, username, full_name, role FROM app_users WHERE id IN ('
                + ', '.join(str(i) for i in managed_ids(cur, me))
                + ') ORDER BY role, username'
            )
            return done({
                'managed': [
                    {'id': r[0], 'username': r[1], 'fullName': r[2], 'role': r[3]}
                    for r in cur.fetchall()
                ]
            })

        if me['role'] not in ('superadmin', 'admin'):
            return done({'error': 'forbidden'}, 403)

        if action == 'users':
            return done({'users': list_users(cur, me)})

        if me['role'] == 'admin':
            target = int(body.get('id') or 0)
            if action == 'create_user':
                username = str(body.get('username', '')).strip().lower()
                password = str(body.get('password', ''))
                full_name = str(body.get('fullName', '')).strip()
                if len(username) < 3 or len(password) < 4:
                    return done({'error': 'invalid_input'}, 400)
                cur.execute(f'SELECT 1 FROM app_users WHERE lower(username) = {q(username)}')
                if cur.fetchone():
                    return done({'error': 'username_taken'}, 409)
                cur.execute(
                    'INSERT INTO app_users (username, full_name, password_hash, role, manager_id) VALUES '
                    f"({q(username)}, {q(full_name)}, {q(hash_password(password))}, {q('user')}, {me['id']})"
                )
                return done({'users': list_users(cur, me)})

            cur.execute(f'SELECT manager_id, role FROM app_users WHERE id = {target}')
            row = cur.fetchone()
            if not row or row[0] != me['id'] or row[1] != 'user':
                return done({'error': 'forbidden'}, 403)

            if action == 'update_user':
                sets = []
                if body.get('password'):
                    sets.append(f'password_hash = {q(hash_password(str(body["password"])))}')
                if 'fullName' in body:
                    sets.append(f'full_name = {q(str(body["fullName"]).strip())}')
                if 'active' in body:
                    sets.append(f'active = {str(bool(body["active"])).upper()}')
                if sets:
                    cur.execute(f'UPDATE app_users SET {", ".join(sets)} WHERE id = {target}')
                    if body.get('active') is False:
                        cur.execute(
                            f'UPDATE app_sessions SET expires_at = NOW() WHERE user_id = {target}'
                        )
                return done({'users': list_users(cur, me)})

            if action == 'delete_user':
                cur.execute(f'DELETE FROM app_sessions WHERE user_id = {target}')
                cur.execute(f'DELETE FROM app_users WHERE id = {target}')
                return done({'users': list_users(cur, me)})

            return done({'error': 'forbidden'}, 403)

        if action == 'create_user':
            username = str(body.get('username', '')).strip().lower()
            password = str(body.get('password', ''))
            full_name = str(body.get('fullName', '')).strip()
            role = body.get('role', 'user')
            if role not in ROLES:
                role = 'user'
            if len(username) < 3 or len(password) < 4:
                return done({'error': 'invalid_input'}, 400)
            cur.execute(f'SELECT 1 FROM app_users WHERE lower(username) = {q(username)}')
            if cur.fetchone():
                return done({'error': 'username_taken'}, 409)
            manager = body.get('managerId')
            manager_sql = str(int(manager)) if manager else 'NULL'
            cur.execute(
                'INSERT INTO app_users (username, full_name, password_hash, role, manager_id) VALUES '
                f'({q(username)}, {q(full_name)}, {q(hash_password(password))}, {q(role)}, {manager_sql})'
            )
            return done({'users': list_users(cur, me)})

        if action == 'update_user':
            user_id = int(body.get('id') or 0)
            if not user_id:
                return done({'error': 'invalid_input'}, 400)
            if user_id == me['id'] and body.get('active') is False:
                return done({'error': 'self_lock'}, 400)
            sets = []
            if body.get('password'):
                sets.append(f'password_hash = {q(hash_password(str(body["password"])))}')
            if body.get('role') in ROLES:
                sets.append(f'role = {q(body["role"])}')
            if 'fullName' in body:
                sets.append(f'full_name = {q(str(body["fullName"]).strip())}')
            if 'active' in body:
                sets.append(f'active = {str(bool(body["active"])).upper()}')
            if 'managerId' in body:
                mid = body.get('managerId')
                sets.append(f'manager_id = {str(int(mid)) if mid else "NULL"}')
            if not sets:
                return done({'users': list_users(cur, me)})
            cur.execute(f'UPDATE app_users SET {", ".join(sets)} WHERE id = {user_id}')
            if body.get('active') is False:
                cur.execute(f'UPDATE app_sessions SET expires_at = NOW() WHERE user_id = {user_id}')
            return done({'users': list_users(cur, me)})

        if action == 'delete_user':
            user_id = int(body.get('id') or 0)
            if not user_id:
                return done({'error': 'invalid_input'}, 400)
            if user_id == me['id']:
                return done({'error': 'self_delete'}, 400)
            cur.execute(f'SELECT role FROM app_users WHERE id = {user_id}')
            row = cur.fetchone()
            if not row:
                return done({'error': 'not_found'}, 404)
            if row[0] == 'superadmin':
                cur.execute("SELECT COUNT(*) FROM app_users WHERE role = 'superadmin' AND active")
                if cur.fetchone()[0] <= 1:
                    return done({'error': 'last_superadmin'}, 400)
            cur.execute(f'DELETE FROM app_sessions WHERE user_id = {user_id}')
            cur.execute(f'UPDATE app_users SET manager_id = NULL WHERE manager_id = {user_id}')
            cur.execute(f'DELETE FROM app_users WHERE id = {user_id}')
            return done({'users': list_users(cur, me)})

        return done({'error': 'unknown_action'}, 400)
    finally:
        cur.close()
        conn.close()