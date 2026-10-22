import datetime
import json
import os
import re

import psycopg2

from notify import bosses_of, overdue_text, send_to_bosses

CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json',
}

BOSS_ROLES = ('admin', 'manager', 'superadmin')
ASSIGNABLE_ROLES = ('user', 'admin', 'manager')
TUNES = ('march', 'chime', 'waltz', 'beep', 'siren', 'funeral', 'dark')
DAY_RE = re.compile(r'^\d{4}-\d{2}-\d{2}$')
TIME_RE = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def ids_sql(ids) -> str:
    return ', '.join(str(int(i)) for i in ids) or '0'


def session_user(cur, token: str):
    if not token:
        return None
    cur.execute(
        'SELECT u.id, u.username, u.role, u.active FROM app_sessions s '
        f'JOIN app_users u ON u.id = s.user_id WHERE s.token = {q(token)} AND s.expires_at > NOW()'
    )
    row = cur.fetchone()
    if not row or not row[3]:
        return None
    return {'id': row[0], 'username': row[1], 'role': row[2]}


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
    cur.execute(f'SELECT user_id FROM structure_members WHERE structure_id = {int(sid)}')
    return [r[0] for r in cur.fetchall()] + [int(me['id'])]


def managed_ids(cur, me, members):
    """Кому текущий руководитель может ставить задания."""
    role = me['role']
    if role == 'superadmin':
        cur.execute('SELECT id FROM app_users WHERE active')
        ids = [r[0] for r in cur.fetchall()]
    elif role == 'manager':
        cur.execute(f"SELECT id FROM app_users WHERE active AND role = 'admin' AND manager_id = {int(me['id'])}")
        admins = [r[0] for r in cur.fetchall()]
        ids = list(admins) + [int(me['id'])]
        if admins:
            cur.execute(f"SELECT id FROM app_users WHERE active AND role = 'user' AND manager_id IN ({ids_sql(admins)})")
            ids += [r[0] for r in cur.fetchall()]
    elif role == 'admin':
        cur.execute(f"SELECT id FROM app_users WHERE active AND (manager_id = {int(me['id'])} OR id = {int(me['id'])})")
        ids = [r[0] for r in cur.fetchall()]
    else:
        return []
    if members is not None:
        allowed = set(members)
        ids = [i for i in ids if i in allowed]
    if not ids:
        return []
    cur.execute(
        f"SELECT id FROM app_users WHERE id IN ({ids_sql(ids)}) AND role IN ({', '.join(q(r) for r in ASSIGNABLE_ROLES)})"
    )
    return [r[0] for r in cur.fetchall()]


def task_rows(cur, where: str, day: str):
    cur.execute(
        'SELECT t.id, t.title, t.note, t.kind, t.start_time, t.task_date, t.interval_min, t.tune, '
        't.assignee_id, COALESCE(NULLIF(a.full_name, \'\'), a.username), '
        'COALESCE(NULLIF(c.full_name, \'\'), c.username), t.created_at, t.end_time '
        'FROM staff_tasks t LEFT JOIN app_users a ON a.id = t.assignee_id '
        'LEFT JOIN app_users c ON c.id = t.created_by '
        f'WHERE t.active AND {where} ORDER BY t.start_time, t.id'
    )
    rows = cur.fetchall()
    ids = [r[0] for r in rows]
    done = {}
    if ids:
        cur.execute(
            'SELECT d.task_id, d.day, d.done_at, COALESCE(NULLIF(u.full_name, \'\'), u.username) '
            'FROM staff_task_done d LEFT JOIN app_users u ON u.id = d.done_by '
            f'WHERE d.task_id IN ({ids_sql(ids)}) ORDER BY d.done_at'
        )
        for tid, dday, done_at, name in cur.fetchall():
            done.setdefault(tid, {})[dday] = {'at': done_at.isoformat() + 'Z' if done_at else None, 'by': name or ''}
    result = []
    for r in rows:
        marks = done.get(r[0], {})
        if r[3] == 'once':
            mark = next(iter(marks.values()), None)
        else:
            mark = marks.get(day)
        result.append({
            'id': r[0],
            'title': r[1],
            'note': r[2],
            'kind': r[3],
            'startTime': r[4],
            'endTime': r[12] or None,
            'date': r[5],
            'intervalMin': r[6],
            'tune': r[7],
            'assigneeId': r[8],
            'assigneeName': r[9] or '',
            'createdByName': r[10] or '',
            'doneAt': mark['at'] if mark else None,
            'doneBy': mark['by'] if mark else '',
        })
    return result


def mine(cur, me, day: str):
    tasks = task_rows(cur, f"t.assignee_id = {int(me['id'])} AND (t.kind = 'daily' OR t.task_date <= {q(day)})", day)
    return [t for t in tasks if t['kind'] == 'daily' or not t['doneAt'] or (t['doneAt'] and t['date'] == day)]


def clean_task(body: dict):
    title = str(body.get('title') or '').strip()[:200]
    note = str(body.get('note') or '').strip()[:1000]
    kind = 'once' if body.get('kind') == 'once' else 'daily'
    start = str(body.get('startTime') or '')
    date = str(body.get('date') or '')
    tune = str(body.get('tune') or 'beep')
    try:
        interval = int(body.get('intervalMin') or 5)
    except (TypeError, ValueError):
        interval = 5
    try:
        tz = max(-840, min(840, int(body.get('tzOffset'))))
    except (TypeError, ValueError):
        tz = -180
    end = str(body.get('endTime') or '')
    if not title or not TIME_RE.match(start):
        return None
    if end and (not TIME_RE.match(end) or end <= start):
        return None
    if kind == 'once' and not DAY_RE.match(date):
        return None
    return {
        'title': title,
        'note': note,
        'kind': kind,
        'start_time': start,
        'end_time': end or None,
        'task_date': date if kind == 'once' else None,
        'interval_min': max(1, min(120, interval)),
        'tune': tune if tune in TUNES else 'beep',
        'tz_offset': tz,
    }


def check_overdue(cur, limit: int = 15) -> None:
    """Находит просроченные невыполненные задания и один раз сообщает руководителям в Telegram."""
    if not os.environ.get('TELEGRAM_BOT_TOKEN', '').strip():
        return
    utc_now = datetime.datetime.utcnow()
    cur.execute(
        'SELECT t.id, t.title, t.note, t.kind, t.start_time, t.end_time, t.task_date, t.tz_offset, '
        't.assignee_id, t.created_by, t.created_at, COALESCE(NULLIF(a.full_name, \'\'), a.username) '
        'FROM staff_tasks t JOIN app_users a ON a.id = t.assignee_id '
        "WHERE t.active AND a.active AND (t.end_time IS NOT NULL OR t.kind = 'once')"
    )
    candidates = []
    for row in cur.fetchall():
        tid, title, note, kind, _start, end, tdate, tz, assignee, creator, created_at, name = row
        local = utc_now - datetime.timedelta(minutes=int(tz or 0))
        today = local.strftime('%Y-%m-%d')
        hhmm = local.strftime('%H:%M')
        if kind == 'once':
            if not tdate or tdate > today:
                continue
            day = tdate
            if tdate == today and (not end or hhmm < end):
                continue
        else:
            if not end or hhmm < end:
                continue
            day = today
        deadline_local = datetime.datetime.strptime(f"{day} {end or '23:59'}", '%Y-%m-%d %H:%M')
        if created_at and created_at > deadline_local + datetime.timedelta(minutes=int(tz or 0)):
            continue
        candidates.append({
            'id': tid, 'kind': kind, 'title': title, 'note': note or '', 'endTime': end, 'day': day,
            'assigneeId': assignee, 'createdBy': creator, 'assigneeName': name or '',
        })
    if not candidates:
        return
    ids = ids_sql([c['id'] for c in candidates])
    cur.execute(f'SELECT task_id, day FROM staff_task_done WHERE task_id IN ({ids})')
    done = {(r[0], r[1]) for r in cur.fetchall()}
    done_once = {r[0] for r in done}
    cur.execute(f'SELECT task_id, day FROM staff_task_alerts WHERE task_id IN ({ids})')
    sent = {(r[0], r[1]) for r in cur.fetchall()}
    sent_count = 0
    for c in candidates:
        if sent_count >= limit:
            break
        key = (c['id'], c['day'])
        if key in sent or key in done:
            continue
        if c['kind'] == 'once' and c['id'] in done_once:
            continue
        cur.execute(
            f"INSERT INTO staff_task_alerts (task_id, day) VALUES ({int(c['id'])}, {q(c['day'])}) "
            'ON CONFLICT (task_id, day) DO NOTHING RETURNING task_id'
        )
        if not cur.fetchone():
            continue
        sent_count += 1
        y, m, d = c['day'].split('-')
        try:
            send_to_bosses(cur, bosses_of(cur, c['assigneeId'], c['createdBy']), overdue_text(c, f'{d}.{m}.{y}'))
        except Exception as err:
            print(f'overdue notify failed {c["id"]}: {err}')


def handler(event: dict, context) -> dict:
    """Задания сотрудникам: ежедневные и разовые, со звуковым сигналом до подтверждения выполнения."""
    method = event.get('httpMethod', 'GET')
    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    headers = event.get('headers') or {}
    token = headers.get('X-Auth-Token') or headers.get('x-auth-token') or ''
    params = event.get('queryStringParameters') or {}

    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    conn.autocommit = True
    cur = conn.cursor()

    def finish(payload: dict, status: int = 200):
        cur.close()
        conn.close()
        return {'statusCode': status, 'headers': CORS, 'body': json.dumps(payload, ensure_ascii=False)}

    me = session_user(cur, token)
    if not me:
        return finish({'error': 'unauthorized'}, 401)

    body = json.loads(event.get('body') or '{}') if method == 'POST' else {}
    day = str(body.get('day') or params.get('day') or '')
    if not DAY_RE.match(day):
        return finish({'error': 'invalid_day'}, 400)

    is_boss = me['role'] in BOSS_ROLES
    if method == 'GET':
        try:
            check_overdue(cur)
        except Exception as err:
            print(f'check_overdue failed: {err}')

    def payload():
        data = {'mine': mine(cur, me, day), 'canManage': is_boss}
        if is_boss:
            members = structure_members(cur, token, me)
            ids = managed_ids(cur, me, members)
            data['manage'] = task_rows(cur, f'(t.assignee_id IN ({ids_sql(ids)}) OR t.created_by = {int(me["id"])})', day)
            cur.execute(
                f"SELECT id, COALESCE(NULLIF(full_name, ''), username), role FROM app_users WHERE id IN ({ids_sql(ids)}) "
                'ORDER BY role DESC, 2'
            )
            data['assignees'] = [{'id': r[0], 'name': r[1], 'role': r[2]} for r in cur.fetchall()]
        return data

    if method == 'GET':
        return finish(payload())

    action = body.get('action')

    if action == 'done':
        tid = int(body.get('taskId') or 0)
        cur.execute(f"SELECT kind FROM staff_tasks WHERE id = {tid} AND active AND assignee_id = {int(me['id'])}")
        row = cur.fetchone()
        if not row:
            return finish({'error': 'not_found'}, 404)
        cur.execute(
            f"INSERT INTO staff_task_done (task_id, day, done_by) VALUES ({tid}, {q(day)}, {int(me['id'])}) "
            'ON CONFLICT (task_id, day) DO NOTHING'
        )
        return finish(payload())

    if not is_boss:
        return finish({'error': 'forbidden'}, 403)

    members = structure_members(cur, token, me)
    allowed = managed_ids(cur, me, members)

    if action in ('create', 'update'):
        task = clean_task(body)
        if not task:
            return finish({'error': 'invalid_input'}, 400)
        raw_ids = body.get('assigneeIds')
        if not isinstance(raw_ids, list):
            raw_ids = [body.get('assigneeId')]
        assignees = []
        for value in raw_ids:
            try:
                uid = int(value or 0)
            except (TypeError, ValueError):
                continue
            if uid and uid not in assignees:
                assignees.append(uid)
        if not assignees:
            return finish({'error': 'invalid_input'}, 400)
        if any(uid not in allowed for uid in assignees):
            return finish({'error': 'forbidden'}, 403)
        assignee = assignees[0]
        date_sql = q(task['task_date']) if task['task_date'] else 'NULL'
        end_sql = q(task['end_time']) if task['end_time'] else 'NULL'
        if action == 'create':
            values = ', '.join(
                f"({int(me['id'])}, {uid}, {q(task['title'])}, {q(task['note'])}, {q(task['kind'])}, "
                f"{q(task['start_time'])}, {end_sql}, {date_sql}, {task['interval_min']}, {q(task['tune'])}, {task['tz_offset']})"
                for uid in assignees[:100]
            )
            cur.execute(
                'INSERT INTO staff_tasks (created_by, assignee_id, title, note, kind, start_time, end_time, task_date, interval_min, tune, tz_offset) '
                f'VALUES {values}'
            )
        else:
            tid = int(body.get('taskId') or 0)
            cur.execute(f'SELECT assignee_id, created_by FROM staff_tasks WHERE id = {tid} AND active')
            row = cur.fetchone()
            if not row or (row[0] not in allowed and row[1] != me['id']):
                return finish({'error': 'not_found'}, 404)
            cur.execute(
                f"UPDATE staff_tasks SET assignee_id = {assignee}, title = {q(task['title'])}, note = {q(task['note'])}, "
                f"kind = {q(task['kind'])}, start_time = {q(task['start_time'])}, end_time = {end_sql}, task_date = {date_sql}, "
                f"interval_min = {task['interval_min']}, tune = {q(task['tune'])}, tz_offset = {task['tz_offset']} WHERE id = {tid}"
            )
        return finish(payload())

    if action == 'delete':
        tid = int(body.get('taskId') or 0)
        cur.execute(f'SELECT assignee_id, created_by FROM staff_tasks WHERE id = {tid} AND active')
        row = cur.fetchone()
        if not row or (row[0] not in allowed and row[1] != me['id']):
            return finish({'error': 'not_found'}, 404)
        cur.execute(f'UPDATE staff_tasks SET active = FALSE WHERE id = {tid}')
        return finish(payload())

    return finish({'error': 'unknown_action'}, 400)
