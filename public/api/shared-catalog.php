<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';

$db = boot();
upgrade_schema($db);

const ADMIN_PIN = '15271527';

function structure_where(?int $sid): string
{
    return $sid ? 'structure_id = ' . (int)$sid : 'structure_id IS NULL';
}

function shared_items(PDO $db, ?int $sid): array
{
    $rows = all_rows(
        $db,
        'SELECT id, name, category, categories, weight, composition, image, barcode, hit, shelf_life_hours, storage_text, author, updated_at '
        . 'FROM shared_products WHERE ' . structure_where($sid) . ' ORDER BY updated_at DESC'
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
        'author' => $r['author'],
        'updatedAt' => iso($r['updated_at'], true),
    ], $rows);
}

$token = header_value('X-Auth-Token');
$me = session_user($db, $token);
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}
$sid = active_structure($db, $token, $me);

if (method() === 'GET') {
    out(['items' => shared_items($db, $sid)]);
}

if (header_value('X-Admin-Pin') !== ADMIN_PIN) {
    out(['error' => 'forbidden'], 403);
}

$body = body();

if (method() === 'DELETE') {
    run($db, 'DELETE FROM shared_products WHERE id = ? AND ' . structure_where($sid), [(string)($body['id'] ?? '')]);
    out(['ok' => true]);
}

$items = $body['items'] ?? (!empty($body['product']) ? [$body['product']] : []);
$author = mb_substr((string)($body['author'] ?? ''), 0, 80);
$saved = 0;
$db->beginTransaction();
foreach ((array)$items as $p) {
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
    $owner = one_row($db, 'SELECT structure_id FROM shared_products WHERE id = ?', [$pid]);
    if ($owner && ($owner['structure_id'] === null ? null : (int)$owner['structure_id']) !== $sid) {
        $pid = $pid . '-s' . (int)$sid;
        $clash = one_row($db, 'SELECT structure_id FROM shared_products WHERE id = ?', [$pid]);
        if ($clash && ($clash['structure_id'] === null ? null : (int)$clash['structure_id']) !== $sid) {
            continue;
        }
    }
    $exists = one_value($db, 'SELECT 1 FROM shared_products WHERE id = ?', [$pid]);
    $data = [
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
        'author' => $author,
        'updated_at' => now_utc(),
        'structure_id' => $sid,
    ];
    if (!$exists) {
        $data['created_at'] = now_utc();
    }
    upsert($db, 'shared_products', ['id'], $data);
    $saved++;
}
$db->commit();
out(['saved' => $saved, 'items' => shared_items($db, $sid)]);
