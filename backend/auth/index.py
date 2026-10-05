import json
import os
import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

SESSION_DAYS = 365
ROLES = ('user', 'admin', 'manager', 'superadmin', 'technician')
GLOBAL_ROLES = ('manager', 'superadmin')


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


def effective_access(cur, user_id: int, role: str, manager_id):
    """Срок доступа: у админа собственный, у сотрудника — срок его руководителя."""
    if role in GLOBAL_ROLES:
        return None, None
    owner = user_id if role == 'admin' else manager_id
    if not owner:
        return None, None
    cur.execute(f'SELECT access_until FROM app_users WHERE id = {int(owner)}')
    row = cur.fetchone()
    return (row[0] if row else None), owner


def lock_branch(cur, admin_id: int) -> None:
    """Отключает админа и всех его подчинённых, обрывая сессии."""
    cur.execute(
        f'UPDATE app_users SET active = FALSE WHERE id = {admin_id} OR manager_id = {admin_id}'
    )
    cur.execute(
        'UPDATE app_sessions SET expires_at = NOW() WHERE user_id IN '
        f'(SELECT id FROM app_users WHERE id = {admin_id} OR manager_id = {admin_id})'
    )


def unlock_branch(cur, admin_id: int) -> None:
    cur.execute(
        f'UPDATE app_users SET active = TRUE WHERE id = {admin_id} OR manager_id = {admin_id}'
    )


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        'SELECT u.id, u.username, u.full_name, u.role, u.active, u.manager_id FROM app_sessions s '
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} '
        'AND s.expires_at > NOW()'
    )
    row = cur.fetchone()
    if not row or not row[4]:
        return None
    until, owner = effective_access(cur, row[0], row[3], row[5])
    if until and until <= datetime.utcnow():
        lock_branch(cur, int(owner))
        return None
    cur.execute(
        f"UPDATE app_sessions SET expires_at = NOW() + INTERVAL '{SESSION_DAYS} days' "
        f'WHERE token = {q(token)}'
    )
    return {
        'id': row[0],
        'username': row[1],
        'fullName': row[2],
        'role': row[3],
        'accessUntil': until.isoformat() if until else None,
    }


def list_users(cur, me=None):
    where = ''
    if me and me['role'] == 'admin':
        where = f"WHERE manager_id = {me['id']} OR id = {me['id']}"
    elif me and me['role'] == 'manager':
        branch = manager_branch_ids(cur, me['id'])
        ids = ', '.join(str(i) for i in branch) if branch else '0'
        where = f'WHERE id IN ({ids})'
    cur.execute(
        'SELECT id, username, full_name, role, active, created_at, manager_id, access_until '
        f'FROM app_users {where} ORDER BY id'
    )
    rows = cur.fetchall()
    scopes = read_scopes(cur)
    own = {r[0]: r[7] for r in rows}
    result = []
    for r in rows:
        if r[3] in GLOBAL_ROLES:
            until = None
        elif r[3] == 'admin':
            until = r[7]
        else:
            until = own.get(r[6])
            if until is None and r[6]:
                cur.execute(f'SELECT access_until FROM app_users WHERE id = {int(r[6])}')
                got = cur.fetchone()
                until = got[0] if got else None
        result.append(
            {
                'id': r[0],
                'username': r[1],
                'fullName': r[2],
                'role': r[3],
                'active': r[4],
                'createdAt': r[5].isoformat() if r[5] else None,
                'managerId': r[6],
                'accessUntil': until.isoformat() if until else None,
                'accessOwn': r[3] == 'admin',
                'scopeIds': scopes.get(r[0], []) if r[3] == 'technician' else [],
            }
        )
    return result


def read_scopes(cur) -> dict:
    cur.execute('SELECT technician_id, head_id FROM technician_scopes ORDER BY head_id')
    out: dict = {}
    for tid, hid in cur.fetchall():
        out.setdefault(tid, []).append(hid)
    return out


def save_scopes(cur, tech_id: int, heads) -> None:
    ids = sorted({int(h) for h in (heads or []) if str(h).isdigit() and int(h) != tech_id})
    cur.execute(f'DELETE FROM technician_scopes WHERE technician_id = {int(tech_id)}')
    if ids:
        cur.execute(
            'INSERT INTO technician_scopes (technician_id, head_id) '
            f"SELECT {int(tech_id)}, id FROM app_users WHERE id IN ({', '.join(str(i) for i in ids)}) "
            "AND role IN ('admin', 'manager')"
        )


def manager_branch_ids(cur, manager_id: int):
    """Управляющий видит закреплённых за ним админов и сотрудников этих админов."""
    cur.execute(
        'SELECT id FROM app_users WHERE active AND role = \'admin\' '
        f'AND manager_id = {int(manager_id)} ORDER BY id'
    )
    admins = [r[0] for r in cur.fetchall()]
    ids = list(admins)
    if admins:
        cur.execute(
            'SELECT id FROM app_users WHERE active AND role = \'user\' AND manager_id IN ('
            + ', '.join(str(i) for i in admins)
            + ') ORDER BY id'
        )
        ids.extend(r[0] for r in cur.fetchall())
    return ids


def managed_ids(cur, me):
    """Список id пользователей, чьим каталогом может управлять текущий аккаунт."""
    if me['role'] == 'manager':
        return manager_branch_ids(cur, me['id'])
    if me['role'] in GLOBAL_ROLES:
        cur.execute('SELECT id FROM app_users WHERE active ORDER BY id')
    elif me['role'] == 'admin':
        cur.execute(
            f"SELECT id FROM app_users WHERE active AND (manager_id = {me['id']} OR id = {me['id']}) ORDER BY id"
        )
    else:
        return [me['id']]
    return [r[0] for r in cur.fetchall()]


EXPORT_TABLES = {
    'app_users': 'id, username, full_name, password_hash, role, active, created_at, manager_id, access_until',
    'app_sessions': 'token, user_id, created_at, expires_at',
    'user_products': 'user_id, id, name, category, categories, weight, composition, image, barcode, hit, '
                     'shelf_life_hours, storage_text, updated_at',
    'user_categories': 'user_id, id, label, icon, position, updated_at',
    'user_prefs': 'user_id, key, value, updated_at',
    'user_meta': 'user_id, seeded, created_at',
    'shared_products': 'id, name, category, categories, weight, composition, image, barcode, hit, '
                       'shelf_life_hours, storage_text, author, created_at, updated_at',
    'equipment': 'user_id, id, name, code, price, location, note, image, serial, active, created_at, '
                 'updated_at, qr_broken, written_off_at, write_off_reason',
    'print_keys': 'owner_id, key, printers, last_seen, created_at',
    'inventory_sessions': 'id, user_id, started_by, started_at, finished_at, scanned, missing, total, '
                          'total_price, missing_price',
}


def export_value(value):
    if isinstance(value, datetime):
        if value.tzinfo:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value.strftime('%Y-%m-%d %H:%M:%S')
    if isinstance(value, Decimal):
        return float(value)
    return value


def export_all(cur) -> dict:
    """Полная выгрузка данных для переноса на собственный сервер."""
    result = {}
    for table, cols in EXPORT_TABLES.items():
        cur.execute(f'SELECT {cols} FROM {table}')
        names = [c.strip() for c in cols.split(',')]
        result[table] = [
            {name: export_value(val) for name, val in zip(names, row)} for row in cur.fetchall()
        ]
    return {'version': 1, 'tables': result}


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
                f'SELECT id, username, full_name, password_hash, role, active, manager_id FROM app_users '
                f'WHERE lower(username) = {q(username)}'
            )
            row = cur.fetchone()
            if not row or not row[5] or not check_password(password, row[3]):
                return done({'error': 'invalid_credentials'}, 401)
            until, owner = effective_access(cur, row[0], row[4], row[6])
            if until and until <= datetime.utcnow():
                lock_branch(cur, int(owner))
                return done({'error': 'access_expired'}, 403)
            new_token = secrets.token_hex(24)
            expires = datetime.utcnow() + timedelta(days=SESSION_DAYS)
            cur.execute(f'DELETE FROM app_sessions WHERE user_id = {row[0]}')
            cur.execute(
                'INSERT INTO app_sessions (token, user_id, expires_at) VALUES '
                f"({q(new_token)}, {row[0]}, {q(expires.isoformat(sep=' ', timespec='seconds'))})"
            )
            return done({
                'token': new_token,
                'user': {
                    'id': row[0],
                    'username': row[1],
                    'fullName': row[2],
                    'role': row[4],
                    'accessUntil': until.isoformat() if until else None,
                },
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
                'SELECT id, username, full_name, role, manager_id FROM app_users WHERE id IN ('
                + ', '.join(str(i) for i in managed_ids(cur, me))
                + ') ORDER BY role, username'
            )
            return done({
                'managed': [
                    {'id': r[0], 'username': r[1], 'fullName': r[2], 'role': r[3], 'managerId': r[4]}
                    for r in cur.fetchall()
                ]
            })

        if action == 'export':
            if me['role'] != 'superadmin':
                return done({'error': 'forbidden'}, 403)
            return done(export_all(cur))

        if me['role'] not in ('superadmin', 'admin', 'manager'):
            return done({'error': 'forbidden'}, 403)

        if action == 'users':
            return done({'users': list_users(cur, me)})

        if me['role'] == 'manager':
            return done({'error': 'forbidden'}, 403)

        if me['role'] == 'admin':
            target = int(body.get('id') or 0)
            if action in ('create_user', 'delete_user'):
                return done({'error': 'forbidden'}, 403)

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
            days = body.get('accessDays')
            if days and role == 'admin':
                until = datetime.utcnow() + timedelta(days=int(days))
                until_sql = q(until.isoformat(sep=' ', timespec='seconds'))
            else:
                until_sql = 'NULL'
            cur.execute(
                'INSERT INTO app_users (username, full_name, password_hash, role, manager_id, access_until) VALUES '
                f'({q(username)}, {q(full_name)}, {q(hash_password(password))}, {q(role)}, {manager_sql}, {until_sql}) '
                'RETURNING id'
            )
            new_id = cur.fetchone()[0]
            if role == 'technician':
                save_scopes(cur, new_id, body.get('scopeIds'))
            return done({'users': list_users(cur, me)})

        if action == 'update_user':
            user_id = int(body.get('id') or 0)
            if not user_id:
                return done({'error': 'invalid_input'}, 400)
            if user_id == me['id'] and body.get('active') is False:
                return done({'error': 'self_lock'}, 400)
            sets = []
            if body.get('username'):
                new_name = str(body['username']).strip().lower()
                if len(new_name) < 3:
                    return done({'error': 'invalid_input'}, 400)
                cur.execute(
                    f'SELECT 1 FROM app_users WHERE lower(username) = {q(new_name)} AND id <> {user_id}'
                )
                if cur.fetchone():
                    return done({'error': 'username_taken'}, 409)
                sets.append(f'username = {q(new_name)}')
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
            renew_branch = False
            if 'accessDays' in body:
                cur.execute(f'SELECT role FROM app_users WHERE id = {user_id}')
                trow = cur.fetchone()
                target_role = body.get('role') if body.get('role') in ROLES else (trow[0] if trow else 'user')
                if target_role != 'admin':
                    return done({'error': 'access_admin_only'}, 400)
                days = body.get('accessDays')
                if days in (None, '', 0):
                    sets.append('access_until = NULL')
                else:
                    until = datetime.utcnow() + timedelta(days=int(days))
                    sets.append(f"access_until = {q(until.isoformat(sep=' ', timespec='seconds'))}")
                    renew_branch = True
            if 'scopeIds' in body:
                save_scopes(cur, user_id, body.get('scopeIds'))
            if not sets:
                return done({'users': list_users(cur, me)})
            cur.execute(f'UPDATE app_users SET {", ".join(sets)} WHERE id = {user_id}')
            if renew_branch:
                unlock_branch(cur, user_id)
            if body.get('active') is False:
                cur.execute(f'UPDATE app_sessions SET expires_at = NOW() WHERE user_id = {user_id}')
            if body.get('role') in ROLES and body['role'] != 'admin':
                cur.execute(f'UPDATE app_users SET access_until = NULL WHERE id = {user_id}')
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
            cur.execute(
                f'DELETE FROM technician_scopes WHERE technician_id = {user_id} OR head_id = {user_id}'
            )
            cur.execute(f'UPDATE app_users SET manager_id = NULL WHERE manager_id = {user_id}')
            cur.execute(f'DELETE FROM app_users WHERE id = {user_id}')
            return done({'users': list_users(cur, me)})

        return done({'error': 'unknown_action'}, 400)
    finally:
        cur.close()
        conn.close()