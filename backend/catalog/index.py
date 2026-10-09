import json
import os
import base64
import time
import uuid

import boto3
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token, X-Target-User',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def upload_image(data_url: str, product_id: str) -> str:
    header, _, payload = data_url.partition(',')
    ext = 'png' if 'png' in header else 'webp' if 'webp' in header else 'jpg'
    key = f"catalog/{product_id}-{uuid.uuid4().hex[:8]}.{ext}"
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    s3.put_object(Bucket='files', Key=key, Body=base64.b64decode(payload), ContentType=f"image/{ext}")
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        'SELECT u.id, u.username, u.role, u.active FROM app_sessions s '
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} '
        'AND s.expires_at > NOW()'
    )
    row = cur.fetchone()
    if not row or not row[3]:
        return None
    return {'id': row[0], 'username': row[1], 'role': row[2]}


def manager_branch_ids(cur, manager_id: int):
    """Админы, закреплённые за управляющим, и сотрудники этих админов."""
    cur.execute(
        "SELECT id FROM app_users WHERE active AND role = 'admin' "
        f'AND manager_id = {int(manager_id)} ORDER BY id'
    )
    admins = [r[0] for r in cur.fetchall()]
    ids = list(admins)
    if admins:
        cur.execute(
            "SELECT id FROM app_users WHERE active AND role = 'user' AND manager_id IN ("
            + ', '.join(str(i) for i in admins)
            + ') ORDER BY id'
        )
        ids.extend(r[0] for r in cur.fetchall())
    return ids


def structure_members(cur, token: str, me):
    """Участники активной структуры сессии. None — без ограничений."""
    if me['role'] == 'superadmin':
        cur.execute('SELECT id FROM structures ORDER BY id')
    else:
        cur.execute(f"SELECT structure_id FROM structure_members WHERE user_id = {int(me['id'])} ORDER BY structure_id")
    allowed = [r[0] for r in cur.fetchall()]
    cur.execute(f'SELECT structure_id FROM app_sessions WHERE token = {q(token)}')
    row = cur.fetchone()
    sid = row[0] if row else None
    if sid not in allowed:
        sid = allowed[0] if allowed else None
    if not sid:
        return None if me['role'] == 'superadmin' else [int(me['id'])]
    cur.execute(
        f'SELECT user_id FROM structure_members WHERE structure_id = {int(sid)} '
        "UNION SELECT id FROM app_users WHERE role = 'superadmin'"
    )
    return sorted(r[0] for r in cur.fetchall())


def can_manage(cur, me, target_id: int) -> bool:
    if target_id == me['id']:
        return True
    members = me.get('members')
    if members is not None and int(target_id) not in members:
        return False
    if me['role'] == 'superadmin':
        return True
    if me['role'] == 'manager':
        return target_id in manager_branch_ids(cur, me['id'])
    if me['role'] == 'admin':
        cur.execute(f'SELECT manager_id FROM app_users WHERE id = {target_id}')
        row = cur.fetchone()
        return bool(row and row[0] == me['id'])
    return False


def build_overview(cur, me, soon_ms: int = 3600000):
    """Сводка по сотрудникам: что просрочено и что скоро истекает."""
    if me['role'] == 'manager':
        branch = manager_branch_ids(cur, me['id'])
        if not branch:
            return []
        cur.execute(
            'SELECT id, username, full_name FROM app_users WHERE active AND id IN ('
            + ', '.join(str(i) for i in branch)
            + ') ORDER BY role DESC, username'
        )
    elif me['role'] == 'superadmin':
        cur.execute(
            "SELECT id, username, full_name FROM app_users WHERE active "
            "AND role IN ('user', 'admin') ORDER BY role DESC, username"
        )
    else:
        cur.execute(
            'SELECT id, username, full_name FROM app_users WHERE active '
            f"AND manager_id = {me['id']} ORDER BY username"
        )
    members = me.get('members')
    staff = [
        {'id': r[0], 'username': r[1], 'fullName': r[2]}
        for r in cur.fetchall()
        if members is None or r[0] in members
    ]
    if not staff:
        return []

    now_ms = int(time.time() * 1000)
    result = []
    for person in staff:
        uid = person['id']
        history = read_pref_key(cur, uid, 'history') or {}
        if not history:
            result.append({**person, 'expired': [], 'soon': [], 'total': 0})
            continue
        cur.execute(
            'SELECT id, name, shelf_life_hours FROM user_products '
            f'WHERE user_id = {uid} AND shelf_life_hours IS NOT NULL'
        )
        expired, soon = [], []
        for pid, name, hours in cur.fetchall():
            stamp = history.get(pid)
            if not stamp or not hours:
                continue
            expires_at = int(stamp) + int(hours) * 3600000
            left = expires_at - now_ms
            row = {'id': pid, 'name': name, 'expiresAt': expires_at, 'leftMs': left}
            if left <= 0:
                expired.append(row)
            elif left <= soon_ms:
                soon.append(row)
        expired.sort(key=lambda x: x['leftMs'])
        soon.sort(key=lambda x: x['leftMs'])
        result.append({**person, 'expired': expired, 'soon': soon, 'total': len(expired) + len(soon)})

    result.sort(key=lambda x: (-len(x['expired']), -len(x['soon']), x['username']))
    return result


def read_products(cur, uid: int):
    cur.execute(
        'SELECT id, name, category, categories, weight, composition, image, barcode, '
        f'hit, shelf_life_hours, storage_text FROM user_products WHERE user_id = {uid} ORDER BY name'
    )
    return [
        {
            'id': r[0],
            'name': r[1],
            'category': r[2],
            'categories': r[3] or [],
            'weight': r[4],
            'composition': r[5],
            'image': r[6],
            'barcode': r[7],
            'hit': r[8],
            'shelfLifeHours': r[9],
            'storageText': r[10],
        }
        for r in cur.fetchall()
    ]


def read_categories(cur, uid: int):
    cur.execute(
        f'SELECT id, label, icon FROM user_categories WHERE user_id = {uid} ORDER BY position, label'
    )
    return [{'id': r[0], 'label': r[1], 'icon': r[2]} for r in cur.fetchall()]


def read_pref_key(cur, uid: int, key: str):
    cur.execute(f'SELECT value FROM user_prefs WHERE user_id = {uid} AND key = {q(key)}')
    row = cur.fetchone()
    return row[0] if row and row[0] else {}


def read_prefs(cur, uid: int):
    return read_pref_key(cur, uid, 'filters')


def save_pref_key(cur, uid: int, key: str, value: dict):
    cur.execute(
        f'INSERT INTO user_prefs (user_id, key, value) VALUES ({uid}, {q(key)}, {q(json.dumps(value))}::jsonb) '
        'ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()'
    )


def save_product(cur, uid: int, p: dict):
    pid = str(p.get('id') or '')
    if not pid or not p.get('name'):
        return 0
    image = p.get('image') or ''
    if image.startswith('data:'):
        image = upload_image(image, pid)
    elif image.startswith('idb:'):
        image = ''
    cats = p.get('categories') or ([p['category']] if p.get('category') else [])
    shelf = p.get('shelfLifeHours')
    shelf_sql = str(int(shelf)) if isinstance(shelf, (int, float)) and shelf else 'NULL'
    cur.execute(
        'INSERT INTO user_products (user_id, id, name, category, categories, weight, composition, '
        'image, barcode, hit, shelf_life_hours, storage_text, updated_at) VALUES ('
        f"{uid}, {q(pid)}, {q(p.get('name'))}, {q(p.get('category') or '')}, "
        f"{q(json.dumps(cats))}::jsonb, {q(p.get('weight') or '')}, {q(p.get('composition') or '')}, "
        f"{q(image)}, {q(p.get('barcode') or '')}, {'TRUE' if p.get('hit') else 'FALSE'}, {shelf_sql}, "
        f"{q(p.get('storageText') or '')}, NOW()) "
        'ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, '
        'categories = EXCLUDED.categories, weight = EXCLUDED.weight, '
        'composition = EXCLUDED.composition, image = EXCLUDED.image, barcode = EXCLUDED.barcode, '
        'hit = EXCLUDED.hit, shelf_life_hours = EXCLUDED.shelf_life_hours, '
        'storage_text = EXCLUDED.storage_text, updated_at = NOW()'
    )
    return 1


def product_values(uid: int, p: dict):
    pid = str(p.get('id') or '')
    if not pid or not p.get('name'):
        return None
    image = p.get('image') or ''
    if image.startswith('data:'):
        image = upload_image(image, pid)
    elif image.startswith('idb:'):
        image = ''
    cats = p.get('categories') or ([p['category']] if p.get('category') else [])
    shelf = p.get('shelfLifeHours')
    shelf_sql = str(int(shelf)) if isinstance(shelf, (int, float)) and shelf else 'NULL'
    return (
        f"({uid}, {q(pid)}, {q(p.get('name'))}, {q(p.get('category') or '')}, "
        f"{q(json.dumps(cats))}::jsonb, {q(p.get('weight') or '')}, {q(p.get('composition') or '')}, "
        f"{q(image)}, {q(p.get('barcode') or '')}, {'TRUE' if p.get('hit') else 'FALSE'}, {shelf_sql}, "
        f"{q(p.get('storageText') or '')}, NOW())"
    )


def save_products_bulk(cur, uid: int, products: list, chunk: int = 60):
    rows = [v for v in (product_values(uid, p) for p in products) if v]
    saved = 0
    for i in range(0, len(rows), chunk):
        part = rows[i:i + chunk]
        cur.execute(
            'INSERT INTO user_products (user_id, id, name, category, categories, weight, composition, '
            'image, barcode, hit, shelf_life_hours, storage_text, updated_at) VALUES '
            + ', '.join(part)
            + ' ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, '
            'category = EXCLUDED.category, categories = EXCLUDED.categories, weight = EXCLUDED.weight, '
            'composition = EXCLUDED.composition, image = EXCLUDED.image, barcode = EXCLUDED.barcode, '
            'hit = EXCLUDED.hit, shelf_life_hours = EXCLUDED.shelf_life_hours, '
            'storage_text = EXCLUDED.storage_text, updated_at = NOW()'
        )
        saved += len(part)
    return saved


def save_categories(cur, uid: int, cats: list):
    keep = [str(c.get('id')) for c in cats if c.get('id')]
    if keep:
        joined = ', '.join(q(k) for k in keep)
        cur.execute(f'DELETE FROM user_categories WHERE user_id = {uid} AND id NOT IN ({joined})')
    else:
        cur.execute(f'DELETE FROM user_categories WHERE user_id = {uid}')
    for i, c in enumerate(cats):
        if not c.get('id'):
            continue
        cur.execute(
            'INSERT INTO user_categories (user_id, id, label, icon, position) VALUES '
            f"({uid}, {q(c['id'])}, {q(c.get('label') or '')}, {q(c.get('icon') or 'Utensils')}, {i}) "
            'ON CONFLICT (user_id, id) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, '
            'position = EXCLUDED.position, updated_at = NOW()'
        )


def handler(event: dict, context) -> dict:
    """Личный каталог пользователя: продукты, категории и фильтры хранятся на сервере под его аккаунтом."""
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
        return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload)}

    me = session_user(cur, token)
    if not me:
        return finish({'error': 'unauthorized'}, 401)
    me['members'] = structure_members(cur, token, me)

    raw_target = headers.get('X-Target-User') or headers.get('x-target-user') or ''
    uid = me['id']
    if raw_target and str(raw_target).isdigit():
        target = int(raw_target)
        if not can_manage(cur, me, target):
            return finish({'error': 'forbidden'}, 403)
        uid = target

    params = event.get('queryStringParameters') or {}
    if method == 'GET' and params.get('action') == 'overview':
        if me['role'] not in ('admin', 'superadmin', 'manager'):
            return finish({'error': 'forbidden'}, 403)
        return finish({'staff': build_overview(cur, me)})

    if method == 'GET':
        cur.execute(f'SELECT seeded FROM user_meta WHERE user_id = {uid}')
        row = cur.fetchone()
        return finish(
            {
                'products': read_products(cur, uid),
                'categories': read_categories(cur, uid),
                'prefs': read_prefs(cur, uid),
                'history': read_pref_key(cur, uid, 'history'),
                'seeded': bool(row and row[0]),
            }
        )

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', '')

    if action == 'seed':
        cur.execute(f'SELECT seeded FROM user_meta WHERE user_id = {uid}')
        row = cur.fetchone()
        if row and row[0]:
            return finish(
                {
                    'products': read_products(cur, uid),
                    'categories': read_categories(cur, uid),
                    'prefs': read_prefs(cur, uid),
                    'seeded': True,
                }
            )
        save_products_bulk(cur, uid, body.get('products') or [])
        cats = body.get('categories') or []
        if cats:
            save_categories(cur, uid, cats)
        cur.execute(
            f'INSERT INTO user_meta (user_id, seeded) VALUES ({uid}, TRUE) '
            'ON CONFLICT (user_id) DO UPDATE SET seeded = TRUE'
        )
        return finish(
            {
                'products': read_products(cur, uid),
                'categories': read_categories(cur, uid),
                'prefs': read_prefs(cur, uid),
                'seeded': True,
            }
        )

    if method == 'DELETE':
        cur.execute(
            f"DELETE FROM user_products WHERE user_id = {uid} AND id = {q(body.get('id', ''))}"
        )
        return finish({'ok': True, 'products': read_products(cur, uid)})

    if action == 'prefs':
        value = json.dumps(body.get('prefs') or {})
        cur.execute(
            f'INSERT INTO user_prefs (user_id, key, value) VALUES ({uid}, {q("filters")}, {q(value)}::jsonb) '
            'ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()'
        )
        return finish({'ok': True, 'prefs': read_prefs(cur, uid)})

    if action == 'history':
        current = read_pref_key(cur, uid, 'history') or {}
        incoming = body.get('history') or {}
        for key, stamp in incoming.items():
            if not isinstance(stamp, (int, float)):
                continue
            if stamp > current.get(key, 0):
                current[key] = int(stamp)
        save_pref_key(cur, uid, 'history', current)
        return finish({'ok': True, 'history': current})

    if action == 'categories':
        save_categories(cur, uid, body.get('categories') or [])
        return finish({'ok': True, 'categories': read_categories(cur, uid)})

    if action == 'replace':
        cur.execute(f'DELETE FROM user_products WHERE user_id = {uid}')
        save_products_bulk(cur, uid, body.get('products') or [])
        if body.get('categories'):
            save_categories(cur, uid, body['categories'])
        cur.execute(
            f'INSERT INTO user_meta (user_id, seeded) VALUES ({uid}, TRUE) '
            'ON CONFLICT (user_id) DO UPDATE SET seeded = TRUE'
        )
        return finish(
            {'ok': True, 'products': read_products(cur, uid), 'categories': read_categories(cur, uid)}
        )

    items = body.get('products') or ([body['product']] if body.get('product') else [])
    saved = save_products_bulk(cur, uid, items)
    return finish({'saved': saved, 'products': read_products(cur, uid)})