import html
import json
import os
import urllib.request
from concurrent.futures import ThreadPoolExecutor

BOSS_ROLES = ('admin', 'manager', 'superadmin')


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


def _send_max(max_user_id: int, text: str) -> None:
    token = os.environ.get('MAX_BOT_TOKEN', '').strip()
    req = urllib.request.Request(
        f'https://platform-api.max.ru/messages?user_id={int(max_user_id)}',
        data=json.dumps({'text': text[:3900], 'format': 'html'}).encode(),
        headers={'Authorization': token, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        urllib.request.urlopen(req, timeout=2.5).read()
    except Exception as err:
        print(f'max send failed {max_user_id}: {err}')


def send_max_to_users(cur, ids, roles_sql: str, text: str) -> None:
    if not ids or not os.environ.get('MAX_BOT_TOKEN', '').strip():
        return
    try:
        cur.execute(
            'SELECT DISTINCT l.max_user_id FROM max_links l JOIN app_users u ON u.id = l.user_id '
            f"WHERE u.active AND u.role IN ({roles_sql}) "
            f"AND l.user_id IN ({', '.join(str(int(i)) for i in ids)})"
        )
    except Exception as err:
        print(f'max links read failed: {err}')
        return
    targets = [r[0] for r in cur.fetchall()]
    if not targets:
        return
    with ThreadPoolExecutor(max_workers=min(8, len(targets))) as pool:
        list(pool.map(lambda t: _send_max(t, text), targets))


def bosses_of(cur, assignee_id: int, creator_id: int) -> list:
    """Кому сообщать: кто поставил задание, админ сотрудника и управляющий над этим админом."""
    ids = {int(creator_id)}
    cur.execute(f'SELECT role, manager_id FROM app_users WHERE id = {int(assignee_id)}')
    row = cur.fetchone()
    if row and row[1]:
        ids.add(int(row[1]))
        if row[0] == 'user':
            cur.execute(f"SELECT manager_id FROM app_users WHERE id = {int(row[1])} AND role = 'admin'")
            head = cur.fetchone()
            if head and head[0]:
                ids.add(int(head[0]))
    ids.discard(int(assignee_id))
    return sorted(ids)


def send_to_bosses(cur, user_ids, text: str) -> None:
    ids = sorted({int(i) for i in user_ids if i})
    send_max_to_users(cur, ids, ', '.join(repr(r) for r in BOSS_ROLES), text)
    if not ids or not os.environ.get('TELEGRAM_BOT_TOKEN', '').strip():
        return
    cur.execute(
        'SELECT DISTINCT l.chat_id FROM telegram_links l JOIN app_users u ON u.id = l.user_id '
        f"WHERE u.active AND u.role IN ({', '.join(repr(r) for r in BOSS_ROLES)}) "
        f"AND l.user_id IN ({', '.join(str(i) for i in ids)})"
    )
    chats = [r[0] for r in cur.fetchall()]
    if not chats:
        return
    with ThreadPoolExecutor(max_workers=min(8, len(chats))) as pool:
        list(pool.map(lambda c: _send(c, text), chats))


def overdue_text(task: dict, day_label: str) -> str:
    when = f"до {task['endTime']}" if task.get('endTime') else 'в свой день'
    return (
        '⏰ <b>Задание не выполнено в срок</b>\n'
        f"👤 Сотрудник: {esc(task['assigneeName'])}\n"
        f"📋 {esc(task['title'])}\n"
        + (f"📝 {esc(task['note'][:500])}\n" if task.get('note') else '')
        + f'🕒 Нужно было {when} · {esc(day_label)}'
    )
