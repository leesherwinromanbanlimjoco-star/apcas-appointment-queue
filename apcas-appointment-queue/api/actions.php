<?php
// POST { action, ... } -> { ok, created?, state, version }
// Every change students and teachers make goes through here, so it's checked once, saved,
// logged for the history, and everyone else's screen picks it up on their next poll.
require __DIR__ . '/db.php';
require __DIR__ . '/state_lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST.', 405);

$user = require_user();
$in = input();
$pdo = db();

const BLOCKING = ['booked', 'confirmed', 'checked_in', 'completed'];
const APPT_NEXT = [
    'booked' => ['confirmed', 'declined', 'cancelled'],
    'confirmed' => ['checked_in', 'cancelled', 'no_show'],
    'checked_in' => ['completed'],
    // A no-show who turns up later the same day can still be checked in, at the end of the line.
    'no_show' => ['checked_in'],
];
const APPT_DONE = [
    'confirmed' => 'approved', 'checked_in' => 'checked in', 'completed' => 'marked as completed',
    'declined' => 'declined', 'cancelled' => 'cancelled', 'no_show' => 'marked as a no-show',
];
const QUEUE_NEXT = ['waiting' => ['called', 'left'], 'called' => ['in_service', 'left'], 'in_service' => ['done']];
const LATE_AFTER_MIN = 10;

function finish(array $user, array $extra = []): void {
    $state = build_state($user);
    respond(200, ['ok' => true, 'state' => $state, 'version' => md5(json_encode($state))] + $extra);
}

function only(array $user, string ...$roles): void {
    if (!in_array($user['role'], $roles, true)) fail("You don't have access to that.", 403);
}

// Lets the API make status changes the triggers would otherwise refuse (Undo, closing a ticket with its appointment).
function force(callable $fn) {
    db()->exec('SET @apcas_undo = 1');
    try {
        return $fn();
    } finally {
        db()->exec('SET @apcas_undo = 0');
    }
}

// A real calendar date like 2026-10-21 (not Feb 31).
function valid_date(string $date): bool {
    return (bool) preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $date, $m) && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
}

function student_record(string $studentId): ?array {
    $stmt = db()->prepare('SELECT * FROM students WHERE student_id = ?');
    $stmt->execute([$studentId]);
    return $stmt->fetch() ?: null;
}

function next_ticket(string $providerId): string {
    $stmt = db()->prepare("SELECT COALESCE(MAX(CAST(SUBSTRING(ticket, 3) AS UNSIGNED)), 0) FROM queue_entries WHERE provider_id = ? AND queue_date = ?");
    $stmt->execute([$providerId, today()]);
    return sprintf('A-%03d', (int) $stmt->fetchColumn() + 1);
}

// Inserts a queue entry with the next free ticket. Two check-ins at the same moment can pick the
// same number; the unique key refuses the second, which then takes the number after.
function insert_ticket(string $providerId, string $name, ?int $appointmentId, bool $late): array {
    for ($try = 0; ; $try++) {
        $ticket = next_ticket($providerId);
        try {
            db()->prepare("INSERT INTO queue_entries (ticket, name, provider_id, appointment_id, queue_date, status, late) VALUES (?, ?, ?, ?, ?, 'waiting', ?)")
                ->execute([$ticket, $name, $providerId, $appointmentId, today(), $late ? 1 : 0]);
            return ['id' => (int) db()->lastInsertId(), 'ticket' => $ticket];
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) !== 1062 || $try >= 4 || !str_contains($e->getMessage(), 'queue_ticket_per_day')) throw $e;
        }
    }
}

// The same rule as the clash trigger, checked first so people get a message that says who is busy.
// Returns null when the time is free, or ['student' => bool, 'message' => ...]: 'student' is true when
// the student is the one already booked, false when it's the teacher. Students in the same class
// ($groupId) share the teacher's time.
function time_taken(string $providerId, string $studentId, string $date, int $start, int $end, ?string $groupId = null): ?array {
    $stmt = db()->prepare("SELECT a.*, p.name AS teacher FROM appointments a JOIN providers p ON p.id = a.provider_id
        WHERE a.date = ? AND a.status IN ('booked', 'confirmed', 'checked_in', 'completed') AND a.start_min < ? AND ? < a.end_min
          AND (a.student_id = ? OR (a.provider_id = ? AND NOT (? IS NOT NULL AND a.group_id <=> ?)))
        ORDER BY a.student_id = ? DESC LIMIT 1");
    $stmt->execute([$date, $end, $start, $studentId, $providerId, $groupId, $groupId, $studentId]);
    $a = $stmt->fetch();
    if (!$a) return null;
    $when = fmt_time((int) $a['start_min']) . ' – ' . fmt_time((int) $a['end_min']);
    if (strcasecmp($a['student_id'], $studentId) === 0) {
        return ['student' => true, 'message' => "{$a['student_name']} ($studentId) already has an appointment with {$a['teacher']} then ($when). Choose another time."];
    }
    return ['student' => false, 'message' => "You already have an appointment then ($when). Choose another time."];
}

function find_entry(array $user, int $id): array {
    $stmt = db()->prepare('SELECT * FROM queue_entries WHERE id = ?');
    $stmt->execute([$id]);
    $entry = $stmt->fetch();
    if (!$entry) fail('That ticket no longer exists.', 404);
    if ($user['role'] === 'teacher' && $entry['provider_id'] !== $user['providerId']) fail("That ticket isn't in your line.", 403);
    if ($user['role'] === 'student') fail("You don't have access to that.", 403);
    return $entry;
}

function entry_refs(array $entry): array {
    $refs = ['provider_id' => $entry['provider_id']];
    if ($entry['appointment_id']) {
        $a = find_appointment((int) $entry['appointment_id']);
        $refs += ['appointment_id' => $a['id'], 'student_id' => $a['student_id'], 'room_id' => $a['room_id']];
    }
    return $refs;
}

function appt_refs(array $a): array {
    return ['appointment_id' => $a['id'], 'provider_id' => $a['provider_id'], 'student_id' => $a['student_id'], 'room_id' => $a['room_id']];
}

// The room for a new appointment: it must exist, be in use, and not be taken by another teacher then.
function check_room(int $roomId, string $providerId, string $date, int $start, int $end): void {
    $stmt = db()->prepare('SELECT * FROM rooms WHERE id = ?');
    $stmt->execute([$roomId]);
    $room = $stmt->fetch();
    if (!$room || !$room['is_active']) fail('That room is not available. Choose another room.');
    $stmt = db()->prepare("SELECT a.start_min, a.end_min, p.name FROM appointments a JOIN providers p ON p.id = a.provider_id
        WHERE a.room_id = ? AND a.date = ? AND a.provider_id <> ? AND a.status IN ('booked', 'confirmed', 'checked_in')
          AND a.start_min < ? AND ? < a.end_min LIMIT 1");
    $stmt->execute([$roomId, $date, $providerId, $end, $start]);
    if ($clash = $stmt->fetch()) {
        fail("{$room['name']} is being used by {$clash['name']} from " . fmt_time((int) $clash['start_min']) . ' to ' . fmt_time((int) $clash['end_min']) . '. Choose another room.', 409);
    }
}

function has_started(array $a): bool {
    return $a['date'] < today() || ($a['date'] === today() && (int) $a['start_min'] <= now_minutes());
}

// Puts a checked-in student in their teacher's line. Arriving late, or after being marked a no-show,
// lands them at the end like everyone else who arrives now; `late` lets the teacher see why.
function enqueue_appointment(array $a, bool $late): array {
    $stmt = db()->prepare('SELECT * FROM queue_entries WHERE appointment_id = ?');
    $stmt->execute([$a['id']]);
    $existing = $stmt->fetch();
    if ($existing) {
        force(fn() => db()->prepare("UPDATE queue_entries SET status = 'waiting', queued_at = NOW(3), queue_date = ?, late = ? WHERE id = ?")
            ->execute([today(), $late ? 1 : 0, $existing['id']]));
        return ['id' => (int) $existing['id'], 'ticket' => $existing['ticket'], 'created' => false];
    }
    return insert_ticket($a['provider_id'], $a['student_name'], (int) $a['id'], $late) + ['created' => true];
}

switch ($in['action'] ?? '') {

/* ----------------------------------------------------- student: book */
case 'book': {
    only($user, 'student');
    $provider = find_provider(text($in['providerId'] ?? ''));
    $stmt = $pdo->prepare('SELECT s.* FROM services s JOIN provider_services ps ON ps.service_id = s.id WHERE ps.provider_id = ? AND s.id = ?');
    $stmt->execute([$provider['id'], text($in['serviceId'] ?? '')]);
    $service = $stmt->fetch();
    if (!$service) fail("This teacher doesn't offer that booking type any more. Choose another one.");

    $date = text($in['date'] ?? '');
    if (!valid_date($date)) fail('Choose a date.');
    if ($date > date('Y-m-d', strtotime('+30 days'))) fail('Appointments can be set up to 30 days ahead.');
    $start = (int) ($in['start'] ?? -1);
    $end = $start + (int) $service['duration'];
    if ($why = slot_problem($provider, $date, $start, $end)) fail($why, 409);

    $stmt = $pdo->prepare(
        "SELECT * FROM appointments WHERE student_id = ? AND status IN ('booked', 'confirmed', 'checked_in')"
    );
    $stmt->execute([$user['studentId']]);
    $open = array_filter($stmt->fetchAll(), fn($a) => !($a['status'] === 'booked' && has_started($a)));
    if (count($open) >= 5) fail('You already have 5 open appointments, the limit. Cancel one first.');
    foreach ($open as $a) {
        if ($a['status'] === 'booked' && $a['provider_id'] === $provider['id'] && $a['service_id'] === $service['id']) {
            fail('You already asked this teacher for "' . $service['name'] . '" on ' . fmt_date($a['date']) . '. Wait for an answer or cancel it first.');
        }
    }

    $note = mb_substr(trim(text($in['note'] ?? '')), 0, 300);
    if ($service['question'] !== '' && mb_strlen(preg_replace('/\s/u', '', $note)) < 15) {
        fail('Answer your teacher\'s question with a little more detail (at least 15 characters).');
    }
    if ($taken = time_taken($provider['id'], $user['studentId'], $date, $start, $end)) {
        fail($taken['student'] ? 'You already have another appointment at that time. Choose another time.' : 'That time was just taken by someone else. Choose another time.', 409);
    }

    $student = student_record($user['studentId']);
    if (!$student) fail('Your student record is missing. Ask the administrator to check your account.', 409);
    $saved = save_uploads($in['attachments'] ?? []);
    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO appointments (student_id, student_name, student_course, student_year, provider_id, service_id, room_id, date, start_min, end_min, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'booked\', ?)'
    )->execute([$student['student_id'], $student['name'], $student['course'], $student['year_level'], $provider['id'], $service['id'], $provider['room_id'], $date, $start, $end, $note]);
    $id = (int) $pdo->lastInsertId();
    attach_files($id, 'student', $saved);
    $a = find_appointment($id);
    log_event($user, appointment_category($a), 'requested', sprintf(
        '%s (%s) requested a %s with %s on %s, %s.',
        $student['name'], $student['student_id'], strtolower($service['name']), $provider['name'], fmt_date($date), fmt_time($start)
    ), appt_refs($a));
    $pdo->commit();
    keep_uploads();
    finish($user, ['created' => ['appointments' => [$id], 'queue' => []]]);
}

/* ------------------------------------------- teacher: schedule students */
case 'assign': {
    only($user, 'teacher');
    $provider = find_provider($user['providerId']);
    $students = array_values(array_filter(input_list($in['students'] ?? null), 'is_array'));
    if (!$students) fail('Choose at least one student.');
    if (count($students) > 200) fail('Schedule up to 200 students at a time.');
    $date = text($in['date'] ?? '');
    if (!valid_date($date)) fail('Choose a date.');
    if ($date > date('Y-m-d', strtotime('+30 days'))) fail('Appointments can be set up to 30 days ahead.');

    $pdo->beginTransaction();
    // A booking type typed in on the spot. Unless it's saved, it's only for this appointment.
    if (!empty($in['newService']) && is_array($in['newService'])) {
        $ns = $in['newService'];
        $name = trim(preg_replace('/\s+/', ' ', text($ns['name'] ?? '')));
        $duration = (int) ($ns['duration'] ?? 0);
        if (mb_strlen($name) < 3 || mb_strlen($name) > 60) fail('Use 3 to 60 characters for what the appointment is for.');
        if (!in_array($duration, [15, 30, 45, 60, 90, 120], true)) fail('Choose a length for the appointment.');
        $service = ['id' => 'sv-' . bin2hex(random_bytes(6)), 'name' => $name, 'duration' => $duration];
        $save = !empty($ns['save']);
        $pdo->prepare('INSERT INTO services (id, provider_id, name, duration, one_off) VALUES (?, ?, ?, ?, ?)')
            ->execute([$service['id'], $provider['id'], $name, $duration, $save ? 0 : 1]);
        if ($save) {
            $pdo->prepare('INSERT INTO provider_services (provider_id, service_id, position) SELECT ?, ?, COALESCE(MAX(position), -1) + 1 FROM provider_services WHERE provider_id = ?')
                ->execute([$provider['id'], $service['id'], $provider['id']]);
        }
    } else {
        $stmt = $pdo->prepare('SELECT * FROM services WHERE id = ? AND (provider_id IS NULL OR provider_id = ?)');
        $stmt->execute([text($in['serviceId'] ?? ''), $provider['id']]);
        $service = $stmt->fetch();
        if (!$service) fail('Choose what the appointment is for.');
    }

    $start = (int) ($in['start'] ?? -1);
    $end = $start + (int) $service['duration'];
    if ($why = slot_problem($provider, $date, $start, $end)) fail($why, 409);
    $roomId = (int) ($in['roomId'] ?? 0);
    if (!$roomId) fail('Choose the room where the appointment will be held.');
    check_room($roomId, $provider['id'], $date, $start, $end);

    $groupLabel = mb_substr(trim(text($in['groupLabel'] ?? '')), 0, 60);
    $groupId = count($students) > 1 || $groupLabel !== '' ? bin2hex(random_bytes(8)) : null;
    $teacherNote = mb_substr(trim(text($in['teacherNote'] ?? '')), 0, 300);
    $saved = save_uploads($in['attachments'] ?? []);
    $insert = $pdo->prepare(
        'INSERT INTO appointments (student_id, student_name, student_course, student_year, provider_id, service_id, room_id, date, start_min, end_min, status, note, teacher_note, assigned_by, group_id, group_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, \'confirmed\', \'\', ?, \'teacher\', ?, ?)'
    );
    $ids = [];
    $seen = [];
    foreach ($students as $s) {
        $sid = trim(text($s['studentId'] ?? ''));
        $name = trim(preg_replace('/\s+/', ' ', text($s['studentName'] ?? '')));
        $course = mb_substr(trim(text($s['studentCourse'] ?? '')), 0, 30) ?: null;
        $year = (int) text($s['studentYear'] ?? '');
        $year = $year >= 1 && $year <= 5 ? $year : null;
        if (!preg_match('/^\d{4}-\d{5}$/', $sid)) fail("\"$sid\" isn't a student ID like 2024-00123.");
        if (isset($seen[$sid])) fail("Student ID $sid is in the list twice. Remove one.");
        $seen[$sid] = true;
        $record = student_record($sid);
        if ($record && mb_strtolower($record['name']) !== mb_strtolower($name)) fail("Student ID $sid is on record as {$record['name']}. Check the ID, or use that name.");
        // A student the teacher types in who isn't registered yet gets a record, so the admin sees them too.
        if (!$record) {
            if (!preg_match("/^\p{L}[\p{L} .,'-]{1,59}$/u", $name)) fail("Enter the full name for student $sid (letters, spaces, periods, hyphens), 2 to 60 characters.");
            $pdo->prepare('INSERT INTO students (student_id, name, course, year_level) VALUES (?, ?, ?, ?)')->execute([$sid, $name, $course, $year]);
            $record = student_record($sid);
        }
        // Say who is busy, instead of the database's general "already booked".
        if ($taken = time_taken($provider['id'], $sid, $date, $start, $end, $groupId)) fail($taken['message'], 409);
        $insert->execute([$sid, $record['name'], $record['course'] ?? $course, $record['year_level'] ?? $year, $provider['id'], $service['id'], $roomId, $date, $start, $end, $teacherNote ?: null, $groupId, $groupLabel ?: null]);
        $id = (int) $pdo->lastInsertId();
        attach_files($id, 'teacher', $saved);
        $ids[] = $id;
    }
    $first = find_appointment($ids[0]);
    $who = count($ids) === 1 ? "{$first['student_name']} ({$first['student_id']})" : count($ids) . " students in $groupLabel";
    log_event($user, appointment_category($first), 'scheduled', sprintf(
        '%s scheduled %s for a %s on %s, %s in %s.', $provider['name'], $who, strtolower($service['name']), fmt_date($date), fmt_time($start), room_name($roomId)
    ), count($ids) === 1 ? appt_refs($first) : ['provider_id' => $provider['id'], 'appointment_id' => $ids[0], 'room_id' => $roomId], ['appointmentIds' => $ids]);
    $pdo->commit();
    keep_uploads();
    finish($user, ['created' => ['appointments' => $ids, 'queue' => []], 'serviceId' => $service['id']]);
}

/* ------------------------------------------------ appointment status */
case 'appt_status': {
    $a = find_appointment((int) ($in['id'] ?? 0));
    $to = text($in['to'] ?? '');
    if (!can_manage_appointment($user, $a)) fail("You don't have access to that appointment.", 403);
    if (!in_array($to, APPT_NEXT[$a['status']] ?? [], true)) fail('That change is not possible any more. The appointment may have just been changed by someone else.', 409);
    if ($user['role'] === 'student' && ($to !== 'cancelled' || has_started($a))) fail("You can only cancel a request before it starts.", 403);
    if ($to === 'confirmed' && has_started($a)) fail('That time has already passed, so it can\'t be approved.', 409);
    if ($to === 'checked_in' && $a['date'] !== today()) fail('Students can only be checked in on the day of their appointment.', 409);
    if ($to === 'no_show' && !has_started($a)) fail("It hasn't started yet, so it can't be marked as a no-show.", 409);

    $reason = mb_substr(trim(text($in['reason'] ?? '')), 0, 300);
    $created = ['appointments' => [], 'queue' => []];
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE appointments SET status = ?' . ($reason !== '' ? ', teacher_note = ?' : '') . ' WHERE id = ?')
        ->execute($reason !== '' ? [$to, $reason, $a['id']] : [$to, $a['id']]);
    $extra = '';
    if ($to === 'checked_in') {
        $late = $a['status'] === 'no_show' || now_minutes() > (int) $a['start_min'] + LATE_AFTER_MIN;
        $entry = enqueue_appointment($a, $late);
        if ($entry['created']) $created['queue'][] = $entry['id'];
        $extra = " with ticket {$entry['ticket']}" . ($late ? ' (late: placed at the end of the line)' : '');
    }
    // Finishing the appointment also finishes its queue ticket.
    if ($to === 'completed') {
        force(fn() => $pdo->prepare("UPDATE queue_entries SET status = 'done' WHERE appointment_id = ? AND status NOT IN ('done', 'left')")->execute([$a['id']]));
    }
    log_event($user, appointment_category($a, $to), $to, sprintf(
        "%s's %s with %s on %s, %s was %s%s.%s",
        $a['student_name'], strtolower(service_name($a['service_id'])), find_provider($a['provider_id'])['name'],
        fmt_date($a['date']), fmt_time((int) $a['start_min']), APPT_DONE[$to], $extra, $reason !== '' ? " Reason: $reason" : ''
    ), appt_refs($a), ['from' => $a['status'], 'to' => $to]);
    $pdo->commit();
    finish($user, ['created' => $created, 'message' => $extra]);
}

/* ------------------------------------------------------------- queue */
case 'queue_status': {
    only($user, 'teacher', 'admin');
    $entry = find_entry($user, (int) ($in['id'] ?? 0));
    $to = text($in['to'] ?? '');
    if (!in_array($to, QUEUE_NEXT[$entry['status']] ?? [], true)) fail('That change is not possible any more. Someone may have just changed this ticket.', 409);
    if ($to === 'in_service') {
        $stmt = $pdo->prepare("SELECT ticket FROM queue_entries WHERE provider_id = ? AND queue_date = ? AND status = 'in_service' AND id <> ?");
        $stmt->execute([$entry['provider_id'], today(), $entry['id']]);
        if ($busy = $stmt->fetchColumn()) fail("Finish $busy before serving the next person.", 409);
    }
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE queue_entries SET status = ? WHERE id = ?')->execute([$to, $entry['id']]);
    // Finishing a ticket also finishes the linked appointment.
    if ($to === 'done' && $entry['appointment_id']) {
        $pdo->prepare("UPDATE appointments SET status = 'completed' WHERE id = ? AND status = 'checked_in'")->execute([$entry['appointment_id']]);
    }
    $words = ['called' => 'was called', 'in_service' => 'is being served', 'done' => 'is done', 'left' => 'was removed from the line'];
    log_event($user, 'queue', $to, "{$entry['ticket']} ({$entry['name']}) {$words[$to]}.", entry_refs($entry));
    $pdo->commit();
    finish($user);
}

// Someone who doesn't come when called goes back to waiting at the end of the line, so the people
// who are actually there get served first. They keep their ticket number.
case 'queue_requeue': {
    only($user, 'teacher', 'admin');
    $entry = find_entry($user, (int) ($in['id'] ?? 0));
    if (!in_array($entry['status'], ['called', 'waiting'], true)) fail('Only people who are waiting or were called can be moved to the end.', 409);
    $pdo->beginTransaction();
    $pdo->prepare("UPDATE queue_entries SET status = 'waiting', queued_at = NOW(3), missed_count = missed_count + 1 WHERE id = ?")->execute([$entry['id']]);
    log_event($user, 'queue', 'moved_to_end', "{$entry['ticket']} ({$entry['name']}) wasn't there when called and was moved to the end of the line.", entry_refs($entry), ['missedCount' => (int) $entry['missed_count'] + 1]);
    $pdo->commit();
    finish($user);
}

case 'call_next': {
    only($user, 'teacher');
    $stmt = $pdo->prepare("SELECT * FROM queue_entries WHERE provider_id = ? AND queue_date = ? AND status = 'waiting' ORDER BY queued_at, id LIMIT 1");
    $stmt->execute([$user['providerId'], today()]);
    $entry = $stmt->fetch();
    if (!$entry) fail('No one is waiting.', 409);
    $pdo->prepare("UPDATE queue_entries SET status = 'called' WHERE id = ?")->execute([$entry['id']]);
    log_event($user, 'queue', 'called', "{$entry['ticket']} ({$entry['name']}) was called.", entry_refs($entry));
    finish($user, ['called' => queue_row(array_merge($entry, ['status' => 'called']))]);
}

case 'walk_in': {
    only($user, 'teacher');
    $name = trim(preg_replace('/\s+/', ' ', text($in['name'] ?? '')));
    if (!preg_match("/^\p{L}[\p{L} .'-]{1,59}$/u", $name)) fail('Use letters only (spaces, periods, hyphens and apostrophes are fine), 2 to 60 characters.');
    ['id' => $id, 'ticket' => $ticket] = insert_ticket($user['providerId'], $name, null, false);
    log_event($user, 'queue', 'walk_in', "$name was added to the line as a walk-in with ticket $ticket.", ['provider_id' => $user['providerId']]);
    finish($user, ['created' => ['appointments' => [], 'queue' => [$id]], 'ticket' => $ticket]);
}

/* --------------------------------------------------- teacher: hours */
// Students' free times are worked out from these hours, so saving them changes what everyone can book
// on their next refresh, and the API refuses bookings outside them from now on.
case 'save_hours': {
    only($user, 'teacher', 'admin');
    $provider = find_provider($user['role'] === 'admin' ? text($in['providerId'] ?? '') : $user['providerId']);
    $hours = is_array($in['hours'] ?? null) ? array_map('text', $in['hours']) : [];
    if ($why = schedule_problem($hours)) fail($why);
    $old = ['workStart' => hhmm($provider['work_start']), 'workEnd' => hhmm($provider['work_end']), 'lunchStart' => hhmm($provider['lunch_start']), 'lunchEnd' => hhmm($provider['lunch_end'])];
    $pdo->beginTransaction();
    $pdo->prepare('UPDATE providers SET work_start = ?, work_end = ?, lunch_start = ?, lunch_end = ? WHERE id = ?')
        ->execute([$hours['workStart'], $hours['workEnd'], $hours['lunchStart'], $hours['lunchEnd'], $provider['id']]);
    // Open appointments the new hours leave outside working time; they stay, but the teacher is told.
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE provider_id = ? AND status IN ('booked', 'confirmed') AND date >= ?
        AND (start_min < ? OR end_min > ? OR (start_min < ? AND ? < end_min))");
    $stmt->execute([$provider['id'], today(), to_min($hours['workStart']), to_min($hours['workEnd']), to_min($hours['lunchEnd']), to_min($hours['lunchStart'])]);
    $conflicts = (int) $stmt->fetchColumn();
    $range = fn($h) => fmt_time(to_min($h['workStart'])) . ' – ' . fmt_time(to_min($h['workEnd'])) . ', lunch ' . fmt_time(to_min($h['lunchStart'])) . ' – ' . fmt_time(to_min($h['lunchEnd']));
    log_event($user, 'schedule', 'hours_changed', sprintf(
        "%s's hours changed from %s to %s.%s", $provider['name'], $range($old), $range($hours),
        $conflicts ? " $conflicts open appointment" . ($conflicts > 1 ? 's' : '') . ' now fall outside them.' : ''
    ), ['provider_id' => $provider['id']], ['from' => $old, 'to' => $hours, 'conflicts' => $conflicts]);
    $pdo->commit();
    finish($user, ['conflicts' => $conflicts]);
}

/* ------------------------------------------- teacher: booking types */
case 'save_service': {
    only($user, 'teacher');
    $s = is_array($in['service'] ?? null) ? $in['service'] : [];
    $name = trim(preg_replace('/\s+/', ' ', text($s['name'] ?? '')));
    $duration = (int) text($s['duration'] ?? 0);
    if ($name === '' || mb_strlen($name) > 60) fail('Give the booking type a name, up to 60 characters.');
    if (!in_array($duration, [15, 30, 45, 60, 90, 120], true)) fail('Choose a length.');
    $fields = [$name, $duration, mb_substr(trim(text($s['description'] ?? '')), 0, 140), mb_substr(trim(text($s['question'] ?? '')), 0, 255), mb_substr(trim(text($s['example'] ?? '')), 0, 255)];

    $stmt = $pdo->prepare('SELECT * FROM services WHERE id = ?');
    $stmt->execute([text($s['id'] ?? '')]);
    $existing = $stmt->fetch();
    $pdo->beginTransaction();
    if ($existing && $existing['provider_id'] === $user['providerId']) {
        $id = $existing['id'];
        $pdo->prepare('UPDATE services SET name = ?, duration = ?, description = ?, question = ?, example = ? WHERE id = ?')->execute([...$fields, $id]);
    } else {
        // New, or an edit of a standard type: this teacher gets their own copy, others keep the original.
        $id = 'sv-' . bin2hex(random_bytes(6));
        $basedOn = $existing && $existing['provider_id'] === null ? $existing['id'] : null;
        $pdo->prepare('INSERT INTO services (id, provider_id, name, duration, description, question, example, based_on) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
            ->execute([$id, $user['providerId'], ...$fields, $basedOn]);
    }
    // Keep its place in the list when it replaces another type; otherwise add it at the end.
    $replace = text($in['replaceId'] ?? '') ?: $id;
    $stmt = $pdo->prepare('SELECT position FROM provider_services WHERE provider_id = ? AND service_id = ?');
    $stmt->execute([$user['providerId'], $replace]);
    $position = $stmt->fetchColumn();
    if ($position !== false) {
        $pdo->prepare('DELETE FROM provider_services WHERE provider_id = ? AND service_id IN (?, ?)')->execute([$user['providerId'], $replace, $id]);
        $pdo->prepare('INSERT INTO provider_services (provider_id, service_id, position) VALUES (?, ?, ?)')->execute([$user['providerId'], $id, $position]);
    } else {
        $pdo->prepare('INSERT IGNORE INTO provider_services (provider_id, service_id, position) SELECT ?, ?, COALESCE(MAX(position), -1) + 1 FROM provider_services WHERE provider_id = ?')
            ->execute([$user['providerId'], $id, $user['providerId']]);
    }
    log_event($user, 'service', 'saved', actor_name($user) . " saved the booking type \"$name\" ($duration min).", ['provider_id' => $user['providerId']]);
    $pdo->commit();
    finish($user, ['serviceId' => $id]);
}

case 'set_offered': {
    only($user, 'teacher');
    $ids = array_values(array_unique(array_map('text', input_list($in['serviceIds'] ?? null))));
    $check = $pdo->prepare('SELECT COUNT(*) FROM services WHERE id = ? AND (provider_id IS NULL OR provider_id = ?)');
    foreach ($ids as $id) {
        $check->execute([$id, $user['providerId']]);
        if (!$check->fetchColumn()) fail('One of those booking types no longer exists.');
    }
    $pdo->beginTransaction();
    $pdo->prepare('DELETE FROM provider_services WHERE provider_id = ?')->execute([$user['providerId']]);
    $insert = $pdo->prepare('INSERT INTO provider_services (provider_id, service_id, position) VALUES (?, ?, ?)');
    foreach ($ids as $i => $id) $insert->execute([$user['providerId'], $id, $i]);
    $pdo->commit();
    finish($user);
}

/* -------------------------------------------------------------- undo */
// Puts back the records an action changed and removes the ones it added.
case 'undo': {
    $isStudent = $user['role'] === 'student';
    // Students can only take back their own cancellation, so they can't approve or finish anything this way.
    if ($isStudent && (input_list($in['queue'] ?? null) || input_list($in['addedQueueIds'] ?? null) || input_list($in['addedApptIds'] ?? null))) {
        fail("You can't undo that.", 403);
    }
    $removedFiles = [];
    $pdo->beginTransaction();
    force(function () use ($pdo, $user, $in, $isStudent, &$removedFiles) {
        foreach (input_list($in['appointments'] ?? null) as $prev) {
            if (!is_array($prev)) fail("That can't be undone.");
            $a = find_appointment((int) ($prev['id'] ?? 0));
            if (!can_manage_appointment($user, $a)) fail("You can't undo that.", 403);
            $status = text($prev['status'] ?? '');
            if (!in_array($status, ['booked', 'confirmed', 'checked_in', 'completed', 'declined', 'cancelled', 'no_show'], true)) fail("That can't be undone.");
            if ($isStudent) {
                // Back to exactly what it was before the student cancelled it, per the history.
                $stmt = $pdo->prepare("SELECT details FROM activity_log WHERE appointment_id = ? AND action = 'cancelled' AND actor_user_id = ? ORDER BY id DESC LIMIT 1");
                $stmt->execute([$a['id'], $user['userId']]);
                $before = json_decode((string) $stmt->fetchColumn(), true)['from'] ?? null;
                if ($a['status'] !== 'cancelled' || $status !== $before || has_started($a)) fail("That can't be undone any more.", 409);
            }
            // Bringing a booking back must not double-book a time someone took in the meantime.
            if (in_array($status, BLOCKING, true) && !in_array($a['status'], BLOCKING, true)) {
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM appointments WHERE id <> ? AND date = ? AND (provider_id = ? OR student_id = ?)
                    AND status IN ('booked', 'confirmed', 'checked_in', 'completed') AND start_min < ? AND ? < end_min AND (group_id IS NULL OR group_id <> COALESCE(?, ''))");
                $stmt->execute([$a['id'], $a['date'], $a['provider_id'], $a['student_id'], $a['end_min'], $a['start_min'], $a['group_id']]);
                if ($stmt->fetchColumn()) fail("Can't undo: " . fmt_date($a['date']) . ', ' . fmt_time((int) $a['start_min']) . ' has been booked since.', 409);
            }
            // Students can't change the teacher's note.
            $note = $isStudent ? $a['teacher_note'] : (text($prev['teacherNote'] ?? '') !== '' ? mb_substr(text($prev['teacherNote']), 0, 300) : null);
            $pdo->prepare('UPDATE appointments SET status = ?, teacher_note = ? WHERE id = ?')->execute([$status, $note, $a['id']]);
        }
        foreach (input_list($in['queue'] ?? null) as $prev) {
            if (!is_array($prev)) fail("That can't be undone.");
            $entry = find_entry($user, (int) ($prev['id'] ?? 0));
            $status = text($prev['status'] ?? '');
            if (!in_array($status, ['waiting', 'called', 'in_service', 'done', 'left'], true)) fail("That can't be undone.");
            $queuedAt = text($prev['queuedAt'] ?? '');
            if (!preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?$/', $queuedAt)) $queuedAt = null;
            $missed = max(0, min(255, (int) text($prev['missedCount'] ?? $entry['missed_count'])));
            $pdo->prepare('UPDATE queue_entries SET status = ?, queued_at = COALESCE(?, queued_at), missed_count = ? WHERE id = ?')
                ->execute([$status, $queuedAt, $missed, $entry['id']]);
        }
        foreach (input_list($in['addedQueueIds'] ?? null) as $id) {
            $entry = find_entry($user, (int) text($id));
            $pdo->prepare('DELETE FROM queue_entries WHERE id = ?')->execute([$entry['id']]);
        }
        foreach (input_list($in['addedApptIds'] ?? null) as $id) {
            $a = find_appointment((int) text($id));
            if (!can_manage_appointment($user, $a)) fail("You can't undo that.", 403);
            // Its proof files go too, once the delete is saved.
            $stmt = $pdo->prepare('SELECT file_path FROM appointment_attachments WHERE appointment_id = ?');
            $stmt->execute([$a['id']]);
            array_push($removedFiles, ...$stmt->fetchAll(PDO::FETCH_COLUMN));
            $pdo->prepare('DELETE FROM queue_entries WHERE appointment_id = ?')->execute([$a['id']]);
            $pdo->prepare('DELETE FROM appointments WHERE id = ?')->execute([$a['id']]);
        }
    });
    log_event($user, 'appointment', 'undone', actor_name($user) . ' undid their last change.', $user['role'] === 'teacher' ? ['provider_id' => $user['providerId']] : [], $in);
    $pdo->commit();
    delete_upload_files($removedFiles);
    finish($user);
}

default:
    fail('Unknown action.');
}
