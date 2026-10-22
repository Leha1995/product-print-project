import datetime
import html
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BOSS_ROLES = ('admin', 'manager', 'superadmin')
REPORT_HOUR = 23
DEFAULT_TZ = -180
SUMMARY_BUTTON = [{
    'type': 'inline_keyboard',
    'payload': {'buttons': [[{'type': 'callback', 'text': '📊 Сводка по точкам', 'payload': 'summary'}]]},
}]


def esc(value) -> str:
    return html.escape(str(value or ''), quote=False)


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def ids_sql(ids) -> str:
    return ', '.join(str(int(i)) for i in ids) or '0'


def money(value) -> str:
    return f'{round(float(value or 0)):,}'.replace(',', ' ') + ' ₽'


def send_max(max_user_id, text: str, with_button: bool = True) -> None:
    token = os.environ.get('MAX_BOT_TOKEN', '').strip()
    if not token:
        return
    body = {'text': text[:3900], 'format': 'html'}
    if with_button:
        body['attachments'] = SUMMARY_BUTTON
    req = urllib.request.Request(
        f'https://platform-api.max.ru/messages?user_id={int(max_user_id)}',
        data=json.dumps(body).encode(),
        headers={'Authorization': token, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        urllib.request.urlopen(req, timeout=3).read()
    except Exception as err:
        print(f'max send failed {max_user_id}: {err}')


def send_tg(chat_id, text: str) -> None:
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
    if not token:
        return
    req = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/sendMessage',
        data=json.dumps({'chat_id': chat_id, 'text': text[:4000], 'parse_mode': 'HTML',
                         'disable_web_page_preview': True}).encode(),
        headers={'Content-Type': 'application/json'},
    )
    try:
        urllib.request.urlopen(req, timeout=2.5).read()
    except Exception as err:
        print(f'telegram send failed {chat_id}: {err}')


DEFAULT_TIME = '23:00'


def boss_tz(cur, uid: int) -> int:
    cur.execute(f'SELECT tz_offset FROM report_settings WHERE user_id = {int(uid)}')
    row = cur.fetchone()
    if row and row[0] is not None:
        return int(row[0])
    cur.execute(f'SELECT tz_offset FROM staff_tasks WHERE created_by = {int(uid)} ORDER BY id DESC LIMIT 1')
    row = cur.fetchone()
    return int(row[0]) if row and row[0] is not None else DEFAULT_TZ


def report_settings(cur, uid: int) -> dict:
    cur.execute(f'SELECT report_time, enabled FROM report_settings WHERE user_id = {int(uid)}')
    row = cur.fetchone()
    return {'time': row[0] if row else DEFAULT_TIME, 'enabled': bool(row[1]) if row else True}


def save_report_settings(cur, uid: int, time_str: str, enabled: bool, tz: int) -> dict:
    cur.execute(
        'INSERT INTO report_settings (user_id, report_time, enabled, tz_offset, updated_at) '
        f'VALUES ({int(uid)}, {q(time_str)}, {"TRUE" if enabled else "FALSE"}, {int(tz)}, NOW()) '
        'ON CONFLICT (user_id) DO UPDATE SET report_time = EXCLUDED.report_time, enabled = EXCLUDED.enabled, '
        'tz_offset = EXCLUDED.tz_offset, updated_at = NOW()'
    )
    now = local_now(tz)
    if now.strftime('%H:%M') >= time_str:
        cur.execute(
            f"INSERT INTO daily_reports (user_id, day) VALUES ({int(uid)}, {q(now.strftime('%Y-%m-%d'))}) "
            'ON CONFLICT (user_id, day) DO NOTHING'
        )
    return report_settings(cur, uid)


def local_now(tz: int) -> datetime.datetime:
    return datetime.datetime.utcnow() - datetime.timedelta(minutes=tz)


def boss_points(cur, uid: int, role: str) -> list:
    """Точки (админы), за которые отвечает руководитель."""
    if role == 'superadmin':
        cur.execute("SELECT id FROM app_users WHERE active AND role = 'admin' ORDER BY id")
    elif role == 'manager':
        cur.execute(f"SELECT id FROM app_users WHERE active AND role = 'admin' AND manager_id = {int(uid)} ORDER BY id")
    else:
        return [int(uid)]
    return [r[0] for r in cur.fetchall()]


def names(cur, ids) -> dict:
    if not ids:
        return {}
    cur.execute(f"SELECT id, COALESCE(NULLIF(full_name, ''), username) FROM app_users WHERE id IN ({ids_sql(ids)})")
    return {r[0]: r[1] or '' for r in cur.fetchall()}


def staff_stats(cur, points: list, day: str, hhmm: str, final: bool, day_end_utc) -> dict:
    """Задания сотрудникам по точкам за день: выполнено, просрочено, ещё в работе."""
    cur.execute(f"SELECT id, manager_id FROM app_users WHERE active AND manager_id IN ({ids_sql(points)})")
    owner = {int(p): int(p) for p in points}
    for uid, mid in cur.fetchall():
        owner[int(uid)] = int(mid)
    stats = {int(p): {'done': 0, 'late': 0, 'wait': 0, 'lateList': []} for p in points}
    cur.execute(
        'SELECT t.id, t.title, t.kind, t.end_time, t.task_date, t.assignee_id, t.created_at, '
        "COALESCE(NULLIF(a.full_name, ''), a.username) FROM staff_tasks t JOIN app_users a ON a.id = t.assignee_id "
        f"WHERE t.active AND a.active AND t.assignee_id IN ({ids_sql(owner.keys())}) "
        f"AND (t.kind = 'daily' OR t.task_date = {q(day)})"
    )
    rows = [r for r in cur.fetchall() if not r[6] or r[6] <= day_end_utc]
    if not rows:
        return stats
    cur.execute(f'SELECT task_id, day FROM staff_task_done WHERE task_id IN ({ids_sql([r[0] for r in rows])})')
    marks = cur.fetchall()
    done_day = {(m[0], m[1]) for m in marks}
    done_any = {m[0] for m in marks}
    for tid, title, kind, end, _tdate, assignee, _created, person in rows:
        st = stats.get(owner.get(int(assignee)))
        if st is None:
            continue
        is_done = tid in done_any if kind == 'once' else (tid, day) in done_day
        if is_done:
            st['done'] += 1
        elif final or (end and end <= hhmm):
            st['late'] += 1
            st['lateList'].append(f'{person}: {title}')
        else:
            st['wait'] += 1
    return stats


def equipment_stats(cur, points: list, start_utc, end_utc) -> dict:
    stats = {int(p): {'done': 0, 'spent': 0.0, 'open': 0} for p in points}
    cur.execute(
        'SELECT user_id, COUNT(*), COALESCE(SUM(cost), 0) FROM equipment_tasks '
        f"WHERE status = 'done' AND user_id IN ({ids_sql(points)}) "
        f"AND done_at >= {q(start_utc.strftime('%Y-%m-%d %H:%M:%S'))} AND done_at < {q(end_utc.strftime('%Y-%m-%d %H:%M:%S'))} "
        'GROUP BY user_id'
    )
    for uid, cnt, spent in cur.fetchall():
        stats[int(uid)]['done'] = int(cnt)
        stats[int(uid)]['spent'] = float(spent or 0)
    cur.execute(
        f"SELECT user_id, COUNT(*) FROM equipment_tasks WHERE status = 'open' AND user_id IN ({ids_sql(points)}) GROUP BY user_id"
    )
    for uid, cnt in cur.fetchall():
        stats[int(uid)]['open'] = int(cnt)
    return stats


def pending_transfers(cur, points: list) -> int:
    cur.execute(
        "SELECT COUNT(*) FROM equipment_transfers WHERE status = 'pending' "
        f'AND (to_user IN ({ids_sql(points)}) OR from_user IN ({ids_sql(points)}))'
    )
    return int(cur.fetchone()[0] or 0)


def build_report(cur, uid: int, role: str, final: bool) -> str:
    tz = boss_tz(cur, uid)
    now = local_now(tz)
    day = now.strftime('%Y-%m-%d')
    start_utc = datetime.datetime.strptime(day, '%Y-%m-%d') + datetime.timedelta(minutes=tz)
    end_utc = start_utc + datetime.timedelta(days=1)
    points = boss_points(cur, uid, role)
    title = f"{'🌙 Итоги дня' if final else '📊 Сводка за день'} · {now.strftime('%d.%m.%Y')}"
    if not final:
        title += f" на {now.strftime('%H:%M')}"
    if not points:
        return f'<b>{title}</b>\n\nЗа вами пока не закреплено ни одной точки.'
    point_names = names(cur, points)
    staff = staff_stats(cur, points, day, now.strftime('%H:%M'), final, end_utc)
    equip = equipment_stats(cur, points, start_utc, end_utc)
    tot = {'done': 0, 'late': 0, 'wait': 0, 'eq': 0, 'spent': 0.0, 'open': 0}
    blocks = []
    for p in sorted(points, key=lambda i: point_names.get(i, '').lower()):
        s, e = staff[p], equip[p]
        tot['done'] += s['done']
        tot['late'] += s['late']
        tot['wait'] += s['wait']
        tot['eq'] += e['done']
        tot['spent'] += e['spent']
        tot['open'] += e['open']
        if not (s['done'] or s['late'] or s['wait'] or e['done'] or e['open']):
            continue
        lines = [f"📍 <b>{esc(point_names.get(p, ''))}</b>"]
        if s['done'] or s['late'] or s['wait']:
            part = f"   Задания: ✅ {s['done']} · ⏰ {s['late']}"
            if s['wait']:
                part += f" · ⏳ {s['wait']}"
            lines.append(part)
            for item in s['lateList'][:3]:
                lines.append(f'   — {esc(item[:120])}')
            if len(s['lateList']) > 3:
                lines.append(f"   — и ещё {len(s['lateList']) - 3}")
        if e['done'] or e['open']:
            lines.append(f"   Техники: выполнено {e['done']} · {money(e['spent'])} · открыто {e['open']}")
        blocks.append('\n'.join(lines))
    transfers = pending_transfers(cur, points)
    head = (
        f'<b>{title}</b>\n'
        f"Точек: {len(points)}\n\n"
        f"👥 Задания сотрудникам: выполнено <b>{tot['done']}</b>, просрочено <b>{tot['late']}</b>"
        + (f", в работе {tot['wait']}" if tot['wait'] else '') + '\n'
        f"🛠 Техники: выполнено {tot['eq']}, потрачено {money(tot['spent'])}, открытых заявок {tot['open']}\n"
        + (f'📦 Передач ждут подтверждения: {transfers}\n' if transfers else '')
    )
    body = '\n\n'.join(blocks) if blocks else 'Сегодня по точкам не было заданий и заявок.'
    return (head + '\n' + body)[:3900]


def linked_bosses(cur) -> list:
    cur.execute(
        'SELECT u.id, u.role, m.max_user_id, t.chat_id FROM app_users u '
        'LEFT JOIN max_links m ON m.user_id = u.id LEFT JOIN telegram_links t ON t.user_id = u.id '
        f"WHERE u.active AND u.role IN ({', '.join(q(r) for r in BOSS_ROLES)}) "
        'AND (m.user_id IS NOT NULL OR t.user_id IS NOT NULL)'
    )
    return cur.fetchall()


def send_daily_reports(cur, limit: int = 8) -> int:
    """Отправляет сводку руководителям в выбранное ими время (по умолчанию 23:00) — один раз за день."""
    if not os.environ.get('MAX_BOT_TOKEN', '').strip() and not os.environ.get('TELEGRAM_BOT_TOKEN', '').strip():
        return 0
    jobs = []
    for uid, role, max_uid, chat_id in linked_bosses(cur):
        if len(jobs) >= limit:
            break
        cfg = report_settings(cur, uid)
        if not cfg['enabled']:
            continue
        now = local_now(boss_tz(cur, uid))
        if now.strftime('%H:%M') < cfg['time']:
            continue
        day = now.strftime('%Y-%m-%d')
        cur.execute(
            f'INSERT INTO daily_reports (user_id, day) VALUES ({int(uid)}, {q(day)}) '
            'ON CONFLICT (user_id, day) DO NOTHING RETURNING user_id'
        )
        if not cur.fetchone():
            continue
        try:
            text = build_report(cur, int(uid), role, cfg['time'] >= '22:00')
        except Exception as err:
            print(f'report build failed {uid}: {err}')
            continue
        if max_uid:
            jobs.append(lambda m=max_uid, t=text: send_max(m, t))
        if chat_id:
            jobs.append(lambda c=chat_id, t=text: send_tg(c, t))
    if jobs:
        with ThreadPoolExecutor(max_workers=min(8, len(jobs))) as pool:
            list(pool.map(lambda job: job(), jobs))
    return len(jobs)


def reports_due(cur) -> bool:
    """Быстрая проверка: есть ли руководитель, чьё время сводки уже наступило, а сводка не ушла."""
    for uid, _role, _m, _c in linked_bosses(cur):
        cfg = report_settings(cur, uid)
        if not cfg['enabled']:
            continue
        now = local_now(boss_tz(cur, uid))
        if now.strftime('%H:%M') < cfg['time']:
            continue
        cur.execute(f"SELECT 1 FROM daily_reports WHERE user_id = {int(uid)} AND day = {q(now.strftime('%Y-%m-%d'))}")
        if not cur.fetchone():
            return True
    return False
