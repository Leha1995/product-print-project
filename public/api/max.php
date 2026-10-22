<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';
require __DIR__ . '/report.php';
require __DIR__ . '/max_tasks.php';

$db = boot();
upgrade_schema($db);

function max_hook_key(): string
{
    return substr(hash('sha256', 'max-hook:' . max_token()), 0, 40);
}

function max_ensure_webhook(string $hookUrl): void
{
    if (!preg_match('#^https://#', $hookUrl)) {
        return;
    }
    $target = strtok($hookUrl, '?') . '?hook=' . max_hook_key();
    [$code, $data] = max_call('GET', '/subscriptions', [], null, 4);
    $subs = $code === 200 ? (array)($data['subscriptions'] ?? []) : [];
    foreach ($subs as $s) {
        if (($s['url'] ?? '') === $target) {
            return;
        }
    }
    foreach ($subs as $s) {
        max_call('DELETE', '/subscriptions', ['url' => (string)$s['url']], null, 4);
    }
    max_call('POST', '/subscriptions', [], ['url' => $target, 'update_types' => ['bot_started', 'message_created', 'message_callback']], 4);
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

$hook = (string)($_GET['hook'] ?? '');
if ($hook !== '') {
    if (max_token() === '' || !hash_equals(max_hook_key(), $hook)) {
        out(['error' => 'forbidden'], 403);
    }
    try {
        max_handle($db, body());
    } catch (Throwable $e) {
        error_log('[asap] max hook failed: ' . $e->getMessage());
    }
    out(['ok' => true]);
}

if (($_GET['task'] ?? '') === 'daily') {
    out(['ok' => true, 'sent' => send_daily_reports($db) + flush_overdue_queue($db)]);
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

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}

if (method() === 'GET') {
    maybe_daily_reports($db);
    $pending = one_value($db, 'SELECT 1 FROM max_link_codes WHERE user_id = ? AND expires_at > ?', [$me['id'], now_utc()]);
    if ($pending && max_token() !== '') {
        try {
            max_poll($db);
        } catch (Throwable $e) {
            error_log('[asap] max poll failed: ' . $e->getMessage());
        }
    }
    out(max_status($db, $me['id'], $me['role']));
}

$body = body();
$action = (string)($body['action'] ?? '');

if ($action === 'report_settings') {
    if (!in_array($me['role'], BOSS_ROLES_R, true)) {
        out(['error' => 'forbidden_role'], 403);
    }
    $time = (string)($body['time'] ?? '');
    if (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $time)) {
        out(['error' => 'bad_time'], 400);
    }
    $tz = max(-840, min(840, (int)($body['tzOffset'] ?? -180)));
    save_report_settings($db, (int)$me['id'], $time, !array_key_exists('enabled', $body) || (bool)$body['enabled'], $tz);
    out(max_status($db, (int)$me['id'], $me['role']));
}

if ($action === 'overdue_settings') {
    if (!in_array($me['role'], BOSS_ROLES_R, true)) {
        out(['error' => 'forbidden_role'], 403);
    }
    $from = (string)($body['from'] ?? '00:00');
    $to = (string)($body['to'] ?? '23:59');
    $re = '/^([01]\d|2[0-3]):[0-5]\d$/';
    if (!preg_match($re, $from) || !preg_match($re, $to)) {
        out(['error' => 'bad_time'], 400);
    }
    $tz = max(-840, min(840, (int)($body['tzOffset'] ?? -180)));
    save_overdue_settings($db, (int)$me['id'], !array_key_exists('enabled', $body) || (bool)$body['enabled'], $from, $to, $tz);
    out(max_status($db, (int)$me['id'], $me['role']));
}

if ($action === 'unlink') {
    $maxUid = one_value($db, 'SELECT max_user_id FROM max_links WHERE user_id = ?', [$me['id']]);
    run($db, 'DELETE FROM max_links WHERE user_id = ?', [$me['id']]);
    if ($maxUid) {
        max_send((int)$maxUid, 'Уведомления отключены в приложении.');
    }
    out(max_status($db, $me['id'], $me['role']));
}

if ($action === 'link') {
    if (!in_array($me['role'], NOTIFY_ROLES, true)) {
        out(['error' => 'forbidden_role'], 403);
    }
    if (max_token() === '') {
        out(['error' => 'not_configured'], 400);
    }
    [$code, $bot] = max_call('GET', '/me', [], null, 6);
    if ($code === 401) {
        out(['error' => 'bad_token'], 400);
    }
    if ($code !== 200 || empty($bot['username'])) {
        out(['error' => 'max_unavailable', 'detail' => $GLOBALS['max_last_error'] ?? ''], 502);
    }
    try {
        max_poll($db);
    } catch (Throwable $e) {
        error_log('[asap] max poll failed: ' . $e->getMessage());
    }
    try {
        max_ensure_webhook((string)($body['hookUrl'] ?? ''));
    } catch (Throwable $e) {
        error_log('[asap] max webhook failed: ' . $e->getMessage());
    }
    $linkCode = rtrim(strtr(base64_encode(random_bytes(12)), '+/', '-_'), '=');
    run($db, 'DELETE FROM max_link_codes WHERE user_id = ? OR expires_at < ?', [$me['id'], now_utc()]);
    run($db, 'INSERT INTO max_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)', [$linkCode, $me['id'], now_utc(1800)]);
    out(['url' => 'https://max.ru/' . $bot['username'] . '?start=' . $linkCode, 'botName' => $bot['username']]);
}

out(['error' => 'bad_action'], 400);
