<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';

$db = boot();

function equipment_can_manage(PDO $db, array $me, int $target): bool
{
    if ($target === $me['id'] || $me['role'] === 'superadmin') {
        return true;
    }
    if ($me['role'] !== 'manager') {
        return false;
    }
    $row = one_row($db, 'SELECT role, manager_id FROM app_users WHERE id = ?', [$target]);
    if (!$row) {
        return false;
    }
    if ($row['role'] === 'admin') {
        return (int)$row['manager_id'] === $me['id'];
    }
    if ($row['role'] === 'user' && $row['manager_id']) {
        $head = one_value($db, "SELECT manager_id FROM app_users WHERE id = ? AND role = 'admin'", [(int)$row['manager_id']]);
        return (int)$head === $me['id'];
    }
    return false;
}

function read_items(PDO $db, int $uid): array
{
    $rows = all_rows(
        $db,
        'SELECT id, name, code, price, location, note, image, serial, active, created_at, qr_broken, written_off_at, write_off_reason '
        . 'FROM equipment WHERE user_id = ? ORDER BY active DESC, location, name',
        [$uid]
    );
    $pending = [];
    foreach (all_rows(
        $db,
        "SELECT t.equipment_id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name FROM equipment_transfers t "
        . "JOIN app_users u ON u.id = t.to_user WHERE t.from_user = ? AND t.status = 'pending' ORDER BY t.id",
        [$uid]
    ) as $t) {
        $pending[$t['equipment_id']] = (string)$t['name'];
    }
    return array_map(fn($r) => [
        'id' => $r['id'],
        'name' => $r['name'],
        'code' => $r['code'],
        'price' => (float)$r['price'],
        'location' => $r['location'],
        'note' => $r['note'],
        'image' => $r['image'],
        'serial' => $r['serial'],
        'active' => flag($r['active']),
        'createdAt' => iso($r['created_at'], true),
        'qrBroken' => flag($r['qr_broken']),
        'writtenOffAt' => iso($r['written_off_at'], true),
        'writeOffReason' => (string)$r['write_off_reason'],
        'transferTo' => $pending[$r['id']] ?? '',
    ], $rows);
}

function read_sessions(PDO $db, int $uid): array
{
    $rows = all_rows(
        $db,
        'SELECT id, started_at, finished_at, scanned, missing, total, total_price, missing_price '
        . 'FROM inventory_sessions WHERE user_id = ? ORDER BY started_at DESC LIMIT 100',
        [$uid]
    );
    return array_map(fn($r) => [
        'id' => (int)$r['id'],
        'startedAt' => iso($r['started_at'], true),
        'finishedAt' => iso($r['finished_at'], true),
        'scanned' => json_list($r['scanned']),
        'missing' => json_list($r['missing']),
        'total' => (int)$r['total'],
        'totalPrice' => (float)$r['total_price'],
        'missingPrice' => (float)$r['missing_price'],
    ], $rows);
}

function make_code(int $uid): string
{
    return 'EQ-' . $uid . '-' . strtoupper(bin2hex(random_bytes(4)));
}

function money($value): float
{
    return is_numeric($value) ? round((float)$value, 2) : 0.0;
}

const TRANSFER_PASSWORD = '1234';

function ensure_transfers(PDO $db): void
{
    $driver = (load_config()['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
    foreach (schema_sql($driver) as $sql) {
        if (strpos($sql, 'equipment_transfers') !== false) {
            $db->exec($sql);
        }
    }
}

function incoming_transfers(PDO $db, int $uid): array
{
    $rows = all_rows(
        $db,
        'SELECT t.id, t.created_at, e.name, e.code, e.price, e.location, e.serial, e.image, e.note, '
        . "COALESCE(NULLIF(u.full_name, ''), u.username) AS from_name FROM equipment_transfers t "
        . 'JOIN equipment e ON e.user_id = t.from_user AND e.id = t.equipment_id '
        . 'LEFT JOIN app_users u ON u.id = t.from_user '
        . "WHERE t.to_user = ? AND t.status = 'pending' ORDER BY t.created_at, t.id",
        [$uid]
    );
    return array_map(fn($r) => [
        'id' => (int)$r['id'],
        'createdAt' => iso($r['created_at'], true),
        'name' => $r['name'],
        'code' => $r['code'],
        'price' => (float)$r['price'],
        'location' => (string)$r['location'],
        'serial' => (string)$r['serial'],
        'image' => (string)$r['image'],
        'note' => (string)$r['note'],
        'fromName' => (string)$r['from_name'],
    ], $rows);
}

function decide_transfer(PDO $db, int $uid, array $me, array $body): array
{
    $tid = (int)($body['transferId'] ?? 0);
    $row = one_row(
        $db,
        "SELECT from_user, equipment_id FROM equipment_transfers WHERE id = ? AND to_user = ? AND status = 'pending'",
        [$tid, $uid]
    );
    if (!$row) {
        return ['error' => 'not_found', 'transfers' => incoming_transfers($db, $uid)];
    }
    $from = (int)$row['from_user'];
    $eid = (string)$row['equipment_id'];
    if (($body['action'] ?? '') === 'transfer_decline') {
        run(
            $db,
            "UPDATE equipment_transfers SET status = 'declined', decided_at = ?, decided_by = ? WHERE id = ?",
            [now_utc(), $me['id'], $tid]
        );
        return ['ok' => true, 'transfers' => incoming_transfers($db, $uid)];
    }
    $newId = $eid;
    if (one_value($db, 'SELECT 1 FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid])) {
        $newId = 'eq-' . substr(bin2hex(random_bytes(5)), 0, 10);
    }
    $moved = run(
        $db,
        'UPDATE equipment SET user_id = ?, id = ?, qr_broken = 0, updated_at = ? WHERE user_id = ? AND id = ?',
        [$uid, $newId, now_utc(), $from, $eid]
    )->rowCount();
    if (!$moved) {
        run($db, "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ? WHERE id = ?", [now_utc(), $tid]);
        return ['error' => 'not_found', 'transfers' => incoming_transfers($db, $uid)];
    }
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'accepted', decided_at = ?, decided_by = ? WHERE id = ?",
        [now_utc(), $me['id'], $tid]
    );
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ? WHERE from_user = ? AND equipment_id = ? AND status = 'pending'",
        [now_utc(), $from, $eid]
    );
    return ['ok' => true, 'transfers' => incoming_transfers($db, $uid)];
}

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
ensure_transfers($db);

if ($me['role'] === 'admin') {
    if (method() === 'GET' && ($_GET['transfers'] ?? '') === 'incoming') {
        out(['transfers' => incoming_transfers($db, $me['id'])]);
    }
    $adminBody = method() === 'POST' ? body() : [];
    if (in_array($adminBody['action'] ?? '', ['transfer_accept', 'transfer_decline'], true)) {
        out(decide_transfer($db, $me['id'], $me, $adminBody));
    }
    out(['error' => 'forbidden'], 403);
}
if (!in_array($me['role'], ['superadmin', 'manager'], true)) {
    out(['error' => 'forbidden'], 403);
}
$uid = target_user($db, $me, 'equipment_can_manage');

if (method() === 'GET' && ($_GET['transfers'] ?? '') === 'incoming') {
    out(['transfers' => incoming_transfers($db, $uid)]);
}

if (method() === 'GET' && ($_GET['report'] ?? '') === 'admins') {
    $sql = "SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM app_users "
        . "WHERE role = 'admin' AND active = 1 AND id <> ?";
    $params = [$uid];
    $rows = all_rows($db, $sql . ' ORDER BY name', $params);
    out(['admins' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => (string)$r['name']], $rows)]);
}

if (method() === 'GET') {
    out(['items' => read_items($db, $uid), 'sessions' => read_sessions($db, $uid)]);
}

$body = body();
$action = (string)($body['action'] ?? '');
$reason = (string)($body['reason'] ?? '') ?: 'Списано при инвентаризации';

if (method() === 'DELETE') {
    run($db, 'DELETE FROM equipment WHERE user_id = ? AND id = ?', [$uid, (string)($body['id'] ?? '')]);
    out(['ok' => true, 'items' => read_items($db, $uid)]);
}

if (in_array($action, ['transfer_accept', 'transfer_decline'], true)) {
    $res = decide_transfer($db, $uid, $me, $body);
    $res['items'] = read_items($db, $uid);
    out($res);
}

if ($action === 'transfer') {
    if ((string)($body['password'] ?? '') !== TRANSFER_PASSWORD) {
        out(['error' => 'bad_password'], 403);
    }
    $toUser = (int)($body['toUser'] ?? 0);
    $eid = (string)($body['id'] ?? '');
    $isAdmin = one_value($db, "SELECT 1 FROM app_users WHERE id = ? AND role = 'admin' AND active = 1", [$toUser]);
    if (!$isAdmin || $toUser === $uid) {
        out(['error' => 'bad_target'], 400);
    }
    $row = one_row($db, 'SELECT active FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid]);
    if (!$row || !flag($row['active'])) {
        out(['error' => 'not_found'], 404);
    }
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ? WHERE from_user = ? AND equipment_id = ? AND status = 'pending'",
        [now_utc(), $uid, $eid]
    );
    run(
        $db,
        'INSERT INTO equipment_transfers (equipment_id, from_user, to_user, created_by, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [$eid, $uid, $toUser, $me['id'], 'pending', now_utc()]
    );
    out(['ok' => true, 'items' => read_items($db, $uid)]);
}

if ($action === 'transfer_cancel') {
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ?, decided_by = ? WHERE from_user = ? AND equipment_id = ? AND status = 'pending'",
        [now_utc(), $me['id'], $uid, (string)($body['id'] ?? '')]
    );
    out(['ok' => true, 'items' => read_items($db, $uid)]);
}

if ($action === 'resolve') {
    $eid = (string)($body['id'] ?? '');
    $mode = (string)($body['mode'] ?? '');
    if ($mode === 'qr_broken') {
        run($db, 'UPDATE equipment SET qr_broken = 1, updated_at = ? WHERE user_id = ? AND id = ?', [now_utc(), $uid, $eid]);
    } elseif ($mode === 'write_off') {
        run(
            $db,
            'UPDATE equipment SET active = 0, written_off_at = ?, write_off_reason = ?, updated_at = ? WHERE user_id = ? AND id = ?',
            [now_utc(), $reason, now_utc(), $uid, $eid]
        );
    } else {
        out(['error' => 'bad_mode'], 400);
    }
    $sessionId = (int)($body['sessionId'] ?? 0);
    if ($sessionId) {
        $row = one_row($db, 'SELECT scanned, missing, total, total_price FROM inventory_sessions WHERE user_id = ? AND id = ?', [$uid, $sessionId]);
        if ($row) {
            $scanned = json_list($row['scanned']);
            $missing = array_values(array_filter(json_list($row['missing']), fn($m) => $m !== $eid));
            $total = (int)$row['total'];
            $totalPrice = (float)$row['total_price'];
            $price = (float)(one_value($db, 'SELECT price FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid]) ?? 0);
            if ($mode === 'qr_broken') {
                if (!in_array($eid, $scanned, true)) {
                    $scanned[] = $eid;
                }
            } else {
                $total = max(0, $total - 1);
                $totalPrice = max(0.0, $totalPrice - $price);
            }
            $missingPrice = 0.0;
            if ($missing) {
                $missingPrice = (float)one_value(
                    $db,
                    'SELECT COALESCE(SUM(price), 0) FROM equipment WHERE user_id = ? AND id IN (' . implode(', ', array_fill(0, count($missing), '?')) . ')',
                    array_merge([$uid], $missing)
                );
            }
            run(
                $db,
                'UPDATE inventory_sessions SET scanned = ?, missing = ?, total = ?, total_price = ?, missing_price = ? WHERE user_id = ? AND id = ?',
                [json_text($scanned), json_text($missing), $total, money($totalPrice), money($missingPrice), $uid, $sessionId]
            );
        }
    }
    out(['ok' => true, 'items' => read_items($db, $uid), 'sessions' => read_sessions($db, $uid)]);
}

if ($action === 'qr_fixed') {
    $code = make_code($uid);
    run($db, 'UPDATE equipment SET qr_broken = 0, code = ?, updated_at = ? WHERE user_id = ? AND id = ?', [$code, now_utc(), $uid, (string)($body['id'] ?? '')]);
    out(['ok' => true, 'code' => $code, 'items' => read_items($db, $uid)]);
}

if ($action === 'write_off') {
    run(
        $db,
        'UPDATE equipment SET active = 0, written_off_at = ?, write_off_reason = ?, updated_at = ? WHERE user_id = ? AND id = ?',
        [now_utc(), $reason, now_utc(), $uid, (string)($body['id'] ?? '')]
    );
    out(['ok' => true, 'items' => read_items($db, $uid)]);
}

if ($action === 'restore') {
    run(
        $db,
        "UPDATE equipment SET active = 1, written_off_at = NULL, write_off_reason = '', updated_at = ? WHERE user_id = ? AND id = ?",
        [now_utc(), $uid, (string)($body['id'] ?? '')]
    );
    out(['ok' => true, 'items' => read_items($db, $uid)]);
}

if ($action === 'finish') {
    $scannedCodes = array_map('strval', (array)($body['scanned'] ?? []));
    $active = array_values(array_filter(read_items($db, $uid), fn($i) => $i['active'] && $i['transferTo'] === ''));
    $found = array_values(array_filter($active, fn($i) => in_array($i['code'], $scannedCodes, true)));
    $missing = array_values(array_filter($active, fn($i) => !in_array($i['code'], $scannedCodes, true)));
    $totalPrice = array_sum(array_column($active, 'price'));
    $missingPrice = array_sum(array_column($missing, 'price'));
    run(
        $db,
        'INSERT INTO inventory_sessions (user_id, started_by, started_at, finished_at, scanned, missing, total, total_price, missing_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$uid, $me['id'], now_utc(), now_utc(), json_text(array_column($found, 'id')), json_text(array_column($missing, 'id')), count($active), money($totalPrice), money($missingPrice)]
    );
    out([
        'ok' => true,
        'sessionId' => (int)$db->lastInsertId(),
        'found' => $found,
        'missing' => $missing,
        'total' => count($active),
        'totalPrice' => $totalPrice,
        'missingPrice' => $missingPrice,
        'sessions' => read_sessions($db, $uid),
    ]);
}

$items = $body['items'] ?? (!empty($body['item']) ? [$body['item']] : []);
$saved = 0;
foreach ((array)$items as $item) {
    if (!is_array($item)) {
        continue;
    }
    $name = trim((string)($item['name'] ?? ''));
    if ($name === '') {
        continue;
    }
    $eid = (string)($item['id'] ?? '') ?: 'eq-' . substr(bin2hex(random_bytes(5)), 0, 10);
    $code = trim((string)($item['code'] ?? '')) ?: make_code($uid);
    $exists = one_value($db, 'SELECT 1 FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid]);
    $data = [
        'user_id' => $uid,
        'id' => $eid,
        'name' => $name,
        'code' => $code,
        'price' => money($item['price'] ?? 0),
        'location' => (string)($item['location'] ?? ''),
        'note' => (string)($item['note'] ?? ''),
        'image' => clean_image((string)($item['image'] ?? ''), 'equipment', $eid),
        'serial' => (string)($item['serial'] ?? ''),
        'active' => ($item['active'] ?? true) === false ? 0 : 1,
        'updated_at' => now_utc(),
    ];
    if (!$exists) {
        $data['created_at'] = now_utc();
    }
    upsert($db, 'equipment', ['user_id', 'id'], $data);
    $saved++;
}
out(['saved' => $saved, 'items' => read_items($db, $uid)]);
