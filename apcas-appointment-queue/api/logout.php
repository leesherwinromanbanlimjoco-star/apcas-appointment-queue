<?php
// POST -> ends the session.
require __DIR__ . '/db.php';

$_SESSION = [];
session_destroy();
respond(200, ['ok' => true]);
