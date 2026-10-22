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


def task_keyboard(task_id: int) -> list:
    return [{'type': 'inline_keyboard', 'payload': {'buttons': [[
        {'type': 'callback', 'text': '🛠 Взял в работу', 'payload': f'take:{int(task_id)}'},
        {'type': 'callback', 'text': '✅ Выполнено', 'payload': f'done:{int(task_id)}', 'intent': 'positive'},
    ]]}}]


def _send_max(max_user_id: int, text: str, attachments=None) -> None:
    token = os.environ.get('MAX_BOT_TOKEN', '').strip()
    body = {'text': text[:3900], 'format': 'html'}
    if attachments:
        body['attachments'] = attachments
    req = urllib.request.Request(
        f'https://platform-api.max.ru/messages?user_id={int(max_user_id)}',
        data=json.dumps(body).encode(),
        headers={'Authorization': token, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        urllib.request.urlopen(req, timeout=2.5).read()
    except Exception as err:
        print(f'max send failed {max_user_id}: {err}')


def _send_max_photos(max_user_id: int, task_id: int, photos: list) -> None:
    attachments = [{'type': 'image', 'payload': {'url': u}} for u in photos if str(u).startswith('https://')][:4]
    if not attachments:
        return
    label = f'📷 Фото к заявке №{int(task_id)}' + (f' ({len(attachments)})' if len(attachments) > 1 else '')
    _send_max(max_user_id, label, attachments)


def send_max_to_users(cur, ids, roles_sql: str, text: str, tech_task_id=None) -> None:
    if not ids or not os.environ.get('MAX_BOT_TOKEN', '').strip():
        return
    try:
        cur.execute(
            'SELECT DISTINCT l.max_user_id, u.role FROM max_links l JOIN app_users u ON u.id = l.user_id '
            f"WHERE u.active AND u.role IN ({roles_sql}) "
            f"AND l.user_id IN ({', '.join(str(int(i)) for i in ids)})"
        )
    except Exception as err:
        print(f'max links read failed: {err}')
        return
    targets = cur.fetchall()
    if not targets:
        return
    kb = task_keyboard(tech_task_id) if tech_task_id else None
    photos = []
    if tech_task_id:
        cur.execute(f'SELECT photos FROM equipment_tasks WHERE id = {int(tech_task_id)}')
        row = cur.fetchone()
        photos = [p for p in (row[0] if row and isinstance(row[0], list) else []) if isinstance(p, str)]

    def deliver(t):
        is_tech = t[1] == 'technician'
        _send_max(t[0], text, kb if is_tech else None)
        if is_tech and photos:
            _send_max_photos(t[0], tech_task_id, photos)

    with ThreadPoolExecutor(max_workers=min(8, len(targets))) as pool:
        list(pool.map(deliver, targets))


def send_to_users(cur, user_ids, text: str, tech_task_id=None) -> None:
    ids = sorted({int(i) for i in user_ids if i})
    send_max_to_users(cur, ids, "'admin', 'manager', 'technician', 'superadmin'", text, tech_task_id)
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


ROLE_LABEL = {
    'admin': 'админ',
    'manager': 'управляющий',
    'superadmin': 'супер-админ',
    'user': 'сотрудник',
    'accountant': 'бухгалтер',
    'technician': 'техник',
}


def person(cur, uid):
    if not uid:
        return None
    cur.execute(
        f"SELECT COALESCE(NULLIF(full_name, ''), username), role, manager_id FROM app_users WHERE id = {int(uid)}"
    )
    return cur.fetchone()


def author_lines(cur, uid: int, author_id) -> str:
    """Строки «От кого» и, если нужно, «Админ точки» для уведомления технику."""
    lines = []
    author = person(cur, author_id)
    if author:
        lines.append(f'👤 От: {esc(author[0])} ({ROLE_LABEL.get(author[1], author[1])})')
    owner = person(cur, uid)
    admin_name = ''
    if owner:
        if owner[1] == 'admin':
            admin_name = owner[0]
        elif owner[2]:
            head = person(cur, owner[2])
            if head and head[1] == 'admin':
                admin_name = head[0]
    if admin_name and (not author or author[0] != admin_name):
        lines.append(f'🏢 Админ точки: {esc(admin_name)}')
    return ''.join(f'{line}\n' for line in lines)


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


def notify_new_task(cur, uid: int, task_id: int, description: str, priority: str, eid, tech_id, techs, author_id=None) -> None:
    targets = [int(tech_id)] if tech_id else [t['id'] for t in techs]
    eq = equipment_line(cur, uid, eid)
    text = (
        f'🛠 <b>Поступила заявка №{int(task_id)}</b>\n'
        f'{PRIORITY_LABEL.get(priority, PRIORITY_LABEL["normal"])}\n'
        + author_lines(cur, uid, author_id)
        + f'📍 Точка: {esc(point_name(cur, uid))}\n'
        + (f'⚙️ Оборудование: {esc(eq)}\n' if eq else '')
        + f'\n{esc(description[:1500])}'
    )
    send_to_users(cur, targets, text, task_id)


def notify_repair(cur, uid: int, eid, description: str, techs, author_id=None, task_id=None) -> None:
    eq = equipment_line(cur, uid, eid) or str(eid)
    text = (
        '🔧 <b>Оборудование отправлено в ремонт</b>\n'
        + author_lines(cur, uid, author_id)
        + f'📍 Точка: {esc(point_name(cur, uid))}\n'
        f'⚙️ {esc(eq)}\n'
        + (f'\nПоломка: {esc(description[:1500])}' if description else '\nОписание поломки не указано')
    )
    send_to_users(cur, [t['id'] for t in techs], text, task_id)


def money_text(value) -> str:
    return f'{round(float(value or 0)):,}'.replace(',', ' ') + ' ₽'


def point_bosses(cur, uid: int) -> list:
    """Админ точки и управляющий над ним."""
    ids = [int(uid)]
    cur.execute(f"SELECT manager_id FROM app_users WHERE id = {int(uid)} AND role = 'admin'")
    row = cur.fetchone()
    if row and row[0]:
        ids.append(int(row[0]))
    return ids


def month_spent(cur, uid: int) -> float:
    cur.execute(
        'SELECT COALESCE(SUM(cost), 0) FROM equipment_tasks '
        f"WHERE user_id = {int(uid)} AND status = 'done' AND done_at >= date_trunc('month', NOW())"
    )
    return float(cur.fetchone()[0] or 0)


def notify_repair_returned(cur, uid: int, eid, cost, comment: str, by_user: int) -> None:
    eq = equipment_line(cur, uid, eid) or str(eid)
    by = point_name(cur, by_user) if by_user else ''
    text = (
        '🔧✅ <b>Оборудование вернулось из ремонта</b>\n'
        f'📍 Точка: {esc(point_name(cur, uid))}\n'
        f'⚙️ {esc(eq)}\n'
        + (f'👷 Принял: {esc(by)}\n' if by else '')
        + f'💰 Сумма ремонта: {money_text(cost)}\n'
        f'📊 Расходы точки за месяц: {money_text(month_spent(cur, uid))}'
        + (f'\n\nЧто сделано: {esc(comment[:1500])}' if comment else '')
    )
    send_to_users(cur, [i for i in point_bosses(cur, uid) if i != int(by_user or 0)], text)


def notify_transfer_decided(cur, transfer_id: int, accepted: bool, decider_id: int) -> None:
    cur.execute(
        'SELECT from_user, to_user, created_by, equipment_name, equipment_price FROM equipment_transfers '
        f'WHERE id = {int(transfer_id)}'
    )
    row = cur.fetchone()
    if not row:
        return
    from_uid, to_uid, sender, name, price = row
    head = '✅ <b>Оборудование принято</b>' if accepted else '❌ <b>Передача оборудования отклонена</b>'
    text = (
        f'{head}\n'
        f'⚙️ {esc(name or "")}\n'
        + (f'💰 Стоимость: {money_text(price)}\n' if float(price or 0) > 0 else '')
        + f'📤 Откуда: {esc(point_name(cur, from_uid))}\n'
        f'📥 Куда: {esc(point_name(cur, to_uid))}\n'
        f'👤 {"Подтвердил" if accepted else "Отклонил"}: {esc(point_name(cur, decider_id))}'
        + ('\n\nОборудование уже числится на новой точке.' if accepted else '\n\nОборудование осталось на прежней точке.')
    )
    targets = {int(from_uid), int(to_uid)}
    if sender:
        targets.add(int(sender))
    targets.discard(int(decider_id))
    send_to_users(cur, sorted(targets), text)


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
    text = (
        f'✅ <b>Техник выполнил задачу №{int(task_id)}</b>\n'
        f'📍 Точка: {esc(point_name(cur, uid))}\n'
        + (f'⚙️ Оборудование: {esc(eq)}\n' if eq else '')
        + f'📝 {esc(title)}\n'
        f'👷 Выполнил: {esc(done_by)}\n'
        f'💰 Потрачено на ремонт: {money_text(cost)}\n'
        f'📊 Расходы точки за месяц: {money_text(month_spent(cur, uid))}'
        + (f'\n\nЧто сделано: {esc(comment[:1500])}' if comment else '')
    )
    send_to_users(cur, point_bosses(cur, uid) + [created_by], text)


def notify_transfer(cur, from_uid: int, to_uid: int, eid, sender_id: int) -> None:
    cur.execute(f"SELECT manager_id FROM app_users WHERE id = {int(to_uid)} AND role = 'admin'")
    row = cur.fetchone()
    if not row or not row[0]:
        return
    cur.execute(
        'SELECT name, location, serial, price FROM equipment WHERE user_id = '
        f"{int(from_uid)} AND id = '{str(eid).replace(chr(39), chr(39) * 2)}'"
    )
    eq = cur.fetchone()
    if not eq:
        return
    name, location, serial, price = eq
    price_text = f'{round(float(price or 0)):,}'.replace(',', ' ')
    text = (
        '📦 <b>Передача оборудования ждёт подтверждения</b>\n'
        f'⚙️ {esc(name)}\n'
        + (f'🏷 S/N: {esc(serial)}\n' if serial else '')
        + (f'💰 Стоимость: {price_text} ₽\n' if float(price or 0) > 0 else '')
        + f'📤 Откуда: {esc(point_name(cur, from_uid))}' + (f' · {esc(location)}' if location else '') + '\n'
        f'📥 Куда: {esc(point_name(cur, to_uid))}\n'
        f'👤 Отправил: {esc(point_name(cur, sender_id))}\n'
        '\nОткройте сайт, чтобы подтвердить или отклонить.'
    )
    send_to_users(cur, [int(row[0])], text)
    send_to_users(cur, [int(to_uid)], (
        '📦 <b>К вам направлено оборудование</b>\n'
        f'⚙️ {esc(name)}\n'
        f'📤 Откуда: {esc(point_name(cur, from_uid))}\n'
        f'👤 Отправил: {esc(point_name(cur, sender_id))}\n'
        '\n⏳ Ждёт подтверждения управляющего.'
    ))
