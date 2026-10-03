'use strict';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const DAY_CHOICES = [
  { id: 'sun', label: 'Sunday' },
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' }
];

function parseTime(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const match = TIME_RE.exec(hhmm);
  if (!match) return null;
  return { h: Number(match[1]), min: Number(match[2]) };
}

function format12(hhmm) {
  const parsed = parseTime(hhmm);
  if (!parsed) return String(hhmm ?? '');
  const suffix = parsed.h >= 12 ? 'PM' : 'AM';
  const hour = parsed.h % 12 || 12;
  return `${hour}:${String(parsed.min).padStart(2, '0')} ${suffix}`;
}

function isEarlyHour(hhmm) {
  const parsed = parseTime(hhmm);
  return Boolean(parsed) && parsed.h < 7;
}

function earlyTimesMessage(times) {
  const early = (Array.isArray(times) ? times : []).filter(isEarlyHour);
  if (!early.length) return '';
  const label = early.length > 1
    ? 'Early times saved exactly as stored'
    : 'Early time saved exactly as stored';
  const parts = early.map((hhmm) => `${format12(hhmm)} (stored ${hhmm})`);
  return `${label}: ${parts.join(', ')}. Change it if this should be later in the day.`;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateAt(now, hhmm, dayOffset) {
  const parsed = parseTime(hhmm);
  if (!parsed) return null;
  const next = new Date(now.getTime());
  next.setDate(next.getDate() + dayOffset);
  next.setHours(parsed.h, parsed.min, 0, 0);
  return next;
}

function dayCode(date) {
  return DAY_CODES[date.getDay()];
}

function allowsDay(announcement, date) {
  const days = normalizeDays(announcement && announcement.days);
  if (!days) return true;
  return days.includes(dayCode(date));
}

function nextDate(announcement, now) {
  const times = (announcement.times || []).filter(parseTime);
  const horizon = normalizeDays(announcement && announcement.days) ? 8 : 2;
  let best = null;
  for (let dayOffset = 0; dayOffset < horizon; dayOffset += 1) {
    for (const hhmm of times) {
      const when = dateAt(now, hhmm, dayOffset);
      if (!when || !allowsDay(announcement, when)) continue;
      if (when.getTime() + 60000 <= now.getTime()) continue;
      if (!best || when < best.dt) best = { dt: when, hhmm };
    }
    if (best) break;
  }
  return best;
}

function nextLabel(announcement, now) {
  if (!announcement || announcement.placeholder) return 'Will not speak';
  const next = nextDate(announcement, now || new Date());
  if (!next) return 'No times';
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const thatDay = new Date(next.dt.getFullYear(), next.dt.getMonth(), next.dt.getDate());
  const diffDays = Math.round((thatDay.getTime() - today.getTime()) / 86400000);
  const when = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : next.dt.toLocaleDateString();
  return `${when} ${format12(next.hhmm)}`;
}

function to12Parts(hhmm) {
  const parsed = parseTime(hhmm);
  if (!parsed) return { hour: 8, minute: 0, suffix: 'AM' };
  return {
    hour: parsed.h % 12 || 12,
    minute: parsed.min,
    suffix: parsed.h >= 12 ? 'PM' : 'AM'
  };
}

function from12Parts(hour, minute, suffix) {
  let h = Number(hour);
  const m = Number(minute);
  if (!Number.isInteger(h) || h < 1 || h > 12) return null;
  if (!Number.isInteger(m) || m < 0 || m > 59) return null;
  const marker = String(suffix || '').toUpperCase();
  if (marker !== 'AM' && marker !== 'PM') return null;
  if (marker === 'AM') h = h === 12 ? 0 : h;
  else h = h === 12 ? 12 : h + 12;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function nextUpcoming(announcements, now) {
  const clock = now || new Date();
  let best = null;
  (Array.isArray(announcements) ? announcements : []).forEach((announcement, index) => {
    if (!announcement || announcement.enabled !== true || announcement.placeholder) return;
    const next = nextDate(announcement, clock);
    if (!next) return;
    const sameTime = best && next.dt.getTime() === best.dt.getTime();
    if (!best || next.dt < best.dt || (sameTime && index < best.index)) {
      best = { announcement, hhmm: next.hhmm, dt: next.dt, index };
    }
  });
  return best;
}

function upcomingLabel(announcements, now) {
  const clock = now || new Date();
  const best = nextUpcoming(announcements, clock);
  if (!best) return 'No upcoming announcement.';
  return `Next announcement: ${best.announcement.title}, ${nextLabel(best.announcement, clock)}`;
}

function clampRate(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  const rounded = Math.round(number * 100) / 100;
  return Math.max(0.75, Math.min(1.35, rounded));
}

function clampVolume(value, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, Math.round(number)));
}

function normalizeDays(days) {
  if (!Array.isArray(days) || days.length === 0) return null;
  const cleaned = new Set(days.map((day) => String(day).trim().toLowerCase()).filter((day) => DAY_CODES.includes(day)));
  const ordered = DAY_CODES.filter((day) => cleaned.has(day));
  return ordered.length ? ordered : null;
}

function duplicateTimes(times) {
  const seen = new Set();
  const duplicates = [];
  for (const hhmm of Array.isArray(times) ? times : []) {
    if (!parseTime(hhmm)) continue;
    if (seen.has(hhmm)) duplicates.push(hhmm);
    else seen.add(hhmm);
  }
  return duplicates;
}

function recurrenceMode(days) {
  const cleaned = normalizeDays(days);
  if (!cleaned) return 'daily';
  if (cleaned.length === WEEKDAYS.length && WEEKDAYS.every((day) => cleaned.includes(day))) return 'weekdays';
  return 'selected';
}

function recurrenceLabel(days) {
  const mode = recurrenceMode(days);
  if (mode === 'daily') return 'Every day';
  if (mode === 'weekdays') return 'Weekdays';
  const cleaned = normalizeDays(days) || [];
  return cleaned.map((day) => DAY_CHOICES.find((choice) => choice.id === day).label).join(', ');
}

module.exports = {
  TIME_RE,
  DAY_CODES,
  WEEKDAYS,
  DAY_CHOICES,
  parseTime,
  format12,
  isEarlyHour,
  earlyTimesMessage,
  dateKey,
  dateAt,
  dayCode,
  nextDate,
  nextLabel,
  to12Parts,
  from12Parts,
  nextUpcoming,
  upcomingLabel,
  clampRate,
  clampVolume,
  normalizeDays,
  allowsDay,
  duplicateTimes,
  recurrenceMode,
  recurrenceLabel
};
