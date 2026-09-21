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

SESSION_DAYS = 30
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
    return {'id': row[0], 'username': row[1], 'fullName': row[2], 'role': row[3]}


def list_users(cur):
    cur.execute('SELECT id, username, full_name, role, active, created_at FROM app_users ORDER BY id')
    return [
        {
            'id': r[0],
            'username': r[1],
            'fullName': r[2],
            'role': r[3],
            'active': r[4],
            'createdAt': r[5].isoformat() if r[5] else None,
        }
        for r in cur.fetchall()
    ]


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
            new_password = str(body.get('password', ''))
            if len(new_password) < 4:
                return done({'error': 'weak_password'}, 400)
            cur.execute(
                f'UPDATE app_users SET password_hash = {q(hash_password(new_password))} WHERE id = {me["id"]}'
            )
            return done({'ok': True})

        if me['role'] != 'superadmin':
            return done({'error': 'forbidden'}, 403)

        if action == 'users':
            return done({'users': list_users(cur)})

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
            cur.execute(
                'INSERT INTO app_users (username, full_name, password_hash, role) VALUES '
                f'({q(username)}, {q(full_name)}, {q(hash_password(password))}, {q(role)})'
            )
            return done({'users': list_users(cur)})

        if action == 'update_user':
            user_id = int(body.get('id') or 0)
            if not user_id:
                return done({'error': 'invalid_input'}, 400)
            sets = []
            if body.get('password'):
                sets.append(f'password_hash = {q(hash_password(str(body["password"])))}')
            if body.get('role') in ROLES:
                sets.append(f'role = {q(body["role"])}')
            if 'fullName' in body:
                sets.append(f'full_name = {q(str(body["fullName"]).strip())}')
            if 'active' in body:
                sets.append(f'active = {str(bool(body["active"])).upper()}')
            if not sets:
                return done({'users': list_users(cur)})
            cur.execute(f'UPDATE app_users SET {", ".join(sets)} WHERE id = {user_id}')
            if body.get('active') is False:
                cur.execute(f'UPDATE app_sessions SET expires_at = NOW() WHERE user_id = {user_id}')
            return done({'users': list_users(cur)})

        return done({'error': 'unknown_action'}, 400)
    finally:
        cur.close()
        conn.close()
