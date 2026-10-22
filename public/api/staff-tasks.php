<?php
declare(strict_types=1);

require __DIR__ . '/lib.php';
require __DIR__ . '/schema.php';
require __DIR__ . '/notify.php';
require __DIR__ . '/report.php';

$db = boot();
upgrade_schema($db);

const BOSS_ROLES = ['admin', 'manager', 'superadmin'];
const ASSIGNABLE_ROLES = ['user', 'admin', 'manager'];
const TASK_TUNES = ['march', 'chime', 'waltz', 'beep', 'siren', 'funeral', 'dark'];

function task_members(PDO $db, string $token, array $me): ?array
{
    $sid = active_structure($db, $token, $me);
    if (!$sid) {
        return $me['role'] === 'superadmin' ? null : [(int)$me['id']];
    }
    $ids = array_map('intval', array_column(all_rows($db, 'SELECT user_id AS uid FROM structure_members WHERE structure_id = ?', [$sid]), 'uid'));
    $ids[] = (int)$me['id'];
    return $ids;
}

function task_managed_ids(PDO $db, array $me, ?array $members): array
{
    $role = $me['role'];
    $uid = (int)$me['id'];
    if ($role === 'superadmin') {
        $ids = array_map('intval', array_column(all_rows($db, 'SELECT id FROM app_users WHERE active = 1'), 'id'));
    } elseif ($role === 'manager') {
        $ids = manager_branch_ids($db, $uid);
        $ids[] = $uid;
    } elseif ($role === 'admin') {
        $ids = array_map('intval', array_column(all_rows($db, 'SELECT id FROM app_users WHERE active = 1 AND (manager_id = ? OR id = ?)', [$uid, $uid]), 'id'));
    } else {
        return [];
    }
    if ($members !== null) {
        $ids = array_values(array_filter($ids, fn($i) => in_array($i, $members, true)));
    }
    if (!$ids) {
        return [];
    }
    $roles = implode(', ', array_map(fn($r) => "'$r'", ASSIGNABLE_ROLES));
    return array_map('intval', array_column(all_rows($db, 'SELECT id FROM app_users WHERE id IN (' . in_list($ids) . ") AND role IN ($roles)"), 'id'));
}

function task_rows(PDO $db, string $where, array $params, string $day): array
{
    $rows = all_rows(
        $db,
        "SELECT t.id, t.title, t.note, t.kind, t.start_time, t.end_time, t.task_date, t.interval_min, t.tune, t.assignee_id, "
        . "a.full_name AS a_full, a.username AS a_user, c.full_name AS c_full, c.username AS c_user "
        . 'FROM staff_tasks t LEFT JOIN app_users a ON a.id = t.assignee_id LEFT JOIN app_users c ON c.id = t.created_by '
        . "WHERE t.active = 1 AND $where ORDER BY t.start_time, t.id",
        $params
    );
    $ids = array_map(fn($r) => (int)$r['id'], $rows);
    $done = [];
    if ($ids) {
        $marks = all_rows(
            $db,
            'SELECT d.task_id, d.day, d.done_at, u.full_name, u.username FROM staff_task_done d '
            . 'LEFT JOIN app_users u ON u.id = d.done_by WHERE d.task_id IN (' . in_list($ids) . ') ORDER BY d.done_at'
        );
        foreach ($marks as $m) {
            $done[(int)$m['task_id']][$m['day']] = [
                'at' => iso($m['done_at'], true),
                'by' => (string)($m['full_name'] ?: $m['username']),
            ];
        }
    }
    $out = [];
    foreach ($rows as $r) {
        $tid = (int)$r['id'];
        $marks = $done[$tid] ?? [];
        $mark = $r['kind'] === 'once' ? (reset($marks) ?: null) : ($marks[$day] ?? null);
        $out[] = [
            'id' => $tid,
            'title' => (string)$r['title'],
            'note' => (string)($r['note'] ?? ''),
            'kind' => $r['kind'],
            'startTime' => $r['start_time'],
            'endTime' => $r['end_time'] ?: null,
            'date' => $r['task_date'],
            'intervalMin' => (int)$r['interval_min'],
            'tune' => $r['tune'],
            'assigneeId' => (int)$r['assignee_id'],
            'assigneeName' => (string)($r['a_full'] ?: $r['a_user']),
            'createdByName' => (string)($r['c_full'] ?: $r['c_user']),
            'doneAt' => $mark['at'] ?? null,
            'doneBy' => $mark['by'] ?? '',
        ];
    }
    return $out;
}

function my_tasks(PDO $db, array $me, string $day): array
{
    $list = task_rows($db, "t.assignee_id = ? AND (t.kind = 'daily' OR t.task_date <= ?)", [(int)$me['id'], $day], $day);
    return array_values(array_filter($list, fn($t) => $t['kind'] === 'daily' || !$t['doneAt'] || $t['date'] === $day));
}

function task_bosses(PDO $db, int $assignee, int $creator): array
{
    $ids = [$creator];
    $row = one_row($db, 'SELECT role, manager_id FROM app_users WHERE id = ?', [$assignee]);
    if ($row && $row['manager_id']) {
        $ids[] = (int)$row['manager_id'];
        if ($row['role'] === 'user') {
            $head = one_value($db, "SELECT manager_id FROM app_users WHERE id = ? AND role = 'admin'", [(int)$row['manager_id']]);
            if ($head) {
                $ids[] = (int)$head;
            }
        }
    }
    return array_values(array_diff(array_unique($ids), [$assignee]));
}

function check_overdue(PDO $db, int $limit = 15): void
{
    if (bot_token() === '' && max_token() === '') {
        return;
    }
    $rows = all_rows(
        $db,
        'SELECT t.id, t.title, t.note, t.kind, t.end_time, t.task_date, t.tz_offset, t.assignee_id, t.created_by, t.created_at, '
        . 'a.full_name, a.username FROM staff_tasks t JOIN app_users a ON a.id = t.assignee_id '
        . "WHERE t.active = 1 AND a.active = 1 AND (t.end_time IS NOT NULL OR t.kind = 'once')"
    );
    $sent = 0;
    foreach ($rows as $r) {
        if ($sent >= $limit) {
            break;
        }
        $tz = (int)$r['tz_offset'];
        $local = gmdate('Y-m-d H:i', time() - $tz * 60);
        [$today, $hhmm] = explode(' ', $local);
        $end = $r['end_time'] ? (string)$r['end_time'] : null;
        if ($r['kind'] === 'once') {
            $day = (string)$r['task_date'];
            if ($day === '' || $day > $today || ($day === $today && (!$end || $hhmm < $end))) {
                continue;
            }
        } else {
            if (!$end || $hhmm < $end) {
                continue;
            }
            $day = $today;
        }
        $deadlineUtc = gmdate('Y-m-d H:i:s', strtotime($day . ' ' . ($end ?: '23:59') . ':00 UTC') + $tz * 60);
        if ($r['created_at'] && (string)$r['created_at'] > $deadlineUtc) {
            continue;
        }
        $tid = (int)$r['id'];
        $doneSql = $r['kind'] === 'once' ? 'SELECT 1 FROM staff_task_done WHERE task_id = ?' : 'SELECT 1 FROM staff_task_done WHERE task_id = ? AND day = ?';
        if (one_value($db, $doneSql, $r['kind'] === 'once' ? [$tid] : [$tid, $day])) {
            continue;
        }
        if (one_value($db, 'SELECT 1 FROM staff_task_alerts WHERE task_id = ? AND day = ?', [$tid, $day])) {
            continue;
        }
        try {
            run($db, 'INSERT INTO staff_task_alerts (task_id, day, sent_at) VALUES (?, ?, ?)', [$tid, $day, now_utc()]);
        } catch (Throwable $e) {
            continue;
        }
        $sent++;
        [$y, $m, $d] = explode('-', $day);
        $when = $end ? "до $end" : 'в свой день';
        $note = trim((string)($r['note'] ?? ''));
        $text = "⏰ <b>Задание не выполнено в срок</b>\n"
            . '👤 Сотрудник: ' . tg_esc($r['full_name'] ?: $r['username']) . "\n"
            . '📋 ' . tg_esc($r['title']) . "\n"
            . ($note !== '' ? '📝 ' . tg_esc(mb_substr($note, 0, 500)) . "\n" : '')
            . "🕒 Нужно было $when · $d.$m.$y";
        send_to_users($db, task_bosses($db, (int)$r['assignee_id'], (int)$r['created_by']), $text);
    }
}

function clean_task(array $b): ?array
{
    $title = mb_substr(trim((string)($b['title'] ?? '')), 0, 200);
    $note = mb_substr(trim((string)($b['note'] ?? '')), 0, 1000);
    $kind = ($b['kind'] ?? '') === 'once' ? 'once' : 'daily';
    $start = (string)($b['startTime'] ?? '');
    $date = (string)($b['date'] ?? '');
    $tune = (string)($b['tune'] ?? 'beep');
    $interval = (int)($b['intervalMin'] ?? 5);
    $tz = isset($b['tzOffset']) && is_numeric($b['tzOffset']) ? max(-840, min(840, (int)$b['tzOffset'])) : -180;
    $end = (string)($b['endTime'] ?? '');
    if ($title === '' || !preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $start)) {
        return null;
    }
    if ($end !== '' && (!preg_match('/^([01]\d|2[0-3]):[0-5]\d$/', $end) || $end <= $start)) {
        return null;
    }
    if ($kind === 'once' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        return null;
    }
    return [
        'title' => $title,
        'note' => $note,
        'kind' => $kind,
        'start_time' => $start,
        'tz_offset' => $tz,
        'end_time' => $end !== '' ? $end : null,
        'task_date' => $kind === 'once' ? $date : null,
        'interval_min' => max(1, min(120, $interval ?: 5)),
        'tune' => in_array($tune, TASK_TUNES, true) ? $tune : 'beep',
    ];
}

$token = header_value('X-Auth-Token');
$me = session_user($db, $token);
if (!$me) {
    out(['error' => 'unauthorized'], 401);
}

$b = method() === 'POST' ? body() : [];
$day = (string)($b['day'] ?? ($_GET['day'] ?? ''));
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $day)) {
    out(['error' => 'invalid_day'], 400);
}

$isBoss = in_array($me['role'], BOSS_ROLES, true);

$payload = function () use ($db, $me, $day, $isBoss, $token): array {
    $pref = (string)(one_value($db, 'SELECT tune FROM staff_tune_prefs WHERE user_id = ?', [(int)$me['id']]) ?? '');
    $data = ['mine' => my_tasks($db, $me, $day), 'canManage' => $isBoss, 'myTune' => in_array($pref, TASK_TUNES, true) ? $pref : ''];
    if ($isBoss) {
        $ids = task_managed_ids($db, $me, task_members($db, $token, $me));
        $data['manage'] = task_rows($db, '(t.assignee_id IN (' . in_list($ids) . ') OR t.created_by = ?)', [(int)$me['id']], $day);
        $rows = all_rows($db, 'SELECT id, full_name, username, role FROM app_users WHERE id IN (' . in_list($ids) . ') ORDER BY role DESC, username');
        $data['assignees'] = array_map(fn($r) => [
            'id' => (int)$r['id'],
            'name' => (string)($r['full_name'] ?: $r['username']),
            'role' => $r['role'],
        ], $rows);
    }
    return $data;
};

if (method() === 'GET') {
    try {
        check_overdue($db);
        maybe_daily_reports($db);
    } catch (Throwable $e) {
        error_log('[asap] check_overdue: ' . $e->getMessage());
    }
    out($payload());
}

$action = (string)($b['action'] ?? '');

if ($action === 'my_tune') {
    $tune = (string)($b['tune'] ?? '');
    if ($tune !== '' && !in_array($tune, TASK_TUNES, true)) {
        out(['error' => 'bad_tune'], 400);
    }
    upsert($db, 'staff_tune_prefs', ['user_id'], ['user_id' => (int)$me['id'], 'tune' => $tune, 'updated_at' => now_utc()]);
    out($payload());
}

if ($action === 'done') {
    $tid = (int)($b['taskId'] ?? 0);
    $row = one_row($db, 'SELECT kind FROM staff_tasks WHERE id = ? AND active = 1 AND assignee_id = ?', [$tid, (int)$me['id']]);
    if (!$row) {
        out(['error' => 'not_found'], 404);
    }
    if (!one_value($db, 'SELECT 1 FROM staff_task_done WHERE task_id = ? AND day = ?', [$tid, $day])) {
        run($db, 'INSERT INTO staff_task_done (task_id, day, done_at, done_by) VALUES (?, ?, ?, ?)', [$tid, $day, now_utc(), (int)$me['id']]);
    }
    out($payload());
}

if (!$isBoss) {
    out(['error' => 'forbidden'], 403);
}

$allowed = task_managed_ids($db, $me, task_members($db, $token, $me));

$canTouch = function (int $tid) use ($db, $allowed, $me): bool {
    $row = one_row($db, 'SELECT assignee_id, created_by FROM staff_tasks WHERE id = ? AND active = 1', [$tid]);
    return $row && (in_array((int)$row['assignee_id'], $allowed, true) || (int)$row['created_by'] === (int)$me['id']);
};

if ($action === 'create' || $action === 'update') {
    $task = clean_task($b);
    if (!$task) {
        out(['error' => 'invalid_input'], 400);
    }
    $rawIds = is_array($b['assigneeIds'] ?? null) ? $b['assigneeIds'] : [$b['assigneeId'] ?? 0];
    $assignees = [];
    foreach ($rawIds as $value) {
        $uid = (int)$value;
        if ($uid > 0 && !in_array($uid, $assignees, true)) {
            $assignees[] = $uid;
        }
    }
    if (!$assignees) {
        out(['error' => 'invalid_input'], 400);
    }
    foreach ($assignees as $uid) {
        if (!in_array($uid, $allowed, true)) {
            out(['error' => 'forbidden'], 403);
        }
    }
    $assignee = $assignees[0];
    if ($action === 'create') {
        foreach (array_slice($assignees, 0, 100) as $uid) {
            run(
                $db,
                'INSERT INTO staff_tasks (created_by, assignee_id, title, note, kind, start_time, end_time, task_date, interval_min, tune, tz_offset, active, created_at) '
                . 'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)',
                [(int)$me['id'], $uid, $task['title'], $task['note'], $task['kind'], $task['start_time'], $task['end_time'], $task['task_date'], $task['interval_min'], $task['tune'], $task['tz_offset'], now_utc()]
            );
        }
    } else {
        $tid = (int)($b['taskId'] ?? 0);
        if (!$canTouch($tid)) {
            out(['error' => 'not_found'], 404);
        }
        run(
            $db,
            'UPDATE staff_tasks SET assignee_id = ?, title = ?, note = ?, kind = ?, start_time = ?, end_time = ?, task_date = ?, interval_min = ?, tune = ?, tz_offset = ? WHERE id = ?',
            [$assignee, $task['title'], $task['note'], $task['kind'], $task['start_time'], $task['end_time'], $task['task_date'], $task['interval_min'], $task['tune'], $task['tz_offset'], $tid]
        );
    }
    out($payload());
}

if ($action === 'delete') {
    $tid = (int)($b['taskId'] ?? 0);
    if (!$canTouch($tid)) {
        out(['error' => 'not_found'], 404);
    }
    run($db, 'UPDATE staff_tasks SET active = 0 WHERE id = ?', [$tid]);
    out($payload());
}

out(['error' => 'unknown_action'], 400);
