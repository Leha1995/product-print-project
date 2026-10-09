<?php
declare(strict_types=1);

const APP_ID = 'asap-terminal';
const SESSION_DAYS = 365;
const ROLES = ['user', 'admin', 'manager', 'superadmin', 'technician', 'accountant'];
const GLOBAL_ROLES = ['manager', 'superadmin'];

function config_path(): string
{
    return __DIR__ . '/config.php';
}

function backup_config_path(): string
{
    return dirname(__DIR__, 2) . '/asap-config-' . substr(md5(dirname(__DIR__)), 0, 10) . '.php';
}

function read_config_file(string $path): ?array
{
    if (!@is_file($path) || !@is_readable($path)) {
        return null;
    }
    $cfg = include $path;
    return is_array($cfg) ? $cfg : null;
}

function save_config(array $cfg): bool
{
    $php = "<?php\nreturn " . var_export($cfg, true) . ";\n";
    $ok = @file_put_contents(config_path(), $php) !== false;
    if ($ok) {
        @chmod(config_path(), 0600);
    }
    if (@file_put_contents(backup_config_path(), $php) !== false) {
        @chmod(backup_config_path(), 0600);
        $ok = true;
    }
    return $ok;
}

function load_config(): ?array
{
    static $cache = false;
    if ($cache !== false) {
        return $cache;
    }
    $cfg = read_config_file(config_path());
    if ($cfg === null) {
        $cfg = read_config_file(backup_config_path());
        if ($cfg !== null) {
            $php = "<?php\nreturn " . var_export($cfg, true) . ";\n";
            if (@file_put_contents(config_path(), $php) !== false) {
                @chmod(config_path(), 0600);
            }
        }
    } elseif (!@is_file(backup_config_path())) {
        $php = "<?php\nreturn " . var_export($cfg, true) . ";\n";
        if (@file_put_contents(backup_config_path(), $php) !== false) {
            @chmod(backup_config_path(), 0600);
        }
    }
    return $cache = $cfg;
}

function is_installed(): bool
{
    return load_config() !== null;
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
        $pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [class_exists('Pdo\\Mysql') ? constant('Pdo\\Mysql::ATTR_FOUND_ROWS') : PDO::MYSQL_ATTR_FOUND_ROWS => true]);
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
    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE | JSON_PARTIAL_OUTPUT_ON_ERROR);
    echo $json === false ? '{"error":"server_error","detail":"json_encode"}' : $json;
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
        log_server_error($e);
        out(['error' => 'server_error', 'detail' => mb_substr(get_class($e) . ': ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine(), 0, 300)], 500);
    });
    register_shutdown_function(function () {
        $err = error_get_last();
        if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            log_server_error(new ErrorException($err['message'], 0, $err['type'], $err['file'], $err['line']));
        }
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

function error_log_path(): string
{
    return __DIR__ . '/.errors.log';
}

function log_server_error(Throwable $e): void
{
    $line = gmdate('Y-m-d H:i:s') . ' | ' . basename((string)($_SERVER['SCRIPT_NAME'] ?? ''))
        . ' | ' . (string)(body()['action'] ?? '') . ' | ' . get_class($e) . ': ' . $e->getMessage()
        . ' @ ' . basename($e->getFile()) . ':' . $e->getLine();
    $path = error_log_path();
    $old = @is_file($path) ? (array)@file($path, FILE_IGNORE_NEW_LINES) : [];
    $old = array_slice($old, -29);
    $old[] = str_replace(["\r", "\n"], ' ', $line);
    @file_put_contents($path, implode("\n", $old) . "\n");
}

function log_login_attempt(string $username, string $result): void
{
    $path = __DIR__ . '/.logins.log';
    $old = @is_file($path) ? (array)@file($path, FILE_IGNORE_NEW_LINES) : [];
    $old = array_slice($old, -29);
    $ua = (string)($_SERVER['HTTP_USER_AGENT'] ?? '');
    $old[] = gmdate('Y-m-d H:i:s') . ' UTC | ' . str_replace(["\r", "\n", '|'], ' ', mb_substr($username, 0, 40)) . ' | ' . $result . ' | ' . str_replace(["\r", "\n", '|'], ' ', mb_substr($ua, 0, 80));
    @file_put_contents($path, implode("\n", $old) . "\n");
}

function read_login_attempts(): array
{
    $path = __DIR__ . '/.logins.log';
    return @is_file($path) ? array_reverse((array)@file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)) : [];
}

function read_server_errors(): array
{
    $path = error_log_path();
    return @is_file($path) ? array_reverse((array)@file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)) : [];
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

function allowed_structures(PDO $db, array $me): array
{
    $rows = $me['role'] === 'superadmin'
        ? all_rows($db, 'SELECT id AS sid FROM structures ORDER BY id')
        : all_rows($db, 'SELECT structure_id AS sid FROM structure_members WHERE user_id = ? ORDER BY structure_id', [(int)$me['id']]);
    return array_map('intval', array_column($rows, 'sid'));
}

function active_structure(PDO $db, string $token, array $me): ?int
{
    $raw = one_value($db, 'SELECT structure_id FROM app_sessions WHERE token = ?', [$token]);
    $sid = $raw === null || $raw === false ? null : (int)$raw;
    $allowed = allowed_structures($db, $me);
    if ($sid === null || !in_array($sid, $allowed, true)) {
        $sid = $allowed[0] ?? null;
        run($db, 'UPDATE app_sessions SET structure_id = ? WHERE token = ?', [$sid, $token]);
    }
    return $sid;
}

function structure_member_ids(PDO $db, ?int $sid, array $me): ?array
{
    if (!$sid) {
        return $me['role'] === 'superadmin' ? null : [(int)$me['id']];
    }
    $rows = all_rows(
        $db,
        "SELECT user_id AS uid FROM structure_members WHERE structure_id = ? UNION SELECT id AS uid FROM app_users WHERE role = 'superadmin'",
        [$sid]
    );
    $ids = array_map('intval', array_column($rows, 'uid'));
    sort($ids);
    return $ids;
}

function session_members(PDO $db, string $token, array $me): ?array
{
    return structure_member_ids($db, active_structure($db, $token, $me), $me);
}

function in_members(?array $members, $userId): bool
{
    return $members === null || in_array((int)$userId, $members, true);
}

function members_sql(?array $members, string $column): string
{
    if ($members === null) {
        return '';
    }
    return " AND $column IN (" . ($members ? in_list($members) : '0') . ')';
}

function shares_structure_sql(int $owner, string $column = 'app_users.id'): string
{
    return "(NOT EXISTS (SELECT 1 FROM structure_members p WHERE p.user_id = $owner) "
        . 'OR EXISTS (SELECT 1 FROM structure_members a JOIN structure_members b ON a.structure_id = b.structure_id '
        . "WHERE a.user_id = $column AND b.user_id = $owner))";
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

function legacy_uploads_dir(): string
{
    return dirname(__DIR__) . '/uploads';
}

function uploads_dir(): string
{
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }
    $safe = dirname(__DIR__, 2) . '/asap-uploads-' . substr(md5(dirname(__DIR__)), 0, 10);
    if (@is_dir($safe) || @mkdir($safe, 0755, true)) {
        if (@is_writable($safe)) {
            return $dir = $safe;
        }
    }
    return $dir = legacy_uploads_dir();
}

function clean_upload_rel(string $rel): ?string
{
    $rel = ltrim(str_replace('\\', '/', $rel), '/');
    return preg_match('~^[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+$~', $rel) && strpos($rel, '..') === false ? $rel : null;
}

function find_upload(string $rel): ?string
{
    $rel = clean_upload_rel($rel);
    if ($rel === null) {
        return null;
    }
    foreach ([uploads_dir(), legacy_uploads_dir()] as $base) {
        $path = $base . '/' . $rel;
        if (@is_file($path)) {
            return $path;
        }
    }
    return null;
}

function store_file(string $folder, string $name, string $bytes): string
{
    $dir = uploads_dir() . '/' . $folder;
    if (!@is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    if (@file_put_contents($dir . '/' . $name, $bytes) === false) {
        return '';
    }
    return site_url() . '/uploads/' . $folder . '/' . $name;
}

function imported_name(string $url): string
{
    $path = parse_url($url, PHP_URL_PATH) ?: '';
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION)) ?: 'jpg';
    if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg'], true)) {
        $ext = 'jpg';
    }
    return substr(sha1($url), 0, 20) . '.' . $ext;
}

function fetch_remote(string $url): ?string
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 8]);
        $bytes = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if (is_string($bytes) && $bytes !== '' && $code === 200) {
            return $bytes;
        }
    }
    $ctx = stream_context_create(['http' => ['timeout' => 20]]);
    $bytes = @file_get_contents($url, false, $ctx);
    return is_string($bytes) && $bytes !== '' ? $bytes : null;
}

function download_image(string $url): string
{
    static $cache = [];
    if (!preg_match('~^https://cdn\.poehali\.dev/~', $url)) {
        return $url;
    }
    if (isset($cache[$url])) {
        return $cache[$url];
    }
    $name = imported_name($url);
    if (find_upload('imported/' . $name)) {
        return $cache[$url] = site_url() . '/uploads/imported/' . $name;
    }
    $bytes = fetch_remote($url);
    if ($bytes === null) {
        return $cache[$url] = $url;
    }
    $stored = store_file('imported', $name, $bytes);
    return $cache[$url] = ($stored !== '' ? $stored : $url);
}

function collect_cdn_urls($node, array &$out): void
{
    if (is_array($node)) {
        foreach ($node as $v) {
            collect_cdn_urls($v, $out);
        }
    } elseif (is_string($node)) {
        if (preg_match('~^https://cdn\.poehali\.dev/\S+$~', $node)) {
            $out[$node] = true;
        } elseif ($node !== '' && ($node[0] === '[' || $node[0] === '{') && strpos($node, 'cdn.poehali.dev') !== false) {
            $decoded = json_decode($node, true);
            if (is_array($decoded)) {
                collect_cdn_urls($decoded, $out);
            }
        }
    }
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
