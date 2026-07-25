export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const DAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function toMinutes(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function minutesToHHMM(mins) {
  mins = ((mins % 1440) + 1440) % 1440;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatTime12(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return m === 0 ? `${h12}${period}` : `${h12}:${String(m).padStart(2, "0")}${period}`;
}

export function dateKey(d) {
  return d.toISOString().slice(0, 10);
}

// Whichever hours block (dated exception or regular weekly hours) is
// covering `when` right now, or null if the business is closed. Shared by
// isOpenAt and minutesUntilClose so the two never drift apart.
function activeBlockAt(business, when) {
  const key = dateKey(when);
  const exception = (business.exceptions || []).find((e) => e.date === key);
  const minutesNow = when.getHours() * 60 + when.getMinutes();

  if (exception) {
    if (exception.closed) return null;
    if (exception.start && exception.end) {
      return spans(exception.start, exception.end, minutesNow) ? exception : null;
    }
  }

  const dow = when.getDay();
  return (business.hours || []).find((h) => h.dayOfWeek === dow && spans(h.start, h.end, minutesNow)) || null;
}

// Is business open at a given Date instant, honoring date-specific exceptions.
export function isOpenAt(business, when = new Date()) {
  return activeBlockAt(business, when) !== null;
}

// Minutes from `when` until the currently-open block closes, or null if the
// business isn't open at `when`. Used to sort "open now" results by
// soonest-closing first.
export function minutesUntilClose(business, when = new Date()) {
  const active = activeBlockAt(business, when);
  if (!active) return null;
  const minutesNow = when.getHours() * 60 + when.getMinutes();
  const end = toMinutes(active.end);
  return ((end - minutesNow) % 1440 + 1440) % 1440;
}

function spans(start, end, minutes) {
  const s = toMinutes(start);
  const e = toMinutes(end);
  if (e <= s) {
    // overnight block, e.g. 22:00-02:00
    return minutes >= s || minutes < e;
  }
  return minutes >= s && minutes < e;
}

export function nextChangeLabel(business, when = new Date()) {
  const open = isOpenAt(business, when);
  return open ? "Open now" : "Closed now";
}

export function hoursForDay(business, dow) {
  return (business.hours || [])
    .filter((h) => h.dayOfWeek === dow)
    .sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
}

export function startOfWeek(d = new Date()) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}
