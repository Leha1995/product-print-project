import base64
import datetime
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


def task_cost(value) -> str:
    try:
        val = float(value)
    except (TypeError, ValueError):
        return '0'
    if val != val or val < 0 or val > 1e9:
        return '0'
    return str(round(val, 2))


def upload_image(data_url: str, item_id: str, folder: str = 'equipment') -> str:
    header, _, payload = data_url.partition(',')
    ext = 'png' if 'png' in header else 'webp' if 'webp' in header else 'jpg'
    key = f"{folder}/{item_id}-{uuid.uuid4().hex[:8]}.{ext}"
    s3 = boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )
    s3.put_object(Bucket='files', Key=key, Body=base64.b64decode(payload), ContentType=f'image/{ext}')
    return f"https://cdn.poehali.dev/projects/{os.environ['AWS_ACCESS_KEY_ID']}/bucket/{key}"


def s3_client():
    return boto3.client(
        's3',
        endpoint_url='https://bucket.poehali.dev',
        aws_access_key_id=os.environ['AWS_ACCESS_KEY_ID'],
        aws_secret_access_key=os.environ['AWS_SECRET_ACCESS_KEY'],
    )


def cleanup_repair_photos(cur, limit: int = 10) -> None:
    """Удаляет из хранилища фото поломок через 24 часа после возврата из ремонта."""
    cur.execute(
        "SELECT id, photos FROM equipment_repairs WHERE returned_at IS NOT NULL "
        "AND returned_at < NOW() - INTERVAL '24 hours' AND photos <> '[]'::jsonb "
        f'ORDER BY returned_at LIMIT {int(limit)}'
    )
    rows = cur.fetchall()
    s3 = s3_client()
    for rid, photos in rows:
        for url in photos or []:
            _, sep, key = str(url).partition('/bucket/')
            if not sep or not key.startswith('repairs/'):
                continue
            try:
                s3.delete_object(Bucket='files', Key=key)
            except Exception as err:
                print(f'repair photo delete failed {key}: {err}')
        cur.execute(f"UPDATE equipment_repairs SET photos = '[]'::jsonb WHERE id = {int(rid)}")

    cur.execute(
        "SELECT id, photos FROM equipment_tasks WHERE status <> 'open' AND done_at IS NOT NULL "
        "AND done_at < NOW() - INTERVAL '24 hours' AND photos <> '[]'::jsonb "
        f'ORDER BY done_at LIMIT {int(limit)}'
    )
    for tid, photos in cur.fetchall():
        for url in photos or []:
            _, sep, key = str(url).partition('/bucket/')
            if sep and key.startswith('tasks/'):
                try:
                    s3.delete_object(Bucket='files', Key=key)
                except Exception as err:
                    print(f'task photo delete failed {key}: {err}')
        cur.execute(f"UPDATE equipment_tasks SET photos = '[]'::jsonb WHERE id = {int(tid)}")


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        'SELECT u.id, u.username, u.role, u.active, u.manager_id FROM app_sessions s '
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} '
        'AND s.expires_at > NOW()'
    )
    row = cur.fetchone()
    if not row or not row[3]:
        return None
    return {'id': row[0], 'username': row[1], 'role': row[2], 'managerId': row[4]}


def technician_owners(cur, me):
    """Владельцы оборудования, ремонты которых видит техник. None — все."""
    cur.execute(
        'SELECT s.head_id, u.role FROM technician_scopes s LEFT JOIN app_users u ON u.id = s.head_id '
        f"WHERE s.technician_id = {int(me['id'])}"
    )
    heads = cur.fetchall()
    if not heads:
        return None
    owners = set()
    for head_id, role in heads:
        if role == 'superadmin':
            return None
        owners.add(int(head_id))
        if role == 'manager':
            cur.execute(f"SELECT id FROM app_users WHERE role = 'admin' AND manager_id = {int(head_id)}")
            owners.update(r[0] for r in cur.fetchall())
    return sorted(owners)


def technician_items(cur, me):
    owners = technician_owners(cur, me)
    scope = '' if owners is None else f" AND e.user_id IN ({', '.join(str(o) for o in owners)})"
    cur.execute(
        'SELECT e.user_id, e.id, e.name, e.code, e.location, e.serial, e.image, e.repair_sent_at, '
        'e.repair_cost, COALESCE(NULLIF(u.full_name, \'\'), u.username), '
        "(SELECT r.description FROM equipment_repairs r WHERE r.user_id = e.user_id AND r.equipment_id = e.id "
        'AND r.returned_at IS NULL ORDER BY r.sent_at DESC LIMIT 1), '
        "(SELECT r.photos FROM equipment_repairs r WHERE r.user_id = e.user_id AND r.equipment_id = e.id "
        'AND r.returned_at IS NULL ORDER BY r.sent_at DESC LIMIT 1) '
        'FROM equipment e LEFT JOIN app_users u ON u.id = e.user_id '
        f'WHERE e.in_repair = TRUE AND e.active = TRUE{scope} ORDER BY e.repair_sent_at'
    )
    return [
        {
            'ownerId': r[0],
            'id': r[1],
            'name': r[2],
            'code': r[3],
            'location': r[4] or '',
            'serial': r[5] or '',
            'image': r[6] or '',
            'repairSentAt': r[7].isoformat() if r[7] else None,
            'repairCost': float(r[8] or 0),
            'ownerName': r[9] or '',
            'description': r[10] or '',
            'photos': r[11] or [],
        }
        for r in cur.fetchall()
    ]


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


def read_repairs(cur, uid: int) -> dict:
    cur.execute(
        'SELECT id, equipment_id, sent_at, returned_at, cost, description, photos FROM equipment_repairs '
        f'WHERE user_id = {uid} ORDER BY sent_at DESC, id DESC'
    )
    out: dict = {}
    for r in cur.fetchall():
        out.setdefault(r[1], []).append(
            {
                'id': r[0],
                'sentAt': r[2].isoformat() if r[2] else None,
                'returnedAt': r[3].isoformat() if r[3] else None,
                'cost': float(r[4] or 0),
                'description': r[5] or '',
                'photos': r[6] or [],
            }
        )
    return out


def read_items(cur, uid: int):
    repairs = read_repairs(cur, uid)
    cur.execute(
        'SELECT id, name, code, price, location, note, image, serial, active, created_at, '
        'qr_broken, written_off_at, write_off_reason, commissioned_at, depreciation_per_day, repair_cost, '
        'in_repair, repair_sent_at '
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
            'commissionedAt': r[13].isoformat() if r[13] else None,
            'depreciationPerDay': float(r[14] or 0),
            'repairCost': float(r[15] or 0),
            'inRepair': bool(r[16]),
            'repairSentAt': r[17].isoformat() if r[17] else None,
            'repairs': repairs.get(r[0], []),
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


def date_sql(value) -> str:
    raw = str(value or '').strip()[:10]
    try:
        return f"'{datetime.date.fromisoformat(raw).isoformat()}'"
    except ValueError:
        return 'NULL'


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
        'INSERT INTO equipment (user_id, id, name, code, price, location, note, image, serial, active, commissioned_at, depreciation_per_day, repair_cost, updated_at) '
        f"VALUES ({uid}, {q(eid)}, {q(name)}, {q(code)}, {num(item.get('price'))}, "
        f"{q(item.get('location') or '')}, {q(item.get('note') or '')}, {q(image)}, "
        f"{q(item.get('serial') or '')}, {'FALSE' if item.get('active') is False else 'TRUE'}, {date_sql(item.get('commissionedAt'))}, "
        f"GREATEST(0, {num(item.get('depreciationPerDay'))}), GREATEST(0, {num(item.get('repairCost'))}), NOW()) "
        'ON CONFLICT (user_id, id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code, '
        'price = EXCLUDED.price, location = EXCLUDED.location, note = EXCLUDED.note, '
        'image = EXCLUDED.image, serial = EXCLUDED.serial, active = EXCLUDED.active, '
        'commissioned_at = EXCLUDED.commissioned_at, '
        'depreciation_per_day = EXCLUDED.depreciation_per_day, repair_cost = EXCLUDED.repair_cost, updated_at = NOW()'
    )
    return 1


def return_repair(cur, uid: int, body: dict, by_user: int = 0) -> None:
    cost = max(0.0, float(num(body.get('cost'))))
    eid = str(body.get('id') or '')
    description = body.get('description')
    desc_sql = (
        f", description = {q(str(description).strip()[:1000])}" if description is not None else ''
    )
    cur.execute(
        f'SELECT id FROM equipment_repairs WHERE user_id = {uid} AND equipment_id = {q(eid)} '
        'AND returned_at IS NULL ORDER BY sent_at DESC LIMIT 1'
    )
    open_row = cur.fetchone()
    if open_row:
        cur.execute(
            f'UPDATE equipment_repairs SET returned_at = NOW(), returned_by = {int(by_user) or "NULL"}, cost = {num(cost)}{desc_sql} '
            f'WHERE id = {int(open_row[0])}'
        )
    else:
        cur.execute(
            'INSERT INTO equipment_repairs (user_id, equipment_id, sent_at, returned_at, cost, description, returned_by) '
            f"SELECT {uid}, {q(eid)}, COALESCE(repair_sent_at, NOW()), NOW(), {num(cost)}, "
            f"{q(str(description or '').strip()[:1000])}, {int(by_user) or 'NULL'} FROM equipment WHERE user_id = {uid} AND id = {q(eid)}"
        )
    cur.execute(
        'UPDATE equipment SET in_repair = FALSE, repair_sent_at = NULL, '
        f'repair_cost = COALESCE(repair_cost, 0) + {num(cost)}, updated_at = NOW() '
        f"WHERE user_id = {uid} AND id = {q(body.get('id', ''))}"
    )


def owner_technicians(cur, uid: int):
    """Техники, закреплённые за точкой uid (напрямую, через управляющего или «все точки»)."""
    cur.execute(f'SELECT role, manager_id FROM app_users WHERE id = {int(uid)}')
    row = cur.fetchone()
    heads = [int(uid)]
    if row and row[0] == 'admin' and row[1]:
        heads.append(int(row[1]))
    cur.execute(
        "SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.username) FROM app_users u "
        "WHERE u.role = 'technician' AND u.active AND ("
        'NOT EXISTS (SELECT 1 FROM technician_scopes s WHERE s.technician_id = u.id) '
        'OR EXISTS (SELECT 1 FROM technician_scopes s LEFT JOIN app_users h ON h.id = s.head_id '
        f"WHERE s.technician_id = u.id AND (s.head_id IN ({', '.join(str(h) for h in heads)}) OR h.role = 'superadmin'))"
        ') ORDER BY 2'
    )
    return [{'id': r[0], 'name': r[1]} for r in cur.fetchall()]


TASK_COLS = (
    't.id, t.user_id, t.equipment_id, t.technician_id, t.description, t.photos, t.status, '
    't.created_at, t.done_at, t.done_comment, e.name, e.location, e.code, '
    "COALESCE(NULLIF(o.full_name, ''), o.username), COALESCE(NULLIF(tu.full_name, ''), tu.username), "
    "COALESCE(NULLIF(cu.full_name, ''), cu.username), COALESCE(NULLIF(du.full_name, ''), du.username), "
    't.priority, t.cost'
)
PRIORITIES = ('urgent', 'soon', 'normal')
TASK_JOINS = (
    'FROM equipment_tasks t '
    'LEFT JOIN equipment e ON e.user_id = t.user_id AND e.id = t.equipment_id '
    'LEFT JOIN app_users o ON o.id = t.user_id '
    'LEFT JOIN app_users tu ON tu.id = t.technician_id '
    'LEFT JOIN app_users cu ON cu.id = t.created_by '
    'LEFT JOIN app_users du ON du.id = t.done_by '
)


def task_rows(cur, where: str, limit: int = 200):
    cur.execute(
        f'SELECT {TASK_COLS} {TASK_JOINS} WHERE {where} '
        "ORDER BY (t.status = 'open') DESC, "
        "CASE WHEN t.status = 'open' THEN CASE t.priority WHEN 'urgent' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END ELSE 0 END, "
        't.created_at DESC '
        f'LIMIT {int(limit)}'
    )
    return [
        {
            'id': r[0],
            'ownerId': r[1],
            'equipmentId': r[2],
            'technicianId': r[3],
            'description': r[4] or '',
            'photos': r[5] or [],
            'status': r[6],
            'createdAt': r[7].isoformat() if r[7] else None,
            'doneAt': r[8].isoformat() if r[8] else None,
            'doneComment': r[9] or '',
            'equipmentName': r[10] or '',
            'location': r[11] or '',
            'code': r[12] or '',
            'ownerName': r[13] or '',
            'technicianName': r[14] or '',
            'createdByName': r[15] or '',
            'doneByName': r[16] or '',
            'priority': r[17] if r[17] in PRIORITIES else 'normal',
            'cost': float(r[18] or 0),
        }
        for r in cur.fetchall()
    ]


def tasks_report(cur, uid: int, session_id: int):
    """Задачи за период между предыдущей и текущей инвентаризацией."""
    end_sql = 'NOW()'
    if session_id:
        cur.execute(
            f'SELECT finished_at FROM inventory_sessions WHERE user_id = {uid} AND id = {int(session_id)}'
        )
        row = cur.fetchone()
        if row and row[0]:
            end_sql = q(row[0].isoformat()) + '::timestamp'
    cur.execute(
        f'SELECT MAX(finished_at) FROM inventory_sessions WHERE user_id = {uid} '
        f'AND finished_at IS NOT NULL AND finished_at < {end_sql} '
        + (f'AND id <> {int(session_id)}' if session_id else '')
    )
    prev = cur.fetchone()[0]
    start_sql = (q(prev.isoformat()) + '::timestamp') if prev else "'-infinity'::timestamp"
    cur.execute(f'SELECT {start_sql}, {end_sql}')
    start, end = cur.fetchone()
    tasks = task_rows(
        cur,
        f"t.user_id = {uid} AND t.status <> 'cancelled' AND t.created_at <= {end_sql} "
        f'AND (t.done_at IS NULL OR t.done_at > {start_sql})',
        2000,
    )
    return {
        'tasks': tasks,
        'from': start.isoformat() if prev else None,
        'to': end.isoformat() if end else None,
    }


def owner_tasks(cur, uid: int):
    return task_rows(
        cur,
        f"t.user_id = {int(uid)} AND (t.status = 'open' OR t.done_at > NOW() - INTERVAL '30 days')",
    )


def technician_tasks(cur, me):
    owners = technician_owners(cur, me)
    scope = '' if owners is None else f" AND t.user_id IN ({', '.join(str(o) for o in owners) or '0'})"
    return task_rows(
        cur,
        f"(t.technician_id IS NULL OR t.technician_id = {int(me['id'])}){scope} "
        "AND (t.status = 'open' OR t.done_at > NOW() - INTERVAL '7 days')",
    )


def technician_month_stats(cur, tech_id: int, month: str = '') -> dict:
    """Сводка техника за календарный месяц: выполненные задачи, возвращённые ремонты и расходы."""
    today = datetime.date.today()
    try:
        start = datetime.date.fromisoformat(f'{str(month)[:7]}-01')
    except ValueError:
        start = today.replace(day=1)
    if start > today.replace(day=1) or start.year < 2000:
        start = today.replace(day=1)
    end = (start.replace(day=28) + datetime.timedelta(days=4)).replace(day=1)
    tid = int(tech_id)
    cur.execute(
        'SELECT COUNT(*), COALESCE(SUM(cost), 0), '
        "COUNT(*) FILTER (WHERE priority = 'urgent') FROM equipment_tasks "
        f"WHERE status = 'done' AND done_by = {tid} AND done_at >= '{start.isoformat()}' AND done_at < '{end.isoformat()}'"
    )
    t = cur.fetchone() or (0, 0, 0)
    cur.execute(
        'SELECT COUNT(*), COALESCE(SUM(cost), 0) FROM equipment_repairs '
        f"WHERE returned_by = {tid} AND returned_at >= '{start.isoformat()}' AND returned_at < '{end.isoformat()}'"
    )
    r = cur.fetchone() or (0, 0)
    tasks_cost = float(t[1] or 0)
    repairs_cost = float(r[1] or 0)
    return {
        'month': start.isoformat()[:7],
        'isCurrent': start == today.replace(day=1),
        'tasksDone': int(t[0] or 0),
        'urgentDone': int(t[2] or 0),
        'tasksCost': tasks_cost,
        'repairsReturned': int(r[0] or 0),
        'repairsCost': repairs_cost,
        'totalCost': round(tasks_cost + repairs_cost, 2),
    }


def upload_photos(raw_list, prefix: str):
    out = []
    for raw in (raw_list or [])[:4]:
        if isinstance(raw, str) and raw.startswith('data:image/'):
            out.append(upload_image(raw, prefix, 'tasks'))
    return out


def handler(event: dict, context) -> dict:
    """Инвентаризация оборудования кухни: карточки с QR-кодом, стоимостью и расходами на ремонт, сессии сканирования."""
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
    if method == 'GET':
        cleanup_repair_photos(cur)
    view_tech = str((event.get('queryStringParameters') or {}).get('viewTech') or '')
    month_param = str((event.get('queryStringParameters') or {}).get('month') or '')
    if method == 'GET' and view_tech:
        if me['role'] != 'superadmin' or not view_tech.isdigit():
            return finish({'error': 'forbidden'}, 403)
        cur.execute(
            'SELECT id, username, role, COALESCE(NULLIF(full_name, \'\'), username) FROM app_users '
            f"WHERE id = {int(view_tech)} AND role = 'technician'"
        )
        row = cur.fetchone()
        if not row:
            return finish({'error': 'not_found'}, 404)
        tech = {'id': row[0], 'username': row[1], 'role': row[2]}
        return finish(
            {
                'repairs': technician_items(cur, tech),
                'tasks': technician_tasks(cur, tech),
                'technicianName': row[3],
                'stats': technician_month_stats(cur, row[0], month_param),
            }
        )
    if me['role'] == 'technician':
        if method == 'GET':
            return finish(
                {
                    'repairs': technician_items(cur, me),
                    'tasks': technician_tasks(cur, me),
                    'stats': technician_month_stats(cur, me['id'], month_param),
                }
            )
        tbody = json.loads(event.get('body') or '{}')
        if tbody.get('action') == 'task_done':
            tid = int(tbody.get('taskId') or 0)
            visible = {t['id'] for t in technician_tasks(cur, me) if t['status'] == 'open'}
            if tid not in visible:
                return finish({'error': 'not_found', 'tasks': technician_tasks(cur, me)}, 409)
            cur.execute(
                "UPDATE equipment_tasks SET status = 'done', done_at = NOW(), "
                f"cost = {task_cost(tbody.get('cost'))}, "
                f"done_by = {int(me['id'])}, done_comment = {q(str(tbody.get('comment') or '').strip()[:1000])} "
                f"WHERE id = {tid} AND status = 'open'"
            )
            return finish({'ok': True, 'tasks': technician_tasks(cur, me)})
        if tbody.get('action') != 'return_repair':
            return finish({'error': 'forbidden'}, 403)
        owner = int(tbody.get('ownerId') or 0)
        owners = technician_owners(cur, me)
        if not owner or (owners is not None and owner not in owners):
            return finish({'error': 'forbidden'}, 403)
        cur.execute(
            f"SELECT 1 FROM equipment WHERE user_id = {owner} AND id = {q(tbody.get('id', ''))} "
            'AND in_repair = TRUE'
        )
        if not cur.fetchone():
            return finish({'error': 'not_in_repair', 'repairs': technician_items(cur, me)}, 409)
        return_repair(cur, owner, tbody, int(me['id']))
        return finish({'ok': True, 'repairs': technician_items(cur, me)})

    if me['role'] not in ('superadmin', 'manager'):
        return finish({'error': 'forbidden'}, 403)

    raw_target = headers.get('X-Target-User') or headers.get('x-target-user') or ''
    uid = me['id']
    if raw_target and str(raw_target).isdigit():
        target = int(raw_target)
        if not can_manage(cur, me, target):
            return finish({'error': 'forbidden'}, 403)
        uid = target

    qs = event.get('queryStringParameters') or {}
    if method == 'GET' and qs.get('report') == 'tasks':
        sid = str(qs.get('sessionId') or '')
        return finish(tasks_report(cur, uid, int(sid) if sid.isdigit() else 0))

    if method == 'GET':
        return finish(
            {
                'items': read_items(cur, uid),
                'sessions': read_sessions(cur, uid),
                'tasks': owner_tasks(cur, uid),
                'technicians': owner_technicians(cur, uid),
            }
        )

    body = json.loads(event.get('body') or '{}')
    action = body.get('action', '')

    if method == 'DELETE':
        cur.execute(f"DELETE FROM equipment WHERE user_id = {uid} AND id = {q(body.get('id', ''))}")
        return finish({'ok': True, 'items': read_items(cur, uid)})

    if action == 'create_task':
        description = str(body.get('description') or '').strip()[:2000]
        if not description:
            return finish({'error': 'empty_description'}, 400)
        techs = owner_technicians(cur, uid)
        tech_id = body.get('technicianId')
        tech_sql = 'NULL'
        if tech_id:
            if int(tech_id) not in {t['id'] for t in techs}:
                return finish({'error': 'bad_technician'}, 400)
            tech_sql = str(int(tech_id))
        eid = str(body.get('equipmentId') or '').strip()
        eq_sql = 'NULL'
        if eid:
            cur.execute(f'SELECT 1 FROM equipment WHERE user_id = {uid} AND id = {q(eid)}')
            if cur.fetchone():
                eq_sql = q(eid)
        priority = body.get('priority') if body.get('priority') in PRIORITIES else 'normal'
        photos = upload_photos(body.get('photos'), f'{uid}-{uuid.uuid4().hex[:6]}')
        cur.execute(
            'INSERT INTO equipment_tasks (user_id, equipment_id, technician_id, created_by, description, photos, priority) '
            f"VALUES ({uid}, {eq_sql}, {tech_sql}, {int(me['id'])}, {q(description)}, {q(json.dumps(photos))}::jsonb, {q(priority)})"
        )
        return finish({'ok': True, 'tasks': owner_tasks(cur, uid)})

    if action == 'cancel_task':
        cur.execute(
            "UPDATE equipment_tasks SET status = 'cancelled', done_at = NOW(), "
            f"done_by = {int(me['id'])} WHERE user_id = {uid} AND id = {int(body.get('taskId') or 0)} "
            "AND status = 'open'"
        )
        return finish({'ok': True, 'tasks': owner_tasks(cur, uid)})

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

    if action == 'send_repair':
        eid = str(body.get('id') or '')
        description = str(body.get('description') or '').strip()[:1000]
        cur.execute(
            'UPDATE equipment SET in_repair = TRUE, repair_sent_at = NOW(), updated_at = NOW() '
            f"WHERE user_id = {uid} AND id = {q(eid)} AND active = TRUE AND in_repair = FALSE RETURNING id"
        )
        if cur.fetchone():
            photos = []
            for raw in (body.get('photos') or [])[:4]:
                if isinstance(raw, str) and raw.startswith('data:image/'):
                    photos.append(upload_image(raw, f'{uid}-{eid}', 'repairs'))
            cur.execute(
                'INSERT INTO equipment_repairs (user_id, equipment_id, sent_at, description, photos) '
                f'VALUES ({uid}, {q(eid)}, NOW(), {q(description)}, {q(json.dumps(photos))}::jsonb)'
            )
        return finish({'ok': True, 'items': read_items(cur, uid)})

    if action == 'return_repair':
        return_repair(cur, uid, body, int(me['id']))
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
        active = [i for i in items if i['active'] and not i['inRepair']]
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