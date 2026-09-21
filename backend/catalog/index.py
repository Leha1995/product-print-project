import json
import os
import base64
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


def can_manage(cur, me, target_id: int) -> bool:
    if target_id == me['id']:
        return True
    if me['role'] == 'superadmin':
        return True
    if me['role'] == 'admin':
        cur.execute(f'SELECT manager_id FROM app_users WHERE id = {target_id}')
        row = cur.fetchone()
        return bool(row and row[0] == me['id'])
    return False


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


def read_prefs(cur, uid: int):
    cur.execute(f'SELECT value FROM user_prefs WHERE user_id = {uid} AND key = {q("filters")}')
    row = cur.fetchone()
    return row[0] if row and row[0] else {}


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

    raw_target = headers.get('X-Target-User') or headers.get('x-target-user') or ''
    uid = me['id']
    if raw_target and str(raw_target).isdigit():
        target = int(raw_target)
        if not can_manage(cur, me, target):
            return finish({'error': 'forbidden'}, 403)
        uid = target

    if method == 'GET':
        cur.execute(f'SELECT seeded FROM user_meta WHERE user_id = {uid}')
        row = cur.fetchone()
        return finish(
            {
                'products': read_products(cur, uid),
                'categories': read_categories(cur, uid),
                'prefs': read_prefs(cur, uid),
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
        for p in body.get('products') or []:
            save_product(cur, uid, p)
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

    if action == 'categories':
        save_categories(cur, uid, body.get('categories') or [])
        return finish({'ok': True, 'categories': read_categories(cur, uid)})

    if action == 'replace':
        cur.execute(f'DELETE FROM user_products WHERE user_id = {uid}')
        for p in body.get('products') or []:
            save_product(cur, uid, p)
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
    saved = sum(save_product(cur, uid, p) for p in items)
    return finish({'saved': saved, 'products': read_products(cur, uid)})