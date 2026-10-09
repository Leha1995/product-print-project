<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';

$db = boot();

$driver = (load_config()['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
foreach (schema_sql($driver) as $sql) {
    if (strpos($sql, 'print_') !== false) {
        $db->exec($sql);
    }
}

const POLL_WAIT = 1.5;
const ONLINE_SEC = 60;
const JOB_TTL_SEC = 600;
const MAX_DATA = 2000000;

function valid_ip(string $ip): bool
{
    return (bool)filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4);
}

function print_owner(array $me): int
{
    if ($me['role'] === 'user') {
        $head = one_value($GLOBALS['db'], 'SELECT manager_id FROM app_users WHERE id = ?', [$me['id']]);
        if ($head) {
            return (int)$head;
        }
    }
    return $me['id'];
}

function print_key_row(PDO $db, int $owner): array
{
    $row = one_row($db, 'SELECT print_key, printers, last_seen FROM print_keys WHERE owner_id = ?', [$owner]);
    if ($row) {
        return $row;
    }
    run(
        $db,
        'INSERT INTO print_keys (owner_id, print_key, printers, created_at) VALUES (?, ?, ?, ?)',
        [$owner, bin2hex(random_bytes(20)), '[]', now_utc()]
    );
    return one_row($db, 'SELECT print_key, printers, last_seen FROM print_keys WHERE owner_id = ?', [$owner]);
}

function team_ids(PDO $db, int $owner): array
{
    $ids = [$owner];
    $level = [$owner];
    for ($i = 0; $i < 8 && $level; $i++) {
        $rows = all_rows($db, 'SELECT id FROM app_users WHERE manager_id IN (' . in_list($level) . ')');
        $level = [];
        foreach ($rows as $r) {
            $id = (int)$r['id'];
            if (!in_array($id, $ids, true)) {
                $ids[] = $id;
                $level[] = $id;
            }
        }
    }
    return $ids;
}

function chain_ids(PDO $db, int $owner): array
{
    $ids = [$owner];
    $current = $owner;
    for ($i = 0; $i < 8; $i++) {
        $up = one_value($db, 'SELECT manager_id FROM app_users WHERE id = ?', [$current]);
        if (!$up || in_array((int)$up, $ids, true)) {
            break;
        }
        $current = (int)$up;
        $ids[] = $current;
    }
    return $ids;
}

function helper_online(PDO $db, int $owner): bool
{
    return (bool)one_value(
        $db,
        'SELECT 1 FROM print_keys WHERE owner_id IN (' . in_list(chain_ids($db, $owner)) . ') AND last_seen > ?',
        [now_utc(-ONLINE_SEC)]
    );
}

function clean_printers($raw): array
{
    $result = [];
    foreach (is_array($raw) ? $raw : [] as $p) {
        $ip = trim((string)($p['ip'] ?? ''));
        if (!valid_ip($ip)) {
            continue;
        }
        $port = (int)($p['port'] ?? 9100);
        $result[] = [
            'id' => mb_substr((string)($p['id'] ?? bin2hex(random_bytes(4))), 0, 40),
            'name' => mb_substr(trim((string)($p['name'] ?? $ip)) ?: $ip, 0, 60),
            'ip' => $ip,
            'port' => $port > 0 && $port < 65536 ? $port : 9100,
        ];
    }
    return array_slice($result, 0, 20);
}

function take_jobs(PDO $db, array $team): array
{
    $ids = in_list($team);
    run(
        $db,
        "UPDATE print_jobs SET status = 'expired' WHERE owner_id IN ($ids) AND status = 'pending' AND created_at < ?",
        [now_utc(-JOB_TTL_SEC)]
    );
    $rows = all_rows(
        $db,
        "SELECT id, printer_ip, printer_port, data FROM print_jobs WHERE owner_id IN ($ids) AND status = 'pending' ORDER BY id LIMIT 10"
    );
    $jobs = [];
    foreach ($rows as $r) {
        $taken = run(
            $db,
            "UPDATE print_jobs SET status = 'taken', taken_at = ? WHERE id = ? AND status = 'pending'",
            [now_utc(), (int)$r['id']]
        )->rowCount();
        if ($taken) {
            $jobs[] = ['id' => (int)$r['id'], 'ip' => $r['printer_ip'], 'port' => (int)$r['printer_port'], 'data' => $r['data']];
        }
    }
    return $jobs;
}

$body = body();
$action = (string)($body['action'] ?? ($_GET['action'] ?? ''));

$printKey = header_value('X-Print-Key');
if ($printKey !== '') {
    $owner = one_value($db, 'SELECT owner_id FROM print_keys WHERE print_key = ?', [$printKey]);
    if (!$owner) {
        out(['error' => 'bad_key'], 403);
    }
    $owner = (int)$owner;
    run($db, 'UPDATE print_keys SET last_seen = ? WHERE owner_id = ?', [now_utc(), $owner]);
    $team = team_ids($db, $owner);

    if ($action === 'report') {
        run(
            $db,
            'UPDATE print_jobs SET status = ?, error = ? WHERE id = ? AND owner_id IN (' . in_list($team) . ')',
            [!empty($body['ok']) ? 'done' : 'failed', mb_substr((string)($body['error'] ?? ''), 0, 250), (int)($body['id'] ?? 0)]
        );
        out(['ok' => true]);
    }

    $started = microtime(true);
    $jobs = take_jobs($db, $team);
    while (!$jobs && microtime(true) - $started < POLL_WAIT) {
        usleep(500000);
        $jobs = take_jobs($db, $team);
    }
    out(['jobs' => $jobs]);
}

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
$owner = print_owner($me);
$canSetup = in_array($me['role'], ['admin', 'superadmin', 'manager'], true);

if ($action === 'config') {
    $row = print_key_row($db, $owner);
    $printers = json_list($row['printers']);
    if (!$printers) {
        foreach (array_slice(chain_ids($db, $owner), 1) as $upper) {
            $printers = json_list(one_value($db, 'SELECT printers FROM print_keys WHERE owner_id = ?', [$upper]));
            if ($printers) {
                break;
            }
        }
    }
    out([
        'printers' => $printers,
        'online' => helper_online($db, $owner),
        'key' => $canSetup ? $row['print_key'] : null,
        'canSetup' => $canSetup,
    ]);
}

if ($action === 'printers') {
    if (!$canSetup) {
        out(['error' => 'forbidden'], 403);
    }
    print_key_row($db, $owner);
    $printers = clean_printers($body['printers'] ?? []);
    run($db, 'UPDATE print_keys SET printers = ? WHERE owner_id = ?', [json_text($printers), $owner]);
    out(['printers' => $printers]);
}

if ($action === 'regen_key') {
    if (!$canSetup) {
        out(['error' => 'forbidden'], 403);
    }
    print_key_row($db, $owner);
    $key = bin2hex(random_bytes(20));
    run($db, 'UPDATE print_keys SET print_key = ?, last_seen = NULL WHERE owner_id = ?', [$key, $owner]);
    out(['key' => $key]);
}

if ($action === 'job') {
    $ip = trim((string)($body['ip'] ?? ''));
    $data = (string)($body['data'] ?? '');
    if (!valid_ip($ip) || $data === '' || strlen($data) > MAX_DATA) {
        out(['error' => 'invalid_input'], 400);
    }
    $port = (int)($body['port'] ?? 9100) ?: 9100;
    run(
        $db,
        'INSERT INTO print_jobs (owner_id, printer_ip, printer_port, data, status, error, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [$owner, $ip, $port, $data, 'pending', '', $me['id'], now_utc()]
    );
    $id = (int)$db->lastInsertId();
    run($db, 'DELETE FROM print_jobs WHERE owner_id = ? AND created_at < ?', [$owner, now_utc(-2 * 86400)]);
    out(['id' => $id, 'online' => helper_online($db, $owner)]);
}

if ($action === 'status') {
    $row = one_row(
        $db,
        'SELECT status, error FROM print_jobs WHERE id = ? AND owner_id = ?',
        [(int)($_GET['id'] ?? ($body['id'] ?? 0)), $owner]
    );
    if (!$row) {
        out(['error' => 'not_found'], 404);
    }
    out(['status' => $row['status'], 'error' => $row['error'], 'online' => helper_online($db, $owner)]);
}

out(['error' => 'unknown_action'], 400);
