<?php
// POST { username, password, role } -> { user } and starts a session.
require __DIR__ . '/db.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') respond(405, ['error' => 'Use POST.']);

$input = input();
$username = strtolower(trim(text($input['username'] ?? '')));
$password = text($input['password'] ?? '');
$role = text($input['role'] ?? '');

if ($username === '' || $password === '') respond(400, ['error' => 'Enter your username and password.']);

$stmt = db()->prepare('SELECT id, password_hash, role, is_active FROM users WHERE username = ?');
$stmt->execute([$username]);
$account = $stmt->fetch();

// Same message for a wrong username or a wrong password, so it doesn't reveal which usernames exist.
if (!$account || !password_verify($password, $account['password_hash'])) {
    respond(401, ['error' => "That username and password don't match. Check them and try again."]);
}

if (!$account['is_active']) {
    respond(403, ['error' => 'This account is switched off. Ask the administrator to turn it back on.']);
}

if ($role !== '' && $role !== $account['role']) {
    $other = $account['role'];
    $label = ucfirst($other);
    $article = $other === 'admin' ? 'an' : 'a';
    respond(403, ['error' => "This is $article $other account. Choose \"$label\" above and sign in again."]);
}

session_regenerate_id(true);
$_SESSION['user_id'] = (int) $account['id'];
db()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = ?')->execute([$account['id']]);

respond(200, ['user' => load_user((int) $account['id'])]);
