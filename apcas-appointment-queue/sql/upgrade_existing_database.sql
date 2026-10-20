-- Upgrades a database made with the older 01_schema / 02_seed / 03_users scripts to the current one
-- (admin accounts, rooms, re-queuing absent students, the history log). Keeps all existing data.
-- Run it once. For a new install, import apcas_appointment_queue.sql instead.
--   admin: admin / admin123

USE apcas_appointment_queue;

-- ----------------------------------------------------------------- users

-- Admins have no student or teacher record; accounts can be switched off instead of deleted.
-- The links lose their cascades: MariaDB 11 won't allow the CHECK below on columns a cascade can change.
ALTER TABLE users DROP FOREIGN KEY users_student_fk, DROP FOREIGN KEY users_provider_fk;
ALTER TABLE users
  ADD CONSTRAINT users_student_fk  FOREIGN KEY (student_id)  REFERENCES students (student_id),
  ADD CONSTRAINT users_provider_fk FOREIGN KEY (provider_id) REFERENCES providers (id);
ALTER TABLE users
  DROP CONSTRAINT users_role_link,
  MODIFY role ENUM('student', 'teacher', 'admin') NOT NULL,
  ADD COLUMN display_name VARCHAR(60) NULL AFTER role,
  ADD COLUMN is_active TINYINT(1) NOT NULL DEFAULT 1 AFTER provider_id,
  ADD CONSTRAINT users_role_link CHECK (
    (role = 'student' AND student_id IS NOT NULL AND provider_id IS NULL) OR
    (role = 'teacher' AND provider_id IS NOT NULL AND student_id IS NULL) OR
    (role = 'admin'   AND student_id IS NULL AND provider_id IS NULL)
  );

INSERT INTO users (username, password_hash, role, display_name) VALUES
  ('admin', '$2y$10$glIJHg2lwYwUxr2LnFovJeQexxlfaimnv2Dm/qc3v6f4jHUO4jKKS', 'admin', 'Administrator');

-- ----------------------------------------------------------------- rooms

CREATE TABLE rooms (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(40)  NOT NULL UNIQUE,
  building   VARCHAR(60)  NOT NULL DEFAULT '',
  floor      TINYINT      NULL,
  -- How many people fit; NULL until someone sets it.
  capacity   SMALLINT     NULL,
  notes      VARCHAR(140) NOT NULL DEFAULT '',
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rooms_capacity CHECK (capacity BETWEEN 1 AND 500),
  CONSTRAINT rooms_floor CHECK (floor BETWEEN 1 AND 20)
) ENGINE=InnoDB;

-- The school's rooms, in the order the buildings are listed: High School (5 floors),
-- College (3 floors), MGE (6 floors; the library and conference room take whole floors).
-- Seats are left empty until the admin sets them on the Rooms page.
INSERT INTO rooms (name, building, floor, notes) VALUES
  ('HS-101', 'High School Building', 1, ''),
  ('HS-102', 'High School Building', 1, ''),
  ('HS-103', 'High School Building', 1, ''),
  ('HS-104', 'High School Building', 1, ''),
  ('HS-105', 'High School Building', 1, ''),
  ('HS-201', 'High School Building', 2, ''),
  ('HS-202', 'High School Building', 2, ''),
  ('HS-203', 'High School Building', 2, ''),
  ('HS-204', 'High School Building', 2, ''),
  ('HS-205', 'High School Building', 2, ''),
  ('HS-301', 'High School Building', 3, ''),
  ('HS-302', 'High School Building', 3, ''),
  ('HS-303', 'High School Building', 3, ''),
  ('HS-304', 'High School Building', 3, ''),
  ('HS-305', 'High School Building', 3, ''),
  ('HS-401', 'High School Building', 4, ''),
  ('HS-402', 'High School Building', 4, ''),
  ('HS-403', 'High School Building', 4, ''),
  ('HS-404', 'High School Building', 4, ''),
  ('HS-405', 'High School Building', 4, ''),
  ('HS-501', 'High School Building', 5, ''),
  ('HS-502', 'High School Building', 5, ''),
  ('HS-503', 'High School Building', 5, ''),
  ('HS-504', 'High School Building', 5, ''),
  ('HS-505', 'High School Building', 5, ''),
  ('C101', 'College Building', 1, ''),
  ('C102', 'College Building', 1, ''),
  ('C103', 'College Building', 1, ''),
  ('C104', 'College Building', 1, ''),
  ('C105', 'College Building', 1, ''),
  ('C201', 'College Building', 2, ''),
  ('C202', 'College Building', 2, ''),
  ('C203', 'College Building', 2, ''),
  ('C204', 'College Building', 2, ''),
  ('C205', 'College Building', 2, ''),
  ('C301', 'College Building', 3, ''),
  ('C302', 'College Building', 3, ''),
  ('C303', 'College Building', 3, ''),
  ('C304', 'College Building', 3, ''),
  ('C305', 'College Building', 3, ''),
  ('MGE-101', 'MGE Building', 1, ''),
  ('MGE-102', 'MGE Building', 1, ''),
  ('MGE-103', 'MGE Building', 1, ''),
  ('MGE-104', 'MGE Building', 1, ''),
  ('MGE-105', 'MGE Building', 1, ''),
  ('MGE-201', 'MGE Building', 2, ''),
  ('MGE-202', 'MGE Building', 2, ''),
  ('MGE-203', 'MGE Building', 2, ''),
  ('MGE-204', 'MGE Building', 2, ''),
  ('MGE-205', 'MGE Building', 2, ''),
  ('MGE-301', 'MGE Building', 3, ''),
  ('MGE-302', 'MGE Building', 3, ''),
  ('MGE-303', 'MGE Building', 3, ''),
  ('MGE-304', 'MGE Building', 3, ''),
  ('MGE-305', 'MGE Building', 3, ''),
  ('MGE-401', 'MGE Building', 4, ''),
  ('MGE-402', 'MGE Building', 4, ''),
  ('MGE-403', 'MGE Building', 4, ''),
  ('MGE-404', 'MGE Building', 4, ''),
  ('MGE-405', 'MGE Building', 4, ''),
  ('Library', 'MGE Building', 5, 'Whole floor'),
  ('Conference Room', 'MGE Building', 6, 'Whole floor');

-- A teacher's usual room: where students find them during their hours.
ALTER TABLE providers
  ADD COLUMN room_id INT UNSIGNED NULL,
  ADD CONSTRAINT providers_room_fk FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL;

-- Where an appointment or make-up class is held; starts as the teacher's room.
ALTER TABLE appointments
  ADD COLUMN room_id INT UNSIGNED NULL AFTER service_id,
  ADD CONSTRAINT appointments_room_fk FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
  ADD INDEX appointments_room_date_idx (room_id, date);

-- ----------------------------------------------------------------- queue

-- The line is ordered by queued_at. A student who doesn't come when called goes back in with a new
-- queued_at, which puts them at the end, so the people who are there get served first.
ALTER TABLE queue_entries
  ADD COLUMN queued_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER status,
  ADD COLUMN missed_count TINYINT UNSIGNED NOT NULL DEFAULT 0 AFTER queued_at,
  -- 1 when the student checked in after their appointment time, or after being marked a no-show.
  ADD COLUMN late        TINYINT(1) NOT NULL DEFAULT 0 AFTER missed_count,
  ADD INDEX queue_provider_day_idx (provider_id, queue_date, queued_at);

-- ----------------------------------------------------------- history log

-- Every change anyone makes, for reports and the admin's history pages.
CREATE TABLE activity_log (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id  INT UNSIGNED NULL,
  actor_role     ENUM('student', 'teacher', 'admin', 'system') NOT NULL,
  actor_name     VARCHAR(100) NOT NULL,
  category       ENUM('appointment', 'makeup', 'missed', 'schedule', 'queue', 'account', 'room', 'service') NOT NULL,
  action         VARCHAR(40)  NOT NULL,
  summary        VARCHAR(400) NOT NULL,
  appointment_id INT UNSIGNED NULL,
  provider_id    VARCHAR(10)  NULL,
  student_id     VARCHAR(10)  NULL,
  room_id        INT UNSIGNED NULL,
  details        LONGTEXT NULL,
  CONSTRAINT activity_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX activity_created_idx (created_at),
  INDEX activity_category_idx (category, created_at),
  INDEX activity_provider_idx (provider_id),
  INDEX activity_student_idx (student_id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------- triggers

DROP TRIGGER IF EXISTS appointments_no_clash_insert;
DROP TRIGGER appointments_transition;
DROP TRIGGER queue_transition;

DELIMITER $$

-- The clash rule: existingStart < newEnd AND newStart < existingEnd, for appointments that take up time.
-- A teacher scheduling a whole class books the same time for every student in it (one group_id).
CREATE TRIGGER appointments_no_clash_insert
BEFORE INSERT ON appointments
FOR EACH ROW
BEGIN
  IF NEW.status IN ('booked', 'confirmed', 'checked_in', 'completed') AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.date = NEW.date
      -- Students in the same class share the teacher's time; anyone else can't.
      AND (a.student_id = NEW.student_id
           OR (a.provider_id = NEW.provider_id AND NOT (NEW.group_id IS NOT NULL AND a.group_id <=> NEW.group_id)))
      AND a.status IN ('booked', 'confirmed', 'checked_in', 'completed')
      AND a.start_min < NEW.end_min AND NEW.start_min < a.end_min
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That time is already booked.';
  END IF;
END$$

-- Same steps as before, plus checking in a no-show who turns up late the same day.
-- @apcas_undo is set by the API while it puts records back for Undo.
CREATE TRIGGER appointments_transition
BEFORE UPDATE ON appointments
FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status AND COALESCE(@apcas_undo, 0) = 0 AND NOT (
       (OLD.status = 'booked'     AND NEW.status IN ('confirmed', 'declined', 'cancelled'))
    OR (OLD.status = 'confirmed'  AND NEW.status IN ('checked_in', 'cancelled', 'no_show'))
    OR (OLD.status = 'checked_in' AND NEW.status = 'completed')
    OR (OLD.status = 'no_show'    AND NEW.status = 'checked_in')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That status change is not allowed.';
  END IF;
  IF (NEW.date <> OLD.date OR NEW.start_min <> OLD.start_min OR NEW.end_min <> OLD.end_min)
     AND NEW.status IN ('booked', 'confirmed', 'checked_in', 'completed') AND EXISTS (
    SELECT 1 FROM appointments a
    WHERE a.id <> NEW.id
      AND a.date = NEW.date
      -- Students in the same class share the teacher's time; anyone else can't.
      AND (a.student_id = NEW.student_id
           OR (a.provider_id = NEW.provider_id AND NOT (NEW.group_id IS NOT NULL AND a.group_id <=> NEW.group_id)))
      AND a.status IN ('booked', 'confirmed', 'checked_in', 'completed')
      AND a.start_min < NEW.end_min AND NEW.start_min < a.end_min
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That time is already booked.';
  END IF;
END$$

-- waiting -> called -> in_service -> done; waiting or called people can leave;
-- a called person who doesn't come goes back to waiting (at the end of the line).
CREATE TRIGGER queue_transition
BEFORE UPDATE ON queue_entries
FOR EACH ROW
BEGIN
  IF NEW.status <> OLD.status AND COALESCE(@apcas_undo, 0) = 0 AND NOT (
       (OLD.status = 'waiting'    AND NEW.status IN ('called', 'left'))
    OR (OLD.status = 'called'     AND NEW.status IN ('in_service', 'left', 'waiting'))
    OR (OLD.status = 'in_service' AND NEW.status = 'done')
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'That queue status change is not allowed.';
  END IF;
END$$

DELIMITER ;

-- ------------------------------------------------------------- services

-- A teacher's own edited copy of a standard booking type remembers which one it replaced.
ALTER TABLE services ADD COLUMN based_on VARCHAR(30) NULL AFTER one_off;

-- ---------------------------------------------------------- appointments

-- It holds the teacher's message whether they scheduled, declined or cancelled, so name it that.
ALTER TABLE appointments CHANGE status_reason teacher_note VARCHAR(300) NULL;
