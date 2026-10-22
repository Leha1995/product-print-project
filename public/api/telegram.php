<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';

$db = boot();
upgrade_schema($db);

function webhook_secret(): string
{
    return substr(hash('sha256', 'tg-hook:' . bot_token()), 0, 48);
}

function link_status(PDO $db, int $uid, string $role): array
{
    $row = one_row($db, 'SELECT tg_name, linked_at FROM telegram_links WHERE user_id = ?', [$uid]);
    return [
        'allowed' => in_array($role, NOTIFY_ROLES, true),
        'configured' => bot_token() !== '',
        'linked' => (bool)$row,
        'tgName' => $row ? (string)$row['tg_name'] : '',
        'linkedAt' => $row ? iso($row['linked_at'], true) : null,
    ];
}

function handle_update(PDO $db, array $update): void
{
    $msg = $update['message'] ?? [];
    $chat = $msg['chat'] ?? [];
    $text = trim((string)($msg['text'] ?? ''));
    $chatId = $chat['id'] ?? null;
    if (!$chatId || ($chat['type'] ?? '') !== 'private') {
        return;
    }
    $chatId = (string)$chatId;
    $sender = $msg['from'] ?? [];
    $tgName = trim(implode(' ', array_filter([(string)($sender['first_name'] ?? ''), (string)($sender['last_name'] ?? '')])));
    if ($tgName === '' && !empty($sender['username'])) {
        $tgName = '@' . $sender['username'];
    }
    if (strpos($text, '/start') === 0) {
        $code = mb_substr(trim(substr($text, 6)), 0, 64);
        if ($code === '') {
            tg_call('sendMessage', ['chat_id' => $chatId, 'text' => 'Чтобы получать уведомления, нажмите «Подключить Telegram» в приложении.']);
            return;
        }
        $row = one_row($db, 'SELECT user_id FROM telegram_link_codes WHERE code = ? AND expires_at > ?', [$code, now_utc()]);
        run($db, 'DELETE FROM telegram_link_codes WHERE code = ?', [$code]);
        if (!$row) {
            tg_call('sendMessage', ['chat_id' => $chatId, 'text' => 'Ссылка устарела. Нажмите «Подключить Telegram» в приложении ещё раз.']);
            return;
        }
        $uid = (int)$row['user_id'];
        $role = one_value($db, 'SELECT role FROM app_users WHERE id = ? AND active = 1', [$uid]);
        if (!$role || !in_array($role, NOTIFY_ROLES, true)) {
            tg_call('sendMessage', ['chat_id' => $chatId, 'text' => 'Уведомления доступны только админам, управляющим, техникам и супер-админу.']);
            return;
        }
        run($db, 'DELETE FROM telegram_links WHERE chat_id = ? AND user_id <> ?', [$chatId, $uid]);
        upsert($db, 'telegram_links', ['user_id'], [
            'user_id' => $uid,
            'chat_id' => $chatId,
            'tg_name' => mb_substr($tgName, 0, 120),
            'linked_at' => now_utc(),
        ]);
        $name = (string)(one_value($db, "SELECT COALESCE(NULLIF(full_name, ''), username) FROM app_users WHERE id = ?", [$uid]) ?? '');
        tg_call('sendMessage', ['chat_id' => $chatId, 'text' => "Готово! Аккаунт «{$name}» подключён — уведомления будут приходить сюда."]);
        return;
    }
    if ($text === '/stop') {
        run($db, 'DELETE FROM telegram_links WHERE chat_id = ?', [$chatId]);
        tg_call('sendMessage', ['chat_id' => $chatId, 'text' => 'Уведомления отключены.']);
    }
}

$hookSecret = header_value('X-Telegram-Bot-Api-Secret-Token');
if ($hookSecret !== '') {
    if (bot_token() === '' || !hash_equals(webhook_secret(), $hookSecret)) {
        out(['ok' => false], 403);
    }
    try {
        $update = json_decode((string)file_get_contents('php://input'), true);
        handle_update($db, is_array($update) ? $update : []);
    } catch (Throwable $e) {
        error_log('[asap] telegram update failed: ' . $e->getMessage());
    }
    out(['ok' => true]);
}

function poll_updates(PDO $db): void
{
    $info = tg_call('getWebhookInfo', [], 4)['result'] ?? null;
    if (!is_array($info)) {
        return;
    }
    $hook = (string)($info['url'] ?? '');
    if ($hook !== '') {
        $broken = !empty($info['last_error_date']) && (time() - (int)$info['last_error_date']) < 600;
        if (!$broken || (int)($info['pending_update_count'] ?? 0) === 0) {
            return;
        }
        tg_call('deleteWebhook', ['drop_pending_updates' => false], 4);
    }
    $res = tg_call('getUpdates', ['timeout' => 0, 'limit' => 50, 'allowed_updates' => ['message']], 6);
    $updates = $res['result'] ?? [];
    if (!is_array($updates) || !$updates) {
        return;
    }
    $last = 0;
    foreach ($updates as $u) {
        $last = max($last, (int)($u['update_id'] ?? 0));
        try {
            handle_update($db, is_array($u) ? $u : []);
        } catch (Throwable $e) {
            error_log('[asap] telegram poll update failed: ' . $e->getMessage());
        }
    }
    if ($last) {
        tg_call('getUpdates', ['offset' => $last + 1, 'limit' => 1, 'timeout' => 0], 4);
    }
}

function hook_url(): string
{
    $given = (string)(body()['hookUrl'] ?? '');
    $host = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    if ($given !== '' && preg_match('#^https://([^/]+)/.*telegram\.php$#i', $given, $m) && strtolower($m[1]) === $host) {
        return $given;
    }
    $url = site_url() . '/api/telegram.php';
    $https = (($_SERVER['REQUEST_SCHEME'] ?? '') === 'https')
        || (($_SERVER['HTTP_X_FORWARDED_SSL'] ?? '') === 'on')
        || (strpos((string)($_SERVER['HTTP_CF_VISITOR'] ?? ''), 'https') !== false);
    return $https ? preg_replace('#^http://#', 'https://', $url) : $url;
}

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
if (method() === 'GET') {
    $pending = one_value($db, 'SELECT 1 FROM telegram_link_codes WHERE user_id = ? AND expires_at > ?', [$me['id'], now_utc()]);
    if ($pending && bot_token() !== '') {
        try {
            poll_updates($db);
        } catch (Throwable $e) {
            error_log('[asap] telegram poll failed: ' . $e->getMessage());
        }
    }
    out(link_status($db, $me['id'], $me['role']));
}

$body = body();
$action = (string)($body['action'] ?? '');

if ($action === 'unlink') {
    $chat = one_value($db, 'SELECT chat_id FROM telegram_links WHERE user_id = ?', [$me['id']]);
    run($db, 'DELETE FROM telegram_links WHERE user_id = ?', [$me['id']]);
    if ($chat) {
        tg_call('sendMessage', ['chat_id' => (string)$chat, 'text' => 'Уведомления отключены в приложении.'], 3);
    }
    out(link_status($db, $me['id'], $me['role']));
}

if ($action === 'link') {
    if (!in_array($me['role'], NOTIFY_ROLES, true)) {
        out(['error' => 'forbidden_role'], 403);
    }
    if (bot_token() === '') {
        out(['error' => 'not_configured'], 400);
    }
    $probe = tg_call('getMe', [], 5);
    if (!$probe) {
        out(['error' => 'telegram_unavailable', 'detail' => $GLOBALS['tg_last_error'] ?? ''], 502);
    }
    $bot = $probe['result'] ?? [];
    if (empty($bot['username'])) {
        out(['error' => 'bad_token'], 400);
    }
    $hookUrl = hook_url();
    $info = tg_call('getWebhookInfo', [], 4)['result'] ?? [];
    if (strpos($hookUrl, 'https://') === 0) {
        if (($info['url'] ?? '') !== $hookUrl || !empty($info['last_error_message'])) {
            $set = tg_call('setWebhook', ['url' => $hookUrl, 'secret_token' => webhook_secret(), 'allowed_updates' => ['message']], 4);
            if (empty($set['ok'])) {
                tg_call('deleteWebhook', ['drop_pending_updates' => false], 4);
            }
        }
    } elseif (($info['url'] ?? '') !== '') {
        tg_call('deleteWebhook', ['drop_pending_updates' => false], 4);
    }
    $code = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
    run($db, 'DELETE FROM telegram_link_codes WHERE user_id = ? OR expires_at < ?', [$me['id'], now_utc()]);
    run($db, 'INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)', [$code, $me['id'], now_utc(1800)]);
    out(['url' => 'https://t.me/' . $bot['username'] . '?start=' . $code, 'botName' => $bot['username']]);
}

out(['error' => 'bad_action'], 400);
