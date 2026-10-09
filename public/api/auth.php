<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';

$db = boot();
upgrade_schema($db);

function scope_map(PDO $db, string $sql): array
{
    $out = [];
    foreach (all_rows($db, $sql) as $r) {
        $vals = array_values($r);
        $out[(int)$vals[0]][] = (int)$vals[1];
    }
    return $out;
}

function clean_ids($list, int $except = 0): array
{
    $ids = [];
    foreach (is_array($list) ? $list : [] as $v) {
        if (is_numeric($v) && (int)$v > 0 && (int)$v !== $except) {
            $ids[(int)$v] = true;
        }
    }
    $ids = array_keys($ids);
    sort($ids);
    return $ids;
}

function save_tech_scopes(PDO $db, int $techId, $heads): void
{
    run($db, 'DELETE FROM technician_scopes WHERE technician_id = ?', [$techId]);
    $ids = clean_ids($heads, $techId);
    if ($ids) {
        foreach (all_rows($db, "SELECT id FROM app_users WHERE id IN (" . in_list($ids) . ") AND role IN ('admin', 'manager')") as $r) {
            run($db, 'INSERT INTO technician_scopes (technician_id, head_id) VALUES (?, ?)', [$techId, (int)$r['id']]);
        }
    }
}

function save_accountant_scopes(PDO $db, int $accId, $admins): void
{
    run($db, 'DELETE FROM accountant_scopes WHERE accountant_id = ?', [$accId]);
    $ids = clean_ids($admins, $accId);
    if ($ids) {
        foreach (all_rows($db, "SELECT id FROM app_users WHERE id IN (" . in_list($ids) . ") AND role = 'admin'") as $r) {
            run($db, 'INSERT INTO accountant_scopes (accountant_id, admin_id) VALUES (?, ?)', [$accId, (int)$r['id']]);
        }
    }
}

function save_accountant_techs(PDO $db, int $accId, $techs): void
{
    run($db, 'DELETE FROM accountant_technicians WHERE accountant_id = ?', [$accId]);
    $ids = clean_ids($techs);
    if ($ids) {
        foreach (all_rows($db, "SELECT id FROM app_users WHERE id IN (" . in_list($ids) . ") AND role = 'technician'") as $r) {
            run($db, 'INSERT INTO accountant_technicians (accountant_id, technician_id) VALUES (?, ?)', [$accId, (int)$r['id']]);
        }
    }
}

function accountant_admin_ids(PDO $db, int $accId): array
{
    $rows = all_rows(
        $db,
        "SELECT u.id FROM accountant_scopes s JOIN app_users u ON u.id = s.admin_id WHERE s.accountant_id = ? AND u.active = 1 AND u.role = 'admin' ORDER BY u.id",
        [$accId]
    );
    return array_map('intval', array_column($rows, 'id'));
}

function structures_payload(PDO $db, array $me, ?int $sid): array
{
    $allowed = allowed_structures($db, $me);
    if (!$allowed) {
        return ['structures' => [], 'activeStructureId' => null];
    }
    $rows = all_rows(
        $db,
        'SELECT s.id, s.name, (SELECT COUNT(*) FROM structure_members m JOIN app_users mu ON mu.id = m.user_id '
        . "WHERE m.structure_id = s.id AND mu.role NOT IN ('superadmin', 'technician')) AS members "
        . 'FROM structures s WHERE s.id IN (' . in_list($allowed) . ') ORDER BY s.name'
    );
    return [
        'structures' => array_map(fn($r) => ['id' => (int)$r['id'], 'name' => $r['name'], 'members' => (int)$r['members']], $rows),
        'activeStructureId' => $sid,
    ];
}

function set_user_structures(PDO $db, int $userId, $ids): void
{
    run($db, 'DELETE FROM structure_members WHERE user_id = ?', [$userId]);
    $role = (string)one_value($db, 'SELECT role FROM app_users WHERE id = ?', [$userId]);
    $clean = in_array($role, OUTSIDE_ROLES, true) ? [] : clean_ids($ids);
    if ($clean) {
        foreach (all_rows($db, 'SELECT id FROM structures WHERE id IN (' . in_list($clean) . ')') as $r) {
            run($db, 'INSERT INTO structure_members (structure_id, user_id) VALUES (?, ?)', [(int)$r['id'], $userId]);
        }
    }
}

function list_users(PDO $db, array $me, ?array $members = null): array
{
    run($db, "DELETE FROM structure_members WHERE user_id IN (SELECT id FROM app_users WHERE role IN ('superadmin', 'technician'))");
    $where = '';
    if ($me['role'] === 'admin') {
        $where = 'WHERE (manager_id = ' . (int)$me['id'] . ' OR id = ' . (int)$me['id'] . ')';
    } elseif ($me['role'] === 'manager') {
        $where = 'WHERE id IN (' . in_list(manager_branch_ids($db, $me['id'])) . ')';
    }
    if ($members !== null) {
        $memberSql = in_list($members);
        $extra = $me['role'] === 'superadmin'
            ? "(id IN ($memberSql) OR NOT EXISTS (SELECT 1 FROM structure_members m WHERE m.user_id = app_users.id))"
            : "id IN ($memberSql)";
        $where = $where ? "$where AND $extra" : "WHERE $extra";
    }
    $rows = all_rows($db, "SELECT id, username, full_name, role, active, created_at, manager_id, access_until FROM app_users $where ORDER BY id");
    $scopes = scope_map($db, 'SELECT technician_id, head_id FROM technician_scopes ORDER BY head_id');
    $accScopes = scope_map($db, 'SELECT accountant_id, admin_id FROM accountant_scopes ORDER BY admin_id');
    $accTechs = scope_map($db, 'SELECT accountant_id, technician_id FROM accountant_technicians ORDER BY technician_id');
    $memberships = scope_map($db, 'SELECT user_id, structure_id FROM structure_members ORDER BY structure_id');
    $own = [];
    foreach ($rows as $r) {
        $own[(int)$r['id']] = $r['access_until'];
    }
    $result = [];
    foreach ($rows as $r) {
        if (in_array($r['role'], GLOBAL_ROLES, true) || $r['role'] === 'accountant') {
            $until = null;
        } elseif ($r['role'] === 'admin') {
            $until = $r['access_until'];
        } else {
            $until = $own[(int)$r['manager_id']] ?? null;
            if ($until === null && $r['manager_id']) {
                $until = one_value($db, 'SELECT access_until FROM app_users WHERE id = ?', [(int)$r['manager_id']]);
            }
        }
        $result[] = [
            'id' => (int)$r['id'],
            'username' => $r['username'],
            'fullName' => $r['full_name'],
            'role' => $r['role'],
            'active' => flag($r['active']),
            'createdAt' => iso($r['created_at']),
            'managerId' => $r['manager_id'] === null ? null : (int)$r['manager_id'],
            'accessUntil' => iso($until ?: null),
            'accessOwn' => $r['role'] === 'admin',
            'scopeIds' => $r['role'] === 'technician'
                ? ($scopes[(int)$r['id']] ?? [])
                : ($r['role'] === 'accountant' ? ($accScopes[(int)$r['id']] ?? []) : []),
            'techIds' => $r['role'] === 'accountant' ? ($accTechs[(int)$r['id']] ?? []) : [],
            'structureIds' => $memberships[(int)$r['id']] ?? [],
        ];
    }
    return $result;
}

function managed_ids(PDO $db, array $me, ?array $members = null): array
{
    $ids = managed_ids_all($db, $me);
    if ($members === null) {
        return $ids;
    }
    return array_values(array_filter($ids, fn($i) => in_array($i, $members, true) || $i === (int)$me['id']));
}

function managed_ids_all(PDO $db, array $me): array
{
    if ($me['role'] === 'manager') {
        return manager_branch_ids($db, $me['id']);
    }
    if ($me['role'] === 'accountant') {
        return accountant_admin_ids($db, $me['id']);
    }
    if ($me['role'] === 'superadmin') {
        $rows = all_rows($db, 'SELECT id FROM app_users WHERE active = 1 ORDER BY id');
    } elseif ($me['role'] === 'admin') {
        $rows = all_rows($db, 'SELECT id FROM app_users WHERE active = 1 AND (manager_id = ? OR id = ?) ORDER BY id', [$me['id'], $me['id']]);
    } else {
        return [$me['id']];
    }
    return array_map('intval', array_column($rows, 'id'));
}

$body = body();
$token = header_value('X-Auth-Token');
if ($token === '' && isset($_GET['token']) && preg_match('/^[a-f0-9]{16,128}$/', (string)$_GET['token'])) {
    $token = (string)$_GET['token'];
}
$action = (string)($body['action'] ?? $_GET['action'] ?? (method() === 'GET' ? 'me' : ''));

if ((int)one_value($db, 'SELECT COUNT(*) FROM app_users') === 0) {
    run(
        $db,
        'INSERT INTO app_users (username, full_name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
        ['superadmin', 'Супер-админ', hash_password('15271527'), 'superadmin', now_utc()]
    );
}

if ($action === 'login') {
    $username = mb_strtolower(trim((string)($body['username'] ?? '')));
    $password = (string)($body['password'] ?? '');
    log_login_attempt($username, 'начат');
    $row = null;
    foreach (all_rows($db, 'SELECT id, username, full_name, password_hash, role, active, manager_id FROM app_users') as $candidate) {
        if (mb_strtolower($candidate['username']) === $username) {
            $row = $candidate;
            break;
        }
    }
    if (!$row || !flag($row['active']) || !check_password($password, $row['password_hash'])) {
        log_login_attempt($username, !$row ? 'нет такого логина' : (!flag($row['active']) ? 'отключён' : 'неверный пароль'));
        out(['error' => 'invalid_credentials'], 401);
    }
    [$until, $owner] = effective_access($db, (int)$row['id'], $row['role'], $row['manager_id']);
    if ($until && $until <= now_utc()) {
        lock_branch($db, (int)$owner);
        out(['error' => 'access_expired'], 403);
    }
    $newToken = bin2hex(random_bytes(24));
    run($db, 'DELETE FROM app_sessions WHERE user_id = ?', [(int)$row['id']]);
    run(
        $db,
        'INSERT INTO app_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
        [$newToken, (int)$row['id'], now_utc(), now_utc(SESSION_DAYS * 86400)]
    );
    log_login_attempt($username, 'УСПЕХ');
    $loginMe = ['id' => (int)$row['id'], 'role' => $row['role']];
    $loginSid = active_structure($db, $newToken, $loginMe);
    out([
        'token' => $newToken,
        'user' => array_merge([
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'fullName' => $row['full_name'],
            'role' => $row['role'],
            'accessUntil' => iso($until),
        ], structures_payload($db, $loginMe, $loginSid)),
    ]);
}

$me = session_user($db, $token, true);
$sid = $me ? active_structure($db, $token, $me) : null;
$members = $me ? structure_member_ids($db, $sid, $me) : null;
$freshMembers = function () use ($db, &$sid, $me): ?array {
    return structure_member_ids($db, $sid, $me);
};

if ($action === 'me') {
    out(['user' => $me ? array_merge($me, structures_payload($db, $me, $sid)) : null]);
}

if ($action === 'logout') {
    if ($token !== '') {
        run($db, 'UPDATE app_sessions SET expires_at = ? WHERE token = ?', [now_utc(), $token]);
    }
    out(['ok' => true]);
}

if (!$me) {
    out(['error' => 'unauthorized'], 401);
}

if ($action === 'change_password') {
    if ($me['role'] !== 'superadmin') {
        out(['error' => 'forbidden'], 403);
    }
    $new = (string)($body['password'] ?? '');
    if (mb_strlen($new) < 4) {
        out(['error' => 'weak_password'], 400);
    }
    run($db, 'UPDATE app_users SET password_hash = ? WHERE id = ?', [hash_password($new), $me['id']]);
    out(['ok' => true]);
}

if ($action === 'switch_structure') {
    $newSid = (int)($body['id'] ?? 0);
    if (!in_array($newSid, allowed_structures($db, $me), true)) {
        out(['error' => 'forbidden'], 403);
    }
    run($db, 'UPDATE app_sessions SET structure_id = ? WHERE token = ?', [$newSid, $token]);
    out(['user' => array_merge($me, structures_payload($db, $me, $newSid))]);
}

if ($action === 'managed') {
    $rows = all_rows($db, 'SELECT id, username, full_name, role, manager_id FROM app_users WHERE id IN (' . in_list(managed_ids($db, $me, $members)) . ') ORDER BY role, username');
    out([
        'managed' => array_map(fn($r) => [
            'id' => (int)$r['id'],
            'username' => $r['username'],
            'fullName' => $r['full_name'],
            'role' => $r['role'],
            'managerId' => $r['manager_id'] === null ? null : (int)$r['manager_id'],
        ], $rows),
    ]);
}

if (!in_array($me['role'], ['superadmin', 'admin', 'manager'], true)) {
    out(['error' => 'forbidden'], 403);
}

if ($action === 'users') {
    out(['users' => list_users($db, $me, $members)]);
}

if (in_array($action, ['structures', 'create_structure', 'rename_structure', 'delete_structure'], true)) {
    if ($me['role'] !== 'superadmin') {
        out(['error' => 'forbidden'], 403);
    }
    if ($action === 'create_structure') {
        $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
        if ($name === '') {
            out(['error' => 'invalid_input'], 400);
        }
        run($db, 'INSERT INTO structures (name, created_at) VALUES (?, ?)', [$name, now_utc()]);
        $newSid = (int)$db->lastInsertId();
        $ids = clean_ids($body['userIds'] ?? []);
        if ($ids) {
            foreach (all_rows($db, "SELECT id FROM app_users WHERE role NOT IN ('superadmin', 'technician') AND id IN (" . in_list($ids) . ')') as $r) {
                run($db, 'INSERT INTO structure_members (structure_id, user_id) VALUES (?, ?)', [$newSid, (int)$r['id']]);
            }
        }
    } elseif ($action === 'rename_structure') {
        $name = mb_substr(trim((string)($body['name'] ?? '')), 0, 120);
        if ($name === '') {
            out(['error' => 'invalid_input'], 400);
        }
        run($db, 'UPDATE structures SET name = ? WHERE id = ?', [$name, (int)($body['id'] ?? 0)]);
    } elseif ($action === 'delete_structure') {
        $delId = (int)($body['id'] ?? 0);
        if ((int)one_value($db, 'SELECT COUNT(*) FROM structure_members WHERE structure_id = ?', [$delId]) > 0) {
            out(['error' => 'structure_not_empty'], 409);
        }
        if ((int)one_value($db, 'SELECT COUNT(*) FROM structures') <= 1) {
            out(['error' => 'last_structure'], 400);
        }
        run($db, 'DELETE FROM shared_products WHERE structure_id = ?', [$delId]);
        run($db, 'DELETE FROM structures WHERE id = ?', [$delId]);
    }
    $sid = active_structure($db, $token, $me);
    out(array_merge(structures_payload($db, $me, $sid), ['users' => list_users($db, $me, $freshMembers())]));
}

if ($me['role'] === 'manager') {
    out(['error' => 'forbidden'], 403);
}

if ($me['role'] === 'admin') {
    $target = (int)($body['id'] ?? 0);
    if (in_array($action, ['create_user', 'delete_user'], true)) {
        out(['error' => 'forbidden'], 403);
    }
    $row = one_row($db, 'SELECT manager_id, role FROM app_users WHERE id = ?', [$target]);
    if (!$row || (int)$row['manager_id'] !== $me['id'] || $row['role'] !== 'user') {
        out(['error' => 'forbidden'], 403);
    }
    if ($action === 'update_user') {
        $sets = [];
        $params = [];
        if (!empty($body['password'])) {
            $sets[] = 'password_hash = ?';
            $params[] = hash_password((string)$body['password']);
        }
        if (array_key_exists('fullName', $body)) {
            $sets[] = 'full_name = ?';
            $params[] = trim((string)$body['fullName']);
        }
        if (array_key_exists('active', $body)) {
            $sets[] = 'active = ?';
            $params[] = $body['active'] ? 1 : 0;
        }
        if ($sets) {
            $params[] = $target;
            run($db, 'UPDATE app_users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
            if (($body['active'] ?? null) === false) {
                run($db, 'UPDATE app_sessions SET expires_at = ? WHERE user_id = ?', [now_utc(), $target]);
            }
        }
        out(['users' => list_users($db, $me, $freshMembers())]);
    }
    out(['error' => 'forbidden'], 403);
}

$usernameTaken = function (string $name, int $exceptId = 0) use ($db): bool {
    foreach (all_rows($db, 'SELECT id, username FROM app_users') as $r) {
        if ((int)$r['id'] !== $exceptId && mb_strtolower($r['username']) === $name) {
            return true;
        }
    }
    return false;
};

if ($action === 'create_user') {
    $username = mb_strtolower(trim((string)($body['username'] ?? '')));
    $password = (string)($body['password'] ?? '');
    $fullName = trim((string)($body['fullName'] ?? ''));
    $role = in_array($body['role'] ?? 'user', ROLES, true) ? ($body['role'] ?? 'user') : 'user';
    if (mb_strlen($username) < 3 || mb_strlen($password) < 4) {
        out(['error' => 'invalid_input'], 400);
    }
    if ($usernameTaken($username)) {
        out(['error' => 'username_taken'], 409);
    }
    $manager = !empty($body['managerId']) ? (int)$body['managerId'] : null;
    $days = $body['accessDays'] ?? null;
    $until = ($days && $role === 'admin') ? now_utc((int)$days * 86400) : null;
    run(
        $db,
        'INSERT INTO app_users (username, full_name, password_hash, role, active, created_at, manager_id, access_until) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
        [$username, $fullName, hash_password($password), $role, now_utc(), $manager, $until]
    );
    $newId = (int)$db->lastInsertId();
    if (!in_array($role, OUTSIDE_ROLES, true)) {
        $wanted = $body['structureIds'] ?? null;
        set_user_structures($db, $newId, is_array($wanted) && $wanted ? $wanted : ($sid ? [$sid] : []));
    }
    if ($role === 'technician') {
        save_tech_scopes($db, $newId, $body['scopeIds'] ?? []);
    } elseif ($role === 'accountant') {
        save_accountant_scopes($db, $newId, $body['scopeIds'] ?? []);
        save_accountant_techs($db, $newId, $body['techIds'] ?? []);
    }
    out(['users' => list_users($db, $me, $freshMembers())]);
}

if ($action === 'update_user') {
    $userId = (int)($body['id'] ?? 0);
    if (!$userId) {
        out(['error' => 'invalid_input'], 400);
    }
    if ($userId === $me['id'] && ($body['active'] ?? null) === false) {
        out(['error' => 'self_lock'], 400);
    }
    $sets = [];
    $params = [];
    if (!empty($body['username'])) {
        $newName = mb_strtolower(trim((string)$body['username']));
        if (mb_strlen($newName) < 3) {
            out(['error' => 'invalid_input'], 400);
        }
        if ($usernameTaken($newName, $userId)) {
            out(['error' => 'username_taken'], 409);
        }
        $sets[] = 'username = ?';
        $params[] = $newName;
    }
    if (!empty($body['password'])) {
        $sets[] = 'password_hash = ?';
        $params[] = hash_password((string)$body['password']);
    }
    $newRole = in_array($body['role'] ?? null, ROLES, true) ? $body['role'] : null;
    if ($newRole) {
        $sets[] = 'role = ?';
        $params[] = $newRole;
    }
    if (array_key_exists('fullName', $body)) {
        $sets[] = 'full_name = ?';
        $params[] = trim((string)$body['fullName']);
    }
    if (array_key_exists('active', $body)) {
        $sets[] = 'active = ?';
        $params[] = $body['active'] ? 1 : 0;
    }
    if (array_key_exists('managerId', $body)) {
        $sets[] = 'manager_id = ?';
        $params[] = !empty($body['managerId']) ? (int)$body['managerId'] : null;
    }
    $renew = false;
    if (array_key_exists('accessDays', $body)) {
        $targetRole = $newRole ?: (one_value($db, 'SELECT role FROM app_users WHERE id = ?', [$userId]) ?: 'user');
        if ($targetRole !== 'admin') {
            out(['error' => 'access_admin_only'], 400);
        }
        $days = $body['accessDays'];
        if ($days === null || $days === '' || $days === 0) {
            $sets[] = 'access_until = NULL';
        } else {
            $sets[] = 'access_until = ?';
            $params[] = now_utc((int)$days * 86400);
            $renew = true;
        }
    }
    if (isset($body['structureIds']) && is_array($body['structureIds'])) {
        set_user_structures($db, $userId, $body['structureIds']);
    }
    if ($newRole && in_array($newRole, OUTSIDE_ROLES, true)) {
        set_user_structures($db, $userId, []);
    }
    if (array_key_exists('techIds', $body)) {
        save_accountant_techs($db, $userId, $body['techIds']);
    }
    if (array_key_exists('scopeIds', $body)) {
        $scopeRole = $newRole ?: (string)(one_value($db, 'SELECT role FROM app_users WHERE id = ?', [$userId]) ?? '');
        if ($scopeRole === 'accountant') {
            save_accountant_scopes($db, $userId, $body['scopeIds']);
        } else {
            save_tech_scopes($db, $userId, $body['scopeIds']);
        }
    }
    if (!$sets) {
        out(['users' => list_users($db, $me, $freshMembers())]);
    }
    $params[] = $userId;
    run($db, 'UPDATE app_users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
    if ($newRole && in_array($newRole, OUTSIDE_ROLES, true)) {
        set_user_structures($db, $userId, []);
    }
    if ($renew) {
        unlock_branch($db, $userId);
    }
    if (($body['active'] ?? null) === false) {
        run($db, 'UPDATE app_sessions SET expires_at = ? WHERE user_id = ?', [now_utc(), $userId]);
    }
    if ($newRole && $newRole !== 'admin') {
        run($db, 'UPDATE app_users SET access_until = NULL WHERE id = ?', [$userId]);
    }
    out(['users' => list_users($db, $me, $freshMembers())]);
}

if ($action === 'delete_user') {
    $userId = (int)($body['id'] ?? 0);
    if (!$userId) {
        out(['error' => 'invalid_input'], 400);
    }
    if ($userId === $me['id']) {
        out(['error' => 'self_delete'], 400);
    }
    $role = one_value($db, 'SELECT role FROM app_users WHERE id = ?', [$userId]);
    if (!$role) {
        out(['error' => 'not_found'], 404);
    }
    if ($role === 'superadmin' && (int)one_value($db, "SELECT COUNT(*) FROM app_users WHERE role = 'superadmin' AND active = 1") <= 1) {
        out(['error' => 'last_superadmin'], 400);
    }
    run($db, 'DELETE FROM app_sessions WHERE user_id = ?', [$userId]);
    run($db, 'DELETE FROM structure_members WHERE user_id = ?', [$userId]);
    run($db, 'DELETE FROM technician_scopes WHERE technician_id = ? OR head_id = ?', [$userId, $userId]);
    run($db, 'DELETE FROM accountant_scopes WHERE accountant_id = ? OR admin_id = ?', [$userId, $userId]);
    run($db, 'DELETE FROM accountant_technicians WHERE accountant_id = ? OR technician_id = ?', [$userId, $userId]);
    run($db, 'DELETE FROM telegram_links WHERE user_id = ?', [$userId]);
    run($db, 'UPDATE app_users SET manager_id = NULL WHERE manager_id = ?', [$userId]);
    run($db, 'DELETE FROM app_users WHERE id = ?', [$userId]);
    out(['users' => list_users($db, $me, $freshMembers())]);
}

out(['error' => 'unknown_action'], 400);
