<?php
declare(strict_types=1);

ini_set('display_errors', '0');
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';

function e($v): string
{
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

$lines = [];
$add = function (bool $ok, string $title, string $detail = '') use (&$lines) {
    $lines[] = [$ok, $title, $detail];
};

$add(PHP_VERSION_ID >= 70400, 'Версия PHP: ' . PHP_VERSION, PHP_VERSION_ID >= 70400 ? '' : 'Нужна 7.4 или новее — переключите в панели REG.RU');
foreach (['pdo_mysql' => 'работа с базой MySQL', 'mbstring' => 'русские буквы в логинах', 'json' => 'обмен данными'] as $ext => $why) {
    $add(extension_loaded($ext), "Расширение PHP «{$ext}»", extension_loaded($ext) ? '' : "Не включено — нужно для: {$why}. Включите в панели REG.RU → Настройки PHP");
}

$mainCfg = read_config_file(config_path());
$backupCfg = read_config_file(backup_config_path());
$cfg = $mainCfg ?? $backupCfg;
$add($cfg !== null, 'Настройки сервера', $cfg === null
    ? 'Не найдены — сервер не установлен. Откройте api/install.php'
    : ($mainCfg ? 'Файл api/config.php на месте' : 'Основной файл пропал, используется запасная копия'));

$authorized = false;
$posted = ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST';
if ($cfg && $posted) {
    $authorized = hash_equals((string)($cfg['pass'] ?? ''), (string)($_POST['db_pass'] ?? ''));
    if (!$authorized) {
        $add(false, 'Пароль базы данных', 'Введён неверно — подробная проверка недоступна');
    }
}

@set_time_limit(600);
$photoReport = null;

$users = [];
$loginResult = null;
$realLogin = null;

function real_login_request(string $login, string $pass): array
{
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https') ? 'https' : 'http';
    $host = (string)($_SERVER['HTTP_HOST'] ?? 'localhost');
    $dir = rtrim(str_replace('\\', '/', dirname((string)($_SERVER['SCRIPT_NAME'] ?? '/api/check.php'))), '/');
    $url = $scheme . '://' . $host . $dir . '/auth.php';
    $payload = json_encode(['action' => 'login', 'username' => $login, 'password' => $pass], JSON_UNESCAPED_UNICODE);
    if (!function_exists('curl_init')) {
        return [$url, 0, 'curl недоступен на хостинге'];
    }
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $payload,
        CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => 0,
    ]);
    $body = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $err = curl_error($ch);
    $text = $body === false ? 'нет ответа: ' . $err : (string)$body;
    $text = preg_replace('/"token":"[0-9a-f]+"/', '"token":"…"', $text);
    return [$url, $code, mb_substr($text, 0, 800)];
}
if ($cfg && $authorized) {
    $db = null;
    try {
        $db = connect_db($cfg);
        $add(true, 'Подключение к базе данных', 'База «' . ($cfg['name'] ?? '') . '» на ' . ($cfg['host'] ?? ''));
    } catch (Throwable $ex) {
        $add(false, 'Подключение к базе данных', $ex->getMessage());
    }
    if ($db) {
        try {
            upgrade_schema($db, true);
            $add(true, 'Структура базы', 'Все таблицы и колонки на месте');
        } catch (Throwable $ex) {
            $add(false, 'Структура базы', $ex->getMessage());
        }
        foreach (['app_users', 'app_sessions', 'equipment', 'equipment_tasks', 'equipment_repairs', 'equipment_transfers', 'user_products'] as $t) {
            try {
                $add(true, "Таблица {$t}", 'записей: ' . (int)one_value($db, "SELECT COUNT(*) FROM {$t}"));
            } catch (Throwable $ex) {
                $add(false, "Таблица {$t}", $ex->getMessage());
            }
        }
        try {
            $db->beginTransaction();
            run($db, 'INSERT INTO app_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', ['check-' . bin2hex(random_bytes(8)), 0, now_utc(), now_utc(60)]);
            $db->rollBack();
            $add(true, 'Запись входов в базу', 'Работает');
        } catch (Throwable $ex) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $add(false, 'Запись входов в базу', $ex->getMessage());
        }
        try {
            $users = all_rows($db, 'SELECT id, username, role, active, manager_id, access_until, password_hash FROM app_users ORDER BY id');
        } catch (Throwable $ex) {
            $add(false, 'Список пользователей', $ex->getMessage());
        }
        $testLogin = mb_strtolower(trim((string)($_POST['login'] ?? '')));
        $testPass = (string)($_POST['password'] ?? '');
        if ($testLogin !== '') {
            $found = null;
            foreach ($users as $u) {
                if (mb_strtolower((string)$u['username']) === $testLogin) {
                    $found = $u;
                    break;
                }
            }
            if (!$found) {
                $loginResult = [false, "Пользователя «{$testLogin}» нет в базе"];
            } elseif (!flag($found['active'])) {
                $loginResult = [false, 'Пользователь найден, но отключён (active = 0)'];
            } elseif (!check_password($testPass, (string)$found['password_hash'])) {
                $loginResult = [false, 'Пользователь найден, но пароль не подходит'];
            } else {
                try {
                    [$until] = effective_access($db, (int)$found['id'], (string)$found['role'], $found['manager_id']);
                    $loginResult = ($until && $until <= now_utc())
                        ? [false, 'Пароль верный, но срок доступа истёк: ' . $until]
                        : [true, 'Пароль верный'];
                    if ($loginResult[0]) {
                        $step = 'удаление старых сеансов';
                        $db->beginTransaction();
                        try {
                            run($db, 'DELETE FROM app_sessions WHERE user_id = ?', [(int)$found['id']]);
                            $step = 'создание сеанса';
                            $tok = bin2hex(random_bytes(24));
                            run($db, 'INSERT INTO app_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [$tok, (int)$found['id'], now_utc(), now_utc(SESSION_DAYS * 86400)]);
                            $step = 'чтение сеанса';
                            $me = session_user($db, $tok, true);
                            if (!$me) {
                                throw new RuntimeException('сеанс создан, но не читается');
                            }
                            $step = 'формирование ответа';
                            $json = json_encode(['token' => $tok, 'user' => $me], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                            if ($json === false) {
                                throw new RuntimeException(json_last_error_msg());
                            }
                            $loginResult = [true, 'Полный тест входа пройден — сервер работает правильно'];
                            $realLogin = real_login_request($testLogin, $testPass);
                        } catch (Throwable $ex) {
                            $loginResult = [false, 'Пароль верный, но ошибка на шаге «' . $step . '»: ' . get_class($ex) . ': ' . $ex->getMessage()];
                        }
                        if ($db->inTransaction()) {
                            $db->rollBack();
                        }
                    }
                } catch (Throwable $ex) {
                    $loginResult = [false, 'Ошибка проверки срока доступа: ' . $ex->getMessage()];
                }
            }
        }
    }
}

if ($cfg && $authorized && isset($_FILES['data']) && ($_FILES['data']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
    $dump = json_decode((string)file_get_contents($_FILES['data']['tmp_name']), true);
    if (!is_array($dump)) {
        $photoReport = [false, 'Файл не подходит — нужен тот же .json, что загружали при установке.', 0, 0, 0];
    } else {
        $urls = [];
        collect_cdn_urls($dump, $urls);
        $have = 0;
        $got = 0;
        $fail = 0;
        foreach (array_keys($urls) as $u) {
            $name = imported_name($u);
            if (find_upload('imported/' . $name)) {
                $have++;
                continue;
            }
            $bytes = fetch_remote($u);
            if ($bytes !== null && store_file('imported', $name, $bytes) !== '') {
                $got++;
            } else {
                $fail++;
            }
        }
        $photoReport = [$fail === 0, 'Всего фото: ' . count($urls) . ' · уже были: ' . $have . ' · скачано сейчас: ' . $got . ' · не удалось: ' . $fail, $have, $got, $fail];
    }
}

$photoStat = null;
if ($cfg && $authorized && isset($db) && $db) {
    try {
        $missing = 0;
        $total = 0;
        foreach (['user_products', 'shared_products', 'equipment'] as $t) {
            foreach (all_rows($db, "SELECT image FROM {$t} WHERE image LIKE '%/uploads/%'") as $r) {
                $total++;
                $rel = substr((string)$r['image'], strpos((string)$r['image'], '/uploads/') + 9);
                if (!find_upload($rel)) {
                    $missing++;
                }
            }
        }
        $photoStat = [$total, $missing];
    } catch (Throwable $ex) {
        $photoStat = null;
    }
}

$apiMode = is_installed() ? 'ваш сервер' : 'poehali.dev';
$serverJs = @file_get_contents(__DIR__ . '/server.js');
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Проверка сервера</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f4f1ea; color: #1d1d1b; margin: 0; padding: 24px 12px; }
        .box { max-width: 640px; margin: 0 auto; background: #fff; border: 2px solid #1d1d1b; padding: 24px; }
        h1 { margin: 0 0 12px; font-size: 20px; text-transform: uppercase; }
        .row { display: flex; gap: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
        .ic { font-weight: 700; width: 22px; flex-shrink: 0; }
        .ok { color: #2e8b3d; } .bad { color: #e63b2e; }
        .d { color: #555; font-size: 13px; word-break: break-word; }
        label { display: block; margin: 12px 0 4px; font-weight: 600; font-size: 14px; }
        input { width: 100%; box-sizing: border-box; padding: 10px; border: 2px solid #1d1d1b; font-size: 15px; }
        button { margin-top: 16px; width: 100%; padding: 12px; border: 2px solid #1d1d1b; background: #e63b2e; color: #fff; font-weight: 700; text-transform: uppercase; cursor: pointer; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
        td, th { border: 1px solid #ddd; padding: 6px; text-align: left; }
        .res { padding: 10px; margin-top: 14px; border: 2px solid; }
    </style>
</head>
<body>
<div class="box">
    <h1>Проверка сервера</h1>
    <p class="d">Сайт сейчас берёт данные с: <b><?= e($apiMode) ?></b>. Файл server.js: <code><?= e(trim((string)$serverJs) === '' ? 'нет' : (strpos((string)$serverJs, "'auto'") !== false ? 'auto' : 'стандартный')) ?></code></p>
    <?php foreach ($lines as [$ok, $title, $detail]): ?>
        <div class="row">
            <span class="ic <?= $ok ? 'ok' : 'bad' ?>"><?= $ok ? '✓' : '✗' ?></span>
            <div><div><?= e($title) ?></div><?php if ($detail !== ''): ?><div class="d"><?= e($detail) ?></div><?php endif; ?></div>
        </div>
    <?php endforeach; ?>

    <?php if ($loginResult): ?>
        <div class="res <?= $loginResult[0] ? 'ok' : 'bad' ?>"><b>Проверка входа:</b> <?= e($loginResult[1]) ?></div>
    <?php endif; ?>

    <?php if ($realLogin): $realOk = $realLogin[1] === 200 && strpos($realLogin[2], '"token"') !== false; ?>
        <div class="res <?= $realOk ? 'ok' : 'bad' ?>">
            <b>Настоящий вход через сайт:</b> <?= $realOk ? 'работает' : 'НЕ работает' ?><br>
            <span class="d">Адрес: <?= e($realLogin[0]) ?> · Код ответа: <?= e($realLogin[1]) ?></span><br>
            <code class="d" style="display:block;white-space:pre-wrap;margin-top:6px"><?= e($realLogin[2]) ?></code>
        </div>
    <?php endif; ?>

    <?php if ($authorized): ?>
        <h3>Фото продуктов и оборудования</h3>
        <?php if ($photoStat): ?>
            <div class="res <?= $photoStat[1] === 0 ? 'ok' : 'bad' ?>">
                Фото на сервере: <?= (int)$photoStat[0] ?> · отсутствуют файлы: <b><?= (int)$photoStat[1] ?></b>
            </div>
        <?php endif; ?>
        <?php if ($photoReport): ?>
            <div class="res <?= $photoReport[0] ? 'ok' : 'bad' ?>"><b>Восстановление фото:</b> <?= e($photoReport[1]) ?></div>
        <?php endif; ?>
        <div class="d" style="margin-top:8px">Папка для фото: <?= e(basename(uploads_dir())) ?> (вне папки сайта — обновления её не затрут)</div>
    <?php endif; ?>

    <?php if ($authorized): $tries = read_login_attempts(); ?>
        <h3>Последние попытки входа с сайта (<?= count($tries) ?>)</h3>
        <?php if (!$tries): ?><div class="d bad">Ни одна попытка входа с сайта не дошла до сервера.</div><?php endif; ?>
        <?php foreach (array_slice($tries, 0, 12) as $line): ?><div class="d" style="padding:4px 0;border-bottom:1px solid #eee"><?= e($line) ?></div><?php endforeach; ?>
    <?php endif; ?>

    <?php if ($authorized): $errs = read_server_errors(); ?>
        <h3>Последние ошибки сервера (<?= count($errs) ?>)</h3>
        <?php if (!$errs): ?><div class="d">Ошибок не записано. Попробуйте войти на сайт и обновите эту страницу.</div><?php endif; ?>
        <?php foreach (array_slice($errs, 0, 10) as $line): ?><div class="d bad" style="padding:4px 0;border-bottom:1px solid #eee"><?= e($line) ?></div><?php endforeach; ?>
    <?php endif; ?>

    <?php if ($users): ?>
        <h3>Пользователи в базе (<?= count($users) ?>)</h3>
        <table>
            <tr><th>Логин</th><th>Роль</th><th>Активен</th><th>Доступ до</th><th>Пароль</th></tr>
            <?php foreach ($users as $u): ?>
                <tr>
                    <td><?= e($u['username']) ?></td>
                    <td><?= e($u['role']) ?></td>
                    <td><?= flag($u['active']) ? 'да' : '<span class="bad">нет</span>' ?></td>
                    <td><?= e($u['access_until'] ?: '—') ?></td>
                    <td><?= preg_match('/^[0-9a-f]{16}\$[0-9a-f]{64}$/', (string)$u['password_hash']) ? 'ок' : '<span class="bad">повреждён</span>' ?></td>
                </tr>
            <?php endforeach; ?>
        </table>
    <?php endif; ?>

    <?php if ($cfg): ?>
        <form method="post" enctype="multipart/form-data">
            <label>Пароль от базы данных MySQL</label>
            <input type="password" name="db_pass" value="<?= e($authorized ? (string)($_POST['db_pass'] ?? '') : '') ?>" required>
            <div class="d">Тот же, что вводили при установке. Нужен, чтобы посторонние не видели список пользователей.</div>
            <label>Проверить вход: логин (необязательно)</label>
            <input type="text" name="login" value="<?= e($_POST['login'] ?? '') ?>">
            <label>Пароль этого пользователя</label>
            <input type="password" name="password">
            <label>Восстановить фото: файл выгрузки .json (необязательно)</label>
            <input type="file" name="data" accept=".json,application/json">
            <div class="d">Тот же файл, что загружали при установке. Недостающие фото скачаются с poehali.dev — это может занять пару минут.</div>
            <button type="submit">Проверить</button>
        </form>
    <?php endif; ?>
</div>
</body>
</html>
