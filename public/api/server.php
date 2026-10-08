<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';

header('Content-Type: application/javascript; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate');

echo is_installed()
    ? "window.ASAP_API = 'auto';\n"
    : "window.ASAP_API = window.ASAP_API || null;\n";
