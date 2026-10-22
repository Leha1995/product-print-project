<?php
declare(strict_types=1);

const REPORT_HOUR = 23;
const REPORT_TZ = -180;
const BOSS_ROLES_R = ['admin', 'manager', 'superadmin'];

function summary_button(): array
{
    return [[
        'type' => 'inline_keyboard',
        'payload' => ['buttons' => [[['type' => 'callback', 'text' => '📊 Сводка по точкам', 'payload' => 'summary']]]],
    ]];
}

function max_send_button(int $maxUserId, string $text): void
{
    max_call('POST', '/messages', ['user_id' => $maxUserId], [
        'text' => mb_substr($text, 0, 3900),
        'format' => 'html',
        'attachments' => summary_button(),
    ], 4);
}

function rub($v): string
{
    return number_format(round((float)$v), 0, '', ' ') . ' ₽';
}

function report_settings(PDO $db, int $uid): array
{
    $row = one_row($db, 'SELECT report_time, enabled FROM report_settings WHERE user_id = ?', [$uid]);
    return ['time' => $row ? (string)$row['report_time'] : '23:00', 'enabled' => $row ? flag($row['enabled']) : true];
}

function save_report_settings(PDO $db, int $uid, string $time, bool $enabled, int $tz): void
{
    upsert($db, 'report_settings', ['user_id'], [
        'user_id' => $uid,
        'report_time' => $time,
        'enabled' => $enabled ? 1 : 0,
        'tz_offset' => $tz,
        'updated_at' => now_utc(),
    ]);
    $local = local_time($tz);
    $day = gmdate('Y-m-d', $local);
    if (gmdate('H:i', $local) >= $time && !one_value($db, 'SELECT 1 FROM daily_reports WHERE user_id = ? AND day = ?', [$uid, $day])) {
        run($db, 'INSERT INTO daily_reports (user_id, day, sent_at) VALUES (?, ?, ?)', [$uid, $day, now_utc()]);
    }
}

function boss_tz(PDO $db, int $uid): int
{
    $own = one_value($db, 'SELECT tz_offset FROM report_settings WHERE user_id = ?', [$uid]);
    if ($own !== null) {
        return (int)$own;
    }
    $tz = one_value($db, 'SELECT tz_offset FROM staff_tasks WHERE created_by = ? ORDER BY id DESC LIMIT 1', [$uid]);
    return $tz === null ? REPORT_TZ : (int)$tz;
}

function local_time(int $tz): int
{
    return time() - $tz * 60;
}

function boss_points(PDO $db, int $uid, string $role): array
{
    if ($role === 'superadmin') {
        $rows = all_rows($db, "SELECT id FROM app_users WHERE active = 1 AND role = 'admin' ORDER BY id");
    } elseif ($role === 'manager') {
        $rows = all_rows($db, "SELECT id FROM app_users WHERE active = 1 AND role = 'admin' AND manager_id = ? ORDER BY id", [$uid]);
    } else {
        return [$uid];
    }
    return array_map(fn($r) => (int)$r['id'], $rows);
}

function build_report(PDO $db, int $uid, string $role, bool $final): string
{
    $tz = boss_tz($db, $uid);
    $local = local_time($tz);
    $day = gmdate('Y-m-d', $local);
    $hhmm = gmdate('H:i', $local);
    $startUtc = gmdate('Y-m-d H:i:s', strtotime($day . ' 00:00:00 UTC') + $tz * 60);
    $endUtc = gmdate('Y-m-d H:i:s', strtotime($day . ' 00:00:00 UTC') + $tz * 60 + 86400);
    $title = ($final ? '🌙 Итоги дня' : '📊 Сводка за день') . ' · ' . gmdate('d.m.Y', $local) . ($final ? '' : ' на ' . $hhmm);
    $points = boss_points($db, $uid, $role);
    if (!$points) {
        return "<b>{$title}</b>\n\nЗа вами пока не закреплено ни одной точки.";
    }
    $names = [];
    foreach (all_rows($db, "SELECT id, full_name, username FROM app_users WHERE id IN (" . in_list($points) . ')') as $r) {
        $names[(int)$r['id']] = (string)($r['full_name'] ?: $r['username']);
    }
    $owner = [];
    foreach ($points as $p) {
        $owner[$p] = $p;
    }
    foreach (all_rows($db, 'SELECT id, manager_id FROM app_users WHERE active = 1 AND manager_id IN (' . in_list($points) . ')') as $r) {
        $owner[(int)$r['id']] = (int)$r['manager_id'];
    }
    $st = [];
    $eq = [];
    foreach ($points as $p) {
        $st[$p] = ['done' => 0, 'late' => 0, 'wait' => 0, 'list' => []];
        $eq[$p] = ['done' => 0, 'spent' => 0.0, 'open' => 0];
    }
    $tasks = all_rows(
        $db,
        "SELECT t.id, t.title, t.kind, t.end_time, t.assignee_id, t.created_at, a.full_name, a.username FROM staff_tasks t "
        . 'JOIN app_users a ON a.id = t.assignee_id WHERE t.active = 1 AND a.active = 1 AND t.assignee_id IN (' . in_list(array_keys($owner)) . ') '
        . "AND (t.kind = 'daily' OR t.task_date = ?)",
        [$day]
    );
    $tasks = array_values(array_filter($tasks, fn($t) => !$t['created_at'] || $t['created_at'] <= $endUtc));
    if ($tasks) {
        $doneDay = [];
        $doneAny = [];
        foreach (all_rows($db, 'SELECT task_id, day FROM staff_task_done WHERE task_id IN (' . in_list(array_column($tasks, 'id')) . ')') as $m) {
            $doneDay[$m['task_id'] . '|' . $m['day']] = true;
            $doneAny[(int)$m['task_id']] = true;
        }
        foreach ($tasks as $t) {
            $p = $owner[(int)$t['assignee_id']] ?? null;
            if ($p === null || !isset($st[$p])) {
                continue;
            }
            $isDone = $t['kind'] === 'once' ? isset($doneAny[(int)$t['id']]) : isset($doneDay[$t['id'] . '|' . $day]);
            if ($isDone) {
                $st[$p]['done']++;
            } elseif ($final || ($t['end_time'] && $t['end_time'] <= $hhmm)) {
                $st[$p]['late']++;
                $st[$p]['list'][] = ($t['full_name'] ?: $t['username']) . ': ' . $t['title'];
            } else {
                $st[$p]['wait']++;
            }
        }
    }
    foreach (all_rows(
        $db,
        "SELECT user_id, COUNT(*) AS c, COALESCE(SUM(cost), 0) AS s FROM equipment_tasks WHERE status = 'done' AND user_id IN (" . in_list($points) . ') AND done_at >= ? AND done_at < ? GROUP BY user_id',
        [$startUtc, $endUtc]
    ) as $r) {
        $eq[(int)$r['user_id']]['done'] = (int)$r['c'];
        $eq[(int)$r['user_id']]['spent'] = (float)$r['s'];
    }
    foreach (all_rows($db, "SELECT user_id, COUNT(*) AS c FROM equipment_tasks WHERE status = 'open' AND user_id IN (" . in_list($points) . ') GROUP BY user_id') as $r) {
        $eq[(int)$r['user_id']]['open'] = (int)$r['c'];
    }
    $transfers = (int)one_value(
        $db,
        "SELECT COUNT(*) FROM equipment_transfers WHERE status = 'pending' AND (to_user IN (" . in_list($points) . ') OR from_user IN (' . in_list($points) . '))'
    );
    $tot = ['done' => 0, 'late' => 0, 'wait' => 0, 'eq' => 0, 'spent' => 0.0, 'open' => 0];
    $blocks = [];
    $order = $points;
    usort($order, fn($a, $b) => strcasecmp($names[$a] ?? '', $names[$b] ?? ''));
    foreach ($order as $p) {
        $s = $st[$p];
        $e = $eq[$p];
        $tot['done'] += $s['done'];
        $tot['late'] += $s['late'];
        $tot['wait'] += $s['wait'];
        $tot['eq'] += $e['done'];
        $tot['spent'] += $e['spent'];
        $tot['open'] += $e['open'];
        if (!($s['done'] || $s['late'] || $s['wait'] || $e['done'] || $e['open'])) {
            continue;
        }
        $lines = ['📍 <b>' . tg_esc($names[$p] ?? '') . '</b>'];
        if ($s['done'] || $s['late'] || $s['wait']) {
            $lines[] = "   Задания: ✅ {$s['done']} · ⏰ {$s['late']}" . ($s['wait'] ? " · ⏳ {$s['wait']}" : '');
            foreach (array_slice($s['list'], 0, 3) as $item) {
                $lines[] = '   — ' . tg_esc(mb_substr($item, 0, 120));
            }
            if (count($s['list']) > 3) {
                $lines[] = '   — и ещё ' . (count($s['list']) - 3);
            }
        }
        if ($e['done'] || $e['open']) {
            $lines[] = "   Техники: выполнено {$e['done']} · " . rub($e['spent']) . " · открыто {$e['open']}";
        }
        $blocks[] = implode("\n", $lines);
    }
    $head = "<b>{$title}</b>\nТочек: " . count($points) . "\n\n"
        . "👥 Задания сотрудникам: выполнено <b>{$tot['done']}</b>, просрочено <b>{$tot['late']}</b>" . ($tot['wait'] ? ", в работе {$tot['wait']}" : '') . "\n"
        . "🛠 Техники: выполнено {$tot['eq']}, потрачено " . rub($tot['spent']) . ", открытых заявок {$tot['open']}\n"
        . ($transfers ? "📦 Передач ждут подтверждения: {$transfers}\n" : '');
    return mb_substr($head . "\n" . ($blocks ? implode("\n\n", $blocks) : 'Сегодня по точкам не было заданий и заявок.'), 0, 3900);
}

function linked_bosses(PDO $db): array
{
    return all_rows(
        $db,
        'SELECT u.id, u.role, m.max_user_id, t.chat_id FROM app_users u '
        . 'LEFT JOIN max_links m ON m.user_id = u.id LEFT JOIN telegram_links t ON t.user_id = u.id '
        . "WHERE u.active = 1 AND u.role IN ('admin', 'manager', 'superadmin') AND (m.user_id IS NOT NULL OR t.user_id IS NOT NULL)"
    );
}

function send_daily_reports(PDO $db, int $limit = 8): int
{
    if (max_token() === '' && bot_token() === '') {
        return 0;
    }
    $sent = 0;
    foreach (linked_bosses($db) as $b) {
        if ($sent >= $limit) {
            break;
        }
        $uid = (int)$b['id'];
        $cfg = report_settings($db, $uid);
        if (!$cfg['enabled']) {
            continue;
        }
        $local = local_time(boss_tz($db, $uid));
        if (gmdate('H:i', $local) < $cfg['time']) {
            continue;
        }
        $day = gmdate('Y-m-d', $local);
        if (one_value($db, 'SELECT 1 FROM daily_reports WHERE user_id = ? AND day = ?', [$uid, $day])) {
            continue;
        }
        try {
            run($db, 'INSERT INTO daily_reports (user_id, day, sent_at) VALUES (?, ?, ?)', [$uid, $day, now_utc()]);
        } catch (Throwable $e) {
            continue;
        }
        try {
            $text = build_report($db, $uid, (string)$b['role'], $cfg['time'] >= '22:00');
        } catch (Throwable $e) {
            error_log('[asap] report failed: ' . $e->getMessage());
            continue;
        }
        if ($b['max_user_id'] && max_token() !== '') {
            max_send_button((int)$b['max_user_id'], $text);
        }
        if ($b['chat_id'] && bot_token() !== '') {
            tg_call('sendMessage', ['chat_id' => (string)$b['chat_id'], 'text' => $text, 'parse_mode' => 'HTML', 'disable_web_page_preview' => true], 3);
        }
        $sent++;
    }
    return $sent;
}

function maybe_daily_reports(PDO $db): void
{
    $marker = sys_get_temp_dir() . '/asap_daily_' . md5(__DIR__);
    if (is_file($marker) && time() - (int)@filemtime($marker) < 120) {
        return;
    }
    @touch($marker);
    try {
        send_daily_reports($db, 4);
    } catch (Throwable $e) {
        error_log('[asap] daily reports failed: ' . $e->getMessage());
    }
}
