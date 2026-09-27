<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

$db = boot();

function list_users(PDO $db, array $me): array
{
    $where = '';
    if ($me['role'] === 'admin') {
        $where = 'WHERE manager_id = ' . (int)$me['id'] . ' OR id = ' . (int)$me['id'];
    } elseif ($me['role'] === 'manager') {
        $where = 'WHERE id IN (' . in_list(manager_branch_ids($db, $me['id'])) . ')';
    }
    $rows = all_rows($db, "SELECT id, username, full_name, role, active, created_at, manager_id, access_until FROM app_users $where ORDER BY id");
    $own = [];
    foreach ($rows as $r) {
        $own[(int)$r['id']] = $r['access_until'];
    }
    $result = [];
    foreach ($rows as $r) {
        if (in_array($r['role'], GLOBAL_ROLES, true)) {
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
        ];
    }
    return $result;
}

function managed_ids(PDO $db, array $me): array
{
    if ($me['role'] === 'manager') {
        return manager_branch_ids($db, $me['id']);
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
    $row = null;
    foreach (all_rows($db, 'SELECT id, username, full_name, password_hash, role, active, manager_id FROM app_users') as $candidate) {
        if (mb_strtolower($candidate['username']) === $username) {
            $row = $candidate;
            break;
        }
    }
    if (!$row || !flag($row['active']) || !check_password($password, $row['password_hash'])) {
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
    out([
        'token' => $newToken,
        'user' => [
            'id' => (int)$row['id'],
            'username' => $row['username'],
            'fullName' => $row['full_name'],
            'role' => $row['role'],
            'accessUntil' => iso($until),
        ],
    ]);
}

$me = session_user($db, $token, true);

if ($action === 'me') {
    out(['user' => $me]);
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

if ($action === 'managed') {
    $rows = all_rows($db, 'SELECT id, username, full_name, role FROM app_users WHERE id IN (' . in_list(managed_ids($db, $me)) . ') ORDER BY role, username');
    out([
        'managed' => array_map(fn($r) => [
            'id' => (int)$r['id'],
            'username' => $r['username'],
            'fullName' => $r['full_name'],
            'role' => $r['role'],
        ], $rows),
    ]);
}

if (!in_array($me['role'], ['superadmin', 'admin', 'manager'], true)) {
    out(['error' => 'forbidden'], 403);
}

if ($action === 'users') {
    out(['users' => list_users($db, $me)]);
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
        out(['users' => list_users($db, $me)]);
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
    out(['users' => list_users($db, $me)]);
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
    if (!$sets) {
        out(['users' => list_users($db, $me)]);
    }
    $params[] = $userId;
    run($db, 'UPDATE app_users SET ' . implode(', ', $sets) . ' WHERE id = ?', $params);
    if ($renew) {
        unlock_branch($db, $userId);
    }
    if (($body['active'] ?? null) === false) {
        run($db, 'UPDATE app_sessions SET expires_at = ? WHERE user_id = ?', [now_utc(), $userId]);
    }
    if ($newRole && $newRole !== 'admin') {
        run($db, 'UPDATE app_users SET access_until = NULL WHERE id = ?', [$userId]);
    }
    out(['users' => list_users($db, $me)]);
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
    run($db, 'UPDATE app_users SET manager_id = NULL WHERE manager_id = ?', [$userId]);
    run($db, 'DELETE FROM app_users WHERE id = ?', [$userId]);
    out(['users' => list_users($db, $me)]);
}

out(['error' => 'unknown_action'], 400);
