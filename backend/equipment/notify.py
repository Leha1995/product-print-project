import html
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

PRIORITY_LABEL = {
    'urgent': '🔴 ОЧЕНЬ СРОЧНО',
    'soon': '🟡 Побыстрее',
    'normal': '🟢 Не срочно',
}


def esc(value) -> str:
    return html.escape(str(value or ''), quote=False)


def _send(chat_id: int, text: str) -> None:
    token = os.environ.get('TELEGRAM_BOT_TOKEN', '').strip()
    req = urllib.request.Request(
        f'https://api.telegram.org/bot{token}/sendMessage',
        data=json.dumps({
            'chat_id': chat_id,
            'text': text[:4000],
            'parse_mode': 'HTML',
            'disable_web_page_preview': True,
        }).encode(),
        headers={'Content-Type': 'application/json'},
    )
    try:
        urllib.request.urlopen(req, timeout=2.5).read()
    except Exception as err:
        print(f'telegram send failed {chat_id}: {err}')


def send_to_users(cur, user_ids, text: str) -> None:
    ids = sorted({int(i) for i in user_ids if i})
    if not ids or not os.environ.get('TELEGRAM_BOT_TOKEN', '').strip():
        return
    cur.execute(
        'SELECT l.chat_id FROM telegram_links l JOIN app_users u ON u.id = l.user_id '
        "WHERE u.active AND u.role IN ('admin', 'manager', 'technician', 'superadmin') "
        f"AND l.user_id IN ({', '.join(str(i) for i in ids)})"
    )
    chats = sorted({r[0] for r in cur.fetchall()})
    if not chats:
        return
    with ThreadPoolExecutor(max_workers=min(8, len(chats))) as pool:
        list(pool.map(lambda c: _send(c, text), chats))


def point_name(cur, uid: int) -> str:
    cur.execute(f"SELECT COALESCE(NULLIF(full_name, ''), username) FROM app_users WHERE id = {int(uid)}")
    row = cur.fetchone()
    return row[0] if row else ''


def equipment_line(cur, uid: int, eid) -> str:
    if not eid:
        return ''
    cur.execute(
        'SELECT name, location FROM equipment WHERE user_id = '
        f"{int(uid)} AND id = '{str(eid).replace(chr(39), chr(39) * 2)}'"
    )
    row = cur.fetchone()
    if not row:
        return ''
    return ' · '.join(filter(None, [row[0], row[1]]))


def notify_new_task(cur, uid: int, task_id: int, description: str, priority: str, eid, tech_id, techs) -> None:
    targets = [int(tech_id)] if tech_id else [t['id'] for t in techs]
    eq = equipment_line(cur, uid, eid)
    text = (
        f'🛠 <b>Новая задача №{int(task_id)}</b>\n'
        f'{PRIORITY_LABEL.get(priority, PRIORITY_LABEL["normal"])}\n'
        f'📍 Точка: {esc(point_name(cur, uid))}\n'
        + (f'⚙️ Оборудование: {esc(eq)}\n' if eq else '')
        + f'\n{esc(description[:1500])}'
    )
    send_to_users(cur, targets, text)


def notify_repair(cur, uid: int, eid, description: str, techs) -> None:
    eq = equipment_line(cur, uid, eid) or str(eid)
    text = (
        '🔧 <b>Оборудование отправлено в ремонт</b>\n'
        f'📍 Точка: {esc(point_name(cur, uid))}\n'
        f'⚙️ {esc(eq)}\n'
        + (f'\nПоломка: {esc(description[:1500])}' if description else '\nОписание поломки не указано')
    )
    send_to_users(cur, [t['id'] for t in techs], text)


def notify_task_done(cur, task_id: int) -> None:
    cur.execute(
        'SELECT t.user_id, t.created_by, t.description, t.done_comment, t.cost, t.equipment_id, '
        "COALESCE(NULLIF(du.full_name, ''), du.username) "
        'FROM equipment_tasks t LEFT JOIN app_users du ON du.id = t.done_by '
        f'WHERE t.id = {int(task_id)}'
    )
    row = cur.fetchone()
    if not row:
        return
    uid, created_by, description, comment, cost, eid, done_by = row
    title = (description or '').split('\n')[0][:200]
    eq = equipment_line(cur, uid, eid)
    cost_text = f'{round(float(cost or 0)):,}'.replace(',', ' ')
    text = (
        f'✅ <b>Задача №{int(task_id)} выполнена</b>\n'
        f'📍 Точка: {esc(point_name(cur, uid))}\n'
        + (f'⚙️ Оборудование: {esc(eq)}\n' if eq else '')
        + f'📝 {esc(title)}\n'
        f'👷 Выполнил: {esc(done_by)}\n'
        f'💰 Потрачено: {cost_text} ₽'
        + (f'\n\nЧто сделано: {esc(comment[:1500])}' if comment else '')
    )
    send_to_users(cur, [uid, created_by], text)
