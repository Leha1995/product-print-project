<?php
declare(strict_types=1);

const NOTIFY_ROLES = ['admin', 'manager', 'technician', 'superadmin'];
const PRIORITY_LABEL = [
    'urgent' => '🔴 ОЧЕНЬ СРОЧНО',
    'soon' => '🟡 Побыстрее',
    'normal' => '🟢 Не срочно',
];

function bot_token(): string
{
    $cfg = load_config() ?? [];
    return trim((string)($cfg['telegram_token'] ?? ''));
}

function tg_call(string $method, array $payload, float $timeout = 4.0): array
{
    $token = bot_token();
    if ($token === '') {
        return [];
    }
    $url = 'https://api.telegram.org/bot' . $token . '/' . $method;
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $json,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => (int)ceil($timeout),
            CURLOPT_CONNECTTIMEOUT => 3,
        ]);
        $raw = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $json,
            'timeout' => $timeout,
        ]]);
        $raw = @file_get_contents($url, false, $ctx);
    }
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}

function tg_esc($value): string
{
    return htmlspecialchars((string)$value, ENT_NOQUOTES, 'UTF-8');
}

function send_to_users(PDO $db, array $userIds, string $text): void
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $userIds))));
    if (!$ids || bot_token() === '') {
        return;
    }
    try {
        $rows = all_rows(
            $db,
            'SELECT DISTINCT l.chat_id FROM telegram_links l JOIN app_users u ON u.id = l.user_id '
            . "WHERE u.active = 1 AND u.role IN ('admin', 'manager', 'technician', 'superadmin') AND l.user_id IN (" . in_list($ids) . ')'
        );
    } catch (Throwable $e) {
        return;
    }
    foreach ($rows as $r) {
        tg_call('sendMessage', [
            'chat_id' => (string)$r['chat_id'],
            'text' => mb_substr($text, 0, 4000),
            'parse_mode' => 'HTML',
            'disable_web_page_preview' => true,
        ], 3);
    }
}

function point_name(PDO $db, int $uid): string
{
    return (string)(one_value($db, "SELECT COALESCE(NULLIF(full_name, ''), username) FROM app_users WHERE id = ?", [$uid]) ?? '');
}

function equipment_line(PDO $db, int $uid, $eid): string
{
    if (!$eid) {
        return '';
    }
    $row = one_row($db, 'SELECT name, location FROM equipment WHERE user_id = ? AND id = ?', [$uid, (string)$eid]);
    if (!$row) {
        return '';
    }
    return implode(' · ', array_filter([(string)$row['name'], (string)$row['location']]));
}

function notify_new_task(PDO $db, int $uid, int $taskId, string $description, string $priority, $eid, $techId, array $techs): void
{
    $targets = $techId ? [(int)$techId] : array_column($techs, 'id');
    $eq = equipment_line($db, $uid, $eid);
    $text = '🛠 <b>Новая задача №' . $taskId . "</b>\n"
        . (PRIORITY_LABEL[$priority] ?? PRIORITY_LABEL['normal']) . "\n"
        . '📍 Точка: ' . tg_esc(point_name($db, $uid)) . "\n"
        . ($eq !== '' ? '⚙️ Оборудование: ' . tg_esc($eq) . "\n" : '')
        . "\n" . tg_esc(mb_substr($description, 0, 1500));
    send_to_users($db, $targets, $text);
}

function notify_repair(PDO $db, int $uid, $eid, string $description, array $techs): void
{
    $eq = equipment_line($db, $uid, $eid) ?: (string)$eid;
    $text = "🔧 <b>Оборудование отправлено в ремонт</b>\n"
        . '📍 Точка: ' . tg_esc(point_name($db, $uid)) . "\n"
        . '⚙️ ' . tg_esc($eq) . "\n"
        . ($description !== '' ? "\nПоломка: " . tg_esc(mb_substr($description, 0, 1500)) : "\nОписание поломки не указано");
    send_to_users($db, array_column($techs, 'id'), $text);
}

function notify_transfer(PDO $db, int $fromUid, int $toUid, string $eid, int $senderId): void
{
    $head = (int)one_value($db, "SELECT manager_id FROM app_users WHERE id = ? AND role = 'admin'", [$toUid]);
    if (!$head) {
        return;
    }
    $eq = one_row($db, 'SELECT name, location, serial, price FROM equipment WHERE user_id = ? AND id = ?', [$fromUid, $eid]);
    if (!$eq) {
        return;
    }
    $price = (float)$eq['price'];
    $location = (string)$eq['location'];
    $serial = (string)$eq['serial'];
    $text = "📦 <b>Передача оборудования ждёт подтверждения</b>\n"
        . '⚙️ ' . tg_esc($eq['name']) . "\n"
        . ($serial !== '' ? '🏷 S/N: ' . tg_esc($serial) . "\n" : '')
        . ($price > 0 ? '💰 Стоимость: ' . number_format(round($price), 0, '', ' ') . " ₽\n" : '')
        . '📤 Откуда: ' . tg_esc(point_name($db, $fromUid)) . ($location !== '' ? ' · ' . tg_esc($location) : '') . "\n"
        . '📥 Куда: ' . tg_esc(point_name($db, $toUid)) . "\n"
        . '👤 Отправил: ' . tg_esc(point_name($db, $senderId)) . "\n"
        . "\nОткройте сайт, чтобы подтвердить или отклонить.";
    send_to_users($db, [$head], $text);
}

function notify_task_done(PDO $db, int $taskId): void
{
    $row = one_row(
        $db,
        "SELECT t.user_id, t.created_by, t.description, t.done_comment, t.cost, t.equipment_id, COALESCE(NULLIF(du.full_name, ''), du.username) AS done_name "
        . 'FROM equipment_tasks t LEFT JOIN app_users du ON du.id = t.done_by WHERE t.id = ?',
        [$taskId]
    );
    if (!$row) {
        return;
    }
    $uid = (int)$row['user_id'];
    $title = mb_substr(explode("\n", (string)$row['description'])[0], 0, 200);
    $eq = equipment_line($db, $uid, $row['equipment_id']);
    $comment = (string)$row['done_comment'];
    $text = '✅ <b>Задача №' . $taskId . " выполнена</b>\n"
        . '📍 Точка: ' . tg_esc(point_name($db, $uid)) . "\n"
        . ($eq !== '' ? '⚙️ Оборудование: ' . tg_esc($eq) . "\n" : '')
        . '📝 ' . tg_esc($title) . "\n"
        . '👷 Выполнил: ' . tg_esc($row['done_name']) . "\n"
        . '💰 Потрачено: ' . number_format(round((float)$row['cost']), 0, '', ' ') . ' ₽'
        . ($comment !== '' ? "\n\nЧто сделано: " . tg_esc(mb_substr($comment, 0, 1500)) : '');
    send_to_users($db, [$uid, (int)$row['created_by']], $text);
}
