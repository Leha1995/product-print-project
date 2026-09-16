import json
import os
import base64
import uuid

import boto3
import psycopg2

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

ADMIN_PIN = '15271527'


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


PRODUCTS_SQL = (
    'SELECT id, name, category, categories, weight, composition, image, barcode, '
    'hit, shelf_life_hours, storage_text FROM shared_products ORDER BY name'
)

CATS_SQL = 'SELECT id, label, icon FROM catalog_categories ORDER BY position, label'


def read_products(cur):
    cur.execute(PRODUCTS_SQL)
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


def read_categories(cur):
    cur.execute(CATS_SQL)
    return [{'id': r[0], 'label': r[1], 'icon': r[2]} for r in cur.fetchall()]


def save_product(cur, p: dict):
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
        'INSERT INTO shared_products (id, name, category, categories, weight, composition, '
        'image, barcode, hit, shelf_life_hours, storage_text, updated_at) VALUES ('
        f"{q(pid)}, {q(p.get('name'))}, {q(p.get('category') or '')}, {q(json.dumps(cats))}::jsonb, "
        f"{q(p.get('weight') or '')}, {q(p.get('composition') or '')}, {q(image)}, "
        f"{q(p.get('barcode') or '')}, {'TRUE' if p.get('hit') else 'FALSE'}, {shelf_sql}, "
        f"{q(p.get('storageText') or '')}, NOW()) "
        'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, '
        'categories = EXCLUDED.categories, weight = EXCLUDED.weight, '
        'composition = EXCLUDED.composition, image = EXCLUDED.image, barcode = EXCLUDED.barcode, '
        'hit = EXCLUDED.hit, shelf_life_hours = EXCLUDED.shelf_life_hours, '
        'storage_text = EXCLUDED.storage_text, updated_at = NOW()'
    )
    return 1


def save_categories(cur, cats: list):
    cur.execute('DELETE FROM catalog_categories')
    for i, c in enumerate(cats):
        if not c.get('id'):
            continue
        cur.execute(
            'INSERT INTO catalog_categories (id, label, icon, position) VALUES '
            f"({q(c['id'])}, {q(c.get('label') or '')}, {q(c.get('icon') or 'Utensils')}, {i}) "
            'ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, icon = EXCLUDED.icon, '
            'position = EXCLUDED.position, updated_at = NOW()'
        )


def handler(event: dict, context) -> dict:
    """Облачный каталог: продукты и категории хранятся на сервере и синхронизируются между устройствами."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()

    def finish(payload: dict, status: int = 200):
        cur.close()
        conn.close()
        return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload)}

    if method == 'GET':
        cur.execute("SELECT value FROM catalog_meta WHERE key = 'seeded'")
        row = cur.fetchone()
        return finish(
            {
                'products': read_products(cur),
                'categories': read_categories(cur),
                'seeded': bool(row and row[0] == '1'),
            }
        )

    headers = event.get('headers') or {}
    pin = (headers.get('X-Admin-Pin') or headers.get('x-admin-pin') or '').strip()
    body = json.loads(event.get('body') or '{}')
    action = body.get('action', '')

    if action == 'seed':
        cur.execute("SELECT value FROM catalog_meta WHERE key = 'seeded'")
        if cur.fetchone():
            return finish({'products': read_products(cur), 'categories': read_categories(cur), 'seeded': True})
        for p in body.get('products') or []:
            save_product(cur, p)
        cats = body.get('categories') or []
        if cats:
            save_categories(cur, cats)
        cur.execute("INSERT INTO catalog_meta (key, value) VALUES ('seeded', '1') ON CONFLICT (key) DO NOTHING")
        return finish({'products': read_products(cur), 'categories': read_categories(cur), 'seeded': True})

    if pin != ADMIN_PIN:
        return finish({'error': 'forbidden'}, 403)

    if method == 'DELETE':
        cur.execute(f"DELETE FROM shared_products WHERE id = {q(body.get('id', ''))}")
        return finish({'ok': True, 'products': read_products(cur)})

    if action == 'categories':
        save_categories(cur, body.get('categories') or [])
        return finish({'ok': True, 'categories': read_categories(cur)})

    if action == 'replace':
        cur.execute('DELETE FROM shared_products')
        for p in body.get('products') or []:
            save_product(cur, p)
        if body.get('categories'):
            save_categories(cur, body['categories'])
        return finish({'ok': True, 'products': read_products(cur), 'categories': read_categories(cur)})

    items = body.get('products') or ([body['product']] if body.get('product') else [])
    saved = sum(save_product(cur, p) for p in items)
    return finish({'saved': saved, 'products': read_products(cur)})
