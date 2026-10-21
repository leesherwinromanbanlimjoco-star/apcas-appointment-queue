<?php
// GET ?ref=APCAS-000123-7F3A91C2 -> whether a student's approval receipt is real, and what it's for.
// Teachers check it when a student comes to them; the QR code on the receipt opens this check.
require __DIR__ . '/db.php';

$user = require_user(['teacher', 'admin']);
$ref = receipt_normalize(text($_GET['ref'] ?? ''));
if ($ref === '') fail('That isn\'t a receipt number. It looks like APCAS-000123-7F3A91C2.');

$stmt = db()->prepare('SELECT * FROM appointments WHERE id = ?');
$stmt->execute([(int) substr($ref, 6, -9)]);
$a = $stmt->fetch();
// Same answer for a made-up number and an edited one, so neither tells anything away.
if (!$a || !hash_equals(receipt_ref($a), $ref)) {
    respond(200, ['valid' => false, 'ref' => $ref, 'message' => 'No receipt has this number. It may have been typed wrong, or the receipt is not genuine.']);
}

$approval = approvals_for([$a])[$a['id']] ?? null;
$why = [
    'booked' => 'It has not been approved.',
    'declined' => 'The request was declined.',
    'cancelled' => 'The appointment was cancelled.',
    'no_show' => 'The student was marked as a no-show.',
][$a['status']] ?? '';

respond(200, [
    'valid' => true,
    'ref' => $ref,
    // A genuine receipt for an appointment that no longer stands.
    'current' => $why === '',
    'message' => $why,
    'yours' => $user['role'] === 'admin' || $a['provider_id'] === $user['providerId'],
    'appointment' => appointment_row($a) + [
        'approvedAt' => $approval['at'] ?? null,
        'approvedBy' => $approval['by'] ?? null,
        'teacherName' => find_provider($a['provider_id'])['name'],
        'serviceName' => service_name($a['service_id']),
        'roomName' => $a['room_id'] ? room_name((int) $a['room_id']) : '',
    ],
]);
