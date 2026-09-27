<?php
declare(strict_types=1);

function schema_sql(string $driver): array
{
    $mysql = $driver !== 'sqlite';
    $auto = $mysql ? 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    $key = 'VARCHAR(191)';
    $text = $mysql ? 'LONGTEXT' : 'TEXT';
    $short = $mysql ? 'VARCHAR(255)' : 'TEXT';
    $tail = $mysql ? ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci' : '';

    return [
        "CREATE TABLE IF NOT EXISTS app_users (
            id $auto,
            username $short NOT NULL,
            full_name $short NOT NULL DEFAULT '',
            password_hash $short NOT NULL,
            role VARCHAR(20) NOT NULL DEFAULT 'user',
            active TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NULL,
            manager_id INT NULL,
            access_until DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS app_sessions (
            token VARCHAR(64) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            created_at DATETIME NULL,
            expires_at DATETIME NOT NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS user_products (
            user_id INT NOT NULL,
            id $key NOT NULL,
            name $text NOT NULL,
            category $short NOT NULL DEFAULT '',
            categories $text NULL,
            weight $short NOT NULL DEFAULT '',
            composition $text NULL,
            image $text NULL,
            barcode $short NOT NULL DEFAULT '',
            hit TINYINT NOT NULL DEFAULT 0,
            shelf_life_hours INT NULL,
            storage_text $text NULL,
            updated_at DATETIME NULL,
            PRIMARY KEY (user_id, id)
        )$tail",
        "CREATE TABLE IF NOT EXISTS user_categories (
            user_id INT NOT NULL,
            id $key NOT NULL,
            label $short NOT NULL DEFAULT '',
            icon VARCHAR(64) NOT NULL DEFAULT 'Utensils',
            position INT NOT NULL DEFAULT 0,
            updated_at DATETIME NULL,
            PRIMARY KEY (user_id, id)
        )$tail",
        "CREATE TABLE IF NOT EXISTS user_prefs (
            user_id INT NOT NULL,
            pref_key VARCHAR(64) NOT NULL,
            value $text NULL,
            updated_at DATETIME NULL,
            PRIMARY KEY (user_id, pref_key)
        )$tail",
        "CREATE TABLE IF NOT EXISTS user_meta (
            user_id INT NOT NULL PRIMARY KEY,
            seeded TINYINT NOT NULL DEFAULT 0,
            created_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS shared_products (
            id $key NOT NULL PRIMARY KEY,
            name $text NOT NULL,
            category $short NOT NULL DEFAULT '',
            categories $text NULL,
            weight $short NOT NULL DEFAULT '',
            composition $text NULL,
            image $text NULL,
            barcode $short NOT NULL DEFAULT '',
            hit TINYINT NOT NULL DEFAULT 0,
            shelf_life_hours INT NULL,
            storage_text $text NULL,
            author $short NOT NULL DEFAULT '',
            created_at DATETIME NULL,
            updated_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS equipment (
            user_id INT NOT NULL,
            id $key NOT NULL,
            name $short NOT NULL,
            code $key NOT NULL,
            price DECIMAL(12,2) NOT NULL DEFAULT 0,
            location $short NOT NULL DEFAULT '',
            note $text NULL,
            image $text NULL,
            serial $short NOT NULL DEFAULT '',
            active TINYINT NOT NULL DEFAULT 1,
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            qr_broken TINYINT NOT NULL DEFAULT 0,
            written_off_at DATETIME NULL,
            write_off_reason $text NULL,
            PRIMARY KEY (user_id, id)
        )$tail",
        "CREATE TABLE IF NOT EXISTS inventory_sessions (
            id $auto,
            user_id INT NOT NULL,
            started_by INT NULL,
            started_at DATETIME NULL,
            finished_at DATETIME NULL,
            scanned $text NULL,
            missing $text NULL,
            total INT NOT NULL DEFAULT 0,
            total_price DECIMAL(12,2) NOT NULL DEFAULT 0,
            missing_price DECIMAL(12,2) NOT NULL DEFAULT 0
        )$tail",
    ];
}

const IMPORT_COLUMNS = [
    'app_users' => ['id', 'username', 'full_name', 'password_hash', 'role', 'active', 'created_at', 'manager_id', 'access_until'],
    'app_sessions' => ['token', 'user_id', 'created_at', 'expires_at'],
    'user_products' => ['user_id', 'id', 'name', 'category', 'categories', 'weight', 'composition', 'image', 'barcode', 'hit', 'shelf_life_hours', 'storage_text', 'updated_at'],
    'user_categories' => ['user_id', 'id', 'label', 'icon', 'position', 'updated_at'],
    'user_prefs' => ['user_id', 'pref_key', 'value', 'updated_at'],
    'user_meta' => ['user_id', 'seeded', 'created_at'],
    'shared_products' => ['id', 'name', 'category', 'categories', 'weight', 'composition', 'image', 'barcode', 'hit', 'shelf_life_hours', 'storage_text', 'author', 'created_at', 'updated_at'],
    'equipment' => ['user_id', 'id', 'name', 'code', 'price', 'location', 'note', 'image', 'serial', 'active', 'created_at', 'updated_at', 'qr_broken', 'written_off_at', 'write_off_reason'],
    'inventory_sessions' => ['id', 'user_id', 'started_by', 'started_at', 'finished_at', 'scanned', 'missing', 'total', 'total_price', 'missing_price'],
];

function import_value($value)
{
    if (is_bool($value)) {
        return $value ? 1 : 0;
    }
    if (is_array($value) || is_object($value)) {
        return json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
    return $value;
}

function import_data(PDO $db, array $tables, ?callable $mapImage = null): array
{
    $counts = [];
    $db->beginTransaction();
    foreach (IMPORT_COLUMNS as $table => $cols) {
        $rows = $tables[$table] ?? [];
        $db->exec("DELETE FROM $table");
        $stmt = $db->prepare("INSERT INTO $table (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')');
        foreach ($rows as $row) {
            if ($table === 'user_prefs' && !array_key_exists('pref_key', $row)) {
                $row['pref_key'] = $row['key'] ?? '';
            }
            if ($mapImage && isset($row['image']) && is_string($row['image'])) {
                $row['image'] = $mapImage($row['image']);
            }
            $stmt->execute(array_map(fn($c) => import_value($row[$c] ?? null), $cols));
        }
        $counts[$table] = count($rows);
    }
    $db->commit();
    return $counts;
}
