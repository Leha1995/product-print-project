<?php
declare(strict_types=1);

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
    if ($target === $me['id']) {
        return true;
    }
    if (!in_members($GLOBALS['structureMembers'] ?? null, $target)) {
        return false;
    }
    if ($me['role'] === 'superadmin') {
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
    $owners = technician_owners_all($db, $techId);
    $members = $GLOBALS['structureMembers'] ?? null;
    if ($members === null) {
        return $owners;
    }
    if ($owners === null) {
        return $members;
    }
    return array_values(array_filter($owners, fn($o) => in_array($o, $members, true)));
}

function technician_owners_all(PDO $db, int $techId): ?array
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

function attach_structures(PDO $db, array $rows): array
{
    $owners = array_values(array_unique(array_filter(array_map(fn($r) => (int)($r['ownerId'] ?? 0), $rows))));
    $byOwner = [];
    if ($owners) {
        $found = all_rows(
            $db,
            'SELECT m.user_id, s.id, s.name FROM structure_members m JOIN structures s ON s.id = m.structure_id '
            . 'WHERE m.user_id IN (' . in_list($owners) . ') ORDER BY s.name'
        );
        foreach ($found as $f) {
            $byOwner[(int)$f['user_id']][] = ['id' => (int)$f['id'], 'name' => (string)$f['name']];
        }
    }
    foreach ($rows as &$r) {
        $r['structures'] = $byOwner[(int)($r['ownerId'] ?? 0)] ?? [];
    }
    unset($r);
    return $rows;
}

function technician_tasks(PDO $db, int $techId): array
{
    $scope = owner_scope_sql(technician_owners($db, $techId), 't.user_id');
    return attach_structures($db, task_rows(
        $db,
        "(t.technician_id IS NULL OR t.technician_id = ?)$scope AND (t.status = 'open' OR t.done_at > ?)",
        [$techId, now_utc(-7 * 86400)]
    ));
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
    return attach_structures($db, array_map(function ($r) use ($db) {
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
    }, $rows));
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
        try {
            notify_repair_returned($db, $uid, $eid, (float)$cost, $desc, $byUser);
        } catch (Throwable $e) {
            error_log('[asap] repair notify failed: ' . $e->getMessage());
        }
    }
}

function transfer_head(PDO $db, int $adminId): int
{
    return (int)one_value($db, "SELECT manager_id FROM app_users WHERE id = ? AND role = 'admin'", [$adminId]);
}

function can_send_from(PDO $db, array $me, int $uid): bool
{
    if ($me['role'] !== 'manager') {
        return false;
    }
    return $uid === (int)$me['id'] || transfer_head($db, $uid) === (int)$me['id'];
}

function incoming_transfers(PDO $db, int $managerId, string $extra = ''): array
{
    $rows = all_rows(
        $db,
        'SELECT t.id, t.created_at, e.name, e.code, e.price, e.location, e.serial, e.image, e.note, '
        . "COALESCE(NULLIF(u.full_name, ''), u.username) AS from_name, "
        . "COALESCE(NULLIF(r.full_name, ''), r.username) AS to_name FROM equipment_transfers t "
        . 'JOIN equipment e ON e.user_id = t.from_user AND e.id = t.equipment_id '
        . 'LEFT JOIN app_users u ON u.id = t.from_user '
        . 'JOIN app_users r ON r.id = t.to_user '
        . "WHERE r.role = 'admin' AND r.manager_id = ? AND t.status = 'pending'$extra ORDER BY t.created_at, t.id",
        [$managerId]
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
        'toName' => (string)$r['to_name'],
    ], $rows);
}

function decide_transfer(PDO $db, array $me, array $body): array
{
    $mid = (int)$me['id'];
    $tid = (int)($body['transferId'] ?? 0);
    $row = one_row(
        $db,
        'SELECT t.from_user, t.equipment_id, t.to_user FROM equipment_transfers t JOIN app_users r ON r.id = t.to_user '
        . "WHERE t.id = ? AND t.status = 'pending' AND r.role = 'admin' AND r.manager_id = ?",
        [$tid, $mid]
    );
    if ($me['role'] !== 'manager' || !$row) {
        return ['error' => 'not_found', 'transfers' => incoming_transfers($db, $mid)];
    }
    $uid = (int)$row['to_user'];
    $from = (int)$row['from_user'];
    $eid = (string)$row['equipment_id'];
    if (($body['action'] ?? '') === 'transfer_decline') {
        run($db, "UPDATE equipment_transfers SET status = 'declined', decided_at = ?, decided_by = ? WHERE id = ?", [now_utc(), $me['id'], $tid]);
        notify_transfer_decided($db, $tid, false, $mid);
        return ['ok' => true, 'transfers' => incoming_transfers($db, $mid)];
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
        return ['error' => 'not_found', 'transfers' => incoming_transfers($db, $mid)];
    }
    run($db, 'UPDATE equipment_repairs SET user_id = ?, equipment_id = ? WHERE user_id = ? AND equipment_id = ?', [$uid, $newId, $from, $eid]);
    run($db, "UPDATE equipment_transfers SET status = 'accepted', decided_at = ?, decided_by = ? WHERE id = ?", [now_utc(), $me['id'], $tid]);
    notify_transfer_decided($db, $tid, true, $mid);
    run(
        $db,
        "UPDATE equipment_transfers SET status = 'cancelled', decided_at = ? WHERE from_user = ? AND equipment_id = ? AND status = 'pending'",
        [now_utc(), $from, $eid]
    );
    return ['ok' => true, 'transfers' => incoming_transfers($db, $mid)];
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
