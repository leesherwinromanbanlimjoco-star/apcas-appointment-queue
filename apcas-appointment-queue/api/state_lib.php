<?php
// Everything the signed-in user's pages show, in the shapes the React app uses.
// Each role only gets its own slice: students never see other students' details.

// Approved appointments from earlier days that nobody checked in become no-shows, so missed
// appointments show up in records and reports without anyone having to mark them.
function close_missed_appointments(): void {
    $stmt = db()->prepare("SELECT * FROM appointments WHERE status = 'confirmed' AND date < ?");
    $stmt->execute([today()]);
    $missed = $stmt->fetchAll();
    $update = db()->prepare("UPDATE appointments SET status = 'no_show' WHERE id = ? AND status = 'confirmed'");
    foreach ($missed as $a) {
        $update->execute([$a['id']]);
        if ($update->rowCount() === 0) continue;
        log_event(null, 'missed', 'no_show', sprintf(
            '%s (%s) missed their %s on %s, %s. Marked as a no-show automatically.',
            $a['student_name'], $a['student_id'], strtolower(service_name($a['service_id'])), fmt_date($a['date']), fmt_time((int) $a['start_min'])
        ), ['appointment_id' => $a['id'], 'provider_id' => $a['provider_id'], 'student_id' => $a['student_id'], 'room_id' => $a['room_id']]);
    }

    // Students checked in on an earlier day were seen; if the teacher never pressed Done, finish it for them
    // so it stops counting as one of the student's open appointments.
    $stmt = db()->prepare("SELECT * FROM appointments WHERE status = 'checked_in' AND date < ?");
    $stmt->execute([today()]);
    $update = db()->prepare("UPDATE appointments SET status = 'completed' WHERE id = ? AND status = 'checked_in'");
    foreach ($stmt->fetchAll() as $a) {
        $update->execute([$a['id']]);
        if ($update->rowCount() === 0) continue;
        log_event(null, appointment_category($a), 'completed', sprintf(
            "%s's %s on %s, %s was still checked in at the end of the day. Marked as completed automatically.",
            $a['student_name'], strtolower(service_name($a['service_id'])), fmt_date($a['date']), fmt_time((int) $a['start_min'])
        ), ['appointment_id' => $a['id'], 'provider_id' => $a['provider_id'], 'student_id' => $a['student_id'], 'room_id' => $a['room_id']], ['from' => 'checked_in', 'to' => 'completed']);
    }
}

function build_state(array $user): array {
    close_missed_appointments();
    $role = $user['role'];
    $pdo = db();

    // Teachers and the booking types each one offers, in order.
    $offered = [];
    foreach ($pdo->query('SELECT provider_id, service_id FROM provider_services ORDER BY provider_id, position') as $r) {
        $offered[$r['provider_id']][] = $r['service_id'];
    }
    $accounts = [];
    foreach ($pdo->query("SELECT provider_id, username FROM users WHERE role = 'teacher'") as $r) $accounts[$r['provider_id']] = $r['username'];
    $providers = [];
    foreach ($pdo->query('SELECT * FROM providers ORDER BY college, name') as $p) {
        $providers[] = [
            'id' => $p['id'],
            'name' => $p['name'],
            'college' => $p['college'],
            'workStart' => hhmm($p['work_start']),
            'workEnd' => hhmm($p['work_end']),
            'lunchStart' => hhmm($p['lunch_start']),
            'lunchEnd' => hhmm($p['lunch_end']),
            'roomId' => $p['room_id'] !== null ? (int) $p['room_id'] : null,
            'serviceIds' => $offered[$p['id']] ?? [],
            'hasAccount' => isset($accounts[$p['id']]),
        ];
    }

    $services = [];
    foreach ($pdo->query('SELECT * FROM services ORDER BY created_at, id') as $s) {
        $services[] = [
            'id' => $s['id'],
            'providerId' => $s['provider_id'],
            'name' => $s['name'],
            'duration' => (int) $s['duration'],
            'description' => $s['description'],
            'question' => $s['question'],
            'example' => $s['example'],
            'oneOff' => (bool) $s['one_off'],
            'basedOn' => $s['based_on'],
        ];
    }

    $rooms = [];
    // In the order they were added, which keeps buildings and floors in the school's own order.
    foreach ($pdo->query('SELECT * FROM rooms ORDER BY id') as $r) {
        $rooms[] = [
            'id' => (int) $r['id'],
            'name' => $r['name'],
            'building' => $r['building'],
            'floor' => $r['floor'] !== null ? (int) $r['floor'] : null,
            'capacity' => $r['capacity'] !== null ? (int) $r['capacity'] : null,
            'notes' => $r['notes'],
            'active' => (bool) $r['is_active'],
        ];
    }

    // Appointments. Students get their own in full, and only the times other people's bookings take up.
    $rows = $pdo->query('SELECT * FROM appointments ORDER BY date, start_min, id')->fetchAll();
    if ($role === 'student') {
        $own = array_values(array_filter($rows, fn($a) => strcasecmp($a['student_id'], $user['studentId']) === 0));
        $files = attachments_for(array_column($own, 'id'));
        $appointments = [];
        foreach ($rows as $a) {
            if (strcasecmp($a['student_id'], $user['studentId']) === 0) {
                $appointments[] = appointment_row($a, $files);
            } elseif ($a['date'] >= today() && in_array($a['status'], ['booked', 'confirmed', 'checked_in', 'completed'], true)) {
                $appointments[] = [
                    'id' => (int) $a['id'], 'studentName' => '', 'studentId' => '', 'providerId' => $a['provider_id'],
                    'serviceId' => $a['service_id'], 'date' => $a['date'], 'start' => (int) $a['start_min'],
                    'end' => (int) $a['end_min'], 'status' => $a['status'], 'hidden' => true,
                ];
            }
        }
    } else {
        $files = attachments_for(array_column($rows, 'id'));
        $appointments = array_map(fn($a) => appointment_row($a, $files), $rows);
    }

    // Today's line, in order: whoever was moved to the end has a later queued_at.
    $stmt = $pdo->prepare('SELECT * FROM queue_entries WHERE queue_date = ? ORDER BY queued_at, id');
    $stmt->execute([today()]);
    $entries = array_map('queue_row', $stmt->fetchAll());
    if ($role === 'teacher') {
        $queue = array_values(array_filter($entries, fn($e) => $e['providerId'] === $user['providerId']));
    } elseif ($role === 'student') {
        $mine = array_column(array_filter($appointments, fn($a) => empty($a['hidden'])), 'id');
        $queue = [];
        foreach ($entries as $e) {
            if (!in_array($e['appointmentId'], $mine, true)) continue;
            // How many people are ahead in the same teacher's line.
            $e['ahead'] = 0;
            if ($e['status'] === 'waiting') {
                foreach ($entries as $o) {
                    if ($o['providerId'] === $e['providerId'] && $o['status'] === 'waiting' && $o['queuedAt'] < $e['queuedAt']) $e['ahead']++;
                }
            }
            $queue[] = $e;
        }
    } else {
        $queue = $entries;
    }

    $state = compact('providers', 'services', 'rooms', 'appointments', 'queue') + ['today' => today()];

    // Registered students: for teachers scheduling a whole class, and for the admin's records.
    if ($role !== 'student') {
        $state['students'] = array_map(fn($s) => [
            'studentId' => $s['student_id'], 'name' => $s['name'], 'course' => $s['course'] ?? '',
            'year' => $s['year_level'] !== null ? (int) $s['year_level'] : null,
        ], $pdo->query('SELECT * FROM students ORDER BY name')->fetchAll());
    }

    if ($role === 'admin') {
        $state['users'] = array_map(fn($u) => [
            'id' => (int) $u['id'],
            'username' => $u['username'],
            'role' => $u['role'],
            'name' => $u['display_name'] ?? $u['student_name'] ?? $u['provider_name'] ?? $u['username'],
            'studentId' => $u['student_id'],
            'providerId' => $u['provider_id'],
            'active' => (bool) $u['is_active'],
            'createdAt' => $u['created_at'],
            'lastLoginAt' => $u['last_login_at'],
        ], $pdo->query(
            'SELECT u.*, s.name AS student_name, p.name AS provider_name FROM users u
             LEFT JOIN students s ON s.student_id = u.student_id LEFT JOIN providers p ON p.id = u.provider_id
             ORDER BY u.role, u.username'
        )->fetchAll());
        $state['activity'] = recent_activity(40);
    }

    return $state;
}

function activity_row(array $r): array {
    return [
        'id' => (int) $r['id'],
        'at' => $r['created_at'],
        'actorRole' => $r['actor_role'],
        'actorName' => $r['actor_name'],
        'category' => $r['category'],
        'action' => $r['action'],
        'summary' => $r['summary'],
        'appointmentId' => $r['appointment_id'] !== null ? (int) $r['appointment_id'] : null,
        'providerId' => $r['provider_id'],
        'studentId' => $r['student_id'],
        'roomId' => $r['room_id'] !== null ? (int) $r['room_id'] : null,
        'details' => $r['details'] !== null ? json_decode($r['details'], true) : null,
    ];
}

function recent_activity(int $limit): array {
    return array_map('activity_row', db()->query("SELECT * FROM activity_log ORDER BY id DESC LIMIT $limit")->fetchAll());
}
