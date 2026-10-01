'use strict';

const crypto = require('crypto');
const { clampRate, clampVolume, normalizeDays, parseTime } = require('./time');

const SCHEDULE_FORMAT = 'classbell-schedule';
const SCHEDULE_VERSION = 1;
const MAX_IMPORT_CHARS = 2000000;

function newId() {
  return crypto.randomUUID();
}

function normalizeAnnouncement(raw, options = {}) {
  const fallbackVoice = options.fallbackVoice || 'linda';
  const now = options.now || new Date().toISOString();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'Announcement must be an object.' };
  }
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return { error: 'Title is required.' };
  const message = typeof raw.message === 'string' ? raw.message : '';
  const placeholder = raw.placeholder === true;
  if (!placeholder && !message.trim()) return { error: `Message is required for "${title}".` };
  const times = [];
  if (raw.times != null && !Array.isArray(raw.times)) return { error: `Times for "${title}" must be a list.` };
  for (const time of raw.times || []) {
    if (typeof time !== 'string' || !parseTime(time)) {
      return { error: `Invalid time "${time}" in "${title}". Use 24-hour HH:MM, such as 08:50.` };
    }
    if (!times.includes(time)) times.push(time);
  }
  times.sort();
  const days = normalizeDays(raw.days);
  const value = {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newId(),
    title: title.slice(0, 140),
    message: message.slice(0, 8000),
    enabled: placeholder ? false : raw.enabled === true,
    placeholder,
    times,
    voiceId: typeof raw.voiceId === 'string' && raw.voiceId.trim() ? raw.voiceId.trim() : fallbackVoice,
    rate: clampRate(raw.rate, 1),
    volume: clampVolume(raw.volume, 100),
    notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '',
    createdAt: options.preserveTimestamps && typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: options.preserveTimestamps && typeof raw.updatedAt === 'string' ? raw.updatedAt : now
  };
  if (days) value.days = days;
  return { value };
}

function parseScheduleImport(input, options = {}) {
  let text = input;
  let data = input;
  if (typeof input === 'string') {
    text = input.replace(/^\uFEFF/, '');
    if (text.length > MAX_IMPORT_CHARS) return { ok: false, errors: ['That file is too large to import.'] };
    try {
      data = JSON.parse(text);
    } catch (error) {
      return { ok: false, errors: ['That file is not valid JSON.'] };
    }
  }
  if (!data || typeof data !== 'object') return { ok: false, errors: ['Schedule file must be a JSON object.'] };
  if (!Array.isArray(data) && data.format && data.format !== SCHEDULE_FORMAT) {
    return { ok: false, errors: ['This file is not a ClassBell schedule.'] };
  }
  const list = Array.isArray(data) ? data : data.announcements;
  if (!Array.isArray(list)) return { ok: false, errors: ['No announcements list was found in that file.'] };
  const announcements = [];
  const errors = [];
  const seen = new Set();
  list.forEach((item, index) => {
    const result = normalizeAnnouncement(item, options);
    if (result.error) {
      errors.push(`Item ${index + 1}: ${result.error}`);
      return;
    }
    if (seen.has(result.value.id)) errors.push(`Item ${index + 1}: Duplicate id "${result.value.id}".`);
    seen.add(result.value.id);
    announcements.push(result.value);
  });
  if (errors.length) return { ok: false, errors };
  return { ok: true, announcements };
}

function exportSchedule(announcements, exportedAt) {
  return {
    format: SCHEDULE_FORMAT,
    version: SCHEDULE_VERSION,
    exportedAt: exportedAt || new Date().toISOString(),
    announcements
  };
}

function exportScheduleJson(announcements, exportedAt) {
  return `${JSON.stringify(exportSchedule(announcements, exportedAt), null, 2)}\n`;
}

module.exports = {
  SCHEDULE_FORMAT,
  SCHEDULE_VERSION,
  normalizeAnnouncement,
  parseScheduleImport,
  exportSchedule,
  exportScheduleJson
};
