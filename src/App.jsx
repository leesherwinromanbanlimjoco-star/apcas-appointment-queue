import { cloneElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";

/* =========================================================================
   APCAS Appointment Scheduling & Queue Management.
   Data lives in MySQL behind the PHP API in apcas-appointment-queue/api; every screen
   polls it every few seconds, so changes made by anyone show up without a refresh.
   ========================================================================= */

/* ----------------------------- Sample data ----------------------------- */

const instructorsByCollege = {
  "College of Allied Health Sciences (CAHS)": [
    "ADRANEDA, AUDRINA P.", "AGUIRRE, LEVIE R.", "ARCIAGA, AGNES R.", "ANTE, CHRIS DENVERSON O.",
    "ATIENZA, GERLIE D.", "AVENDAÑO, RAZZEL C.", "BERIOSO, JAYPIE Q.", "BORJA, ISHAEL M.",
    "CAGUIOA, AL VINCENT P.", "CAPARAS, CAROUSEL C.", "CARANZO, JANILENE C.", "DAVID, GIOVANNI D.",
    "DAYRIT, ALJED RAFAEL G.", "DE GUZMAN, CLARISSE B.", "DE LEON, TRISSA MAE B.", "DELA ROSA, RIANNE S.",
    "DIAL, MICHELLE B.", "DULCE, ARCHIEL C.", "FLORES, GLENISE AIMEE R.", "HAMID, GRACE D.",
    "HARAVATA, MARIA JAMIE S.", "ILIGAN, APRAELYN Z.", "LAGAÑA, ERNESTO JR. D.", "LAGARTO, ANGELICA FAYE A.",
    "LATOGA, JULES MARION M.", "LEAÑO, MAY ANN A.", "LIMA, NORMAN S.", "MAALA, DENISSE ANN F.",
    "MAGRACIA, ALEXIS J.", "MAGTANONG, MARK JOSEPH D.", "MARIANO, ERICK NAISAN N.", "MARIANO, RICHELLE T.",
    "MCFADDEN, PAULINE V.", "MONDAY, EFREN JR. L.", "NATIVIDAD, SHIELA P.", "NAVARRO, MARIEL JADE A.",
    "PINMILIW, MILDRED P.", "REVILLA, DARYLL JEFF C.", "TAGUINOD, MARY JANE D.", "TRIA, MARJORIE EVE D.",
    "TRIGUERO, ALYN P.", "VILOETA, KIAN T."
  ],
  "College of Criminal Justice Education (CCJED)": [
    "CARREON, RHEN KENETH T.", "DONDO, MARIAN ALECKXIS S.", "CRISTOBAL, AMADEO JR.", "LABRADOR, JAYSON D.",
    "LAYUG, ANJANETTE R.", "MENDOZA, MARK GHIO", "RAGENIL, JONAS B.", "SALAYA, NICOLE D.",
    "SANTOS, ANGELICA M.", "SANTOS, DINARDO", "TABUGAN, KATHLENE D.", "TOLENTINO, JEM ERIELLE G."
  ],
  "College of Hospitality Management and Accountancy (CHMA)": [
    "ALFARO, JHERWIN G.", "ALMARIO, TRISHA JHOY M.", "BAUTISTA, CHARISSE MAE W.", "BAUTISTA, DARYL L.",
    "BUHAIN, VICTORIA S.", "CONTRERAS, EDRYLL R.", "CRUZ, P.MARSEILLES C.", "DIMLA, FLORIANNE C.",
    "ESPIRITU, GENESIS S.", "GALAD, MARLY D.", "IGNACIO, ANTHEA JEAN D.", "LAZO, MYLES N.",
    "LEGASPI, MIKAELLA S.", "LINAZA, BEA RUTH E.", "LOMBOY, JV CAMILLE", "MABINI, LEONOR JOY G.",
    "MONTERO, MYKA", "NARVAES, WENCY", "OLEGARIO, DIANNE MARIE", "PEÑARANDA, ERICKSON M.",
    "RAMOS, RON LOUIE", "SALES, JOSEPH", "SIA, FLORENCE COLLEN ANGELIE C.", "STA.MARIA, MICHAELLA A.",
    "TALASTAS, GLENMAR P.", "TAN, ARTHUR S.", "VERGARA, JOHN KERVIE B.", "VISTAN, EDGARDO JR. S."
  ],
  "College of Information and Communication Technology (CICT)": [
    "CONSTANTINO, GERREN", "DE GUZMAN, MARLON JAY G.", "DELA CRUZ, IAN CARLOS D.", "DIEGO, ANGELO R.",
    "NICDAO, NIÑA P.", "OBISPO, CHRISTIAN L.", "SALENGA, PATRICIA ANNE MARIE S."
  ],
  "College of Mathematics and Engineering (CME)": [
    "ACERO, ROB JUSTIN R.", "GARCIA, ALDRIAN C.", "GARFIN, REYMARK R.", "LAO, JOEL T.",
    "LARA, LANNICA V.", "MANUYAG, MAE ANNE B.", "SUBALA, MARIEL ANN O.", "TIONGSON, LEXTER V."
  ],
  "College of Science and Education (CSEd)": [
    "ALARCON, ARJAY", "CORTEZ, MELANIE", "CRUZADA, JEYRALD", "DE GUZMAN, JENNIFER G.",
    "DELA ROSA, LYKA B.", "DIZER, MA. REGINA V.", "DURAN, JAYSON C.", "ESTRELLA, DOREEN ROSE R.",
    "ESTRELLA, KATE SYDNEY M.", "LIMA, NORMAN S.", "MAGPOC, MARICEL V.", "MANSILONGAN, FLORENZ T.",
    "RODILL, RICA MAE G.", "ROMAN, LESLIE ANN G.", "ROSANES, MICAH ELLA", "SABELLO, SAMMY Y.",
    "SANCHEZ, LILY M.", "SANCHEZ, RENALYN M.", "TAÑADA, MARILOU JULIAN"
  ],
  "Language Instructors": [
    "CRUZ, ALIYAH BIANCA L.", "DAYAO, CYRHINE ANN P.", "NAVARRO, MARK JOSEPH J.", "PAGUIO, CHRISTINE JOYCE B.",
    "PANGILINAN, MADELINE C.", "REYES, ANNIE ROSE D.", "ROQUE, CRISABELLE E.", "VALERIO, KAYE ANGELA C.",
    "VELASCO, HANNIE GRACE A.", "YAMBAO, VICTOR LANCE T."
  ]
};

const COLLEGES = Object.keys(instructorsByCollege);

const SERVICE_NAME_MAX = 60;
const SERVICE_DESC_MAX = 140;
const DURATION_CHOICES = [15, 30, 45, 60, 90, 120];

/* ------------------------------- Helpers ------------------------------- */

const pad = (n, len = 2) => String(n).padStart(len, "0");

function shortCollege(college) {
  const match = college.match(/\(([^)]+)\)/);
  return match ? match[1] : college;
}

const toMin = (hhmm) => {
  if (!hhmm) return NaN;
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
const fmtTime = (min) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
};
const fmtRange = (start, end) => `${fmtTime(start)} – ${fmtTime(end)}`;

const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const TODAY = dateKey(new Date());
const TOMORROW = dateKey(new Date(Date.now() + 86400000));
const keyToDate = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const fmtWeekday = (key) => keyToDate(key).toLocaleDateString(undefined, { weekday: "short" });
const fmtMonthDay = (key) => keyToDate(key).toLocaleDateString(undefined, { month: "short", day: "numeric" });
function fmtDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// The clash rule: existingStart < newEnd AND newStart < existingEnd
const clashes = (existingStart, existingEnd, newStart, newEnd) =>
  existingStart < newEnd && newStart < existingEnd;

// Returns a plain-language problem with an instructor's hours, or "".
function scheduleProblem(p) {
  const ws = toMin(p.workStart), we = toMin(p.workEnd);
  const ls = toMin(p.lunchStart), le = toMin(p.lunchEnd);
  if ([ws, we, ls, le].some(Number.isNaN)) return "Please fill in all four times.";
  if ([ws, we, ls, le].some((m) => m % 15 !== 0)) return "Use times on the quarter hour (:00, :15, :30 or :45).";
  if (ws < 6 * 60 || we > 21 * 60) return "Hours must fall between 6:00 AM and 9:00 PM.";
  if (ws >= we) return "Start of day must be earlier than end of day.";
  if (ls >= le) return "Lunch must start before it ends.";
  if (ls < ws || le > we) return "Lunch should be inside working hours.";
  return "";
}

/* ------------------------------ Status rules ----------------------------- */

const APPT_STATUS = {
  booked: { label: "Waiting for approval", tone: "warning" },
  confirmed: { label: "Approved", tone: "brand" },
  checked_in: { label: "Checked in", tone: "info" },
  completed: { label: "Completed", tone: "success" },
  declined: { label: "Declined", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "No-show", tone: "error" },
};

// requested → approved → checked in → completed, plus decline, cancel and no-show.
// A no-show who turns up later the same day can still be checked in; they join the end of the line.
const APPT_NEXT = {
  booked: ["confirmed", "declined", "cancelled"],
  confirmed: ["checked_in", "cancelled", "no_show"],
  checked_in: ["completed"],
  completed: [],
  declined: [],
  cancelled: [],
  no_show: ["checked_in"],
};

// Past tense used in feedback messages.
const APPT_DONE = {
  confirmed: "approved",
  checked_in: "checked in",
  completed: "marked as completed",
  declined: "declined",
  cancelled: "cancelled",
  no_show: "marked as a no-show",
};

// Appointments that still need something to happen.
const ACTIVE = new Set(["booked", "confirmed", "checked_in"]);

// Appointments with these statuses take up the instructor's time.
const BLOCKING = new Set(["booked", "confirmed", "checked_in", "completed"]);

// Only the valid next steps are shown to a teacher; `confirm` names the dialog to show first.
const TEACHER_ACTIONS = {
  booked: [
    { to: "confirmed", label: "Approve", kind: "primary" },
    { to: "declined", label: "Decline", confirm: "decline" },
  ],
  confirmed: [
    { to: "checked_in", label: "Check in", kind: "primary" },
    { to: "no_show", label: "No-show", confirm: "no_show" },
    { to: "cancelled", label: "Cancel", confirm: "cancel" },
  ],
  checked_in: [{ to: "completed", label: "Complete", kind: "primary" }],
  no_show: [{ to: "checked_in", label: "Check in late" }],
};

// Students can only cancel their own requests.
const STUDENT_CAN_CANCEL = new Set(["booked", "confirmed"]);

const QUEUE_STATUS = {
  waiting: { label: "Waiting", tone: "neutral" },
  called: { label: "Called", tone: "warning" },
  in_service: { label: "Being served", tone: "info" },
  done: { label: "Done", tone: "success" },
  left: { label: "Left", tone: "neutral" },
};

// waiting → called → in service → done; waiting or called people can leave
const QUEUE_NEXT = {
  waiting: ["called", "left"],
  called: ["in_service", "left"],
  in_service: ["done"],
  done: [],
  left: [],
};

// "requeue": not there when called, so they go back in line behind everyone who is there now.
const QUEUE_ACTIONS = {
  waiting: [{ to: "left", label: "Remove", confirm: true }],
  called: [
    { to: "in_service", label: "Start serving", kind: "primary" },
    { to: "requeue", label: "Not here: move to end" },
    { to: "left", label: "Remove", confirm: true },
  ],
  in_service: [{ to: "done", label: "Finish", kind: "primary" }],
};

const QUEUE_DONE = { called: "called", in_service: "is being served", done: "is done", left: "was removed from the line" };

// What students see: one plain status per appointment, from its approval and its place in the line.
const STUDENT_STAGE = {
  pending: { label: "Pending", tone: "warning" },
  approved: { label: "Approved", tone: "brand" },
  in_line: { label: "In line", tone: "info" },
  your_turn: { label: "Your turn", tone: "turn" },
  completed: { label: "Completed", tone: "success" },
  declined: { label: "Declined", tone: "error" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  no_show: { label: "Missed", tone: "error" },
};

// `ticket` is the appointment's open queue ticket, if it has one.
function studentStage(a, ticket) {
  if (a.status === "booked") return "pending";
  if (a.status === "confirmed") return "approved";
  if (a.status === "checked_in") return ticket && ["called", "in_service"].includes(ticket.status) ? "your_turn" : "in_line";
  return a.status;
}

// The four steps every request goes through; "in line" is the wait inside the third.
const STAGE_STEPS = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "your_turn", label: "Your turn" },
  { id: "completed", label: "Completed" },
];
const STAGE_STEP_INDEX = { pending: 0, approved: 1, in_line: 2, your_turn: 2, completed: 3 };

const openTicketFor = (queue, apptId) => queue.find((e) => e.appointmentId === apptId && !["done", "left"].includes(e.status));

const STUDENT_ID_PATTERN = /^\d{4}-\d{5}$/;
// Letters (any language), spaces, and the punctuation real names use.
const NAME_PATTERN = /^[\p{L}][\p{L} .'-]{1,59}$/u;
const NOTE_MAX = 300;
const MAKEUP_REASON_MIN = 15;

// Course and year level tell apart students who share the exact same name.
const YEAR_LEVELS = [1, 2, 3, 4, 5];
const fmtYear = (y) => `${y}${["st", "nd", "rd"][y - 1] ?? "th"} year`;
const YEAR_WORDS = ["first", "second", "third", "fourth", "fifth"];
const COURSE_MAX = 30;
const COURSE_PATTERN = /^[\p{L}][\p{L}\d .&()-]{1,29}$/u;
// "BSIT · 2nd year", or "" for a record without them.
const studentInfo = (a) => [a.studentCourse, a.studentYear && fmtYear(a.studentYear)].filter(Boolean).join(" · ");

// Booking rules that stop one student from hogging a teacher's calendar.
const MAX_OPEN_REQUESTS = 5;
const BOOKING_WINDOW_DAYS = 30;
const LAST_BOOKABLE_DAY = dateKey(new Date(Date.now() + BOOKING_WINDOW_DAYS * 86400000));
const isSunday = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
};
// The next day after `key` that isn't a Sunday.
const nextOpenDay = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  const next = dateKey(new Date(y, m - 1, d + 1));
  return isSunday(next) ? nextOpenDay(next) : next;
};

const sameName = (a, b) => a.trim().replace(/\s+/g, " ").toLowerCase() === b.trim().replace(/\s+/g, " ").toLowerCase();
const DEFAULT_HOURS = { workStart: "09:00", workEnd: "17:00", lunchStart: "12:00", lunchEnd: "13:00" };

let idCounter = 100;
const uid = (prefix) => `${prefix}-${++idCounter}`;

const byDateTime = (a, b) => a.date.localeCompare(b.date) || a.start - b.start;

const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

const hasStarted = (a) => a.date < TODAY || (a.date === TODAY && a.start <= nowMinutes());

/* ============================ Press feedback ========================== */

// A tiny buzz when a button is tapped on a phone (Android only; no visual effect).
function useTapBuzz(enabled) {
  useEffect(() => {
    if (!enabled) return;
    const down = (e) => {
      if (e.pointerType !== "touch") return;
      const el = e.target.closest("button, .choice");
      if (el && !el.disabled) navigator.vibrate?.(8);
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [enabled]);
}

/* =========================== Student alerts =========================== */

// A three-note chime made on the spot, so there's no sound file to load. Browsers only play sound
// after the person has touched the page, so the first tap anywhere unlocks it.
let audioCtx = null;
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch {
    /* no Web Audio: the banner and vibration still show */
  }
}
function chime() {
  if (audioCtx?.state !== "running") return;
  const t = audioCtx.currentTime;
  [784, 1047, 1319].forEach((freq, i) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const at = t + i * 0.18;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(at);
    osc.stop(at + 0.65);
  });
}

// public/sw.js: phones only show notifications through a service worker.
const registerNoticeWorker = () => navigator.serviceWorker?.register("/sw.js").catch(() => {});

// A notification from the browser, for when the app isn't on screen (the banner covers the rest).
async function systemNotice(title, body, tag) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted" || document.visibilityState === "visible") return;
  const options = { body, tag, icon: "/logo.png", badge: "/logo.png", renotify: true, vibrate: [400, 200, 400] };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, options);
    else new Notification(title, options);
  } catch {
    /* not allowed here, e.g. a site without HTTPS: the in-app banner still shows */
  }
}

// What a student has already been told, per student, on this device.
const SEEN_PREFIX = "apcas-seen-";
function readSeen(studentId) {
  try {
    return JSON.parse(localStorage.getItem(SEEN_PREFIX + studentId.toLowerCase()) || "null");
  } catch {
    return null;
  }
}
function writeSeen(studentId, seen) {
  try {
    localStorage.setItem(SEEN_PREFIX + studentId.toLowerCase(), JSON.stringify(seen));
  } catch {
    /* storage blocked: alerts still work while the page stays open */
  }
}

const describeAppt = (a, data) => {
  const service = (data.services.find((s) => s.id === a.serviceId)?.name ?? "appointment").toLowerCase();
  const teacher = data.providers.find((p) => p.id === a.providerId)?.name ?? "your teacher";
  return `Your ${service} with ${teacher} on ${fmtDate(a.date)}, ${fmtTime(a.start)}`;
};

// Tells a student what changed: approvals, declines and being moved to the end of the line become
// cards they can dismiss, and their turn becomes a banner that chimes and vibrates until they say
// they're on their way. Comparing with what this device last saw means an approval that came while
// the app was closed still shows the next time it's opened.
function useStudentAlerts(user, data, prefs) {
  const studentId = user?.role === "student" ? user.studentId : null;
  const [updates, setUpdates] = useState([]);
  const [ackedTurn, setAckedTurn] = useState(null);
  const seen = useRef(undefined);

  useEffect(() => {
    seen.current = undefined;
    setUpdates([]);
    setAckedTurn(null);
  }, [studentId]);

  useEffect(() => {
    if (!studentId || !data) return;
    const own = data.appointments.filter((a) => !a.hidden);
    const now = {
      appts: Object.fromEntries(own.map((a) => [a.id, a.status])),
      queue: Object.fromEntries(data.queue.map((e) => [e.id, e.missedCount])),
    };
    if (seen.current === undefined) seen.current = readSeen(studentId);
    const before = seen.current;
    seen.current = now;
    writeSeen(studentId, now);
    // First time on this device: nothing to compare with, so nothing is news.
    if (!before) return;

    const fresh = [];
    for (const a of own) {
      const was = before.appts[a.id];
      if (was === a.status) continue;
      // From a request, or new and already approved because the teacher set it up. Not an undo.
      if (a.status === "confirmed" && (was === undefined || was === "booked")) fresh.push({ kind: "approved", appt: a });
      if (a.status === "declined") fresh.push({ kind: "declined", appt: a });
    }
    for (const e of data.queue) {
      if (e.missedCount > (before.queue[e.id] ?? e.missedCount)) fresh.push({ kind: "moved", entry: e });
    }
    if (!fresh.length) return;

    setUpdates((list) => [...fresh.map((u, i) => ({ ...u, key: `${Date.now()}-${i}` })), ...list].slice(0, 4));
    for (const u of fresh) {
      if (u.kind === "approved") systemNotice("Request approved", `${describeAppt(u.appt, data)} was approved. Your receipt is ready.`, `apcas-${u.appt.id}`);
      if (u.kind === "declined") systemNotice("Request declined", `${describeAppt(u.appt, data)} was declined.`, `apcas-${u.appt.id}`);
    }
  }, [data, studentId]);

  // Moved to the end and called again counts as a new call, so it rings again.
  const turn = studentId && data ? data.queue.find((e) => e.status === "called") ?? null : null;
  const turnKey = turn ? `${turn.id}:${turn.missedCount}` : null;
  const ringing = !!turnKey && ackedTurn !== turnKey;

  useEffect(() => {
    if (!ringing) return;
    const ring = () => {
      if (prefs.turnSound) chime();
      navigator.vibrate?.([400, 200, 400, 200, 400]);
    };
    ring();
    systemNotice("It's your turn", `Ticket ${turn.ticket}: your teacher is calling you now. Please go in.`, "apcas-turn");
    const timer = setInterval(ring, 12000);
    // The tab title blinks too, for a student looking at another tab.
    const title = document.title;
    let flip = false;
    const blink = setInterval(() => {
      flip = !flip;
      document.title = flip ? "🔔 Your turn!" : title;
    }, 1000);
    return () => {
      clearInterval(timer);
      clearInterval(blink);
      document.title = title;
    };
  }, [ringing, turnKey]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    turn,
    ringing,
    acknowledge: () => setAckedTurn(turnKey),
    updates,
    dismiss: (key) => setUpdates((list) => list.filter((u) => u.key !== key)),
  };
}

function StudentNotices({ alerts, data, roomById, onViewReceipt, onViewAppointments }) {
  const { turn, ringing, acknowledge, updates, dismiss } = alerts;
  const teacherName = (id) => data.providers.find((p) => p.id === id)?.name ?? "Your teacher";
  const turnAppt = turn && data.appointments.find((a) => a.id === turn.appointmentId);
  const room = roomLabel(roomById[turnAppt?.roomId]);

  const card = (u) => {
    // Only the one for this card is built: each reads fields only its own kind has.
    const kinds = {
      approved: () => ({
        tone: "success",
        icon: "check",
        title: "Request approved",
        text: `${describeAppt(u.appt, data)} was approved. Your official receipt is ready.`,
        action: { label: "View receipt", run: () => onViewReceipt(u.appt.id) },
      }),
      declined: () => ({
        tone: "error",
        icon: "alert",
        title: "Request declined",
        text: `${describeAppt(u.appt, data)} was declined.${u.appt.teacherNote ? ` Reason: ${u.appt.teacherNote}` : ""}`,
        action: { label: "See my appointments", run: onViewAppointments },
      }),
      moved: () => ({
        tone: "warning",
        icon: "alert",
        title: "Moved to the end of the line",
        text: `You weren't there when ticket ${u.entry.ticket} was called, so you were moved to the end of the line. Stay close by.`,
      }),
    };
    const k = kinds[u.kind]();
    return (
      <div key={u.key} className={`notice notice-${k.tone}`}>
        <Icon name={k.icon} />
        <div className="notice-body">
          <p className="notice-title">{k.title}</p>
          <p>{k.text}</p>
          {k.action && (
            <div className="notice-actions">
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => {
                  dismiss(u.key);
                  k.action.run();
                }}
              >
                {k.action.label}
              </button>
            </div>
          )}
        </div>
        <button className="notice-close" aria-label="Dismiss" onClick={() => dismiss(u.key)}>
          <Icon name="x" />
        </button>
      </div>
    );
  };

  return (
    <>
      {turn && (
        <div className={`turn-banner no-print ${ringing ? "is-ringing" : ""}`} role="alert">
          <span className="turn-icon" aria-hidden="true">
            <Icon name="bell" />
          </span>
          <div className="turn-text">
            <p className="turn-title">It's your turn</p>
            <p>
              Ticket <strong className="turn-ticket">{turn.ticket}</strong>: {teacherName(turn.providerId)} is calling you now
              {room ? ` in ${room}` : ""}. Please go in.
            </p>
          </div>
          {ringing ? (
            <button className="btn btn-lg turn-btn" onClick={acknowledge}>
              I'm on my way
            </button>
          ) : (
            <span className="turn-ack">
              <Icon name="check" /> On your way
            </span>
          )}
        </div>
      )}
      {updates.length > 0 && <div className="notice-stack no-print">{updates.map(card)}</div>}
    </>
  );
}

/* =============================== App ================================== */

// `short` is the label under the icon in the phone tab bar.
const STUDENT_TABS = [
  { id: "book", label: "Book an appointment", short: "Book", icon: "calendarPlus" },
  { id: "mine", label: "My appointments", short: "My appts", icon: "list" },
  { id: "receipts", label: "Receipts", short: "Receipts", icon: "receipt" },
  { id: "profile", label: "Profile", short: "Profile", icon: "user" },
];

const TEACHER_TABS = [
  { id: "requests", label: "Requests", short: "Requests", icon: "inbox" },
  { id: "assign", label: "Schedule a student", short: "Schedule", icon: "calendarPlus" },
  { id: "queue", label: "Queue", short: "Queue", icon: "users" },
  { id: "hours", label: "My hours", short: "Hours", icon: "clock" },
  { id: "services", label: "Booking types", short: "Types", icon: "tag" },
  { id: "profile", label: "Profile", short: "Profile", icon: "user" },
];

const ADMIN_TABS = [
  { id: "overview", label: "Overview", short: "Overview", icon: "chart" },
  { id: "records", label: "Records", short: "Records", icon: "search" },
  { id: "accounts", label: "Accounts", short: "Accounts", icon: "users" },
  { id: "rooms", label: "Rooms", short: "Rooms", icon: "door" },
  { id: "reports", label: "Reports & history", short: "Reports", icon: "file" },
  { id: "profile", label: "Profile", short: "Profile", icon: "user" },
];

const TABS_FOR = { student: STUDENT_TABS, teacher: TEACHER_TABS, admin: ADMIN_TABS };
const FIRST_TAB = { student: "book", teacher: "requests", admin: "overview" };

const sameStudent = (a, studentId) => a.studentId.toLowerCase() === studentId.toLowerCase();

// How often every open screen asks the server for changes, so new bookings, approvals,
// schedule changes and queue moves show up for everyone without a refresh.
const POLL_MS = 4000;
const OFFLINE_MESSAGE = "Can't reach the server. Check that Apache and MySQL are running in XAMPP.";
const EMPTY_DATA = { providers: [], services: [], rooms: [], appointments: [], queue: [], students: [], users: [], activity: [] };

// Proof files go to the server as data URLs inside the JSON request.
const filesPayload = (files = []) =>
  Promise.all(
    files
      .filter((f) => f.file)
      .map(
        (f) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: f.name, data: reader.result });
            reader.onerror = () => reject(new Error(`"${f.name}" could not be read. Attach it again.`));
            reader.readAsDataURL(f.file);
          })
      )
  );

export default function App() {
  // null until someone signs in; then the user from the server: { role: "student" | "teacher" | "admin", ... }
  const [user, setUser] = useState(null);
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  useTapBuzz(prefs.vibration);
  const [tab, setTab] = useState("book");
  // Everything from the server for this user; null until the first load after signing in.
  const [data, setData] = useState(null);
  const { providers, services, rooms, appointments, queue } = data ?? EMPTY_DATA;
  const [syncedAt, setSyncedAt] = useState(null);
  const [offline, setOffline] = useState(false);
  // { id, text, undo?: { appointments, queue, addedQueueIds, addedApptIds } }
  const [toast, setToast] = useState(null);
  // { title, message, confirmLabel, cancelLabel, reasonLabel?, onConfirm(reason) }
  const [confirmRequest, setConfirmRequest] = useState(null);
  // The receipt a student has open, and the receipt number a teacher is checking ({ ref } while open).
  const [receiptId, setReceiptId] = useState(null);
  const [verify, setVerify] = useState(null);
  // A receipt QR code opens the site with ?verify=<number>; it waits here until a teacher is signed in.
  const verifyFromLink = useRef(new URLSearchParams(window.location.search).get("verify"));
  const alerts = useStudentAlerts(user, data, prefs);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), toast.undo ? 8000 : 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const providerById = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);
  const serviceById = useMemo(() => Object.fromEntries(services.map((s) => [s.id, s])), [services]);
  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  const notify = (text, extra = {}) => setToast({ id: Date.now(), text, ...extra });

  /* ---------------------------- Server sync ---------------------------- */

  // Polls and actions can finish out of order; an older answer must never overwrite a newer one.
  const version = useRef("");
  const sent = useRef(0);
  const applied = useRef(0);

  const apply = (ticket, res) => {
    if (ticket < applied.current) return;
    applied.current = ticket;
    if (res.state) setData(res.state);
    version.current = res.version ?? version.current;
    setSyncedAt(new Date());
    setOffline(false);
  };

  const endSession = () => {
    setUser(null);
    setData(null);
    setToast(null);
    setReceiptId(null);
    setVerify(null);
    version.current = "";
  };

  // One poll at a time: when the server is slow, the next tick waits instead of piling up requests.
  const polling = useRef(false);
  const refresh = async () => {
    if (polling.current) return;
    polling.current = true;
    const ticket = ++sent.current;
    try {
      const res = await api(`state.php?v=${version.current}`);
      // Past midnight the page's "today" is out of date; start over from the new day. (Compared with
      // this computer's own date, so a different time zone from the server's can't make it reload in a loop.)
      if (dateKey(new Date()) !== TODAY) return window.location.reload();
      apply(ticket, res);
    } catch (err) {
      if (err.status === 401) endSession();
      else setOffline(true);
    } finally {
      polling.current = false;
    }
  };

  // Sends one change; the answer carries everyone's latest data. Returns the answer, or null after showing the problem.
  const act = async (body, path = "actions.php") => {
    const ticket = ++sent.current;
    try {
      const res = await api(path, body);
      apply(ticket, res);
      return res;
    } catch (err) {
      if (err.status === 401) endSession();
      else {
        notify(err.message === "Failed to fetch" ? OFFLINE_MESSAGE : err.message);
        refresh();
      }
      return null;
    }
  };

  // A student waiting in line keeps checking while the app is in the background, so their turn
  // still reaches them (browsers slow background timers down, but don't stop them).
  const inLine = useRef(false);
  inLine.current = user?.role === "student" && queue.some((e) => ["waiting", "called"].includes(e.status));

  useEffect(() => {
    if (!user) return;
    refresh();
    const tick = () => (document.visibilityState === "visible" || inLine.current) && refresh();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
      window.removeEventListener("focus", tick);
    };
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ Changes ------------------------------ */

  // Undo keeps copies of only the records an action touched, so anything done
  // afterwards (a new booking, another status change) survives the undo.
  const undoFor = ({ apptIds = [], queueIds = [], addedQueueIds = [], addedApptIds = [] }) => ({
    appointments: appointments.filter((a) => apptIds.includes(a.id)),
    queue: queue.filter((e) => queueIds.includes(e.id)),
    addedQueueIds,
    addedApptIds,
  });

  const undo = async () => {
    if (!toast?.undo) return;
    const { appointments: prevAppts, queue: prevQueue, addedQueueIds = [], addedApptIds = [] } = toast.undo;
    setToast(null);
    const res = await act({
      action: "undo",
      appointments: prevAppts.map((a) => ({ id: a.id, status: a.status, teacherNote: a.teacherNote ?? "" })),
      queue: prevQueue.map((e) => ({ id: e.id, status: e.status, queuedAt: e.queuedAt, missedCount: e.missedCount })),
      addedQueueIds,
      addedApptIds,
    });
    if (res) notify("Change undone.");
  };

  const isStudent = user?.role === "student";
  const isAdmin = user?.role === "admin";

  // Resolves to true once the request is saved.
  const addAppointment = async (appt) => {
    let attachments;
    try {
      attachments = await filesPayload(appt.attachments);
    } catch (err) {
      notify(err.message);
      return false;
    }
    const { providerId, serviceId, date, start, note } = appt;
    return !!(await act({ action: "book", providerId, serviceId, date, start, note, attachments }));
  };

  // A teacher setting the time for one student or a whole class: no approval step, it starts out approved.
  // `newService` is a booking type typed in on the spot; unless it's `oneOff`, students can book it from now on too.
  const assignAppointments = async (appts, newService = null) => {
    const [first] = appts;
    let attachments;
    try {
      attachments = await filesPayload(first.teacherAttachments);
    } catch (err) {
      notify(err.message);
      return false;
    }
    const res = await act({
      action: "assign",
      students: appts.map(({ studentName, studentId, studentCourse, studentYear }) => ({ studentName, studentId, studentCourse, studentYear })),
      serviceId: first.serviceId,
      newService: newService && { name: newService.name, duration: newService.duration, save: !newService.oneOff },
      date: first.date,
      start: first.start,
      roomId: first.roomId,
      teacherNote: first.teacherNote ?? "",
      groupLabel: first.groupLabel ?? "",
      attachments,
    });
    if (!res) return false;
    const who = appts.length === 1 ? first.studentName : `${appts.length} students in ${first.groupLabel}`;
    notify(`${who} ${appts.length === 1 ? "is" : "are"} scheduled for ${fmtDate(first.date)}, ${fmtRange(first.start, first.end)} in ${roomById[first.roomId]?.name ?? "the room you chose"}.`, {
      undo: { appointments: [], queue: [], addedQueueIds: [], addedApptIds: res.created.appointments },
    });
    return true;
  };

  const changeAppointmentStatus = async (apptId, to, teacherNote = "") => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt || !APPT_NEXT[appt.status].includes(to)) return;
    const before = undoFor({
      apptIds: [apptId],
      queueIds: queue.filter((e) => e.appointmentId === apptId).map((e) => e.id),
    });
    const res = await act({ action: "appt_status", id: apptId, to, reason: teacherNote });
    if (!res) return;
    before.addedQueueIds = res.created?.queue ?? [];
    if (to === "checked_in") return notify(`${appt.studentName} is checked in${res.message}.`, { undo: before });
    const service = (serviceById[appt.serviceId]?.name ?? "appointment").toLowerCase();
    const subject = isStudent ? `Your ${service}` : `${appt.studentName}'s ${service}`;
    notify(`${subject} on ${fmtDate(appt.date)} was ${APPT_DONE[to]}.`, { undo: before });
  };

  // Checking in moves the appointment to "checked in" and puts the student in the queue.
  const checkIn = (apptId) => changeAppointmentStatus(apptId, "checked_in");

  const changeQueueStatus = async (entryId, to) => {
    const entry = queue.find((e) => e.id === entryId);
    if (!entry || !QUEUE_NEXT[entry.status].includes(to)) return;
    const before = undoFor({ apptIds: entry.appointmentId ? [entry.appointmentId] : [], queueIds: [entryId] });
    if (!(await act({ action: "queue_status", id: entryId, to }))) return;
    notify(
      to === "called" ? `Calling ${entry.ticket}: ${entry.name}.` : `${entry.ticket} (${entry.name}) ${QUEUE_DONE[to]}.`,
      { undo: before }
    );
  };

  // Not there when called: back to waiting, behind everyone who is in line now.
  const moveToEnd = async (entryId) => {
    const entry = queue.find((e) => e.id === entryId);
    if (!entry) return;
    const before = undoFor({ queueIds: [entryId] });
    if (!(await act({ action: "queue_requeue", id: entryId }))) return;
    notify(`${entry.ticket} (${entry.name}) was moved to the end of the line.`, { undo: before });
  };

  const callNext = async () => {
    const next = queue.find((e) => e.status === "waiting");
    const before = undoFor({ queueIds: next ? [next.id] : [] });
    const res = await act({ action: "call_next" });
    if (res) notify(`Calling ${res.called.ticket}: ${res.called.name}.`, { undo: before });
  };

  const addWalkIn = async (name) => {
    const res = await act({ action: "walk_in", name });
    if (res) notify(`${name} was added to the line with ticket ${res.ticket}.`, { undo: undoFor({ addedQueueIds: res.created.queue }) });
  };

  // Which way the new page slides in: 1 = from the right, -1 = from the left, 0 = fade up.
  const [direction, setDirection] = useState(0);

  const go = (next) => {
    if (next === tab) return;
    const order = (TABS_FOR[user?.role] ?? STUDENT_TABS).map((t) => t.id);
    setDirection(order.indexOf(next) > order.indexOf(tab) ? 1 : -1);
    setTab(next);
  };

  const signIn = (who) => {
    setDirection(0);
    setUser(who);
    setTab(FIRST_TAB[who.role]);
    const ref = verifyFromLink.current;
    if (!ref) return;
    verifyFromLink.current = null;
    window.history.replaceState(null, "", window.location.pathname);
    if (who.role === "student") {
      setTab("receipts");
      notify("Receipts are checked by teachers. Show this code to your teacher when you arrive.");
    } else {
      if (who.role === "teacher") setTab("queue");
      setVerify({ ref });
    }
  };

  const openReceipt = (id) => {
    setReceiptId(id);
    go("receipts");
  };

  // Sound needs one tap on the page first; notifications need the helper that phones use.
  useEffect(() => {
    if (user?.role !== "student") return;
    document.addEventListener("pointerdown", unlockAudio);
    document.addEventListener("keydown", unlockAudio);
    return () => {
      document.removeEventListener("pointerdown", unlockAudio);
      document.removeEventListener("keydown", unlockAudio);
    };
  }, [user]);
  useEffect(() => {
    if (prefs.notifications) registerNoticeWorker();
  }, [prefs.notifications]);

  // Stay signed in across a page refresh while the PHP session lasts.
  // The login page waits for this check so it doesn't flash before a signed-in user's pages.
  const [sessionChecked, setSessionChecked] = useState(false);
  useEffect(() => {
    api("me.php")
      .then(({ user: who }) => who && signIn(who))
      .catch(() => {})
      .finally(() => setSessionChecked(true));
  }, []);

  const signOut = () => {
    api("logout.php", {}).catch(() => {});
    setDirection(0);
    endSession();
  };

  const pageKey = user ? `${user.role}-${tab}` : "signin";

  // After moving to another page: start at the top and move focus to its heading for screen readers.
  const firstPage = useRef(true);
  useEffect(() => {
    if (firstPage.current) {
      firstPage.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    document.querySelector(".page-title")?.focus({ preventScroll: true });
  }, [pageKey]);

  // The underline under the current nav item slides between items.
  const navRef = useRef(null);
  const [indicator, setIndicator] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = navRef.current?.querySelector('[aria-current="page"]');
      const next = el ? { left: el.offsetLeft, width: el.offsetWidth } : null;
      // Keep the same object when nothing moved, so this runs after every render without looping.
      setIndicator((prev) => (prev?.left === next?.left && prev?.width === next?.width ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });

  const teacher = user?.role === "teacher" ? providerById[user.providerId] : null;

  // Each side only ever sees its own slice of the data.
  const myAppointments = useMemo(() => {
    if (!user || isAdmin) return [];
    return appointments.filter((a) =>
      user.role === "student" ? !a.hidden && sameStudent(a, user.studentId) : a.providerId === user.providerId
    );
  }, [appointments, user, isAdmin]);
  const myQueue = useMemo(() => (teacher ? queue.filter((e) => e.providerId === teacher.id) : []), [queue, teacher]);

  const tabs = TABS_FOR[user?.role] ?? STUDENT_TABS;
  const badges = isStudent
    ? { mine: { count: myAppointments.filter((a) => ACTIVE.has(a.status)).length, label: "active" } }
    : isAdmin
      ? {}
      : {
          requests: { count: myAppointments.filter((a) => a.status === "booked").length, label: "waiting for approval" },
          queue: { count: myQueue.filter((e) => e.status === "waiting").length, label: "waiting in line" },
        };

  const appProps = {
    className: "app",
    "data-text": prefs.textSize,
    "data-motion": prefs.reduceMotion ? "reduce" : undefined,
    "data-contrast": prefs.highContrast ? "high" : undefined,
  };

  // Signed out: the login page on its own, without the header and tabs.
  if (!user)
    return (
      <div {...appProps}>
        <style>{CSS}</style>
        {sessionChecked && <LoginPage onSignIn={signIn} />}
      </div>
    );

  const roleName = { student: "student", teacher: "teacher", admin: "administrator" }[user.role];
  const displayName = isStudent ? `${user.name} (${user.studentId})` : isAdmin ? user.name : teacher?.name;

  return (
    <div {...appProps}>
      <style>{CSS}</style>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <img
              src="/logo.png"
              alt=""
              className="brand-logo"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            <div>
              <p className="brand-school">Asia Pacific College of Advanced Studies</p>
              <h1 className="brand-title">Appointments &amp; Queue</h1>
            </div>
          </div>
          <div className="who">
            <div className="who-text">
              <span className="who-role">Signed in as {roleName}</span>
              <span className="who-name">{displayName}</span>
            </div>
            <button
              className={`avatar-btn ${tab === "profile" ? "is-current" : ""}`}
              onClick={() => go("profile")}
              aria-label="Profile and settings"
              title="Profile and settings"
            >
              <span className="avatar" aria-hidden="true">
                {initials(isStudent || isAdmin ? user.name : teacher?.name ?? "")}
              </span>
            </button>
          </div>
        </div>
      </header>

      <nav className="nav" aria-label="Main">
        <div className="nav-inner" ref={navRef}>
          {indicator && (
            <span
              className="nav-indicator"
              aria-hidden="true"
              style={{ width: indicator.width, transform: `translateX(${indicator.left}px)` }}
            />
          )}
          {tabs.filter((t) => t.id !== "profile").map((t) => {
            const badge = badges[t.id];
            return (
              <button
                key={t.id}
                className={`nav-item ${tab === t.id ? "is-current" : ""}`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => go(t.id)}
              >
                {t.label}
                {badge?.count > 0 && (
                  <span className="nav-count">
                    {badge.count}
                    <span className="sr-only"> {badge.label}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Phones: app-style tabs at the bottom, within thumb reach. */}
      <nav className="tabbar" aria-label="Main">
        {tabs.map((t) => {
          const badge = badges[t.id];
          return (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? "is-current" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => go(t.id)}
            >
              <Icon name={t.icon} />
              <span className="tab-label">{t.short}</span>
              {badge?.count > 0 && (
                <span className="tab-count">
                  {badge.count}
                  <span className="sr-only"> {badge.label}</span>
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <main id="main" className="main" tabIndex={-1}>
        {data && isStudent && (
          <StudentNotices alerts={alerts} data={data} roomById={roomById} onViewReceipt={openReceipt} onViewAppointments={() => go("mine")} />
        )}
        {/* Keyed by page, so each page change replays the entrance animation. */}
        <div className="page" key={pageKey} data-dir={direction}>
          {!data && tab !== "profile" && (
            <EmptyState title={offline ? OFFLINE_MESSAGE : "Loading…"}>
              {offline && (
                <button className="link" onClick={refresh}>
                  Try again
                </button>
              )}
            </EmptyState>
          )}

          {data && isStudent && tab === "book" && (
            <BookSection
              student={user}
              providers={providers}
              providerById={providerById}
              serviceById={serviceById}
              roomById={roomById}
              appointments={appointments}
              onBook={addAppointment}
              goToAppointments={() => go("mine")}
            />
          )}
          {data && isStudent && tab === "mine" && (
            <MyAppointmentsSection
              appointments={myAppointments}
              queue={queue}
              providerById={providerById}
              serviceById={serviceById}
              roomById={roomById}
              onCancel={(id) => changeAppointmentStatus(id, "cancelled")}
              onViewReceipt={openReceipt}
              confirm={setConfirmRequest}
              goToBook={() => go("book")}
            />
          )}
          {data && isStudent && tab === "receipts" && (
            <ReceiptsSection
              student={user}
              appointments={myAppointments}
              queue={queue}
              providerById={providerById}
              serviceById={serviceById}
              roomById={roomById}
              selectedId={receiptId}
              onSelect={setReceiptId}
              notify={notify}
              goToAppointments={() => go("mine")}
            />
          )}

          {teacher && tab === "requests" && (
            <RequestsSection
              appointments={myAppointments}
              serviceById={serviceById}
              roomById={roomById}
              teacher={teacher}
              onChangeStatus={changeAppointmentStatus}
              confirm={setConfirmRequest}
              goToAssign={() => go("assign")}
            />
          )}
          {teacher && tab === "assign" && (
            <AssignSection
              teacher={teacher}
              serviceById={serviceById}
              providerById={providerById}
              rooms={rooms}
              appointments={appointments}
              registered={data.students ?? []}
              onAssign={assignAppointments}
              goToRequests={() => go("requests")}
              goToHours={() => go("hours")}
            />
          )}
          {teacher && tab === "queue" && (
            <QueueSection
              queue={myQueue}
              appointments={myAppointments}
              serviceById={serviceById}
              onCheckIn={checkIn}
              onAddWalkIn={addWalkIn}
              onCallNext={callNext}
              onChangeStatus={changeQueueStatus}
              onMoveToEnd={moveToEnd}
              onVerify={() => setVerify({ ref: "" })}
              confirm={setConfirmRequest}
              goToRequests={() => go("requests")}
            />
          )}
          {teacher && tab === "hours" && (
            <HoursSection
              teacher={teacher}
              appointments={myAppointments}
              serviceById={serviceById}
              onSave={async (hours) => {
                const res = await act({ action: "save_hours", hours });
                if (res)
                  notify(
                    `Your hours were saved. Students now see the new times${res.conflicts ? `; ${res.conflicts} open appointment${res.conflicts > 1 ? "s are" : " is"} outside them` : ""}.`
                  );
                return !!res;
              }}
              goToServices={() => go("services")}
            />
          )}
          {teacher && tab === "services" && (
            <ServicesSection
              teacher={teacher}
              services={services}
              serviceById={serviceById}
              appointments={myAppointments}
              confirm={setConfirmRequest}
              onSaveService={async (service, replaceId) => {
                if (await act({ action: "save_service", service, replaceId })) notify(`"${service.name}" is saved. Students can book it now.`);
              }}
              onSetOffered={async (serviceIds, message) => {
                if ((await act({ action: "set_offered", serviceIds })) && message) notify(message);
              }}
            />
          )}

          {data && isAdmin && tab === "overview" && (
            <AdminOverview data={data} providerById={providerById} roomById={roomById} syncedAt={syncedAt} goTo={go} />
          )}
          {data && isAdmin && tab === "records" && (
            <AdminRecords data={data} providerById={providerById} serviceById={serviceById} roomById={roomById} act={act} notify={notify} onVerify={() => setVerify({ ref: "" })} />
          )}
          {data && isAdmin && tab === "accounts" && (
            <AdminAccounts data={data} me={user} act={act} notify={notify} confirm={setConfirmRequest} />
          )}
          {data && isAdmin && tab === "rooms" && (
            <AdminRooms data={data} providerById={providerById} serviceById={serviceById} roomById={roomById} act={act} notify={notify} confirm={setConfirmRequest} />
          )}
          {data && isAdmin && tab === "reports" && (
            <AdminReports data={data} providerById={providerById} serviceById={serviceById} roomById={roomById} />
          )}

          {tab === "profile" && (
            <ProfileSection
              user={user}
              teacher={teacher}
              prefs={prefs}
              setPrefs={setPrefs}
              onLogout={signOut}
              confirm={setConfirmRequest}
              notify={notify}
            />
          )}
        </div>
      </main>

      <footer className="footer">
        <span className={`live ${offline ? "is-offline" : ""}`}>
          <span className="live-dot" aria-hidden="true" />
          {offline
            ? "Can't reach the server. Retrying…"
            : syncedAt
              ? `Live: updates every few seconds · last checked ${syncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
              : "Connecting…"}
        </span>
      </footer>

      <div className="toast-region" aria-live="polite">
        {toast && (
          <div className="toast" key={toast.id}>
            <span className="toast-text">{toast.text}</span>
            {toast.undo && (
              <button className="toast-action" onClick={undo}>
                Undo
              </button>
            )}
            <button className="toast-close" aria-label="Dismiss message" onClick={() => setToast(null)}>
              <Icon name="x" />
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog request={confirmRequest} onClose={() => setConfirmRequest(null)} />
      {(teacher || isAdmin) && (
        <VerifyReceiptDialog
          request={verify}
          onClose={() => setVerify(null)}
          onCheckIn={teacher ? checkIn : null}
        />
      )}
    </div>
  );
}

/* ============================ Shared bits ============================= */

const ICONS = {
  x: "M6 6l12 12M18 6L6 18",
  check: "M5 12.5l4.5 4.5L19 7.5",
  alert: "M12 8v5M12 16.5v.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z",
  info: "M12 11v5M12 7.5v.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4",
  chevron: "M6 9l6 6 6-6",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
  clip: "M20 11.5l-8.2 8.2a4.6 4.6 0 0 1-6.5-6.5l8.6-8.6a3 3 0 0 1 4.3 4.3l-8.6 8.6a1.5 1.5 0 0 1-2.1-2.1l7.9-7.9",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4",
  calendarPlus: "M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM12 12v5M9.5 14.5h5",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  inbox: "M4 13l2.5-7.5A1 1 0 0 1 7.4 5h9.2a1 1 0 0 1 .9.5L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4.5l1.5 2.5h4l1.5-2.5H20",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 4.5a3.5 3.5 0 0 1 0 6.5M21 20a6 6 0 0 0-4-5.6",
  tag: "M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9zM7.5 7.5h.01",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  eyeOff: "M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  dot: "M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  chart: "M4 20h16M7 16v-5M12 16V6M17 16v-8",
  door: "M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18M14.5 12.5h.01",
  download: "M12 4v11M7 10.5l5 5 5-5M5 20h14",
  printer: "M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v6H7z",
  plus: "M12 5v14M5 12h14",
  receipt: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3",
  bell: "M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  shield: "M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6zM9 12l2 2 4-4",
  copy: "M9 9h10v11H9zM5 15V4h10",
};

// One icon style everywhere: 24px grid, 2px stroke, round caps.
function Icon({ name }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

function PageHeader({ title, description, actions }) {
  return (
    <div className="page-head">
      <div>
        <h2 className="page-title" tabIndex={-1}>
          {title}
        </h2>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

// Dot + text, so status never relies on colour alone.
function Status({ tone, children }) {
  return (
    <span className={`status status-${tone}`}>
      <span className="status-dot" aria-hidden="true" />
      {children}
    </span>
  );
}

const ALERT_ICON = { error: "alert", warning: "alert", success: "check", info: "info" };

function Alert({ tone, title, children }) {
  return (
    <div className={`alert alert-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={ALERT_ICON[tone]} />
      <div>
        {title && <p className="alert-title">{title}</p>}
        {children}
      </div>
    </div>
  );
}

function EmptyState({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <div className="empty-body">{children}</div>}
    </div>
  );
}

// Label, hint and error wired to the control via id / aria-describedby.
function Field({ label, hint, error, children, className = "" }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className}`}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="field-error">
          {error}
        </p>
      )}
    </div>
  );
}

/* ---------------------------- Attachments ----------------------------- */

// Proof files students can attach (a doctor's slip, an excuse letter): photos and PDFs only.
const ATTACH_TYPES = { "image/jpeg": "JPG", "image/png": "PNG", "application/pdf": "PDF" };
const ATTACH_EXTENSIONS = /\.(jpe?g|png|pdf)$/i;
const ATTACH_ACCEPT = ".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf";
const ATTACH_MAX_FILES = 3;
const ATTACH_MAX_MB = 5;

const fmtSize = (bytes) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

// Checks picked files against the rules; returns the ones to keep and a plain-language problem for the rest.
function checkFiles(files, already) {
  const keep = [];
  const problems = [];
  for (const f of files) {
    if (!ATTACH_TYPES[f.type] && !ATTACH_EXTENSIONS.test(f.name)) problems.push(`"${f.name}" isn't a JPG, PNG or PDF.`);
    else if (f.size > ATTACH_MAX_MB * 1024 * 1024) problems.push(`"${f.name}" is ${fmtSize(f.size)}. Files can be up to ${ATTACH_MAX_MB} MB.`);
    else if (already.length + keep.length >= ATTACH_MAX_FILES) problems.push(`You can attach up to ${ATTACH_MAX_FILES} files. "${f.name}" was left out.`);
    else if (already.some((a) => a.name === f.name && a.size === f.size)) problems.push(`"${f.name}" is already attached.`);
    else keep.push(f);
  }
  return { keep, problem: problems.join(" ") };
}

// A preview from this browser until the request is sent; `file` is uploaded with it.
const toAttachment = (f) => ({
  id: uid("file"),
  name: f.name,
  size: f.size,
  isPdf: f.type === "application/pdf" || /\.pdf$/i.test(f.name),
  url: URL.createObjectURL(f),
  file: f,
});

function AttachmentThumb({ file }) {
  return file.isPdf ? (
    <span className="file-thumb file-thumb-pdf">
      <Icon name="file" />
      <span>PDF</span>
    </span>
  ) : (
    <img className="file-thumb" src={file.url} alt="" />
  );
}

// Drop zone + file picker + list of attached files.
function AttachmentPicker({ files, onChange, labelId }) {
  const inputRef = useRef(null);
  const [problem, setProblem] = useState("");
  const [dragging, setDragging] = useState(false);

  const add = (list) => {
    const { keep, problem: why } = checkFiles([...list], files);
    setProblem(why);
    if (keep.length) onChange([...files, ...keep.map(toAttachment)]);
  };

  const remove = (file) => {
    URL.revokeObjectURL(file.url);
    onChange(files.filter((f) => f.id !== file.id));
    setProblem("");
  };

  const full = files.length >= ATTACH_MAX_FILES;

  return (
    <div className="attach">
      {!full && (
        <div
          className={`drop ${dragging ? "is-dragging" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add(e.dataTransfer.files);
          }}
        >
          <Icon name="clip" />
          <div className="drop-text">
            <button type="button" className="link" onClick={() => inputRef.current.click()} aria-describedby={labelId}>
              <span className="on-touch">Take a photo or choose a file</span>
              <span className="on-mouse">Choose a photo or PDF</span>
            </button>{" "}
            <span className="hint on-mouse">or drag it here</span>
            <p className="hint">
              JPG, PNG or PDF · max {ATTACH_MAX_MB} MB
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ATTACH_ACCEPT}
            multiple
            hidden
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
      )}
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      {files.length > 0 && (
        <ul className="file-list" aria-label="Attached files">
          {files.map((f) => (
            <li key={f.id} className="file-item">
              <a href={f.url} target="_blank" rel="noreferrer" className="file-open" title="Open in a new tab">
                <AttachmentThumb file={f} />
              </a>
              <div className="file-info">
                <a href={f.url} target="_blank" rel="noreferrer" className="file-name">
                  {f.name}
                </a>
                <span className="hint">{fmtSize(f.size)}</span>
              </div>
              <button type="button" className="btn btn-sm btn-secondary" onClick={() => remove(f)} aria-label={`Remove ${f.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Read-only list of attached files, for teachers and for the student's own list.
function AttachmentList({ files, label = "Proof attached" }) {
  if (!files?.length) return null;
  return (
    <div className="file-view">
      <span className="quote-label">{label}</span>
      <ul className="file-grid">
        {files.map((f) => (
          <li key={f.id}>
            <a href={f.url} target="_blank" rel="noreferrer" className="file-card" title={`Open ${f.name} in a new tab`}>
              <AttachmentThumb file={f} />
              <span className="file-card-name">{f.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Lowercase without accents, so "pena" finds "Peñaranda".
const fold = (text) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Bolds the part of `text` that matches what was typed.
function Highlight({ text, query }) {
  const at = query ? fold(text).indexOf(fold(query.trim())) : -1;
  if (at < 0 || !query.trim()) return text;
  const end = at + query.trim().length;
  return (
    <>
      {text.slice(0, at)}
      <mark>{text.slice(at, end)}</mark>
      {text.slice(end)}
    </>
  );
}

/*
  A text box with a suggestion list underneath (WAI-ARIA combobox pattern).
  Type to narrow the list, or open it with the arrow / ↓ key to browse.
  options: [{ key, label, sub?, group?, disabled?, reason? }]
*/
function Combobox({
  value, onChange, options, onSelect, selectedKey, focusKey,
  query = value, placeholder, icon, emptyText = "No matches.", countLabel, clearable = false, ...inputProps
}) {
  const listId = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const enabled = options.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  // On open, start at the chosen (or closest) option instead of the top of a long list.
  const openList = () => {
    const at = options.findIndex((o) => o.key === (focusKey ?? selectedKey));
    setActive(at >= 0 && !options[at].disabled ? at : enabled[0] ?? -1);
    setOpen(true);
  };

  useEffect(() => {
    if (open) {
      const at = options.findIndex((o) => o.key === focusKey);
      setActive(at >= 0 && !options[at].disabled ? at : enabled[0] ?? -1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, focusKey]);

  useLayoutEffect(() => {
    if (open && active >= 0) listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const choose = (o) => {
    if (!o || o.disabled) return;
    onSelect(o);
    setOpen(false);
  };

  const move = (step) => {
    if (!open) return openList();
    if (enabled.length === 0) return;
    const pos = enabled.indexOf(active);
    setActive(enabled[(pos + step + enabled.length) % enabled.length]);
  };

  const onKeyDown = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" && open && active >= 0) { e.preventDefault(); choose(options[active]); }
    else if (e.key === "Escape" && open) { e.preventDefault(); setOpen(false); }
  };

  let lastGroup;
  return (
    <div className={`combo ${open ? "is-open" : ""} ${icon ? "has-icon" : ""}`}>
      {icon && <span className="combo-icon"><Icon name={icon} /></span>}
      <input
        {...inputProps}
        ref={inputRef}
        type="text"
        role="combobox"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        placeholder={placeholder}
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={(e) => {
          inputProps.onFocus?.(e);
          openList();
          if (window.matchMedia("(max-width: 680px)").matches)
            setTimeout(() => inputRef.current?.scrollIntoView({ block: "start", behavior: "smooth" }), 300);
        }}
        onClick={() => !open && openList()}
        onBlur={(e) => { inputProps.onBlur?.(e); setOpen(false); }}
        onKeyDown={onKeyDown}
      />
      {clearable && value && (
        <button
          type="button"
          className="combo-btn combo-clear"
          aria-label="Clear"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => { onChange(""); inputRef.current.focus(); setOpen(true); }}
        >
          <Icon name="x" />
        </button>
      )}
      <button
        type="button"
        className="combo-btn combo-toggle"
        aria-label={open ? "Hide suggestions" : "Show suggestions"}
        tabIndex={-1}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { if (open) setOpen(false); else { inputRef.current.focus(); openList(); } }}
      >
        <Icon name="chevron" />
      </button>

      {open && (
        <div className="combo-pop" onMouseDown={(e) => e.preventDefault()}>
          {countLabel && <p className="combo-count">{countLabel}</p>}
          <ul id={listId} ref={listRef} role="listbox" className="combo-list">
            {options.length === 0 && <li className="combo-empty">{emptyText}</li>}
            {options.map((o, i) => {
              const header = o.group && o.group !== lastGroup ? o.group : null;
              lastGroup = o.group;
              return (
                <li key={o.key} role="presentation">
                  {header && <p className="combo-group" aria-hidden="true">{header}</p>}
                  <div
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={o.key === selectedKey}
                    aria-disabled={o.disabled || undefined}
                    className={`combo-option ${i === active ? "is-active" : ""}`}
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onClick={() => choose(o)}
                  >
                    <span className="combo-check">{o.key === selectedKey && <Icon name="check" />}</span>
                    <span className="combo-label">
                      <span>
                        <Highlight text={o.label} query={query} />
                      </span>
                      {o.sub && <span className="combo-sub">{o.sub}</span>}
                    </span>
                    {o.reason && <span className="combo-reason">{o.reason}</span>}
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="combo-keys" aria-hidden="true">
            <kbd>↑</kbd><kbd>↓</kbd> move <kbd>Enter</kbd> choose <kbd>Esc</kbd> close
          </p>
        </div>
      )}
    </div>
  );
}

// Search every teacher by name, or narrow by college first.
function InstructorPicker({ providers, value, onChange, label = "Teacher" }) {
  const selected = providers.find((p) => p.id === value);
  const [college, setCollege] = useState("");
  const [text, setText] = useState(selected?.name ?? "");

  useEffect(() => {
    setText(selected?.name ?? "");
  }, [selected?.name]);

  // Searching runs across all colleges unless one is chosen. The chosen name itself isn't a search.
  const query = text !== selected?.name ? text.trim() : "";
  const matches = providers
    .filter((p) => (!college || p.college === college) && (!query || fold(p.name).includes(fold(query))))
    .sort((a, b) => a.college.localeCompare(b.college) || a.name.localeCompare(b.name))
    .map((p) => ({ key: p.id, label: p.name, group: college ? undefined : shortCollege(p.college) }));

  return (
    <>
      <Field label="College or department" hint="Optional">
        <select value={college} onChange={(e) => setCollege(e.target.value)}>
          <option value="">All colleges</option>
          {COLLEGES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field
        label={label}
        hint="Type a name to search"
      >
        <Combobox
          icon="search"
          clearable
          value={text}
          query={query}
          placeholder="Search by name, e.g. Santos"
          options={matches}
          selectedKey={value}
          focusKey={query ? matches[0]?.key : value}
          countLabel={`${matches.length} teacher${matches.length === 1 ? "" : "s"}${college ? ` in ${shortCollege(college)}` : ""}`}
          emptyText={college ? `No teacher in ${shortCollege(college)} matches "${query}". Try "All colleges".` : `No teacher matches "${query}". Check the spelling.`}
          onChange={setText}
          onBlur={() => setText(selected?.name ?? "")}
          onSelect={(o) => {
            onChange(o.key);
            setText(o.label);
          }}
        />
      </Field>
    </>
  );
}

// Native <dialog>: focus is trapped, Esc closes, and focus returns to the opener.
function ConfirmDialog({ request, onClose }) {
  const ref = useRef(null);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      setReason("");
      dialog.showModal();
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]);

  const submit = (e) => {
    e.preventDefault();
    request.onConfirm(reason.trim());
    onClose();
  };

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="dialog-title">
      {request && (
        <form onSubmit={submit}>
          <h2 id="dialog-title" className="dialog-title">
            {request.title}
          </h2>
          <p className="dialog-message">{request.message}</p>
          {request.reasonLabel && (
            <Field label={request.reasonLabel} hint="The student will see this.">
              <textarea rows={3} maxLength={NOTE_MAX} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          )}
          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} autoFocus>
              {request.cancelLabel}
            </button>
            <button type="submit" className="btn btn-danger">
              {request.confirmLabel}
            </button>
          </div>
        </form>
      )}
    </dialog>
  );
}

// Teachers (and the admin) check a student's receipt: typed in, or opened from its QR code.
// `request` is { ref } while open; `onCheckIn` is only for teachers, for their own students.
function VerifyReceiptDialog({ request, onClose, onCheckIn }) {
  const ref = useRef(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const check = async (number) => {
    const typed = number.trim();
    if (!typed) return setResult({ error: "Type the reference number printed on the receipt." });
    setBusy(true);
    try {
      setResult(await api(`verify.php?ref=${encodeURIComponent(typed)}`));
    } catch (err) {
      setResult({ error: err.message === "Failed to fetch" ? OFFLINE_MESSAGE : err.message });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      setValue(request.ref);
      setResult(null);
      dialog.showModal();
      if (request.ref) check(request.ref);
    } else if (!request && dialog.open) {
      dialog.close();
    }
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const a = result?.valid ? result.appointment : null;
  const canCheckIn = a && onCheckIn && result.yours && a.status === "confirmed" && a.date === TODAY;
  const checkIn = async () => {
    await onCheckIn(a.id);
    check(result.ref);
  };

  const details = a && [
    ["Student", a.studentName],
    ["Student ID", a.studentId],
    ["Course & year", studentInfo(a)],
    ["Request", a.serviceName],
    ["Teacher", a.teacherName],
    ["When", `${fmtDate(a.date)}, ${fmtRange(a.start, a.end)}`],
    ["Room", a.roomName],
    [a.assignedBy === "teacher" ? "Scheduled by" : "Approved by", a.approvedBy],
    [a.assignedBy === "teacher" ? "Scheduled on" : "Approved on", fmtStamp(a.approvedAt)],
    ["Status now", APPT_STATUS[a.status].label],
  ];

  return (
    <dialog ref={ref} className="dialog dialog-wide" onClose={onClose} aria-labelledby="verify-title">
      {request && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            check(value);
          }}
        >
          <h2 id="verify-title" className="dialog-title">
            <Icon name="shield" /> Check a receipt
          </h2>
          <div className="inline-form">
            <Field label="Reference number" hint="Under the QR code, like APCAS-000123-7F3A91C2. Or scan the code with your phone's camera." className="grow">
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.toUpperCase())}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={30}
                autoFocus={!request.ref}
              />
            </Field>
            <button type="submit" className="btn btn-secondary" disabled={busy}>
              {busy ? "Checking…" : "Check"}
            </button>
          </div>

          {result?.error && <Alert tone="error">{result.error}</Alert>}
          {result && !result.error && !result.valid && (
            <Alert tone="error" title="Not a valid receipt">
              <p>{result.message}</p>
            </Alert>
          )}
          {a && (
            <div className="verify-result">
              <Alert tone={result.current ? "success" : "warning"} title={result.current ? "Genuine receipt" : "Genuine, but no longer valid"}>
                <p>{result.current ? "Issued by this system for the student below. Check that their school ID matches." : result.message}</p>
              </Alert>
              <dl className="receipt-dl">
                {details
                  .filter(([, v]) => v)
                  .map(([label, v]) => (
                    <div key={label} className="receipt-row">
                      <dt>{label}</dt>
                      <dd>{v}</dd>
                    </div>
                  ))}
              </dl>
              {!result.yours && <p className="hint">This appointment is with {a.teacherName}, not with you.</p>}
              {result.yours && result.current && a.date !== TODAY && <p className="hint">This appointment is on {fmtDate(a.date)}, not today.</p>}
            </div>
          )}

          <div className="dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Close
            </button>
            {canCheckIn && (
              <button type="button" className="btn btn-primary" onClick={checkIn}>
                Check in {a.studentName}
              </button>
            )}
          </div>
        </form>
      )}
    </dialog>
  );
}

function ActionButtons({ actions, onAction }) {
  return (
    <div className="actions">
      {actions.map((act) => (
        <button
          key={act.to}
          className={`btn btn-sm ${act.kind === "primary" ? "btn-primary" : "btn-secondary"}`}
          onClick={() => onAction(act)}
        >
          {act.label}
        </button>
      ))}
    </div>
  );
}

/* ============================== Sign in =============================== */

// Talks to the PHP backend in apcas-appointment-queue/api (proxied by Vite). Returns the parsed JSON body.
async function api(path, body) {
  const res = await fetch(`/api/${path}`, {
    method: body ? "POST" : "GET",
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Something went wrong. Please try again.");
    err.status = res.status;
    throw err;
  }
  return data;
}

const LOGIN_ROLES = [
  { id: "student", label: "Student", blurb: "Book makeup classes and consultations." },
  { id: "teacher", label: "Teacher", blurb: "Manage requests and your queue." },
  { id: "admin", label: "Admin", blurb: "Accounts, rooms, records and reports." },
];

// Full-screen sign-in: campus photo on one side, the login card on the other.
function LoginPage({ onSignIn }) {
  const [role, setRole] = useState("student");
  const [form, setForm] = useState({ username: "", password: "" });
  const [errors, setErrors] = useState({});
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(false);
  const passwordRef = useRef(null);

  const pickRole = (id) => {
    setRole(id);
    setProblem("");
  };

  const set = (field) => (value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setProblem("");
  };

  const submit = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.username.trim()) next.username = "Enter your username.";
    if (!form.password) next.password = "Enter your password.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    try {
      const { user } = await api("login.php", { username: form.username.trim(), password: form.password, role });
      onSignIn(user);
    } catch (err) {
      setProblem(err.message === "Failed to fetch" ? "Can't reach the server. Check that Apache and MySQL are running in XAMPP." : err.message);
      setBusy(false);
    }
  };

  const current = LOGIN_ROLES.find((r) => r.id === role);

  return (
    <main className="login" id="main">
      <div className="login-photo">
        <img src="/campus.jpg" alt="Asia Pacific College of Advanced Studies campus building with two students in uniform" />
        <div className="login-photo-text">
          <p className="login-photo-school">Asia Pacific College of Advanced Studies</p>
          <p className="login-photo-title">Appointments &amp; Queue</p>
          <p className="login-photo-sub">Book time with your teachers and skip the long wait outside the faculty room.</p>
        </div>
      </div>

      <div className="login-side">
        <form className="login-card" onSubmit={submit} noValidate aria-labelledby="login-title">
          <img src="/logo.png" alt="" className="login-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
          <h1 id="login-title" className="login-title">
            Welcome back
          </h1>
          <p className="login-sub">Sign in with the username and password from your school.</p>

          <div className="login-roles" role="radiogroup" aria-label="I am a">
            {LOGIN_ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={role === r.id}
                className={`login-role ${role === r.id ? "is-selected" : ""}`}
                onClick={() => pickRole(r.id)}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="login-role-blurb">{current.blurb}</p>

          {problem && <Alert tone="error" title={problem} />}
          <Field label="Username" error={errors.username}>
            <input
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              maxLength={30}
              enterKeyHint="next"
              value={form.username}
              onChange={(e) => set("username")(e.target.value)}
              onKeyDown={(e) => {
                // Enter moves on to the password; it only signs in once the password is filled in.
                if (e.key !== "Enter" || e.nativeEvent.isComposing || form.password) return;
                e.preventDefault();
                passwordRef.current?.focus();
              }}
            />
          </Field>
          <Field label="Password" error={errors.password}>
            <PasswordInput inputRef={passwordRef} enterKeyHint="go" value={form.password} onChange={set("password")} shown={shown} onToggle={() => setShown((s) => !s)} autoComplete="current-password" />
          </Field>
          <button type="submit" className="btn btn-primary btn-block login-submit" disabled={busy}>
            {busy ? "Signing in…" : `Sign in as ${current.label.toLowerCase()}`}
          </button>
          <p className="login-help">Forgot your password? Ask the registrar's office to reset it.</p>
        </form>
      </div>
    </main>
  );
}

/* ==================== Student: Book an Appointment ==================== */

const EMPTY_REQUEST = { start: null, note: "", attachments: [] };

// Every quarter-hour start in a teacher's day, each marked free or with the reason it isn't.
// `busy` is the teacher's booked time that day, `ownBusy` the student's.
function buildSlots({ provider, duration, date, busy, ownBusy, ownLabel = "You're booked" }) {
  const ws = toMin(provider.workStart), we = toMin(provider.workEnd);
  const ls = toMin(provider.lunchStart), le = toMin(provider.lunchEnd);
  const now = date === TODAY ? nowMinutes() : -1;
  const result = [];
  for (let start = ws; start + duration <= we; start += 15) {
    const end = start + duration;
    let reason = "";
    if (start <= now) reason = "Passed";
    else if (clashes(ls, le, start, end)) reason = "Lunch";
    else if (ownBusy.some((a) => clashes(a.start, a.end, start, end))) reason = ownLabel;
    else if (busy.some((a) => clashes(a.start, a.end, start, end))) reason = "Taken";
    result.push({ start, end, free: !reason, reason });
  }
  return result;
}

// The next six days open for appointments, offered as one-tap date chips.
function upcomingOpenDays() {
  const days = [];
  for (let d = isSunday(TODAY) ? nextOpenDay(TODAY) : TODAY; d <= LAST_BOOKABLE_DAY && days.length < 6; d = nextOpenDay(d)) days.push(d);
  return days;
}

// Same rules as the date picker, for dates typed by hand. Returns a plain-language problem or "".
function dateProblemFor(date) {
  if (!date) return "Choose a date.";
  if (date < TODAY) return "That date has passed. Choose today or a later date.";
  if (date > LAST_BOOKABLE_DAY) return `Appointments can be set up to ${BOOKING_WINDOW_DAYS} days ahead (until ${fmtDate(LAST_BOOKABLE_DAY)}).`;
  if (isSunday(date)) return "Teachers don't see students on Sundays. Choose another day.";
  return "";
}

// One booking type as a selectable card, used by students and in the teacher's preview.
function ServiceChoice({ service, checked, onChange, preview = false }) {
  return (
    <label className={`choice ${checked ? "is-selected" : ""} ${preview ? "is-preview" : ""}`}>
      {!preview && <input type="radio" name="service" value={service.id} checked={checked} onChange={onChange} />}
      <span className="choice-name">{service.name || "Untitled booking type"}</span>
      <span className="choice-meta">
        {service.duration} min{service.question ? " · asks a question" : ""}
      </span>
      {service.description && <span className="choice-desc">{service.description}</span>}
    </label>
  );
}

// "HS-101, High School Building", or "" when no room is set.
const roomLabel = (room) => (room ? [room.name, room.building].filter(Boolean).join(", ") : "");
const ordinal = (n) => `${n}${["st", "nd", "rd"][((n + 90) % 100 - 10) % 10 - 1] ?? "th"}`;
const fmtFloor = (n) => (n ? `${ordinal(n)} floor` : "Other");
const OTHER_BUILDING = "Other rooms";
const buildingOf = (room) => room.building || OTHER_BUILDING;

// "HS-204" -> "hs204", so "hs 204", "HS204" and "204" all find it.
const roomKey = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// One room as a tile. Busy rooms stay visible but can't be picked, and say who has them.
function RoomTile({ room, selected, why, onPick, showWhere = false }) {
  const taken = !!why && !selected;
  return (
    <button
      type="button"
      className={`room-tile ${selected ? "is-selected" : ""} ${room.name.length > 7 ? "is-long" : ""}`}
      aria-pressed={selected}
      disabled={taken}
      title={why ? `${room.name} is ${why}` : undefined}
      onClick={() => onPick(room)}
    >
      <span className="room-tile-name">{room.name}</span>
      <span className="room-tile-meta">
        {showWhere ? `${buildingOf(room)} · ${fmtFloor(room.floor)}${taken ? " · in use" : ""}` : taken ? "In use" : room.capacity ? `${room.capacity} seats` : ""}
      </span>
    </button>
  );
}

// Search any room by name, or browse a building floor by floor. `busy` maps room id -> why it can't be used then.
function RoomPicker({ rooms, value, onChange, busy, hint, error }) {
  const usable = rooms.filter((r) => r.active || r.id === value);
  const buildings = [...new Set(usable.map(buildingOf))];
  const current = usable.find((r) => r.id === value);
  const [building, setBuilding] = useState(current ? buildingOf(current) : buildings[0] ?? "");
  const [q, setQ] = useState("");
  const searchId = useId();
  const hintId = `${searchId}-hint`;

  // Follow a room chosen elsewhere (a reset, or the teacher's own room) into its building.
  useEffect(() => {
    if (current && buildingOf(current) !== building) setBuilding(buildingOf(current));
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (usable.length === 0) return <EmptyState title="No rooms are set up yet.">Ask the admin to add the school's rooms.</EmptyState>;

  const pick = (room) => {
    onChange(room.id);
    setBuilding(buildingOf(room));
    setQ("");
  };

  const text = roomKey(q);
  const matches = text ? usable.filter((r) => roomKey(r.name).includes(text) || roomKey(r.notes ?? "").includes(text)) : [];
  const inBuilding = usable.filter((r) => buildingOf(r) === building);
  const floors = [...new Set(inBuilding.map((r) => r.floor ?? null))].sort((a, b) => (a ?? 99) - (b ?? 99));

  return (
    <div className="room-picker">
      {current && (
        <p className="room-chosen">
          <Icon name="door" />
          <span>
            <strong>{current.name}</strong> · {buildingOf(current)}, {fmtFloor(current.floor).toLowerCase()}
          </span>
        </p>
      )}

      <div className="field">
        <label className="label" htmlFor={searchId}>
          Find a room
        </label>
        <div className="room-search">
          <Icon name="search" />
          <input
            id={searchId}
            type="search"
            placeholder="Type a room number, e.g. 204, HS-204 or Library"
            autoComplete="off"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              // Enter picks the only free match instead of submitting the form.
              if (e.key !== "Enter") return;
              e.preventDefault();
              const free = matches.filter((r) => !busy[r.id]);
              if (free.length === 1) pick(free[0]);
            }}
            aria-describedby={hint ? hintId : undefined}
          />
        </div>
      </div>

      {text ? (
        matches.length ? (
          <div className="room-grid room-grid-results" aria-label="Matching rooms">
            {matches.map((r) => (
              <RoomTile key={r.id} room={r} selected={r.id === value} why={busy[r.id]} onPick={pick} showWhere />
            ))}
          </div>
        ) : (
          <p className="hint">No room matches "{q.trim()}". Check the number, or browse the buildings below.</p>
        )
      ) : (
        <>
          <div className="room-buildings" role="tablist" aria-label="Building">
            {buildings.map((b) => {
              const list = usable.filter((r) => buildingOf(r) === b);
              const free = list.filter((r) => !busy[r.id]).length;
              return (
                <button key={b} type="button" role="tab" aria-selected={building === b} className={`room-building ${building === b ? "is-selected" : ""}`} onClick={() => setBuilding(b)}>
                  <span className="room-building-name">{b}</span>
                  <span className="room-building-meta">{free === list.length ? `${list.length} rooms` : `${free} of ${list.length} free`}</span>
                </button>
              );
            })}
          </div>

          <div className="room-floors" role="tabpanel" aria-label={building}>
            {floors.map((f) => (
              <div key={f ?? "none"} className="room-floor">
                <p className="room-floor-label">{fmtFloor(f)}</p>
                <div className="room-grid">
                  {inBuilding
                    .filter((r) => (r.floor ?? null) === f)
                    .map((r) => (
                      <RoomTile key={r.id} room={r} selected={r.id === value} why={busy[r.id]} onPick={pick} />
                    ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}

function BookSection({ student, providers, providerById, serviceById, roomById, appointments, onBook, goToAppointments }) {
  const [form, setForm] = useState({ ...EMPTY_REQUEST, providerId: "CICT-001", serviceId: "makeup", date: TODAY });
  const attachLabelId = useId();
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const [sending, setSending] = useState(false);

  const provider = providerById[form.providerId];
  const room = roomLabel(roomById[provider?.roomId]);
  // Each teacher offers their own booking types; fall back to their first one when switching teachers.
  const offered = (provider?.serviceIds ?? []).map((id) => serviceById[id]).filter(Boolean);
  const service = offered.find((s) => s.id === form.serviceId) ?? offered[0] ?? null;
  const needsAnswer = !!service?.question;

  // Changing who, what or when invalidates the chosen time.
  const set = (patch, { clearStart = false } = {}) => {
    setForm((f) => ({ ...f, ...patch, ...(clearStart ? { start: null } : {}) }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      if (clearStart) delete next.start;
      return next;
    });
    setSuccess(null);
  };

  // Appointments that already take up this instructor's time on this date.
  const busy = useMemo(
    () => appointments.filter((a) => a.providerId === form.providerId && a.date === form.date && BLOCKING.has(a.status)),
    [appointments, form.providerId, form.date]
  );
  // The student's own bookings with anyone on this date.
  const ownBusy = useMemo(
    () => appointments.filter((a) => sameStudent(a, student.studentId) && a.date === form.date && BLOCKING.has(a.status)),
    [appointments, student.studentId, form.date]
  );

  const hoursProblem = provider ? scheduleProblem(provider) : "";

  // Typed dates bypass the picker's min/max, so every rule is checked here too.
  const dateProblem = dateProblemFor(form.date);

  // Limits that stop one student from filling a teacher's calendar with requests.
  // A request that was never answered before its time passed no longer counts.
  const ownOpen = appointments.filter(
    (a) => sameStudent(a, student.studentId) && ACTIVE.has(a.status) && !(a.status === "booked" && hasStarted(a))
  );
  const samePending = ownOpen.find(
    (a) => a.status === "booked" && a.providerId === form.providerId && a.serviceId === service?.id
  );
  const limitProblem =
    ownOpen.length >= MAX_OPEN_REQUESTS
      ? `You already have ${MAX_OPEN_REQUESTS} open appointments, the limit. Cancel one first.`
      : samePending
        ? `You already asked ${provider?.name} for "${service.name}" on ${fmtDate(samePending.date)}. Wait for an answer or cancel it first.`
        : "";

  const slots = useMemo(() => {
    if (!provider || !service || hoursProblem || dateProblem) return [];
    return buildSlots({ provider, duration: service.duration, date: form.date, busy, ownBusy });
  }, [provider, service, form.date, busy, ownBusy, hoursProblem, dateProblem]);

  const freeCount = slots.filter((s) => s.free).length;

  // The next few days students can book, one tap each.
  const quickDays = useMemo(upcomingOpenDays, []);
  const endMin = form.start != null && service ? form.start + service.duration : null;

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSuccess(null);
    const note = form.note.trim();
    const next = {};
    if (!service) next.service = "This teacher isn't taking bookings right now. Choose another teacher.";
    if (limitProblem) next.limit = limitProblem;
    if (dateProblem) next.date = dateProblem;
    if (hoursProblem) next.start = `This teacher's hours aren't set up correctly yet (${hoursProblem}). Choose another teacher or try again later.`;
    else if (!dateProblem && form.start == null) next.start = "Choose a start time from the list.";
    else if (!dateProblem && !slots.some((s) => s.free && s.start === form.start))
      next.start = "That time is no longer free. Please choose another time.";
    if (needsAnswer && !note) next.note = `Answer your teacher's question: "${service.question}"`;
    else if (needsAnswer && note.replace(/\s/g, "").length < MAKEUP_REASON_MIN)
      next.note = `Give a little more detail (at least ${MAKEUP_REASON_MIN} characters) so your teacher can decide.`;
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const request = {
      studentName: student.name,
      studentId: student.studentId,
      studentCourse: student.course,
      studentYear: student.year,
      providerId: provider.id,
      serviceId: service.id,
      date: form.date,
      start: form.start,
      end: endMin,
      note,
      attachments: form.attachments,
    };
    setSending(true);
    const saved = await onBook(request);
    setSending(false);
    if (!saved) return;
    setSuccess(request);
    setForm((f) => ({ ...f, ...EMPTY_REQUEST }));
  };

  const errorList = Object.values(errors).filter(Boolean);

  // On phones the error summary is far below; bring the first problem into view instead.
  useEffect(() => {
    if (errorList.length === 0 || !window.matchMedia("(max-width: 680px)").matches) return;
    document.querySelector(".book .field-error, .book-summary .alert-error")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [errors]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <PageHeader
        title="Book an appointment"
        description="Pick a teacher and a free time. Your teacher will approve or decline it."
      />

      <form className="book" onSubmit={submit} noValidate>
        <div className="book-steps">
          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">1</span> Teacher and booking type
            </legend>
            <div className="grid-2">
              <InstructorPicker
                providers={providers}
                value={form.providerId}
                onChange={(id) => set({ providerId: id }, { clearStart: true })}
              />
            </div>
            <fieldset className="choice-set">
              <legend className="label">What do you need?</legend>
              {offered.length === 0 ? (
                <EmptyState title={`${provider?.name ?? "This teacher"} isn't taking bookings right now.`}>
                  Choose another teacher.
                </EmptyState>
              ) : (
                <div className="choices">
                  {offered.map((s) => (
                    <ServiceChoice
                      key={s.id}
                      service={s}
                      checked={service?.id === s.id}
                      onChange={() => set({ serviceId: s.id }, { clearStart: true })}
                    />
                  ))}
                </div>
              )}
            </fieldset>
          </fieldset>

          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">2</span> Date and time
            </legend>
            <div className="date-row">
              <Field
                label="Date"
                hint={`Mon–Sat, up to ${BOOKING_WINDOW_DAYS} days ahead`}
                error={errors.date || (form.date && dateProblem) || undefined}
              >
                <input
                  type="date"
                  min={TODAY}
                  max={LAST_BOOKABLE_DAY}
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value }, { clearStart: true })}
                />
              </Field>
              <div className="quick-days">
                <span className="label" id="quick-days-label">
                  Quick pick
                </span>
                <div className="quick-days-list" role="group" aria-labelledby="quick-days-label">
                  {quickDays.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`chip ${form.date === d ? "is-selected" : ""}`}
                      aria-pressed={form.date === d}
                      onClick={() => set({ date: d }, { clearStart: true })}
                    >
                      <span className="chip-top">{d === TODAY ? "Today" : d === TOMORROW ? "Tomorrow" : fmtWeekday(d)}</span>
                      <span className="chip-sub">{fmtMonthDay(d)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {provider && !hoursProblem && (
              <p className="hint">
                Available {fmtRange(toMin(provider.workStart), toMin(provider.workEnd))} · lunch{" "}
                {fmtRange(toMin(provider.lunchStart), toMin(provider.lunchEnd))}
                {room && ` · ${room}`}
              </p>
            )}

            <div className="slots-head">
              <span className="label" id="slots-label">
                Start time
              </span>
              {slots.length > 0 && (
                <span className="hint">
                  {freeCount} free
                </span>
              )}
            </div>

            {!service ? (
              <EmptyState title="Choose a teacher who is taking bookings to see free times." />
            ) : hoursProblem ? (
              <EmptyState title="This teacher's hours aren't available yet.">Choose another teacher for now.</EmptyState>
            ) : dateProblem ? (
              <EmptyState title="Choose an open date to see free times." />
            ) : freeCount === 0 ? (
              <EmptyState title="No free times on this date.">
                Try another date, or a shorter booking type.{" "}
                {nextOpenDay(form.date) <= LAST_BOOKABLE_DAY && (
                  <button type="button" className="link" onClick={() => set({ date: nextOpenDay(form.date) }, { clearStart: true })}>
                    Check {fmtDate(nextOpenDay(form.date))}
                  </button>
                )}
              </EmptyState>
            ) : null}

            {slots.length > 0 && freeCount > 0 && (
              <div className="slot-grid" role="group" aria-labelledby="slots-label">
                {slots.map((s) => {
                  const selected = s.start === form.start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      disabled={!s.free}
                      aria-pressed={s.free ? selected : undefined}
                      className={`slot ${selected ? "is-selected" : ""}`}
                      onClick={() => set({ start: s.start })}
                    >
                      <span className="slot-time">{fmtTime(s.start)}</span>
                      {!s.free && <span className="slot-reason">{s.reason}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.start && <p className="field-error">{errors.start}</p>}
          </fieldset>

          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">3</span> Message to your teacher
            </legend>
            <Field
              label={needsAnswer ? service.question : "Note (optional)"}
              hint={`${needsAnswer ? "Required · " : ""}${form.note.length}/${NOTE_MAX}`}
              error={errors.note}
            >
              <textarea
                rows={3}
                maxLength={NOTE_MAX}
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                placeholder={(needsAnswer && service.example) || "Example: I'd like to go over my project proposal."}
              />
            </Field>
            <div className="field">
              <span className="label" id={attachLabelId}>
                Proof, e.g. doctor's slip (optional)
              </span>
              <AttachmentPicker files={form.attachments} onChange={(attachments) => set({ attachments })} labelId={attachLabelId} />
            </div>
          </fieldset>
        </div>

        <aside className="panel book-summary" aria-labelledby="summary-title">
          <h3 id="summary-title" className="panel-title">
            Your request
          </h3>
          <dl className="summary">
            <dt>Teacher</dt>
            <dd>{provider?.name}</dd>
            <dt>Booking</dt>
            <dd>{service ? `${service.name}, ${service.duration} min` : <span className="muted">Not available</span>}</dd>
            <dt>Where</dt>
            <dd>{room || <span className="muted">Ask your teacher</span>}</dd>
            <dt>Date</dt>
            <dd>{!dateProblem ? fmtDate(form.date) : <span className="muted">Not chosen</span>}</dd>
            <dt>Time</dt>
            <dd>{form.start != null ? fmtRange(form.start, endMin) : <span className="muted">Not chosen</span>}</dd>
            <dt>Proof</dt>
            <dd>
              {form.attachments.length ? (
                `${form.attachments.length} file${form.attachments.length > 1 ? "s" : ""} attached`
              ) : (
                <span className="muted">None</span>
              )}
            </dd>
          </dl>

          {limitProblem && !errors.limit && !success && (
            <Alert tone="warning" title="You can't send this request yet.">
              <p>{limitProblem}</p>
              <button type="button" className="link" onClick={goToAppointments}>
                Open My appointments
              </button>
            </Alert>
          )}
          {errorList.length > 0 && (
            <Alert tone="error" title="Please fix this before sending:">
              <ul className="alert-list">
                {errorList.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </Alert>
          )}
          {success && (
            <Alert tone="success" title="Request sent.">
              <p>
                {serviceById[success.serviceId]?.name ?? "Appointment"} with {providerById[success.providerId]?.name ?? "your teacher"}, {fmtDate(success.date)},{" "}
                {fmtRange(success.start, success.end)}. It's waiting for your teacher's approval.
              </p>
              <button type="button" className="link" onClick={goToAppointments}>
                View my appointments
              </button>
            </Alert>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
            {sending ? "Sending…" : "Send request"}
          </button>
          <div className="mobile-submit">
            <p className="mobile-submit-text">
              {form.start != null ? (
                <>
                  <strong>{fmtDate(form.date)}</strong>
                  <span>{fmtRange(form.start, endMin)}</span>
                </>
              ) : (
                <span className="muted">Choose a time to send</span>
              )}
            </p>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? "Sending…" : "Send request"}
            </button>
          </div>
          <p className="hint">
            Up to {MAX_OPEN_REQUESTS} open requests. Cancel anytime before it starts.
          </p>
        </aside>
      </form>
    </section>
  );
}

/* ===================== Student: My Appointments ======================= */

function MyAppointmentsSection({ appointments, queue, providerById, serviceById, roomById, onCancel, onViewReceipt, confirm, goToBook }) {
  const upcoming = useMemo(() => appointments.filter((a) => ACTIVE.has(a.status)).sort(byDateTime), [appointments]);
  const closed = useMemo(
    () => appointments.filter((a) => !ACTIVE.has(a.status)).sort((a, b) => byDateTime(b, a)),
    [appointments]
  );

  const askCancel = (a) =>
    confirm({
      title: "Cancel this request?",
      message: `Your ${(serviceById[a.serviceId]?.name ?? "appointment").toLowerCase()} with ${providerById[a.providerId]?.name ?? "your teacher"} on ${fmtDate(a.date)}, ${fmtRange(a.start, a.end)} will be cancelled and the time freed for other students.`,
      cancelLabel: "Keep request",
      confirmLabel: "Cancel request",
      onConfirm: () => onCancel(a.id),
    });

  const renderItem = (a) => {
    const p = providerById[a.providerId];
    const ticket = openTicketFor(queue, a.id);
    const stage = studentStage(a, ticket);
    const st = STUDENT_STAGE[stage];
    return (
      <li key={a.id} className={`item ${stage === "your_turn" ? "is-turn" : ""}`}>
        <div className="item-main">
          <p className="item-title">
            {serviceById[a.serviceId]?.name} <span className="item-sub">with {p?.name}</span>
            {a.assignedBy === "teacher" && <span className="tag">{a.groupLabel ? `For all ${a.groupLabel}` : "Set by your teacher"}</span>}
          </p>
          <p className="item-meta">
            {fmtDate(a.date)}, {fmtRange(a.start, a.end)} · {roomLabel(roomById[a.roomId]) || (p && shortCollege(p.college))}
          </p>
          {ACTIVE.has(a.status) && <StageTracker stage={stage} assigned={a.assignedBy === "teacher"} />}
          {a.note && (
            <p className="quote">
              <span className="quote-label">Your note</span>
              {a.note}
            </p>
          )}
          <AttachmentList files={a.attachments} label="Your proof" />
          {a.teacherNote && (
            <p className="quote">
              <span className="quote-label">Message from your teacher</span>
              {a.teacherNote}
            </p>
          )}
          <AttachmentList files={a.teacherAttachments} label="Files from your teacher" />
          {a.status === "booked" && (
            <p className="hint">
              {hasStarted(a)
                ? "Not answered in time. Book a later date."
                : "Waiting for your teacher."}
            </p>
          )}
          {a.status === "confirmed" && <p className="hint">Arrive a few minutes early and show your receipt to your teacher.</p>}
          {ticket && (
            <p className="ticket-line">
              Queue ticket <strong>{ticket.ticket}</strong>: {QUEUE_STATUS[ticket.status].label.toLowerCase()}
              {ticket.status === "waiting" && (ticket.ahead > 0 ? ` · ${ticket.ahead} ahead of you` : " · you're next")}
            </p>
          )}
          {ticket?.missedCount > 0 && ticket.status === "waiting" && (
            <p className="hint">You weren't there when called, so you were moved to the end of the line. Stay close by.</p>
          )}
          {ticket?.status === "called" && <p className="hint strong">Your teacher is calling you now. Go in.</p>}
          {ticket?.status === "in_service" && <p className="hint strong">You are with your teacher now.</p>}
        </div>
        <div className="item-side">
          <Status tone={st.tone}>{st.label}</Status>
          {a.receiptRef && (
            <button className="btn btn-sm btn-secondary" onClick={() => onViewReceipt(a.id)}>
              <Icon name="receipt" /> Receipt
            </button>
          )}
          {STUDENT_CAN_CANCEL.has(a.status) && !hasStarted(a) && (
            <button className="btn btn-sm btn-secondary" onClick={() => askCancel(a)}>
              Cancel request
            </button>
          )}
        </div>
      </li>
    );
  };

  return (
    <section>
      <PageHeader
        title="My appointments"
        actions={
          <button className="btn btn-primary" onClick={goToBook}>
            New request
          </button>
        }
      />

      <section className="panel" aria-labelledby="upcoming-title">
        <h3 id="upcoming-title" className="panel-title">
          Upcoming <span className="count">{upcoming.length}</span>
        </h3>
        {upcoming.length === 0 ? (
          <EmptyState title="Nothing upcoming.">
            <button className="link" onClick={goToBook}>
              Book an appointment or makeup class
            </button>
          </EmptyState>
        ) : (
          <ul className="item-list">{upcoming.map(renderItem)}</ul>
        )}
      </section>

      {closed.length > 0 && (
        <section className="panel" aria-labelledby="closed-title">
          <h3 id="closed-title" className="panel-title">
            Past and closed <span className="count">{closed.length}</span>
          </h3>
          <ul className="item-list">{closed.map(renderItem)}</ul>
        </section>
      )}
    </section>
  );
}

// Pending → Approved → Your turn → Completed, with the current step marked.
function StageTracker({ stage, assigned }) {
  const at = STAGE_STEP_INDEX[stage];
  return (
    <ol className="stages" aria-label={`Progress: ${STUDENT_STAGE[stage].label}`}>
      {STAGE_STEPS.map((s, i) => {
        const state = i < at ? "done" : i === at ? "current" : "todo";
        // A teacher setting the time up skips the request step.
        const label = i === 0 && assigned ? "Scheduled" : i === 2 && stage === "in_line" ? "In line" : s.label;
        return (
          <li
            key={s.id}
            className={`stage is-${state} ${i === 2 && stage === "your_turn" ? "is-turn" : ""}`}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="stage-dot" aria-hidden="true">
              {state === "done" ? <Icon name="check" /> : i + 1}
            </span>
            <span className="stage-label">{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/* ========================= Student: Receipts ========================== */

const fmtLongDate = (key) => keyToDate(key).toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

function ReceiptsSection({ student, appointments, queue, providerById, serviceById, roomById, selectedId, onSelect, notify, goToAppointments }) {
  // Coming up first, soonest at the top; then the ones already done, latest first.
  const receipts = useMemo(() => {
    const list = appointments.filter((a) => a.receiptRef);
    return [
      ...list.filter((a) => a.status !== "completed").sort(byDateTime),
      ...list.filter((a) => a.status === "completed").sort((a, b) => byDateTime(b, a)),
    ];
  }, [appointments]);
  const waiting = appointments.filter((a) => a.status === "booked" && !hasStarted(a)).length;
  const current = receipts.find((a) => a.id === selectedId) ?? receipts[0];
  const receiptRef = useRef(null);

  const pick = (id) => {
    onSelect(id);
    // One column on smaller screens: bring the receipt into view.
    if (window.matchMedia("(max-width: 960px)").matches) {
      requestAnimationFrame(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  // The browser's print window saves PDFs; the page title becomes the file's name.
  const download = () => {
    const title = document.title;
    document.title = `APCAS receipt ${current.receiptRef}`;
    const restore = () => {
      document.title = title;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(current.receiptRef);
      notify(`Reference number ${current.receiptRef} copied.`);
    } catch {
      notify("Couldn't copy here. Select the reference number on the receipt and copy it.");
    }
  };

  return (
    <section className="receipts-page">
      <PageHeader
        title="Receipts"
        description="Official proof that your teacher approved your request. Show it when you arrive, or save it as a PDF."
        actions={
          current && (
            <>
              <button className="btn btn-secondary" onClick={copy}>
                <Icon name="copy" /> Copy number
              </button>
              <button className="btn btn-primary" onClick={download}>
                <Icon name="download" /> Download PDF
              </button>
            </>
          )
        }
      />

      {!current ? (
        <section className="panel">
          <EmptyState title="No receipts yet.">
            {waiting > 0
              ? `${waiting} request${waiting > 1 ? "s are" : " is"} waiting for approval. The receipt appears here as soon as your teacher approves it. `
              : "A receipt appears here as soon as a teacher approves one of your requests. "}
            <button className="link" onClick={goToAppointments}>
              See my appointments
            </button>
          </EmptyState>
        </section>
      ) : (
        <div className="receipts-layout">
          <nav className="panel receipt-list no-print" aria-label="Your receipts">
            <h3 className="panel-title">
              Approved <span className="count">{receipts.length}</span>
            </h3>
            <ul>
              {receipts.map((a) => {
                const st = STUDENT_STAGE[studentStage(a, openTicketFor(queue, a.id))];
                return (
                  <li key={a.id}>
                    <button
                      className={`receipt-pick ${a.id === current.id ? "is-selected" : ""}`}
                      aria-current={a.id === current.id ? "true" : undefined}
                      onClick={() => pick(a.id)}
                    >
                      <span className="receipt-pick-title">{serviceById[a.serviceId]?.name ?? "Appointment"}</span>
                      <span className="hint">
                        {fmtDate(a.date)}, {fmtTime(a.start)} · {providerById[a.providerId]?.name}
                      </span>
                      <Status tone={st.tone}>{st.label}</Status>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="receipt-wrap" ref={receiptRef}>
            <Receipt
              appt={current}
              student={student}
              stage={studentStage(current, openTicketFor(queue, current.id))}
              provider={providerById[current.providerId]}
              service={serviceById[current.serviceId]}
              room={roomById[current.roomId]}
            />
            <p className="hint no-print">In the window that opens, choose “Save as PDF” as the printer to download it.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function Receipt({ appt, student, stage, provider, service, room }) {
  const ref = appt.receiptRef;
  // Scanning it opens this site's check for teachers, already filled in.
  const verifyUrl = `${window.location.origin}/?verify=${ref}`;
  const [qr, setQr] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(verifyUrl, { width: 336, margin: 1, errorCorrectionLevel: "M", color: { dark: "#014d24", light: "#ffffff" } })
      .then((url) => live && setQr(url))
      .catch(() => live && setQr(""));
    return () => {
      live = false;
    };
  }, [verifyUrl]);

  const assigned = appt.assignedBy === "teacher";
  const studentRows = [
    ["Name", appt.studentName || student.name],
    ["Student ID", appt.studentId],
    ["Course & year", studentInfo(appt)],
  ];
  const requestRows = [
    ["Type", service?.name ?? "Appointment"],
    ["Teacher", provider?.name],
    ["Department", provider && shortCollege(provider.college)],
    ["Date", fmtLongDate(appt.date)],
    ["Time", fmtRange(appt.start, appt.end)],
    ["Room", roomLabel(room) || "Your teacher will tell you"],
    ["For", appt.groupLabel && `All of ${appt.groupLabel}`],
    ["Reason", appt.note],
  ];
  const approvalRows = [
    ["Status", "Approved"],
    ["Now", stage !== "approved" && STUDENT_STAGE[stage].label],
    [assigned ? "Scheduled by" : "Approved by", appt.approvedBy ?? provider?.name],
    [assigned ? "Scheduled on" : "Approved on", fmtStamp(appt.approvedAt)],
    ["Requested on", !assigned && fmtStamp(appt.createdAt)],
  ];
  const rows = (list) => (
    <dl className="receipt-dl">
      {list
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="receipt-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
    </dl>
  );

  return (
    <article className="receipt" aria-labelledby="receipt-title">
      <header className="receipt-head">
        <img src="/logo.png" alt="" className="receipt-logo" onError={(e) => (e.currentTarget.style.display = "none")} />
        <div>
          <p className="receipt-school">Asia Pacific College of Advanced Studies</p>
          <p className="receipt-sub">Appointments &amp; Queue</p>
        </div>
        <h3 id="receipt-title" className="receipt-title">
          Official approval receipt
        </h3>
      </header>

      <div className="receipt-top">
        <p className="receipt-stamp">
          <Icon name="check" /> Approved
        </p>
        <div className="receipt-ref-box">
          <p className="receipt-label">Reference number</p>
          <p className="receipt-ref">{ref}</p>
        </div>
      </div>

      <div className="receipt-body">
        <div className="receipt-sections">
          <section>
            <h4 className="receipt-h">Student</h4>
            {rows(studentRows)}
          </section>
          <section>
            <h4 className="receipt-h">Request</h4>
            {rows(requestRows)}
          </section>
          <section>
            <h4 className="receipt-h">Approval</h4>
            {rows(approvalRows)}
          </section>
        </div>
        <figure className="receipt-qr">
          {qr ? <img src={qr} alt={`QR code to check receipt ${ref}`} /> : <span className="receipt-qr-empty" />}
          <figcaption>Teachers: scan to check that this receipt is genuine.</figcaption>
        </figure>
      </div>

      <footer className="receipt-foot">
        Show this receipt with your school ID when you arrive. Your teacher can scan the code or type the reference number into
        the app to confirm it was issued for you. Valid only for the appointment above. Printed {new Date().toLocaleString()}.
      </footer>
    </article>
  );
}

/* ===================== Teacher: Schedule a student ===================== */

// For students who can't find a free time themselves: the teacher picks one and it's approved right away.
const EMPTY_ASSIGN = { studentName: "", studentId: "", studentCourse: "", studentYear: "", start: null, note: "", attachments: [], excluded: [] };
// "BS IT" and "bsit" are the same course.
const sameCourse = (a, b) => (a ?? "").replace(/\s+/g, "").toLowerCase() === (b ?? "").replace(/\s+/g, "").toLowerCase();
const RECENT_STUDENTS_MAX = 8;
// The "Something else" booking type, typed in on the spot instead of set up first in Booking types.
const CUSTOM_SERVICE = "custom";
const EMPTY_CUSTOM = { name: "", duration: 30, save: false };
const fmtLengthShort = (m) => (m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`);

function AssignSection({ teacher, serviceById, providerById, rooms, appointments, registered, onAssign, goToRequests, goToHours }) {
  const quickDays = useMemo(upcomingOpenDays, []);
  // `mode` is "one" (a single student) or "class" (everyone on record in a course and year level).
  const [form, setForm] = useState({
    ...EMPTY_ASSIGN,
    mode: "one",
    classCourse: "",
    classYear: "",
    serviceId: teacher.serviceIds[0] ?? "",
    date: quickDays[0] ?? TODAY,
    // Starts at the teacher's usual room and stays chosen between appointments.
    roomId: rooms.some((r) => r.id === teacher.roomId && r.active) ? teacher.roomId : null,
  });
  const isClass = form.mode === "class";
  const [custom, setCustom] = useState(EMPTY_CUSTOM);
  const attachLabelId = useId();
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(null);
  const [sending, setSending] = useState(false);

  const offered = teacher.serviceIds.map((id) => serviceById[id]).filter(Boolean);
  // With nothing turned on, typing one in is the only way.
  const isCustom = form.serviceId === CUSTOM_SERVICE || offered.length === 0;
  const customName = custom.name.trim().replace(/\s+/g, " ");
  const service = isCustom
    ? { id: CUSTOM_SERVICE, name: customName, duration: custom.duration }
    : offered.find((s) => s.id === form.serviceId) ?? offered[0];

  // Changing who, what or when invalidates the chosen time.
  const set = (patch, { clearStart = false } = {}) => {
    setForm((f) => ({ ...f, ...patch, ...(clearStart ? { start: null } : {}) }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      if (clearStart) delete next.start;
      return next;
    });
    setSuccess(null);
  };

  // A new length changes which times fit, so it clears the chosen time like any other change.
  const setCustomField = (patch) => {
    setCustom((c) => ({ ...c, ...patch }));
    set({ serviceId: CUSTOM_SERVICE }, { clearStart: "duration" in patch });
    setErrors((e) => ({ ...e, service: undefined }));
  };

  // Every student on record, one entry per ID, most recent first: registered students with
  // their details from the registrar, plus anyone else who has had an appointment.
  const students = useMemo(() => {
    const seen = new Map();
    [...appointments].sort((a, b) => byDateTime(b, a)).forEach((a) => {
      const key = a.studentId.toLowerCase();
      if (!seen.has(key))
        seen.set(key, { studentName: a.studentName, studentId: a.studentId, studentCourse: a.studentCourse, studentYear: a.studentYear, providerIds: new Set() });
      seen.get(key).providerIds.add(a.providerId);
    });
    registered.forEach((st) => {
      const key = st.studentId.toLowerCase();
      const known = seen.get(key) ?? { providerIds: new Set() };
      seen.set(key, { ...known, studentName: st.name, studentId: st.studentId, studentCourse: st.course, studentYear: st.year });
    });
    return [...seen.values()];
  }, [appointments, registered]);
  // Those who have booked with this teacher, to fill in with one tap.
  const recentStudents = students.filter((st) => st.providerIds.has(teacher.id)).slice(0, RECENT_STUDENTS_MAX);
  const pickStudent = (st) =>
    set(
      { studentName: st.studentName, studentId: st.studentId, studentCourse: st.studentCourse ?? "", studentYear: st.studentYear ? String(st.studentYear) : "" },
      { clearStart: true }
    );

  const studentId = form.studentId.trim();
  const idReady = STUDENT_ID_PATTERN.test(studentId);
  const isPicked = (st) => st.studentId.toLowerCase() === studentId.toLowerCase();
  // The record for the typed ID, offered when the other details don't match it yet.
  const onRecord = idReady ? students.find(isPicked) : null;
  const recordDiffers =
    onRecord &&
    (!sameName(onRecord.studentName, form.studentName) ||
      (onRecord.studentCourse ?? "") !== form.studentCourse.trim() ||
      String(onRecord.studentYear ?? "") !== form.studentYear);
  // More than one student with exactly this name: the teacher has to pick by ID, course and year.
  const twins = form.studentName.trim() ? students.filter((st) => sameName(st.studentName, form.studentName)) : [];

  // Class mode: everyone on record in that course and year, minus the ones the teacher unticked.
  // One entry per course however it was typed ("BS IT", "bsit"), shown the first way it appears.
  const knownCourses = useMemo(() => {
    const list = [];
    students.forEach((st) => {
      if (st.studentCourse && !list.some((c) => sameCourse(c, st.studentCourse))) list.push(st.studentCourse);
    });
    return list.sort((a, b) => a.localeCompare(b));
  }, [students]);
  // Type-to-search for the course, like the teacher search at sign in. The chosen course itself isn't a search.
  const [courseText, setCourseText] = useState(form.classCourse);
  const courseQuery = courseText !== form.classCourse ? courseText.trim() : "";
  const courseOptions = knownCourses
    .filter((c) => !courseQuery || fold(c).includes(fold(courseQuery)))
    .map((c) => {
      const n = students.filter((st) => sameCourse(st.studentCourse, c)).length;
      return { key: c, label: c, sub: `${n} student${n === 1 ? "" : "s"} on record` };
    });
  // Same for the year level; "2", "2nd" and "second" all find 2nd year.
  const [yearText, setYearText] = useState(form.classYear ? fmtYear(Number(form.classYear)) : "");
  const yearLabel = form.classYear ? fmtYear(Number(form.classYear)) : "";
  const yearQuery = yearText !== yearLabel ? yearText.trim() : "";
  const yearOptions = YEAR_LEVELS.filter(
    (y) => !yearQuery || fold(fmtYear(y)).includes(fold(yearQuery)) || YEAR_WORDS[y - 1].startsWith(fold(yearQuery))
  ).map((y) => {
    const n = students.filter((st) => st.studentYear === y && (!form.classCourse || sameCourse(st.studentCourse, form.classCourse))).length;
    return { key: String(y), label: fmtYear(y), sub: `${n} ${form.classCourse || ""} student${n === 1 ? "" : "s"}`.replace(/\s+/g, " ") };
  });
  const roster = useMemo(
    () =>
      form.classCourse.trim() && form.classYear
        ? students
            .filter((st) => sameCourse(st.studentCourse, form.classCourse) && String(st.studentYear) === form.classYear)
            .sort((a, b) => a.studentName.localeCompare(b.studentName))
        : [],
    [students, form.classCourse, form.classYear]
  );
  const classMembers = useMemo(() => roster.filter((st) => !form.excluded.includes(st.studentId)), [roster, form.excluded]);
  const classLabel = form.classCourse.trim() && form.classYear ? `${form.classCourse.trim()} · ${fmtYear(Number(form.classYear))}` : "";
  const toggleMember = (id) =>
    set({ excluded: form.excluded.includes(id) ? form.excluded.filter((x) => x !== id) : [...form.excluded, id] }, { clearStart: true });

  // The IDs whose own bookings must not overlap the new time.
  const recipientIds = useMemo(
    () => (isClass ? classMembers.map((st) => st.studentId) : idReady ? [studentId] : []),
    [isClass, classMembers, idReady, studentId]
  );

  const busy = useMemo(
    () => appointments.filter((a) => a.providerId === teacher.id && a.date === form.date && BLOCKING.has(a.status)),
    [appointments, teacher.id, form.date]
  );
  // The students' bookings with any teacher that day, so nobody is put in two places at once.
  const studentBusy = useMemo(
    () => appointments.filter((a) => a.date === form.date && BLOCKING.has(a.status) && recipientIds.some((id) => sameStudent(a, id))),
    [appointments, recipientIds, form.date]
  );

  const hoursProblem = scheduleProblem(teacher);
  const dateProblem = dateProblemFor(form.date);

  const slots = useMemo(() => {
    if (hoursProblem || dateProblem) return [];
    return buildSlots({
      provider: teacher,
      duration: service.duration,
      date: form.date,
      busy,
      ownBusy: studentBusy,
      ownLabel: isClass ? "Class busy" : "Student busy",
    });
  }, [teacher, service, form.date, busy, studentBusy, hoursProblem, dateProblem, isClass]);

  const freeCount = slots.filter((s) => s.free).length;
  const endMin = form.start != null && service ? form.start + service.duration : null;

  // Rooms another teacher has at the chosen time, with who and when.
  const roomBusy = useMemo(() => {
    if (form.start == null || dateProblem) return {};
    const taken = {};
    appointments.forEach((a) => {
      if (a.roomId == null || a.date !== form.date || a.providerId === teacher.id) return;
      if (!["booked", "confirmed", "checked_in"].includes(a.status) || !clashes(a.start, a.end, form.start, endMin)) return;
      const who = providerById[a.providerId]?.name.split(",")[0] || "another teacher";
      taken[a.roomId] = `in use by ${who}, ${fmtRange(a.start, a.end)}`;
    });
    return taken;
  }, [appointments, form.date, form.start, endMin, dateProblem, teacher.id, providerById]);
  const room = rooms.find((r) => r.id === form.roomId);

  // Classmates with something else that day, so the teacher knows why times are blocked.
  const classClashes = isClass
    ? classMembers
        .map((st) => ({ st, appts: studentBusy.filter((a) => sameStudent(a, st.studentId)) }))
        .filter((x) => x.appts.length > 0)
    : [];

  // A request from this student that is still waiting can simply be approved instead.
  const waitingRequest = !isClass && idReady
    ? appointments.find((a) => a.providerId === teacher.id && sameStudent(a, studentId) && a.status === "booked" && !hasStarted(a))
    : null;

  const submit = async (e) => {
    e.preventDefault();
    if (sending) return;
    setSuccess(null);
    const name = form.studentName.trim().replace(/\s+/g, " ");
    const note = form.note.trim();
    const next = {};
    let owner = null;
    let course = "";
    if (isClass) {
      if (!form.classCourse.trim()) next.classCourse = "Type a course and pick it from the suggestions.";
      if (!form.classYear) next.classYear = "Type a year level and pick it from the suggestions.";
      if (form.classCourse.trim() && form.classYear && classMembers.length === 0)
        next.classMembers = roster.length ? "Tick at least one student." : `No ${classLabel} students are on record yet.`;
    } else {
      if (!name) next.studentName = "Enter the student's full name.";
      else if (!NAME_PATTERN.test(name))
        next.studentName = "Use letters only (spaces, periods, hyphens and apostrophes are fine), 2 to 60 characters.";
      if (!studentId) next.studentId = "Enter the student's ID.";
      else if (!idReady) next.studentId = "Use the format on the school ID: the 4-digit year, a dash, then 5 digits (for example 2024-00123).";
      // Same rule as signing in: an ID already on record belongs to one name, or the student won't see the appointment.
      owner = !next.studentName && !next.studentId && appointments.find((a) => sameStudent(a, studentId));
      if (owner && !sameName(owner.studentName, name))
        next.studentId = `This student ID is on record as ${owner.studentName}. Check the ID, or use that name.`;
      course = form.studentCourse.trim().replace(/\s+/g, " ");
      if (!course) next.studentCourse = "Enter the student's course, like BSIT.";
      else if (!COURSE_PATTERN.test(course)) next.studentCourse = `Use letters, numbers and spaces for the course, 2 to ${COURSE_MAX} characters.`;
      if (!form.studentYear) next.studentYear = "Choose the student's year level.";
    }
    if (isCustom) {
      if (!customName) next.service = 'Type what the appointment is for, like "Quiz retake".';
      else if (customName.length < 3) next.service = "Use at least 3 characters for what the appointment is for.";
      else if (offered.some((s) => sameName(s.name, customName)))
        next.service = `You already have a booking type called "${customName}". Pick it from the list instead.`;
    }
    if (dateProblem) next.date = dateProblem;
    if (!form.roomId) next.room = "Choose the room where it will be held.";
    else if (roomBusy[form.roomId]) next.room = `${room.name} is ${roomBusy[form.roomId]}. Choose another room or time.`;
    if (hoursProblem) next.start = `Your hours aren't set up correctly yet (${hoursProblem}). Fix them in My hours first.`;
    else if (!dateProblem && form.start == null) next.start = "Choose a start time from the list.";
    else if (!dateProblem && !slots.some((s) => s.free && s.start === form.start))
      next.start = "That time is no longer free. Please choose another time.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const shared = {
      providerId: teacher.id,
      roomId: form.roomId,
      serviceId: isCustom ? null : service.id,
      date: form.date,
      start: form.start,
      end: endMin,
      note: "",
      ...(note ? { teacherNote: note } : {}),
      ...(form.attachments.length ? { teacherAttachments: form.attachments } : {}),
    };
    // A class gets one appointment per student, tied together so they read as one session (the server picks the id).
    const groupId = isClass ? uid("grp") : null;
    const appts = isClass
      ? classMembers.map((st) => ({
          ...shared,
          studentName: st.studentName,
          studentId: st.studentId,
          studentCourse: st.studentCourse,
          studentYear: st.studentYear,
          groupId,
          groupLabel: classLabel,
        }))
      : [{ ...shared, studentName: owner ? owner.studentName : name, studentId, studentCourse: course, studentYear: Number(form.studentYear) }];
    const newService = isCustom
      ? { providerId: teacher.id, name: customName, duration: custom.duration, description: "", question: "", example: "", ...(custom.save ? {} : { oneOff: true }) }
      : null;
    setSending(true);
    const saved = await onAssign(appts, newService);
    setSending(false);
    if (!saved) return;
    setSuccess({ ...appts[0], count: appts.length, serviceName: service.name, savedType: isCustom && custom.save });
    setForm((f) => ({ ...f, ...EMPTY_ASSIGN }));
    if (isCustom) setCustom(EMPTY_CUSTOM);
  };

  const errorList = Object.values(errors).filter(Boolean);

  // On phones the error summary is far below; bring the first problem into view instead.
  useEffect(() => {
    if (errorList.length === 0 || !window.matchMedia("(max-width: 680px)").matches) return;
    document.querySelector(".book .field-error, .book-summary .alert-error")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [errors]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section>
      <PageHeader
        title="Schedule a student"
        description="Pick a time for one student or a whole class. It's approved right away and shows in their appointments."
      />

      <form className="book" onSubmit={submit} noValidate>
        <div className="book-steps">
          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">1</span> {isClass ? "Class" : "Student"}
            </legend>
            <div className="choices mode-choices" role="radiogroup" aria-label="Who is this for?">
              {[
                { id: "one", name: "One student", meta: "Search by name or ID" },
                { id: "class", name: "A whole class", meta: "Everyone in a course and year" },
              ].map((m) => (
                <label key={m.id} className={`choice ${form.mode === m.id ? "is-selected" : ""}`}>
                  <input
                    type="radio"
                    name="assign-mode"
                    value={m.id}
                    checked={form.mode === m.id}
                    onChange={() => set({ mode: m.id }, { clearStart: true })}
                  />
                  <span className="choice-name">{m.name}</span>
                  <span className="choice-meta">{m.meta}</span>
                </label>
              ))}
            </div>
            {isClass ? (
              <>
                <div className="grid-2">
                  <Field label="Course" error={errors.classCourse}>
                    <Combobox
                      icon="search"
                      clearable
                      value={courseText}
                      query={courseQuery}
                      placeholder="Type a course, e.g. BSIT"
                      options={courseOptions}
                      selectedKey={form.classCourse}
                      focusKey={courseQuery ? courseOptions[0]?.key : form.classCourse}
                      countLabel={`${courseOptions.length} course${courseOptions.length === 1 ? "" : "s"}`}
                      emptyText={knownCourses.length ? `No course matches "${courseQuery}". Check the spelling.` : "No courses on record yet."}
                      onChange={(text) => {
                        setCourseText(text);
                        // Clearing the box clears the class too.
                        if (!text.trim() && form.classCourse) set({ classCourse: "", excluded: [] }, { clearStart: true });
                      }}
                      onBlur={() => setCourseText(form.classCourse)}
                      onSelect={(o) => {
                        set({ classCourse: o.key, excluded: [] }, { clearStart: true });
                        setCourseText(o.label);
                      }}
                    />
                  </Field>
                  <Field label="Year level" error={errors.classYear}>
                    <Combobox
                      icon="search"
                      clearable
                      value={yearText}
                      query={yearQuery}
                      placeholder="Type a year, e.g. 2nd"
                      options={yearOptions}
                      selectedKey={form.classYear}
                      focusKey={yearQuery ? yearOptions[0]?.key : form.classYear}
                      countLabel={`${yearOptions.length} year level${yearOptions.length === 1 ? "" : "s"}`}
                      emptyText={`No year level matches "${yearQuery}". Try 1 to 5.`}
                      onChange={(text) => {
                        setYearText(text);
                        if (!text.trim() && form.classYear) set({ classYear: "", excluded: [] }, { clearStart: true });
                      }}
                      onBlur={() => setYearText(yearLabel)}
                      onSelect={(o) => {
                        set({ classYear: o.key, excluded: [] }, { clearStart: true });
                        setYearText(o.label);
                      }}
                    />
                  </Field>
                </div>
                {classLabel &&
                  (roster.length === 0 ? (
                    <EmptyState title={`No ${classLabel} students on record yet.`}>
                      Students show up here once they've signed in and booked with any teacher.
                    </EmptyState>
                  ) : (
                    <div className="roster">
                      <div className="roster-head">
                        <span className="label" id="roster-label">
                          {classMembers.length} of {roster.length} students
                        </span>
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            set({ excluded: classMembers.length === roster.length ? roster.map((st) => st.studentId) : [] }, { clearStart: true })
                          }
                        >
                          {classMembers.length === roster.length ? "Untick all" : "Tick all"}
                        </button>
                      </div>
                      <ul className="roster-list" aria-labelledby="roster-label">
                        {roster.map((st) => (
                          <li key={st.studentId}>
                            <label className="roster-item">
                              <input
                                type="checkbox"
                                checked={!form.excluded.includes(st.studentId)}
                                onChange={() => toggleMember(st.studentId)}
                              />
                              <span className="roster-name">{st.studentName}</span>
                              <span className="hint">{st.studentId}</span>
                            </label>
                          </li>
                        ))}
                      </ul>
                      {errors.classMembers && <p className="field-error">{errors.classMembers}</p>}
                    </div>
                  ))}
              </>
            ) : (
              <>
              {recentStudents.length > 0 && (
                <div className="quick-days">
                  <span className="label" id="recent-students-label">
                    Your recent students
                  </span>
                  <div className="quick-days-list student-chips" role="group" aria-labelledby="recent-students-label">
                    {recentStudents.map((st) => (
                      <button
                        key={st.studentId}
                        type="button"
                        className={`chip ${isPicked(st) ? "is-selected" : ""}`}
                        aria-pressed={isPicked(st)}
                        onClick={() => pickStudent(st)}
                      >
                        <span className="chip-top">{st.studentName}</span>
                        <span className="chip-sub">{[studentInfo(st), st.studentId].filter(Boolean).join(" · ")}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="student-fields">
                <Field label="Full name" error={errors.studentName}>
                  <input autoComplete="off" maxLength={60} value={form.studentName} onChange={(e) => set({ studentName: e.target.value })} />
                </Field>
                <Field label="Student ID" error={errors.studentId}>
                  <input
                    placeholder="2024-00123"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={10}
                    value={form.studentId}
                    onChange={(e) => set({ studentId: e.target.value }, { clearStart: true })}
                  />
                </Field>
                <Field label="Course" error={errors.studentCourse}>
                  <input placeholder="BSIT" autoComplete="off" maxLength={COURSE_MAX} value={form.studentCourse} onChange={(e) => set({ studentCourse: e.target.value })} />
                </Field>
                <Field label="Year level" error={errors.studentYear}>
                  <select value={form.studentYear} onChange={(e) => set({ studentYear: e.target.value })}>
                    <option value="">Choose…</option>
                    {YEAR_LEVELS.map((y) => (
                      <option key={y} value={y}>
                        {fmtYear(y)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              {twins.length > 1 && !twins.some(isPicked) && (
                <Alert tone="warning" title={`${twins.length} students are named ${twins[0].studentName}.`}>
                  <p>Check the course, year and ID to pick the right one.</p>
                  <ul className="twin-list">
                    {twins.map((st) => (
                      <li key={st.studentId}>
                        <span>
                          <strong>{st.studentId}</strong> · {studentInfo(st) || "No course on record"}
                        </span>
                        <button type="button" className="btn btn-sm btn-secondary" onClick={() => pickStudent(st)}>
                          Choose
                        </button>
                      </li>
                    ))}
                  </ul>
                </Alert>
              )}
              {recordDiffers && (
                <Alert tone="info" title={`${onRecord.studentId} is on record as ${onRecord.studentName}.`}>
                  <p>{studentInfo(onRecord) || "No course or year on record yet."}</p>
                  <button type="button" className="link" onClick={() => pickStudent(onRecord)}>
                    Use these details
                  </button>
                </Alert>
              )}
              {waitingRequest && (
                <Alert tone="info" title={`${waitingRequest.studentName} already sent you a request.`}>
                  <p>
                    {serviceById[waitingRequest.serviceId]?.name} on {fmtDate(waitingRequest.date)},{" "}
                    {fmtRange(waitingRequest.start, waitingRequest.end)} is waiting for your answer. If that time works, approve it instead.
                  </p>
                  <button type="button" className="link" onClick={goToRequests}>
                    Open Requests
                  </button>
                </Alert>
              )}
              </>
            )}
          </fieldset>

          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">2</span> Booking type
            </legend>
            <div className="choices">
              {offered.map((s) => (
                <ServiceChoice
                  key={s.id}
                  service={s}
                  checked={service.id === s.id}
                  onChange={() => set({ serviceId: s.id }, { clearStart: true })}
                />
              ))}
              <label className={`choice ${isCustom ? "is-selected" : ""}`}>
                <input
                  type="radio"
                  name="service"
                  value={CUSTOM_SERVICE}
                  checked={isCustom}
                  onChange={() => set({ serviceId: CUSTOM_SERVICE }, { clearStart: true })}
                />
                <span className="choice-name">Something else</span>
                <span className="choice-meta">Type it in for this {isClass ? "class" : "student"}</span>
              </label>
            </div>

            {isCustom && (
              <div className="custom-service">
                <Field
                  label="What is the appointment for?"
                  hint={`${custom.name.length}/${SERVICE_NAME_MAX}`}
                  error={errors.service}
                >
                  <input
                    maxLength={SERVICE_NAME_MAX}
                    value={custom.name}
                    onChange={(e) => setCustomField({ name: e.target.value })}
                    placeholder="Example: Quiz retake"
                  />
                </Field>
                <div className="length-choices idea-chips" role="group" aria-label="Ideas">
                  {SERVICE_IDEAS.filter((idea) => !offered.some((s) => sameName(s.name, idea))).map((idea) => (
                    <button
                      key={idea}
                      type="button"
                      className={`chip ${sameName(custom.name, idea) ? "is-selected" : ""}`}
                      aria-pressed={sameName(custom.name, idea)}
                      onClick={() => setCustomField({ name: idea })}
                    >
                      <span className="chip-sub">{idea}</span>
                    </button>
                  ))}
                </div>
                <fieldset className="field">
                  <legend className="label">How long?</legend>
                  <div className="length-choices">
                    {DURATION_CHOICES.map((m) => (
                      <button
                        key={m}
                        type="button"
                        className={`chip ${custom.duration === m ? "is-selected" : ""}`}
                        aria-pressed={custom.duration === m}
                        onClick={() => setCustomField({ duration: m })}
                      >
                        <span className="chip-top">{fmtLengthShort(m)}</span>
                      </button>
                    ))}
                  </div>
                </fieldset>
                <label className="check">
                  <input type="checkbox" checked={custom.save} onChange={(e) => setCustomField({ save: e.target.checked })} />
                  <span>
                    <strong>Also add it to my booking types</strong> so students can book it themselves later
                  </span>
                </label>
              </div>
            )}
          </fieldset>

          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">3</span> Date and time
            </legend>
            <div className="date-row">
              <Field
                label="Date"
                hint={`Mon–Sat, up to ${BOOKING_WINDOW_DAYS} days ahead`}
                error={errors.date || (form.date && dateProblem) || undefined}
              >
                <input
                  type="date"
                  min={TODAY}
                  max={LAST_BOOKABLE_DAY}
                  value={form.date}
                  onChange={(e) => set({ date: e.target.value }, { clearStart: true })}
                />
              </Field>
              <div className="quick-days">
                <span className="label" id="assign-days-label">
                  Quick pick
                </span>
                <div className="quick-days-list" role="group" aria-labelledby="assign-days-label">
                  {quickDays.map((d) => (
                    <button
                      key={d}
                      type="button"
                      className={`chip ${form.date === d ? "is-selected" : ""}`}
                      aria-pressed={form.date === d}
                      onClick={() => set({ date: d }, { clearStart: true })}
                    >
                      <span className="chip-top">{d === TODAY ? "Today" : d === TOMORROW ? "Tomorrow" : fmtWeekday(d)}</span>
                      <span className="chip-sub">{fmtMonthDay(d)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="slots-head">
              <span className="label" id="assign-slots-label">
                Start time
              </span>
              {slots.length > 0 && <span className="hint">{freeCount} free</span>}
            </div>
            {!isClass && !idReady && slots.length > 0 && (
              <p className="hint">Enter the student's ID to also hide times they're already booked elsewhere.</p>
            )}
            {classClashes.length > 0 && (
              <p className="hint">
                "Class busy" times clash with:{" "}
                {classClashes
                  .map(({ st, appts }) => `${st.studentName} (${appts.map((a) => fmtRange(a.start, a.end)).join(", ")})`)
                  .join("; ")}
                . Untick them to free those times.
              </p>
            )}

            {hoursProblem ? (
              <EmptyState title="Your hours aren't set up correctly yet.">
                <button type="button" className="link" onClick={goToHours}>
                  Fix them in My hours
                </button>
              </EmptyState>
            ) : dateProblem ? (
              <EmptyState title="Choose an open date to see free times." />
            ) : freeCount === 0 ? (
              <EmptyState title="No free times on this date.">
                Try another date, or a shorter booking type.{" "}
                {nextOpenDay(form.date) <= LAST_BOOKABLE_DAY && (
                  <button type="button" className="link" onClick={() => set({ date: nextOpenDay(form.date) }, { clearStart: true })}>
                    Check {fmtDate(nextOpenDay(form.date))}
                  </button>
                )}
              </EmptyState>
            ) : null}

            {slots.length > 0 && freeCount > 0 && (
              <div className="slot-grid" role="group" aria-labelledby="assign-slots-label">
                {slots.map((s) => {
                  const selected = s.start === form.start;
                  return (
                    <button
                      key={s.start}
                      type="button"
                      disabled={!s.free}
                      aria-pressed={s.free ? selected : undefined}
                      className={`slot ${selected ? "is-selected" : ""}`}
                      onClick={() => set({ start: s.start })}
                    >
                      <span className="slot-time">{fmtTime(s.start)}</span>
                      {!s.free && <span className="slot-reason">{s.reason}</span>}
                    </button>
                  );
                })}
              </div>
            )}
            {errors.start && <p className="field-error">{errors.start}</p>}
          </fieldset>

          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">4</span> Room
            </legend>
            <RoomPicker
              rooms={rooms}
              value={form.roomId}
              onChange={(roomId) => set({ roomId })}
              busy={roomBusy}
              error={errors.room}
              hint={
                form.start == null
                  ? "Pick a time first to see which rooms are free then."
                  : `Rooms other teachers are using at ${fmtRange(form.start, endMin)} can't be picked.`
              }
            />
            {teacher.roomId && form.roomId !== teacher.roomId && rooms.some((r) => r.id === teacher.roomId) && (
              <button type="button" className="link" onClick={() => set({ roomId: teacher.roomId })}>
                Use my usual room ({roomLabel(rooms.find((r) => r.id === teacher.roomId))})
              </button>
            )}
          </fieldset>

          <fieldset className="panel step">
            <legend className="step-title">
              <span className="step-num" aria-hidden="true">5</span> Message to the {isClass ? "class" : "student"}
            </legend>
            <Field label="Note (optional)" hint={`${form.note.length}/${NOTE_MAX}`}>
              <textarea
                rows={3}
                maxLength={NOTE_MAX}
                value={form.note}
                onChange={(e) => set({ note: e.target.value })}
                placeholder="Example: Bring your lab manual. We'll go over Laboratory Output 1."
              />
            </Field>
            <div className="field">
              <span className="label" id={attachLabelId}>
                Files for the {isClass ? "class" : "student"}, e.g. a reviewer or quiz coverage (optional)
              </span>
              <AttachmentPicker files={form.attachments} onChange={(attachments) => set({ attachments })} labelId={attachLabelId} />
            </div>
          </fieldset>
        </div>

        <aside className="panel book-summary" aria-labelledby="assign-summary-title">
          <h3 id="assign-summary-title" className="panel-title">
            Appointment
          </h3>
          <dl className="summary">
            <dt>{isClass ? "Class" : "Student"}</dt>
            <dd>
              {isClass ? (
                classLabel ? (
                  <>
                    {classLabel}
                    <div className="hint">
                      {classMembers.length} student{classMembers.length === 1 ? "" : "s"}
                    </div>
                  </>
                ) : (
                  <span className="muted">Not chosen</span>
                )
              ) : form.studentName.trim() ? (
                <>
                  {form.studentName.trim()}
                  {(studentId || form.studentCourse.trim() || form.studentYear) && (
                    <div className="hint">
                      {[form.studentCourse.trim(), form.studentYear && fmtYear(Number(form.studentYear)), studentId].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </>
              ) : (
                <span className="muted">Not entered</span>
              )}
            </dd>
            <dt>Booking</dt>
            <dd>{service.name ? `${service.name}, ${service.duration} min` : <span className="muted">Not entered</span>}</dd>
            <dt>Date</dt>
            <dd>{!dateProblem ? fmtDate(form.date) : <span className="muted">Not chosen</span>}</dd>
            <dt>Time</dt>
            <dd>{form.start != null ? fmtRange(form.start, endMin) : <span className="muted">Not chosen</span>}</dd>
            <dt>Room</dt>
            <dd>
              {room ? (
                <>
                  {room.name}
                  <div className="hint">{[room.building, room.floor && fmtFloor(room.floor)].filter(Boolean).join(" · ")}</div>
                </>
              ) : (
                <span className="muted">Not chosen</span>
              )}
            </dd>
            <dt>Files</dt>
            <dd>
              {form.attachments.length ? (
                `${form.attachments.length} file${form.attachments.length > 1 ? "s" : ""} attached`
              ) : (
                <span className="muted">None</span>
              )}
            </dd>
          </dl>

          {errorList.length > 0 && (
            <Alert tone="error" title="Please fix this before scheduling:">
              <ul className="alert-list">
                {errorList.map((msg) => (
                  <li key={msg}>{msg}</li>
                ))}
              </ul>
            </Alert>
          )}
          {success && (
            <Alert tone="success" title="Appointment scheduled.">
              <p>
                {success.count > 1 ? `${success.count} students in ${success.groupLabel}` : success.studentName}: {success.serviceName},{" "}
                {fmtDate(success.date)}, {fmtRange(success.start, success.end)}, {roomLabel(rooms.find((r) => r.id === success.roomId))}. It's
                already approved and shows in their appointments.
                {success.savedType && ` "${success.serviceName}" is now one of your booking types too.`}
              </p>
              <button type="button" className="link" onClick={goToRequests}>
                View in Requests
              </button>
            </Alert>
          )}

          <button type="submit" className="btn btn-primary btn-block" disabled={sending}>
            {sending ? "Scheduling…" : "Schedule appointment"}
          </button>
          <div className="mobile-submit">
            <p className="mobile-submit-text">
              {form.start != null ? (
                <>
                  <strong>{fmtDate(form.date)}</strong>
                  <span>{fmtRange(form.start, endMin)}</span>
                </>
              ) : (
                <span className="muted">Choose a time to schedule</span>
              )}
            </p>
            <button type="submit" className="btn btn-primary" disabled={sending}>
              {sending ? "Scheduling…" : "Schedule"}
            </button>
          </div>
          <p className="hint">No approval step: {isClass ? "each student" : "the student"} can still cancel from their side if the time doesn't work.</p>
        </aside>
      </form>
    </section>
  );
}

/* ======================== Teacher: Requests =========================== */

// An open appointment that the teacher's current hours leave outside working time or in lunch.
const outsideHours = (a, p) =>
  ["booked", "confirmed"].includes(a.status) &&
  (a.start < toMin(p.workStart) || a.end > toMin(p.workEnd) || clashes(toMin(p.lunchStart), toMin(p.lunchEnd), a.start, a.end));

function RequestsSection({ appointments, serviceById, roomById, teacher, onChangeStatus, confirm, goToAssign }) {
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [newestFirst, setNewestFirst] = useState(false);

  const pending = useMemo(() => appointments.filter((a) => a.status === "booked").sort(byDateTime), [appointments]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = appointments
      .filter((a) => (filter === "all" ? true : filter === "active" ? ACTIVE.has(a.status) : a.status === filter))
      .filter((a) => !q || a.studentName.toLowerCase().includes(q) || a.studentId.toLowerCase().includes(q))
      .sort(byDateTime);
    return newestFirst ? list.reverse() : list;
  }, [appointments, filter, search, newestFirst]);

  const counts = useMemo(() => {
    const c = { active: 0 };
    appointments.forEach((a) => {
      c[a.status] = (c[a.status] || 0) + 1;
      if (ACTIVE.has(a.status)) c.active += 1;
    });
    return c;
  }, [appointments]);

  const DIALOGS = {
    decline: (a) => ({
      title: "Decline this request?",
      message: `${a.studentName} will see that you declined their ${(serviceById[a.serviceId]?.name ?? "appointment").toLowerCase()} on ${fmtDate(a.date)}, ${fmtRange(a.start, a.end)}.`,
      reasonLabel: "Reason or suggestion (optional)",
      cancelLabel: "Go back",
      confirmLabel: "Decline request",
    }),
    cancel: (a) => ({
      title: "Cancel this approved appointment?",
      message: `${a.studentName}'s ${(serviceById[a.serviceId]?.name ?? "appointment").toLowerCase()} on ${fmtDate(a.date)}, ${fmtRange(a.start, a.end)} will be cancelled.`,
      reasonLabel: "Message to the student (optional)",
      cancelLabel: "Keep appointment",
      confirmLabel: "Cancel appointment",
    }),
    no_show: (a) => ({
      title: "Mark as no-show?",
      message: `Use this if ${a.studentName} didn't arrive for ${fmtRange(a.start, a.end)} on ${fmtDate(a.date)}.`,
      cancelLabel: "Go back",
      confirmLabel: "Mark no-show",
    }),
  };

  const runAction = (a, act) => {
    if (!act.confirm) return onChangeStatus(a.id, act.to);
    confirm({ ...DIALOGS[act.confirm](a), onConfirm: (reason) => onChangeStatus(a.id, act.to, reason) });
  };

  // Check-in only makes sense on the day itself, and no-show once the appointment has started.
  const actionsFor = (a) =>
    (TEACHER_ACTIONS[a.status] || []).filter(
      (act) =>
        (act.to !== "checked_in" || a.date === TODAY) &&
        (act.to !== "no_show" || hasStarted(a)) &&
        (act.to !== "confirmed" || !hasStarted(a))
    );

  return (
    <section>
      <PageHeader
        title="Requests"
        description="Approve or decline student requests."
        actions={
          <button className="btn btn-secondary" onClick={goToAssign}>
            Schedule a student
          </button>
        }
      />

      <section className="panel" aria-labelledby="pending-title">
        <h3 id="pending-title" className="panel-title">
          Needs your answer <span className="count">{pending.length}</span>
        </h3>
        {pending.length === 0 ? (
          <EmptyState title="No requests waiting.">New requests from students will appear here.</EmptyState>
        ) : (
          <ul className="item-list">
            {pending.map((a) => (
              <li key={a.id} className="item">
                <div className="item-main">
                  <p className="item-title">
                    {a.studentName} <span className="item-sub">{[a.studentId, studentInfo(a)].filter(Boolean).join(" · ")}</span>
                  </p>
                  <p className="item-meta">
                    <strong className={serviceById[a.serviceId]?.question ? "text-accent" : ""}>{serviceById[a.serviceId]?.name}</strong> ·{" "}
                    {fmtDate(a.date)}, {fmtRange(a.start, a.end)}
                    {roomById[a.roomId] && ` · ${roomLabel(roomById[a.roomId])}`}
                    {outsideHours(a, teacher) && <span className="tag tag-warning">Outside your hours</span>}
                  </p>
                  {a.note ? (
                    <p className="quote">
                      <span className="quote-label">{serviceById[a.serviceId]?.question || "Student's note"}</span>
                      {a.note}
                    </p>
                  ) : (
                    <p className="hint">No note.</p>
                  )}
                  <AttachmentList files={a.attachments} />
                </div>
                <div className="item-side">
                  <ActionButtons actions={actionsFor(a)} onAction={(act) => runAction(a, act)} />
                  {hasStarted(a) && <p className="hint">Time has passed. Decline only.</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel" aria-labelledby="all-title">
        <h3 id="all-title" className="panel-title">
          All appointments
        </h3>
        <div className="toolbar">
          <Field label="Find a student">
            <input type="search" placeholder="Name or student ID" value={search} onChange={(e) => setSearch(e.target.value)} />
          </Field>
          <Field label="Status">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="active">Open ({counts.active})</option>
              <option value="all">All ({appointments.length})</option>
              {Object.entries(APPT_STATUS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.label} ({counts[key] || 0})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="hint" aria-live="polite">
          Showing {rows.length} of {appointments.length} appointments.
        </p>

        {rows.length === 0 ? (
          <EmptyState title="No appointments match.">
            {(search || filter !== "all") && (
              <button
                className="link"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear search and show all
              </button>
            )}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Student</th>
                  <th scope="col">Service</th>
                  <th scope="col" aria-sort={newestFirst ? "descending" : "ascending"}>
                    <button className="sort" onClick={() => setNewestFirst((v) => !v)}>
                      Date and time <span aria-hidden="true">{newestFirst ? "↓" : "↑"}</span>
                      <span className="sr-only">, sorted {newestFirst ? "latest first" : "earliest first"}. Click to reverse.</span>
                    </button>
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((a) => {
                  const st = APPT_STATUS[a.status];
                  const actions = actionsFor(a);
                  return (
                    <tr key={a.id} className={ACTIVE.has(a.status) ? "" : "row-closed"}>
                      <td data-label="Student">
                        <div className="strong">
                          {a.studentName}
                          {a.assignedBy === "teacher" && <span className="tag">{a.groupLabel ? `Class: ${a.groupLabel}` : "Set by you"}</span>}
                        </div>
                        <div className="hint">{a.studentId}</div>
                        {studentInfo(a) && <div className="hint">{studentInfo(a)}</div>}
                        <AttachmentList files={a.teacherAttachments} label="Files you sent" />
                      </td>
                      <td data-label="Service">
                        <div>{serviceById[a.serviceId]?.name}</div>
                        {a.note && (
                          <div className="hint clamp" title={a.note}>
                            {a.note}
                          </div>
                        )}
                      </td>
                      <td data-label="Date and time">
                        <div>{fmtDate(a.date)}</div>
                        <div className="hint">{fmtRange(a.start, a.end)}</div>
                        {roomById[a.roomId] && <div className="hint">{roomLabel(roomById[a.roomId])}</div>}
                        {outsideHours(a, teacher) && <span className="tag tag-warning">Outside your hours</span>}
                      </td>
                      <td data-label="Status">
                        <Status tone={st.tone}>{st.label}</Status>
                      </td>
                      <td data-label="Actions">
                        {actions.length > 0 ? (
                          <ActionButtons actions={actions} onAction={(act) => runAction(a, act)} />
                        ) : (
                          <span className="hint">No action needed</span>
                        )}
                        {a.status === "confirmed" && a.date > TODAY && <p className="hint">Check-in opens {fmtDate(a.date)}.</p>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

/* ========================= Teacher: Queue ============================= */

function QueueSection({ queue, appointments, serviceById, onCheckIn, onAddWalkIn, onCallNext, onChangeStatus, onMoveToEnd, onVerify, confirm, goToRequests }) {
  const [walkInName, setWalkInName] = useState("");
  const [walkInError, setWalkInError] = useState("");
  const [showFinished, setShowFinished] = useState(false);

  const serving = queue.filter((e) => e.status === "in_service");
  const called = queue.filter((e) => e.status === "called");
  const waiting = queue.filter((e) => e.status === "waiting");
  const finished = queue.filter((e) => e.status === "done" || e.status === "left");
  const line = showFinished ? queue : queue.filter((e) => !["done", "left"].includes(e.status));

  // Approved for today, plus today's no-shows: if they turn up late they can still be seen, after everyone already in line.
  const toCheckIn = useMemo(
    () => appointments.filter((a) => ["confirmed", "no_show"].includes(a.status) && a.date === TODAY).sort(byDateTime),
    [appointments]
  );
  const laterApproved = appointments.filter((a) => a.status === "confirmed" && a.date > TODAY).length;

  const addWalkIn = (e) => {
    e.preventDefault();
    const name = walkInName.trim().replace(/\s+/g, " ");
    if (!name) return setWalkInError("Type the person's name.");
    if (!NAME_PATTERN.test(name))
      return setWalkInError("Use letters only (spaces, periods, hyphens and apostrophes are fine), 2 to 60 characters.");
    const duplicate = queue.find((x) => sameName(x.name, name) && !["done", "left"].includes(x.status));
    if (duplicate) return setWalkInError(`${duplicate.name} is already in the line as ${duplicate.ticket}.`);
    // Adding an approved student as a walk-in would leave their appointment open forever.
    const booked = toCheckIn.find((a) => sameName(a.studentName, name));
    if (booked)
      return setWalkInError(
        `${booked.studentName} has an approved appointment today at ${fmtTime(booked.start)}. Use Check in instead so it's recorded.`
      );
    onAddWalkIn(name);
    setWalkInName("");
    setWalkInError("");
  };

  const runAction = (entry, act) => {
    if (act.to === "requeue") return onMoveToEnd(entry.id);
    if (!act.confirm) return onChangeStatus(entry.id, act.to);
    confirm({
      title: `Remove ${entry.ticket} from the line?`,
      message: `${entry.name} will be marked as having left. Use this if they gave up waiting. If they might still come, use "Not here: move to end" instead.`,
      cancelLabel: "Keep in line",
      confirmLabel: "Remove from line",
      onConfirm: () => onChangeStatus(entry.id, act.to),
    });
  };

  return (
    <section>
      <PageHeader
        title="Queue"
        description="Check students in, then call them one at a time. Students see when it's their turn."
        actions={
          <button className="btn btn-secondary" onClick={onVerify}>
            <Icon name="shield" /> Check a receipt
          </button>
        }
      />

      <div className="panel now">
        <div className="now-block">
          <p className="now-label">Now serving</p>
          {serving.length === 0 ? (
            <p className="now-empty">No one</p>
          ) : (
            serving.map((e) => (
              <p key={e.id} className="now-ticket">
                <span className="now-number">{e.ticket}</span>
                <span className="now-name">{e.name}</span>
              </p>
            ))
          )}
        </div>
        <div className="now-block">
          <p className="now-label">Called, on the way</p>
          {called.length === 0 ? (
            <p className="now-empty">No one</p>
          ) : (
            <p className="now-small">{called.map((e) => `${e.ticket} ${e.name}`).join(", ")}</p>
          )}
        </div>
        <div className="now-block now-call">
          <p className="now-label">{waiting.length} waiting</p>
          <button className="btn btn-primary btn-lg" onClick={() => onCallNext()} disabled={waiting.length === 0}>
            {waiting.length > 0 ? `Call next: ${waiting[0].ticket}` : "No one to call"}
          </button>
        </div>
      </div>

      <div className="queue-grid">
        <section className="panel" aria-labelledby="line-title">
          <div className="panel-head">
            <h3 id="line-title" className="panel-title">
              The line
            </h3>
            {finished.length > 0 && (
              <button className="link" onClick={() => setShowFinished((v) => !v)} aria-pressed={showFinished}>
                {showFinished ? "Hide finished" : `Show finished (${finished.length})`}
              </button>
            )}
          </div>
          <p className="hint">
            In order of arrival. Anyone not here when called can be moved to the end, so the students who are here are seen first.
          </p>
          {line.length === 0 ? (
            <EmptyState title="No one is in line.">Checked-in students and walk-ins will appear here in order of arrival.</EmptyState>
          ) : (
            <ol className="item-list">
              {line.map((e) => {
                const st = QUEUE_STATUS[e.status];
                // Only one person can be served at a time.
                const blocked = e.status === "called" && serving.length > 0;
                const actions = (QUEUE_ACTIONS[e.status] || []).filter((act) => !(blocked && act.to === "in_service"));
                return (
                  <li key={e.id} className={`item queue-item ${["done", "left"].includes(e.status) ? "is-finished" : ""}`}>
                    <span className="ticket">{e.ticket}</span>
                    <div className="item-main">
                      <p className="item-title">
                        {e.name}
                        {e.missedCount > 0 && (
                          <span className="tag tag-warning">
                            Moved to end{e.missedCount > 1 ? ` ×${e.missedCount}` : ""}
                          </span>
                        )}
                        {e.late && <span className="tag tag-warning">Late</span>}
                      </p>
                      <p className="item-meta">{e.appointmentId ? "Appointment" : "Walk-in"}</p>
                      {blocked && <p className="hint">Finish {serving[0].ticket} before serving this person.</p>}
                    </div>
                    <div className="item-side">
                      <Status tone={st.tone}>{st.label}</Status>
                      {actions.length > 0 && <ActionButtons actions={actions} onAction={(act) => runAction(e, act)} />}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="stack">
          <section className="panel" aria-labelledby="checkin-title">
            <h3 id="checkin-title" className="panel-title">
              Check in <span className="count">{toCheckIn.length}</span>
            </h3>
            <p className="hint">Approved for today. Late arrivals join the end of the line.</p>
            {toCheckIn.length === 0 ? (
              <EmptyState title="No approved appointments left for today.">
                {laterApproved > 0 && `${laterApproved} approved for later dates. `}
                <button className="link" onClick={goToRequests}>
                  Go to requests
                </button>
              </EmptyState>
            ) : (
              <ul className="item-list">
                {toCheckIn.map((a) => {
                  const missed = a.status === "no_show";
                  return (
                    <li key={a.id} className="item">
                      <div className="item-main">
                        <p className="item-title">
                          {a.studentName} <span className="item-sub">{[a.studentId, studentInfo(a)].filter(Boolean).join(" · ")}</span>
                        </p>
                        <p className="item-meta">
                          {fmtTime(a.start)} · {serviceById[a.serviceId]?.name}
                          {missed && <span className="tag tag-warning">Missed their time</span>}
                        </p>
                        {a.receiptRef && <p className="hint receipt-ref-hint">Receipt {a.receiptRef}</p>}
                      </div>
                      <button className={`btn btn-sm ${missed ? "btn-secondary" : "btn-primary"}`} onClick={() => onCheckIn(a.id)}>
                        {missed ? "Check in late" : "Check in"}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <form className="panel" onSubmit={addWalkIn} noValidate aria-labelledby="walkin-title">
            <h3 id="walkin-title" className="panel-title">
              Add a walk-in
            </h3>
            <div className="inline-form">
              <Field label="Name" error={walkInError} className="grow">
                <input
                  maxLength={60}
                  value={walkInName}
                  onChange={(e) => {
                    setWalkInName(e.target.value);
                    setWalkInError("");
                  }}
                  autoComplete="off"
                />
              </Field>
              <button type="submit" className="btn btn-secondary">
                Add to line
              </button>
            </div>
          </form>
        </div>
      </div>
    </section>
  );
}

/* ====================== Teacher: My Hours ============================= */

const HOURS_FIELDS = ["workStart", "workEnd", "lunchStart", "lunchEnd"];
const pickHours = (p) => Object.fromEntries(HOURS_FIELDS.map((k) => [k, p[k]]));
const sameHours = (a, b) => HOURS_FIELDS.every((k) => a[k] === b[k]);

// Every quarter hour from 6:00 AM to 9:00 PM, offered as suggestions while typing.
const DAY_FIRST = 6 * 60, DAY_LAST = 21 * 60;
const TIME_OPTIONS = Array.from({ length: (DAY_LAST - DAY_FIRST) / 15 + 1 }, (_, i) => DAY_FIRST + i * 15);
const toHHMM = (min) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

// "7 hours", "6 hours 30 minutes"
function fmtLength(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return [h && `${h} hour${h > 1 ? "s" : ""}`, m && `${m} minutes`].filter(Boolean).join(" ");
}

// "9", "930", "9:30am", "1:15 pm", "13:15" -> minutes, or NaN.
// Without AM/PM, 1–5 is read as afternoon since nobody works from 1 AM.
function parseTime(text) {
  const match = text.trim().toLowerCase().replace(/\./g, "").match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/);
  if (!match) return NaN;
  let h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  const half = match[3]?.[0];
  if (m > 59 || h > 23 || (half && (h < 1 || h > 12))) return NaN;
  if (half === "p" && h < 12) h += 12;
  else if (half === "a" && h === 12) h = 0;
  else if (!half && h >= 1 && h <= 5) h += 12;
  return h * 60 + m;
}

// A free-typing time box with quarter-hour suggestions. Stores "HH:MM", or "" while unreadable.
// A free-typing time box with a list of quarter hours underneath. Stores "HH:MM", or "" while unreadable.
// `rule(min)` returns why a time can't be used here (shown greyed out in the list), or "".
function TimeInput({ value, onChange, rule = () => "", ...rest }) {
  const [text, setText] = useState(value ? fmtTime(toMin(value)) : "");
  const [focused, setFocused] = useState(false);

  // Follow outside changes (Undo, standard day) when the person isn't typing here.
  useEffect(() => {
    if (!focused) setText(value ? fmtTime(toMin(value)) : "");
  }, [value, focused]);

  const type = (next) => {
    setText(next);
    const min = parseTime(next);
    onChange(Number.isNaN(min) ? "" : toHHMM(min));
  };

  // Jump the list to whatever has been typed so far, rounded to the nearest quarter hour.
  const typed = parseTime(text);
  const near = Number.isNaN(typed) ? null : Math.min(DAY_LAST, Math.max(DAY_FIRST, Math.round(typed / 15) * 15));
  const options = TIME_OPTIONS.map((m) => {
    const reason = rule(m);
    return { key: toHHMM(m), label: fmtTime(m), disabled: !!reason, reason };
  });

  return (
    <Combobox
      {...rest}
      icon="clock"
      inputMode="text"
      placeholder="e.g. 9:00 AM"
      value={text}
      query=""
      options={options}
      selectedKey={value}
      focusKey={near != null ? toHHMM(near) : value}
      onChange={type}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onSelect={(o) => {
        setText(o.label);
        onChange(o.key);
      }}
    />
  );
}

// A 6 AM – 9 PM strip showing open time and the lunch break, as students will see it.
function DayPreview({ hours }) {
  const ws = toMin(hours.workStart), we = toMin(hours.workEnd);
  const ls = toMin(hours.lunchStart), le = toMin(hours.lunchEnd);
  const pos = (m) => `${((m - DAY_FIRST) / (DAY_LAST - DAY_FIRST)) * 100}%`;
  const span = (a, b) => ({ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})` });
  return (
    <div className="day-preview" aria-hidden="true">
      <div className="day-track">
        <div className="day-open" style={span(ws, we)} />
        <div className="day-lunch" style={span(ls, le)}>
          <span>Lunch</span>
        </div>
      </div>
      <div className="day-scale">
        {[6, 9, 12, 15, 18, 21].map((h) => (
          <span key={h} style={{ left: pos(h * 60) }}>
            {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`}
          </span>
        ))}
      </div>
      <div className="day-legend">
        <span><i className="swatch swatch-open" /> Students can book</span>
        <span><i className="swatch swatch-lunch" /> Lunch break</span>
        <span><i className="swatch swatch-closed" /> Not available</span>
      </div>
    </div>
  );
}

// How many 15-minute start times a service of `duration` minutes gets in one day.
function startsPerDay(hours, duration) {
  const ws = toMin(hours.workStart), we = toMin(hours.workEnd);
  const ls = toMin(hours.lunchStart), le = toMin(hours.lunchEnd);
  let count = 0;
  for (let start = ws; start + duration <= we; start += 15) if (!clashes(ls, le, start, start + duration)) count++;
  return count;
}

function HoursSection({ teacher, appointments, serviceById, onSave, goToServices }) {
  const saved = pickHours(teacher);
  const [draft, setDraft] = useState(saved);

  const problem = scheduleProblem(draft);
  const unreadable = HOURS_FIELDS.some((k) => !draft[k]);
  const changed = !sameHours(draft, saved);
  const isDefault = sameHours(draft, DEFAULT_HOURS);

  // Open appointments that the new hours would leave outside working time or inside lunch.
  const conflicts = useMemo(() => {
    if (problem) return [];
    const ws = toMin(draft.workStart), we = toMin(draft.workEnd);
    const ls = toMin(draft.lunchStart), le = toMin(draft.lunchEnd);
    return appointments
      .filter((a) => ["booked", "confirmed"].includes(a.status) && a.date >= TODAY)
      .filter((a) => a.start < ws || a.end > we || clashes(ls, le, a.start, a.end))
      .sort(byDateTime);
  }, [appointments, draft, problem]);

  const update = (field, value) => setDraft((d) => ({ ...d, [field]: value }));

  const submit = (e) => {
    e.preventDefault();
    if (problem || !changed) return;
    onSave(draft);
  };

  const ws = toMin(draft.workStart), we = toMin(draft.workEnd);
  const ls = toMin(draft.lunchStart), le = toMin(draft.lunchEnd);

  return (
    <section>
      <PageHeader
        title="My hours"
        description="When students can book you, Monday to Saturday."
      />

      <div className="hours-layout">
        <form className="panel hours-form" onSubmit={submit} noValidate>
          <fieldset className="hours-set">
            <legend className="hours-legend">
              <span className="step-num">1</span> When does your day start and end?
            </legend>
            <p className="hint hours-tip">Type a time (e.g. 9:30 AM) or pick from the list.</p>
            <div className="grid-2">
              <Field label="Start of day">
                <TimeInput
                  value={draft.workStart}
                  onChange={(v) => update("workStart", v)}
                  rule={(m) => (m >= DAY_LAST ? "Too late to start" : "")}
                />
              </Field>
              <Field label="End of day">
                <TimeInput
                  value={draft.workEnd}
                  onChange={(v) => update("workEnd", v)}
                  rule={(m) => (m <= ws ? "Before your start" : "")}
                />
              </Field>
            </div>
          </fieldset>
          <fieldset className="hours-set">
            <legend className="hours-legend">
              <span className="step-num">2</span> When is your lunch break?
            </legend>
            <div className="grid-2">
              <Field label="Lunch starts">
                <TimeInput
                  value={draft.lunchStart}
                  onChange={(v) => update("lunchStart", v)}
                  rule={(m) => (m < ws ? "Before your day starts" : m >= we ? "After your day ends" : "")}
                />
              </Field>
              <Field label="Lunch ends">
                <TimeInput
                  value={draft.lunchEnd}
                  onChange={(v) => update("lunchEnd", v)}
                  rule={(m) => (m <= ls ? "Before lunch starts" : m > we ? "After your day ends" : "")}
                />
              </Field>
            </div>
          </fieldset>

          <div className="hours-set">
            <p className="hours-legend">
              <span className="step-num">3</span> Check how your day looks to students
            </p>
            {problem ? (
              <p className="hint">Fix the times above to see a preview.</p>
            ) : (
              <>
                <DayPreview hours={draft} />
                <p className="hours-summary" aria-live="polite">
                  Students can book{" "}
                  {[[ws, ls], [le, we]]
                    .filter(([a, b]) => a < b)
                    .map(([a, b], i) => (
                      <span key={a}>
                        {i > 0 && " and "}
                        <strong>{fmtRange(a, b)}</strong>
                      </span>
                    ))}{" "}
                  ({fmtLength(we - ws - (le - ls))} a day).
                </p>
              </>
            )}
          </div>

          {problem && (
            <Alert tone="error" title="These hours can't be saved yet.">
              <p>{unreadable ? "Some times couldn't be read. Type them like 9:30 AM or 1:15 PM." : problem}</p>
            </Alert>
          )}
          {conflicts.length > 0 && (
            <Alert tone="warning" title={`${conflicts.length} open appointment${conflicts.length > 1 ? "s" : ""} would fall outside these hours.`}>
              <ul className="alert-list">
                {conflicts.map((a) => (
                  <li key={a.id}>
                    {a.studentName}: {serviceById[a.serviceId]?.name}, {fmtDate(a.date)} {fmtRange(a.start, a.end)}
                  </li>
                ))}
              </ul>
              <p>They won't be cancelled automatically. Review them on the Requests page after saving.</p>
            </Alert>
          )}

          <div className="form-actions hours-actions">
            <button type="submit" className="btn btn-primary" disabled={!changed || !!problem}>
              Save hours
            </button>
            {changed && (
              <button type="button" className="btn btn-secondary" onClick={() => setDraft(saved)}>
                Undo changes
              </button>
            )}
            <p className={`hours-status ${changed ? "is-unsaved" : ""}`} aria-live="polite">
              {changed ? "Not saved yet — students still see your old hours." : "Saved. Students see these hours."}
            </p>
          </div>
          {!isDefault && (
            <p className="hint hours-default">
              <button type="button" className="link" onClick={() => setDraft(DEFAULT_HOURS)}>
                Use standard hours
              </button>{" "}
              (9 AM – 5 PM, lunch 12 – 1)
            </p>
          )}
        </form>

        <aside className="hours-side">
          <section className="panel" aria-labelledby="saved-title">
            <h3 id="saved-title" className="panel-title">
              Currently saved
            </h3>
            <dl className="summary">
              <dt>Working</dt>
              <dd>{fmtRange(toMin(saved.workStart), toMin(saved.workEnd))}</dd>
              <dt>Lunch</dt>
              <dd>{fmtRange(toMin(saved.lunchStart), toMin(saved.lunchEnd))}</dd>
              <dt>Days</dt>
              <dd>Monday to Saturday</dd>
            </dl>
          </section>

          <section className="panel" aria-labelledby="services-title">
            <h3 id="services-title" className="panel-title">
              What students can book
            </h3>
            <p className="hint">Start times per day</p>
            <ul className="service-list">
              {teacher.serviceIds.map((id) => serviceById[id]).filter(Boolean).map((s) => (
                <li key={s.id}>
                  <span>
                    {s.name}
                    <span className="hint"> · {s.duration} min</span>
                  </span>
                  <strong>{problem ? "–" : startsPerDay(draft, s.duration)}</strong>
                </li>
              ))}
            </ul>
            <button type="button" className="link side-link" onClick={goToServices}>
              Add or change booking types
            </button>
          </section>
        </aside>
      </div>
    </section>
  );
}

/* ===================== Teacher: Booking types ========================= */

// Starting points for a teacher's own booking types.
const SERVICE_IDEAS = ["Laboratory Output 1 checking", "Quiz retake", "Thesis consultation", "Grade inquiry", "Project defense"];

const EMPTY_SERVICE = { name: "", duration: 30, description: "", question: "", example: "" };

function serviceProblems(draft, { teacher, takenNames }) {
  const errors = {};
  const name = draft.name.trim().replace(/\s+/g, " ");
  if (!name) errors.name = "Give it a name students will recognize, like \"Laboratory Output 1 checking\".";
  else if (name.length < 3) errors.name = "Use at least 3 characters.";
  else if (takenNames.some((n) => sameName(n, name))) errors.name = `You already have a booking type called "${name}". Use a different name.`;
  const d = Number(draft.duration);
  if (!Number.isInteger(d) || d < 15 || d > 240 || d % 15 !== 0) errors.duration = "Choose a length from 15 to 240 minutes, in steps of 15.";
  else if (!scheduleProblem(teacher) && startsPerDay(teacher, d) === 0)
    errors.duration = `${d} minutes doesn't fit between your working hours and lunch, so students would see no times. Choose a shorter length or change My hours.`;
  if (draft.asks && !draft.question.trim()) errors.question = "Type the question students must answer, or untick the box.";
  return errors;
}

function ServiceEditor({ initial, isNew, isStandard, teacher, takenNames, onSave, onCancel }) {
  const [draft, setDraft] = useState({ ...initial, asks: !!initial.question });
  const [showErrors, setShowErrors] = useState(false);
  const nameRef = useRef(null);

  useEffect(() => {
    nameRef.current?.focus({ preventScroll: true });
    nameRef.current?.closest("form")?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, []);

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const errors = serviceProblems(draft, { teacher, takenNames });
  const shown = showErrors ? errors : {};
  const customLength = !DURATION_CHOICES.includes(Number(draft.duration));

  const cleaned = {
    name: draft.name.trim().replace(/\s+/g, " "),
    duration: Number(draft.duration),
    description: draft.description.trim(),
    question: draft.asks ? draft.question.trim() : "",
    example: draft.asks ? draft.example.trim() : "",
  };
  const unchanged = !isNew && ["name", "duration", "description", "question", "example"].every((k) => cleaned[k] === initial[k]);

  const submit = (e) => {
    e.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0 || unchanged) return;
    onSave(cleaned);
  };

  return (
    <form className="panel editor" onSubmit={submit} noValidate onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <div className="panel-head">
        <h3 className="panel-title">{isNew ? "New booking type" : `Edit "${initial.name}"`}</h3>
        <button type="button" className="combo-btn editor-close" aria-label="Close without saving" onClick={onCancel}>
          <Icon name="x" />
        </button>
      </div>
      {isStandard && (
        <p className="hint">Standard type. Your edits apply only to you.</p>
      )}

      <div className="editor-grid">
        <div className="editor-fields">
          <Field
            label="Name"
            hint={`${draft.name.length}/${SERVICE_NAME_MAX}`}
            error={shown.name}
          >
            <input
              ref={nameRef}
              maxLength={SERVICE_NAME_MAX}
              value={draft.name}
              placeholder="e.g. Laboratory Output 1 checking"
              onChange={(e) => set({ name: e.target.value })}
            />
          </Field>
          {isNew && (
            <div className="ideas">
              <span className="hint">Ideas:</span>
              {SERVICE_IDEAS.filter((idea) => !takenNames.some((n) => sameName(n, idea))).map((idea) => (
                <button key={idea} type="button" className="idea" onClick={() => set({ name: idea })}>
                  {idea}
                </button>
              ))}
            </div>
          )}

          <fieldset className="field">
            <legend className="label">How long does it take?</legend>
            <div className="length-choices">
              {DURATION_CHOICES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className={`chip ${Number(draft.duration) === m ? "is-selected" : ""}`}
                  aria-pressed={Number(draft.duration) === m}
                  onClick={() => set({ duration: m })}
                >
                  <span className="chip-top">{m < 60 ? `${m} min` : `${m / 60} hr${m > 60 ? "s" : ""}`}</span>
                </button>
              ))}
              <label className={`chip chip-input ${customLength ? "is-selected" : ""}`}>
                <span className="sr-only">Other length in minutes</span>
                <input
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  placeholder="Other"
                  value={customLength ? draft.duration : ""}
                  onChange={(e) => set({ duration: e.target.value })}
                />
                <span className="chip-sub">min</span>
              </label>
            </div>
            {shown.duration ? (
              <p className="field-error">{shown.duration}</p>
            ) : (
              <p className="hint">
                {errors.duration ??
                  `${startsPerDay(teacher, Number(draft.duration))} start times a day`}
              </p>
            )}
          </fieldset>

          <Field
            label="Instructions for students (optional)"
            hint={`${draft.description.length}/${SERVICE_DESC_MAX}`}
          >
            <textarea
              rows={2}
              maxLength={SERVICE_DESC_MAX}
              value={draft.description}
              placeholder="e.g. Bring your laptop with the project running."
              onChange={(e) => set({ description: e.target.value })}
            />
          </Field>

          <label className="check">
            <input type="checkbox" checked={draft.asks} onChange={(e) => set({ asks: e.target.checked })} />
            <span>
              <strong>Ask students a question before they can book</strong>
            </span>
          </label>
          {draft.asks && (
            <div className="grid-2 question-fields">
              <Field label="Question" error={shown.question}>
                <input
                  maxLength={120}
                  value={draft.question}
                  placeholder="e.g. Which part should I check?"
                  onChange={(e) => set({ question: e.target.value })}
                />
              </Field>
              <Field label="Example answer (optional)">
                <input
                  maxLength={120}
                  value={draft.example}
                  placeholder="e.g. The login page and the database."
                  onChange={(e) => set({ example: e.target.value })}
                />
              </Field>
            </div>
          )}
        </div>

        <div className="editor-preview">
          <p className="label">What students will see</p>
          <ServiceChoice service={{ ...cleaned, duration: cleaned.duration || 0 }} checked preview />
          {cleaned.question && (
            <div className="preview-question">
              <p className="label">{cleaned.question}</p>
              <p className="preview-input">{cleaned.example || "Students type their answer here."}</p>
            </div>
          )}
        </div>
      </div>

      {showErrors && Object.keys(errors).length > 0 && <Alert tone="error" title="Fix the highlighted fields to save." />}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={unchanged}>
          {isNew ? "Create booking type" : "Save changes"}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function ServicesSection({ teacher, services, serviceById, appointments, confirm, onSaveService, onSetOffered }) {
  // null, "new", or the id of the booking type being edited
  const [editing, setEditing] = useState(null);

  const offered = teacher.serviceIds.map((id) => serviceById[id]).filter(Boolean);
  // A standard type this teacher made their own copy of stays hidden; the copy replaces it.
  const copied = new Set(services.filter((s) => s.providerId === teacher.id && s.basedOn).map((s) => s.basedOn));
  const off = services.filter(
    (s) => (s.providerId === null || s.providerId === teacher.id) && !s.oneOff && !teacher.serviceIds.includes(s.id) && !copied.has(s.id)
  );
  const upcoming = (id) => appointments.filter((a) => a.serviceId === id && ACTIVE.has(a.status) && a.date >= TODAY).length;

  const move = (index, step) => {
    const ids = [...teacher.serviceIds];
    [ids[index], ids[index + step]] = [ids[index + step], ids[index]];
    onSetOffered(ids);
  };

  const turnOff = (s) => {
    const count = upcoming(s.id);
    const last = offered.length === 1;
    const doIt = () =>
      onSetOffered(teacher.serviceIds.filter((id) => id !== s.id), `"${s.name}" is turned off. You can turn it back on below.`);
    if (!count && !last) return doIt();
    confirm({
      title: `Turn off "${s.name}"?`,
      message: [
        count && `${count} upcoming request${count > 1 ? "s" : ""} for it will stay as they are.`,
        last ? "It's your only booking type, so students won't be able to book you at all." : "New students won't be able to choose it.",
      ]
        .filter(Boolean)
        .join(" "),
      cancelLabel: "Keep it on",
      confirmLabel: "Turn off",
      onConfirm: doIt,
    });
  };

  const editingService = editing && editing !== "new" ? serviceById[editing] : null;
  const takenNames = [...offered, ...off.filter((s) => s.providerId)].filter((s) => s.id !== editingService?.id).map((s) => s.name);

  return (
    <section>
      <PageHeader
        title="Booking types"
        description="What students can book with you."
        actions={
          <button className="btn btn-primary" onClick={() => setEditing("new")} disabled={editing === "new"}>
            New booking type
          </button>
        }
      />

      <div className="hours-layout">
        <div className="services-main">
          {editing && (
            <ServiceEditor
              key={editing}
              isNew={editing === "new"}
              isStandard={editingService?.providerId === null}
              initial={editingService ?? EMPTY_SERVICE}
              teacher={teacher}
              takenNames={takenNames}
              onCancel={() => setEditing(null)}
              onSave={(fields) => {
                if (editing === "new") onSaveService({ ...fields, id: uid("sv"), providerId: teacher.id });
                else onSaveService({ ...editingService, ...fields }, editingService.id);
                setEditing(null);
              }}
            />
          )}

          <section className="panel" aria-labelledby="offered-title">
            <h3 id="offered-title" className="panel-title">
              Students can book <span className="count">{offered.length}</span>
            </h3>
            {offered.length === 0 ? (
              <EmptyState title="Students can't book you right now.">
                <button className="link" onClick={() => setEditing("new")}>
                  Create a booking type
                </button>{" "}
                or turn one back on below.
              </EmptyState>
            ) : (
              <ol className="item-list type-list">
                {offered.map((s, i) => {
                  const count = upcoming(s.id);
                  return (
                    <li key={s.id} className={`item type-item ${editing === s.id ? "is-editing" : ""}`}>
                      <div className="order-btns">
                        <button
                          type="button"
                          className="combo-btn"
                          aria-label={`Move "${s.name}" up`}
                          disabled={i === 0}
                          onClick={() => move(i, -1)}
                        >
                          <Icon name="chevron" />
                        </button>
                        <button
                          type="button"
                          className="combo-btn"
                          aria-label={`Move "${s.name}" down`}
                          disabled={i === offered.length - 1}
                          onClick={() => move(i, 1)}
                        >
                          <Icon name="chevron" />
                        </button>
                      </div>
                      <div className="item-main">
                        <p className="item-title">
                          {s.name} {s.providerId === null && <span className="tag">Standard</span>}
                        </p>
                        <p className="item-meta">
                          {s.duration} min
                          {s.question ? ` · asks "${s.question}"` : " · no question"}
                          {count > 0 && ` · ${count} upcoming`}
                        </p>
                        {s.description && <p className="hint">{s.description}</p>}
                      </div>
                      <div className="item-side type-actions">
                        <button className="btn btn-sm btn-secondary" onClick={() => setEditing(s.id)} disabled={editing === s.id}>
                          Edit
                        </button>
                        <button className="btn btn-sm btn-secondary" onClick={() => turnOff(s)}>
                          Turn off
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="hint type-order-hint">Students see them in this order.</p>
          </section>

          {off.length > 0 && (
            <section className="panel" aria-labelledby="off-title">
              <h3 id="off-title" className="panel-title">
                Turned off <span className="count">{off.length}</span>
              </h3>
              <ul className="item-list">
                {off.map((s) => (
                  <li key={s.id} className="item">
                    <div className="item-main">
                      <p className="item-title muted">
                        {s.name} {s.providerId === null && <span className="tag">Standard</span>}
                      </p>
                      <p className="item-meta">{s.duration} min · students can't choose this</p>
                    </div>
                    <div className="item-side">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => onSetOffered([...teacher.serviceIds, s.id], `"${s.name}" is turned on. Students can book it now.`)}
                      >
                        Turn on
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="hours-side">
          <section className="panel" aria-labelledby="student-view-title">
            <h3 id="student-view-title" className="panel-title">
              What students see
            </h3>
            {offered.length === 0 ? (
              <p className="muted side-empty">Nothing to choose yet.</p>
            ) : (
              <div className="choices choices-stack">
                {offered.map((s, i) => (
                  <ServiceChoice key={s.id} service={s} checked={i === 0} preview />
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}

/* ============================ Admin: shared =========================== */

const addDays = (key, n) => {
  const d = keyToDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
};
// Weeks start on Monday.
const weekStartOf = (key) => addDays(key, -((keyToDate(key).getDay() + 6) % 7));
const monthStartOf = (key) => `${key.slice(0, 8)}01`;
const monthEndOf = (key) => {
  const d = keyToDate(key);
  return dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
};

// Quick date ranges for records and reports. Empty from/to means no limit.
const DATE_RANGES = [
  { id: "today", label: "Today", from: TODAY, to: TODAY },
  { id: "week", label: "This week", from: weekStartOf(TODAY), to: addDays(weekStartOf(TODAY), 6) },
  { id: "month", label: "This month", from: monthStartOf(TODAY), to: monthEndOf(TODAY) },
  { id: "last30", label: "Last 30 days", from: addDays(TODAY, -29), to: TODAY },
  { id: "all", label: "All dates", from: "", to: "" },
];
const inRange = (date, from, to) => (!from || date >= from) && (!to || date <= to);

// "2026-10-20 18:45:50" -> "Oct 20, 6:45 PM"
const fmtStamp = (stamp) =>
  stamp ? new Date(stamp.replace(" ", "T")).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "–";

const isMakeup = (a) => a.serviceId === "makeup";

// Statuses an admin can filter by. "Pending" is anything not finished yet.
const RECORD_STATUSES = [
  { id: "all", label: "All statuses", test: () => true },
  { id: "pending", label: "Pending (not finished)", test: (a) => ACTIVE.has(a.status) },
  ...Object.entries(APPT_STATUS).map(([id, s]) => ({ id, label: id === "no_show" ? "Missed (no-show)" : s.label, test: (a) => a.status === id })),
];

const HISTORY_CATEGORIES = {
  appointment: "Appointment",
  makeup: "Make-up class",
  missed: "Missed",
  schedule: "Schedule change",
  queue: "Queue",
  account: "Account",
  room: "Room",
  service: "Booking type",
};
const CATEGORY_TONE = { appointment: "brand", makeup: "info", missed: "error", schedule: "warning", queue: "neutral", account: "neutral", room: "neutral", service: "neutral" };

// Saves rows as a CSV file Excel opens directly (the BOM keeps ñ and accents intact).
function downloadCsv(filename, rows) {
  const cell = (v) => {
    const text = String(v ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const blob = new Blob(["﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function StatTile({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <p className="stat-label">{label}</p>
      <p className="stat-value">{value}</p>
      {sub && <p className="stat-sub">{sub}</p>}
    </div>
  );
}

// Every teacher, grouped by college. Field passes id / aria props through.
function TeacherSelect({ providers, value, onChange, allLabel = "All teachers", ...rest }) {
  const colleges = [...new Set(providers.map((p) => p.college))].sort();
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)}>
      {allLabel && <option value="">{allLabel}</option>}
      {colleges.map((c) => (
        <optgroup key={c} label={shortCollege(c)}>
          {providers
            .filter((p) => p.college === c)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

// Rooms in use, plus the current one even if it was switched off.
function RoomSelect({ rooms, value, onChange, emptyLabel = "No room", ...rest }) {
  return (
    <select {...rest} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">{emptyLabel}</option>
      {[...new Set(rooms.map(buildingOf))].map((b) => (
        <optgroup key={b} label={b}>
          {rooms
            .filter((r) => buildingOf(r) === b && (r.active || r.id === value))
            .map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
                {r.floor ? ` · ${fmtFloor(r.floor)}` : ""}
                {r.active ? "" : " (not in use)"}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  );
}

function RangeChips({ from, to, onChange, label = "Dates" }) {
  const id = useId();
  return (
    <div className="quick-days">
      <span className="label" id={id}>
        {label}
      </span>
      <div className="range-chips" role="group" aria-labelledby={id}>
        {DATE_RANGES.map((r) => {
          const on = r.from === from && r.to === to;
          return (
            <button key={r.id} type="button" className={`pill ${on ? "is-selected" : ""}`} aria-pressed={on} onClick={() => onChange(r.from, r.to)}>
              {r.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SubTabs({ tabs, value, onChange, label }) {
  return (
    <div className="subtabs" role="tablist" aria-label={label}>
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={value === t.id}
          className={`subtab ${value === t.id ? "is-selected" : ""}`}
          onClick={() => onChange(t.id)}
        >
          {t.label}
          {t.count != null && <span className="count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// Per-student counts used by the records and the "attended a make-up class" style filters.
function studentStats(appointments) {
  const by = new Map();
  appointments.forEach((a) => {
    const key = a.studentId.toLowerCase();
    if (!by.has(key)) by.set(key, { pending: 0, completed: 0, missed: 0, makeups: 0, total: 0, last: null });
    const s = by.get(key);
    s.total++;
    if (ACTIVE.has(a.status)) s.pending++;
    if (a.status === "completed") s.completed++;
    if (a.status === "no_show") s.missed++;
    if (isMakeup(a) && a.status === "completed") s.makeups++;
    if (!s.last || a.date > s.last) s.last = a.date;
  });
  return by;
}

const EMPTY_STATS = { pending: 0, completed: 0, missed: 0, makeups: 0, total: 0, last: null };

/* =========================== Admin: Overview ========================== */

function AdminOverview({ data, providerById, roomById, syncedAt, goTo }) {
  const { appointments, queue, users, activity } = data;
  const week = { from: weekStartOf(TODAY), to: addDays(weekStartOf(TODAY), 6) };

  const today = appointments.filter((a) => a.date === TODAY && BLOCKING.has(a.status));
  const awaiting = appointments.filter((a) => a.status === "booked" && !hasStarted(a));
  const waiting = queue.filter((e) => e.status === "waiting");
  const serving = queue.filter((e) => e.status === "in_service");
  const weekMakeups = appointments.filter((a) => isMakeup(a) && BLOCKING.has(a.status) && inRange(a.date, week.from, week.to));
  const weekMissed = appointments.filter((a) => a.status === "no_show" && inRange(a.date, week.from, week.to));
  const movedToEnd = queue.filter((e) => e.missedCount > 0).length;

  // Teachers with something happening today.
  const busy = useMemo(() => {
    const by = new Map();
    const row = (id) => {
      if (!by.has(id)) by.set(id, { id, appts: 0, done: 0, waiting: 0, serving: null });
      return by.get(id);
    };
    appointments.filter((a) => a.date === TODAY && BLOCKING.has(a.status)).forEach((a) => {
      const r = row(a.providerId);
      r.appts++;
      if (a.status === "completed") r.done++;
    });
    queue.forEach((e) => {
      const r = row(e.providerId);
      if (e.status === "waiting") r.waiting++;
      if (e.status === "in_service") r.serving = e;
    });
    return [...by.values()].sort((a, b) => b.waiting - a.waiting || b.appts - a.appts);
  }, [appointments, queue]);

  const students = users.filter((u) => u.role === "student" && u.active).length;
  const teachers = users.filter((u) => u.role === "teacher" && u.active).length;

  return (
    <section>
      <PageHeader title="Overview" description={`Today, ${fmtDate(TODAY)}. Updates on its own every few seconds.`} />

      <div className="stats">
        <StatTile label="Today" value={today.length} sub={`${today.filter((a) => a.status === "completed").length} completed`} />
        <StatTile label="Awaiting approval" value={awaiting.length} sub="All teachers" tone={awaiting.length ? "warning" : undefined} />
        <StatTile label="In line" value={waiting.length} sub={movedToEnd ? `${movedToEnd} moved to end` : `${serving.length} being served`} />
        <StatTile label="Make-ups this week" value={weekMakeups.length} sub={`${weekMakeups.filter((a) => a.status === "completed").length} held`} />
        <StatTile label="No-shows this week" value={weekMissed.length} tone={weekMissed.length ? "error" : undefined} />
        <StatTile label="Accounts" value={students + teachers} sub={`${students} students, ${teachers} teachers`} />
      </div>

      <div className="admin-grid">
        <section className="panel" aria-labelledby="busy-title">
          <h3 id="busy-title" className="panel-title">
            Teachers today <span className="count">{busy.length}</span>
          </h3>
          {busy.length === 0 ? (
            <EmptyState title="No appointments or queues today yet." />
          ) : (
            <div className="table-wrap is-wide">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Teacher</th>
                    <th scope="col">Room</th>
                    <th scope="col">Appointments</th>
                    <th scope="col">In line</th>
                    <th scope="col">Now serving</th>
                  </tr>
                </thead>
                <tbody>
                  {busy.map((r) => {
                    const p = providerById[r.id];
                    return (
                      <tr key={r.id}>
                        <td>
                          <div className="strong">{p?.name ?? r.id}</div>
                          <div className="hint">{p && shortCollege(p.college)}</div>
                        </td>
                        <td>{roomLabel(roomById[p?.roomId]) || <span className="hint">Not set</span>}</td>
                        <td>
                          {r.appts} <span className="hint">({r.done} done)</span>
                        </td>
                        <td>{r.waiting}</td>
                        <td>{r.serving ? `${r.serving.ticket} ${r.serving.name}` : <span className="hint">No one</span>}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="panel" aria-labelledby="feed-title">
          <div className="panel-head">
            <h3 id="feed-title" className="panel-title">
              Latest activity
            </h3>
            <button className="link" onClick={() => goTo("reports")}>
              Full history
            </button>
          </div>
          {syncedAt && <p className="hint">Checked {syncedAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>}
          {activity.length === 0 ? (
            <EmptyState title="Nothing has happened yet.">Bookings, approvals, schedule changes and queue moves will show up here as they happen.</EmptyState>
          ) : (
            <ul className="feed">
              {activity.slice(0, 15).map((e) => (
                <li key={e.id} className="feed-item">
                  <Status tone={CATEGORY_TONE[e.category]}>{HISTORY_CATEGORIES[e.category]}</Status>
                  <p>{e.summary}</p>
                  <p className="hint">
                    {fmtStamp(e.at)} · {e.actorName}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}

/* ============================ Admin: Records ========================== */

const RECORD_VIEWS = [
  { id: "appointments", label: "Appointments" },
  { id: "students", label: "Students" },
  { id: "teachers", label: "Teachers" },
];
const EMPTY_APPT_FILTERS = { q: "", status: "all", kind: "all", providerId: "", roomId: "", from: "", to: "" };
const ROWS_PER_PAGE = 100;

function AdminRecords({ data, providerById, serviceById, roomById, act, notify, onVerify }) {
  const [view, setView] = useState("appointments");
  const [filters, setFilters] = useState(EMPTY_APPT_FILTERS);

  // From a student or teacher row straight to their appointments.
  const showAppointments = (patch) => {
    setFilters({ ...EMPTY_APPT_FILTERS, ...patch });
    setView("appointments");
  };

  return (
    <section>
      <PageHeader
        title="Records"
        description="Search and filter every appointment, student and teacher. Changes show up here as they happen."
        actions={
          <button className="btn btn-secondary" onClick={onVerify}>
            <Icon name="shield" /> Check a receipt
          </button>
        }
      />
      <SubTabs
        label="Records"
        value={view}
        onChange={setView}
        tabs={RECORD_VIEWS.map((v) => ({
          ...v,
          count: { appointments: data.appointments.length, students: undefined, teachers: data.providers.length }[v.id],
        }))}
      />
      {view === "appointments" && (
        <AppointmentRecords
          data={data}
          filters={filters}
          setFilters={setFilters}
          providerById={providerById}
          serviceById={serviceById}
          roomById={roomById}
          act={act}
          notify={notify}
        />
      )}
      {view === "students" && <StudentRecords data={data} onShow={(studentId) => showAppointments({ q: studentId })} />}
      {view === "teachers" && <TeacherRecords data={data} roomById={roomById} onShow={(providerId) => showAppointments({ providerId })} />}
    </section>
  );
}

function AppointmentRecords({ data, filters, setFilters, providerById, serviceById, roomById, act, notify }) {
  const [limit, setLimit] = useState(ROWS_PER_PAGE);
  const set = (patch) => {
    setFilters((f) => ({ ...f, ...patch }));
    setLimit(ROWS_PER_PAGE);
  };
  const { q, status, kind, providerId, roomId, from, to } = filters;

  const rows = useMemo(() => {
    const text = fold(q.trim());
    const test = RECORD_STATUSES.find((s) => s.id === status).test;
    return data.appointments
      .filter((a) => {
        if (!test(a) || !inRange(a.date, from, to)) return false;
        if (kind === "makeup" && !isMakeup(a)) return false;
        if (kind === "other" && isMakeup(a)) return false;
        if (providerId && a.providerId !== providerId) return false;
        if (roomId === "none" ? a.roomId != null : roomId && String(a.roomId) !== roomId) return false;
        if (!text) return true;
        const p = providerById[a.providerId];
        return [a.studentName, a.studentId, a.studentCourse, p?.name, serviceById[a.serviceId]?.name, a.groupLabel].some((v) => v && fold(v).includes(text));
      })
      .sort((a, b) => byDateTime(b, a));
  }, [data.appointments, q, status, kind, providerId, roomId, from, to, providerById, serviceById]);

  const filtered = JSON.stringify(filters) !== JSON.stringify(EMPTY_APPT_FILTERS);

  const assignRoom = async (a, room) => {
    const res = await act({ action: "set_appointment_room", appointmentId: a.id, roomId: room }, "admin.php");
    if (res) notify(`${a.groupLabel ? `The ${a.groupLabel} class` : a.studentName} is now in ${roomLabel(roomById[room]) || "no room"}.`);
  };

  const exportCsv = () =>
    downloadCsv(`appointments-${TODAY}.csv`, [
      ["Date", "Start", "End", "Student", "Student ID", "Course", "Year", "Teacher", "College", "Type", "Room", "Status", "Set by", "Class", "Student note", "Teacher note"],
      ...rows.map((a) => {
        const p = providerById[a.providerId];
        return [
          a.date, fmtTime(a.start), fmtTime(a.end), a.studentName, a.studentId, a.studentCourse, a.studentYear ?? "",
          p?.name, p && shortCollege(p.college), serviceById[a.serviceId]?.name, roomLabel(roomById[a.roomId]),
          APPT_STATUS[a.status].label, a.assignedBy === "teacher" ? "Teacher" : "Student", a.groupLabel ?? "", a.note, a.teacherNote,
        ];
      }),
    ]);

  return (
    <div className="panel">
      <div className="filters">
        <Field label="Search" className="filters-wide">
          <input type="search" placeholder="Student name or ID, teacher, course, booking type" value={q} onChange={(e) => set({ q: e.target.value })} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => set({ status: e.target.value })}>
            {RECORD_STATUSES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select value={kind} onChange={(e) => set({ kind: e.target.value })}>
            <option value="all">All types</option>
            <option value="makeup">Make-up classes</option>
            <option value="other">Everything but make-up classes</option>
          </select>
        </Field>
        <Field label="Teacher">
          <TeacherSelect providers={data.providers} value={providerId} onChange={(v) => set({ providerId: v })} />
        </Field>
        <Field label="Room">
          <select value={roomId} onChange={(e) => set({ roomId: e.target.value })}>
            <option value="">All rooms</option>
            <option value="none">No room set</option>
            {data.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {roomLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </Field>
        <Field label="To">
          <input type="date" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </Field>
      </div>
      <RangeChips from={from} to={to} onChange={(f, t) => set({ from: f, to: t })} />
      <div className="quick-filters" role="group" aria-label="Common searches">
        <button type="button" className="pill" onClick={() => set({ ...EMPTY_APPT_FILTERS, kind: "makeup", status: "completed" })}>
          Attended make-up classes
        </button>
        <button type="button" className="pill" onClick={() => set({ ...EMPTY_APPT_FILTERS, status: "pending" })}>
          Pending appointments
        </button>
        <button type="button" className="pill" onClick={() => set({ ...EMPTY_APPT_FILTERS, status: "completed" })}>
          Completed appointments
        </button>
        <button type="button" className="pill" onClick={() => set({ ...EMPTY_APPT_FILTERS, status: "no_show" })}>
          Missed appointments
        </button>
      </div>

      <div className="records-head">
        <p className="hint" aria-live="polite">
          {rows.length} of {data.appointments.length} appointments
          {filtered && (
            <>
              {" · "}
              <button className="link" onClick={() => set(EMPTY_APPT_FILTERS)}>
                Clear filters
              </button>
            </>
          )}
        </p>
        <button className="btn btn-sm btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
          <Icon name="download" /> Download CSV
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No appointments match these filters." />
      ) : (
        <div className="table-wrap is-wide">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Date and time</th>
                <th scope="col">Student</th>
                <th scope="col">Teacher</th>
                <th scope="col">Type</th>
                <th scope="col">Room</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((a) => {
                const p = providerById[a.providerId];
                const st = APPT_STATUS[a.status];
                return (
                  <tr key={a.id} className={ACTIVE.has(a.status) ? "" : "row-closed"}>
                    <td>
                      <div>{fmtDate(a.date)}</div>
                      <div className="hint">{fmtRange(a.start, a.end)}</div>
                    </td>
                    <td>
                      <div className="strong">{a.studentName}</div>
                      <div className="hint">{[a.studentId, studentInfo(a)].filter(Boolean).join(" · ")}</div>
                      {a.groupLabel && <span className="tag">Class: {a.groupLabel}</span>}
                    </td>
                    <td>
                      <div>{p?.name ?? a.providerId}</div>
                      <div className="hint">{p && shortCollege(p.college)}</div>
                    </td>
                    <td>
                      <div>{serviceById[a.serviceId]?.name}</div>
                      <div className="hint">{a.assignedBy === "teacher" ? "Set by teacher" : "Requested by student"}</div>
                    </td>
                    <td>
                      <RoomSelect
                        rooms={data.rooms}
                        value={a.roomId}
                        onChange={(room) => assignRoom(a, room)}
                        aria-label={`Room for ${a.studentName}, ${fmtDate(a.date)}`}
                        className="select-sm"
                      />
                    </td>
                    <td>
                      <Status tone={st.tone}>{st.label}</Status>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > limit && (
        <button className="btn btn-secondary btn-block show-more" onClick={() => setLimit((n) => n + ROWS_PER_PAGE)}>
          Show {Math.min(ROWS_PER_PAGE, rows.length - limit)} more
        </button>
      )}
    </div>
  );
}

const STUDENT_FLAGS = [
  { id: "all", label: "All students", test: () => true },
  { id: "makeup", label: "Attended a make-up class", test: (s) => s.makeups > 0 },
  { id: "pending", label: "Has pending appointments", test: (s) => s.pending > 0 },
  { id: "completed", label: "Has completed appointments", test: (s) => s.completed > 0 },
  { id: "missed", label: "Missed an appointment", test: (s) => s.missed > 0 },
  { id: "noaccount", label: "No account yet", test: (_stats, st) => !st.username },
];

function StudentRecords({ data, onShow }) {
  const [q, setQ] = useState("");
  const [flag, setFlag] = useState("all");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("");

  const stats = useMemo(() => studentStats(data.appointments), [data.appointments]);
  const accounts = useMemo(
    () => Object.fromEntries(data.users.filter((u) => u.role === "student").map((u) => [u.studentId.toLowerCase(), u])),
    [data.users]
  );
  const students = useMemo(
    () =>
      data.students.map((st) => ({
        ...st,
        username: accounts[st.studentId.toLowerCase()]?.username,
        stats: stats.get(st.studentId.toLowerCase()) ?? EMPTY_STATS,
      })),
    [data.students, accounts, stats]
  );
  const courses = [...new Set(students.map((s) => s.course).filter(Boolean))].sort();

  const rows = students.filter((st) => {
    const text = fold(q.trim());
    if (text && ![st.name, st.studentId, st.username].some((v) => v && fold(v).includes(text))) return false;
    if (course && st.course !== course) return false;
    if (year && String(st.year) !== year) return false;
    return STUDENT_FLAGS.find((f) => f.id === flag).test(st.stats, st);
  });

  const exportCsv = () =>
    downloadCsv(`students-${TODAY}.csv`, [
      ["Name", "Student ID", "Course", "Year", "Username", "Pending", "Completed", "Missed", "Make-up classes attended", "Last appointment"],
      ...rows.map((st) => [st.name, st.studentId, st.course, st.year ?? "", st.username ?? "", st.stats.pending, st.stats.completed, st.stats.missed, st.stats.makeups, st.stats.last ?? ""]),
    ]);

  return (
    <div className="panel">
      <div className="filters">
        <Field label="Search" className="filters-wide">
          <input type="search" placeholder="Name, student ID or username" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label="Show">
          <select value={flag} onChange={(e) => setFlag(e.target.value)}>
            {STUDENT_FLAGS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Course">
          <select value={course} onChange={(e) => setCourse(e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Year level">
          <select value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">All years</option>
            {YEAR_LEVELS.map((y) => (
              <option key={y} value={y}>
                {fmtYear(y)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="records-head">
        <p className="hint" aria-live="polite">
          {rows.length} of {students.length} students
        </p>
        <button className="btn btn-sm btn-secondary" onClick={exportCsv} disabled={rows.length === 0}>
          <Icon name="download" /> Download CSV
        </button>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="No students match." />
      ) : (
        <div className="table-wrap is-wide">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Course and year</th>
                <th scope="col">Account</th>
                <th scope="col">Pending</th>
                <th scope="col">Completed</th>
                <th scope="col">Missed</th>
                <th scope="col">Make-ups attended</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((st) => (
                <tr key={st.studentId}>
                  <td>
                    <div className="strong">{st.name}</div>
                    <div className="hint">{st.studentId}</div>
                  </td>
                  <td>{[st.course, st.year && fmtYear(st.year)].filter(Boolean).join(" · ") || <span className="hint">–</span>}</td>
                  <td>{st.username ?? <span className="hint">None</span>}</td>
                  <td>{st.stats.pending}</td>
                  <td>{st.stats.completed}</td>
                  <td className={st.stats.missed ? "text-error" : ""}>{st.stats.missed}</td>
                  <td>{st.stats.makeups}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => onShow(st.studentId)} disabled={!st.stats.total}>
                      Appointments
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeacherRecords({ data, roomById, onShow }) {
  const [q, setQ] = useState("");
  const [college, setCollege] = useState("");
  const [roomId, setRoomId] = useState("");

  const counts = useMemo(() => {
    const by = {};
    data.appointments.forEach((a) => {
      const c = (by[a.providerId] ??= { upcoming: 0, awaiting: 0, completed: 0, missed: 0, makeups: 0 });
      if (ACTIVE.has(a.status) && a.date >= TODAY) c.upcoming++;
      if (a.status === "booked" && !hasStarted(a)) c.awaiting++;
      if (a.status === "completed") c.completed++;
      if (a.status === "no_show") c.missed++;
      if (isMakeup(a) && BLOCKING.has(a.status)) c.makeups++;
    });
    return by;
  }, [data.appointments]);
  const accounts = Object.fromEntries(data.users.filter((u) => u.role === "teacher").map((u) => [u.providerId, u]));
  const colleges = [...new Set(data.providers.map((p) => p.college))].sort();

  const rows = data.providers.filter((p) => {
    const text = fold(q.trim());
    if (text && ![p.name, p.id, accounts[p.id]?.username].some((v) => v && fold(v).includes(text))) return false;
    if (college && p.college !== college) return false;
    if (roomId === "none" ? p.roomId != null : roomId && String(p.roomId) !== roomId) return false;
    return true;
  });

  return (
    <div className="panel">
      <div className="filters">
        <Field label="Search" className="filters-wide">
          <input type="search" placeholder="Name, teacher ID or username" value={q} onChange={(e) => setQ(e.target.value)} />
        </Field>
        <Field label="College or department">
          <select value={college} onChange={(e) => setCollege(e.target.value)}>
            <option value="">All colleges</option>
            {colleges.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Room">
          <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">All rooms</option>
            <option value="none">No room set</option>
            {data.rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {roomLabel(r)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="hint records-head" aria-live="polite">
        {rows.length} of {data.providers.length} teachers
      </p>
      <div className="table-wrap is-wide">
        <table className="table">
          <thead>
            <tr>
              <th scope="col">Teacher</th>
              <th scope="col">Hours (Mon–Sat)</th>
              <th scope="col">Room</th>
              <th scope="col">Account</th>
              <th scope="col">Upcoming</th>
              <th scope="col">Awaiting approval</th>
              <th scope="col">Completed</th>
              <th scope="col">Missed</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const c = counts[p.id] ?? { upcoming: 0, awaiting: 0, completed: 0, missed: 0 };
              return (
                <tr key={p.id}>
                  <td>
                    <div className="strong">{p.name}</div>
                    <div className="hint">
                      {p.id} · {shortCollege(p.college)}
                    </div>
                  </td>
                  <td>
                    <div>{fmtRange(toMin(p.workStart), toMin(p.workEnd))}</div>
                    <div className="hint">Lunch {fmtRange(toMin(p.lunchStart), toMin(p.lunchEnd))}</div>
                  </td>
                  <td>{roomLabel(roomById[p.roomId]) || <span className="hint">Not set</span>}</td>
                  <td>{accounts[p.id]?.username ?? <span className="hint">None</span>}</td>
                  <td>{c.upcoming}</td>
                  <td>{c.awaiting}</td>
                  <td>{c.completed}</td>
                  <td className={c.missed ? "text-error" : ""}>{c.missed}</td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => onShow(p.id)}>
                      Appointments
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================== Admin: Accounts ========================== */

const ACCOUNT_ROLES = [
  { id: "student", label: "Student" },
  { id: "teacher", label: "Teacher" },
  { id: "admin", label: "Admin" },
];
const EMPTY_ACCOUNT = {
  role: "student", username: "", password: "",
  studentId: "", name: "", course: "", year: "",
  teacherMode: "existing", providerId: "", college: "", roomId: null,
};
const USERNAME_PATTERN = /^[a-z0-9._-]{3,30}$/;
const TEACHER_NAME_PATTERN = /^[\p{L}][\p{L} .,'-]{1,59}$/u;

// Checks an account form; returns { field: problem }.
function accountProblems(f, { creating }) {
  const e = {};
  if (!USERNAME_PATTERN.test(f.username.trim().toLowerCase())) e.username = "3 to 30 characters: lowercase letters, numbers, dots, dashes or underscores.";
  if (creating && !PASSWORD_RULES.every((r) => r.test(f.password))) e.password = "At least 8 characters, with letters and numbers.";
  if (f.role === "student") {
    if (creating && !STUDENT_ID_PATTERN.test(f.studentId.trim())) e.studentId = "Use the format on the school ID, like 2024-00123.";
    if (!NAME_PATTERN.test(f.name.trim())) e.name = "Letters, spaces, periods, hyphens and apostrophes, 2 to 60 characters.";
    if (!COURSE_PATTERN.test(f.course.trim())) e.course = "Enter the course, like BSIT.";
    if (!f.year) e.year = "Choose the year level.";
  }
  if (f.role === "teacher" && (!creating || f.teacherMode === "new")) {
    if (!TEACHER_NAME_PATTERN.test(f.name.trim())) e.name = "Write it as Surname, First name M.";
    if (!f.college) e.college = "Choose the college or department.";
  }
  if (f.role === "teacher" && creating && f.teacherMode === "existing" && !f.providerId) e.providerId = "Choose the teacher.";
  return e;
}

function AdminAccounts({ data, me, act, notify, confirm }) {
  const [form, setForm] = useState(EMPTY_ACCOUNT);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [editing, setEditing] = useState(null);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [state, setState] = useState("");

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors((e) => {
      const next = { ...e };
      Object.keys(patch).forEach((k) => delete next[k]);
      return next;
    });
  };

  const withoutAccount = data.providers.filter((p) => !p.hasAccount);
  const studentAccounts = new Set(data.users.filter((u) => u.role === "student").map((u) => u.studentId.toLowerCase()));
  // A student already on record (a teacher scheduled them) fills in their details.
  const known = form.role === "student" && STUDENT_ID_PATTERN.test(form.studentId.trim())
    ? data.students.find((s) => s.studentId === form.studentId.trim())
    : null;

  const create = async (e) => {
    e.preventDefault();
    const problems = accountProblems(form, { creating: true });
    if (form.role === "student" && studentAccounts.has(form.studentId.trim().toLowerCase())) problems.studentId = "This student already has an account.";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    setSaving(true);
    const res = await act(
      {
        action: "create_account",
        role: form.role,
        username: form.username.trim().toLowerCase(),
        password: form.password,
        name: form.name.trim(),
        student: { studentId: form.studentId.trim(), name: form.name.trim(), course: form.course.trim(), year: Number(form.year) },
        teacher:
          form.teacherMode === "existing"
            ? { providerId: form.providerId }
            : { name: form.name.trim(), college: form.college, roomId: form.roomId },
      },
      "admin.php"
    );
    setSaving(false);
    if (!res) return;
    notify(`The ${form.role} account "${form.username.trim().toLowerCase()}" is ready. Give them their username and password.`);
    setForm({ ...EMPTY_ACCOUNT, role: form.role });
  };

  const rows = data.users
    .filter((u) => {
      const text = fold(q.trim());
      if (text && ![u.name, u.username, u.studentId, u.providerId].some((v) => v && fold(v).includes(text))) return false;
      if (role && u.role !== role) return false;
      if (state && String(u.active) !== state) return false;
      return true;
    })
    .sort((a, b) => a.role.localeCompare(b.role) || a.name.localeCompare(b.name));

  const toggleActive = (u) =>
    confirm({
      title: u.active ? `Switch off ${u.username}?` : `Switch ${u.username} back on?`,
      message: u.active
        ? `${u.name} won't be able to sign in. Their appointments and history stay. You can switch the account back on any time.`
        : `${u.name} will be able to sign in again.`,
      cancelLabel: "Go back",
      confirmLabel: u.active ? "Switch off" : "Switch on",
      onConfirm: async () => {
        if (await act({ action: "update_account", id: u.id, active: !u.active }, "admin.php"))
          notify(`${u.username} is switched ${u.active ? "off" : "on"}.`);
      },
    });

  return (
    <section>
      <PageHeader title="Accounts" description="Register students, teachers and other admins, and manage their sign-in." />

      <div className="admin-grid admin-grid-form">
        <form className="panel" onSubmit={create} noValidate aria-labelledby="new-account-title">
          <h3 id="new-account-title" className="panel-title">
            <Icon name="plus" /> Register an account
          </h3>
          <div className="login-roles account-roles" role="radiogroup" aria-label="Account type">
            {ACCOUNT_ROLES.map((r) => (
              <button
                key={r.id}
                type="button"
                role="radio"
                aria-checked={form.role === r.id}
                className={`login-role ${form.role === r.id ? "is-selected" : ""}`}
                onClick={() => {
                  setForm({ ...EMPTY_ACCOUNT, role: r.id, username: form.username, password: form.password });
                  setErrors({});
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          {form.role === "student" && (
            <div className="grid-2">
              <Field label="Student ID" hint="Like 2024-00123" error={errors.studentId}>
                <input
                  value={form.studentId}
                  maxLength={10}
                  inputMode="numeric"
                  onChange={(e) => {
                    const id = e.target.value;
                    const match = data.students.find((s) => s.studentId === id.trim());
                    set(match ? { studentId: id, name: match.name, course: match.course, year: match.year ? String(match.year) : "" } : { studentId: id });
                  }}
                />
              </Field>
              <Field label="Full name" error={errors.name}>
                <input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Course" hint="Like BSIT" error={errors.course}>
                <input value={form.course} maxLength={COURSE_MAX} onChange={(e) => set({ course: e.target.value })} />
              </Field>
              <Field label="Year level" error={errors.year}>
                <select value={form.year} onChange={(e) => set({ year: e.target.value })}>
                  <option value="">Choose…</option>
                  {YEAR_LEVELS.map((y) => (
                    <option key={y} value={y}>
                      {fmtYear(y)}
                    </option>
                  ))}
                </select>
              </Field>
              {known && <p className="hint grid-span">Already on record from a teacher's booking. Their details were filled in.</p>}
            </div>
          )}

          {form.role === "teacher" && (
            <>
              <div className="choices mode-choices" role="radiogroup" aria-label="Which teacher?">
                {[
                  { id: "existing", label: "On the teacher list", sub: `${withoutAccount.length} without an account` },
                  { id: "new", label: "New teacher", sub: "Not on the list yet" },
                ].map((m) => (
                  <label key={m.id} className={`choice ${form.teacherMode === m.id ? "is-selected" : ""}`}>
                    <input type="radio" name="teacher-mode" checked={form.teacherMode === m.id} onChange={() => set({ teacherMode: m.id })} />
                    <span className="choice-name">{m.label}</span>
                    <span className="choice-meta">{m.sub}</span>
                  </label>
                ))}
              </div>
              {form.teacherMode === "existing" ? (
                <Field label="Teacher" error={errors.providerId}>
                  <TeacherSelect providers={withoutAccount} value={form.providerId} onChange={(v) => set({ providerId: v })} allLabel="Choose…" />
                </Field>
              ) : (
                <div className="grid-2">
                  <Field label="Name" hint="Surname, First name M." error={errors.name}>
                    <input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
                  </Field>
                  <Field label="College or department" error={errors.college}>
                    <select value={form.college} onChange={(e) => set({ college: e.target.value })}>
                      <option value="">Choose…</option>
                      {COLLEGES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Room" hint="Optional">
                    <RoomSelect rooms={data.rooms} value={form.roomId} onChange={(v) => set({ roomId: v })} />
                  </Field>
                </div>
              )}
            </>
          )}

          {form.role === "admin" && (
            <Field label="Name" hint="Shown in the history next to what they do">
              <input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
            </Field>
          )}

          <div className="grid-2">
            <Field label="Username" error={errors.username}>
              <input value={form.username} maxLength={30} autoCapitalize="none" spellCheck={false} autoComplete="off" onChange={(e) => set({ username: e.target.value })} />
            </Field>
            <Field label="Password" hint="At least 8 characters, letters and numbers" error={errors.password}>
              <PasswordInput value={form.password} onChange={(v) => set({ password: v })} shown={showPassword} onToggle={() => setShowPassword((s) => !s)} autoComplete="new-password" />
            </Field>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? "Registering…" : `Register ${form.role}`}
            </button>
          </div>
        </form>

        {editing ? (
          <AccountEditor key={editing} account={data.users.find((u) => u.id === editing)} data={data} me={me} act={act} notify={notify} onClose={() => setEditing(null)} />
        ) : (
          <section className="panel side-note">
            <h3 className="panel-title">How accounts work</h3>
            <ul className="tips">
              <li>Students sign in with the username and password you give them, and can change the password from their profile.</li>
              <li>Teacher accounts link to a teacher on the list, so their hours, booking types and history follow them.</li>
              <li>Switching an account off stops sign-in but keeps every appointment and record.</li>
            </ul>
          </section>
        )}
      </div>

      <section className="panel" aria-labelledby="accounts-title">
        <h3 id="accounts-title" className="panel-title">
          All accounts <span className="count">{data.users.length}</span>
        </h3>
        <div className="filters">
          <Field label="Search" className="filters-wide">
            <input type="search" placeholder="Name, username, student or teacher ID" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Field label="Type">
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">All types</option>
              {ACCOUNT_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}s
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status">
            <select value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">On and off</option>
              <option value="true">On</option>
              <option value="false">Switched off</option>
            </select>
          </Field>
        </div>
        <div className="table-wrap is-wide">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Username</th>
                <th scope="col">Type</th>
                <th scope="col">Last sign-in</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className={u.active ? "" : "row-closed"}>
                  <td>
                    <div className="strong">{u.name}</div>
                    <div className="hint">{u.studentId ?? u.providerId ?? "–"}</div>
                  </td>
                  <td>{u.username}</td>
                  <td>{ACCOUNT_ROLES.find((r) => r.id === u.role).label}</td>
                  <td>{fmtStamp(u.lastLoginAt)}</td>
                  <td>
                    <Status tone={u.active ? "success" : "neutral"}>{u.active ? "On" : "Switched off"}</Status>
                  </td>
                  <td>
                    <div className="actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => setEditing(u.id)}>
                        Edit
                      </button>
                      {u.id !== me.userId && (
                        <button className="btn btn-sm btn-secondary" onClick={() => toggleActive(u)}>
                          {u.active ? "Switch off" : "Switch on"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function AccountEditor({ account, data, me, act, notify, onClose }) {
  const student = account.role === "student" ? data.students.find((s) => s.studentId === account.studentId) : null;
  const teacher = account.role === "teacher" ? data.providers.find((p) => p.id === account.providerId) : null;
  const [form, setForm] = useState({
    ...EMPTY_ACCOUNT,
    role: account.role,
    username: account.username,
    name: student?.name ?? teacher?.name ?? account.name,
    course: student?.course ?? "",
    year: student?.year ? String(student.year) : "",
    college: teacher?.college ?? "",
  });
  const [errors, setErrors] = useState({});
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [shown, setShown] = useState(false);
  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };

  const save = async (e) => {
    e.preventDefault();
    const problems = accountProblems(form, { creating: false });
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const res = await act(
      {
        action: "update_account",
        id: account.id,
        username: form.username.trim().toLowerCase(),
        ...(account.role === "student" ? { student: { name: form.name.trim(), course: form.course.trim(), year: Number(form.year) } } : {}),
        ...(account.role === "teacher" ? { teacher: { name: form.name.trim(), college: form.college } } : {}),
        ...(account.role === "admin" ? { name: form.name.trim() } : {}),
      },
      "admin.php"
    );
    if (res) {
      notify(`${form.username.trim().toLowerCase()} is updated.`);
      onClose();
    }
  };

  const reset = async () => {
    if (!PASSWORD_RULES.every((r) => r.test(password))) return setPasswordError("At least 8 characters, with letters and numbers.");
    if (await act({ action: "reset_password", id: account.id, password }, "admin.php")) {
      notify(`The password for ${account.username} was reset. Give them the new one.`);
      setPassword("");
    }
  };

  return (
    <section className="panel editor" aria-labelledby="edit-account-title">
      <div className="panel-head">
        <h3 id="edit-account-title" className="panel-title">
          Edit {account.username}
        </h3>
        <button className="combo-btn editor-close" aria-label="Close" onClick={onClose}>
          <Icon name="x" />
        </button>
      </div>
      <form onSubmit={save} noValidate>
        <div className="grid-2">
          <Field label="Username" error={errors.username}>
            <input value={form.username} maxLength={30} autoCapitalize="none" spellCheck={false} onChange={(e) => set({ username: e.target.value })} />
          </Field>
          <Field label="Name" error={errors.name}>
            <input value={form.name} maxLength={60} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          {account.role === "student" && (
            <>
              <Field label="Course" error={errors.course}>
                <input value={form.course} maxLength={COURSE_MAX} onChange={(e) => set({ course: e.target.value })} />
              </Field>
              <Field label="Year level" error={errors.year}>
                <select value={form.year} onChange={(e) => set({ year: e.target.value })}>
                  {YEAR_LEVELS.map((y) => (
                    <option key={y} value={y}>
                      {fmtYear(y)}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          {account.role === "teacher" && (
            <Field label="College or department" error={errors.college}>
              <select value={form.college} onChange={(e) => set({ college: e.target.value })}>
                {[...new Set([form.college, ...COLLEGES])].filter(Boolean).map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          )}
        </div>
        <p className="hint">
          {account.role === "student" ? `Student ID ${account.studentId}` : account.role === "teacher" ? `Teacher ID ${account.providerId}` : "Administrator"}
          {account.id === me.userId && " · this is you"}
        </p>
        <div className="form-actions">
          <button type="submit" className="btn btn-primary">
            Save changes
          </button>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>

      <div className="editor-divider">
        <Field label="New password" hint="Give it to them in person; they can change it from their profile" error={passwordError}>
          <PasswordInput
            value={password}
            onChange={(v) => {
              setPassword(v);
              setPasswordError("");
            }}
            shown={shown}
            onToggle={() => setShown((s) => !s)}
            autoComplete="new-password"
          />
        </Field>
        <button type="button" className="btn btn-secondary" onClick={reset} disabled={!password}>
          Reset password
        </button>
      </div>
    </section>
  );
}

/* ============================ Admin: Rooms ============================ */

const EMPTY_ROOM = { name: "", building: "", floor: "", capacity: "", notes: "", active: true };

function AdminRooms({ data, providerById, serviceById, roomById, act, notify, confirm }) {
  const [form, setForm] = useState(EMPTY_ROOM);
  const [errors, setErrors] = useState({});
  const [teacherId, setTeacherId] = useState("");
  const [teacherRoom, setTeacherRoom] = useState(null);
  const [moveUpcoming, setMoveUpcoming] = useState(true);
  const [day, setDay] = useState(TODAY);
  const [dayRoom, setDayRoom] = useState("");

  const set = (patch) => {
    setForm((f) => ({ ...f, ...patch }));
    setErrors({});
  };

  const saveRoom = async (e) => {
    e.preventDefault();
    const problems = {};
    if (!form.name.trim()) problems.name = "Give the room a name, like Room 201.";
    const cap = form.capacity === "" ? null : Number(form.capacity);
    if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 500)) problems.capacity = "How many people fit, 1 to 500, or leave it empty.";
    const floor = form.floor === "" ? null : Number(form.floor);
    if (floor !== null && (!Number.isInteger(floor) || floor < 1 || floor > 20)) problems.floor = "A floor from 1 to 20, or leave it empty.";
    setErrors(problems);
    if (Object.keys(problems).length) return;
    const res = await act({ action: "save_room", room: { ...form, capacity: cap, floor } }, "admin.php");
    if (!res) return;
    notify(`${form.name.trim()} is ${form.id ? "updated" : "added"}.`);
    setForm(EMPTY_ROOM);
  };

  const deleteRoom = (r) =>
    confirm({
      title: `Delete ${r.name}?`,
      message: "Teachers and appointments in this room will have no room set. The history keeps its name. To keep it for past records, edit it and switch off \"In use\" instead.",
      cancelLabel: "Keep room",
      confirmLabel: "Delete room",
      onConfirm: async () => {
        if (await act({ action: "delete_room", id: r.id }, "admin.php")) notify(`${r.name} was deleted.`);
      },
    });

  const saveTeacherRoom = async (e) => {
    e.preventDefault();
    if (!teacherId) return;
    const res = await act({ action: "set_teacher_room", providerId: teacherId, roomId: teacherRoom, applyToUpcoming: moveUpcoming }, "admin.php");
    if (res)
      notify(
        `${providerById[teacherId]?.name ?? "The teacher"} is in ${roomLabel(roomById[teacherRoom]) || "no room"}${res.moved ? `; ${res.moved} upcoming appointment${res.moved > 1 ? "s" : ""} moved there` : ""}.`
      );
  };

  const assignRoom = async (a, room) => {
    const res = await act({ action: "set_appointment_room", appointmentId: a.id, roomId: room }, "admin.php");
    if (res) notify(`${a.groupLabel ? `The ${a.groupLabel} class` : a.studentName} is now in ${roomLabel(roomById[room]) || "no room"}.`);
  };

  // Usage per room: teachers based there and upcoming bookings.
  const usage = useMemo(() => {
    const by = {};
    data.providers.forEach((p) => p.roomId && ((by[p.roomId] ??= { teachers: 0, upcoming: 0 }).teachers += 1));
    data.appointments.forEach((a) => a.roomId && ACTIVE.has(a.status) && a.date >= TODAY && ((by[a.roomId] ??= { teachers: 0, upcoming: 0 }).upcoming += 1));
    return by;
  }, [data.providers, data.appointments]);

  // One row per session: a class booked together shows once.
  const sessions = (list) => {
    const seen = new Set();
    return list.filter((a) => {
      if (!a.groupId) return true;
      if (seen.has(a.groupId)) return false;
      seen.add(a.groupId);
      return true;
    });
  };
  const groupSize = useMemo(() => {
    const by = {};
    data.appointments.forEach((a) => a.groupId && (by[a.groupId] = (by[a.groupId] ?? 0) + 1));
    return by;
  }, [data.appointments]);

  const upcomingMakeups = sessions(
    data.appointments.filter((a) => isMakeup(a) && ["booked", "confirmed"].includes(a.status) && a.date >= TODAY).sort(byDateTime)
  );

  // The room schedule for one day, with any two teachers booked into the same room at once flagged.
  const daySessions = sessions(
    data.appointments
      .filter((a) => a.date === day && a.roomId != null && BLOCKING.has(a.status) && (!dayRoom || String(a.roomId) === dayRoom))
      .sort((a, b) => a.roomId - b.roomId || a.start - b.start)
  );
  const clashing = new Set(
    daySessions
      .filter((a) => daySessions.some((b) => b !== a && b.roomId === a.roomId && b.providerId !== a.providerId && clashes(b.start, b.end, a.start, a.end)))
      .map((a) => a.id)
  );
  const byRoom = data.rooms.filter((r) => daySessions.some((a) => a.roomId === r.id));

  const teachersWithRooms = data.providers.filter((p) => p.roomId).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <section>
      <PageHeader title="Rooms" description="Set up rooms and decide where teachers, schedules and make-up classes happen." />

      <div className="admin-grid admin-grid-form">
        <section className="panel" aria-labelledby="rooms-title">
          <h3 id="rooms-title" className="panel-title">
            Rooms <span className="count">{data.rooms.length}</span>
          </h3>
          {data.rooms.length === 0 ? (
            <EmptyState title="No rooms yet.">Add the first one with the form.</EmptyState>
          ) : (
            <div className="table-wrap is-wide">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Room</th>
                    <th scope="col">Seats</th>
                    <th scope="col">Teachers</th>
                    <th scope="col">Upcoming</th>
                    <th scope="col">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rooms.map((r) => (
                    <tr key={r.id} className={r.active ? "" : "row-closed"}>
                      <td>
                        <div className="strong">
                          {r.name}
                          {!r.active && <span className="tag">Not in use</span>}
                        </div>
                        <div className="hint">{[r.building, r.floor && fmtFloor(r.floor), r.notes].filter(Boolean).join(" · ")}</div>
                      </td>
                      <td>{r.capacity ?? <span className="hint">–</span>}</td>
                      <td>{usage[r.id]?.teachers ?? 0}</td>
                      <td>{usage[r.id]?.upcoming ?? 0}</td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-sm btn-secondary" onClick={() => setForm({ ...r, capacity: r.capacity ? String(r.capacity) : "", floor: r.floor ? String(r.floor) : "" })}>
                            Edit
                          </button>
                          <button className="btn btn-sm btn-secondary" onClick={() => deleteRoom(r)}>
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <form className="panel" onSubmit={saveRoom} noValidate aria-labelledby="room-form-title">
          <div className="panel-head">
            <h3 id="room-form-title" className="panel-title">
              {form.id ? `Edit ${roomById[form.id]?.name}` : "Add a room"}
            </h3>
            {form.id && (
              <button type="button" className="link" onClick={() => setForm(EMPTY_ROOM)}>
                Add a new one instead
              </button>
            )}
          </div>
          <div className="grid-2">
            <Field label="Name" hint="Like Room 201" error={errors.name}>
              <input value={form.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} />
            </Field>
            <Field label="Building" hint="Pick one or type a new one">
              <input list="building-names" value={form.building} maxLength={60} onChange={(e) => set({ building: e.target.value })} />
            </Field>
            <datalist id="building-names">
              {[...new Set(data.rooms.map((r) => r.building).filter(Boolean))].map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <Field label="Floor" hint="Optional" error={errors.floor}>
              <input type="number" min={1} max={20} inputMode="numeric" value={form.floor} onChange={(e) => set({ floor: e.target.value })} />
            </Field>
            <Field label="Seats" hint="Optional" error={errors.capacity}>
              <input type="number" min={1} max={500} inputMode="numeric" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} />
            </Field>
            <Field label="Notes" hint="Optional, like Computers">
              <input value={form.notes} maxLength={140} onChange={(e) => set({ notes: e.target.value })} />
            </Field>
          </div>
          <label className="check check-inline">
            <input type="checkbox" checked={form.active} onChange={(e) => set({ active: e.target.checked })} />
            <span>
              <span className="strong">In use</span>
              <span className="hint">Rooms not in use can't be picked for new schedules.</span>
            </span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              {form.id ? "Save room" : "Add room"}
            </button>
          </div>
        </form>
      </div>

      <div className="admin-grid">
        <form className="panel" onSubmit={saveTeacherRoom} aria-labelledby="teacher-room-title">
          <h3 id="teacher-room-title" className="panel-title">
            Teacher rooms
          </h3>
          <p className="hint">Where students find a teacher during their hours. New appointments with them start in this room.</p>
          <div className="grid-2">
            <Field label="Teacher">
              <TeacherSelect
                providers={data.providers}
                value={teacherId}
                onChange={(id) => {
                  setTeacherId(id);
                  setTeacherRoom(providerById[id]?.roomId ?? null);
                }}
                allLabel="Choose…"
              />
            </Field>
            <Field label="Room">
              <RoomSelect rooms={data.rooms} value={teacherRoom} onChange={setTeacherRoom} />
            </Field>
          </div>
          {teacherId && (
            <p className="hint">
              Hours: {fmtRange(toMin(providerById[teacherId]?.workStart ?? DEFAULT_HOURS.workStart), toMin(providerById[teacherId]?.workEnd ?? DEFAULT_HOURS.workEnd))}, Monday to Saturday
            </p>
          )}
          <label className="check check-inline">
            <input type="checkbox" checked={moveUpcoming} onChange={(e) => setMoveUpcoming(e.target.checked)} />
            <span>
              <span className="strong">Move their upcoming appointments too</span>
              <span className="hint">Open requests and approved appointments from today on.</span>
            </span>
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={!teacherId}>
              Save teacher's room
            </button>
          </div>
          {teachersWithRooms.length > 0 && (
            <details className="details">
              <summary>{teachersWithRooms.length} teachers have a room</summary>
              <ul className="service-list">
                {teachersWithRooms.map((p) => (
                  <li key={p.id}>
                    <span>{p.name}</span>
                    <span className="hint">{roomLabel(roomById[p.roomId])}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </form>

        <section className="panel" aria-labelledby="makeup-rooms-title">
          <h3 id="makeup-rooms-title" className="panel-title">
            Upcoming make-up classes <span className="count">{upcomingMakeups.length}</span>
          </h3>
          <p className="hint">Pick a room for each. A class booked together moves together.</p>
          {upcomingMakeups.length === 0 ? (
            <EmptyState title="No make-up classes coming up." />
          ) : (
            <ul className="item-list">
              {upcomingMakeups.map((a) => (
                <li key={a.id} className="item">
                  <div className="item-main">
                    <p className="item-title">
                      {a.groupLabel ? `${a.groupLabel} class (${groupSize[a.groupId]} students)` : a.studentName}
                      {!a.roomId && <span className="tag tag-warning">No room</span>}
                    </p>
                    <p className="item-meta">
                      {fmtDate(a.date)}, {fmtRange(a.start, a.end)} · {providerById[a.providerId]?.name} · {APPT_STATUS[a.status].label}
                    </p>
                  </div>
                  <RoomSelect rooms={data.rooms} value={a.roomId} onChange={(room) => assignRoom(a, room)} aria-label={`Room for ${a.groupLabel ?? a.studentName}`} className="select-sm" />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="panel" aria-labelledby="room-day-title">
        <h3 id="room-day-title" className="panel-title">
          Room schedule
        </h3>
        <div className="filters filters-narrow">
          <Field label="Day">
            <input type="date" value={day} onChange={(e) => setDay(e.target.value || TODAY)} />
          </Field>
          <Field label="Room">
            <select value={dayRoom} onChange={(e) => setDayRoom(e.target.value)}>
              <option value="">All rooms</option>
              {data.rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {roomLabel(r)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {clashing.size > 0 && (
          <Alert tone="warning" title="Two teachers are booked into the same room at the same time.">
            <p>Move one of the highlighted sessions to another room.</p>
          </Alert>
        )}
        {byRoom.length === 0 ? (
          <EmptyState title={`Nothing is booked into ${dayRoom ? roomById[dayRoom]?.name : "any room"} on ${fmtDate(day)}.`} />
        ) : (
          byRoom.map((r) => (
            <div key={r.id} className="room-day">
              <h4 className="room-day-title">
                {roomLabel(r)} {r.capacity && <span className="hint">· {r.capacity} seats</span>}
              </h4>
              <ul className="item-list">
                {daySessions
                  .filter((a) => a.roomId === r.id)
                  .map((a) => (
                    <li key={a.id} className={`item ${clashing.has(a.id) ? "is-clash" : ""}`}>
                      <div className="item-main">
                        <p className="item-title">
                          {fmtRange(a.start, a.end)} <span className="item-sub">{serviceById[a.serviceId]?.name}</span>
                          {clashing.has(a.id) && <span className="tag tag-warning">Room clash</span>}
                        </p>
                        <p className="item-meta">
                          {providerById[a.providerId]?.name} · {a.groupLabel ? `${a.groupLabel} class (${groupSize[a.groupId]})` : a.studentName}
                        </p>
                      </div>
                      <Status tone={APPT_STATUS[a.status].tone}>{APPT_STATUS[a.status].label}</Status>
                    </li>
                  ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </section>
  );
}

/* ====================== Admin: Reports and history ==================== */

function AdminReports({ data, providerById, serviceById, roomById }) {
  const [from, setFrom] = useState(monthStartOf(TODAY));
  const [to, setTo] = useState(monthEndOf(TODAY));
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState("");

  const inPeriod = useMemo(() => data.appointments.filter((a) => inRange(a.date, from, to)), [data.appointments, from, to]);
  const count = (test) => inPeriod.filter(test).length;
  const total = count((a) => !["cancelled", "declined"].includes(a.status));
  const completed = count((a) => a.status === "completed");
  const missed = count((a) => a.status === "no_show");
  const closed = completed + missed;
  const makeups = inPeriod.filter(isMakeup);

  const byTeacher = useMemo(() => {
    const by = {};
    inPeriod.forEach((a) => {
      const r = (by[a.providerId] ??= { id: a.providerId, total: 0, completed: 0, missed: 0, cancelled: 0, makeups: 0 });
      if (["cancelled", "declined"].includes(a.status)) r.cancelled++;
      else r.total++;
      if (a.status === "completed") r.completed++;
      if (a.status === "no_show") r.missed++;
      if (isMakeup(a) && a.status === "completed") r.makeups++;
    });
    return Object.values(by).sort((a, b) => b.total - a.total);
  }, [inPeriod]);

  // The history log comes from the server; it refreshes when filters change or anything new is logged.
  const latest = data.activity[0]?.id;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const params = new URLSearchParams({ history: 1, from, to, category, q, limit: 1000 });
      try {
        const res = await api(`admin.php?${params}`);
        if (!cancelled) {
          setHistory(res.entries);
          setHistoryError("");
        }
      } catch (err) {
        if (!cancelled) setHistoryError(err.message);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [from, to, category, q, latest]);

  const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : "–");
  const period = from || to ? `${from ? fmtDate(from) : "the start"} – ${to ? fmtDate(to) : "today"}` : "all dates";

  const exportAppointments = () =>
    downloadCsv(`appointments-report-${from || "start"}-to-${to || "now"}.csv`, [
      ["Date", "Start", "End", "Student", "Student ID", "Course", "Year", "Teacher", "Type", "Room", "Status"],
      ...[...inPeriod].sort(byDateTime).map((a) => [
        a.date, fmtTime(a.start), fmtTime(a.end), a.studentName, a.studentId, a.studentCourse, a.studentYear ?? "",
        providerById[a.providerId]?.name, serviceById[a.serviceId]?.name, roomLabel(roomById[a.roomId]), APPT_STATUS[a.status].label,
      ]),
    ]);
  const exportTeachers = () =>
    downloadCsv(`teachers-report-${from || "start"}-to-${to || "now"}.csv`, [
      ["Teacher", "College", "Appointments", "Completed", "Missed", "Cancelled or declined", "Make-up classes held", "Attendance"],
      ...byTeacher.map((r) => {
        const p = providerById[r.id];
        return [p?.name, p && shortCollege(p.college), r.total, r.completed, r.missed, r.cancelled, r.makeups, pct(r.completed, r.completed + r.missed)];
      }),
    ]);
  const exportHistory = () =>
    downloadCsv(`history-${from || "start"}-to-${to || "now"}.csv`, [
      ["When", "Who", "Role", "Category", "What happened"],
      ...(history ?? []).map((e) => [e.at, e.actorName, e.actorRole, HISTORY_CATEGORIES[e.category], e.summary]),
    ]);

  return (
    <section className="report">
      <PageHeader
        title="Reports & history"
        description={`Appointments, make-up classes, missed appointments, schedule changes and everything else that happened, ${period}.`}
        actions={
          <button className="btn btn-secondary no-print" onClick={() => window.print()}>
            <Icon name="printer" /> Print
          </button>
        }
      />

      <div className="panel no-print">
        <div className="filters filters-narrow">
          <Field label="From">
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label="To">
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>
        <RangeChips
          from={from}
          to={to}
          label="Period"
          onChange={(f, t) => {
            setFrom(f);
            setTo(t);
          }}
        />
      </div>
      <p className="print-only">Period: {period}. Printed {new Date().toLocaleString()}.</p>

      <div className="stats">
        <StatTile label="Appointments" value={total} sub={`${count((a) => ACTIVE.has(a.status))} still open`} />
        <StatTile label="Completed" value={completed} sub={`${pct(completed, closed)} attendance`} />
        <StatTile label="Missed" value={missed} tone={missed ? "error" : undefined} sub="No-shows" />
        <StatTile label="Cancelled or declined" value={count((a) => ["cancelled", "declined"].includes(a.status))} />
        <StatTile
          label="Make-up classes"
          value={makeups.filter((a) => a.status === "completed").length}
          sub={`held of ${makeups.filter((a) => !["cancelled", "declined"].includes(a.status)).length} scheduled`}
        />
        <StatTile label="Set by teachers" value={count((a) => a.assignedBy === "teacher")} sub={`${count((a) => a.assignedBy !== "teacher")} requested by students`} />
      </div>

      <section className="panel" aria-labelledby="by-teacher-title">
        <div className="panel-head">
          <h3 id="by-teacher-title" className="panel-title">
            By teacher <span className="count">{byTeacher.length}</span>
          </h3>
          <div className="actions no-print">
            <button className="btn btn-sm btn-secondary" onClick={exportTeachers} disabled={!byTeacher.length}>
              <Icon name="download" /> Teachers CSV
            </button>
            <button className="btn btn-sm btn-secondary" onClick={exportAppointments} disabled={!inPeriod.length}>
              <Icon name="download" /> All appointments CSV
            </button>
          </div>
        </div>
        {byTeacher.length === 0 ? (
          <EmptyState title={`No appointments in ${period}.`} />
        ) : (
          <div className="table-wrap is-wide">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Teacher</th>
                  <th scope="col">Appointments</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Missed</th>
                  <th scope="col">Cancelled or declined</th>
                  <th scope="col">Make-ups held</th>
                  <th scope="col">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {byTeacher.map((r) => {
                  const p = providerById[r.id];
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="strong">{p?.name ?? r.id}</div>
                        <div className="hint">{p && shortCollege(p.college)}</div>
                      </td>
                      <td>{r.total}</td>
                      <td>{r.completed}</td>
                      <td className={r.missed ? "text-error" : ""}>{r.missed}</td>
                      <td>{r.cancelled}</td>
                      <td>{r.makeups}</td>
                      <td>{pct(r.completed, r.completed + r.missed)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="history-title">
        <div className="panel-head">
          <h3 id="history-title" className="panel-title">
            History {history && <span className="count">{history.length}</span>}
          </h3>
          <button className="btn btn-sm btn-secondary no-print" onClick={exportHistory} disabled={!history?.length}>
            <Icon name="download" /> History CSV
          </button>
        </div>
        <p className="hint">Every booking, approval, make-up class, missed appointment, schedule change, queue move and account change, newest first.</p>
        <div className="filters no-print">
          <Field label="Search" className="filters-wide">
            <input type="search" placeholder="Student, teacher, ticket, room…" value={q} onChange={(e) => setQ(e.target.value)} />
          </Field>
          <Field label="Kind">
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Everything</option>
              {Object.entries(HISTORY_CATEGORIES).map(([id, label]) => (
                <option key={id} value={id}>
                  {id === "schedule" ? "Schedule changes" : id === "missed" ? "Missed appointments" : `${label}s`}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {historyError && <Alert tone="error" title={historyError} />}
        {!history ? (
          <p className="hint">Loading…</p>
        ) : history.length === 0 ? (
          <EmptyState title="Nothing in the history matches." />
        ) : (
          <div className="table-wrap is-wide">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Kind</th>
                  <th scope="col">What happened</th>
                  <th scope="col">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((e) => (
                  <tr key={e.id}>
                    <td className="nowrap">{fmtStamp(e.at)}</td>
                    <td>
                      <Status tone={CATEGORY_TONE[e.category]}>{HISTORY_CATEGORIES[e.category]}</Status>
                    </td>
                    <td>{e.summary}</td>
                    <td>
                      <div>{e.actorName}</div>
                      <div className="hint">{e.actorRole}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

/* ======================= Profile and settings ========================= */

const PREFS_KEY = "apcas-prefs";
const DEFAULT_PREFS = { textSize: "default", reduceMotion: false, highContrast: false, vibration: true, turnSound: true, notifications: false };
const TEXT_SIZES = [
  { id: "default", label: "Default", sample: 15 },
  { id: "large", label: "Large", sample: 17 },
  { id: "larger", label: "Larger", sample: 19 },
];

// Settings are a per-device convenience, so they live in this browser only; private windows just get the defaults.
function loadPrefs() {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage blocked: settings still apply until the tab closes */
  }
}

// "Constantino, Gerren" -> "GC"; "Juan Dela Cruz" -> "JC"
function initials(name) {
  const parts = name.includes(",") ? name.split(",").reverse() : name.split(" ");
  const words = parts.join(" ").trim().split(/\s+/);
  return ((words[0]?.[0] ?? "") + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function Switch({ checked, onChange, label, hint }) {
  const id = useId();
  return (
    <div className="switch-row">
      <div className="switch-text">
        <span id={id} className="switch-label">
          {label}
        </span>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="switch" onClick={() => onChange(!checked)}>
        <span className="switch-knob" />
      </button>
    </div>
  );
}

const PASSWORD_RULES = [
  { test: (p) => p.length >= 8, text: "At least 8 characters" },
  { test: (p) => /[A-Za-z]/.test(p) && /\d/.test(p), text: "Has letters and numbers" },
];

function PasswordField({ label, value, onChange, error, hint, autoComplete }) {
  const [shown, setShown] = useState(false);
  return (
    <Field label={label} error={error} hint={hint}>
      <PasswordInput value={value} onChange={onChange} shown={shown} onToggle={() => setShown((s) => !s)} autoComplete={autoComplete} />
    </Field>
  );
}

// Field passes id / aria props through, so they go on the real input.
function PasswordInput({ value, onChange, shown, onToggle, autoComplete, inputRef, ...rest }) {
  return (
    <div className="password">
      <input {...rest} ref={inputRef} type={shown ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="combo-btn password-toggle" aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} onClick={onToggle}>
        <Icon name={shown ? "eyeOff" : "eye"} />
      </button>
    </div>
  );
}

function ChangePassword({ notify }) {
  const EMPTY = { current: "", next: "", again: "" };
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const set = (k) => (v) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const next = {};
    if (!form.current) next.current = "Enter your current password.";
    if (!PASSWORD_RULES.every((r) => r.test(form.next))) next.next = "Your new password needs at least 8 characters, with letters and numbers.";
    else if (form.next === form.current) next.next = "Choose a password different from your current one.";
    if (!next.next && form.again !== form.next) next.again = "This doesn't match the new password. Type it again.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await api("password.php", { current: form.current, next: form.next });
      setForm(EMPTY);
      notify("Your password was changed. Use the new one next time you sign in.");
    } catch (err) {
      setErrors(err.message.includes("current") ? { current: err.message } : { next: err.message });
    }
    setSaving(false);
  };

  return (
    <form className="panel" onSubmit={submit} noValidate aria-labelledby="password-title">
      <h3 id="password-title" className="panel-title">
        <Icon name="lock" /> Change password
      </h3>
      <div className="settings-fields">
        <PasswordField label="Current password" value={form.current} onChange={set("current")} error={errors.current} autoComplete="current-password" />
        <PasswordField label="New password" value={form.next} onChange={set("next")} error={errors.next} autoComplete="new-password" />
        <ul className="rules" aria-label="Password rules">
          {PASSWORD_RULES.map((r) => {
            const ok = r.test(form.next);
            return (
              <li key={r.text} className={ok ? "is-ok" : ""}>
                <Icon name={ok ? "check" : "dot"} />
                {r.text}
                <span className="sr-only">{ok ? " (done)" : " (not yet)"}</span>
              </li>
            );
          })}
        </ul>
        <PasswordField label="Type the new password again" value={form.again} onChange={set("again")} error={errors.again} autoComplete="new-password" />
      </div>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </button>
      </div>
    </form>
  );
}

// How a student hears about approvals and their turn on this device.
function AlertSettings({ prefs, set }) {
  const supported = typeof Notification !== "undefined";
  const [permission, setPermission] = useState(supported ? Notification.permission : "unsupported");

  const toggleNotifications = async (on) => {
    if (!on) return set({ notifications: false });
    if (!supported) return;
    const answer = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
    setPermission(answer);
    if (answer === "granted") set({ notifications: true });
  };

  const notificationHint = {
    denied: "Blocked for this site. Allow notifications in the browser's site settings, then turn this on.",
    unsupported: "This browser can't show notifications. The banner and sound still work while the app is open.",
  }[permission] ?? "Approvals and your turn show up even while you use another app. Keep this page open in the background.";

  return (
    <section className="panel" aria-labelledby="alerts-title">
      <h3 id="alerts-title" className="panel-title">
        <Icon name="bell" /> Alerts
      </h3>
      <p className="hint">Saved on this device.</p>
      <div className="settings-group switches">
        <Switch
          label="Sound when it's your turn"
          hint="A chime repeats until you tap “I'm on my way”"
          checked={prefs.turnSound}
          onChange={(v) => {
            unlockAudio();
            set({ turnSound: v });
          }}
        />
        <Switch
          label="Notifications on this device"
          hint={notificationHint}
          checked={prefs.notifications && permission === "granted"}
          onChange={toggleNotifications}
        />
      </div>
      <button
        type="button"
        className="link"
        onClick={() => {
          unlockAudio();
          // Give a just-created sound player a moment to start.
          setTimeout(chime, 50);
        }}
      >
        Play the sound
      </button>
    </section>
  );
}

function ProfileSection({ user, teacher, prefs, setPrefs, onLogout, confirm, notify }) {
  const name = teacher ? teacher.name : user.name;
  const details = teacher
    ? `Teacher · ${shortCollege(teacher.college)} · ID ${teacher.id}`
    : user.role === "admin"
      ? `Administrator · username ${user.username}`
      : [`Student`, user.course, user.year && fmtYear(user.year), `ID ${user.studentId}`].filter(Boolean).join(" · ");
  const set = (patch) => setPrefs((p) => ({ ...p, ...patch }));

  return (
    <section>
      <PageHeader title="Profile & settings" />

      <div className="profile-layout">
        <div className="profile-main">
          <section className="panel profile-card" aria-label="Your details">
            <span className="avatar avatar-lg" aria-hidden="true">
              {initials(name)}
            </span>
            <div className="profile-id">
              <p className="profile-name">{name}</p>
              <p className="hint">{details}</p>
            </div>
          </section>

          {user.role === "student" && <AlertSettings prefs={prefs} set={set} />}

          <section className="panel" aria-labelledby="a11y-title">
            <h3 id="a11y-title" className="panel-title">
              Accessibility
            </h3>
            <p className="hint">Saved on this device.</p>

            <fieldset className="settings-group">
              <legend className="switch-label">Text size</legend>
              <div className="segmented" role="radiogroup" aria-label="Text size">
                {TEXT_SIZES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={prefs.textSize === t.id}
                    className={`segment ${prefs.textSize === t.id ? "is-selected" : ""}`}
                    onClick={() => set({ textSize: t.id })}
                  >
                    <span className="segment-sample" style={{ fontSize: t.sample + 3 }} aria-hidden="true">
                      Aa
                    </span>
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="settings-group switches">
              <Switch
                label="Reduce motion"
                hint="Less movement on screen"
                checked={prefs.reduceMotion}
                onChange={(v) => set({ reduceMotion: v })}
              />
              <Switch
                label="High contrast"
                hint="Darker text and borders"
                checked={prefs.highContrast}
                onChange={(v) => set({ highContrast: v })}
              />
              <Switch
                label="Vibrate on tap"
                hint="Android only"
                checked={prefs.vibration}
                onChange={(v) => set({ vibration: v })}
              />
            </div>
            <button type="button" className="link" onClick={() => setPrefs(DEFAULT_PREFS)} disabled={JSON.stringify(prefs) === JSON.stringify(DEFAULT_PREFS)}>
              Reset to default settings
            </button>
          </section>
        </div>

        <div className="profile-side">
          <ChangePassword notify={notify} />

          <section className="panel" aria-labelledby="logout-title">
            <h3 id="logout-title" className="panel-title">
              <Icon name="logout" /> Log out
            </h3>
            <button
              type="button"
              className="btn btn-secondary btn-block logout-btn"
              onClick={() =>
                confirm({
                  title: "Log out?",
                  message: "You'll go back to the sign-in page.",
                  cancelLabel: "Stay signed in",
                  confirmLabel: "Log out",
                  onConfirm: onLogout,
                })
              }
            >
              Log out
            </button>
          </section>
        </div>
      </div>
    </section>
  );
}

/* ================================ CSS ================================= */

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');

:root {
  /* Brand */
  --brand-700: #014d24;
  --brand-600: #016630;
  --brand-500: #0b7a3d;
  --brand-100: #d5eadc;
  --brand-50: #edf6f0;

  /* Neutrals */
  --gray-900: #171b18;
  --gray-700: #3b433d;
  --gray-600: #57605a;
  --gray-400: #949c96;
  --gray-300: #c8cec8;
  --gray-200: #e0e4df;
  --gray-100: #eef1ed;
  --gray-50: #f7f8f6;

  /* Feedback */
  --success-700: #166534; --success-500: #16a34a; --success-50: #effbf3; --success-200: #bfe8cc;
  --warning-700: #8a4b06; --warning-500: #d97706; --warning-50: #fff8eb; --warning-200: #f3d79c;
  --error-700: #b42318;   --error-600: #c4321f;   --error-500: #dc2626; --error-50: #fef3f2; --error-200: #f5ccc7;
  --info-700: #1d4f91;    --info-500: #2f6fd0;    --info-50: #f0f5fd;   --info-200: #c8daf5;

  /* Roles */
  --bg: var(--gray-50);
  --surface: #ffffff;
  --surface-muted: var(--gray-50);
  --text: var(--gray-900);
  --text-muted: var(--gray-600);
  --border: var(--gray-200);
  --border-strong: var(--gray-300);
  --focus: 0 0 0 3px rgba(1, 102, 48, 0.35);

  /* Spacing */
  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 20px; --s-6: 24px; --s-8: 32px;

  /* Type */
  --fs-xs: 12px; --fs-sm: 13px; --fs-base: 15px; --fs-md: 16px; --fs-lg: 18px; --fs-xl: 22px; --fs-2xl: 28px;
  --serif: "Cormorant Garamond", Georgia, serif;
  --sans: "DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif;

  /* Shape */
  --r-sm: 4px; --r-md: 6px; --r-lg: 10px;
  --control-h: 40px; --control-h-sm: 32px;
  --shadow-overlay: 0 12px 32px rgba(16, 24, 18, 0.18);

  /* Motion */
  --dur-fast: 160ms;
  --dur-page: 280ms;
  --ease-out: cubic-bezier(.2, .8, .2, 1);
  --dur-press: 80ms;
  --content-w: 1120px;
}

* { box-sizing: border-box; }
html, body, #root { margin: 0; padding: 0; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: var(--fs-base); line-height: 1.5; -webkit-font-smoothing: antialiased; }
button, input, select, textarea { font: inherit; color: inherit; }
p { margin: 0; }
:focus { outline: none; }
:focus-visible { outline: 2px solid var(--brand-600); outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.skip-link { position: absolute; left: var(--s-4); top: -60px; background: var(--surface); color: var(--brand-700); padding: var(--s-2) var(--s-4); border-radius: var(--r-md); z-index: 50; font-weight: 600; }
.skip-link:focus { top: var(--s-2); }

.app { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; font-size: var(--fs-base); }
.muted, .hint { color: var(--text-muted); }
.hint { font-size: var(--fs-sm); }
.strong { font-weight: 600; }
.grow { flex: 1; }
.text-accent { color: var(--brand-700); }
.clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; max-width: 34ch; }

/* ---------- Header & navigation ---------- */
.topbar { background: var(--brand-600); color: #fff; }
.topbar-inner { max-width: var(--content-w); margin: 0 auto; padding: var(--s-3) var(--s-5); display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; }
.brand { display: flex; align-items: center; gap: var(--s-3); }
.brand-logo { width: 40px; height: 40px; border-radius: 50%; background: #fff; flex-shrink: 0; }
.brand-school { font-size: var(--fs-xs); letter-spacing: .06em; text-transform: uppercase; opacity: .85; }
.brand-title { margin: 0; font-family: var(--serif); font-weight: 700; font-size: var(--fs-xl); line-height: 1.15; }
.who { display: flex; align-items: center; gap: var(--s-3); }
.who-text { display: flex; flex-direction: column; text-align: right; line-height: 1.3; }
.who-role { font-size: var(--fs-xs); opacity: .85; }
.who-name { font-weight: 600; font-size: var(--fs-sm); }

.nav { background: var(--surface); border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.nav-inner { max-width: var(--content-w); margin: 0 auto; padding: 0 var(--s-3); display: flex; gap: var(--s-1); overflow-x: auto; scrollbar-width: none; }
.nav-inner::-webkit-scrollbar { display: none; }
.nav-item { background: none; border: 0; border-bottom: 2px solid transparent; padding: var(--s-3) var(--s-3); min-height: 48px; color: var(--text-muted); font-weight: 500; cursor: pointer; white-space: nowrap; display: inline-flex; align-items: center; gap: var(--s-2); transition: color var(--dur-fast) ease; }
.nav-inner { position: relative; }
/* Sliding underline: replaces the per-item border once measured. */
.nav-indicator { position: absolute; left: 0; bottom: 0; height: 2px; background: var(--brand-600); border-radius: 2px 2px 0 0; transition: transform var(--dur-page) var(--ease-out), width var(--dur-page) var(--ease-out); pointer-events: none; }
.nav-inner:has(.nav-indicator) .nav-item.is-current { border-bottom-color: transparent; }
.nav-item:hover { color: var(--text); }
.nav-item.is-current { color: var(--brand-700); border-bottom-color: var(--brand-600); font-weight: 600; }
.nav-item:focus-visible { outline-offset: -2px; }
.nav-count { background: var(--brand-600); color: #fff; font-size: var(--fs-xs); font-weight: 700; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; display: inline-flex; align-items: center; justify-content: center; }

.main { flex: 1; overflow-x: clip; width: 100%; max-width: var(--content-w); margin: 0 auto; padding: var(--s-6) var(--s-5) var(--s-8); }
.footer { text-align: center; color: var(--text-muted); font-size: var(--fs-sm); padding: var(--s-4); border-top: 1px solid var(--border); }

/* ---------- Page structure ---------- */
.page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: var(--s-4); flex-wrap: wrap; margin-bottom: var(--s-5); }
.page-title { margin: 0; font-family: var(--serif); font-weight: 700; font-size: var(--fs-2xl); line-height: 1.15; color: var(--brand-700); }
.page-desc { margin-top: var(--s-1); color: var(--text-muted); max-width: 65ch; }
.page-actions { display: flex; gap: var(--s-2); }

.panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); padding: var(--s-5); margin: 0 0 var(--s-4); min-width: 0; }
.panel-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
.panel-title { margin: 0 0 var(--s-2); font-size: var(--fs-lg); font-weight: 600; display: flex; align-items: center; gap: var(--s-2); }
.panel-head .panel-title { margin-bottom: 0; }
.count { font-size: var(--fs-sm); font-weight: 600; color: var(--text-muted); background: var(--gray-100); border-radius: var(--r-sm); padding: 0 6px; }
.stack { display: flex; flex-direction: column; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }

/* ---------- Forms ---------- */
.field { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; }
.label { font-size: var(--fs-sm); font-weight: 600; color: var(--gray-700); padding: 0; }
input, select, textarea { width: 100%; min-height: var(--control-h); padding: var(--s-2) var(--s-3); border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); }
textarea { resize: vertical; min-height: 80px; }
input:hover, select:hover, textarea:hover { border-color: var(--gray-400); }
input:focus-visible, select:focus-visible, textarea:focus-visible { outline: none; border-color: var(--brand-600); box-shadow: var(--focus); }
input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"] { border-color: var(--error-600); }
.field-error { color: var(--error-700); font-size: var(--fs-sm); margin-top: var(--s-1); }
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.form-actions { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; margin-top: var(--s-4); }
.inline-form { display: flex; gap: var(--s-3); align-items: flex-start; margin-top: var(--s-2); }
.inline-form .btn { margin-top: 23px; }
.toolbar { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--s-3); margin: var(--s-2) 0 var(--s-2); }

/* ---------- Buttons ---------- */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2); min-height: var(--control-h); padding: 0 var(--s-4); border: 1px solid transparent; border-radius: var(--r-md); font-weight: 600; cursor: pointer; white-space: nowrap; }
.btn:disabled { cursor: not-allowed; opacity: .45; }
.btn-primary { background: var(--brand-600); color: #fff; }
.btn-primary:not(:disabled):hover { background: var(--brand-700); }
.btn-primary:not(:disabled):active { background: #013a1b; }
.btn-secondary { background: var(--surface); border-color: var(--border-strong); color: var(--text); }
.btn-secondary:not(:disabled):hover { background: var(--gray-50); border-color: var(--gray-400); }
.btn-secondary:not(:disabled):active { background: var(--gray-100); }
.btn-danger { background: var(--error-600); color: #fff; }
.btn-danger:not(:disabled):hover { background: var(--error-700); }
.btn-on-dark { background: transparent; border-color: rgba(255,255,255,.55); color: #fff; }
.btn-on-dark:hover { background: rgba(255,255,255,.12); }
.btn-on-dark:focus-visible { outline-color: #fff; }
.btn-sm { min-height: var(--control-h-sm); padding: 0 var(--s-3); font-size: var(--fs-sm); }
.btn-lg { min-height: 48px; padding: 0 var(--s-5); font-size: var(--fs-md); }
.btn-block { width: 100%; }
.link { background: none; border: 0; padding: 0; color: var(--brand-700); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; text-align: left; }
.link:hover { color: var(--brand-600); }
.link:disabled { color: var(--text-muted); text-decoration: none; cursor: default; }
.actions { display: flex; flex-wrap: wrap; gap: var(--s-2); }

/* ---------- Feedback ---------- */
.icon { width: 18px; height: 18px; flex-shrink: 0; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.alert { display: flex; gap: var(--s-3); padding: var(--s-3) var(--s-4); border: 1px solid; border-radius: var(--r-md); margin: var(--s-3) 0; font-size: var(--fs-sm); }
.alert .icon { margin-top: 1px; }
.alert-title { font-weight: 600; }
.alert p + p, .alert-title + p { margin-top: var(--s-1); }
.alert .link { margin-top: var(--s-2); color: inherit; }
.alert-list { margin: var(--s-1) 0 0; padding-left: var(--s-5); }
.alert-error { background: var(--error-50); border-color: var(--error-200); color: var(--error-700); }
.alert-warning { background: var(--warning-50); border-color: var(--warning-200); color: var(--warning-700); }
.alert-success { background: var(--success-50); border-color: var(--success-200); color: var(--success-700); }
.alert-info { background: var(--info-50); border-color: var(--info-200); color: var(--info-700); }

.status { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-sm); font-weight: 600; white-space: nowrap; color: var(--gray-700); }
.status-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gray-400); }
.status-warning { color: var(--warning-700); } .status-warning .status-dot { background: var(--warning-500); }
.status-brand { color: var(--brand-700); } .status-brand .status-dot { background: var(--brand-600); }
.status-info { color: var(--info-700); } .status-info .status-dot { background: var(--info-500); }
.status-success { color: var(--success-700); } .status-success .status-dot { background: var(--success-500); }
.status-error { color: var(--error-700); } .status-error .status-dot { background: var(--error-500); }
.status-neutral { color: var(--text-muted); }

.empty { padding: var(--s-5); text-align: center; background: var(--surface-muted); border: 1px dashed var(--border-strong); border-radius: var(--r-md); margin-top: var(--s-2); }
.empty-title { font-weight: 600; color: var(--gray-700); }
.empty-body { margin-top: var(--s-1); color: var(--text-muted); font-size: var(--fs-sm); }
.empty-body .link { display: inline; }

.toast-region { position: fixed; left: 50%; bottom: var(--s-5); transform: translateX(-50%); z-index: 40; width: max-content; max-width: calc(100% - 32px); }
.toast { display: flex; align-items: center; gap: var(--s-3); background: var(--gray-900); color: #fff; padding: var(--s-2) var(--s-2) var(--s-2) var(--s-4); border-radius: var(--r-md); box-shadow: var(--shadow-overlay); font-size: var(--fs-sm); animation: toast-in .16s ease-out; }
.toast-text { padding: var(--s-1) 0; }
.toast-action { background: none; border: 0; color: #9ee0b5; font-weight: 700; padding: var(--s-2); cursor: pointer; text-decoration: underline; }
.toast-close { background: none; border: 0; color: #fff; padding: var(--s-2); cursor: pointer; display: inline-flex; opacity: .8; border-radius: var(--r-sm); }
.toast-close:hover { opacity: 1; }
.toast :focus-visible { outline-color: #fff; }
@keyframes toast-in { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

/* Page change: the new page fades in, sliding from the side of the tab you came from
   (or up from below on sign-in). Ends on transform: none so sticky elements keep working. */
.page { --from-x: 0px; --from-y: 10px; animation: page-in var(--dur-page) var(--ease-out) both; }
.page[data-dir="1"] { --from-x: 28px; --from-y: 0px; }
.page[data-dir="-1"] { --from-x: -28px; --from-y: 0px; }
@keyframes page-in { from { opacity: 0; transform: translate(var(--from-x), var(--from-y)); } to { opacity: 1; transform: none; } }
.page-title:focus { outline: none; }
.dialog[open] { animation: dialog-in var(--dur-fast) var(--ease-out); }
.dialog[open]::backdrop { animation: fade-in var(--dur-fast) ease-out; }
@keyframes dialog-in { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }

.dialog { border: 0; border-radius: var(--r-lg); padding: var(--s-6); width: min(480px, calc(100% - 32px)); box-shadow: var(--shadow-overlay); color: var(--text); }
.dialog::backdrop { background: rgba(16, 24, 18, .45); }
.dialog form { display: flex; flex-direction: column; gap: var(--s-4); }
.dialog-title { margin: 0; font-size: var(--fs-lg); font-weight: 600; }
.dialog-message { color: var(--gray-700); }
.dialog-actions { display: flex; justify-content: flex-end; gap: var(--s-2); flex-wrap: wrap; }

/* ---------- Lists ---------- */
.item-list { list-style: none; margin: 0; padding: 0; }
.item { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-4); padding: var(--s-4) 0; border-top: 1px solid var(--border); }
.item:first-child { border-top: 0; padding-top: var(--s-2); }
.item:last-child { padding-bottom: 0; }
.item-main { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; flex: 1; }
.item-title { font-weight: 600; }
.item-sub { font-weight: 400; color: var(--text-muted); }
.item-meta { font-size: var(--fs-sm); color: var(--gray-700); }
.item-side { display: flex; flex-direction: column; align-items: flex-end; gap: var(--s-2); flex-shrink: 0; }
.quote { font-size: var(--fs-sm); color: var(--gray-700); border-left: 2px solid var(--border-strong); padding: 2px 0 2px var(--s-3); margin-top: var(--s-1); max-width: 70ch; }
.quote-label { display: block; font-size: var(--fs-xs); font-weight: 600; color: var(--text-muted); }
.ticket-line { font-size: var(--fs-sm); }
.is-finished { opacity: .6; }

/* ---------- Login page ---------- */
.login { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(380px, 1fr); min-height: 100vh; min-height: 100dvh; background: var(--bg); }
.login-photo { position: relative; overflow: hidden; background: var(--brand-700); }
.login-photo img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: 22% center; }
.login-photo::after { content: ""; position: absolute; inset: 0; background: linear-gradient(to top, rgba(1, 51, 24, .92) 0%, rgba(1, 77, 36, .55) 38%, rgba(1, 77, 36, 0) 65%); }
.login-photo-text { position: absolute; left: 0; right: 0; bottom: 0; z-index: 1; padding: var(--s-8) clamp(var(--s-6), 5vw, 56px); color: #fff; max-width: 560px; }
.login-photo-school { margin: 0 0 var(--s-1); font-size: var(--fs-sm); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .9; }
.login-photo-title { margin: 0; font-family: var(--serif); font-weight: 700; font-size: clamp(32px, 4vw, 48px); line-height: 1.05; }
.login-photo-sub { margin: var(--s-3) 0 0; font-size: var(--fs-md); line-height: 1.5; opacity: .92; }
.login-side { display: flex; align-items: center; justify-content: center; padding: var(--s-8) var(--s-6); }
.login-card { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: var(--s-4); }
.login-logo { width: 72px; height: 72px; object-fit: contain; }
.login-title { margin: 0; font-family: var(--serif); font-weight: 700; font-size: var(--fs-2xl); line-height: 1.1; color: var(--brand-700); }
.login-sub { margin: calc(var(--s-3) * -1) 0 0; color: var(--text-muted); }
.login-roles { display: grid; grid-template-columns: repeat(3, 1fr); padding: 4px; gap: 4px; background: var(--gray-100); border-radius: var(--r-lg); }
.login-role { min-height: 40px; border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-muted); font: inherit; font-weight: 600; cursor: pointer; transition: background-color .15s, color .15s, box-shadow .15s; }
.login-role:hover { color: var(--text); }
.login-role.is-selected { background: var(--surface); color: var(--brand-700); box-shadow: 0 1px 3px rgba(16, 24, 18, .14); }
.login-role-blurb { margin: calc(var(--s-2) * -1) 0 0; font-size: var(--fs-sm); color: var(--text-muted); }
.login-submit { margin-top: var(--s-1); }
.login-help { margin: 0; font-size: var(--fs-sm); color: var(--text-muted); text-align: center; }
@media (max-width: 860px) {
  .login { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .login-photo { height: 240px; }
  .login-photo img { object-position: 22% 30%; }
  .login-photo-text { padding: var(--s-5) var(--s-4); }
  .login-photo-title { font-size: 30px; }
  .login-photo-sub { display: none; }
  .login-side { align-items: flex-start; padding: var(--s-6) var(--s-4) var(--s-8); }
  .login-logo { display: none; }
}

/* ---------- Booking ---------- */
.book { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-4); align-items: start; }
.book-steps { min-width: 0; }
/* Floating the legend keeps it out of the fieldset border so the panel edge stays intact. */
.step { display: block; }
.step-title { float: left; width: 100%; margin-bottom: var(--s-4); padding: 0; font-size: var(--fs-lg); font-weight: 600; display: flex; align-items: center; gap: var(--s-2); }
.step-title + * { clear: both; }
.step > :not(legend) + :not(legend) { margin-top: var(--s-4); }
.step > .slots-head + *, .step > .field-error { margin-top: var(--s-2); }
.step-num { width: 24px; height: 24px; border-radius: 50%; background: var(--brand-50); color: var(--brand-700); font-size: var(--fs-sm); font-weight: 700; display: inline-flex; align-items: center; justify-content: center; }
.choice-set legend { margin-bottom: var(--s-2); }
.choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--s-2); }
.choice { position: relative; display: flex; flex-direction: column; padding: var(--s-3); border: 1px solid var(--border-strong); border-radius: var(--r-md); cursor: pointer; }
.choice:hover { border-color: var(--gray-400); }
.choice input { position: absolute; opacity: 0; width: 1px; height: 1px; min-height: 0; }
.choice:has(input:focus-visible) { box-shadow: var(--focus); }
.choice.is-selected { border-color: var(--brand-600); background: var(--brand-50); box-shadow: inset 0 0 0 1px var(--brand-600); }
.choice-name { font-weight: 600; }
.choice-meta { font-size: var(--fs-sm); color: var(--text-muted); }
.room-picker { display: flex; flex-direction: column; gap: var(--s-3); }
.room-chosen { display: flex; align-items: center; gap: var(--s-2); margin: 0; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); background: var(--brand-50); color: var(--brand-700); font-size: var(--fs-sm); }
.room-chosen strong { font-size: var(--fs-md); }
.room-search { position: relative; }
.room-search svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); pointer-events: none; }
.room-search input { width: 100%; padding-left: 38px; }
.room-buildings { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--s-1); padding: 4px; border-radius: var(--r-md); background: var(--gray-100); }
.room-building { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: var(--s-2); border: 0; border-radius: calc(var(--r-md) - 2px); background: transparent; color: var(--gray-700); cursor: pointer; text-align: center; }
.room-building:hover { color: var(--text); }
.room-building.is-selected { background: var(--surface); color: var(--text); box-shadow: 0 1px 2px rgb(0 0 0 / 0.08), 0 0 0 1px var(--border); }
.room-building-name { font-weight: 600; font-size: var(--fs-sm); line-height: 1.25; }
.room-building-meta { font-size: var(--fs-xs); color: var(--text-muted); }
.room-floors { display: flex; flex-direction: column; border: 1px solid var(--border); border-radius: var(--r-md); }
.room-floor { display: grid; grid-template-columns: 84px 1fr; align-items: center; gap: var(--s-3); padding: var(--s-2) var(--s-3); }
.room-floor + .room-floor { border-top: 1px solid var(--border); }
.room-floor-label { margin: 0; font-size: var(--fs-sm); font-weight: 600; color: var(--gray-700); }
.room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: var(--s-2); }
.room-grid-results { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.room-tile { min-height: 48px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; padding: var(--s-1) var(--s-2); border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); color: var(--text); cursor: pointer; line-height: 1.2; }
.room-tile-name { font-weight: 600; font-size: var(--fs-sm); white-space: nowrap; }
.room-tile.is-long { grid-column: span 2; }
.room-tile-meta { font-size: var(--fs-xs); color: var(--text-muted); }
.room-tile-meta:empty { display: none; }
.room-tile:not(:disabled):hover { border-color: var(--brand-600); color: var(--brand-700); }
.room-tile.is-selected { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
.room-tile.is-selected .room-tile-meta { color: rgb(255 255 255 / 0.85); }
.room-tile:disabled { background: var(--gray-100); border-color: var(--gray-100); color: var(--text-muted); cursor: not-allowed; }
.room-tile:disabled .room-tile-name { text-decoration: line-through; font-weight: 500; }
@media (max-width: 560px) {
  .room-floor { grid-template-columns: 1fr; gap: var(--s-2); }
  .room-grid:not(.room-grid-results) { grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 6px; }
  .room-tile { padding: var(--s-1) 2px; }
  .room-tile-name { font-size: 11px; letter-spacing: -0.01em; }
  .room-building { padding: var(--s-2) var(--s-1); }
}
.slots-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); flex-wrap: wrap; }
.slot-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: var(--s-2); }
.slot { min-height: 44px; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); cursor: pointer; padding: var(--s-1); line-height: 1.2; }
.slot-time { font-weight: 600; font-size: var(--fs-sm); }
.slot-reason { font-size: var(--fs-xs); }
.slot:not(:disabled):hover { border-color: var(--brand-600); color: var(--brand-700); }
.slot.is-selected { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
.slot:disabled { background: var(--gray-100); border-color: var(--gray-100); color: var(--text-muted); cursor: not-allowed; }
.slot:disabled .slot-time { text-decoration: line-through; font-weight: 500; }
.book-summary { position: sticky; top: 64px; display: flex; flex-direction: column; gap: var(--s-3); }
.book-summary .panel-title { margin: 0; }
.summary { display: grid; grid-template-columns: auto 1fr; gap: var(--s-2) var(--s-4); margin: 0; font-size: var(--fs-sm); }
.summary dt { color: var(--text-muted); }
.summary dd { margin: 0; font-weight: 600; }
.book-summary .alert { margin: 0; }
.date-row { display: grid; grid-template-columns: minmax(180px, 240px) minmax(0, 1fr); gap: var(--s-4); align-items: start; }
.quick-days { display: flex; flex-direction: column; gap: var(--s-1); min-width: 0; }
.quick-days-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); gap: var(--s-2); }
.chip { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: var(--control-h); padding: var(--s-1) var(--s-2); border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); cursor: pointer; line-height: 1.2; }
.chip:hover { border-color: var(--brand-600); color: var(--brand-700); }
.chip.is-selected { background: var(--brand-50); border-color: var(--brand-600); box-shadow: inset 0 0 0 1px var(--brand-600); color: var(--brand-700); }
.chip-top { font-weight: 600; font-size: var(--fs-sm); }
.chip-sub { font-size: var(--fs-xs); color: var(--text-muted); }
.custom-service { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-3); }
.idea-chips { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin-top: calc(-1 * var(--s-2)); }
.student-fields { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1.1fr); gap: var(--s-3); align-items: start; }
@media (max-width: 1100px) { .student-fields { grid-template-columns: 1fr 1fr; } }
@media (max-width: 680px) { .student-fields { grid-template-columns: 1fr; } }
.mode-choices { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
.roster { display: flex; flex-direction: column; gap: var(--s-2); }
.roster-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
.roster-list { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--s-2); max-height: 280px; overflow-y: auto; }
.roster-item { display: grid; grid-template-columns: auto 1fr; column-gap: var(--s-2); align-items: center; padding: var(--s-2) var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); cursor: pointer; }
.roster-item input { width: 18px; min-height: 18px; height: 18px; margin: 0; grid-row: span 2; }
.roster-item:has(input:checked) { border-color: var(--brand-600); background: var(--brand-50); }
.roster-name { font-weight: 600; font-size: var(--fs-sm); }
.twin-list { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.twin-list li { display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); flex-wrap: wrap; }
.student-chips { grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin-bottom: var(--s-3); }
.student-chips .chip-top { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ---------- Suggestion list (combobox) ---------- */
.combo { position: relative; }
.combo input { padding-right: 64px; }
.combo.has-icon input { padding-left: 36px; }
.combo-icon { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--text-muted); display: flex; pointer-events: none; }
.combo-icon .icon, .combo-btn .icon { width: 18px; height: 18px; }
.combo-btn { position: absolute; top: 50%; transform: translateY(-50%); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: var(--r-sm); background: none; color: var(--text-muted); cursor: pointer; }
.combo-btn:hover { background: var(--gray-100); color: var(--text); }
.combo-toggle { right: 6px; }
.combo-toggle .icon { transition: transform var(--dur-fast) ease; }
.combo.is-open .combo-toggle .icon { transform: rotate(180deg); }
.combo-clear { right: 34px; }
.combo.is-open input { border-color: var(--brand-600); box-shadow: var(--focus); }
.combo-pop { position: absolute; z-index: 30; top: calc(100% + 4px); left: 0; right: 0; min-width: 240px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-md); box-shadow: var(--shadow-overlay); overflow: hidden; }
.combo-count { margin: 0; padding: var(--s-2) var(--s-3); font-size: var(--fs-xs); font-weight: 600; color: var(--text-muted); border-bottom: 1px solid var(--border); }
.combo-list { list-style: none; margin: 0; padding: var(--s-1); max-height: 264px; overflow-y: auto; overscroll-behavior: contain; }
.combo-group { position: sticky; top: calc(-1 * var(--s-1)); margin: 0; padding: var(--s-2) var(--s-2) var(--s-1); font-size: var(--fs-xs); font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--brand-700); background: var(--surface); }
.combo-option { display: flex; align-items: center; gap: var(--s-2); min-height: 36px; padding: var(--s-1) var(--s-2); border-radius: var(--r-sm); cursor: pointer; }
.combo-option.is-active { background: var(--brand-50); }
.combo-option[aria-selected="true"] { font-weight: 600; color: var(--brand-700); }
.combo-option[aria-disabled="true"] { color: var(--gray-400); cursor: not-allowed; }
.combo-check { width: 18px; flex-shrink: 0; display: flex; color: var(--brand-600); }
.combo-check .icon { width: 16px; height: 16px; }
.combo-label { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.combo-label mark { background: var(--warning-200); color: inherit; border-radius: 2px; padding: 0 1px; }
.combo-sub { font-size: var(--fs-xs); color: var(--text-muted); font-weight: 400; }
.combo-reason { font-size: var(--fs-xs); color: var(--text-muted); background: var(--gray-100); border-radius: var(--r-sm); padding: 1px 6px; white-space: nowrap; }
.combo-empty { padding: var(--s-4) var(--s-3); text-align: center; color: var(--text-muted); font-size: var(--fs-sm); }
.combo-keys { margin: 0; padding: var(--s-2) var(--s-3); border-top: 1px solid var(--border); font-size: var(--fs-xs); color: var(--text-muted); background: var(--surface-muted); display: flex; gap: var(--s-1); align-items: center; flex-wrap: wrap; }
.combo-keys kbd { font: inherit; font-weight: 600; border: 1px solid var(--border-strong); border-bottom-width: 2px; border-radius: var(--r-sm); padding: 0 4px; background: var(--surface); color: var(--text); }


/* ---------- Table ---------- */
.table-wrap { overflow-x: auto; margin-top: var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); }
.table { width: 100%; border-collapse: collapse; font-size: var(--fs-sm); }
.table th { text-align: left; font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); padding: var(--s-2) var(--s-3); background: var(--surface-muted); border-bottom: 1px solid var(--border); white-space: nowrap; }
.table td { padding: var(--s-3); border-bottom: 1px solid var(--border); vertical-align: top; }
.table td .hint { font-size: var(--fs-xs); }
.table tbody tr:last-child td { border-bottom: 0; }
.table tbody tr:hover td { background: var(--gray-50); }
.row-closed td { color: var(--text-muted); }
.sort { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-transform: inherit; letter-spacing: inherit; cursor: pointer; display: inline-flex; gap: var(--s-1); }
.sort:hover { color: var(--text); }

/* ---------- Queue ---------- */
.now { display: grid; grid-template-columns: 1.4fr 1fr auto; gap: var(--s-5); align-items: center; border-left: 4px solid var(--brand-600); }
.now-block { min-width: 0; }
.now-label { font-size: var(--fs-xs); font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: var(--text-muted); margin-bottom: var(--s-1); }
.now-ticket { display: flex; align-items: baseline; gap: var(--s-3); flex-wrap: wrap; }
.now-number { font-family: var(--sans); font-weight: 700; font-size: 40px; letter-spacing: -.01em; white-space: nowrap; line-height: 1; color: var(--brand-700); font-variant-numeric: tabular-nums; }
.now-name { font-size: var(--fs-md); font-weight: 600; }
.now-empty { font-size: var(--fs-md); color: var(--text-muted); }
.now-small { font-weight: 600; }
.now-call { text-align: right; }
.queue-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--s-4); align-items: start; }
.queue-item { align-items: center; }
.ticket { font-family: var(--sans); font-weight: 700; font-size: var(--fs-lg); white-space: nowrap; min-width: 64px; color: var(--brand-700); font-variant-numeric: tabular-nums; }
.queue-item .item-side { flex-direction: row; align-items: center; flex-wrap: wrap; justify-content: flex-end; }

/* ---------- Hours ---------- */
.hours-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: var(--s-4); align-items: start; }
.hours-form { margin: 0; }
.hours-side { position: sticky; top: 64px; display: flex; flex-direction: column; gap: var(--s-4); }
.hours-side .panel { margin: 0; }
.hours-side .service-list { margin-top: var(--s-2); }
.hours-set + .hours-set { margin-top: var(--s-4); }
.hours-set legend, .hours-set > .hours-legend { margin-bottom: var(--s-3); }
.hours-legend { display: flex; align-items: center; gap: var(--s-2); font-weight: 600; font-size: var(--fs-md); padding: 0; margin: 0; }
.hours-current { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--s-1) var(--s-2); padding: var(--s-3); margin-bottom: var(--s-5); background: var(--surface-muted); border: 1px solid var(--border); border-radius: var(--r-md); }
.hours-set + .hours-set { padding-top: var(--s-4); border-top: 1px solid var(--border); }
.hours-summary { margin: var(--s-3) 0 0; }
.hours-actions { padding-top: var(--s-4); border-top: 1px solid var(--border); }
.hours-status { margin: 0; font-size: var(--fs-sm); color: var(--success-700); }
.hours-status.is-unsaved { color: var(--warning-700); font-weight: 600; }
.hours-tip { margin: calc(-1 * var(--s-2)) 0 var(--s-3); }
.hours-default { margin-top: var(--s-3); }
.day-preview { margin-top: var(--s-1); }
.day-track { position: relative; height: 36px; background: repeating-linear-gradient(135deg, var(--gray-100) 0 6px, var(--gray-200) 6px 8px); border-radius: var(--r-md); overflow: hidden; }
.day-open { position: absolute; top: 0; bottom: 0; background: var(--brand-500); }
.day-lunch { position: absolute; top: 0; bottom: 0; background: var(--warning-200); border-left: 2px solid var(--surface); border-right: 2px solid var(--surface); display: flex; align-items: center; justify-content: center; overflow: hidden; }
.day-lunch span { font-size: var(--fs-xs); font-weight: 600; color: var(--warning-700); white-space: nowrap; }
.day-scale { position: relative; height: 20px; margin-top: var(--s-1); }
.day-scale span { position: absolute; transform: translateX(-50%); font-size: var(--fs-xs); color: var(--text-muted); white-space: nowrap; }
.day-scale span:first-child { transform: none; }
.day-scale span:last-child { transform: translateX(-100%); }
.day-legend { display: flex; flex-wrap: wrap; gap: var(--s-2) var(--s-4); margin-top: var(--s-2); font-size: var(--fs-sm); color: var(--text-muted); }
.day-legend span { display: inline-flex; align-items: center; gap: var(--s-1); }
.swatch { display: inline-block; width: 12px; height: 12px; border-radius: 3px; }
.swatch-open { background: var(--brand-500); }
.swatch-lunch { background: var(--warning-200); }
.swatch-closed { background: repeating-linear-gradient(135deg, var(--gray-100) 0 3px, var(--gray-300) 3px 4px); }
.service-list { list-style: none; margin: 0; padding: 0; }
.service-list li { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-3); padding: var(--s-2) 0; border-top: 1px solid var(--border); }
.service-list li:first-child { border-top: 0; }


/* ---------- Booking types ---------- */
.side-link { margin-top: var(--s-3); }
.choice-desc { font-size: var(--fs-sm); color: var(--gray-700); margin-top: var(--s-1); line-height: 1.4; }
.choice.is-preview { cursor: default; }
.choices-stack { grid-template-columns: 1fr; margin-top: var(--s-3); }
.side-empty { margin-top: var(--s-3); }
.services-main { min-width: 0; }
.tag { display: inline-block; vertical-align: middle; font-size: var(--fs-xs); font-weight: 600; color: var(--text-muted); background: var(--gray-100); border-radius: var(--r-sm); padding: 0 6px; margin-left: var(--s-1); }
.type-list { padding: 0; margin: 0; list-style: none; }
.type-item { align-items: center; }
.type-item.is-editing { background: var(--brand-50); border-radius: var(--r-md); }
.type-actions { flex-direction: row; align-items: center; }
.type-order-hint { margin-top: var(--s-3); }
.order-btns { display: flex; flex-direction: column; gap: 2px; flex-shrink: 0; }
.order-btns .combo-btn { position: static; transform: none; width: 28px; height: 22px; }
.order-btns .combo-btn:first-child .icon { transform: rotate(180deg); }
.order-btns .combo-btn:disabled { opacity: .3; cursor: default; background: none; }
.tips { margin: 0; padding-left: var(--s-5); font-size: var(--fs-sm); color: var(--gray-700); display: flex; flex-direction: column; gap: var(--s-2); }
.editor { border-color: var(--brand-600); box-shadow: 0 0 0 1px var(--brand-600); scroll-margin-top: 80px; }
.editor .panel-head { margin-bottom: var(--s-2); }
.editor-close { position: static; transform: none; }
.editor-grid { display: grid; grid-template-columns: minmax(0, 1fr) 240px; gap: var(--s-5); margin-top: var(--s-3); }
.editor-fields { display: flex; flex-direction: column; gap: var(--s-4); min-width: 0; }
.editor-preview { display: flex; flex-direction: column; gap: var(--s-2); padding: var(--s-3); background: var(--surface-muted); border-radius: var(--r-md); align-self: start; }
.preview-question { margin-top: var(--s-2); }
.preview-input { font-size: var(--fs-sm); color: var(--gray-400); border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); padding: var(--s-2) var(--s-3); margin-top: var(--s-1); }
.ideas { display: flex; flex-wrap: wrap; gap: var(--s-2); align-items: center; margin-top: calc(-1 * var(--s-2)); }
.idea { border: 1px dashed var(--border-strong); background: var(--surface); border-radius: 999px; padding: 2px var(--s-3); font-size: var(--fs-sm); cursor: pointer; color: var(--gray-700); }
.idea:hover { border-color: var(--brand-600); color: var(--brand-700); border-style: solid; }
.length-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr)); gap: var(--s-2); margin-top: var(--s-1); }
.chip-input { flex-direction: row; gap: var(--s-1); padding: 0 var(--s-2); cursor: text; }
.chip-input input { border: 0; min-height: 0; padding: 0; width: 100%; min-width: 0; text-align: center; background: transparent; box-shadow: none; -moz-appearance: textfield; }
.chip-input input::-webkit-inner-spin-button, .chip-input input::-webkit-outer-spin-button { -webkit-appearance: none; }
.chip-input:focus-within { box-shadow: var(--focus); border-color: var(--brand-600); }
.length-choices + .hint, .length-choices + .field-error { margin-top: var(--s-2); }
.check { display: flex; gap: var(--s-3); align-items: flex-start; cursor: pointer; padding: var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); }
.check:hover { border-color: var(--gray-400); }
.check input { width: 18px; height: 18px; min-height: 0; margin-top: 2px; flex-shrink: 0; accent-color: var(--brand-600); }
.check > span { display: flex; flex-direction: column; gap: 2px; }
.question-fields { margin-top: calc(-1 * var(--s-2)); }


/* ---------- Feel: calm press feedback ---------- */
/* Colours fade instead of snapping. No bouncing, rippling or shaking. */
.btn, .chip, .slot, .choice, .idea, .link, .nav-item, .combo-btn, .combo-option, .check, .sort, .toast-action, .toast-close {
  transition: background-color var(--dur-fast) ease, border-color var(--dur-fast) ease, color var(--dur-fast) ease,
    box-shadow var(--dur-fast) ease, transform var(--dur-press) ease-out, opacity var(--dur-fast) ease;
}
input, select, textarea { transition: border-color var(--dur-fast) ease, box-shadow var(--dur-fast) ease; }

/* A slight press-in on small controls only, so a click registers without anything moving around. */
.btn:not(:disabled):active, .chip:active, .slot:not(:disabled):active, .idea:active { transform: scale(.98); }
.link:not(:disabled):active { opacity: .7; }


/* ---------- Attachments ---------- */
.attach { display: flex; flex-direction: column; gap: var(--s-2); margin-top: var(--s-1); }
.drop { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-4); border: 1px dashed var(--border-strong); border-radius: var(--r-md); background: var(--surface-muted); color: var(--text-muted); }
.drop.is-dragging { border-color: var(--brand-600); background: var(--brand-50); color: var(--brand-700); }
.drop > .icon { width: 22px; height: 22px; margin-top: 1px; }
.drop-text { min-width: 0; }
.drop-text .hint { margin: 0; }
.file-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--s-2); }
.file-item { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-2); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); }
.file-open { display: flex; flex-shrink: 0; }
.file-thumb { width: 48px; height: 48px; object-fit: cover; border-radius: var(--r-sm); border: 1px solid var(--border); background: var(--gray-100); flex-shrink: 0; }
.file-thumb-pdf { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; color: var(--error-700); background: var(--error-50); border-color: var(--error-200); font-size: 10px; font-weight: 700; }
.file-thumb-pdf .icon { width: 20px; height: 20px; }
.file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.file-name { color: var(--text); font-weight: 600; font-size: var(--fs-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-decoration: none; }
.file-name:hover { color: var(--brand-700); text-decoration: underline; }
.file-view { margin-top: var(--s-1); }
.file-grid { list-style: none; margin: var(--s-1) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-2); }
.file-card { display: flex; align-items: center; gap: var(--s-2); max-width: 220px; padding: var(--s-1) var(--s-2) var(--s-1) var(--s-1); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); color: var(--text); text-decoration: none; font-size: var(--fs-sm); }
.file-card:hover { border-color: var(--brand-600); color: var(--brand-700); }
.file-card .file-thumb { width: 36px; height: 36px; }
.file-card-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }


/* ---------- Profile & settings ---------- */
.avatar { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; background: #fff; color: var(--brand-700); font-weight: 700; font-size: var(--fs-sm); letter-spacing: .02em; flex-shrink: 0; }
.avatar-lg { width: 56px; height: 56px; font-size: var(--fs-lg); background: var(--brand-600); color: #fff; }
.avatar-btn { border: 0; padding: 2px; background: none; border-radius: 50%; cursor: pointer; display: inline-flex; box-shadow: 0 0 0 2px rgba(255,255,255,.35); }
.avatar-btn:hover, .avatar-btn.is-current { box-shadow: 0 0 0 2px #fff; }
.avatar-btn:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.profile-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--s-4); align-items: start; }
.profile-main, .profile-side { display: flex; flex-direction: column; gap: var(--s-4); min-width: 0; }
.profile-main .panel, .profile-side .panel { margin: 0; }
.profile-card { display: flex; align-items: center; gap: var(--s-4); }
.profile-id { min-width: 0; }
.profile-name { font-weight: 700; font-size: var(--fs-lg); }
.settings-group { margin-top: var(--s-4); }
.settings-group legend { margin-bottom: var(--s-2); }
.segmented { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--s-2); }
.segment { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 64px; justify-content: center; border: 1px solid var(--border-strong); border-radius: var(--r-md); background: var(--surface); cursor: pointer; font-size: var(--fs-sm); color: var(--gray-700); }
.segment-sample { font-family: var(--serif); font-weight: 700; line-height: 1; color: var(--text); }
.segment.is-selected { border-color: var(--brand-600); background: var(--brand-50); box-shadow: inset 0 0 0 1px var(--brand-600); color: var(--brand-700); font-weight: 600; }
.switches { display: flex; flex-direction: column; }
.switch-row { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-3) 0; border-top: 1px solid var(--border); }
.switch-row:first-child { border-top: 0; padding-top: 0; }
.switch-text { display: flex; flex-direction: column; min-width: 0; }
.switch-label { font-weight: 600; padding: 0; }
.switch { position: relative; width: 48px; height: 28px; flex-shrink: 0; border: 0; border-radius: 14px; background: var(--gray-300); cursor: pointer; transition: background-color var(--dur-fast) ease; }
.switch-knob { position: absolute; top: 3px; left: 3px; width: 22px; height: 22px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: transform var(--dur-fast) var(--ease-out); }
.switch[aria-checked="true"] { background: var(--brand-600); }
.switch[aria-checked="true"] .switch-knob { transform: translateX(20px); }
.switch:focus-visible { box-shadow: var(--focus); outline: none; }
.settings-fields { display: flex; flex-direction: column; gap: var(--s-3); margin-top: var(--s-2); }
.settings-note { margin-top: var(--s-3); }
.password { position: relative; }
.password input { padding-right: 44px; }
.password-toggle { right: 6px; }
.rules { list-style: none; margin: calc(-1 * var(--s-1)) 0 0; padding: 0; display: flex; flex-wrap: wrap; gap: var(--s-1) var(--s-4); font-size: var(--fs-sm); color: var(--text-muted); }
.rules li { display: inline-flex; align-items: center; gap: var(--s-1); }
.rules .icon { width: 16px; height: 16px; }
.rules li.is-ok { color: var(--success-700); }
.logout-btn { color: var(--error-700); margin-top: var(--s-3); }

/* ---------- Accessibility settings ---------- */
.app[data-text="large"] { --fs-xs: 13px; --fs-sm: 15px; --fs-base: 17px; --fs-md: 18px; --fs-lg: 20px; --fs-xl: 24px; --fs-2xl: 31px; }
.app[data-text="larger"] { --fs-xs: 14px; --fs-sm: 16px; --fs-base: 19px; --fs-md: 20px; --fs-lg: 22px; --fs-xl: 26px; --fs-2xl: 34px; }
.app[data-contrast="high"] { --text-muted: var(--gray-700); --border: var(--gray-400); --border-strong: var(--gray-600); }
.app[data-contrast="high"] .label { color: var(--gray-900); }
.app[data-motion="reduce"] *, .app[data-motion="reduce"] *::before, .app[data-motion="reduce"] *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }

/* ---------- Phones and touch ---------- */
html { -webkit-text-size-adjust: 100%; }
button, a, label, input, select, textarea, [role="option"] { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.tabbar, .mobile-submit { display: none; }
.on-touch { display: none; }
@media (pointer: coarse) {
  .on-touch { display: inline; }
  .on-mouse { display: none; }
}

/* ---------- Responsive ---------- */
@media (max-width: 960px) {
  .book, .queue-grid, .hours-layout, .editor-grid, .profile-layout { grid-template-columns: 1fr; }
  .book-summary, .hours-side { position: static; }
  .now { grid-template-columns: 1fr 1fr; }
  .now-call { grid-column: 1 / -1; text-align: left; }
}
@media (max-width: 680px) {
  /* Bigger targets for thumbs, and 16px inputs so iPhones don't zoom in when typing. */
  :root { --control-h: 44px; --control-h-sm: 40px; }
  input, select, textarea, .chip-input input { font-size: 16px; }
  .combo-btn { width: 36px; height: 36px; }
  .combo-toggle { right: 4px; }
  .combo-clear { right: 40px; }
  .combo input { padding-right: 80px; }
  .combo-option { min-height: 44px; }
  .combo-list { max-height: min(264px, 40vh); }
  .combo input, .combo-pop { scroll-margin-top: 12px; }
  .order-btns .combo-btn { width: 36px; height: 30px; }
  .idea { min-height: 36px; }
  .link { padding: 6px 0; }
  .toast-close, .toast-action { min-width: 40px; min-height: 40px; }

  /* Compact header: logo, title, profile button. Tabs move to the bottom. */
  .topbar { position: sticky; top: 0; z-index: 15; padding-top: env(safe-area-inset-top); }
  .topbar-inner { padding: var(--s-2) var(--s-4); flex-wrap: nowrap; }
  .brand-logo { width: 32px; height: 32px; }
  .brand-school { display: none; }
  .switch::after { content: ""; position: absolute; inset: -8px; }
  .brand-title { font-size: var(--fs-lg); }
  .who-text { display: none; }
  .nav { display: none; }
  .tabbar {
    display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 20;
    background: var(--surface); border-top: 1px solid var(--border);
    padding: 0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    box-shadow: 0 -2px 10px rgba(16, 24, 18, .05);
  }
  .tab { position: relative; flex: 1; min-width: 0; min-height: 58px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; border: 0; background: none; color: var(--text-muted); font: inherit; font-size: 11px; font-weight: 600; cursor: pointer; }
  .tab .icon { width: 22px; height: 22px; }
  .tab-label { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 2px; }
  .tab.is-current { color: var(--brand-700); }
  .tab.is-current::before { content: ""; position: absolute; top: 0; left: 28%; right: 28%; height: 3px; border-radius: 0 0 3px 3px; background: var(--brand-600); }
  .tab:active { background: var(--gray-50); }
  .tab:focus-visible { outline-offset: -3px; }
  .tab-count { position: absolute; top: 5px; left: calc(50% + 6px); min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--brand-600); color: #fff; font-size: 10px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--surface); }
  .app { --bottom-ui: calc(58px + env(safe-area-inset-bottom)); padding-bottom: var(--bottom-ui); }
  .app:has(.mobile-submit) { --bottom-ui: calc(58px + 64px + env(safe-area-inset-bottom)); }
  .footer { padding-bottom: var(--s-5); }

  /* Booking: send from anywhere on the page. */
  .mobile-submit {
    display: flex; align-items: center; gap: var(--s-3); position: fixed; left: 0; right: 0; z-index: 19;
    bottom: calc(58px + env(safe-area-inset-bottom)); min-height: 64px; padding: var(--s-2) var(--s-4);
    background: var(--surface); border-top: 1px solid var(--border); box-shadow: 0 -4px 12px rgba(16, 24, 18, .06);
  }
  .mobile-submit-text { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: var(--fs-sm); line-height: 1.3; }
  .book-summary > .btn-primary { display: none; }

  .toast-region { bottom: calc(var(--bottom-ui) + var(--s-3)); width: calc(100% - 32px); }
  .toast { width: 100%; }

  /* Dialogs become bottom sheets with full-width buttons. */
  .dialog { width: 100%; max-width: 100%; margin: auto 0 0; border-radius: 16px 16px 0 0; padding: var(--s-5) var(--s-4) calc(var(--s-5) + env(safe-area-inset-bottom)); }
  .dialog-actions { flex-direction: column-reverse; }
  .dialog-actions .btn { width: 100%; }

  .page-head { margin-bottom: var(--s-4); }
  .page-actions { width: 100%; }
  .page-actions .btn { flex: 1; }
  .page-title { font-size: 24px; }
  .grid-2, .toolbar, .date-row { grid-template-columns: 1fr; }
  .combo-keys { display: none; }
  .panel { padding: var(--s-4); }
  .item { flex-direction: column; gap: var(--s-2); }
  .item-side { align-items: flex-start; flex-direction: row; flex-wrap: wrap; }
  .type-item { display: grid; grid-template-columns: auto 1fr; }
  .type-actions { grid-column: 1 / -1; }
  .queue-item { display: grid; grid-template-columns: auto 1fr; }
  .queue-item .item-side { grid-column: 1 / -1; justify-content: flex-start; }
  .now { grid-template-columns: 1fr; }
  .now-call .btn { width: 100%; }
  .inline-form { flex-direction: column; align-items: stretch; }
  .inline-form .btn { margin-top: 0; }

  /* Table rows become stacked records */
  .table-wrap { border: 0; }
  .table thead { display: none; }
  .table, .table tbody, .table tr, .table td { display: block; width: 100%; }
  .table tr { border: 1px solid var(--border); border-radius: var(--r-md); margin-bottom: var(--s-2); padding: var(--s-2) 0; }
  .table td { border: 0; padding: var(--s-1) var(--s-3); display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: var(--s-2); }
  .table td > * { grid-column: 2; }
  .table td::before { content: attr(data-label); grid-column: 1; grid-row: 1 / span 3; font-size: var(--fs-xs); font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; padding-top: 2px; }
  .table tbody tr:hover td { background: none; }
  .clamp { max-width: none; }
}
/* ---------- Live status, tags ---------- */
.footer .live { display: inline-flex; align-items: center; gap: var(--s-2); }
.live-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success-500); box-shadow: 0 0 0 0 rgba(22, 163, 74, .5); animation: live-pulse 2s infinite; flex-shrink: 0; }
.live.is-offline .live-dot { background: var(--error-500); animation: none; }
@keyframes live-pulse { 0% { box-shadow: 0 0 0 0 rgba(22, 163, 74, .45); } 70% { box-shadow: 0 0 0 6px rgba(22, 163, 74, 0); } 100% { box-shadow: 0 0 0 0 rgba(22, 163, 74, 0); } }
.tag-warning { color: var(--warning-700); background: var(--warning-50); box-shadow: inset 0 0 0 1px var(--warning-200); }
.text-error { color: var(--error-700); font-weight: 600; }
.nowrap { white-space: nowrap; }

/* ---------- Admin ---------- */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--border); border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; margin-bottom: var(--s-4); }
.stat { background: var(--surface); padding: var(--s-3) var(--s-4); min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.stat-label { font-size: var(--fs-sm); color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-value { font-size: var(--fs-xl); font-weight: 600; line-height: 1.25; font-variant-numeric: tabular-nums; color: var(--text); }
.stat-warning .stat-value { color: var(--warning-700); }
.stat-error .stat-value { color: var(--error-700); }
.stat-sub { font-size: var(--fs-xs); color: var(--text-muted); }
.admin-grid { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); gap: var(--s-4); align-items: start; }
.admin-grid-form { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.admin-grid > .panel { margin-bottom: var(--s-4); }
.feed { list-style: none; margin: var(--s-2) 0 0; padding: 0; max-height: 560px; overflow-y: auto; }
.feed-item { padding: var(--s-3) 0; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 2px; font-size: var(--fs-sm); }
.feed-item:first-child { border-top: 0; }
.subtabs { display: flex; gap: var(--s-1); padding: 4px; background: var(--gray-100); border-radius: var(--r-lg); margin-bottom: var(--s-4); width: fit-content; max-width: 100%; overflow-x: auto; }
.subtab { display: inline-flex; align-items: center; gap: var(--s-2); min-height: 36px; padding: 0 var(--s-4); border: 0; border-radius: var(--r-md); background: transparent; color: var(--text-muted); font-weight: 600; cursor: pointer; white-space: nowrap; }
.subtab:hover { color: var(--text); }
.subtab.is-selected { background: var(--surface); color: var(--brand-700); box-shadow: 0 1px 3px rgba(16, 24, 18, .14); }
.filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: var(--s-3); margin-bottom: var(--s-3); }
.filters-wide { grid-column: span 2; }
.filters-narrow { grid-template-columns: repeat(auto-fill, minmax(170px, 220px)); }
.range-chips, .quick-filters { display: flex; flex-wrap: wrap; gap: var(--s-2); }
.quick-filters { margin-top: var(--s-3); }
.pill { min-height: 32px; padding: 0 var(--s-3); border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); font-size: var(--fs-sm); font-weight: 600; color: var(--gray-700); cursor: pointer; }
.pill:hover { border-color: var(--brand-600); color: var(--brand-700); }
.pill.is-selected { background: var(--brand-50); border-color: var(--brand-600); color: var(--brand-700); }
.records-head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); flex-wrap: wrap; margin-top: var(--s-4); }
select.select-sm { min-height: var(--control-h-sm); font-size: var(--fs-sm); padding-top: 0; padding-bottom: 0; max-width: 220px; }
.show-more { margin-top: var(--s-3); }
.grid-span { grid-column: 1 / -1; }
.grid-2 + .grid-2, .grid-2 + .field, .field + .grid-2 { margin-top: var(--s-4); }
.account-roles { margin-bottom: var(--s-4); }
.editor-divider { display: flex; gap: var(--s-3); align-items: flex-end; flex-wrap: wrap; margin-top: var(--s-5); padding-top: var(--s-4); border-top: 1px solid var(--border); }
.editor-divider .field { flex: 1; min-width: 200px; }
.check-inline { margin-top: var(--s-3); }
.details { margin-top: var(--s-4); font-size: var(--fs-sm); }
.details summary { cursor: pointer; font-weight: 600; color: var(--brand-700); }
.room-day + .room-day { margin-top: var(--s-4); }
.room-day-title { margin: var(--s-3) 0 var(--s-1); font-size: var(--fs-md); }
.item.is-clash { background: var(--warning-50); box-shadow: inset 3px 0 0 var(--warning-500); padding-left: var(--s-3); }
.print-only { display: none; }
@media (max-width: 960px) {
  .admin-grid, .admin-grid-form { grid-template-columns: 1fr; }
}

/* ---------- Student status & alerts ---------- */
.status-turn { color: #fff; background: var(--warning-700); padding: 2px 10px 2px 8px; border-radius: 999px; }
.status-turn .status-dot { background: #fff; animation: dot-pulse 1.2s ease-in-out infinite; }
@keyframes dot-pulse { 50% { opacity: .35; } }

.stages { list-style: none; margin: var(--s-2) 0 var(--s-1); padding: 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); max-width: 440px; }
.stage { position: relative; display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: var(--fs-xs); color: var(--text-muted); text-align: center; }
.stage::before { content: ""; position: absolute; z-index: 0; top: 11px; right: 50%; width: 100%; height: 2px; background: var(--border-strong); }
.stage:first-child::before { display: none; }
.stage.is-done::before, .stage.is-current::before { background: var(--brand-600); }
.stage-dot { position: relative; z-index: 1; width: 24px; height: 24px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; background: var(--surface); border: 2px solid var(--border-strong); font-size: 11px; font-weight: 700; }
.stage-dot .icon { width: 14px; height: 14px; stroke-width: 3; }
.stage.is-done .stage-dot { background: var(--brand-600); border-color: var(--brand-600); color: #fff; }
.stage.is-current { color: var(--brand-700); font-weight: 700; }
.stage.is-current .stage-dot { border-color: var(--brand-600); color: var(--brand-700); box-shadow: 0 0 0 4px var(--brand-50); }
.stage.is-turn { color: var(--warning-700); }
.stage.is-turn .stage-dot { background: var(--warning-700); border-color: var(--warning-700); color: #fff; box-shadow: 0 0 0 4px var(--warning-200); }
.item.is-turn { background: var(--warning-50); box-shadow: inset 4px 0 0 var(--warning-700); padding-left: var(--s-4); padding-right: var(--s-3); border-radius: var(--r-md); }

/* While it rings it stays in view below the sticky tabs; once acknowledged it scrolls away normally. */
.turn-banner { position: relative; top: 60px; z-index: 9; display: flex; align-items: center; gap: var(--s-4); margin: 0 0 var(--s-4); padding: var(--s-4) var(--s-5); border-radius: var(--r-lg); background: var(--warning-700); color: #fff; box-shadow: 0 8px 24px rgba(138, 75, 6, .28); }
.turn-banner:not(.is-ringing) { top: 0; }
.turn-banner.is-ringing { position: sticky; animation: turn-pulse 1.6s ease-in-out infinite; }
@keyframes turn-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(217, 119, 6, .6), 0 8px 24px rgba(138, 75, 6, .28); } 60% { box-shadow: 0 0 0 12px rgba(217, 119, 6, 0), 0 8px 24px rgba(138, 75, 6, .28); } }
.turn-icon { width: 52px; height: 52px; border-radius: 50%; background: rgba(255, 255, 255, .18); display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.turn-icon .icon { width: 28px; height: 28px; }
.is-ringing .turn-icon .icon { animation: bell-swing 1s ease-in-out infinite; transform-origin: 50% 15%; }
@keyframes bell-swing { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(16deg); } 40% { transform: rotate(-13deg); } 60% { transform: rotate(8deg); } 80% { transform: rotate(-4deg); } }
.turn-text { flex: 1; min-width: 0; }
.turn-title { font-family: var(--serif); font-size: var(--fs-2xl); font-weight: 700; line-height: 1.1; margin-bottom: 2px; }
.turn-ticket { font-variant-numeric: tabular-nums; font-size: var(--fs-lg); }
.turn-btn { background: #fff; color: var(--warning-700); }
.turn-btn:hover { background: var(--warning-50); }
.turn-ack { display: inline-flex; align-items: center; gap: var(--s-2); font-weight: 600; white-space: nowrap; }

.notice-stack { display: grid; gap: var(--s-2); margin: 0 0 var(--s-4); }
.notice { display: flex; align-items: flex-start; gap: var(--s-3); padding: var(--s-3) var(--s-2) var(--s-3) var(--s-4); border: 1px solid; border-left-width: 4px; border-radius: var(--r-md); font-size: var(--fs-sm); animation: toast-in .2s ease-out; }
.notice > .icon { margin-top: 1px; }
.notice-success { background: var(--success-50); border-color: var(--success-200); border-left-color: var(--success-500); color: var(--success-700); }
.notice-error { background: var(--error-50); border-color: var(--error-200); border-left-color: var(--error-500); color: var(--error-700); }
.notice-warning { background: var(--warning-50); border-color: var(--warning-200); border-left-color: var(--warning-500); color: var(--warning-700); }
.notice-body { flex: 1; min-width: 0; color: var(--text); }
.notice-title { font-weight: 700; font-size: var(--fs-base); }
.notice-actions { display: flex; flex-wrap: wrap; gap: var(--s-2); margin-top: var(--s-2); }
.notice-close { display: inline-flex; padding: 6px; border: 0; border-radius: var(--r-sm); background: none; color: var(--text-muted); cursor: pointer; }
.notice-close:hover { background: rgba(16, 24, 18, .06); color: var(--text); }

/* ---------- Receipts ---------- */
.receipts-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: var(--s-4); align-items: start; }
.receipt-list { margin: 0; }
.receipt-list ul { list-style: none; margin: var(--s-2) 0 0; padding: 0; display: grid; gap: var(--s-2); }
.receipt-pick { width: 100%; display: flex; flex-direction: column; align-items: flex-start; gap: 2px; padding: var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); background: var(--surface); text-align: left; cursor: pointer; transition: border-color var(--dur-fast) ease; }
.receipt-pick:hover { border-color: var(--brand-600); }
.receipt-pick.is-selected { border-color: var(--brand-600); background: var(--brand-50); box-shadow: inset 0 0 0 1px var(--brand-600); }
.receipt-pick-title { font-weight: 600; }
.receipt-pick .status { margin-top: var(--s-1); }
.receipt-wrap { display: grid; gap: var(--s-2); min-width: 0; scroll-margin-top: 72px; }
.receipt { background: var(--surface); border: 1px solid var(--border); border-radius: var(--r-lg); overflow: hidden; }
.receipt-head { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; padding: var(--s-4) var(--s-5); background: var(--brand-600); color: #fff; }
.receipt-logo { width: 44px; height: 44px; border-radius: 50%; background: #fff; flex-shrink: 0; }
.receipt-school { font-weight: 700; font-size: var(--fs-md); line-height: 1.2; }
.receipt-sub { font-size: var(--fs-xs); letter-spacing: .06em; text-transform: uppercase; opacity: .85; }
.receipt-title { margin: 0 0 0 auto; font-family: var(--serif); font-size: var(--fs-xl); font-weight: 700; }
.receipt-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; padding: var(--s-4) var(--s-5); border-bottom: 1px dashed var(--border-strong); }
.receipt-stamp { display: inline-flex; align-items: center; gap: var(--s-2); padding: var(--s-2) var(--s-4); border: 2px solid var(--success-500); border-radius: var(--r-md); background: var(--success-50); color: var(--success-700); font-weight: 800; font-size: var(--fs-md); letter-spacing: .14em; text-transform: uppercase; transform: rotate(-2deg); }
.receipt-stamp .icon { stroke-width: 3; }
.receipt-ref-box { text-align: right; }
.receipt-label { font-size: var(--fs-xs); font-weight: 600; letter-spacing: .06em; text-transform: uppercase; color: var(--text-muted); }
.receipt-ref { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: var(--fs-lg); font-weight: 700; letter-spacing: .04em; color: var(--brand-700); user-select: all; }
.receipt-body { display: grid; grid-template-columns: minmax(0, 1fr) 184px; gap: var(--s-5); padding: var(--s-5); }
.receipt-sections { display: grid; gap: var(--s-4); min-width: 0; }
.receipt-h { margin: 0 0 var(--s-2); padding-bottom: 4px; border-bottom: 1px solid var(--border); font-size: var(--fs-xs); letter-spacing: .08em; text-transform: uppercase; color: var(--brand-700); }
.receipt-dl { display: grid; gap: 6px; margin: 0; font-size: var(--fs-sm); }
.receipt-row { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: var(--s-3); }
.receipt-dl dt { color: var(--text-muted); }
.receipt-dl dd { margin: 0; font-weight: 600; overflow-wrap: anywhere; }
.receipt-qr { margin: 0; display: flex; flex-direction: column; align-items: center; gap: var(--s-2); font-size: var(--fs-xs); text-align: center; color: var(--text-muted); }
.receipt-qr img, .receipt-qr-empty { display: block; width: 168px; height: 168px; padding: 6px; border: 1px solid var(--border); border-radius: var(--r-md); background: #fff; }
.receipt-foot { padding: var(--s-3) var(--s-5) var(--s-4); border-top: 1px solid var(--border); background: var(--surface-muted); font-size: var(--fs-xs); color: var(--text-muted); }
.receipt-ref-hint { font-family: ui-monospace, "SFMono-Regular", Consolas, monospace; font-size: var(--fs-xs); }

.dialog-wide { width: min(560px, calc(100% - 32px)); max-height: calc(100dvh - 32px); overflow-y: auto; }
.dialog-title .icon { vertical-align: -3px; margin-right: 4px; color: var(--brand-600); }
.verify-result .alert { margin-top: 0; }
.verify-result { display: grid; gap: var(--s-3); }

@media (max-width: 960px) {
  .receipts-layout { grid-template-columns: 1fr; }
  /* One column: the receipt first, the others to pick from after it. */
  .receipt-wrap { order: -1; }
}
@media (max-width: 680px) {
  .turn-banner { flex-wrap: wrap; padding: var(--s-4); gap: var(--s-3); }
  .turn-banner.is-ringing { top: calc(52px + env(safe-area-inset-top)); }
  .turn-text { flex-basis: calc(100% - 64px); }
  .turn-title { font-size: var(--fs-xl); }
  .turn-btn { width: 100%; }
  .dialog-wide { width: 100%; max-height: 90dvh; }
}
@media (max-width: 560px) {
  .receipt-head, .receipt-top, .receipt-body, .receipt-foot { padding-left: var(--s-4); padding-right: var(--s-4); }
  .receipt-title { margin-left: 0; width: 100%; font-size: var(--fs-lg); }
  .receipt-ref-box { text-align: left; }
  .receipt-body { grid-template-columns: 1fr; }
  .receipt-qr { order: -1; }
  .receipt-row { grid-template-columns: 110px minmax(0, 1fr); }
}
@media (max-width: 680px) {
  .filters { grid-template-columns: 1fr 1fr; }
  .filters-wide { grid-column: 1 / -1; }
  .stats { grid-template-columns: 1fr 1fr; }
  .subtabs { width: 100%; }
  .subtab { flex: 1; justify-content: center; padding: 0 var(--s-2); }
  /* Admin tables have many columns: keep them as tables and scroll sideways inside their box. */
  .table-wrap.is-wide { border: 1px solid var(--border); }
  .is-wide .table { display: table; min-width: 680px; }
  .is-wide .table thead { display: table-header-group; }
  .is-wide .table tbody { display: table-row-group; }
  .is-wide .table tr { display: table-row; border: 0; margin: 0; padding: 0; }
  .is-wide .table td { display: table-cell; width: auto; border-bottom: 1px solid var(--border); padding: var(--s-2) var(--s-3); }
  .is-wide .table td::before { content: none; }
}
@media print {
  .topbar, .nav, .tabbar, .footer, .toast-region, .skip-link, .no-print, .page-actions { display: none !important; }
  .print-only { display: block; margin-bottom: var(--s-3); }
  body, .app { background: #fff; }
  .main { padding: 0; max-width: none; }
  .panel, .stat { break-inside: avoid; border-color: #999; }
  .table-wrap { overflow: visible; }
  .page { animation: none !important; }
  /* Receipts: only the receipt itself, with its colours. */
  .receipts-page .page-head, .turn-banner, .notice-stack { display: none !important; }
  .receipts-layout { display: block; }
  .receipt { border-color: #999; break-inside: avoid; }
  .receipt, .receipt * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .receipt-body { grid-template-columns: minmax(0, 1fr) 184px; }
  .receipt-qr { order: 0; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation: none !important; transition: none !important; scroll-behavior: auto !important; }
}
`;
