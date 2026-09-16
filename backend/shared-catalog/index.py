import json
import os
import base64
import uuid
from datetime import datetime

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


def q(value: str) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def get_conn():
    return psycopg2.connect(os.environ['DATABASE_URL'])


def upload_image(data_url: str, product_id: str) -> str:
    header, _, payload = data_url.partition(',')
    ext = 'jpg'
    if 'png' in header:
        ext = 'png'
    elif 'webp' in header:
        ext = 'webp'
    body = base64.b64decode(payload)
    key = f"catalog/{product_id}-{uuid.uuid4().hex[:8]}.{ext}"
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    s3.put_object(Bucket='files', Key=key, Body=body, ContentType=f"image/{ext}")
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def row_to_item(r) -> dict:
    return {
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
        'author': r[11],
        'updatedAt': r[12].isoformat() if isinstance(r[12], datetime) else None,
    }


SELECT_SQL = (
    'SELECT id, name, category, categories, weight, composition, image, barcode, '
    'hit, shelf_life_hours, storage_text, author, updated_at '
    'FROM shared_products ORDER BY updated_at DESC'
)


def handler(event: dict, context) -> dict:
    """Общая база карточек продуктов: список, публикация и удаление."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    conn = get_conn()
    conn.autocommit = True
    cur = conn.cursor()

    if method == 'GET':
        cur.execute(SELECT_SQL)
        items = [row_to_item(r) for r in cur.fetchall()]
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'items': items})}

    headers = event.get('headers') or {}
    pin = headers.get('X-Admin-Pin') or headers.get('x-admin-pin') or ''
    if pin.strip() != ADMIN_PIN:
        cur.close()
        conn.close()
        return {'statusCode': 403, 'headers': CORS, 'body': json.dumps({'error': 'forbidden'})}

    body = json.loads(event.get('body') or '{}')

    if method == 'DELETE':
        pid = str(body.get('id', ''))
        cur.execute(f"DELETE FROM shared_products WHERE id = {q(pid)}")
        cur.close()
        conn.close()
        return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'ok': True})}

    items = body.get('items') or ([body['product']] if body.get('product') else [])
    author = str(body.get('author', ''))[:80]
    saved = 0

    for p in items:
        pid = str(p.get('id') or '')
        if not pid or not p.get('name'):
            continue
        image = p.get('image') or ''
        if image.startswith('data:'):
            image = upload_image(image, pid)
        elif image.startswith('idb:'):
            image = ''
        cats = json.dumps(p.get('categories') or [p.get('category')] if p.get('category') else [])
        shelf = p.get('shelfLifeHours')
        shelf_sql = str(int(shelf)) if isinstance(shelf, (int, float)) and shelf else 'NULL'
        cur.execute(
            'INSERT INTO shared_products (id, name, category, categories, weight, composition, '
            'image, barcode, hit, shelf_life_hours, storage_text, author, updated_at) VALUES ('
            f"{q(pid)}, {q(p.get('name'))}, {q(p.get('category') or '')}, {q(cats)}::jsonb, "
            f"{q(p.get('weight') or '')}, {q(p.get('composition') or '')}, {q(image)}, "
            f"{q(p.get('barcode') or '')}, {'TRUE' if p.get('hit') else 'FALSE'}, {shelf_sql}, "
            f"{q(p.get('storageText') or '')}, {q(author)}, NOW()) "
            'ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, '
            'categories = EXCLUDED.categories, weight = EXCLUDED.weight, '
            'composition = EXCLUDED.composition, image = EXCLUDED.image, '
            'barcode = EXCLUDED.barcode, hit = EXCLUDED.hit, '
            'shelf_life_hours = EXCLUDED.shelf_life_hours, '
            'storage_text = EXCLUDED.storage_text, author = EXCLUDED.author, updated_at = NOW()'
        )
        saved += 1

    cur.execute(SELECT_SQL)
    result = [row_to_item(r) for r in cur.fetchall()]
    cur.close()
    conn.close()
    return {'statusCode': 200, 'headers': CORS, 'body': json.dumps({'saved': saved, 'items': result})}
