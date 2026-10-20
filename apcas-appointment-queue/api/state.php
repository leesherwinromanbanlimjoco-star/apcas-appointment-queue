<?php
// GET ?v=<version> -> everything the signed-in user's pages show, or { unchanged: true } when
// nothing changed since that version. The app polls this to stay up to date without a refresh.
require __DIR__ . '/db.php';
require __DIR__ . '/state_lib.php';

$user = require_user();
$state = build_state($user);
$version = md5(json_encode($state));
if (($_GET['v'] ?? '') === $version) respond(200, ['unchanged' => true, 'version' => $version]);
respond(200, ['state' => $state, 'version' => $version]);
