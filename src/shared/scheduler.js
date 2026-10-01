'use strict';

const { dateAt, dateKey, dayCode, parseTime } = require('./time');

// An announcement is spoken only when ClassBell observes the local clock
// within GRACE_MS after the scheduled minute. Sleep, hibernation, or a clock
// jump beyond that window does not replay missed announcements.
const GRACE_MS = 30 * 1000;

function announcementAllowsDate(announcement, date) {
  if (!announcement || !Array.isArray(announcement.days) || announcement.days.length === 0) return true;
  const allowed = announcement.days.map((day) => String(day).toLowerCase());
  return allowed.includes(dayCode(date));
}

function isDue(now, hhmm, graceMs) {
  const slot = dateAt(now, hhmm, 0);
  if (!slot) return false;
  const late = now.getTime() - slot.getTime();
  return late >= 0 && late <= graceMs;
}

function occurrenceKey(id, date, hhmm) {
  return `${id}|${dateKey(date)}|${hhmm}`;
}

function collectDue(announcements, now, firedKeys, options = {}) {
  const graceMs = options.graceMs == null ? GRACE_MS : options.graceMs;
  if (options.paused) return [];
  const due = [];
  const fired = firedKeys instanceof Set ? firedKeys : new Set(firedKeys || []);
  for (const announcement of announcements || []) {
    if (!announcement || announcement.enabled !== true) continue;
    if (announcement.placeholder === true) continue;
    if (!announcement.message || !String(announcement.message).trim()) continue;
    if (!announcementAllowsDate(announcement, now)) continue;
    const times = Array.isArray(announcement.times) ? announcement.times : [];
    for (const hhmm of times) {
      if (!parseTime(hhmm) || !isDue(now, hhmm, graceMs)) continue;
      const key = occurrenceKey(announcement.id, now, hhmm);
      if (fired.has(key)) continue;
      due.push({ announcement, hhmm, key });
    }
  }
  return due;
}

module.exports = {
  GRACE_MS,
  announcementAllowsDate,
  isDue,
  occurrenceKey,
  collectDue
};
