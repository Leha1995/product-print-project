import html
import json
import os
import re
import secrets
import urllib.error
import urllib.request

from report import send_max, send_tg

EQUIPMENT_FN = 'https://functions.poehali.dev/72436dc3-89cf-47ce-a4bc-2d471dd76275'
PRIORITY_LABEL = {'urgent': '🔴 ОЧЕНЬ СРОЧНО', 'soon': '🟡 Побыстрее', 'normal': '🟢 Не срочно'}


def esc(value) -> str:
    return html.escape(str(value or ''), quote=False)


def q(value) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def button(text: str, payload: str, intent: str = 'default') -> dict:
    return {'type': 'callback', 'text': text, 'payload': payload, 'intent': intent}


def keyboard(rows: list) -> list:
    return [{'type': 'inline_keyboard', 'payload': {'buttons': rows}}]


def task_buttons(task_id: int, taken: bool = False) -> list:
    rows = [[button('✅ Выполнено', f'done:{int(task_id)}', 'positive')]]
    if not taken:
        rows[0].insert(0, button('🛠 Взял в работу', f'take:{int(task_id)}'))
    return keyboard(rows)


def money(value) -> str:
    return f'{round(float(value or 0)):,}'.replace(',', ' ') + ' ₽'


def parse_cost(text: str):
    clean = text.lower().replace('руб', '').replace('р.', '').replace('₽', '').replace('р', '')
    clean = re.sub(r'\s+', '', clean).replace(',', '.')
    if not re.fullmatch(r'\d{1,9}(\.\d{1,2})?', clean):
        return None
    return float(clean)


def linked_technician(cur, max_uid):
    cur.execute(
        "SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.username) FROM max_links l "
        f"JOIN app_users u ON u.id = l.user_id WHERE l.max_user_id = {int(max_uid)} AND u.active AND u.role = 'technician'"
    )
    row = cur.fetchone()
    return {'id': int(row[0]), 'name': row[1]} if row else None


def call_equipment(cur, tech_id: int, method: str, body: dict | None = None, timeout: float = 4.0):
    """Выполняет действие от имени техника через ту же логику, что и приложение."""
    token = 'bot-' + secrets.token_hex(24)
    cur.execute(
        f"INSERT INTO app_sessions (token, user_id, expires_at) VALUES ({q(token)}, {int(tech_id)}, NOW() + INTERVAL '2 minutes')"
    )
    req = urllib.request.Request(
        EQUIPMENT_FN,
        data=json.dumps(body).encode() if body is not None else None,
        method=method,
        headers={'Content-Type': 'application/json', 'X-Auth-Token': token},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return res.status, json.loads(res.read().decode() or '{}')
    except urllib.error.HTTPError as err:
        try:
            return err.code, json.loads(err.read().decode() or '{}')
        except ValueError:
            return err.code, {}
    except Exception as err:
        print(f'equipment call failed: {err}')
        return 0, {}
    finally:
        cur.execute(f'DELETE FROM app_sessions WHERE token = {q(token)}')


def open_task(cur, tech_id: int, task_id: int):
    """Заявка, если она открыта и видна этому технику."""
    status, data = call_equipment(cur, tech_id, 'GET')
    if status != 200:
        return None, status
    for t in data.get('tasks') or []:
        if int(t.get('id') or 0) == int(task_id) and t.get('status') == 'open':
            return t, 200
    return None, 404


def task_title(task: dict) -> str:
    first = (task.get('description') or '').split('\n')[0][:120]
    eq = task.get('equipmentName') or ''
    return f"№{task['id']} · {esc(task.get('ownerName') or '')}" + (f' · {esc(eq)}' if eq else '') + (f'\n📝 {esc(first)}' if first else '')


def notify_bosses_taken(cur, task_id: int, tech_name: str) -> None:
    cur.execute(
        "SELECT t.user_id, t.created_by, u.manager_id, u.role, COALESCE(NULLIF(u.full_name, ''), u.username), t.description "
        f'FROM equipment_tasks t JOIN app_users u ON u.id = t.user_id WHERE t.id = {int(task_id)}'
    )
    row = cur.fetchone()
    if not row:
        return
    uid, creator, manager_id, role, point, description = row
    ids = {int(uid), int(creator or 0)}
    if role == 'admin' and manager_id:
        ids.add(int(manager_id))
    ids.discard(0)
    text = (
        f'🛠 <b>Заявку №{int(task_id)} взяли в работу</b>\n'
        f'📍 Точка: {esc(point)}\n'
        f'👷 Техник: {esc(tech_name)}\n'
        f"📝 {esc((description or '').split(chr(10))[0][:200])}"
    )
    id_list = ', '.join(str(i) for i in ids)
    cur.execute(
        'SELECT l.max_user_id FROM max_links l JOIN app_users u ON u.id = l.user_id '
        f"WHERE u.active AND u.role IN ('admin', 'manager', 'superadmin') AND l.user_id IN ({id_list})"
    )
    for (mid,) in cur.fetchall():
        send_max(mid, text, False)
    cur.execute(
        'SELECT l.chat_id FROM telegram_links l JOIN app_users u ON u.id = l.user_id '
        f"WHERE u.active AND u.role IN ('admin', 'manager', 'superadmin') AND l.user_id IN ({id_list})"
    )
    for (chat,) in cur.fetchall():
        send_tg(chat, text)


def set_dialog(cur, max_uid, task_id: int, step: str, cost: float = 0) -> None:
    cur.execute(
        f'INSERT INTO max_dialogs (max_user_id, task_id, step, cost, updated_at) VALUES ({int(max_uid)}, {int(task_id)}, {q(step)}, {cost}, NOW()) '
        'ON CONFLICT (max_user_id) DO UPDATE SET task_id = EXCLUDED.task_id, step = EXCLUDED.step, cost = EXCLUDED.cost, updated_at = NOW()'
    )


def get_dialog(cur, max_uid):
    cur.execute(
        f"SELECT task_id, step, cost FROM max_dialogs WHERE max_user_id = {int(max_uid)} AND updated_at > NOW() - INTERVAL '30 minutes'"
    )
    row = cur.fetchone()
    return {'task_id': int(row[0]), 'step': row[1], 'cost': float(row[2] or 0)} if row else None


def clear_dialog(cur, max_uid) -> None:
    cur.execute(f'DELETE FROM max_dialogs WHERE max_user_id = {int(max_uid)}')


def take_task(cur, max_uid, task_id: int, reply) -> None:
    tech = linked_technician(cur, max_uid)
    if not tech:
        reply('Отмечать заявки могут только техники, подключённые к боту.')
        return
    task, status = open_task(cur, tech['id'], task_id)
    if not task:
        reply('Не удалось связаться с сервером, попробуйте ещё раз.' if status != 404 else f'Заявка №{task_id} уже закрыта или недоступна.')
        return
    if task.get('technicianId') and int(task['technicianId']) != tech['id']:
        reply(f"Заявку №{task_id} уже взял {esc(task.get('technicianName') or 'другой техник')}.")
        return
    cur.execute(
        f"UPDATE equipment_tasks SET technician_id = {tech['id']}, taken_at = COALESCE(taken_at, NOW()) "
        f"WHERE id = {int(task_id)} AND status = 'open' AND (technician_id IS NULL OR technician_id = {tech['id']}) RETURNING id"
    )
    if not cur.fetchone():
        reply(f'Заявку №{task_id} уже взял другой техник.')
        return
    _send_buttons(max_uid, f'🛠 <b>Вы взяли в работу заявку</b> {task_title(task)}\n\nКогда закончите — нажмите «Выполнено».', task_buttons(task_id, True))
    try:
        notify_bosses_taken(cur, task_id, tech['name'])
    except Exception as err:
        print(f'taken notify failed: {err}')


def _send_buttons(max_uid, text: str, attachments: list) -> None:
    token = os.environ.get('MAX_BOT_TOKEN', '').strip()
    req = urllib.request.Request(
        f'https://platform-api.max.ru/messages?user_id={int(max_uid)}',
        data=json.dumps({'text': text[:3900], 'format': 'html', 'attachments': attachments}).encode(),
        headers={'Authorization': token, 'Content-Type': 'application/json'},
        method='POST',
    )
    try:
        urllib.request.urlopen(req, timeout=3).read()
    except Exception as err:
        print(f'max send failed {max_uid}: {err}')


def start_done(cur, max_uid, task_id: int, reply) -> None:
    tech = linked_technician(cur, max_uid)
    if not tech:
        reply('Отмечать заявки могут только техники, подключённые к боту.')
        return
    task, status = open_task(cur, tech['id'], task_id)
    if not task:
        reply('Не удалось связаться с сервером, попробуйте ещё раз.' if status != 404 else f'Заявка №{task_id} уже закрыта или недоступна.')
        return
    set_dialog(cur, max_uid, task_id, 'cost')
    _send_buttons(
        max_uid,
        f'✅ Закрываем заявку {task_title(task)}\n\n💰 <b>Сколько потрачено на ремонт?</b>\nНапишите сумму в рублях, например <b>1500</b>. Если без затрат — нажмите «0 ₽».',
        keyboard([[button('0 ₽', f'cost0:{int(task_id)}'), button('Отмена', 'cancel', 'negative')]]),
    )


def ask_comment(cur, max_uid, task_id: int, cost: float) -> None:
    set_dialog(cur, max_uid, task_id, 'comment', cost)
    _send_buttons(
        max_uid,
        f'Сумма: <b>{money(cost)}</b>\n\n📝 <b>Что сделано?</b> Напишите коротко одним сообщением или нажмите «Без комментария».',
        keyboard([[button('Без комментария', f'nocomment:{int(task_id)}'), button('Отмена', 'cancel', 'negative')]]),
    )


def finish_task(cur, max_uid, task_id: int, cost: float, comment: str) -> None:
    tech = linked_technician(cur, max_uid)
    clear_dialog(cur, max_uid)
    if not tech:
        send_max(max_uid, 'Отмечать заявки могут только техники, подключённые к боту.', False)
        return
    status, data = call_equipment(cur, tech['id'], 'POST', {
        'action': 'task_done', 'taskId': int(task_id), 'cost': cost, 'comment': comment[:1000],
    }, 4.2)
    if status == 200 and data.get('ok'):
        send_max(max_uid, f'🎉 <b>Заявка №{int(task_id)} выполнена</b>\n💰 Потрачено: {money(cost)}'
                 + (f'\n📝 {esc(comment[:300])}' if comment else '') + '\n\nАдмин и управляющий получили уведомление.', False)
        return
    cur.execute(f'SELECT status FROM equipment_tasks WHERE id = {int(task_id)}')
    row = cur.fetchone()
    if row and row[0] == 'done':
        send_max(max_uid, f'🎉 <b>Заявка №{int(task_id)} выполнена</b>\n💰 Потрачено: {money(cost)}', False)
    elif status == 409:
        send_max(max_uid, f'Заявка №{int(task_id)} уже закрыта или недоступна.', False)
    else:
        _send_buttons(max_uid, 'Не получилось сохранить, попробуйте ещё раз.', task_buttons(task_id, True))


def handle_callback(cur, max_uid, payload: str, reply) -> bool:
    """Кнопки заявок. Возвращает True, если нажатие обработано здесь."""
    if payload == 'cancel':
        clear_dialog(cur, max_uid)
        reply('Отменено. Заявка осталась открытой.')
        return True
    m = re.fullmatch(r'(take|done|cost0|nocomment):(\d+)', payload or '')
    if not m:
        return False
    action, task_id = m.group(1), int(m.group(2))
    if action == 'take':
        take_task(cur, max_uid, task_id, reply)
    elif action == 'done':
        start_done(cur, max_uid, task_id, reply)
    elif action == 'cost0':
        dlg = get_dialog(cur, max_uid)
        if dlg and dlg['task_id'] == task_id and dlg['step'] == 'cost':
            ask_comment(cur, max_uid, task_id, 0)
    elif action == 'nocomment':
        dlg = get_dialog(cur, max_uid)
        if dlg and dlg['task_id'] == task_id and dlg['step'] == 'comment':
            finish_task(cur, max_uid, task_id, dlg['cost'], '')
    return True


def handle_dialog_text(cur, max_uid, text: str) -> bool:
    """Ответ техника на вопрос о сумме или комментарии. True — сообщение относилось к диалогу."""
    dlg = get_dialog(cur, max_uid)
    if not dlg:
        return False
    if dlg['step'] == 'cost':
        cost = parse_cost(text)
        if cost is None:
            send_max(max_uid, 'Не понял сумму. Напишите только число в рублях, например <b>1500</b>, или нажмите «0 ₽».', False)
            return True
        ask_comment(cur, max_uid, dlg['task_id'], cost)
        return True
    if dlg['step'] == 'comment':
        finish_task(cur, max_uid, dlg['task_id'], dlg['cost'], text.strip())
        return True
    return False