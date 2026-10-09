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
        "CREATE TABLE IF NOT EXISTS structures (
            id $auto,
            name $short NOT NULL,
            created_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS structure_members (
            structure_id INT NOT NULL,
            user_id INT NOT NULL,
            PRIMARY KEY (structure_id, user_id)
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
            commissioned_at DATE NULL,
            depreciation_per_day DECIMAL(14,2) NULL DEFAULT 0,
            repair_cost DECIMAL(14,2) NULL DEFAULT 0,
            in_repair TINYINT NULL DEFAULT 0,
            repair_sent_at DATETIME NULL,
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
        "CREATE TABLE IF NOT EXISTS equipment_transfers (
            id $auto,
            equipment_id $key NOT NULL,
            from_user INT NOT NULL,
            to_user INT NOT NULL,
            created_by INT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            created_at DATETIME NULL,
            decided_at DATETIME NULL,
            decided_by INT NULL,
            equipment_name $short NULL,
            equipment_code $short NULL,
            equipment_price DECIMAL(12,2) NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS equipment_repairs (
            id $auto,
            user_id INT NOT NULL,
            equipment_id $key NOT NULL,
            sent_at DATETIME NULL,
            returned_at DATETIME NULL,
            cost DECIMAL(14,2) NOT NULL DEFAULT 0,
            description $text NULL,
            photos $text NULL,
            returned_by INT NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS equipment_tasks (
            id $auto,
            user_id INT NOT NULL,
            equipment_id $key NULL,
            technician_id INT NULL,
            created_by INT NULL,
            description $text NULL,
            photos $text NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'open',
            created_at DATETIME NULL,
            done_at DATETIME NULL,
            done_by INT NULL,
            done_comment $text NULL,
            priority VARCHAR(16) NOT NULL DEFAULT 'normal',
            cost DECIMAL(12,2) NOT NULL DEFAULT 0,
            kind VARCHAR(16) NOT NULL DEFAULT 'task'
        )$tail",
        "CREATE TABLE IF NOT EXISTS technician_scopes (
            technician_id INT NOT NULL,
            head_id INT NOT NULL,
            PRIMARY KEY (technician_id, head_id)
        )$tail",
        "CREATE TABLE IF NOT EXISTS accountant_scopes (
            accountant_id INT NOT NULL,
            admin_id INT NOT NULL,
            PRIMARY KEY (accountant_id, admin_id)
        )$tail",
        "CREATE TABLE IF NOT EXISTS accountant_technicians (
            accountant_id INT NOT NULL,
            technician_id INT NOT NULL,
            PRIMARY KEY (accountant_id, technician_id)
        )$tail",
        "CREATE TABLE IF NOT EXISTS telegram_links (
            user_id INT NOT NULL PRIMARY KEY,
            chat_id VARCHAR(32) NOT NULL,
            tg_name $short NOT NULL DEFAULT '',
            linked_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS telegram_link_codes (
            code VARCHAR(64) NOT NULL PRIMARY KEY,
            user_id INT NOT NULL,
            expires_at DATETIME NOT NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS print_keys (
            owner_id INT NOT NULL PRIMARY KEY,
            print_key VARCHAR(64) NOT NULL,
            printers $text NULL,
            last_seen DATETIME NULL,
            created_at DATETIME NULL
        )$tail",
        "CREATE TABLE IF NOT EXISTS print_jobs (
            id $auto,
            owner_id INT NOT NULL,
            printer_ip VARCHAR(64) NOT NULL,
            printer_port INT NOT NULL DEFAULT 9100,
            data $text NOT NULL,
            status VARCHAR(16) NOT NULL DEFAULT 'pending',
            error $short NOT NULL DEFAULT '',
            created_by INT NULL,
            created_at DATETIME NULL,
            taken_at DATETIME NULL
        )$tail",
    ];
}

const SCHEMA_VERSION = 4;

const SCHEMA_COLUMNS = [
    'app_sessions' => [
        'structure_id' => 'INT NULL',
    ],
    'shared_products' => [
        'structure_id' => 'INT NULL',
    ],
    'equipment' => [
        'commissioned_at' => 'DATE NULL',
        'depreciation_per_day' => 'DECIMAL(14,2) NULL DEFAULT 0',
        'repair_cost' => 'DECIMAL(14,2) NULL DEFAULT 0',
        'in_repair' => 'TINYINT NULL DEFAULT 0',
        'repair_sent_at' => 'DATETIME NULL',
    ],
    'equipment_transfers' => [
        'equipment_name' => 'VARCHAR(255) NULL',
        'equipment_code' => 'VARCHAR(255) NULL',
        'equipment_price' => 'DECIMAL(12,2) NULL',
    ],
];

function table_columns(PDO $db, string $table): array
{
    $stmt = $db->query("SELECT * FROM $table LIMIT 0");
    $cols = [];
    for ($i = 0; $i < $stmt->columnCount(); $i++) {
        $meta = $stmt->getColumnMeta($i);
        $cols[] = $meta['name'];
    }
    return $cols;
}

function upgrade_schema(PDO $db, bool $force = false): void
{
    $marker = __DIR__ . '/.schema_v' . SCHEMA_VERSION;
    if (!$force && is_file($marker)) {
        return;
    }
    $driver = (load_config()['driver'] ?? 'mysql') === 'sqlite' ? 'sqlite' : 'mysql';
    foreach (schema_sql($driver) as $sql) {
        $db->exec($sql);
    }
    foreach (SCHEMA_COLUMNS as $table => $columns) {
        $have = table_columns($db, $table);
        foreach ($columns as $col => $def) {
            if (!in_array($col, $have, true)) {
                $db->exec("ALTER TABLE $table ADD COLUMN $col $def");
            }
        }
    }
    seed_structures($db);
    @file_put_contents($marker, date('c'));
}

function seed_structures(PDO $db): void
{
    if ((int)one_value($db, 'SELECT COUNT(*) FROM structures') === 0) {
        run($db, 'INSERT INTO structures (name, created_at) VALUES (?, ?)', ['Автосуши Автопицца', now_utc()]);
    }
    $first = (int)one_value($db, 'SELECT MIN(id) FROM structures');
    if (!$first) {
        return;
    }
    if ((int)one_value($db, 'SELECT COUNT(*) FROM structure_members') === 0) {
        foreach (all_rows($db, "SELECT id FROM app_users WHERE role <> 'superadmin'") as $u) {
            run($db, 'INSERT INTO structure_members (structure_id, user_id) VALUES (?, ?)', [$first, (int)$u['id']]);
        }
    }
    run($db, 'UPDATE shared_products SET structure_id = ? WHERE structure_id IS NULL', [$first]);
}

const IMPORT_COLUMNS = [
    'app_users' => ['id', 'username', 'full_name', 'password_hash', 'role', 'active', 'created_at', 'manager_id', 'access_until'],
    'app_sessions' => ['token', 'user_id', 'created_at', 'expires_at'],
    'structures' => ['id', 'name', 'created_at'],
    'structure_members' => ['structure_id', 'user_id'],
    'user_products' => ['user_id', 'id', 'name', 'category', 'categories', 'weight', 'composition', 'image', 'barcode', 'hit', 'shelf_life_hours', 'storage_text', 'updated_at'],
    'user_categories' => ['user_id', 'id', 'label', 'icon', 'position', 'updated_at'],
    'user_prefs' => ['user_id', 'pref_key', 'value', 'updated_at'],
    'user_meta' => ['user_id', 'seeded', 'created_at'],
    'shared_products' => ['id', 'name', 'category', 'categories', 'weight', 'composition', 'image', 'barcode', 'hit', 'shelf_life_hours', 'storage_text', 'author', 'created_at', 'updated_at', 'structure_id'],
    'equipment' => ['user_id', 'id', 'name', 'code', 'price', 'location', 'note', 'image', 'serial', 'active', 'created_at', 'updated_at', 'qr_broken', 'written_off_at', 'write_off_reason', 'commissioned_at', 'depreciation_per_day', 'repair_cost', 'in_repair', 'repair_sent_at'],
    'equipment_repairs' => ['id', 'user_id', 'equipment_id', 'sent_at', 'returned_at', 'cost', 'description', 'photos', 'returned_by'],
    'equipment_tasks' => ['id', 'user_id', 'equipment_id', 'technician_id', 'created_by', 'description', 'photos', 'status', 'created_at', 'done_at', 'done_by', 'done_comment', 'priority', 'cost', 'kind'],
    'equipment_transfers' => ['id', 'equipment_id', 'from_user', 'to_user', 'created_by', 'status', 'created_at', 'decided_at', 'decided_by', 'equipment_name', 'equipment_code', 'equipment_price'],
    'technician_scopes' => ['technician_id', 'head_id'],
    'accountant_scopes' => ['accountant_id', 'admin_id'],
    'accountant_technicians' => ['accountant_id', 'technician_id'],
    'telegram_links' => ['user_id', 'chat_id', 'tg_name', 'linked_at'],
    'print_keys' => ['owner_id', 'print_key', 'printers', 'last_seen', 'created_at'],
    'inventory_sessions' => ['id', 'user_id', 'started_by', 'started_at', 'finished_at', 'scanned', 'missing', 'total', 'total_price', 'missing_price'],
];

const IMPORT_DEFAULTS = [
    'equipment' => ['location' => '', 'serial' => '', 'price' => 0, 'active' => 1, 'qr_broken' => 0, 'in_repair' => 0, 'depreciation_per_day' => 0, 'repair_cost' => 0],
    'equipment_tasks' => ['status' => 'open', 'priority' => 'normal', 'cost' => 0, 'kind' => 'task'],
    'equipment_repairs' => ['cost' => 0],
    'equipment_transfers' => ['status' => 'pending'],
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
        if (!array_key_exists($table, $tables) && !in_array($table, ['app_users', 'equipment'], true)) {
            $counts[$table] = 0;
            continue;
        }
        $rows = $tables[$table] ?? [];
        $db->exec("DELETE FROM $table");
        $stmt = $db->prepare("INSERT INTO $table (" . implode(', ', $cols) . ') VALUES (' . implode(', ', array_fill(0, count($cols), '?')) . ')');
        foreach ($rows as $row) {
            if ($table === 'print_keys' && !array_key_exists('print_key', $row)) {
                $row['print_key'] = $row['key'] ?? '';
            }
            if ($table === 'user_prefs' && !array_key_exists('pref_key', $row)) {
                $row['pref_key'] = $row['key'] ?? '';
            }
            if ($mapImage && isset($row['image']) && is_string($row['image'])) {
                $row['image'] = $mapImage($row['image']);
            }
            $defaults = IMPORT_DEFAULTS[$table] ?? [];
            $stmt->execute(array_map(fn($c) => import_value($row[$c] ?? ($defaults[$c] ?? null)), $cols));
        }
        $counts[$table] = count($rows);
    }
    $db->commit();
    return $counts;
}