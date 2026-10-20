<?php
// POST { current, next } -> changes the signed-in user's own password.
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') fail('Use POST.', 405);
$user = require_user();
$current = text(input()['current'] ?? '');
$next = text(input()['next'] ?? '');

$stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
$stmt->execute([$user['userId']]);
if (!password_verify($current, (string) $stmt->fetchColumn())) fail("Your current password isn't right.", 400);
if (strlen($next) < 8 || !preg_match('/[A-Za-z]/', $next) || !preg_match('/\d/', $next)) fail('Your new password needs at least 8 characters, with letters and numbers.');

db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([password_hash($next, PASSWORD_DEFAULT), $user['userId']]);
log_event($user, 'account', 'password_changed', actor_name($user) . ' changed their own password.');
respond(200, ['ok' => true]);
