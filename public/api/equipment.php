<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';

$db = boot();
upgrade_schema($db);

const TRANSFER_PASSWORD = '1234';
const PRIORITIES = ['urgent', 'soon', 'normal'];

function money($value): float
{
    if (!is_numeric($value)) {
        return 0.0;
    }
    $v = (float)$value;
    if (!is_finite($v) || $v < 0 || $v > 1e9) {
        return 0.0;
    }
    return round($v, 2);
}

function signed_money($value): float
{
    return is_numeric($value) ? round((float)$value, 2) : 0.0;
}

function day_value($value): ?string
{
    $raw = substr(trim((string)$value), 0, 10);
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $raw)) {
        return null;
    }
    [$y, $m, $d] = array_map('intval', explode('-', $raw));
    return checkdate($m, $d, $y) ? $raw : null;
}

function next_day(string $day): string
{
    return gmdate('Y-m-d', strtotime($day . ' 00:00:00 UTC') + 86400);
}

function make_code(int $uid): string
{
    return 'EQ-' . $uid . '-' . strtoupper(bin2hex(random_bytes(4)));
}

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

function technician_owners(PDO $db, int $techId): ?array
{
    $heads = all_rows(
        $db,
        'SELECT s.head_id, u.role FROM technician_scopes s LEFT JOIN app_users u ON u.id = s.head_id WHERE s.technician_id = ?',
        [$techId]
    );
    if (!$heads) {
        return null;
    }
    $owners = [];
    foreach ($heads as $h) {
        if ($h['role'] === 'superadmin') {
            return null;
        }
        $owners[(int)$h['head_id']] = true;
        if ($h['role'] === 'manager') {
            foreach (all_rows($db, "SELECT id FROM app_users WHERE role = 'admin' AND manager_id = ?", [(int)$h['head_id']]) as $a) {
                $owners[(int)$a['id']] = true;
            }
        }
    }
    $list = array_keys($owners);
    sort($list);
    return $list;
}

function owner_scope_sql(?array $owners, string $col): string
{
    return $owners === null ? '' : " AND $col IN (" . in_list($owners) . ')';
}

function owner_technicians(PDO $db, int $uid): array
{
    $row = one_row($db, 'SELECT role, manager_id FROM app_users WHERE id = ?', [$uid]);
    $heads = [$uid];
    if ($row && $row['role'] === 'admin' && $row['manager_id']) {
        $heads[] = (int)$row['manager_id'];
    }
    $rows = all_rows(
        $db,
        "SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name FROM app_users u "
        . "WHERE u.role = 'technician' AND u.active = 1 AND ("
        . 'NOT EXISTS (SELECT 1 FROM technician_scopes s WHERE s.technician_id = u.id) '
        . 'OR EXISTS (SELECT 1 FROM technician_scopes s LEFT JOIN app_users h ON h.id = s.head_id '
        . "WHERE s.technician_id = u.id AND (s.head_id IN (" . in_list($heads) . ") OR h.role = 'superadmin'))"
        . ') ORDER BY name'
    );
    return array_map(fn($r) => ['id' => (int)$r['id'], 'name' => (string)$r['name']], $rows);
}

function read_repairs(PDO $db, int $uid): array
{
    $out = [];
    $rows = all_rows(
        $db,
        'SELECT id, equipment_id, sent_at, returned_at, cost, description, photos FROM equipment_repairs '
        . 'WHERE user_id = ? ORDER BY sent_at DESC, id DESC',
        [$uid]
    );
    foreach ($rows as $r) {
        $out[$r['equipment_id']][] = [
            'id' => (int)$r['id'],
            'sentAt' => iso($r['sent_at'], true),
            'returnedAt' => iso($r['returned_at'], true),
            'cost' => (float)$r['cost'],
            'description' => (string)$r['description'],
            'photos' => json_list($r['photos']),
        ];
    }
    return $out;
}

function read_items(PDO $db, int $uid): array
{
    $repairs = read_repairs($db, $uid);
    $pending = [];
    foreach (all_rows(
        $db,
        "SELECT t.equipment_id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name FROM equipment_transfers t "
        . "JOIN app_users u ON u.id = t.to_user WHERE t.from_user = ? AND t.status = 'pending' ORDER BY t.id",
        [$uid]
    ) as $t) {
        $pending[$t['equipment_id']] = (string)$t['name'];
    }
    $rows = all_rows(
        $db,
        'SELECT id, name, code, price, location, note, image, serial, active, created_at, qr_broken, written_off_at, '
        . 'write_off_reason, commissioned_at, depreciation_per_day, repair_cost, in_repair, repair_sent_at '
        . 'FROM equipment WHERE user_id = ? ORDER BY active DESC, location, name',
        [$uid]
    );
    return array_map(fn($r) => [
        'id' => $r['id'],
        'name' => $r['name'],
        'code' => $r['code'],
        'price' => (float)$r['price'],
        'location' => (string)$r['location'],
        'note' => (string)$r['note'],
        'image' => (string)$r['image'],
        'serial' => (string)$r['serial'],
        'active' => flag($r['active']),
        'createdAt' => iso($r['created_at'], true),
        'qrBroken' => flag($r['qr_broken']),
        'writtenOffAt' => iso($r['written_off_at'], true),
        'writeOffReason' => (string)$r['write_off_reason'],
        'commissionedAt' => $r['commissioned_at'] ? substr((string)$r['commissioned_at'], 0, 10) : null,
        'depreciationPerDay' => (float)$r['depreciation_per_day'],
        'repairCost' => (float)$r['repair_cost'],
        'inRepair' => flag($r['in_repair']),
        'repairSentAt' => iso($r['repair_sent_at'], true),
        'repairs' => $repairs[$r['id']] ?? [],
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

const TASK_SQL = 'SELECT t.id, t.user_id, t.equipment_id, t.technician_id, t.description, t.photos, t.status, '
    . 't.created_at, t.done_at, t.done_comment, e.name AS eq_name, e.location AS eq_location, e.code AS eq_code, '
    . "COALESCE(NULLIF(o.full_name, ''), o.username) AS owner_name, "
    . "COALESCE(NULLIF(tu.full_name, ''), tu.username) AS tech_name, "
    . "COALESCE(NULLIF(cu.full_name, ''), cu.username) AS created_name, "
    . "COALESCE(NULLIF(du.full_name, ''), du.username) AS done_name, "
    . 't.priority, t.cost, t.kind '
    . 'FROM equipment_tasks t '
    . 'LEFT JOIN equipment e ON e.user_id = t.user_id AND e.id = t.equipment_id '
    . 'LEFT JOIN app_users o ON o.id = t.user_id '
    . 'LEFT JOIN app_users tu ON tu.id = t.technician_id '
    . 'LEFT JOIN app_users cu ON cu.id = t.created_by '
    . 'LEFT JOIN app_users du ON du.id = t.done_by ';

function task_rows(PDO $db, string $where, array $params = [], int $limit = 200): array
{
    $rows = all_rows(
        $db,
        TASK_SQL . "WHERE $where ORDER BY CASE WHEN t.status = 'open' THEN 0 ELSE 1 END, "
        . "CASE WHEN t.status = 'open' THEN (CASE t.priority WHEN 'urgent' THEN 0 WHEN 'soon' THEN 1 ELSE 2 END) ELSE 0 END, "
        . 't.created_at DESC LIMIT ' . (int)$limit,
        $params
    );
    return array_map(fn($r) => [
        'id' => (int)$r['id'],
        'ownerId' => (int)$r['user_id'],
        'equipmentId' => $r['equipment_id'] ?: null,
        'technicianId' => $r['technician_id'] === null ? null : (int)$r['technician_id'],
        'description' => (string)$r['description'],
        'photos' => json_list($r['photos']),
        'status' => $r['status'],
        'createdAt' => iso($r['created_at'], true),
        'doneAt' => iso($r['done_at'], true),
        'doneComment' => (string)$r['done_comment'],
        'equipmentName' => (string)$r['eq_name'],
        'location' => (string)$r['eq_location'],
        'code' => (string)$r['eq_code'],
        'ownerName' => (string)$r['owner_name'],
        'technicianName' => (string)$r['tech_name'],
        'createdByName' => (string)$r['created_name'],
        'doneByName' => (string)$r['done_name'],
        'priority' => in_array($r['priority'], PRIORITIES, true) ? $r['priority'] : 'normal',
        'cost' => (float)$r['cost'],
        'kind' => $r['kind'] ?: 'task',
    ], $rows);
}

function owner_tasks(PDO $db, int $uid): array
{
    return task_rows($db, "t.user_id = ? AND (t.status = 'open' OR t.done_at > ?)", [$uid, now_utc(-30 * 86400)]);
}

function technician_tasks(PDO $db, int $techId): array
{
    $scope = owner_scope_sql(technician_owners($db, $techId), 't.user_id');
    return task_rows(
        $db,
        "(t.technician_id IS NULL OR t.technician_id = ?)$scope AND (t.status = 'open' OR t.done_at > ?)",
        [$techId, now_utc(-7 * 86400)]
    );
}

function technician_items(PDO $db, int $techId): array
{
    $scope = owner_scope_sql(technician_owners($db, $techId), 'e.user_id');
    $rows = all_rows(
        $db,
        'SELECT e.user_id, e.id, e.name, e.code, e.location, e.serial, e.image, e.repair_sent_at, e.repair_cost, '
        . "COALESCE(NULLIF(u.full_name, ''), u.username) AS owner_name "
        . 'FROM equipment e LEFT JOIN app_users u ON u.id = e.user_id '
        . "WHERE e.in_repair = 1 AND e.active = 1$scope ORDER BY e.repair_sent_at"
    );
    return array_map(function ($r) use ($db) {
        $open = one_row(
            $db,
            'SELECT description, photos FROM equipment_repairs WHERE user_id = ? AND equipment_id = ? AND returned_at IS NULL ORDER BY sent_at DESC LIMIT 1',
            [(int)$r['user_id'], $r['id']]
        );
        return [
            'ownerId' => (int)$r['user_id'],
            'id' => $r['id'],
            'name' => $r['name'],
            'code' => $r['code'],
            'location' => (string)$r['location'],
            'serial' => (string)$r['serial'],
            'image' => (string)$r['image'],
            'repairSentAt' => iso($r['repair_sent_at'], true),
            'repairCost' => (float)$r['repair_cost'],
            'ownerName' => (string)$r['owner_name'],
            'description' => (string)($open['description'] ?? ''),
            'photos' => json_list($open['photos'] ?? null),
        ];
    }, $rows);
}

function technician_month_stats(PDO $db, int $techId, string $month): array
{
    $current = gmdate('Y-m') . '-01';
    $start = day_value(substr($month, 0, 7) . '-01') ?? $current;
    if ($start > $current || $start < '2000-01-01') {
        $start = $current;
    }
    $end = gmdate('Y-m-d', strtotime($start . ' 00:00:00 UTC +1 month'));
    $t = one_row(
        $db,
        "SELECT COUNT(*) AS cnt, COALESCE(SUM(CASE WHEN kind <> 'repair' THEN cost ELSE 0 END), 0) AS spent, "
        . "COALESCE(SUM(CASE WHEN priority = 'urgent' THEN 1 ELSE 0 END), 0) AS urgent FROM equipment_tasks "
        . "WHERE status = 'done' AND done_by = ? AND done_at >= ? AND done_at < ?",
        [$techId, $start, $end]
    );
    $r = one_row(
        $db,
        'SELECT COUNT(*) AS cnt, COALESCE(SUM(cost), 0) AS spent FROM equipment_repairs WHERE returned_by = ? AND returned_at >= ? AND returned_at < ?',
        [$techId, $start, $end]
    );
    $tasksCost = (float)($t['spent'] ?? 0);
    $repairsCost = (float)($r['spent'] ?? 0);
    return [
        'month' => substr($start, 0, 7),
        'isCurrent' => $start === $current,
        'tasksDone' => (int)($t['cnt'] ?? 0),
        'urgentDone' => (int)($t['urgent'] ?? 0),
        'tasksCost' => $tasksCost,
        'repairsReturned' => (int)($r['cnt'] ?? 0),
        'repairsCost' => $repairsCost,
        'totalCost' => round($tasksCost + $repairsCost, 2),
    ];
}

function tasks_report(PDO $db, int $uid, int $sessionId): array
{
    $end = now_utc();
    if ($sessionId) {
        $fin = one_value($db, 'SELECT finished_at FROM inventory_sessions WHERE user_id = ? AND id = ?', [$uid, $sessionId]);
        if ($fin) {
            $end = (string)$fin;
        }
    }
    $prev = one_value(
        $db,
        'SELECT MAX(finished_at) FROM inventory_sessions WHERE user_id = ? AND finished_at IS NOT NULL AND finished_at < ? AND id <> ?',
        [$uid, $end, $sessionId]
    );
    $start = $prev ? (string)$prev : '1970-01-01 00:00:00';
    $tasks = task_rows(
        $db,
        "t.user_id = ? AND t.status <> 'cancelled' AND t.created_at <= ? AND (t.done_at IS NULL OR t.done_at > ?)",
        [$uid, $end, $start],
        2000
    );
    return ['tasks' => $tasks, 'from' => $prev ? iso((string)$prev, true) : null, 'to' => iso($end, true)];
}

function upload_photos($list, string $folder, string $prefix): array
{
    $out = [];
    foreach (array_slice(is_array($list) ? $list : [], 0, 4) as $raw) {
        if (is_string($raw) && strpos($raw, 'data:image/') === 0) {
            $url = save_image($raw, $folder, $prefix);
            if ($url !== '') {
                $out[] = $url;
            }
        }
    }
    return $out;
}

function cleanup_photos(PDO $db): void
{
    $border = now_utc(-86400);
    $sets = [
        ['equipment_repairs', 'returned_at', 'returned_at IS NOT NULL AND returned_at < ?'],
        ['equipment_tasks', 'done_at', "status <> 'open' AND done_at IS NOT NULL AND done_at < ?"],
    ];
    foreach ($sets as [$table, $order, $where]) {
        $rows = all_rows(
            $db,
            "SELECT id, photos FROM $table WHERE $where AND photos IS NOT NULL AND photos <> '[]' AND photos <> '' ORDER BY $order LIMIT 10",
            [$border]
        );
        foreach ($rows as $r) {
            foreach (json_list($r['photos']) as $url) {
                $pos = strpos((string)$url, '/uploads/');
                if ($pos === false) {
                    continue;
                }
                $rel = substr((string)$url, $pos + strlen('/uploads/'));
                if (preg_match('~^(repairs|tasks)/[A-Za-z0-9_.-]+$~', $rel)) {
                    $found = find_upload($rel);
                    if ($found) {
                        @unlink($found);
                    }
                }
            }
            run($db, "UPDATE $table SET photos = '[]' WHERE id = ?", [(int)$r['id']]);
        }
    }
}

function return_repair(PDO $db, int $uid, array $body, int $byUser, bool $closeTask = true): void
{
    $cost = money($body['cost'] ?? 0);
    $eid = (string)($body['id'] ?? '');
    $hasDesc = array_key_exists('description', $body) && $body['description'] !== null;
    $desc = mb_substr(trim((string)($body['description'] ?? '')), 0, 1000);
    $openId = one_value(
        $db,
        'SELECT id FROM equipment_repairs WHERE user_id = ? AND equipment_id = ? AND returned_at IS NULL ORDER BY sent_at DESC LIMIT 1',
        [$uid, $eid]
    );
    if ($openId) {
        if ($hasDesc) {
            run($db, 'UPDATE equipment_repairs SET returned_at = ?, returned_by = ?, cost = ?, description = ? WHERE id = ?', [now_utc(), $byUser ?: null, $cost, $desc, (int)$openId]);
        } else {
            run($db, 'UPDATE equipment_repairs SET returned_at = ?, returned_by = ?, cost = ? WHERE id = ?', [now_utc(), $byUser ?: null, $cost, (int)$openId]);
        }
    } else {
        $eq = one_row($db, 'SELECT repair_sent_at FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid]);
        if ($eq) {
            run(
                $db,
                "INSERT INTO equipment_repairs (user_id, equipment_id, sent_at, returned_at, cost, description, photos, returned_by) VALUES (?, ?, ?, ?, ?, ?, '[]', ?)",
                [$uid, $eid, $eq['repair_sent_at'] ?: now_utc(), now_utc(), $cost, $desc, $byUser ?: null]
            );
        }
    }
    run(
        $db,
        'UPDATE equipment SET in_repair = 0, repair_sent_at = NULL, repair_cost = COALESCE(repair_cost, 0) + ?, updated_at = ? WHERE user_id = ? AND id = ?',
        [$cost, now_utc(), $uid, $eid]
    );
    if ($closeTask) {
        run(
            $db,
            "UPDATE equipment_tasks SET status = 'done', done_at = ?, cost = ?, done_by = ?, done_comment = ? "
            . "WHERE user_id = ? AND equipment_id = ? AND kind = 'repair' AND status = 'open'",
            [now_utc(), $cost, $byUser ?: null, $desc !== '' ? $desc : 'Возвращено из ремонта', $uid, $eid]
        );
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
        run($db, "UPDATE equipment_transfers SET status = 'declined', decided_at = ?, decided_by = ? WHERE id = ?", [now_utc(), $me['id'], $tid]);
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
    run($db, 'UPDATE equipment_repairs SET user_id = ?, equipment_id = ? WHERE user_id = ? AND equipment_id = ?', [$uid, $newId, $from, $eid]);
    run($db, "UPDATE equipment_transfers SET status = 'accepted', decided_at = ?, decided_by = ? WHERE id = ?", [now_utc(), $me['id'], $tid]);
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ? WHERE from_user = ? AND equipment_id = ? AND status = 'pending'",
        [now_utc(), $from, $eid]
    );
    return ['ok' => true, 'transfers' => incoming_transfers($db, $uid)];
}

function period_sql(string $col, array &$params): string
{
    $sql = '';
    $from = day_value($_GET['from'] ?? '');
    $to = day_value($_GET['to'] ?? '');
    if ($from) {
        $sql .= " AND $col >= ?";
        $params[] = $from;
    }
    if ($to) {
        $sql .= " AND $col < ?";
        $params[] = next_day($to);
    }
    return $sql;
}

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
if (method() === 'GET') {
    cleanup_photos($db);
}
$month = (string)($_GET['month'] ?? '');
$viewTech = (string)($_GET['viewTech'] ?? '');

if (method() === 'GET' && $viewTech !== '') {
    if ($me['role'] !== 'superadmin' || !ctype_digit($viewTech)) {
        out(['error' => 'forbidden'], 403);
    }
    $tech = one_row($db, "SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM app_users WHERE id = ? AND role = 'technician'", [(int)$viewTech]);
    if (!$tech) {
        out(['error' => 'not_found'], 404);
    }
    $tid = (int)$tech['id'];
    out([
        'repairs' => technician_items($db, $tid),
        'tasks' => technician_tasks($db, $tid),
        'technicianName' => (string)$tech['name'],
        'stats' => technician_month_stats($db, $tid, $month),
    ]);
}

if ($me['role'] === 'technician') {
    $tid = $me['id'];
    if (method() === 'GET') {
        out(['repairs' => technician_items($db, $tid), 'tasks' => technician_tasks($db, $tid), 'stats' => technician_month_stats($db, $tid, $month)]);
    }
    $tbody = body();
    if (($tbody['action'] ?? '') === 'task_done') {
        $taskId = (int)($tbody['taskId'] ?? 0);
        $visible = array_column(array_filter(technician_tasks($db, $tid), fn($t) => $t['status'] === 'open'), 'id');
        if (!in_array($taskId, $visible, true)) {
            out(['error' => 'not_found', 'tasks' => technician_tasks($db, $tid)], 409);
        }
        $cost = money($tbody['cost'] ?? 0);
        $comment = mb_substr(trim((string)($tbody['comment'] ?? '')), 0, 1000);
        $done = run(
            $db,
            "UPDATE equipment_tasks SET status = 'done', done_at = ?, cost = ?, done_by = ?, done_comment = ? WHERE id = ? AND status = 'open'",
            [now_utc(), $cost, $tid, $comment, $taskId]
        )->rowCount();
        if ($done) {
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
            notify_task_done($db, $taskId);
        }
        out(['ok' => true, 'tasks' => technician_tasks($db, $tid), 'repairs' => technician_items($db, $tid)]);
    }
    if (($tbody['action'] ?? '') !== 'return_repair') {
        out(['error' => 'forbidden'], 403);
    }
    $owner = (int)($tbody['ownerId'] ?? 0);
    $owners = technician_owners($db, $tid);
    if (!$owner || ($owners !== null && !in_array($owner, $owners, true))) {
        out(['error' => 'forbidden'], 403);
    }
    if (!one_value($db, 'SELECT 1 FROM equipment WHERE user_id = ? AND id = ? AND in_repair = 1', [$owner, (string)($tbody['id'] ?? '')])) {
        out(['error' => 'not_in_repair', 'repairs' => technician_items($db, $tid)], 409);
    }
    return_repair($db, $owner, $tbody, $tid);
    out(['ok' => true, 'repairs' => technician_items($db, $tid), 'tasks' => technician_tasks($db, $tid)]);
}

if ($me['role'] === 'accountant') {
    if (method() !== 'GET') {
        out(['error' => 'read_only'], 403);
    }
    $report = (string)($_GET['report'] ?? '');
    $aid = $me['id'];

    if ($report === 'technicians') {
        $techs = all_rows(
            $db,
            "SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name FROM accountant_technicians a "
            . "JOIN app_users u ON u.id = a.technician_id WHERE a.accountant_id = ? AND u.role = 'technician' ORDER BY name",
            [$aid]
        );
        $result = [];
        foreach ($techs as $t) {
            $tid = (int)$t['id'];
            $p = [$tid];
            $donePeriod = period_sql('t.done_at', $p);
            $done = task_rows($db, "t.status = 'done' AND t.done_by = ?$donePeriod", $p, 5000);
            $scope = owner_scope_sql(technician_owners($db, $tid), 't.user_id');
            $open = task_rows($db, "t.status = 'open' AND (t.technician_id IS NULL OR t.technician_id = ?)$scope", [$tid], 1000);
            $rp = [$tid];
            $repPeriod = period_sql('r.returned_at', $rp);
            $reps = all_rows(
                $db,
                'SELECT r.id, r.user_id, r.equipment_id, r.sent_at, r.returned_at, r.cost, r.description, '
                . "e.name AS eq_name, e.location AS eq_location, COALESCE(NULLIF(o.full_name, ''), o.username) AS owner_name "
                . 'FROM equipment_repairs r LEFT JOIN equipment e ON e.user_id = r.user_id AND e.id = r.equipment_id '
                . "LEFT JOIN app_users o ON o.id = r.user_id WHERE r.returned_by = ?$repPeriod ORDER BY r.returned_at DESC LIMIT 5000",
                $rp
            );
            $result[] = [
                'id' => $tid,
                'name' => (string)$t['name'],
                'done' => $done,
                'open' => $open,
                'repairs' => array_map(fn($r) => [
                    'id' => (int)$r['id'],
                    'ownerId' => (int)$r['user_id'],
                    'equipmentId' => $r['equipment_id'],
                    'sentAt' => iso($r['sent_at'], true),
                    'returnedAt' => iso($r['returned_at'], true),
                    'cost' => (float)$r['cost'],
                    'description' => (string)$r['description'],
                    'equipmentName' => (string)$r['eq_name'],
                    'location' => (string)$r['eq_location'],
                    'ownerName' => (string)$r['owner_name'],
                ], $reps),
            ];
        }
        out(['technicians' => $result]);
    }

    if ($report === 'transfers') {
        $scope = 'SELECT admin_id FROM accountant_scopes WHERE accountant_id = ?';
        $p = [$aid, $aid];
        $period = period_sql('t.created_at', $p);
        $rows = all_rows(
            $db,
            'SELECT t.id, t.equipment_name, t.equipment_code, t.equipment_price, t.status, t.created_at, t.decided_at, '
            . "COALESCE(NULLIF(fu.full_name, ''), fu.username) AS from_name, COALESCE(NULLIF(tu.full_name, ''), tu.username) AS to_name, "
            . "COALESCE(NULLIF(cu.full_name, ''), cu.username) AS created_name, COALESCE(NULLIF(du.full_name, ''), du.username) AS decided_name "
            . 'FROM equipment_transfers t '
            . 'LEFT JOIN app_users fu ON fu.id = t.from_user LEFT JOIN app_users tu ON tu.id = t.to_user '
            . 'LEFT JOIN app_users cu ON cu.id = t.created_by LEFT JOIN app_users du ON du.id = t.decided_by '
            . "WHERE (t.from_user IN ($scope) OR t.to_user IN ($scope))$period ORDER BY t.created_at DESC, t.id DESC LIMIT 5000",
            $p
        );
        out(['transfers' => array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => (string)$r['equipment_name'],
            'code' => (string)$r['equipment_code'],
            'price' => (float)$r['equipment_price'],
            'status' => $r['status'],
            'createdAt' => iso($r['created_at'], true),
            'decidedAt' => iso($r['decided_at'], true),
            'fromName' => (string)$r['from_name'],
            'toName' => (string)$r['to_name'],
            'createdByName' => (string)$r['created_name'],
            'decidedByName' => (string)$r['decided_name'],
        ], $rows)]);
    }

    if ($report === 'all_points') {
        $points = all_rows(
            $db,
            "SELECT u.id, COALESCE(NULLIF(u.full_name, ''), u.username) AS name FROM accountant_scopes s "
            . "JOIN app_users u ON u.id = s.admin_id WHERE s.accountant_id = ? AND u.role = 'admin' AND u.active = 1 ORDER BY name",
            [$aid]
        );
        $result = [];
        foreach ($points as $pt) {
            $pid = (int)$pt['id'];
            $p = [$pid];
            $period = period_sql('t.done_at', $p);
            $result[] = [
                'id' => $pid,
                'name' => (string)$pt['name'],
                'items' => read_items($db, $pid),
                'tasks' => task_rows($db, "t.user_id = ? AND t.status = 'done'$period", $p, 5000),
            ];
        }
        out(['points' => $result]);
    }

    $raw = header_value('X-Target-User');
    if ($raw === '' || !ctype_digit($raw)) {
        out(['items' => [], 'sessions' => [], 'tasks' => [], 'technicians' => []]);
    }
    $ok = one_value(
        $db,
        "SELECT 1 FROM accountant_scopes s JOIN app_users u ON u.id = s.admin_id WHERE s.accountant_id = ? AND s.admin_id = ? AND u.role = 'admin' AND u.active = 1",
        [$aid, (int)$raw]
    );
    if (!$ok) {
        out(['error' => 'forbidden'], 403);
    }
    $accUid = (int)$raw;
    if ($report === 'tasks') {
        out(tasks_report($db, $accUid, (int)($_GET['sessionId'] ?? 0)));
    }
    out(['items' => read_items($db, $accUid), 'sessions' => read_sessions($db, $accUid), 'tasks' => owner_tasks($db, $accUid), 'technicians' => []]);
}

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

if (method() === 'GET' && ($_GET['report'] ?? '') === 'tasks') {
    out(tasks_report($db, $uid, (int)($_GET['sessionId'] ?? 0)));
}
if (method() === 'GET' && ($_GET['transfers'] ?? '') === 'incoming') {
    out(['transfers' => incoming_transfers($db, $uid)]);
}
if (method() === 'GET' && ($_GET['report'] ?? '') === 'admins') {
    $rows = all_rows(
        $db,
        "SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM app_users WHERE role = 'admin' AND active = 1 AND id <> ? ORDER BY name",
        [$uid]
    );
    out(['admins' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => (string)$r['name']], $rows)]);
}
if (method() === 'GET') {
    out([
        'items' => read_items($db, $uid),
        'sessions' => read_sessions($db, $uid),
        'tasks' => owner_tasks($db, $uid),
        'technicians' => owner_technicians($db, $uid),
    ]);
}

$body = body();
$action = (string)($body['action'] ?? '');
$reason = (string)($body['reason'] ?? '') ?: 'Списано при инвентаризации';

if (method() === 'DELETE') {
    run($db, 'DELETE FROM equipment WHERE user_id = ? AND id = ?', [$uid, (string)($body['id'] ?? '')]);
    out(['ok' => true, 'items' => read_items($db, $uid)]);
}

if ($action === 'create_task') {
    $description = mb_substr(trim((string)($body['description'] ?? '')), 0, 2000);
    if ($description === '') {
        out(['error' => 'empty_description'], 400);
    }
    $techs = owner_technicians($db, $uid);
    $techId = !empty($body['technicianId']) ? (int)$body['technicianId'] : null;
    if ($techId && !in_array($techId, array_column($techs, 'id'), true)) {
        out(['error' => 'bad_technician'], 400);
    }
    $eid = trim((string)($body['equipmentId'] ?? ''));
    $eqId = ($eid !== '' && one_value($db, 'SELECT 1 FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid])) ? $eid : null;
    $priority = in_array($body['priority'] ?? '', PRIORITIES, true) ? $body['priority'] : 'normal';
    $photos = upload_photos($body['photos'] ?? [], 'tasks', $uid . '-' . bin2hex(random_bytes(3)));
    run(
        $db,
        'INSERT INTO equipment_tasks (user_id, equipment_id, technician_id, created_by, description, photos, status, created_at, done_comment, priority, cost, kind) '
        . "VALUES (?, ?, ?, ?, ?, ?, 'open', ?, '', ?, 0, 'task')",
        [$uid, $eqId, $techId, $me['id'], $description, json_text($photos), now_utc(), $priority]
    );
    notify_new_task($db, $uid, (int)$db->lastInsertId(), $description, $priority, $eqId, $techId, $techs);
    out(['ok' => true, 'tasks' => owner_tasks($db, $uid)]);
}

if ($action === 'cancel_task') {
    run(
        $db,
        "UPDATE equipment_tasks SET status = 'cancelled', done_at = ?, done_by = ? WHERE user_id = ? AND id = ? AND status = 'open'",
        [now_utc(), $me['id'], $uid, (int)($body['taskId'] ?? 0)]
    );
    out(['ok' => true, 'tasks' => owner_tasks($db, $uid)]);
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
    $row = one_row($db, 'SELECT active, in_repair, name, code, price FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid]);
    if (!$row || !flag($row['active'])) {
        out(['error' => 'not_found'], 404);
    }
    if (flag($row['in_repair'])) {
        out(['error' => 'in_repair'], 409);
    }
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ? WHERE from_user = ? AND equipment_id = ? AND status = 'pending'",
        [now_utc(), $uid, $eid]
    );
    run(
        $db,
        'INSERT INTO equipment_transfers (equipment_id, from_user, to_user, created_by, status, created_at, equipment_name, equipment_code, equipment_price) '
        . "VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)",
        [$eid, $uid, $toUser, $me['id'], now_utc(), $row['name'], $row['code'], (float)$row['price']]
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
                [json_text($scanned), json_text($missing), $total, signed_money($totalPrice), signed_money($missingPrice), $uid, $sessionId]
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

if ($action === 'send_repair') {
    $eid = (string)($body['id'] ?? '');
    $description = mb_substr(trim((string)($body['description'] ?? '')), 0, 1000);
    $sent = run(
        $db,
        'UPDATE equipment SET in_repair = 1, repair_sent_at = ?, updated_at = ? WHERE user_id = ? AND id = ? AND active = 1 AND COALESCE(in_repair, 0) = 0',
        [now_utc(), now_utc(), $uid, $eid]
    )->rowCount();
    if ($sent) {
        $photos = upload_photos($body['photos'] ?? [], 'repairs', $uid . '-' . $eid);
        run(
            $db,
            'INSERT INTO equipment_repairs (user_id, equipment_id, sent_at, cost, description, photos) VALUES (?, ?, ?, 0, ?, ?)',
            [$uid, $eid, now_utc(), $description, json_text($photos)]
        );
        $eqName = (string)(one_value($db, 'SELECT name FROM equipment WHERE user_id = ? AND id = ?', [$uid, $eid]) ?? '');
        $taskText = mb_substr('Ремонт: ' . $eqName . ($description !== '' ? "\n" . $description : ''), 0, 2000);
        $priority = in_array($body['priority'] ?? '', PRIORITIES, true) ? $body['priority'] : 'soon';
        run(
            $db,
            'INSERT INTO equipment_tasks (user_id, equipment_id, technician_id, created_by, description, photos, status, created_at, done_comment, priority, cost, kind) '
            . "VALUES (?, ?, NULL, ?, ?, ?, 'open', ?, '', ?, 0, 'repair')",
            [$uid, $eid, $me['id'], $taskText, json_text($photos), now_utc(), $priority]
        );
        notify_repair($db, $uid, $eid, $description, owner_technicians($db, $uid));
    }
    out(['ok' => true, 'items' => read_items($db, $uid), 'tasks' => owner_tasks($db, $uid)]);
}

if ($action === 'return_repair') {
    return_repair($db, $uid, $body, $me['id']);
    out(['ok' => true, 'items' => read_items($db, $uid), 'tasks' => owner_tasks($db, $uid)]);
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
    $active = array_values(array_filter(read_items($db, $uid), fn($i) => $i['active'] && !$i['inRepair'] && $i['transferTo'] === ''));
    $found = array_values(array_filter($active, fn($i) => in_array($i['code'], $scannedCodes, true)));
    $missing = array_values(array_filter($active, fn($i) => !in_array($i['code'], $scannedCodes, true)));
    $totalPrice = array_sum(array_column($active, 'price'));
    $missingPrice = array_sum(array_column($missing, 'price'));
    run(
        $db,
        'INSERT INTO inventory_sessions (user_id, started_by, started_at, finished_at, scanned, missing, total, total_price, missing_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$uid, $me['id'], now_utc(), now_utc(), json_text(array_column($found, 'id')), json_text(array_column($missing, 'id')), count($active), signed_money($totalPrice), signed_money($missingPrice)]
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
        'price' => signed_money($item['price'] ?? 0),
        'location' => (string)($item['location'] ?? ''),
        'note' => (string)($item['note'] ?? ''),
        'image' => clean_image((string)($item['image'] ?? ''), 'equipment', $eid),
        'serial' => (string)($item['serial'] ?? ''),
        'active' => ($item['active'] ?? true) === false ? 0 : 1,
        'commissioned_at' => day_value($item['commissionedAt'] ?? ''),
        'depreciation_per_day' => max(0.0, signed_money($item['depreciationPerDay'] ?? 0)),
        'repair_cost' => max(0.0, signed_money($item['repairCost'] ?? 0)),
        'updated_at' => now_utc(),
    ];
    if (!$exists) {
        $data['created_at'] = now_utc();
        $data['in_repair'] = 0;
    }
    upsert($db, 'equipment', ['user_id', 'id'], $data);
    $saved++;
}
out(['saved' => $saved, 'items' => read_items($db, $uid)]);
