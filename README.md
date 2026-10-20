# APCAS Appointments & Queue

Appointment scheduling and queue management for Asia Pacific College of Advanced Studies.
Students book make-up classes and consultations, teachers approve them and run their line,
and the admin manages accounts, rooms, records and reports. Screens update live every few seconds.

- **Frontend:** React 18 + Vite (`src/App.jsx`)
- **Backend:** PHP 8 API (`apcas-appointment-queue/api`)
- **Database:** MySQL / MariaDB (`apcas-appointment-queue/sql`)

## Run it locally with XAMPP

1. Install [XAMPP](https://www.apachefriends.org/) (PHP 8+) and Node.js 18+. Start **Apache** and **MySQL**.
2. Make the API reachable at `http://localhost/apcas-appointment-queue/`. Either copy the
   `apcas-appointment-queue` folder into `C:\xampp\htdocs\`, or link it (run as administrator):
   ```
   mklink /D C:\xampp\htdocs\apcas-appointment-queue "<this repo>\apcas-appointment-queue"
   ```
3. Create the database: import `apcas-appointment-queue/sql/apcas_appointment_queue.sql` in phpMyAdmin, or run
   ```
   C:\xampp\mysql\bin\mysql -u root < apcas-appointment-queue/sql/apcas_appointment_queue.sql
   ```
   This creates the database `apcas_appointment_queue` from scratch (it drops an existing one).
   Already have an older copy whose data you want to keep? Run `upgrade_existing_database.sql` instead.
4. Start the app:
   ```
   npm install
   npm run dev
   ```
   Open the address Vite prints (usually http://localhost:5173). Requests to `/api` go to XAMPP.

The API connects as MySQL `root` with no password (XAMPP's default); change it in `apcas-appointment-queue/api/db.php`.

## Sign-in accounts

| Role    | Username | Password     |
|---------|----------|--------------|
| Admin   | `admin`  | `admin123`   |
| Student | `lee`    | `leelee`     |
| Teacher | `marjo`  | `marjomarjo` |

These are sample accounts. Change the passwords (Profile → Change password) before real use.
The admin creates every other account from **Accounts**.

## Features

- Students book appointments with a teacher's free times; teachers approve, decline, check in and finish them.
- Teachers schedule a student or a whole class directly, choosing the room from the High School, College or MGE building.
- A live queue per teacher; students who aren't there when called move to the end of the line.
- Changing a teacher's hours updates the free times straight away; clashes are refused by the database.
- Admin: accounts, rooms, searchable records, reports and full history, with CSV export and printing.
