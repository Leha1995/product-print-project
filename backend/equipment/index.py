import base64
import json
import os
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


def num(value) -> str:
    try:
        return str(round(float(value), 2))
    except (TypeError, ValueError):
        return '0'


def upload_image(data_url: str, item_id: str) -> str:
    header, _, payload = data_url.partition(',')
    ext = 'png' if 'png' in header else 'webp' if 'webp' in header else 'jpg'
    key = f"equipment/{item_id}-{uuid.uuid4().hex[:8]}.{ext}"
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    s3.put_object(Bucket='files', Key=key, Body=base64.b64decode(payload), ContentType=f'image/{ext}')
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
    if target_id == me['id'] or me['role'] == 'superadmin':
        return True
    if me['role'] == 'manager':
        cur.execute(
            'SELECT role, manager_id FROM app_users WHERE id = ' + str(int(target_id))
        )
        row = cur.fetchone()
        if not row:
            return False
        if row[0] == 'admin':
            return row[1] == me['id']
        if row[0] == 'user' and row[1]:
            cur.execute(
                'SELECT manager_id FROM app_users WHERE id = '
                + str(int(row[1]))
                + " AND role = 'admin'"
            )
            head = cur.fetchone()
            return bool(head and head[0] == me['id'])
        return False
    return False


def read_items(cur, uid: int):
    cur.execute(
        'SELECT id, name, code, price, location, note, image, serial, active, created_at, '
        'qr_broken, written_off_at, write_off_reason '
        f'FROM equipment WHERE user_id = {uid} ORDER BY active DESC, location, name'
    )
    return [
        {
            'id': r[0],
            'name': r[1],
            'code': r[2],
            'price': float(r[3] or 0),
            'location': r[4],
            'note': r[5],
            'image': r[6],
            'serial': r[7],
            'active': bool(r[8]),
            'createdAt': r[9].isoformat() if r[9] else None,
            'qrBroken': bool(r[10]),
            'writtenOffAt': r[11].isoformat() if r[11] else None,
            'writeOffReason': r[12] or '',
        }
        for r in cur.fetchall()
    ]


def read_sessions(cur, uid: int, limit: int = 100):
    cur.execute(
        'SELECT id, started_at, finished_at, scanned, missing, total, total_price, missing_price '
        f'FROM inventory_sessions WHERE user_id = {uid} ORDER BY started_at DESC LIMIT {int(limit)}'
    )
    return [
        {
            'id': r[0],
            'startedAt': r[1].isoformat() if r[1] else None,
            'finishedAt': r[2].isoformat() if r[2] else None,
            'scanned': r[3] or [],
            'missing': r[4] or [],
            'total': r[5],
            'totalPrice': float(r[6] or 0),
            'missingPrice': float(r[7] or 0),
        }
        for r in cur.fetchall()
    ]


def make_code(uid: int) -> str:
    return f"EQ-{uid}-{uuid.uuid4().hex[:8].upper()}"


def save_item(cur, uid: int, item: dict) -> int:
    name = (item.get('name') or '').strip()
    if not name:
        return 0
    eid = str(item.get('id') or f"eq-{uuid.uuid4().hex[:10]}")
    code = (item.get('code') or '').strip() or make_code(uid)
    image = item.get('image') or ''
    if image.startswith('data:'):
        image = upload_image(image, eid)
    cur.execute(
        'INSERT INTO equipment (user_id, id, name, code, price, location, note, image, serial, active, updated_at) '
        f"VALUES ({uid}, {q(eid)}, {q(name)}, {q(code)}, {num(item.get('price'))}, "
        f"{q(item.get('location') or '')}, {q(item.get('note') or '')}, {q(image)}, "
        f"{q(item.get('serial') or '')}, {'FALSE' if item.get('active') is False else 'TRUE'}, NOW()) "
        'ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, '
        'price = EXCLUDED.price, location = EXCLUDED.location, note = EXCLUDED.note, '
        'image = EXCLUDED.image, serial = EXCLUDED.serial, active = EXCLUDED.active, updated_at = NOW()'
    )
    return 1


def handler(event: dict, context) -> dict:
    """Инвентаризация оборудования кухни: карточки с QR-кодом и стоимостью, сессии сканирования."""
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
    if me['role'] not in ('superadmin', 'manager'):
        return finish({'error': 'forbidden'}, 403)

    raw_target = headers.get('X-Target-User') or headers.get('x-target-user') or ''
    uid = me['id']
    if raw_target and str(raw_target).isdigit():
        target = int(raw_target)
        if not can_manage(cur, me, target):
            return finish({'error': 'forbidden'}, 403)
        uid = target

    if method == 'GET':
        return finish({'items': read_items(cur, uid), 'sessions': read_sessions(cur, uid)})

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', '')

    if method == 'DELETE':
        cur.execute(f"DELETE FROM equipment WHERE user_id = {uid} AND id = {q(body.get('id', ''))}")
        return finish({'ok': True, 'items': read_items(cur, uid)})

    if action == 'resolve':
        eid = str(body.get('id') or '')
        mode = body.get('mode') or ''
        session_id = body.get('sessionId')
        if mode == 'qr_broken':
            cur.execute(
                'UPDATE equipment SET qr_broken = TRUE, updated_at = NOW() '
                f'WHERE user_id = {uid} AND id = {q(eid)}'
            )
        elif mode == 'write_off':
            cur.execute(
                'UPDATE equipment SET active = FALSE, written_off_at = NOW(), '
                f"write_off_reason = {q(body.get('reason') or 'Списано при инвентаризации')}, "
                f'updated_at = NOW() WHERE user_id = {uid} AND id = {q(eid)}'
            )
        else:
            return finish({'error': 'bad_mode'}, 400)

        if session_id:
            cur.execute(
                'SELECT scanned, missing, total, total_price FROM inventory_sessions '
                f'WHERE user_id = {uid} AND id = {int(session_id)}'
            )
            row = cur.fetchone()
            if row:
                scanned_ids = list(row[0] or [])
                missing_ids = [m for m in (row[1] or []) if m != eid]
                total = int(row[2] or 0)
                total_price = float(row[3] or 0)
                cur.execute(
                    f'SELECT price FROM equipment WHERE user_id = {uid} AND id = {q(eid)}'
                )
                prow = cur.fetchone()
                price = float(prow[0] or 0) if prow else 0.0
                if mode == 'qr_broken':
                    if eid not in scanned_ids:
                        scanned_ids.append(eid)
                else:
                    total = max(0, total - 1)
                    total_price = max(0.0, total_price - price)
                cur.execute(
                    'SELECT COALESCE(SUM(price), 0) FROM equipment WHERE user_id = '
                    f"{uid} AND id IN ({', '.join(q(m) for m in missing_ids)})"
                    if missing_ids
                    else 'SELECT 0'
                )
                missing_price = float(cur.fetchone()[0] or 0)
                cur.execute(
                    f'UPDATE inventory_sessions SET scanned = {q(json.dumps(scanned_ids))}::jsonb, '
                    f'missing = {q(json.dumps(missing_ids))}::jsonb, total = {total}, '
                    f'total_price = {num(total_price)}, missing_price = {num(missing_price)} '
                    f'WHERE user_id = {uid} AND id = {int(session_id)}'
                )

        return finish({'ok': True, 'items': read_items(cur, uid), 'sessions': read_sessions(cur, uid)})

    if action == 'qr_fixed':
        new_code = make_code(uid)
        cur.execute(
            f"UPDATE equipment SET qr_broken = FALSE, code = {q(new_code)}, updated_at = NOW() "
            f"WHERE user_id = {uid} AND id = {q(body.get('id', ''))}"
        )
        return finish({'ok': True, 'code': new_code, 'items': read_items(cur, uid)})

    if action == 'write_off':
        cur.execute(
            'UPDATE equipment SET active = FALSE, written_off_at = NOW(), '
            f"write_off_reason = {q(body.get('reason') or 'Списано при инвентаризации')}, updated_at = NOW() "
            f"WHERE user_id = {uid} AND id = {q(body.get('id', ''))}"
        )
        return finish({'ok': True, 'items': read_items(cur, uid)})

    if action == 'restore':
        cur.execute(
            'UPDATE equipment SET active = TRUE, written_off_at = NULL, '
            f"write_off_reason = '', updated_at = NOW() "
            f"WHERE user_id = {uid} AND id = {q(body.get('id', ''))}"
        )
        return finish({'ok': True, 'items': read_items(cur, uid)})

    if action == 'finish':
        scanned = [str(c) for c in (body.get('scanned') or [])]
        items = read_items(cur, uid)
        active = [i for i in items if i['active']]
        found = [i for i in active if i['code'] in scanned]
        missing = [i for i in active if i['code'] not in scanned]
        total_price = sum(i['price'] for i in active)
        missing_price = sum(i['price'] for i in missing)
        cur.execute(
            'INSERT INTO inventory_sessions (user_id, started_by, finished_at, scanned, missing, '
            f"total, total_price, missing_price) VALUES ({uid}, {me['id']}, NOW(), "
            f"{q(json.dumps([i['id'] for i in found]))}::jsonb, {q(json.dumps([i['id'] for i in missing]))}::jsonb, "
            f"{len(active)}, {num(total_price)}, {num(missing_price)}) RETURNING id"
        )
        row = cur.fetchone()
        return finish(
            {
                'ok': True,
                'sessionId': row[0] if row else None,
                'found': found,
                'missing': missing,
                'total': len(active),
                'totalPrice': total_price,
                'missingPrice': missing_price,
                'sessions': read_sessions(cur, uid),
            }
        )

    items = body.get('items') or ([body['item']] if body.get('item') else [])
    saved = 0
    for item in items:
        saved += save_item(cur, uid, item)
    return finish({'saved': saved, 'items': read_items(cur, uid)})