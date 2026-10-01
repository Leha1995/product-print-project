<?php
declare(strict_types=1);

const APP_ID = 'asap-terminal';
const SESSION_DAYS = 365;
const ROLES = ['user', 'admin', 'manager', 'superadmin'];
const GLOBAL_ROLES = ['manager', 'superadmin'];

function config_path(): string
{
    return __DIR__ . '/config.php';
}

function load_config(): ?array
{
    $path = config_path();
    if (!is_file($path)) {
        return null;
    }
    $cfg = include $path;
    return is_array($cfg) ? $cfg : null;
}

function connect_db(array $cfg): PDO
{
    if (($cfg['driver'] ?? 'mysql') === 'sqlite') {
        $pdo = new PDO('sqlite:' . $cfg['path']);
    } else {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
            $cfg['host'],
            (int)($cfg['port'] ?? 3306),
            $cfg['name']
        );
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [PDO::MYSQL_ATTR_FOUND_ROWS => true]);
        $pdo->exec("SET time_zone = '+00:00'");
    }
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    return $pdo;
}

function send_cors(): void
{
    header('Access-Control-Allow-Origin: *');
    header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Auth-Token, X-Target-User, X-Admin-Pin, X-Print-Key');
    header('Access-Control-Max-Age: 86400');
}

function out($payload, int $code = 200): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function boot(): PDO
{
    ini_set('display_errors', '0');
    send_cors();
    if (method() === 'OPTIONS') {
        http_response_code(200);
        exit;
    }
    set_exception_handler(function (Throwable $e) {
        error_log('[asap] ' . $e->getMessage());
        out(['error' => 'server_error'], 500);
    });
    $cfg = load_config();
    if (!$cfg) {
        out(['error' => 'not_installed'], 503);
    }
    try {
        return connect_db($cfg);
    } catch (Throwable $e) {
        out(['error' => 'db_unavailable'], 503);
    }
}

function method(): string
{
    return strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
}

function body(): array
{
    static $data = null;
    if ($data === null) {
        $decoded = json_decode((string)file_get_contents('php://input'), true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

function header_value(string $name): string
{
    $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
    return trim((string)($_SERVER[$key] ?? ''));
}

function run(PDO $db, string $sql, array $params = []): PDOStatement
{
    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    return $stmt;
}

function all_rows(PDO $db, string $sql, array $params = []): array
{
    return run($db, $sql, $params)->fetchAll();
}

function one_row(PDO $db, string $sql, array $params = []): ?array
{
    $row = run($db, $sql, $params)->fetch();
    return $row === false ? null : $row;
}

function one_value(PDO $db, string $sql, array $params = [])
{
    $value = run($db, $sql, $params)->fetchColumn();
    return $value === false ? null : $value;
}

function upsert(PDO $db, string $table, array $keys, array $data): void
{
    $sets = [];
    $params = [];
    foreach ($data as $col => $val) {
        if (in_array($col, $keys, true)) {
            continue;
        }
        $sets[] = "$col = ?";
        $params[] = $val;
    }
    $where = [];
    foreach ($keys as $key) {
        $where[] = "$key = ?";
        $params[] = $data[$key];
    }
    if ($sets) {
        $count = run($db, "UPDATE $table SET " . implode(', ', $sets) . ' WHERE ' . implode(' AND ', $where), $params)
            ->rowCount();
    } else {
        $count = (int)one_value($db, "SELECT COUNT(*) FROM $table WHERE " . implode(' AND ', $where), array_slice($params, 0));
    }
    if ($count > 0) {
        return;
    }
    $cols = array_keys($data);
    run(
        $db,
        "INSERT INTO $table (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')',
        array_values($data)
    );
}

function in_list(array $ids): string
{
    $clean = array_map('intval', $ids);
    return $clean ? implode(', ', $clean) : '0';
}

function now_utc(int $offsetSeconds = 0): string
{
    return gmdate('Y-m-d H:i:s', time() + $offsetSeconds);
}

function iso(?string $value, bool $withZone = false): ?string
{
    if (!$value) {
        return null;
    }
    $out = str_replace(' ', 'T', substr($value, 0, 19));
    return $withZone ? $out . '+00:00' : $out;
}

function flag($value): bool
{
    return (bool)(int)$value;
}

function json_text($value): string
{
    return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
}

function json_list(?string $raw): array
{
    $decoded = json_decode((string)$raw, true);
    return is_array($decoded) ? array_values($decoded) : [];
}

function json_object(?string $raw): stdClass
{
    $decoded = json_decode((string)$raw);
    if ($decoded instanceof stdClass) {
        return $decoded;
    }
    return new stdClass();
}

function hash_password(string $password, string $salt = ''): string
{
    if ($salt === '') {
        $salt = bin2hex(random_bytes(8));
    }
    return $salt . '$' . hash_pbkdf2('sha256', $password, $salt, 60000, 64);
}

function check_password(string $password, string $stored): bool
{
    $pos = strpos($stored, '$');
    if (!$pos) {
        return false;
    }
    return hash_equals($stored, hash_password($password, substr($stored, 0, $pos)));
}

function effective_access(PDO $db, int $userId, string $role, $managerId): array
{
    if (in_array($role, GLOBAL_ROLES, true)) {
        return [null, null];
    }
    $owner = $role === 'admin' ? $userId : (int)$managerId;
    if (!$owner) {
        return [null, null];
    }
    $until = one_value($db, 'SELECT access_until FROM app_users WHERE id = ?', [$owner]);
    return [$until ?: null, $owner];
}

function lock_branch(PDO $db, int $adminId): void
{
    run($db, 'UPDATE app_users SET active = 0 WHERE id = ? OR manager_id = ?', [$adminId, $adminId]);
    run(
        $db,
        'UPDATE app_sessions SET expires_at = ? WHERE user_id IN (SELECT id FROM app_users WHERE id = ? OR manager_id = ?)',
        [now_utc(), $adminId, $adminId]
    );
}

function unlock_branch(PDO $db, int $adminId): void
{
    run($db, 'UPDATE app_users SET active = 1 WHERE id = ? OR manager_id = ?', [$adminId, $adminId]);
}

function session_user(PDO $db, string $token, bool $full = false): ?array
{
    if ($token === '') {
        return null;
    }
    $row = one_row(
        $db,
        'SELECT u.id, u.username, u.full_name, u.role, u.active, u.manager_id FROM app_sessions s '
        . 'JOIN app_users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
        [$token, now_utc()]
    );
    if (!$row || !flag($row['active'])) {
        return null;
    }
    $user = ['id' => (int)$row['id'], 'username' => $row['username'], 'role' => $row['role']];
    if (!$full) {
        return $user;
    }
    [$until, $owner] = effective_access($db, (int)$row['id'], $row['role'], $row['manager_id']);
    if ($until && $until <= now_utc()) {
        lock_branch($db, (int)$owner);
        return null;
    }
    run($db, 'UPDATE app_sessions SET expires_at = ? WHERE token = ?', [now_utc(SESSION_DAYS * 86400), $token]);
    return [
        'id' => (int)$row['id'],
        'username' => $row['username'],
        'fullName' => $row['full_name'],
        'role' => $row['role'],
        'accessUntil' => iso($until),
    ];
}

function manager_branch_ids(PDO $db, int $managerId): array
{
    $admins = array_map(
        'intval',
        array_column(
            all_rows($db, "SELECT id FROM app_users WHERE active = 1 AND role = 'admin' AND manager_id = ? ORDER BY id", [$managerId]),
            'id'
        )
    );
    $ids = $admins;
    if ($admins) {
        $staff = all_rows(
            $db,
            "SELECT id FROM app_users WHERE active = 1 AND role = 'user' AND manager_id IN (" . in_list($admins) . ') ORDER BY id'
        );
        foreach ($staff as $r) {
            $ids[] = (int)$r['id'];
        }
    }
    return $ids;
}

function target_user(PDO $db, array $me, callable $canManage): int
{
    $raw = header_value('X-Target-User');
    if ($raw !== '' && ctype_digit($raw)) {
        $target = (int)$raw;
        if (!$canManage($db, $me, $target)) {
            out(['error' => 'forbidden'], 403);
        }
        return $target;
    }
    return $me['id'];
}

function save_image(string $dataUrl, string $folder, string $id): string
{
    [$head, $payload] = array_pad(explode(',', $dataUrl, 2), 2, '');
    $ext = strpos($head, 'png') !== false ? 'png' : (strpos($head, 'webp') !== false ? 'webp' : 'jpg');
    $bytes = base64_decode($payload, true);
    if ($bytes === false || $bytes === '') {
        return '';
    }
    $safeId = preg_replace('/[^A-Za-z0-9_-]/', '', $id) ?: 'img';
    $name = $safeId . '-' . bin2hex(random_bytes(4)) . '.' . $ext;
    return store_file($folder, $name, $bytes);
}

function uploads_dir(): string
{
    return dirname(__DIR__) . '/uploads';
}

function store_file(string $folder, string $name, string $bytes): string
{
    $dir = uploads_dir() . '/' . $folder;
    if (!is_dir($dir)) {
        mkdir($dir, 0755, true);
    }
    file_put_contents($dir . '/' . $name, $bytes);
    return site_url() . '/uploads/' . $folder . '/' . $name;
}

function site_url(): string
{
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')
        || ((int)($_SERVER['SERVER_PORT'] ?? 80) === 443);
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    return ($https ? 'https' : 'http') . '://' . $host . $base;
}

function clean_image(string $image, string $folder, string $id): string
{
    if (strpos($image, 'data:') === 0) {
        return save_image($image, $folder, $id);
    }
    if (strpos($image, 'idb:') === 0) {
        return '';
    }
    return $image;
}

function shelf_value($value): ?int
{
    if ((is_int($value) || is_float($value)) && $value != 0) {
        return (int)$value;
    }
    return null;
}
