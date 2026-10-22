<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';

$db = boot();
upgrade_schema($db);

require_once __DIR__ . '/equipment_lib.php';

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
$structureMembers = session_members($db, header_value('X-Auth-Token'), $me);
$GLOBALS['structureMembers'] = $structureMembers;
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
    if (!$tech || !in_members($structureMembers, $tech['id'])) {
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
            . "JOIN app_users u ON u.id = a.technician_id WHERE a.accountant_id = ? AND u.role = 'technician'" . members_sql($structureMembers, 'u.id') . ' ORDER BY name',
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
        $scope = 'SELECT admin_id FROM accountant_scopes WHERE accountant_id = ?' . members_sql($structureMembers, 'admin_id');
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
            . "JOIN app_users u ON u.id = s.admin_id WHERE s.accountant_id = ? AND u.role = 'admin' AND u.active = 1" . members_sql($structureMembers, 'u.id') . ' ORDER BY name',
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
    if (!$ok || !in_members($structureMembers, (int)$raw)) {
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
        out(['transfers' => []]);
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
    out(['transfers' => $me['role'] === 'manager'
        ? incoming_transfers($db, (int)$me['id'], members_sql($structureMembers, 't.from_user') . members_sql($structureMembers, 't.to_user'))
        : []]);
}
if (method() === 'GET' && ($_GET['report'] ?? '') === 'admins') {
    $rows = all_rows(
        $db,
        "SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM app_users WHERE role = 'admin' AND active = 1 AND manager_id IS NOT NULL AND id <> ?" . members_sql($structureMembers, 'id') . ' ORDER BY name',
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
    notify_new_task($db, $uid, (int)$db->lastInsertId(), $description, $priority, $eqId, $techId, $techs, (int)$me['id']);
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
    $res = decide_transfer($db, $me, $body);
    $res['items'] = read_items($db, $uid);
    out($res);
}

if ($action === 'transfer') {
    if (!can_send_from($db, $me, $uid)) {
        out(['error' => 'not_your_admin'], 403);
    }
    if ((string)($body['password'] ?? '') !== TRANSFER_PASSWORD) {
        out(['error' => 'bad_password'], 403);
    }
    $toUser = (int)($body['toUser'] ?? 0);
    $eid = (string)($body['id'] ?? '');
    $isAdmin = one_value($db, "SELECT 1 FROM app_users WHERE id = ? AND role = 'admin' AND active = 1 AND manager_id IS NOT NULL", [$toUser]);
    if (!$isAdmin || $toUser === $uid || !in_members($structureMembers, $toUser)) {
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
    try {
        notify_transfer($db, $uid, $toUser, $eid, (int)$me['id']);
    } catch (Throwable $e) {
    }
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
        notify_repair($db, $uid, $eid, $description, owner_technicians($db, $uid), (int)$me['id'], (int)$db->lastInsertId());
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
