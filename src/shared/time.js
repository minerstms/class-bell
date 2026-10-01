'use strict';

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_CODES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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

function nextDate(announcement, now) {
  const times = (announcement.times || []).filter(parseTime);
  let best = null;
  for (const dayOffset of [0, 1]) {
    for (const hhmm of times) {
      const when = dateAt(now, hhmm, dayOffset);
      if (!when) continue;
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
  const cleaned = [...new Set(days.map((day) => String(day).trim().toLowerCase()).filter((day) => DAY_CODES.includes(day)))];
  return cleaned.length ? cleaned : null;
}

module.exports = {
  TIME_RE,
  DAY_CODES,
  parseTime,
  format12,
  isEarlyHour,
  earlyTimesMessage,
  dateKey,
  dateAt,
  dayCode,
  nextDate,
  nextLabel,
  clampRate,
  clampVolume,
  normalizeDays
};
