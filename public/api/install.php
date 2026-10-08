<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';

header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-store');
@set_time_limit(600);

$installed = is_installed();
$messages = [];
$errors = [];

function h($v): string
{
    return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8');
}

if (!$installed && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $cfg = [
        'driver' => 'mysql',
        'host' => trim((string)($_POST['host'] ?? 'localhost')) ?: 'localhost',
        'port' => (int)($_POST['port'] ?? 3306) ?: 3306,
        'name' => trim((string)($_POST['name'] ?? '')),
        'user' => trim((string)($_POST['user'] ?? '')),
        'pass' => (string)($_POST['pass'] ?? ''),
        'telegram_token' => trim((string)($_POST['telegram_token'] ?? '')),
    ];
    $superPass = (string)($_POST['super_pass'] ?? '');
    $data = null;
    $upload = $_FILES['data'] ?? null;
    if ($upload && ($upload['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $data = json_decode((string)file_get_contents($upload['tmp_name']), true);
        if (!is_array($data) || !isset($data['tables']) || !is_array($data['tables'])) {
            $errors[] = 'Файл с данными не подходит. Скачайте его заново кнопкой «Выгрузить данные для переноса».';
        }
    } elseif (mb_strlen($superPass) < 4) {
        $errors[] = 'Загрузите файл с данными или задайте пароль супер-админа (от 4 символов) для чистой установки.';
    }
    if ($cfg['name'] === '' || $cfg['user'] === '') {
        $errors[] = 'Укажите имя базы данных и пользователя.';
    }
    if (!is_writable(__DIR__)) {
        $errors[] = 'Нет прав на запись в папку api. Дайте папке права 755 в панели хостинга.';
    }

    if (!$errors) {
        try {
            $db = connect_db($cfg);
            upgrade_schema($db, true);
            if ($data) {
                $map = !empty($_POST['copy_images']) ? 'download_image' : null;
                $counts = import_data($db, $data['tables'], $map);
                $messages[] = 'Перенесено: пользователей — ' . $counts['app_users']
                    . ', продуктов — ' . $counts['user_products']
                    . ', общая база — ' . $counts['shared_products']
                    . ', оборудование — ' . $counts['equipment']
                    . ', задач техникам — ' . ($counts['equipment_tasks'] ?? 0)
                    . ', ремонтов — ' . ($counts['equipment_repairs'] ?? 0) . '.';
            } else {
                run(
                    $db,
                    'INSERT INTO app_users (username, full_name, password_hash, role, active, created_at) VALUES (?, ?, ?, ?, 1, ?)',
                    ['superadmin', 'Супер-админ', hash_password($superPass), 'superadmin', now_utc()]
                );
                $messages[] = 'Создан пользователь superadmin с заданным паролем.';
            }
            if (!save_config($cfg)) {
                throw new RuntimeException('Не удалось сохранить настройки: нет прав на запись в папку api.');
            }
            @file_put_contents(__DIR__ . '/server.js', "window.ASAP_API = 'auto';\n");
            $installed = true;
        } catch (Throwable $e) {
            $errors[] = 'Ошибка: ' . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Установка сервера</title>
    <style>
        body { font-family: system-ui, sans-serif; background: #f4f1ea; color: #1d1d1b; margin: 0; padding: 32px 16px; }
        .box { max-width: 520px; margin: 0 auto; background: #fff; border: 2px solid #1d1d1b; padding: 28px; }
        h1 { margin: 0 0 6px; font-size: 22px; text-transform: uppercase; }
        p { line-height: 1.5; }
        label { display: block; margin: 14px 0 4px; font-weight: 600; font-size: 14px; }
        input[type=text], input[type=password], input[type=number] { width: 100%; box-sizing: border-box; padding: 10px; border: 2px solid #1d1d1b; font-size: 15px; }
        .row { display: flex; gap: 12px; } .row > div { flex: 1; }
        button, .btn { display: inline-block; margin-top: 20px; width: 100%; padding: 14px; border: 2px solid #1d1d1b; background: #e63b2e; color: #fff; font-size: 15px; font-weight: 700; text-transform: uppercase; cursor: pointer; text-align: center; text-decoration: none; box-sizing: border-box; }
        .hint { color: #666; font-size: 13px; margin-top: 4px; }
        .err { background: #fde8e6; border: 2px solid #e63b2e; padding: 10px 12px; margin: 12px 0; }
        .ok { background: #e7f5e9; border: 2px solid #2e8b3d; padding: 10px 12px; margin: 12px 0; }
        hr { border: 0; border-top: 1px solid #ddd; margin: 22px 0 6px; }
        .check { display: flex; gap: 8px; align-items: flex-start; font-weight: 400; }
    </style>
</head>
<body>
<div class="box">
<?php if ($installed): ?>
    <h1>Сервер установлен</h1>
    <?php foreach ($messages as $m): ?><div class="ok"><?= h($m) ?></div><?php endforeach; ?>
    <p>Сайт переключён на ваш сервер и больше не зависит от poehali.dev. Сотрудникам нужно один раз войти заново.</p>
    <p><b>Важно:</b> удалите файл <code>api/install.php</code> с хостинга. Повторно установщик не запустится, пока сохранены настройки сервера.</p>
    <a class="btn" href="../">Открыть сайт</a>
<?php else: ?>
    <h1>Установка сервера</h1>
    <p>Создайте базу данных MySQL в панели хостинга и впишите её данные ниже.</p>
    <?php foreach ($errors as $e): ?><div class="err"><?= h($e) ?></div><?php endforeach; ?>
    <form method="post" enctype="multipart/form-data">
        <div class="row">
            <div><label>Сервер базы</label><input type="text" name="host" value="<?= h($_POST['host'] ?? 'localhost') ?>"></div>
            <div style="max-width:110px"><label>Порт</label><input type="number" name="port" value="<?= h($_POST['port'] ?? '3306') ?>"></div>
        </div>
        <label>Имя базы данных</label><input type="text" name="name" value="<?= h($_POST['name'] ?? '') ?>" required>
        <label>Пользователь базы</label><input type="text" name="user" value="<?= h($_POST['user'] ?? '') ?>" required>
        <label>Пароль базы</label><input type="password" name="pass">
        <hr>
        <label>Файл с данными (.json)</label>
        <input type="file" name="data" accept=".json,application/json">
        <div class="hint">Скачивается в старой версии сайта: профиль супер-админа → «Выгрузить данные для переноса». Все логины и пароли сохранятся.</div>
        <label class="check"><input type="checkbox" name="copy_images" value="1" checked> Скопировать фото продуктов на мой хостинг</label>
        <hr>
        <label>Токен Telegram-бота (необязательно)</label>
        <input type="text" name="telegram_token" value="<?= h($_POST['telegram_token'] ?? '') ?>" placeholder="123456:ABC-DEF...">
        <div class="hint">Нужен для уведомлений техникам и админам. Возьмите у @BotFather. Работает только при открытии сайта по https.</div>
        <hr>
        <label>Пароль супер-админа (только если без файла)</label>
        <input type="password" name="super_pass">
        <div class="hint">Для чистой установки без переноса данных. Логин — superadmin.</div>
        <button type="submit">Установить</button>
    </form>
<?php endif; ?>
</div>
</body>
</html>