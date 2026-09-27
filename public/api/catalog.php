<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

$db = boot();

function catalog_can_manage(PDO $db, array $me, int $target): bool
{
    if ($target === $me['id'] || $me['role'] === 'superadmin') {
        return true;
    }
    if ($me['role'] === 'manager') {
        return in_array($target, manager_branch_ids($db, $me['id']), true);
    }
    if ($me['role'] === 'admin') {
        return (int)one_value($db, 'SELECT manager_id FROM app_users WHERE id = ?', [$target]) === $me['id'];
    }
    return false;
}

function read_pref_key(PDO $db, int $uid, string $key): stdClass
{
    return json_object(one_value($db, 'SELECT value FROM user_prefs WHERE user_id = ? AND pref_key = ?', [$uid, $key]));
}

function save_pref_key(PDO $db, int $uid, string $key, $value): void
{
    upsert($db, 'user_prefs', ['user_id', 'pref_key'], [
        'user_id' => $uid,
        'pref_key' => $key,
        'value' => json_text($value),
        'updated_at' => now_utc(),
    ]);
}

function read_products(PDO $db, int $uid): array
{
    $rows = all_rows(
        $db,
        'SELECT id, name, category, categories, weight, composition, image, barcode, hit, shelf_life_hours, storage_text '
        . 'FROM user_products WHERE user_id = ? ORDER BY name',
        [$uid]
    );
    return array_map(fn($r) => [
        'id' => $r['id'],
        'name' => $r['name'],
        'category' => $r['category'],
        'categories' => json_list($r['categories']),
        'weight' => $r['weight'],
        'composition' => $r['composition'],
        'image' => $r['image'],
        'barcode' => $r['barcode'],
        'hit' => flag($r['hit']),
        'shelfLifeHours' => $r['shelf_life_hours'] === null ? null : (int)$r['shelf_life_hours'],
        'storageText' => $r['storage_text'],
    ], $rows);
}

function read_categories(PDO $db, int $uid): array
{
    $rows = all_rows($db, 'SELECT id, label, icon FROM user_categories WHERE user_id = ? ORDER BY position, label', [$uid]);
    return array_map(fn($r) => ['id' => $r['id'], 'label' => $r['label'], 'icon' => $r['icon']], $rows);
}

function save_products(PDO $db, int $uid, array $products): int
{
    $saved = 0;
    foreach ($products as $p) {
        if (!is_array($p)) {
            continue;
        }
        $pid = (string)($p['id'] ?? '');
        if ($pid === '' || empty($p['name'])) {
            continue;
        }
        $cats = $p['categories'] ?? null;
        if (!$cats) {
            $cats = !empty($p['category']) ? [$p['category']] : [];
        }
        upsert($db, 'user_products', ['user_id', 'id'], [
            'user_id' => $uid,
            'id' => $pid,
            'name' => (string)$p['name'],
            'category' => (string)($p['category'] ?? ''),
            'categories' => json_text(array_values($cats)),
            'weight' => (string)($p['weight'] ?? ''),
            'composition' => (string)($p['composition'] ?? ''),
            'image' => clean_image((string)($p['image'] ?? ''), 'catalog', $pid),
            'barcode' => (string)($p['barcode'] ?? ''),
            'hit' => !empty($p['hit']) ? 1 : 0,
            'shelf_life_hours' => shelf_value($p['shelfLifeHours'] ?? null),
            'storage_text' => (string)($p['storageText'] ?? ''),
            'updated_at' => now_utc(),
        ]);
        $saved++;
    }
    return $saved;
}

function save_categories(PDO $db, int $uid, array $cats): void
{
    $keep = [];
    foreach ($cats as $c) {
        if (!empty($c['id'])) {
            $keep[] = (string)$c['id'];
        }
    }
    if ($keep) {
        run(
            $db,
            'DELETE FROM user_categories WHERE user_id = ? AND id NOT IN (' . implode(', ', array_fill(0, count($keep), '?')) . ')',
            array_merge([$uid], $keep)
        );
    } else {
        run($db, 'DELETE FROM user_categories WHERE user_id = ?', [$uid]);
    }
    foreach (array_values($cats) as $i => $c) {
        if (empty($c['id'])) {
            continue;
        }
        upsert($db, 'user_categories', ['user_id', 'id'], [
            'user_id' => $uid,
            'id' => (string)$c['id'],
            'label' => (string)($c['label'] ?? ''),
            'icon' => (string)($c['icon'] ?? '') ?: 'Utensils',
            'position' => $i,
            'updated_at' => now_utc(),
        ]);
    }
}

function mark_seeded(PDO $db, int $uid): void
{
    upsert($db, 'user_meta', ['user_id'], ['user_id' => $uid, 'seeded' => 1]);
}

function is_seeded(PDO $db, int $uid): bool
{
    return flag(one_value($db, 'SELECT seeded FROM user_meta WHERE user_id = ?', [$uid]) ?? 0);
}

function build_overview(PDO $db, array $me): array
{
    if ($me['role'] === 'manager') {
        $branch = manager_branch_ids($db, $me['id']);
        if (!$branch) {
            return [];
        }
        $staff = all_rows($db, 'SELECT id, username, full_name FROM app_users WHERE active = 1 AND id IN (' . in_list($branch) . ') ORDER BY role DESC, username');
    } elseif ($me['role'] === 'superadmin') {
        $staff = all_rows($db, "SELECT id, username, full_name FROM app_users WHERE active = 1 AND role IN ('user', 'admin') ORDER BY role DESC, username");
    } else {
        $staff = all_rows($db, 'SELECT id, username, full_name FROM app_users WHERE active = 1 AND manager_id = ? ORDER BY username', [$me['id']]);
    }
    $nowMs = (int)round(microtime(true) * 1000);
    $soonMs = 3600000;
    $result = [];
    foreach ($staff as $person) {
        $uid = (int)$person['id'];
        $base = ['id' => $uid, 'username' => $person['username'], 'fullName' => $person['full_name']];
        $history = (array)read_pref_key($db, $uid, 'history');
        $expired = [];
        $soon = [];
        if ($history) {
            $rows = all_rows($db, 'SELECT id, name, shelf_life_hours FROM user_products WHERE user_id = ? AND shelf_life_hours IS NOT NULL', [$uid]);
            foreach ($rows as $r) {
                $stamp = $history[$r['id']] ?? null;
                $hours = (int)$r['shelf_life_hours'];
                if (!$stamp || !$hours) {
                    continue;
                }
                $expiresAt = (int)$stamp + $hours * 3600000;
                $left = $expiresAt - $nowMs;
                $item = ['id' => $r['id'], 'name' => $r['name'], 'expiresAt' => $expiresAt, 'leftMs' => $left];
                if ($left <= 0) {
                    $expired[] = $item;
                } elseif ($left <= $soonMs) {
                    $soon[] = $item;
                }
            }
        }
        $byLeft = fn($a, $b) => $a['leftMs'] <=> $b['leftMs'];
        usort($expired, $byLeft);
        usort($soon, $byLeft);
        $result[] = $base + ['expired' => $expired, 'soon' => $soon, 'total' => count($expired) + count($soon)];
    }
    usort($result, fn($a, $b) => [count($b['expired']), count($b['soon']), $a['username']] <=> [count($a['expired']), count($a['soon']), $b['username']]);
    return $result;
}

$me = session_user($db, header_value('X-Auth-Token'));
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
$uid = target_user($db, $me, 'catalog_can_manage');

if (method() === 'GET' && ($_GET['action'] ?? '') === 'overview') {
    if (!in_array($me['role'], ['admin', 'superadmin', 'manager'], true)) {
        out(['error' => 'forbidden'], 403);
    }
    out(['staff' => build_overview($db, $me)]);
}

$snapshot = fn() => [
    'products' => read_products($db, $uid),
    'categories' => read_categories($db, $uid),
    'prefs' => read_pref_key($db, $uid, 'filters'),
];

if (method() === 'GET') {
    out($snapshot() + ['history' => read_pref_key($db, $uid, 'history'), 'seeded' => is_seeded($db, $uid)]);
}

$body = body();
$action = (string)($body['action'] ?? '');

if ($action === 'seed') {
    if (!is_seeded($db, $uid)) {
        $db->beginTransaction();
        save_products($db, $uid, (array)($body['products'] ?? []));
        if (!empty($body['categories'])) {
            save_categories($db, $uid, (array)$body['categories']);
        }
        mark_seeded($db, $uid);
        $db->commit();
    }
    out($snapshot() + ['seeded' => true]);
}

if (method() === 'DELETE') {
    run($db, 'DELETE FROM user_products WHERE user_id = ? AND id = ?', [$uid, (string)($body['id'] ?? '')]);
    out(['ok' => true, 'products' => read_products($db, $uid)]);
}

if ($action === 'prefs') {
    save_pref_key($db, $uid, 'filters', (object)($body['prefs'] ?? []));
    out(['ok' => true, 'prefs' => read_pref_key($db, $uid, 'filters')]);
}

if ($action === 'history') {
    $current = (array)read_pref_key($db, $uid, 'history');
    foreach ((array)($body['history'] ?? []) as $key => $stamp) {
        if (!is_int($stamp) && !is_float($stamp)) {
            continue;
        }
        if ($stamp > ($current[$key] ?? 0)) {
            $current[$key] = (int)$stamp;
        }
    }
    save_pref_key($db, $uid, 'history', (object)$current);
    out(['ok' => true, 'history' => (object)$current]);
}

if ($action === 'categories') {
    save_categories($db, $uid, (array)($body['categories'] ?? []));
    out(['ok' => true, 'categories' => read_categories($db, $uid)]);
}

if ($action === 'replace') {
    $db->beginTransaction();
    run($db, 'DELETE FROM user_products WHERE user_id = ?', [$uid]);
    save_products($db, $uid, (array)($body['products'] ?? []));
    if (!empty($body['categories'])) {
        save_categories($db, $uid, (array)$body['categories']);
    }
    mark_seeded($db, $uid);
    $db->commit();
    out(['ok' => true, 'products' => read_products($db, $uid), 'categories' => read_categories($db, $uid)]);
}

$items = $body['products'] ?? (!empty($body['product']) ? [$body['product']] : []);
$db->beginTransaction();
$saved = save_products($db, $uid, (array)$items);
$db->commit();
out(['saved' => $saved, 'products' => read_products($db, $uid)]);
