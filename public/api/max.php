<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';

$db = boot();
upgrade_schema($db);

function max_status(PDO $db, int $uid, string $role): array
{
    $row = one_row($db, 'SELECT max_name, linked_at FROM max_links WHERE user_id = ?', [$uid]);
    return [
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
    max_send($maxUid, "Готово! Аккаунт «{$name}» подключён — уведомления будут приходить сюда.");
}

function max_poll(PDO $db): void
{
    $marker = one_value($db, 'SELECT marker FROM max_state WHERE id = 1');
    $query = ['timeout' => 0, 'limit' => 100, 'types' => 'bot_started,message_created'];
    if ($marker) {
        $query['marker'] = $marker;
    }
    [$code, $data] = max_call('GET', '/updates', $query, null, 6);
    if ($code !== 200) {
        return;
    }
    foreach ($data['updates'] ?? [] as $u) {
        try {
            $type = $u['update_type'] ?? '';
            if ($type === 'bot_started') {
                max_apply_code($db, (string)($u['payload'] ?? ''), (array)($u['user'] ?? []));
            } elseif ($type === 'message_created') {
                $msg = (array)($u['message'] ?? []);
                $text = trim((string)($msg['body']['text'] ?? ''));
                $sender = (array)($msg['sender'] ?? []);
                if (strpos($text, '/start') === 0) {
                    max_apply_code($db, trim(substr($text, 6)), $sender);
                } elseif ($text === '/stop' && !empty($sender['user_id'])) {
                    run($db, 'DELETE FROM max_links WHERE max_user_id = ?', [(int)$sender['user_id']]);
                    max_send((int)$sender['user_id'], 'Уведомления отключены.');
                }
            }
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
    $linkCode = rtrim(strtr(base64_encode(random_bytes(12)), '+/', '-_'), '=');
    run($db, 'DELETE FROM max_link_codes WHERE user_id = ? OR expires_at < ?', [$me['id'], now_utc()]);
    run($db, 'INSERT INTO max_link_codes (code, user_id, expires_at) VALUES (?, ?, ?)', [$linkCode, $me['id'], now_utc(1800)]);
    out(['url' => 'https://max.ru/' . $bot['username'] . '?start=' . $linkCode, 'botName' => $bot['username']]);
}

out(['error' => 'bad_action'], 400);
