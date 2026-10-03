'use strict';

const { allowsDay, dateAt, dateKey, format12, parseTime } = require('./time');

// An announcement is spoken only when ClassBell observes the local clock
// within GRACE_MS after the scheduled minute. Sleep, hibernation, or a clock
// jump beyond that window does not replay missed announcements.
const GRACE_MS = 30 * 1000;

function announcementAllowsDate(announcement, date) {
  return allowsDay(announcement, date);
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

const CLOCK_INTERVALS = [5, 10, 15, 20, 30, 60];

function collectClockChime(now, settings, firedKeys, options = {}) {
  const graceMs = options.graceMs == null ? GRACE_MS : options.graceMs;
  if (!settings || settings.clockAnnouncements !== true || settings.paused === true) return null;
  const interval = CLOCK_INTERVALS.includes(Number(settings.clockIntervalMinutes))
    ? Number(settings.clockIntervalMinutes)
    : 60;
  if (now.getMinutes() % interval !== 0) return null;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (!isDue(now, hhmm, graceMs)) return null;
  const key = `clock|${dateKey(now)}|${hhmm}`;
  const fired = firedKeys instanceof Set ? firedKeys : new Set(firedKeys || []);
  if (fired.has(key)) return null;
  return {
    hhmm,
    key,
    title: 'Time announcement',
    text: `The time is ${format12(hhmm)}.`
  };
}

module.exports = {
  GRACE_MS,
  CLOCK_INTERVALS,
  announcementAllowsDate,
  isDue,
  occurrenceKey,
  collectDue,
  collectClockChime
};
