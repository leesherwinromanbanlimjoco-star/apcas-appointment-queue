<?php
// Shared setup for the APCAS API: JSON responses, the session, the database connection, and helpers.

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

// XAMPP prints PHP warnings into the page, which would break the JSON the app reads. Log them instead.
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// The school is in the Philippines; PHP's own default here is not.
date_default_timezone_set('Asia/Manila');

session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax']);
session_start();

function db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        // XAMPP's default MySQL account (root, no password) unless config.php says otherwise.
        // Online, the deploy writes config.php from GitHub secrets; it is never committed.
        $c = (is_file(__DIR__ . '/config.php') ? require __DIR__ . '/config.php' : []) + [
            'host' => '127.0.0.1', 'name' => 'apcas_appointment_queue', 'user' => 'root', 'pass' => '',
        ];
        $pdo = new PDO("mysql:host={$c['host']};dbname={$c['name']};charset=utf8mb4", $c['user'], $c['pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]);
        $pdo->exec("SET time_zone = '+08:00'");
    }
    return $pdo;
}

function respond(int $status, array $body): void {
    http_response_code($status);
    echo json_encode($body, JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function fail(string $message, int $status = 400): void {
    discard_uploads();
    respond($status, ['error' => $message]);
}

// Turn database errors into plain messages instead of a blank 500.
set_exception_handler(function (Throwable $e) {
    // The connection itself may be what failed (MySQL stopped), so don't open a new one here.
    try {
        if (db()->inTransaction()) db()->rollBack();
    } catch (Throwable $ignored) {
        error_log((string) $e);
        fail("Can't reach the database. Check that MySQL is running in XAMPP.", 503);
    }
    // Triggers SIGNAL with SQLSTATE 45000 and a message meant for people.
    if ($e instanceof PDOException && ($e->errorInfo[0] ?? '') === '45000') fail($e->errorInfo[2], 409);
    if ($e instanceof PDOException && ($e->errorInfo[1] ?? 0) === 1062) fail('That is already taken. Use a different one.', 409);
    error_log((string) $e);
    fail('Something went wrong on the server. Please try again.', 500);
});

// The JSON body as an array; anything else (empty, broken or not an object) counts as no input.
function input(): array {
    static $data = null;
    if ($data === null) {
        $decoded = json_decode(file_get_contents('php://input'), true);
        $data = is_array($decoded) ? $decoded : [];
    }
    return $data;
}

// A list from the input, or [] when it's missing or not a list.
function input_list($value): array {
    return is_array($value) ? array_values($value) : [];
}

// A single text value from the input; arrays and objects become "".
function text($value): string {
    return is_scalar($value) ? (string) $value : '';
}

function today(): string {
    return date('Y-m-d');
}

function now_minutes(): int {
    return (int) date('G') * 60 + (int) date('i');
}

// "09:00:00" -> "09:00"
function hhmm(?string $time): string {
    return $time === null ? '' : substr($time, 0, 5);
}

function to_min(string $hhmm): int {
    [$h, $m] = array_map('intval', explode(':', $hhmm));
    return $h * 60 + $m;
}

// Free hosting doesn't allow the database's clash triggers, so changes that take up time or a room
// take turns: the check and the save happen under this lock, and two people can't both get the
// same slot. MySQL releases it when the request ends.
function booking_lock(): void {
    if (!db()->query("SELECT GET_LOCK('apcas_booking', 10)")->fetchColumn()) fail('The system is busy. Please try again in a moment.', 503);
}

// The signed-in user in the shape the React app uses, or null.
function load_user(int $userId): ?array {
    $stmt = db()->prepare(
        'SELECT u.id, u.role, u.username, u.display_name, u.provider_id, u.is_active, s.student_id, s.name, s.course, s.year_level
         FROM users u LEFT JOIN students s ON s.student_id = u.student_id
         WHERE u.id = ?'
    );
    $stmt->execute([$userId]);
    $row = $stmt->fetch();
    if (!$row || !$row['is_active']) return null;
    $base = ['userId' => (int) $row['id'], 'username' => $row['username']];
    if ($row['role'] === 'admin') {
        return $base + ['role' => 'admin', 'name' => $row['display_name'] ?: 'Administrator'];
    }
    if ($row['role'] === 'teacher') {
        return $base + ['role' => 'teacher', 'providerId' => $row['provider_id']];
    }
    return $base + [
        'role' => 'student',
        'name' => $row['name'],
        'studentId' => $row['student_id'],
        'course' => $row['course'] ?? '',
        'year' => $row['year_level'] !== null ? (int) $row['year_level'] : null,
    ];
}

// The signed-in user, or a 401. With $roles, only those roles get through.
function require_user(array $roles = []): array {
    $user = isset($_SESSION['user_id']) ? load_user((int) $_SESSION['user_id']) : null;
    // Nothing after this writes to the session. Releasing its lock lets the 4-second polls and
    // the user's own clicks run side by side instead of waiting for each other.
    session_write_close();
    if (!$user) fail('Your session has ended. Please sign in again.', 401);
    if ($roles && !in_array($user['role'], $roles, true)) fail("You don't have access to that.", 403);
    return $user;
}

// The name to show in the history for whoever did something.
function actor_name(array $user): string {
    if ($user['role'] === 'teacher') {
        $stmt = db()->prepare('SELECT name FROM providers WHERE id = ?');
        $stmt->execute([$user['providerId']]);
        return $stmt->fetchColumn() ?: $user['username'];
    }
    return $user['name'] ?? $user['username'];
}

// One line in the history log. $refs: appointment_id, provider_id, student_id, room_id.
function log_event(?array $user, string $category, string $action, string $summary, array $refs = [], $details = null): void {
    db()->prepare(
        'INSERT INTO activity_log (actor_user_id, actor_role, actor_name, category, action, summary, appointment_id, provider_id, student_id, room_id, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $user['userId'] ?? null,
        $user['role'] ?? 'system',
        $user ? actor_name($user) : 'System',
        $category,
        $action,
        mb_substr($summary, 0, 400),
        $refs['appointment_id'] ?? null,
        $refs['provider_id'] ?? null,
        $refs['student_id'] ?? null,
        $refs['room_id'] ?? null,
        $details === null ? null : json_encode($details),
    ]);
}

/* ------------------------------------------------------------ formatting */

function fmt_time(int $min): string {
    $h = intdiv($min, 60);
    $m = $min % 60;
    $h12 = $h % 12 === 0 ? 12 : $h % 12;
    return sprintf('%d:%02d %s', $h12, $m, $h >= 12 ? 'PM' : 'AM');
}

function fmt_date(string $date): string {
    return date('D, M j', strtotime($date));
}

/* ------------------------------------------------------------ row shapes */

function attachments_for(array $appointmentIds): array {
    if (!$appointmentIds) return [];
    $marks = implode(',', array_fill(0, count($appointmentIds), '?'));
    $stmt = db()->prepare("SELECT id, appointment_id, uploaded_by, file_name, file_size, mime_type FROM appointment_attachments WHERE appointment_id IN ($marks) ORDER BY id");
    $stmt->execute($appointmentIds);
    $by = [];
    foreach ($stmt as $f) {
        $key = $f['uploaded_by'] === 'teacher' ? 'teacherAttachments' : 'attachments';
        $by[$f['appointment_id']][$key][] = [
            'id' => 'file-' . $f['id'],
            'name' => $f['file_name'],
            'size' => (int) $f['file_size'],
            'isPdf' => $f['mime_type'] === 'application/pdf',
            'url' => '/api/file.php?id=' . $f['id'],
        ];
    }
    return $by;
}

function appointment_row(array $a, array $files = []): array {
    $id = (int) $a['id'];
    return [
        'id' => $id,
        'studentName' => $a['student_name'],
        'studentId' => $a['student_id'],
        'studentCourse' => $a['student_course'] ?? '',
        'studentYear' => $a['student_year'] !== null ? (int) $a['student_year'] : null,
        'providerId' => $a['provider_id'],
        'serviceId' => $a['service_id'],
        'roomId' => $a['room_id'] !== null ? (int) $a['room_id'] : null,
        'date' => $a['date'],
        'start' => (int) $a['start_min'],
        'end' => (int) $a['end_min'],
        'status' => $a['status'],
        'note' => $a['note'],
        'teacherNote' => $a['teacher_note'] ?? '',
        'assignedBy' => $a['assigned_by'],
        'groupId' => $a['group_id'],
        'groupLabel' => $a['group_label'],
        'createdAt' => $a['created_at'],
        'updatedAt' => $a['updated_at'],
        'attachments' => $files[$id]['attachments'] ?? [],
        'teacherAttachments' => $files[$id]['teacherAttachments'] ?? [],
    ];
}

function queue_row(array $e): array {
    return [
        'id' => (int) $e['id'],
        'ticket' => $e['ticket'],
        'name' => $e['name'],
        'providerId' => $e['provider_id'],
        'appointmentId' => $e['appointment_id'] !== null ? (int) $e['appointment_id'] : null,
        'date' => $e['queue_date'],
        'status' => $e['status'],
        'queuedAt' => $e['queued_at'],
        'missedCount' => (int) $e['missed_count'],
        'late' => (bool) $e['late'],
    ];
}

function find_appointment(int $id): array {
    $stmt = db()->prepare('SELECT * FROM appointments WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) fail('That appointment no longer exists.', 404);
    return $row;
}

function find_provider(string $id): array {
    $stmt = db()->prepare('SELECT * FROM providers WHERE id = ?');
    $stmt->execute([$id]);
    $row = $stmt->fetch();
    if (!$row) fail('That teacher no longer exists.', 404);
    return $row;
}

function room_name(?int $id): string {
    if (!$id) return 'no room';
    $stmt = db()->prepare('SELECT name, building FROM rooms WHERE id = ?');
    $stmt->execute([$id]);
    $r = $stmt->fetch();
    return $r ? trim($r['name'] . ($r['building'] ? ", {$r['building']}" : '')) : 'no room';
}

function service_name(string $id): string {
    $stmt = db()->prepare('SELECT name FROM services WHERE id = ?');
    $stmt->execute([$id]);
    return $stmt->fetchColumn() ?: 'Appointment';
}

// Make-up classes get their own history category so reports can count them.
function appointment_category(array $a, string $to = ''): string {
    if ($to === 'no_show') return 'missed';
    return $a['service_id'] === 'makeup' ? 'makeup' : 'appointment';
}

// Can this user act on this appointment at all?
function can_manage_appointment(array $user, array $a): bool {
    if ($user['role'] === 'admin') return true;
    if ($user['role'] === 'teacher') return $a['provider_id'] === $user['providerId'];
    return strcasecmp($a['student_id'], $user['studentId']) === 0;
}

// Plain-language problem with a set of working hours, or "". Same rules as the app.
function schedule_problem(array $h): string {
    foreach (['workStart', 'workEnd', 'lunchStart', 'lunchEnd'] as $k) {
        if (!preg_match('/^\d{2}:\d{2}$/', $h[$k] ?? '')) return 'Please fill in all four times.';
    }
    [$ws, $we, $ls, $le] = [to_min($h['workStart']), to_min($h['workEnd']), to_min($h['lunchStart']), to_min($h['lunchEnd'])];
    foreach ([$ws, $we, $ls, $le] as $m) if ($m % 15 !== 0) return 'Use times on the quarter hour (:00, :15, :30 or :45).';
    if ($ws < 360 || $we > 1260) return 'Hours must fall between 6:00 AM and 9:00 PM.';
    if ($ws >= $we) return 'Start of day must be earlier than end of day.';
    if ($ls >= $le) return 'Lunch must start before it ends.';
    if ($ls < $ws || $le > $we) return 'Lunch should be inside working hours.';
    return '';
}

// Why this time can't be booked with this teacher, or "".
function slot_problem(array $provider, string $date, int $start, int $end): string {
    if ($date < today()) return 'That date has passed.';
    if (date('w', strtotime($date)) === '0') return "Teachers don't see students on Sundays.";
    if ($start % 15 !== 0) return 'Start times are on the quarter hour.';
    if ($date === today() && $start <= now_minutes()) return 'That time has already passed today.';
    $ws = to_min(hhmm($provider['work_start']));
    $we = to_min(hhmm($provider['work_end']));
    $ls = to_min(hhmm($provider['lunch_start']));
    $le = to_min(hhmm($provider['lunch_end']));
    if ($start < $ws || $end > $we) return "That time is outside the teacher's hours (" . fmt_time($ws) . ' – ' . fmt_time($we) . '). Their schedule may have just changed; pick a time from the list again.';
    if ($ls < $end && $start < $le) return "That time is during the teacher's lunch break.";
    return '';
}

/* ----------------------------------------------------------- attachments */

const UPLOAD_TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'application/pdf' => 'pdf'];

function upload_dir(): string {
    return dirname(__DIR__) . '/uploads';
}

// Files written during this request that aren't saved in the database yet. If the request fails
// they're deleted, so a refused booking doesn't leave files behind in uploads/.
$GLOBALS['pending_uploads'] = [];

function discard_uploads(): void {
    foreach ($GLOBALS['pending_uploads'] ?? [] as $path) @unlink(upload_dir() . "/$path");
    $GLOBALS['pending_uploads'] = [];
}

// Call after the transaction that saved the files' rows commits.
function keep_uploads(): void {
    $GLOBALS['pending_uploads'] = [];
}

// Removes files whose rows are gone. A class's shared files stay while any appointment still lists them.
function delete_upload_files(array $paths): void {
    $inUse = db()->prepare('SELECT COUNT(*) FROM appointment_attachments WHERE file_path = ?');
    foreach (array_unique($paths) as $path) {
        $inUse->execute([$path]);
        if (!$inUse->fetchColumn()) @unlink(upload_dir() . '/' . basename($path));
    }
}

// Files arrive as data URLs ({ name, data }); they're checked, written to uploads/, and returned for insert.
function save_uploads($files): array {
    $files = input_list($files);
    if (count($files) > 3) fail('You can attach up to 3 files.');
    $saved = [];
    foreach ($files as $f) {
        if (!is_array($f) || !preg_match('#^data:([\w/.+-]+);base64,(.+)$#s', text($f['data'] ?? ''), $m)) fail('A file could not be read. Attach it again.');
        $bytes = base64_decode($m[2], true);
        if ($bytes === false) fail('A file could not be read. Attach it again.');
        // Trust the content, not the name or the browser's label.
        $mime = (new finfo(FILEINFO_MIME_TYPE))->buffer($bytes);
        $label = text($f['name'] ?? '') ?: 'file';
        if (!isset(UPLOAD_TYPES[$mime])) fail("\"$label\" isn't a JPG, PNG or PDF.");
        if (strlen($bytes) === 0) fail("\"$label\" is empty. Attach it again.");
        if (strlen($bytes) > 5 * 1024 * 1024) fail("\"$label\" is over 5 MB.");
        $dir = upload_dir();
        if (!is_dir($dir)) mkdir($dir, 0775, true);
        $path = bin2hex(random_bytes(16)) . '.' . UPLOAD_TYPES[$mime];
        if (file_put_contents("$dir/$path", $bytes) === false) fail('The file could not be saved on the server. Please try again.', 500);
        $GLOBALS['pending_uploads'][] = $path;
        $saved[] = ['name' => mb_substr(basename($label), 0, 255), 'size' => strlen($bytes), 'mime' => $mime, 'path' => $path];
    }
    return $saved;
}

function attach_files(int $appointmentId, string $by, array $saved): void {
    $stmt = db()->prepare('INSERT INTO appointment_attachments (appointment_id, uploaded_by, file_name, file_size, mime_type, file_path) VALUES (?, ?, ?, ?, ?, ?)');
    foreach ($saved as $f) $stmt->execute([$appointmentId, $by, $f['name'], $f['size'], $f['mime'], $f['path']]);
}
