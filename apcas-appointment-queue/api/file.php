<?php
// GET ?id= -> an uploaded proof file, for the student, their teacher or an admin.
require __DIR__ . '/db.php';

$user = require_user();
$stmt = db()->prepare('SELECT f.*, a.student_id, a.provider_id FROM appointment_attachments f JOIN appointments a ON a.id = f.appointment_id WHERE f.id = ?');
$stmt->execute([(int) ($_GET['id'] ?? 0)]);
$file = $stmt->fetch();
if (!$file || !can_manage_appointment($user, $file)) fail('File not found.', 404);

$path = dirname(__DIR__) . '/uploads/' . basename($file['file_path']);
if (!is_file($path)) fail('File not found.', 404);

header_remove('Content-Type');
header('Content-Type: ' . $file['mime_type']);
header('Content-Length: ' . filesize($path));
// A plain-ASCII name for old browsers and the real one (accents, spaces) for the rest; no quotes or line breaks either way.
$ascii = preg_replace('/[^ -~]|["\\\\]/', '_', $file['file_name']);
header('Content-Disposition: inline; filename="' . $ascii . "\"; filename*=UTF-8''" . rawurlencode($file['file_name']));
header('X-Content-Type-Options: nosniff');
readfile($path);
