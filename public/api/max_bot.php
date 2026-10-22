<?php
declare(strict_types=1);

require_once __DIR__ . '/report.php';
require_once __DIR__ . '/max_tasks.php';

function max_hook_key(): string
{
    return substr(hash('sha256', 'max-hook:' . max_token()), 0, 40);
}

const MAX_HOOK_TYPES = ['bot_started', 'message_created', 'message_callback'];

function max_hook_base(): string
{
    $host = (string)($_SERVER['HTTP_HOST'] ?? '');
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/check.php'))), '/');
    return 'https://' . $host . $dir . '/max.php';
}

function max_mask_url(string $url): string
{
    return (string)preg_replace('/hook=[^&]+/', 'hook=***', $url);
}

function max_subscriptions(): array
{
    [$code, $data] = max_call('GET', '/subscriptions', [], null, 6);
    return [$code, $code === 200 ? (array)($data['subscriptions'] ?? []) : []];
}

function max_hook_state(string $base): array
{
    $target = $base . '?hook=' . max_hook_key();
    [$code, $subs] = max_subscriptions();
    if ($code !== 200) {
        return ['error', 'MAX не отдал список подписок (код ' . $code . ($GLOBALS['max_last_error'] ? ', ' . $GLOBALS['max_last_error'] : '') . ')', $subs];
    }
    foreach ($subs as $s) {
        if (($s['url'] ?? '') === $target) {
            return ['ok', max_mask_url($target), $subs];
        }
    }
    return [$subs ? 'other' : 'none', $subs ? implode(', ', array_map(fn($s) => max_mask_url((string)($s['url'] ?? '')), $subs)) : '', $subs];
}

function max_connect_webhook(string $base): array
{
    $target = $base . '?hook=' . max_hook_key();
    [$code, $subs] = max_subscriptions();
    if ($code !== 200) {
        return [false, 'MAX не ответил (код ' . $code . '). Проверьте токен бота'];
    }
    foreach ($subs as $s) {
        $url = (string)($s['url'] ?? '');
        if ($url !== '' && $url !== $target) {
            max_call('DELETE', '/subscriptions', ['url' => $url], null, 6);
        }
    }
    [$code, $data] = max_call('POST', '/subscriptions', [], ['url' => $target, 'update_types' => MAX_HOOK_TYPES], 8);
    if ($code !== 200 || (isset($data['success']) && !$data['success'])) {
        return [false, 'MAX отказал в подключении: ' . ((string)($data['message'] ?? '') ?: 'код ' . $code)];
    }
    [$state] = max_hook_state($base);
    return $state === 'ok'
        ? [true, 'Нажатия кнопок теперь приходят на ' . max_mask_url($target)]
        : [false, 'MAX принял запрос, но подписка не появилась. Попробуйте ещё раз через минуту'];
}

function max_hook_selftest(string $base): array
{
    if (!function_exists('curl_init')) {
        return [true, 'пропущено: на хостинге нет curl'];
    }
    $ch = curl_init($base . '?hook=' . max_hook_key());
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode(['update_type' => 'ping']),
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 4,
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    curl_close($ch);
    $data = json_decode((string)$raw, true);
    if ($code === 200 && !empty($data['ok'])) {
        return [true, 'адрес ' . max_mask_url($base) . ' отвечает'];
    }
    return [false, 'адрес ' . max_mask_url($base) . ' не отвечает как надо (код ' . $code . ($err ? ', ' . $err : '') . ')'];
}

function max_ensure_webhook(string $hookUrl): void
{
    if (!preg_match('#^https://#', $hookUrl)) {
        return;
    }
    $base = (string)strtok($hookUrl, '?');
    [$state] = max_hook_state($base);
    if ($state !== 'ok') {
        max_connect_webhook($base);
    }
}

function max_summary(PDO $db, int $maxUid, string $kind = 'points'): void
{
    $row = one_row($db, 'SELECT u.id, u.role FROM max_links l JOIN app_users u ON u.id = l.user_id WHERE l.max_user_id = ? AND u.active = 1', [$maxUid]);
    if (!$row) {
        max_send($maxUid, 'Аккаунт не подключён. Нажмите «Подключить MAX» в приложении.');
        return;
    }
    if (!in_array($row['role'], BOSS_ROLES_R, true)) {
        max_send($maxUid, 'Сводка по точкам доступна админам, управляющим и супер-админу.');
        return;
    }
    max_send_button($maxUid, $kind === 'staff'
        ? build_staff_report($db, (int)$row['id'], (string)$row['role'])
        : build_report($db, (int)$row['id'], (string)$row['role'], false));
}

function max_handle(PDO $db, array $u): void
{
    $type = $u['update_type'] ?? '';
    if ($type === 'bot_started') {
        max_apply_code($db, (string)($u['payload'] ?? ''), (array)($u['user'] ?? []));
    } elseif ($type === 'message_callback') {
        $cb = (array)($u['callback'] ?? []);
        $payload = (string)($cb['payload'] ?? '');
        $cbUid = (int)($cb['user']['user_id'] ?? 0);
        if (!empty($cb['callback_id'])) {
            max_call('POST', '/answers', ['callback_id' => (string)$cb['callback_id']], ['notification' => in_array($payload, ['summary', 'staff'], true) ? 'Готовлю сводку…' : 'Принято'], 3);
        }
        if (!$cbUid) {
            return;
        }
        if ($payload === 'summary' || $payload === 'staff') {
            max_summary($db, $cbUid, $payload === 'staff' ? 'staff' : 'points');
        } else {
            mt_callback($db, $cbUid, $payload);
        }
    } elseif ($type === 'message_created') {
        $msg = (array)($u['message'] ?? []);
        $text = trim((string)($msg['body']['text'] ?? ''));
        $low = mb_strtolower($text);
        $sid = (int)($msg['sender']['user_id'] ?? 0);
        if (!$sid) {
            return;
        }
        if (strpos($low, '/start') === 0) {
            max_apply_code($db, trim(substr($text, 6)), (array)$msg['sender']);
        } elseif ($low === '/stop') {
            run($db, 'DELETE FROM max_links WHERE max_user_id = ?', [$sid]);
            max_send($sid, 'Уведомления отключены.');
        } elseif (mt_dialog_text($db, $sid, $text)) {
            return;
        } elseif (preg_match('#^(/staff|сотрудники|сводка по сотрудникам|персонал)#u', $low)) {
            max_summary($db, $sid, 'staff');
        } elseif (preg_match('#^(/summary|/svodka|сводка|отч[её]т)#u', $low)) {
            max_summary($db, $sid);
        } else {
            max_send_button($sid, "Я присылаю уведомления о заявках, ремонтах и передачах оборудования, а в 23:00 — итоги дня.\nСводку по точкам или по сотрудникам можно получить кнопками ниже или словами «сводка» и «сотрудники».");
        }
    }
}

function max_status(PDO $db, int $uid, string $role): array
{
    $row = one_row($db, 'SELECT max_name, linked_at FROM max_links WHERE user_id = ?', [$uid]);
    $boss = in_array($role, BOSS_ROLES_R, true);
    $cfg = $boss ? report_settings($db, $uid) : null;
    return [
        'canReport' => $boss,
        'reportTime' => $cfg ? $cfg['time'] : null,
        'reportEnabled' => $cfg ? $cfg['enabled'] : false,
        'overdueEnabled' => $cfg ? $cfg['overdueEnabled'] : false,
        'overdueFrom' => $cfg ? $cfg['overdueFrom'] : null,
        'overdueTo' => $cfg ? $cfg['overdueTo'] : null,
        'allowed' => in_array($role, NOTIFY_ROLES, true),
        'configured' => max_token() !== '',
        'linked' => (bool)$row,
        'name' => $row ? (string)$row['max_name'] : '',
        'linkedAt' => $row ? iso($row['linked_at'], true) : null,
    ];
}

function max_person_name(array $user): string
{
    $name = trim((string)($user['name'] ?? trim(($user['first_name'] ?? '') . ' ' . ($user['last_name'] ?? ''))));
    if ($name === '' && !empty($user['username'])) {
        $name = '@' . $user['username'];
    }
    return mb_substr($name, 0, 120);
}

function max_apply_code(PDO $db, string $code, array $user): void
{
    $maxUid = (int)($user['user_id'] ?? 0);
    if (!$maxUid) {
        return;
    }
    $code = mb_substr(trim($code), 0, 128);
    if ($code === '') {
        max_send($maxUid, 'Чтобы получать уведомления, нажмите «Подключить MAX» в приложении.');
        return;
    }
    $row = one_row($db, 'SELECT user_id FROM max_link_codes WHERE code = ? AND expires_at > ?', [$code, now_utc()]);
    run($db, 'DELETE FROM max_link_codes WHERE code = ?', [$code]);
    if (!$row) {
        max_send($maxUid, 'Ссылка устарела. Нажмите «Подключить MAX» в приложении ещё раз.');
        return;
    }
    $uid = (int)$row['user_id'];
    $acc = one_row($db, 'SELECT role, full_name, username FROM app_users WHERE id = ? AND active = 1', [$uid]);
    if (!$acc || !in_array($acc['role'], NOTIFY_ROLES, true)) {
        max_send($maxUid, 'Уведомления доступны только админам, управляющим, техникам и супер-админу.');
        return;
    }
    run($db, 'DELETE FROM max_links WHERE max_user_id = ? AND user_id <> ?', [$maxUid, $uid]);
    upsert($db, 'max_links', ['user_id'], [
        'user_id' => $uid,
        'max_user_id' => $maxUid,
        'max_name' => max_person_name($user),
        'linked_at' => now_utc(),
    ]);
    $name = (string)($acc['full_name'] ?: $acc['username']);
    $hello = "Готово! Аккаунт «{$name}» подключён — уведомления будут приходить сюда.";
    if (in_array($acc['role'], BOSS_ROLES_R, true)) {
        max_send_button($maxUid, $hello . "\nКаждый день в 23:00 пришлю итоги дня, а сводку по точкам можно запросить кнопкой ниже или словом «сводка».");
    } else {
        max_send($maxUid, $hello);
    }
}

function max_poll(PDO $db): void
{
    $marker = one_value($db, 'SELECT marker FROM max_state WHERE id = 1');
    $query = ['timeout' => 0, 'limit' => 100, 'types' => 'bot_started,message_created,message_callback'];
    if ($marker) {
        $query['marker'] = $marker;
    }
    [$code, $data] = max_call('GET', '/updates', $query, null, 6);
    if ($code !== 200) {
        return;
    }
    foreach ($data['updates'] ?? [] as $u) {
        try {
            max_handle($db, (array)$u);
        } catch (Throwable $e) {
            error_log('[asap] max update failed: ' . $e->getMessage());
        }
    }
    if (!empty($data['marker'])) {
        if (one_value($db, 'SELECT 1 FROM max_state WHERE id = 1')) {
            run($db, 'UPDATE max_state SET marker = ? WHERE id = 1', [(int)$data['marker']]);
        } else {
            run($db, 'INSERT INTO max_state (id, marker) VALUES (1, ?)', [(int)$data['marker']]);
        }
    }
}
