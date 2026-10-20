-- =============================================================================
-- APCAS Appointment Scheduling & Queue Management: the complete database.
-- MySQL / MariaDB (XAMPP). Matches the data the app (src/App.jsx) and the PHP API
-- (apcas-appointment-queue/api) read and write.
--
-- Fresh install: import this one file in phpMyAdmin, or run
--   C:\xampp\mysql\bin\mysql -u root < apcas_appointment_queue.sql
-- WARNING: drops and recreates the apcas_appointment_queue database.
-- Already have the database from the older 01-03 scripts and want to keep its data?
-- Run upgrade_existing_database.sql instead.
--
-- Sign-in accounts (passwords are bcrypt hashes from PHP's password_hash()):
--   admin:   admin / admin123
--   student: lee   / leelee
--   teacher: marjo / marjomarjo
-- =============================================================================

DROP DATABASE IF EXISTS apcas_appointment_queue;
CREATE DATABASE apcas_appointment_queue CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE apcas_appointment_queue;

-- ----------------------------------------------------------------- rooms

-- Where teachers see students and where make-up classes are held.
CREATE TABLE rooms (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(40)  NOT NULL UNIQUE,
  building   VARCHAR(60)  NOT NULL DEFAULT '',
  floor      TINYINT      NULL,
  -- How many people fit; NULL until someone sets it.
  capacity   SMALLINT     NULL,
  notes      VARCHAR(140) NOT NULL DEFAULT '',
  -- Rooms not in use stay for past records but can't be picked for new schedules.
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rooms_capacity CHECK (capacity BETWEEN 1 AND 500),
  CONSTRAINT rooms_floor CHECK (floor BETWEEN 1 AND 20)
) ENGINE=InnoDB;

-- ------------------------------------------------------------- providers

-- Teachers. id keeps the app's "CICT-001" format. Hours apply Monday to Saturday;
-- students' free times are worked out from them.
CREATE TABLE providers (
  id          VARCHAR(10)  NOT NULL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  college     VARCHAR(100) NOT NULL,
  work_start  TIME NOT NULL DEFAULT '09:00:00',
  work_end    TIME NOT NULL DEFAULT '17:00:00',
  lunch_start TIME NOT NULL DEFAULT '12:00:00',
  lunch_end   TIME NOT NULL DEFAULT '13:00:00',
  -- The teacher's usual room; new appointments with them start there.
  room_id     INT UNSIGNED NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT providers_room_fk FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
  CONSTRAINT providers_id_format CHECK (id REGEXP '^[A-Z]+-[0-9]{3}$'),
  CONSTRAINT providers_hours_range CHECK (work_start >= '06:00:00' AND work_end <= '21:00:00'),
  CONSTRAINT providers_work_order CHECK (work_start < work_end),
  CONSTRAINT providers_lunch_order CHECK (lunch_start < lunch_end),
  CONSTRAINT providers_lunch_inside CHECK (lunch_start >= work_start AND lunch_end <= work_end)
) ENGINE=InnoDB;

-- -------------------------------------------------------------- services

-- Booking types. provider_id NULL = standard type offered by every teacher.
CREATE TABLE services (
  id          VARCHAR(30)  NOT NULL PRIMARY KEY,
  provider_id VARCHAR(10)  NULL,
  name        VARCHAR(60)  NOT NULL,
  duration    SMALLINT     NOT NULL,
  description VARCHAR(140) NOT NULL DEFAULT '',
  -- A non-empty question must be answered to book.
  question    VARCHAR(255) NOT NULL DEFAULT '',
  example     VARCHAR(255) NOT NULL DEFAULT '',
  -- 1 for a type a teacher typed in for a single appointment; students can't book it.
  one_off     TINYINT(1)   NOT NULL DEFAULT 0,
  -- A teacher's own edited copy of a standard type remembers which one it replaced.
  based_on    VARCHAR(30)  NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT services_provider_fk FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
  CONSTRAINT services_duration CHECK (duration IN (15, 30, 45, 60, 90, 120)),
  CONSTRAINT services_name_len CHECK (CHAR_LENGTH(name) >= 1)
) ENGINE=InnoDB;

-- Which booking types each teacher offers, in the order students see them.
CREATE TABLE provider_services (
  provider_id VARCHAR(10) NOT NULL,
  service_id  VARCHAR(30) NOT NULL,
  position    SMALLINT    NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, service_id),
  CONSTRAINT provider_services_provider_fk FOREIGN KEY (provider_id) REFERENCES providers (id) ON DELETE CASCADE,
  CONSTRAINT provider_services_service_fk FOREIGN KEY (service_id) REFERENCES services (id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- -------------------------------------------------------------- students

CREATE TABLE students (
  student_id VARCHAR(10) NOT NULL PRIMARY KEY,
  name       VARCHAR(60) NOT NULL,
  course     VARCHAR(30) NULL,
  year_level TINYINT     NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT students_id_format CHECK (student_id REGEXP '^[0-9]{4}-[0-9]{5}$'),
  CONSTRAINT students_name_len CHECK (CHAR_LENGTH(name) >= 2),
  CONSTRAINT students_year CHECK (year_level BETWEEN 1 AND 5)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------- users

-- Sign-in accounts. A student or teacher account links to its record; admins have neither.
CREATE TABLE users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(30)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('student', 'teacher', 'admin') NOT NULL,
  -- Shown for admins in the history log.
  display_name  VARCHAR(60)  NULL,
  student_id    VARCHAR(10)  NULL UNIQUE,
  provider_id   VARCHAR(10)  NULL UNIQUE,
  -- Switched-off accounts can't sign in; their records stay.
  is_active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMP NULL,
  -- No cascades: MariaDB 11 won't allow the CHECK below on columns a cascade can change, and
  -- students and teachers are never deleted (accounts are switched off instead).
  CONSTRAINT users_student_fk  FOREIGN KEY (student_id)  REFERENCES students (student_id),
  CONSTRAINT users_provider_fk FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT users_role_link CHECK (
    (role = 'student' AND student_id IS NOT NULL AND provider_id IS NULL) OR
    (role = 'teacher' AND provider_id IS NOT NULL AND student_id IS NULL) OR
    (role = 'admin'   AND student_id IS NULL AND provider_id IS NULL)
  )
) ENGINE=InnoDB;

-- ---------------------------------------------------------- appointments

CREATE TABLE appointments (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id     VARCHAR(10) NOT NULL,
  -- Snapshot of the student at booking time (the app shows these per appointment).
  student_name   VARCHAR(60) NOT NULL,
  student_course VARCHAR(30) NULL,
  student_year   TINYINT     NULL,
  provider_id    VARCHAR(10) NOT NULL,
  service_id     VARCHAR(30) NOT NULL,
  -- Where it's held; starts as the teacher's room, the admin can change it.
  room_id        INT UNSIGNED NULL,
  date           DATE        NOT NULL,
  -- Minutes from midnight, like the app (540 = 9:00 AM).
  start_min      SMALLINT    NOT NULL,
  end_min        SMALLINT    NOT NULL,
  status         ENUM('booked', 'confirmed', 'checked_in', 'completed', 'declined', 'cancelled', 'no_show')
                 NOT NULL DEFAULT 'booked',
  -- The student's note, or their answer to the booking type's question.
  note           VARCHAR(300) NOT NULL DEFAULT '',
  -- The teacher's message: a note when they schedule it, or why they declined or cancelled.
  teacher_note   VARCHAR(300) NULL,
  -- 'teacher' when a teacher set the time (starts out confirmed).
  assigned_by    ENUM('student', 'teacher') NOT NULL DEFAULT 'student',
  -- Class-wide assignments share a group id and a label like "BSIT · 2nd year".
  group_id       VARCHAR(36) NULL,
  group_label    VARCHAR(60) NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT appointments_student_fk  FOREIGN KEY (student_id)  REFERENCES students (student_id) ON UPDATE CASCADE,
  CONSTRAINT appointments_provider_fk FOREIGN KEY (provider_id) REFERENCES providers (id),
  CONSTRAINT appointments_service_fk  FOREIGN KEY (service_id)  REFERENCES services (id),
  CONSTRAINT appointments_room_fk     FOREIGN KEY (room_id)     REFERENCES rooms (id) ON DELETE SET NULL,
  CONSTRAINT appointments_times CHECK (start_min >= 0 AND end_min <= 1440 AND start_min < end_min),
  CONSTRAINT appointments_year CHECK (student_year BETWEEN 1 AND 5),
  CONSTRAINT appointments_no_sunday CHECK (DAYOFWEEK(date) <> 1),
  INDEX appointments_provider_date_idx (provider_id, date),
  INDEX appointments_student_date_idx (student_id, date),
  INDEX appointments_room_date_idx (room_id, date),
  INDEX appointments_group_idx (group_id)
) ENGINE=InnoDB;

-- Proof files (JPG, PNG, PDF) uploaded by the student or teacher. The file itself is in
-- apcas-appointment-queue/uploads/<file_path>, served only through api/file.php.
CREATE TABLE appointment_attachments (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  appointment_id INT UNSIGNED NOT NULL,
  uploaded_by    ENUM('student', 'teacher') NOT NULL,
  file_name      VARCHAR(255) NOT NULL,
  file_size      INT UNSIGNED NOT NULL,
  mime_type      ENUM('image/jpeg', 'image/png', 'application/pdf') NOT NULL,
  file_path      VARCHAR(500) NOT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT attachments_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE CASCADE,
  CONSTRAINT attachments_size CHECK (file_size > 0 AND file_size <= 5242880)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------- queue

-- One line per teacher per day, ordered by queued_at. A student who isn't there when called
-- goes back to waiting with a new queued_at, which puts them at the end of the line.
CREATE TABLE queue_entries (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ticket         VARCHAR(10)  NOT NULL,
  name           VARCHAR(60)  NOT NULL,
  provider_id    VARCHAR(10)  NOT NULL,
  -- NULL for walk-ins.
  appointment_id INT UNSIGNED NULL UNIQUE,
  queue_date     DATE NOT NULL,
  status         ENUM('waiting', 'called', 'in_service', 'done', 'left') NOT NULL DEFAULT 'waiting',
  queued_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  -- How many times they were called and weren't there.
  missed_count   TINYINT UNSIGNED NOT NULL DEFAULT 0,
  -- 1 when they checked in after their appointment time, or after being marked a no-show.
  late           TINYINT(1) NOT NULL DEFAULT 0,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT queue_provider_fk    FOREIGN KEY (provider_id)    REFERENCES providers (id),
  CONSTRAINT queue_appointment_fk FOREIGN KEY (appointment_id) REFERENCES appointments (id) ON DELETE SET NULL,
  CONSTRAINT queue_ticket_format CHECK (ticket REGEXP '^A-[0-9]{3,}$'),
  UNIQUE KEY queue_ticket_per_day (provider_id, queue_date, ticket),
  INDEX queue_provider_day_idx (provider_id, queue_date, queued_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------- history log

-- Every change anyone makes, for reports and the admin's history: bookings, approvals,
-- make-up classes, missed appointments, schedule changes, queue moves, accounts and rooms.
CREATE TABLE activity_log (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actor_user_id  INT UNSIGNED NULL,
  actor_role     ENUM('student', 'teacher', 'admin', 'system') NOT NULL,
  actor_name     VARCHAR(100) NOT NULL,
  category       ENUM('appointment', 'makeup', 'missed', 'schedule', 'queue', 'account', 'room', 'service') NOT NULL,
  action         VARCHAR(40)  NOT NULL,
  summary        VARCHAR(400) NOT NULL,
  -- Plain references, not foreign keys: the history outlives what it describes.
  appointment_id INT UNSIGNED NULL,
  provider_id    VARCHAR(10)  NULL,
  student_id     VARCHAR(10)  NULL,
  room_id        INT UNSIGNED NULL,
  -- JSON with before/after values, e.g. old and new hours.
  details        LONGTEXT NULL,
  CONSTRAINT activity_actor_fk FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL,
  INDEX activity_created_idx (created_at),
  INDEX activity_category_idx (category, created_at),
  INDEX activity_provider_idx (provider_id),
  INDEX activity_student_idx (student_id)
) ENGINE=InnoDB;

-- -------------------------------------------------------------- triggers

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

-- Only the valid next steps: booked -> confirmed -> checked_in -> completed, plus decline, cancel
-- and no-show, and checking in a no-show who turns up late the same day.
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
-- a called person who isn't there goes back to waiting (at the end of the line).
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

-- ================================================================== data

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

INSERT INTO providers (id, name, college) VALUES
  ('CAHS-001', 'Adraneda, Audrina P.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-002', 'Aguirre, Levie R.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-003', 'Arciaga, Agnes R.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-004', 'Ante, Chris Denverson O.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-005', 'Atienza, Gerlie D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-006', 'Avendaño, Razzel C.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-007', 'Berioso, Jaypie Q.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-008', 'Borja, Ishael M.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-009', 'Caguioa, Al Vincent P.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-010', 'Caparas, Carousel C.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-011', 'Caranzo, Janilene C.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-012', 'David, Giovanni D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-013', 'Dayrit, Aljed Rafael G.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-014', 'De Guzman, Clarisse B.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-015', 'De Leon, Trissa Mae B.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-016', 'Dela Rosa, Rianne S.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-017', 'Dial, Michelle B.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-018', 'Dulce, Archiel C.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-019', 'Flores, Glenise Aimee R.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-020', 'Hamid, Grace D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-021', 'Haravata, Maria Jamie S.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-022', 'Iligan, Apraelyn Z.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-023', 'Lagaña, Ernesto Jr. D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-024', 'Lagarto, Angelica Faye A.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-025', 'Latoga, Jules Marion M.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-026', 'Leaño, May Ann A.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-027', 'Lima, Norman S.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-028', 'Maala, Denisse Ann F.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-029', 'Magracia, Alexis J.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-030', 'Magtanong, Mark Joseph D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-031', 'Mariano, Erick Naisan N.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-032', 'Mariano, Richelle T.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-033', 'Mcfadden, Pauline V.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-034', 'Monday, Efren Jr. L.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-035', 'Natividad, Shiela P.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-036', 'Navarro, Mariel Jade A.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-037', 'Pinmiliw, Mildred P.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-038', 'Revilla, Daryll Jeff C.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-039', 'Taguinod, Mary Jane D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-040', 'Tria, Marjorie Eve D.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-041', 'Triguero, Alyn P.', 'College of Allied Health Sciences (CAHS)'),
  ('CAHS-042', 'Viloeta, Kian T.', 'College of Allied Health Sciences (CAHS)'),
  ('CCJED-001', 'Carreon, Rhen Keneth T.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-002', 'Dondo, Marian Aleckxis S.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-003', 'Cristobal, Amadeo Jr.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-004', 'Labrador, Jayson D.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-005', 'Layug, Anjanette R.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-006', 'Mendoza, Mark Ghio', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-007', 'Ragenil, Jonas B.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-008', 'Salaya, Nicole D.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-009', 'Santos, Angelica M.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-010', 'Santos, Dinardo', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-011', 'Tabugan, Kathlene D.', 'College of Criminal Justice Education (CCJED)'),
  ('CCJED-012', 'Tolentino, Jem Erielle G.', 'College of Criminal Justice Education (CCJED)'),
  ('CHMA-001', 'Alfaro, Jherwin G.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-002', 'Almario, Trisha Jhoy M.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-003', 'Bautista, Charisse Mae W.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-004', 'Bautista, Daryl L.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-005', 'Buhain, Victoria S.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-006', 'Contreras, Edryll R.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-007', 'Cruz, P.Marseilles C.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-008', 'Dimla, Florianne C.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-009', 'Espiritu, Genesis S.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-010', 'Galad, Marly D.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-011', 'Ignacio, Anthea Jean D.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-012', 'Lazo, Myles N.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-013', 'Legaspi, Mikaella S.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-014', 'Linaza, Bea Ruth E.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-015', 'Lomboy, Jv Camille', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-016', 'Mabini, Leonor Joy G.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-017', 'Montero, Myka', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-018', 'Narvaes, Wency', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-019', 'Olegario, Dianne Marie', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-020', 'Peñaranda, Erickson M.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-021', 'Ramos, Ron Louie', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-022', 'Sales, Joseph', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-023', 'Sia, Florence Collen Angelie C.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-024', 'Sta.Maria, Michaella A.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-025', 'Talastas, Glenmar P.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-026', 'Tan, Arthur S.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-027', 'Vergara, John Kervie B.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CHMA-028', 'Vistan, Edgardo Jr. S.', 'College of Hospitality Management and Accountancy (CHMA)'),
  ('CICT-001', 'Constantino, Gerren', 'College of Information and Communication Technology (CICT)'),
  ('CICT-002', 'De Guzman, Marlon Jay G.', 'College of Information and Communication Technology (CICT)'),
  ('CICT-003', 'Dela Cruz, Ian Carlos D.', 'College of Information and Communication Technology (CICT)'),
  ('CICT-004', 'Diego, Angelo R.', 'College of Information and Communication Technology (CICT)'),
  ('CICT-005', 'Nicdao, Niña P.', 'College of Information and Communication Technology (CICT)'),
  ('CICT-006', 'Obispo, Christian L.', 'College of Information and Communication Technology (CICT)'),
  ('CICT-007', 'Salenga, Patricia Anne Marie S.', 'College of Information and Communication Technology (CICT)'),
  ('CME-001', 'Acero, Rob Justin R.', 'College of Mathematics and Engineering (CME)'),
  ('CME-002', 'Garcia, Aldrian C.', 'College of Mathematics and Engineering (CME)'),
  ('CME-003', 'Garfin, Reymark R.', 'College of Mathematics and Engineering (CME)'),
  ('CME-004', 'Lao, Joel T.', 'College of Mathematics and Engineering (CME)'),
  ('CME-005', 'Lara, Lannica V.', 'College of Mathematics and Engineering (CME)'),
  ('CME-006', 'Manuyag, Mae Anne B.', 'College of Mathematics and Engineering (CME)'),
  ('CME-007', 'Subala, Mariel Ann O.', 'College of Mathematics and Engineering (CME)'),
  ('CME-008', 'Tiongson, Lexter V.', 'College of Mathematics and Engineering (CME)'),
  ('CSED-001', 'Alarcon, Arjay', 'College of Science and Education (CSEd)'),
  ('CSED-002', 'Cortez, Melanie', 'College of Science and Education (CSEd)'),
  ('CSED-003', 'Cruzada, Jeyrald', 'College of Science and Education (CSEd)'),
  ('CSED-004', 'De Guzman, Jennifer G.', 'College of Science and Education (CSEd)'),
  ('CSED-005', 'Dela Rosa, Lyka B.', 'College of Science and Education (CSEd)'),
  ('CSED-006', 'Dizer, Ma. Regina V.', 'College of Science and Education (CSEd)'),
  ('CSED-007', 'Duran, Jayson C.', 'College of Science and Education (CSEd)'),
  ('CSED-008', 'Estrella, Doreen Rose R.', 'College of Science and Education (CSEd)'),
  ('CSED-009', 'Estrella, Kate Sydney M.', 'College of Science and Education (CSEd)'),
  ('CSED-010', 'Lima, Norman S.', 'College of Science and Education (CSEd)'),
  ('CSED-011', 'Magpoc, Maricel V.', 'College of Science and Education (CSEd)'),
  ('CSED-012', 'Mansilongan, Florenz T.', 'College of Science and Education (CSEd)'),
  ('CSED-013', 'Rodill, Rica Mae G.', 'College of Science and Education (CSEd)'),
  ('CSED-014', 'Roman, Leslie Ann G.', 'College of Science and Education (CSEd)'),
  ('CSED-015', 'Rosanes, Micah Ella', 'College of Science and Education (CSEd)'),
  ('CSED-016', 'Sabello, Sammy Y.', 'College of Science and Education (CSEd)'),
  ('CSED-017', 'Sanchez, Lily M.', 'College of Science and Education (CSEd)'),
  ('CSED-018', 'Sanchez, Renalyn M.', 'College of Science and Education (CSEd)'),
  ('CSED-019', 'Tañada, Marilou Julian', 'College of Science and Education (CSEd)'),
  ('LANG-001', 'Cruz, Aliyah Bianca L.', 'Language Instructors'),
  ('LANG-002', 'Dayao, Cyrhine Ann P.', 'Language Instructors'),
  ('LANG-003', 'Navarro, Mark Joseph J.', 'Language Instructors'),
  ('LANG-004', 'Paguio, Christine Joyce B.', 'Language Instructors'),
  ('LANG-005', 'Pangilinan, Madeline C.', 'Language Instructors'),
  ('LANG-006', 'Reyes, Annie Rose D.', 'Language Instructors'),
  ('LANG-007', 'Roque, Crisabelle E.', 'Language Instructors'),
  ('LANG-008', 'Valerio, Kaye Angela C.', 'Language Instructors'),
  ('LANG-009', 'Velasco, Hannie Grace A.', 'Language Instructors'),
  ('LANG-010', 'Yambao, Victor Lance T.', 'Language Instructors')
;

INSERT INTO services (id, provider_id, name, duration, description, question, example) VALUES
  ('makeup', null, 'Makeup class', 60, '', 'Why do you need a makeup class?', 'Example: I was absent on Oct 14 because I was sick and missed the lab quiz.'),
  ('consult', null, 'Consultation', 30, '', '', ''),
  ('quick', null, 'Quick question', 15, '', '', ''),
  ('review', null, 'Project review', 45, '', '', ''),
  ('sv-lab1', 'CICT-001', 'Laboratory Output 1 checking', 30, 'Bring your laptop with the project running. Checking only, no grading.', 'Which part of Laboratory Output 1 should I check?', 'Example: The login page and the database connection.')
;

-- Every teacher offers the four standard types; CICT-001 offers their own lab checking first.
INSERT INTO provider_services (provider_id, service_id, position)
SELECT p.id, s.id, s.position + IF(p.id = 'CICT-001', 1, 0)
FROM providers p
CROSS JOIN (
  SELECT 'makeup' AS id, 0 AS position UNION ALL
  SELECT 'consult', 1 UNION ALL
  SELECT 'quick', 2 UNION ALL
  SELECT 'review', 3
) s;
INSERT INTO provider_services (provider_id, service_id, position) VALUES ('CICT-001', 'sv-lab1', 0);

-- Sample students; Lee is the one behind the "lee" account.
INSERT INTO students (student_id, name, course, year_level) VALUES
  ('2023-00123', 'Juan Dela Cruz', 'BSIT', 3),
  ('2023-00456', 'Maria Santos', 'BSIT', 3),
  ('2024-01022', 'Paolo Reyes', 'BSCS', 2),
  ('2022-00981', 'Ken Bautista', 'BSIT', 4),
  ('2024-00317', 'Angela Cruz', 'BSIT', 2),
  ('2023-00777', 'Mark Villanueva', 'BSCS', 3),
  ('2024-00555', 'Carla Mendoza', 'BSN', 2),
  ('2023-00888', 'Bea Garcia', 'BSCE', 3),
  ('2024-00412', 'Rhea Domingo', 'BSIT', 2),
  ('2024-00198', 'Carlo Mercado', 'BSIT', 2),
  ('2024-00633', 'Jasmine Lopez', 'BSIT', 2),
  ('2025-00042', 'Juan Dela Cruz', 'BSCS', 1),
  ('2023-00999', 'Lee', 'BSIT', 3);

INSERT INTO users (username, password_hash, role, display_name, student_id, provider_id) VALUES
  ('admin', '$2y$10$glIJHg2lwYwUxr2LnFovJeQexxlfaimnv2Dm/qc3v6f4jHUO4jKKS', 'admin', 'Administrator', NULL, NULL),
  ('lee',   '$2y$10$/GtsCiCuMIIt3i2It2b6n.W6PMY4R3ELzIw.TSlsSc05/wMtOTj5u', 'student', NULL, '2023-00999', NULL),
  -- Tria, Marjorie Eve D. (College of Allied Health Sciences)
  ('marjo', '$2y$10$nondcTeAxo9M7X7aqjAswOrfdzQJGOH8hVExL1nVeUf.shVvAGzE.', 'teacher', NULL, NULL, 'CAHS-040');
