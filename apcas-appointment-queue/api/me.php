<?php
// GET -> { user } for the current session, or { user: null }.
require __DIR__ . '/db.php';

$user = isset($_SESSION['user_id']) ? load_user((int) $_SESSION['user_id']) : null;
respond(200, ['user' => $user]);
