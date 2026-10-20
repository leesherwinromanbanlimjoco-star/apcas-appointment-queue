<?php
// Admin only.
//   GET  ?history=1&from=&to=&category=&q=&limit= -> { entries } from the history log
//   POST { action, ... } -> { ok, state, version } for accounts, rooms and room assignments
require __DIR__ . '/db.php';
require __DIR__ . '/state_lib.php';

$user = require_user(['admin']);
$pdo = db();

function finish(array $user, array $extra = []): void {
    $state = build_state($user);
    respond(200, ['ok' => true, 'state' => $state, 'version' => md5(json_encode($state))] + $extra);
}

/* ------------------------------------------------------------- history */

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $where = [];
    $args = [];
    $get = array_map('text', $_GET);
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $get['from'] ?? '')) { $where[] = 'created_at >= ?'; $args[] = $get['from'] . ' 00:00:00'; }
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $get['to'] ?? '')) { $where[] = 'created_at <= ?'; $args[] = $get['to'] . ' 23:59:59'; }
    if (($get['category'] ?? '') !== '') { $where[] = 'category = ?'; $args[] = $get['category']; }
    if (($get['providerId'] ?? '') !== '') { $where[] = 'provider_id = ?'; $args[] = $get['providerId']; }
    if (($get['studentId'] ?? '') !== '') { $where[] = 'student_id = ?'; $args[] = $get['studentId']; }
    if (trim($get['q'] ?? '') !== '') {
        $where[] = '(summary LIKE ? OR actor_name LIKE ?)';
        $like = '%' . str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], trim($get['q'])) . '%';
        array_push($args, $like, $like);
    }
    $limit = max(1, min(2000, (int) ($get['limit'] ?? 500)));
    $stmt = $pdo->prepare('SELECT * FROM activity_log' . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . " ORDER BY id DESC LIMIT $limit");
    $stmt->execute($args);
    respond(200, ['entries' => array_map('activity_row', $stmt->fetchAll())]);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use GET or POST.', 405);
$in = input();

const USERNAME_PATTERN = '/^[a-z0-9._-]{3,30}$/';
const NAME_PATTERN = "/^\p{L}[\p{L} .,'-]{1,59}$/u";

function check_password(string $password): void {
    if (strlen($password) < 8 || !preg_match('/[A-Za-z]/', $password) || !preg_match('/\d/', $password)) {
        fail('The password needs at least 8 characters, with letters and numbers.');
    }
}

function check_username(string $username, int $exceptId = 0): string {
    $username = strtolower(trim($username));
    if (!preg_match(USERNAME_PATTERN, $username)) fail('Usernames are 3 to 30 characters: lowercase letters, numbers, dots, dashes or underscores.');
    $stmt = db()->prepare('SELECT COUNT(*) FROM users WHERE username = ? AND id <> ?');
    $stmt->execute([$username, $exceptId]);
    if ($stmt->fetchColumn()) fail("The username \"$username\" is already taken.");
    return $username;
}

function find_user(int $id): array {
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) fail('That account no longer exists.', 404);
    return $row;
}

function account_label(array $u): string {
    if ($u['role'] === 'student') {
        $stmt = db()->prepare('SELECT name FROM students WHERE student_id = ?');
        $stmt->execute([$u['student_id']]);
        return ($stmt->fetchColumn() ?: $u['username']) . " ({$u['student_id']})";
    }
    if ($u['role'] === 'teacher') return find_provider($u['provider_id'])['name'];
    return $u['display_name'] ?: $u['username'];
}

// "College of ... (CICT)" -> "CICT"; anything without a code -> "LANG", like the app.
// Teacher ids are letters, a dash and 3 digits in at most 10 characters, so the code is letters only, up to 6.
function college_code(string $college): string {
    $code = preg_match('/\(([^)]+)\)/', $college, $m) ? substr(preg_replace('/[^A-Z]/', '', strtoupper($m[1])), 0, 6) : '';
    return $code !== '' ? $code : 'LANG';
}

// A room that exists and is in use, or a refusal. null (no room) passes.
function usable_room(?int $roomId): void {
    if (!$roomId) return;
    $stmt = db()->prepare('SELECT is_active FROM rooms WHERE id = ?');
    $stmt->execute([$roomId]);
    $active = $stmt->fetchColumn();
    if ($active === false) fail('That room no longer exists. Choose another room.', 404);
    if (!$active) fail('That room is switched off. Choose another room, or switch it back on in Rooms.', 409);
}

// Another teacher's open appointment in this room at an overlapping time, or null.
function room_clash(int $roomId, string $providerId, string $date, int $start, int $end): ?array {
    $stmt = db()->prepare("SELECT a.*, p.name AS teacher FROM appointments a JOIN providers p ON p.id = a.provider_id
        WHERE a.room_id = ? AND a.date = ? AND a.provider_id <> ? AND a.status IN ('booked', 'confirmed', 'checked_in')
          AND a.start_min < ? AND ? < a.end_min LIMIT 1");
    $stmt->execute([$roomId, $date, $providerId, $end, $start]);
    return $stmt->fetch() ?: null;
}

function student_fields($s): array {
    $s = is_array($s) ? $s : [];
    $name = trim(preg_replace('/\s+/', ' ', text($s['name'] ?? '')));
    $course = trim(preg_replace('/\s+/', ' ', text($s['course'] ?? '')));
    $year = (int) text($s['year'] ?? 0);
    if (!preg_match(NAME_PATTERN, $name)) fail("Enter the student's full name (letters, spaces, periods, hyphens), 2 to 60 characters.");
    if (!preg_match('/^\p{L}[\p{L}\d .&()-]{1,29}$/u', $course)) fail('Enter the course, like BSIT.');
    if ($year < 1 || $year > 5) fail('Choose the year level.');
    return [$name, $course, $year];
}

function room_label(?int $roomId): string {
    if (!$roomId) return 'no room';
    $stmt = db()->prepare('SELECT name, building FROM rooms WHERE id = ?');
    $stmt->execute([$roomId]);
    $r = $stmt->fetch();
    return $r ? trim($r['name'] . ($r['building'] ? ", {$r['building']}" : '')) : 'no room';
}

switch ($in['action'] ?? '') {

/* ------------------------------------------------------------ accounts */
case 'create_account': {
    $role = text($in['role'] ?? '');
    if (!in_array($role, ['student', 'teacher', 'admin'], true)) fail('Choose student, teacher or admin.');
    $username = check_username(text($in['username'] ?? ''));
    $password = text($in['password'] ?? '');
    check_password($password);
    $hash = password_hash($password, PASSWORD_DEFAULT);

    $pdo->beginTransaction();
    if ($role === 'student') {
        $s = is_array($in['student'] ?? null) ? $in['student'] : [];
        $sid = trim(text($s['studentId'] ?? ''));
        if (!preg_match('/^\d{4}-\d{5}$/', $sid)) fail('Use the student ID format on the school ID, like 2024-00123.');
        [$name, $course, $year] = student_fields($s);
        $stmt = $pdo->prepare('SELECT u.username FROM users u WHERE u.student_id = ?');
        $stmt->execute([$sid]);
        if ($taken = $stmt->fetchColumn()) fail("Student $sid already has an account ($taken).");
        // A student a teacher already scheduled has a record; the account takes it over with the admin's details.
        $pdo->prepare('INSERT INTO students (student_id, name, course, year_level) VALUES (?, ?, ?, ?)
                       ON DUPLICATE KEY UPDATE name = VALUES(name), course = VALUES(course), year_level = VALUES(year_level)')
            ->execute([$sid, $name, $course, $year]);
        $pdo->prepare("INSERT INTO users (username, password_hash, role, student_id) VALUES (?, ?, 'student', ?)")->execute([$username, $hash, $sid]);
        $newId = (int) $pdo->lastInsertId();
        $label = "$name ($sid, $course " . $year . ')';
        $refs = ['student_id' => $sid];
    } elseif ($role === 'teacher') {
        $t = is_array($in['teacher'] ?? null) ? $in['teacher'] : [];
        $providerId = text($t['providerId'] ?? '');
        if ($providerId !== '') {
            $provider = find_provider($providerId);
            $stmt = $pdo->prepare('SELECT username FROM users WHERE provider_id = ?');
            $stmt->execute([$providerId]);
            if ($taken = $stmt->fetchColumn()) fail("{$provider['name']} already has an account ($taken).");
        } else {
            // A teacher who isn't on the list yet: add them, with the standard booking types and hours.
            $name = trim(preg_replace('/\s+/', ' ', text($t['name'] ?? '')));
            $college = trim(text($t['college'] ?? ''));
            if (!preg_match(NAME_PATTERN, $name)) fail("Enter the teacher's name as Surname, First name M.");
            if ($college === '' || mb_strlen($college) > 100) fail('Choose the college or department.');
            $roomId = (int) text($t['roomId'] ?? 0) ?: null;
            usable_room($roomId);
            $code = college_code($college);
            $stmt = $pdo->prepare('SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(id, \'-\', -1) AS UNSIGNED)), 0) FROM providers WHERE id LIKE ?');
            $stmt->execute(["$code-%"]);
            $next = (int) $stmt->fetchColumn() + 1;
            if ($next > 999) fail("The $code department already has 999 teachers, the most its ids allow.", 409);
            $providerId = sprintf('%s-%03d', $code, $next);
            $pdo->prepare('INSERT INTO providers (id, name, college, room_id) VALUES (?, ?, ?, ?)')
                ->execute([$providerId, $name, $college, $roomId]);
            $pdo->prepare("INSERT INTO provider_services (provider_id, service_id, position) VALUES (?, 'makeup', 0), (?, 'consult', 1), (?, 'quick', 2), (?, 'review', 3)")
                ->execute([$providerId, $providerId, $providerId, $providerId]);
            $provider = find_provider($providerId);
        }
        $pdo->prepare("INSERT INTO users (username, password_hash, role, provider_id) VALUES (?, ?, 'teacher', ?)")->execute([$username, $hash, $providerId]);
        $newId = (int) $pdo->lastInsertId();
        $label = "{$provider['name']} ($providerId)";
        $refs = ['provider_id' => $providerId];
    } else {
        $name = trim(text($in['name'] ?? '')) ?: 'Administrator';
        $pdo->prepare("INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, 'admin', ?)")->execute([$username, $hash, mb_substr($name, 0, 60)]);
        $newId = (int) $pdo->lastInsertId();
        $label = $name;
        $refs = [];
    }
    log_event($user, 'account', 'created', "{$user['name']} registered a $role account \"$username\" for $label.", $refs);
    $pdo->commit();
    finish($user, ['createdUserId' => $newId]);
}

case 'update_account': {
    $account = find_user((int) ($in['id'] ?? 0));
    $changes = [];
    $pdo->beginTransaction();
    if (isset($in['username']) && strtolower(trim(text($in['username']))) !== $account['username']) {
        $username = check_username(text($in['username']), (int) $account['id']);
        $pdo->prepare('UPDATE users SET username = ? WHERE id = ?')->execute([$username, $account['id']]);
        $changes[] = "username {$account['username']} → $username";
    }
    if (isset($in['active']) && (bool) $in['active'] !== (bool) $account['is_active']) {
        if ((int) $account['id'] === $user['userId']) fail("You can't switch off your own account.");
        $pdo->prepare('UPDATE users SET is_active = ? WHERE id = ?')->execute([$in['active'] ? 1 : 0, $account['id']]);
        $changes[] = $in['active'] ? 'switched on' : 'switched off';
    }
    if ($account['role'] === 'student' && isset($in['student'])) {
        [$name, $course, $year] = student_fields($in['student']);
        $pdo->prepare('UPDATE students SET name = ?, course = ?, year_level = ? WHERE student_id = ?')->execute([$name, $course, $year, $account['student_id']]);
        $changes[] = "details set to $name, $course, year $year";
    }
    if ($account['role'] === 'teacher' && is_array($in['teacher'] ?? null)) {
        $name = trim(preg_replace('/\s+/', ' ', text($in['teacher']['name'] ?? '')));
        $college = trim(text($in['teacher']['college'] ?? ''));
        if (!preg_match(NAME_PATTERN, $name)) fail("Enter the teacher's name as Surname, First name M.");
        if ($college === '' || mb_strlen($college) > 100) fail('Choose the college or department.');
        $pdo->prepare('UPDATE providers SET name = ?, college = ? WHERE id = ?')->execute([$name, $college, $account['provider_id']]);
        $changes[] = "details set to $name, $college";
    }
    if ($account['role'] === 'admin' && isset($in['name'])) {
        $pdo->prepare('UPDATE users SET display_name = ? WHERE id = ?')->execute([mb_substr(trim(text($in['name'])), 0, 60) ?: null, $account['id']]);
        $changes[] = 'name changed';
    }
    if ($changes) {
        log_event($user, 'account', 'updated', "{$user['name']} updated the {$account['role']} account for " . account_label($account) . ': ' . implode('; ', $changes) . '.',
            array_filter(['student_id' => $account['student_id'], 'provider_id' => $account['provider_id']]));
    }
    $pdo->commit();
    finish($user);
}

case 'reset_password': {
    $account = find_user((int) ($in['id'] ?? 0));
    $password = text($in['password'] ?? '');
    check_password($password);
    $pdo->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($password, PASSWORD_DEFAULT), $account['id']]);
    log_event($user, 'account', 'password_reset', "{$user['name']} reset the password for " . account_label($account) . '.',
        array_filter(['student_id' => $account['student_id'], 'provider_id' => $account['provider_id']]));
    finish($user);
}

/* --------------------------------------------------------------- rooms */
case 'save_room': {
    $r = is_array($in['room'] ?? null) ? $in['room'] : [];
    $name = trim(preg_replace('/\s+/', ' ', text($r['name'] ?? '')));
    $building = mb_substr(trim(preg_replace('/\s+/', ' ', text($r['building'] ?? ''))), 0, 60);
    // Seats and floor are optional.
    $capacity = trim(text($r['capacity'] ?? '')) === '' ? null : (int) text($r['capacity']);
    $floor = trim(text($r['floor'] ?? '')) === '' ? null : (int) text($r['floor']);
    $notes = mb_substr(trim(text($r['notes'] ?? '')), 0, 140);
    $active = !isset($r['active']) || $r['active'] ? 1 : 0;
    if ($name === '' || mb_strlen($name) > 40) fail('Give the room a name, up to 40 characters.');
    if ($capacity !== null && ($capacity < 1 || $capacity > 500)) fail('Seats must be between 1 and 500.');
    if ($floor !== null && ($floor < 1 || $floor > 20)) fail('The floor must be between 1 and 20.');
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM rooms WHERE name = ? AND id <> ?');
    $stmt->execute([$name, (int) ($r['id'] ?? 0)]);
    if ($stmt->fetchColumn()) fail("There is already a room called $name. Use a different name.", 409);
    if (!empty($r['id'])) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM rooms WHERE id = ?');
        $stmt->execute([(int) $r['id']]);
        if (!$stmt->fetchColumn()) fail('That room no longer exists.', 404);
        $pdo->prepare('UPDATE rooms SET name = ?, building = ?, floor = ?, capacity = ?, notes = ?, is_active = ? WHERE id = ?')
            ->execute([$name, $building, $floor, $capacity, $notes, $active, (int) $r['id']]);
        $id = (int) $r['id'];
        log_event($user, 'room', 'updated', "{$user['name']} updated room $name" . ($active ? '' : ' (not in use)') . '.', ['room_id' => $id]);
    } else {
        $pdo->prepare('INSERT INTO rooms (name, building, floor, capacity, notes, is_active) VALUES (?, ?, ?, ?, ?, ?)')->execute([$name, $building, $floor, $capacity, $notes, $active]);
        $id = (int) $pdo->lastInsertId();
        log_event($user, 'room', 'created', "{$user['name']} added room $name" . ($building ? ", $building" : '') . "" . ($capacity ? " (seats $capacity)" : '') . '.', ['room_id' => $id]);
    }
    finish($user, ['roomId' => $id]);
}

case 'delete_room': {
    $id = (int) ($in['id'] ?? 0);
    $label = room_label($id);
    // Upcoming appointments would silently lose their room, so they have to move first.
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE room_id = ? AND date >= ? AND status IN ('booked', 'confirmed', 'checked_in')");
    $stmt->execute([$id, today()]);
    if ($count = (int) $stmt->fetchColumn()) {
        fail("$label has $count upcoming appointment" . ($count > 1 ? 's' : '') . '. Move ' . ($count > 1 ? 'them' : 'it') . ' to another room first, or switch the room off instead of deleting it.', 409);
    }
    // Teachers and past appointments in it lose the room (foreign keys set it to NULL); the history keeps the name.
    $pdo->prepare('DELETE FROM rooms WHERE id = ?')->execute([$id]);
    log_event($user, 'room', 'deleted', "{$user['name']} deleted room $label.", ['room_id' => $id]);
    finish($user);
}

// A teacher's usual room. With `applyToUpcoming`, their open appointments from today on move there too.
case 'set_teacher_room': {
    booking_lock();
    $provider = find_provider(text($in['providerId'] ?? ''));
    $roomId = (int) text($in['roomId'] ?? 0) ?: null;
    usable_room($roomId);
    if ($roomId && !empty($in['applyToUpcoming'])) {
        // Moving everything there must not put two teachers in the room at once.
        $stmt = $pdo->prepare("SELECT * FROM appointments WHERE provider_id = ? AND date >= ? AND status IN ('booked', 'confirmed')");
        $stmt->execute([$provider['id'], today()]);
        foreach ($stmt->fetchAll() as $a) {
            if ($clash = room_clash($roomId, $provider['id'], $a['date'], (int) $a['start_min'], (int) $a['end_min'])) {
                fail(room_label($roomId) . " is used by {$clash['teacher']} on " . fmt_date($a['date']) . ', ' . fmt_time((int) $clash['start_min']) . ' – ' . fmt_time((int) $clash['end_min'])
                    . ", when {$provider['name']} has an appointment. Set the room without moving upcoming appointments, or move that one first.", 409);
            }
        }
    }
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE providers SET room_id = ? WHERE id = ?')->execute([$roomId, $provider['id']]);
    $moved = 0;
    if (!empty($in['applyToUpcoming'])) {
        $stmt = $pdo->prepare("UPDATE appointments SET room_id = ? WHERE provider_id = ? AND date >= ? AND status IN ('booked', 'confirmed')");
        $stmt->execute([$roomId, $provider['id'], today()]);
        $moved = $stmt->rowCount();
    }
    log_event($user, 'room', 'teacher_room', "{$user['name']} set {$provider['name']}'s room to " . room_label($roomId) . ($moved ? " and moved $moved upcoming appointment" . ($moved > 1 ? 's' : '') . ' there' : '') . '.',
        ['provider_id' => $provider['id'], 'room_id' => $roomId]);
    $pdo->commit();
    finish($user, ['moved' => $moved]);
}

// Where one appointment or make-up class is held. A class booked together moves together.
// Refuses a room another teacher is using at an overlapping time.
case 'set_appointment_room': {
    booking_lock();
    $a = find_appointment((int) ($in['appointmentId'] ?? 0));
    $roomId = (int) text($in['roomId'] ?? 0) ?: null;
    usable_room($roomId);
    if ($roomId) {
        if ($clash = room_clash($roomId, $a['provider_id'], $a['date'], (int) $a['start_min'], (int) $a['end_min'])) {
            fail(room_label($roomId) . " is already in use by {$clash['teacher']} from " . fmt_time((int) $clash['start_min']) . ' to ' . fmt_time((int) $clash['end_min']) . ' that day. Choose another room.', 409);
        }
    }
    if ($a['group_id']) {
        $pdo->prepare('UPDATE appointments SET room_id = ? WHERE group_id = ?')->execute([$roomId, $a['group_id']]);
    } else {
        $pdo->prepare('UPDATE appointments SET room_id = ? WHERE id = ?')->execute([$roomId, $a['id']]);
    }
    $who = $a['group_label'] ? "the {$a['group_label']} class" : $a['student_name'];
    log_event($user, $a['service_id'] === 'makeup' ? 'makeup' : 'room', 'room_assigned', sprintf(
        "%s assigned %s to %s's %s on %s, %s.", $user['name'], room_label($roomId), $who, strtolower(service_name($a['service_id'])), fmt_date($a['date']), fmt_time((int) $a['start_min'])
    ), ['appointment_id' => $a['id'], 'provider_id' => $a['provider_id'], 'student_id' => $a['group_id'] ? null : $a['student_id'], 'room_id' => $roomId]);
    finish($user);
}

default:
    fail('Unknown action.');
}
