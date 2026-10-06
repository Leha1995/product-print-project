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

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
if (method() === 'GET') {
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
    $hookUrl = site_url() . '/api/telegram.php';
    $info = tg_call('getWebhookInfo', [], 3)['result'] ?? [];
    if (strpos($hookUrl, 'https://') === 0 && ($info['url'] ?? '') !== $hookUrl) {
        tg_call('setWebhook', ['url' => $hookUrl, 'secret_token' => webhook_secret(), 'allowed_updates' => ['message']], 3);
    }
    $bot = tg_call('getMe', [], 3)['result'] ?? [];
    if (empty($bot['username'])) {
        out(['error' => 'bad_token'], 400);
    }
    $code = rtrim(strtr(base64_encode(random_bytes(18)), '+/', '-_'), '=');
    run($db, 'DELETE FROM telegram_link_codes WHERE user_id = ? OR expires_at < ?', [$me['id'], now_utc()]);
    run($db, 'INSERT INTO telegram_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)', [$code, $me['id'], now_utc(1800)]);
    out(['url' => 'https://t.me/' . $bot['username'] . '?start=' . $code, 'botName' => $bot['username']]);
}

out(['error' => 'bad_action'], 400);
