<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';
require_once __DIR__ . '/max_bot.php';

$db = boot();
upgrade_schema($db);

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
