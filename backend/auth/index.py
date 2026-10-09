import json
import os
import hashlib
import secrets
from datetime import date, datetime, timedelta, timezone
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
ROLES = ('user', 'admin', 'manager', 'superadmin', 'technician', 'accountant')
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


OUTSIDE_ROLES = ('superadmin', 'technician')


def allowed_structures(cur, me):
    if me['role'] == 'technician':
        return []
    if me['role'] == 'superadmin':
        cur.execute('SELECT id FROM structures ORDER BY id')
    else:
        cur.execute(
            f"SELECT structure_id FROM structure_members WHERE user_id = {int(me['id'])} ORDER BY structure_id"
        )
    return [r[0] for r in cur.fetchall()]


def active_structure(cur, token: str, me):
    """Активная структура сессии: проверяется членство, при необходимости выбирается первая доступная."""
    cur.execute(f'SELECT structure_id FROM app_sessions WHERE token = {q(token)}')
    row = cur.fetchone()
    sid = row[0] if row else None
    allowed = allowed_structures(cur, me)
    if sid not in allowed:
        sid = allowed[0] if allowed else None
        cur.execute(f"UPDATE app_sessions SET structure_id = {sid or 'NULL'} WHERE token = {q(token)}")
    return sid


def structure_member_ids(cur, sid, me):
    """Кто виден в активной структуре. None — без ограничений."""
    if not sid:
        return None if me['role'] == 'superadmin' else [int(me['id'])]
    cur.execute(
        f'SELECT user_id FROM structure_members WHERE structure_id = {int(sid)} '
        "UNION SELECT id FROM app_users WHERE role IN ('superadmin', 'technician')"
    )
    return [r[0] for r in cur.fetchall()]


def structures_payload(cur, me, sid):
    allowed = allowed_structures(cur, me)
    if not allowed:
        return {'structures': [], 'activeStructureId': None}
    cur.execute(
        "SELECT s.id, s.name, (SELECT COUNT(*) FROM structure_members m JOIN app_users mu ON mu.id = m.user_id "
        "WHERE m.structure_id = s.id AND mu.role NOT IN ('superadmin', 'technician')) "
        f"FROM structures s WHERE s.id IN ({', '.join(str(i) for i in allowed)}) ORDER BY s.name"
    )
    return {
        'structures': [{'id': r[0], 'name': r[1], 'members': r[2]} for r in cur.fetchall()],
        'activeStructureId': sid,
    }


def user_structures(cur) -> dict:
    cur.execute('SELECT user_id, structure_id FROM structure_members ORDER BY structure_id')
    out: dict = {}
    for uid, sid in cur.fetchall():
        out.setdefault(uid, []).append(sid)
    return out


def set_user_structures(cur, user_id: int, ids) -> None:
    clean = sorted({int(i) for i in (ids or []) if str(i).isdigit()})
    cur.execute(f'SELECT role FROM app_users WHERE id = {int(user_id)}')
    role_row = cur.fetchone()
    if role_row and role_row[0] in OUTSIDE_ROLES:
        clean = []
    cur.execute(f'DELETE FROM structure_members WHERE user_id = {int(user_id)}')
    if clean:
        cur.execute(
            'INSERT INTO structure_members (structure_id, user_id) '
            f"SELECT id, {int(user_id)} FROM structures WHERE id IN ({', '.join(str(i) for i in clean)}) "
            'ON CONFLICT DO NOTHING'
        )


def list_users(cur, me=None, members=None):
    cur.execute(
        'DELETE FROM structure_members WHERE user_id IN '
        "(SELECT id FROM app_users WHERE role IN ('superadmin', 'technician'))"
    )
    where = ''
    if me and me['role'] == 'admin':
        where = f"WHERE (manager_id = {me['id']} OR id = {me['id']})"
    elif me and me['role'] == 'manager':
        branch = manager_branch_ids(cur, me['id'])
        ids = ', '.join(str(i) for i in branch) if branch else '0'
        where = f'WHERE id IN ({ids})'
    if members is not None:
        member_sql = ', '.join(str(i) for i in members) or '0'
        extra = (
            f'(id IN ({member_sql}) OR NOT EXISTS (SELECT 1 FROM structure_members m WHERE m.user_id = app_users.id))'
            if me and me['role'] == 'superadmin'
            else f'id IN ({member_sql})'
        )
        where = f'{where} AND {extra}' if where else f'WHERE {extra}'
    cur.execute(
        'SELECT id, username, full_name, role, active, created_at, manager_id, access_until '
        f'FROM app_users {where} ORDER BY id'
    )
    rows = cur.fetchall()
    scopes = read_scopes(cur)
    acc_scopes = read_accountant_scopes(cur)
    acc_techs = read_accountant_techs(cur)
    memberships = user_structures(cur)
    own = {r[0]: r[7] for r in rows}
    result = []
    for r in rows:
        if r[3] in GLOBAL_ROLES or r[3] == 'accountant':
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
                'scopeIds': scopes.get(r[0], []) if r[3] == 'technician'
                else acc_scopes.get(r[0], []) if r[3] == 'accountant' else [],
                'techIds': acc_techs.get(r[0], []) if r[3] == 'accountant' else [],
                'structureIds': memberships.get(r[0], []),
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


def read_accountant_scopes(cur) -> dict:
    cur.execute('SELECT accountant_id, admin_id FROM accountant_scopes ORDER BY admin_id')
    out: dict = {}
    for aid, hid in cur.fetchall():
        out.setdefault(aid, []).append(hid)
    return out


def read_accountant_techs(cur) -> dict:
    cur.execute('SELECT accountant_id, technician_id FROM accountant_technicians ORDER BY technician_id')
    out: dict = {}
    for aid, tid in cur.fetchall():
        out.setdefault(aid, []).append(tid)
    return out


def save_accountant_techs(cur, accountant_id: int, techs) -> None:
    ids = sorted({int(t) for t in (techs or []) if str(t).isdigit()})
    cur.execute(f'DELETE FROM accountant_technicians WHERE accountant_id = {int(accountant_id)}')
    if ids:
        cur.execute(
            'INSERT INTO accountant_technicians (accountant_id, technician_id) '
            f"SELECT {int(accountant_id)}, id FROM app_users WHERE id IN ({', '.join(str(i) for i in ids)}) "
            "AND role = 'technician'"
        )


def save_accountant_scopes(cur, accountant_id: int, admins) -> None:
    """Бухгалтеру закрепляются только админы (точки)."""
    ids = sorted({int(h) for h in (admins or []) if str(h).isdigit() and int(h) != accountant_id})
    cur.execute(f'DELETE FROM accountant_scopes WHERE accountant_id = {int(accountant_id)}')
    if ids:
        cur.execute(
            'INSERT INTO accountant_scopes (accountant_id, admin_id) '
            f"SELECT {int(accountant_id)}, id FROM app_users WHERE id IN ({', '.join(str(i) for i in ids)}) "
            "AND role = 'admin'"
        )


def accountant_admin_ids(cur, accountant_id: int):
    cur.execute(
        'SELECT u.id FROM accountant_scopes s JOIN app_users u ON u.id = s.admin_id '
        f"WHERE s.accountant_id = {int(accountant_id)} AND u.active AND u.role = 'admin' ORDER BY u.id"
    )
    return [r[0] for r in cur.fetchall()]


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


def managed_ids(cur, me, members=None):
    """Список id пользователей активной структуры, чьим каталогом может управлять текущий аккаунт."""
    ids = managed_ids_all(cur, me)
    if members is None:
        return ids
    allowed = set(members)
    return [i for i in ids if i in allowed or i == me['id']]


def managed_ids_all(cur, me):
    if me['role'] == 'manager':
        return manager_branch_ids(cur, me['id'])
    if me['role'] == 'accountant':
        return accountant_admin_ids(cur, me['id'])
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
    'structures': 'id, name, created_at',
    'structure_members': 'structure_id, user_id',
    'user_products': 'user_id, id, name, category, categories, weight, composition, image, barcode, hit, '
                     'shelf_life_hours, storage_text, updated_at',
    'user_categories': 'user_id, id, label, icon, position, updated_at',
    'user_prefs': 'user_id, key, value, updated_at',
    'user_meta': 'user_id, seeded, created_at',
    'shared_products': 'id, name, category, categories, weight, composition, image, barcode, hit, '
                       'shelf_life_hours, storage_text, author, created_at, updated_at, structure_id',
    'equipment': 'user_id, id, name, code, price, location, note, image, serial, active, created_at, '
                 'updated_at, qr_broken, written_off_at, write_off_reason, commissioned_at, '
                 'depreciation_per_day, repair_cost, in_repair, repair_sent_at',
    'equipment_repairs': 'id, user_id, equipment_id, sent_at, returned_at, cost, description, photos, returned_by',
    'equipment_tasks': 'id, user_id, equipment_id, technician_id, created_by, description, photos, status, '
                       'created_at, done_at, done_by, done_comment, priority, cost, kind',
    'equipment_transfers': 'id, equipment_id, from_user, to_user, created_by, status, created_at, decided_at, '
                           'decided_by, equipment_name, equipment_code, equipment_price',
    'technician_scopes': 'technician_id, head_id',
    'accountant_scopes': 'accountant_id, admin_id',
    'accountant_technicians': 'accountant_id, technician_id',
    'telegram_links': 'user_id, chat_id, tg_name, linked_at',
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
    if isinstance(value, date):
        return value.isoformat()
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
    """Вход по логину и паролю, сессии, структуры и управление пользователями (супер-админ)."""
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
            login_me = {'id': row[0], 'role': row[4]}
            login_sid = active_structure(cur, new_token, login_me)
            return done({
                'token': new_token,
                'user': {
                    'id': row[0],
                    'username': row[1],
                    'fullName': row[2],
                    'role': row[4],
                    'accessUntil': until.isoformat() if until else None,
                    **structures_payload(cur, login_me, login_sid),
                },
            })

        me = session_user(cur, token)
        sid = active_structure(cur, token, me) if me else None
        members = structure_member_ids(cur, sid, me) if me else None

        if action == 'me':
            if not me:
                return done({'user': None}, 200)
            return done({'user': {**me, **structures_payload(cur, me, sid)}})

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

        if action == 'switch_structure':
            new_sid = int(body.get('id') or 0)
            if new_sid not in allowed_structures(cur, me):
                return done({'error': 'forbidden'}, 403)
            cur.execute(f'UPDATE app_sessions SET structure_id = {new_sid} WHERE token = {q(token)}')
            return done({'user': {**me, **structures_payload(cur, me, new_sid)}})

        if action == 'managed':
            cur.execute(
                'SELECT id, username, full_name, role, manager_id FROM app_users WHERE id IN ('
                + (', '.join(str(i) for i in managed_ids(cur, me, members)) or '0')
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
            return done({'users': list_users(cur, me, structure_member_ids(cur, sid, me))})

        if action in ('structures', 'create_structure', 'rename_structure', 'delete_structure'):
            if me['role'] != 'superadmin':
                return done({'error': 'forbidden'}, 403)
            if action == 'create_structure':
                name = str(body.get('name') or '').strip()[:120]
                if not name:
                    return done({'error': 'invalid_input'}, 400)
                cur.execute(f'INSERT INTO structures (name) VALUES ({q(name)}) RETURNING id')
                new_sid = cur.fetchone()[0]
                set_ids = [int(i) for i in (body.get('userIds') or []) if str(i).isdigit()]
                if set_ids:
                    cur.execute(
                        'INSERT INTO structure_members (structure_id, user_id) '
                        f"SELECT {new_sid}, id FROM app_users WHERE role NOT IN ('superadmin', 'technician') "
                        f"AND id IN ({', '.join(str(i) for i in set_ids)}) ON CONFLICT DO NOTHING"
                    )
            elif action == 'rename_structure':
                name = str(body.get('name') or '').strip()[:120]
                if not name:
                    return done({'error': 'invalid_input'}, 400)
                cur.execute(f"UPDATE structures SET name = {q(name)} WHERE id = {int(body.get('id') or 0)}")
            elif action == 'delete_structure':
                del_id = int(body.get('id') or 0)
                cur.execute(f'SELECT COUNT(*) FROM structure_members WHERE structure_id = {del_id}')
                if cur.fetchone()[0]:
                    return done({'error': 'structure_not_empty'}, 409)
                cur.execute('SELECT COUNT(*) FROM structures')
                if cur.fetchone()[0] <= 1:
                    return done({'error': 'last_structure'}, 400)
                cur.execute(f'DELETE FROM shared_products WHERE structure_id = {del_id}')
                cur.execute(f'DELETE FROM structures WHERE id = {del_id}')
            cur_sid = active_structure(cur, token, me)
            return done({**structures_payload(cur, me, cur_sid), 'users': list_users(cur, me, structure_member_ids(cur, cur_sid, me))})

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
                return done({'users': list_users(cur, me, structure_member_ids(cur, sid, me))})

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
            if role not in OUTSIDE_ROLES:
                wanted = body.get('structureIds')
                set_user_structures(cur, new_id, wanted if isinstance(wanted, list) and wanted else ([sid] if sid else []))
            if role == 'technician':
                save_scopes(cur, new_id, body.get('scopeIds'))
            elif role == 'accountant':
                save_accountant_scopes(cur, new_id, body.get('scopeIds'))
                save_accountant_techs(cur, new_id, body.get('techIds'))
            return done({'users': list_users(cur, me, structure_member_ids(cur, sid, me))})

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
            if 'structureIds' in body and isinstance(body.get('structureIds'), list):
                set_user_structures(cur, user_id, body.get('structureIds'))
            if body.get('role') in OUTSIDE_ROLES:
                set_user_structures(cur, user_id, [])
            if 'techIds' in body:
                save_accountant_techs(cur, user_id, body.get('techIds'))
            if 'scopeIds' in body:
                cur.execute(f'SELECT role FROM app_users WHERE id = {user_id}')
                srow = cur.fetchone()
                scope_role = body.get('role') if body.get('role') in ROLES else (srow[0] if srow else '')
                if scope_role == 'accountant':
                    save_accountant_scopes(cur, user_id, body.get('scopeIds'))
                else:
                    save_scopes(cur, user_id, body.get('scopeIds'))
            if not sets:
                return done({'users': list_users(cur, me, structure_member_ids(cur, sid, me))})
            cur.execute(f'UPDATE app_users SET {", ".join(sets)} WHERE id = {user_id}')
            if body.get('role') in OUTSIDE_ROLES:
                set_user_structures(cur, user_id, [])
            if renew_branch:
                unlock_branch(cur, user_id)
            if body.get('active') is False:
                cur.execute(f'UPDATE app_sessions SET expires_at = NOW() WHERE user_id = {user_id}')
            if body.get('role') in ROLES and body['role'] != 'admin':
                cur.execute(f'UPDATE app_users SET access_until = NULL WHERE id = {user_id}')
            return done({'users': list_users(cur, me, structure_member_ids(cur, sid, me))})

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
            cur.execute(f'DELETE FROM structure_members WHERE user_id = {user_id}')
            cur.execute(
                f'DELETE FROM technician_scopes WHERE technician_id = {user_id} OR head_id = {user_id}'
            )
            cur.execute(
                f'DELETE FROM accountant_scopes WHERE accountant_id = {user_id} OR admin_id = {user_id}'
            )
            cur.execute(
                f'DELETE FROM accountant_technicians WHERE accountant_id = {user_id} OR technician_id = {user_id}'
            )
            cur.execute(f'UPDATE app_users SET manager_id = NULL WHERE manager_id = {user_id}')
            cur.execute(f'DELETE FROM app_users WHERE id = {user_id}')
            return done({'users': list_users(cur, me, structure_member_ids(cur, sid, me))})

        return done({'error': 'unknown_action'}, 400)
    finally:
        cur.close()
        conn.close()