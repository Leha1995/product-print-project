<?php
declare(strict_types=1);

require_once __DIR__ . '/equipment_lib.php';

function mt_button(string $text, string $payload, string $intent = 'default'): array
{
    return ['type' => 'callback', 'text' => $text, 'payload' => $payload, 'intent' => $intent];
}

function mt_keyboard(array $rows): array
{
    return [['type' => 'inline_keyboard', 'payload' => ['buttons' => $rows]]];
}

function mt_send(int $maxUid, string $text, ?array $attachments = null): void
{
    $body = ['text' => mb_substr($text, 0, 3900), 'format' => 'html'];
    if ($attachments) {
        $body['attachments'] = $attachments;
    }
    max_call('POST', '/messages', ['user_id' => $maxUid], $body, 4);
}

function mt_parse_cost(string $text): ?float
{
    $clean = mb_strtolower($text);
    $clean = str_replace(['руб', 'р.', '₽', 'р'], '', $clean);
    $clean = str_replace(',', '.', preg_replace('/\s+/u', '', $clean));
    if (!preg_match('/^\d{1,9}(\.\d{1,2})?$/', $clean)) {
        return null;
    }
    return (float)$clean;
}

function mt_technician(PDO $db, int $maxUid): ?array
{
    $row = one_row(
        $db,
        "SELECT u.id, u.full_name, u.username FROM max_links l JOIN app_users u ON u.id = l.user_id WHERE l.max_user_id = ? AND u.active = 1 AND u.role = 'technician'",
        [$maxUid]
    );
    return $row ? ['id' => (int)$row['id'], 'name' => (string)($row['full_name'] ?: $row['username'])] : null;
}

function mt_open_task(PDO $db, int $techId, int $taskId): ?array
{
    $GLOBALS['structureMembers'] = null;
    foreach (technician_tasks($db, $techId) as $t) {
        if ((int)$t['id'] === $taskId && $t['status'] === 'open') {
            return $t;
        }
    }
    return null;
}

function mt_title(array $t): string
{
    $first = mb_substr(explode("\n", (string)($t['description'] ?? ''))[0], 0, 120);
    $eq = (string)($t['equipmentName'] ?? '');
    return '№' . (int)$t['id'] . ' · ' . tg_esc($t['ownerName'] ?? '') . ($eq !== '' ? ' · ' . tg_esc($eq) : '') . ($first !== '' ? "\n📝 " . tg_esc($first) : '');
}

function mt_set_dialog(PDO $db, int $maxUid, int $taskId, string $step, float $cost = 0): void
{
    upsert($db, 'max_dialogs', ['max_user_id'], [
        'max_user_id' => $maxUid,
        'task_id' => $taskId,
        'step' => $step,
        'cost' => $cost,
        'updated_at' => now_utc(),
    ]);
}

function mt_get_dialog(PDO $db, int $maxUid): ?array
{
    $row = one_row($db, 'SELECT task_id, step, cost FROM max_dialogs WHERE max_user_id = ? AND updated_at > ?', [$maxUid, now_utc(-1800)]);
    return $row ? ['task_id' => (int)$row['task_id'], 'step' => (string)$row['step'], 'cost' => (float)$row['cost']] : null;
}

function mt_clear_dialog(PDO $db, int $maxUid): void
{
    run($db, 'DELETE FROM max_dialogs WHERE max_user_id = ?', [$maxUid]);
}

function mt_notify_taken(PDO $db, int $taskId, string $techName): void
{
    $row = one_row(
        $db,
        'SELECT t.user_id, t.created_by, t.description, u.manager_id, u.role, u.full_name, u.username FROM equipment_tasks t JOIN app_users u ON u.id = t.user_id WHERE t.id = ?',
        [$taskId]
    );
    if (!$row) {
        return;
    }
    $ids = [(int)$row['user_id'], (int)$row['created_by']];
    if ($row['role'] === 'admin' && $row['manager_id']) {
        $ids[] = (int)$row['manager_id'];
    }
    $ids = array_values(array_unique(array_filter($ids)));
    $text = '🛠 <b>Заявку №' . $taskId . " взяли в работу</b>\n"
        . '📍 Точка: ' . tg_esc($row['full_name'] ?: $row['username']) . "\n"
        . '👷 Техник: ' . tg_esc($techName) . "\n"
        . '📝 ' . tg_esc(mb_substr(explode("\n", (string)$row['description'])[0], 0, 200));
    send_to_users($db, $ids, $text);
}

function mt_take(PDO $db, int $maxUid, int $taskId): void
{
    $tech = mt_technician($db, $maxUid);
    if (!$tech) {
        mt_send($maxUid, 'Отмечать заявки могут только техники, подключённые к боту.');
        return;
    }
    $task = mt_open_task($db, $tech['id'], $taskId);
    if (!$task) {
        mt_send($maxUid, "Заявка №{$taskId} уже закрыта или недоступна.");
        return;
    }
    if (!empty($task['technicianId']) && (int)$task['technicianId'] !== $tech['id']) {
        mt_send($maxUid, "Заявку №{$taskId} уже взял " . tg_esc($task['technicianName'] ?: 'другой техник') . '.');
        return;
    }
    $taken = run(
        $db,
        "UPDATE equipment_tasks SET technician_id = ?, taken_at = COALESCE(taken_at, ?) WHERE id = ? AND status = 'open' AND (technician_id IS NULL OR technician_id = ?)",
        [$tech['id'], now_utc(), $taskId, $tech['id']]
    )->rowCount();
    if (!$taken && (int)($task['technicianId'] ?? 0) !== $tech['id']) {
        mt_send($maxUid, "Заявку №{$taskId} уже взял другой техник.");
        return;
    }
    mt_send(
        $maxUid,
        '🛠 <b>Вы взяли в работу заявку</b> ' . mt_title($task) . "\n\nКогда закончите — нажмите «Выполнено».",
        mt_keyboard([[mt_button('✅ Выполнено', 'done:' . $taskId, 'positive')]])
    );
    try {
        mt_notify_taken($db, $taskId, $tech['name']);
    } catch (Throwable $e) {
        error_log('[asap] taken notify failed: ' . $e->getMessage());
    }
}

function mt_start_done(PDO $db, int $maxUid, int $taskId): void
{
    $tech = mt_technician($db, $maxUid);
    if (!$tech) {
        mt_send($maxUid, 'Отмечать заявки могут только техники, подключённые к боту.');
        return;
    }
    $task = mt_open_task($db, $tech['id'], $taskId);
    if (!$task) {
        mt_send($maxUid, "Заявка №{$taskId} уже закрыта или недоступна.");
        return;
    }
    mt_set_dialog($db, $maxUid, $taskId, 'cost');
    mt_send(
        $maxUid,
        '✅ Закрываем заявку ' . mt_title($task) . "\n\n💰 <b>Сколько потрачено на ремонт?</b>\nНапишите сумму в рублях, например <b>1500</b>. Если без затрат — нажмите «0 ₽».",
        mt_keyboard([[mt_button('0 ₽', 'cost0:' . $taskId), mt_button('Отмена', 'cancel', 'negative')]])
    );
}

function mt_ask_comment(PDO $db, int $maxUid, int $taskId, float $cost): void
{
    mt_set_dialog($db, $maxUid, $taskId, 'comment', $cost);
    mt_send(
        $maxUid,
        'Сумма: <b>' . money_line($cost) . "</b>\n\n📝 <b>Что сделано?</b> Напишите коротко одним сообщением или нажмите «Без комментария».",
        mt_keyboard([[mt_button('Без комментария', 'nocomment:' . $taskId), mt_button('Отмена', 'cancel', 'negative')]])
    );
}

function mt_finish(PDO $db, int $maxUid, int $taskId, float $cost, string $comment): void
{
    mt_clear_dialog($db, $maxUid);
    $tech = mt_technician($db, $maxUid);
    if (!$tech) {
        mt_send($maxUid, 'Отмечать заявки могут только техники, подключённые к боту.');
        return;
    }
    if (!mt_open_task($db, $tech['id'], $taskId)) {
        mt_send($maxUid, "Заявка №{$taskId} уже закрыта или недоступна.");
        return;
    }
    $cost = money($cost);
    $comment = mb_substr(trim($comment), 0, 1000);
    $tid = $tech['id'];
    $done = run(
        $db,
        "UPDATE equipment_tasks SET status = 'done', done_at = ?, cost = ?, done_by = ?, done_comment = ? WHERE id = ? AND status = 'open'",
        [now_utc(), $cost, $tid, $comment, $taskId]
    )->rowCount();
    if (!$done) {
        mt_send($maxUid, "Заявка №{$taskId} уже закрыта.");
        return;
    }
    $task = one_row($db, 'SELECT kind, user_id, equipment_id FROM equipment_tasks WHERE id = ?', [$taskId]);
    if ($task && $task['kind'] === 'repair' && $task['equipment_id']
        && one_value($db, 'SELECT 1 FROM equipment WHERE user_id = ? AND id = ? AND in_repair = 1', [(int)$task['user_id'], $task['equipment_id']])) {
        return_repair(
            $db,
            (int)$task['user_id'],
            ['id' => $task['equipment_id'], 'cost' => $cost, 'description' => $comment !== '' ? $comment : null],
            $tid,
            false
        );
    }
    try {
        notify_task_done($db, $taskId);
    } catch (Throwable $e) {
        error_log('[asap] done notify failed: ' . $e->getMessage());
    }
    mt_send(
        $maxUid,
        '🎉 <b>Заявка №' . $taskId . " выполнена</b>\n💰 Потрачено: " . money_line($cost)
        . ($comment !== '' ? "\n📝 " . tg_esc(mb_substr($comment, 0, 300)) : '')
        . "\n\nАдмин и управляющий получили уведомление."
    );
}

function mt_callback(PDO $db, int $maxUid, string $payload): bool
{
    if ($payload === 'cancel') {
        mt_clear_dialog($db, $maxUid);
        mt_send($maxUid, 'Отменено. Заявка осталась открытой.');
        return true;
    }
    if (!preg_match('/^(take|done|cost0|nocomment):(\d+)$/', $payload, $m)) {
        return false;
    }
    $taskId = (int)$m[2];
    if ($m[1] === 'take') {
        mt_take($db, $maxUid, $taskId);
    } elseif ($m[1] === 'done') {
        mt_start_done($db, $maxUid, $taskId);
    } elseif ($m[1] === 'cost0') {
        $d = mt_get_dialog($db, $maxUid);
        if ($d && $d['task_id'] === $taskId && $d['step'] === 'cost') {
            mt_ask_comment($db, $maxUid, $taskId, 0);
        }
    } else {
        $d = mt_get_dialog($db, $maxUid);
        if ($d && $d['task_id'] === $taskId && $d['step'] === 'comment') {
            mt_finish($db, $maxUid, $taskId, $d['cost'], '');
        }
    }
    return true;
}

function mt_dialog_text(PDO $db, int $maxUid, string $text): bool
{
    $d = mt_get_dialog($db, $maxUid);
    if (!$d) {
        return false;
    }
    if ($d['step'] === 'cost') {
        $cost = mt_parse_cost($text);
        if ($cost === null) {
            mt_send($maxUid, 'Не понял сумму. Напишите только число в рублях, например <b>1500</b>, или нажмите «0 ₽».');
            return true;
        }
        mt_ask_comment($db, $maxUid, $d['task_id'], $cost);
        return true;
    }
    if ($d['step'] === 'comment') {
        mt_finish($db, $maxUid, $d['task_id'], $d['cost'], $text);
        return true;
    }
    return false;
}
