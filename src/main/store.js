'use strict';

const fs = require('fs');
const path = require('path');
const { createDefaultAnnouncements, createDefaultSettings, DEFAULT_VOICE_ID } = require('../shared/defaults');
const { dateKey, clampRate, clampVolume } = require('../shared/time');
const CLOCK_INTERVALS = [5, 10, 15, 20, 30, 60];
const { normalizeAnnouncement } = require('../shared/validate');

function createStore(dir, options = {}) {
  const log = options.log || { info() {}, error() {} };
  const clock = options.clock || (() => new Date());
  const newId = options.newId || (() => require('crypto').randomUUID());
  const announcementsPath = path.join(dir, 'announcements.json');
  const settingsPath = path.join(dir, 'settings.json');
  const firedPath = path.join(dir, 'fired.json');
  fs.mkdirSync(dir, { recursive: true });

  let announcements = [];
  let settings = createDefaultSettings();

  function nowIso() {
    return clock().toISOString();
  }

  function writeJson(file, value) {
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp, { force: true });
  }

  function readJson(file) {
    if (!fs.existsSync(file)) return { missing: true, value: null };
    try {
      return { missing: false, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
    } catch (error) {
      const backup = `${file}.corrupt-${Date.now()}`;
      try {
        fs.renameSync(file, backup);
      } catch (renameError) {
        log.error(renameError);
      }
      log.error(`Could not read ${path.basename(file)}. Moved it aside and restored defaults. ${error.message}`);
      return { missing: false, corrupt: true, value: null };
    }
  }

  function fallbackVoice() {
    return settings.defaultVoiceId || DEFAULT_VOICE_ID;
  }

  function stampList(list) {
    const now = nowIso();
    const cleaned = [];
    for (const item of list) {
      const result = normalizeAnnouncement(item, {
        fallbackVoice: fallbackVoice(),
        now,
        preserveTimestamps: true
      });
      if (result.error) {
        log.error(`Skipped a saved announcement: ${result.error}`);
        continue;
      }
      cleaned.push(result.value);
    }
    return cleaned;
  }

  function writeAnnouncements() {
    writeJson(announcementsPath, { version: 1, announcements });
  }

  function writeSettings() {
    writeJson(settingsPath, settings);
  }

  function normalizeSettings(raw, defaults) {
    const interval = Number(raw.clockIntervalMinutes);
    return {
      version: 1,
      firstRunComplete: raw.firstRunComplete === true,
      defaultVoiceId: typeof raw.defaultVoiceId === 'string' && raw.defaultVoiceId.trim() ? raw.defaultVoiceId.trim() : defaults.defaultVoiceId,
      defaultRate: clampRate(raw.defaultRate, defaults.defaultRate),
      defaultVolume: clampVolume(raw.defaultVolume, defaults.defaultVolume),
      launchAtStartup: raw.launchAtStartup === true,
      minimizeToTray: raw.minimizeToTray !== false,
      playStartupSound: raw.playStartupSound === true,
      paused: raw.paused === true,
      clockAnnouncements: raw.clockAnnouncements === true,
      clockIntervalMinutes: CLOCK_INTERVALS.includes(interval) ? interval : defaults.clockIntervalMinutes,
      suppressWhenLocked: raw.suppressWhenLocked === true,
      suppressWhenPresenting: raw.suppressWhenPresenting === true
    };
  }

  function loadSettings() {
    const defaults = createDefaultSettings();
    const result = readJson(settingsPath);
    if (result.missing || result.corrupt || !result.value || typeof result.value !== 'object') {
      settings = defaults;
      writeSettings();
      return;
    }
    settings = normalizeSettings(result.value, defaults);
    writeSettings();
  }

  function loadAnnouncements() {
    const result = readJson(announcementsPath);
    if (result.missing || result.corrupt || !result.value || !Array.isArray(result.value.announcements)) {
      const now = nowIso();
      announcements = stampList(createDefaultAnnouncements().map((item) => ({
        ...item,
        createdAt: now,
        updatedAt: now
      })));
      writeAnnouncements();
      log.info('Loaded the default ClassBell schedule.');
      return;
    }
    announcements = stampList(result.value.announcements);
    writeAnnouncements();
  }

  function cloneAnnouncement(item) {
    const copy = {
      ...item,
      times: [...item.times]
    };
    if (item.days) copy.days = [...item.days];
    else delete copy.days;
    return copy;
  }

  function getAnnouncements() {
    return announcements.map(cloneAnnouncement);
  }

  function getSettings() {
    return { ...settings };
  }

  function findIndex(id) {
    return announcements.findIndex((item) => item.id === id);
  }

  function saveAnnouncement(raw) {
    const existing = typeof raw.id === 'string' ? announcements.find((item) => item.id === raw.id) : null;
    const result = normalizeAnnouncement({
      ...raw,
      createdAt: existing ? existing.createdAt : raw.createdAt
    }, {
      fallbackVoice: fallbackVoice(),
      now: nowIso(),
      preserveTimestamps: false
    });
    if (result.error) return { ok: false, error: result.error };
    if (existing) result.value.createdAt = existing.createdAt;
    const index = findIndex(result.value.id);
    if (index >= 0) announcements[index] = result.value;
    else announcements.push(result.value);
    writeAnnouncements();
    return { ok: true };
  }

  function deleteAnnouncement(id) {
    const index = findIndex(id);
    if (index < 0) return { ok: false, error: 'That announcement was not found.' };
    announcements.splice(index, 1);
    writeAnnouncements();
    return { ok: true };
  }

  function duplicateAnnouncement(id) {
    const existing = announcements.find((item) => item.id === id);
    if (!existing) return { ok: false, error: 'That announcement was not found.' };
    const now = nowIso();
    const copy = normalizeAnnouncement({
      ...existing,
      id: newId(),
      title: `Copy of ${existing.title}`.slice(0, 140),
      enabled: existing.placeholder ? false : existing.enabled,
      createdAt: now,
      updatedAt: now
    }, {
      fallbackVoice: fallbackVoice(),
      now,
      preserveTimestamps: true
    });
    if (copy.error) return { ok: false, error: copy.error };
    announcements.push(copy.value);
    writeAnnouncements();
    return { ok: true, id: copy.value.id };
  }

  function setEnabled(id, enabled) {
    const item = announcements.find((entry) => entry.id === id);
    if (!item) return { ok: false, error: 'That announcement was not found.' };
    if (item.placeholder && enabled) {
      return { ok: false, error: 'This placeholder has no finished script, so it will not speak. Edit it and mark it ready first.' };
    }
    item.enabled = enabled === true;
    item.updatedAt = nowIso();
    writeAnnouncements();
    return { ok: true };
  }

  function reorder(id, direction) {
    const index = findIndex(id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= announcements.length) {
      return { ok: false, error: 'That announcement cannot move any further.' };
    }
    const [item] = announcements.splice(index, 1);
    item.updatedAt = nowIso();
    announcements.splice(target, 0, item);
    writeAnnouncements();
    return { ok: true };
  }

  function replaceAnnouncements(list) {
    announcements = stampList(list);
    writeAnnouncements();
    return { ok: true };
  }

  function mergeAnnouncements(list) {
    const incoming = stampList(list);
    for (const item of incoming) {
      const index = findIndex(item.id);
      if (index >= 0) announcements[index] = { ...announcements[index], ...item, createdAt: announcements[index].createdAt };
      else announcements.push(item);
    }
    writeAnnouncements();
    return { ok: true };
  }

  function updateSettings(partial) {
    const defaults = createDefaultSettings();
    settings = normalizeSettings({ ...settings, ...partial }, defaults);
    writeSettings();
    return getSettings();
  }

  function loadFired(now) {
    const today = dateKey(now);
    const result = readJson(firedPath);
    if (result.corrupt || result.missing || !result.value || result.value.date !== today || !Array.isArray(result.value.keys)) {
      writeJson(firedPath, { date: today, keys: [] });
      return new Set();
    }
    return new Set(result.value.keys);
  }

  function markFired(keys, now) {
    const today = dateKey(now);
    const fired = loadFired(now);
    for (const key of keys) fired.add(key);
    writeJson(firedPath, { date: today, keys: [...fired] });
    return fired;
  }

  loadSettings();
  loadAnnouncements();

  return {
    getAnnouncements,
    getSettings,
    saveAnnouncement,
    deleteAnnouncement,
    duplicateAnnouncement,
    setEnabled,
    reorder,
    replaceAnnouncements,
    mergeAnnouncements,
    updateSettings,
    loadFired,
    markFired
  };
}

module.exports = { createStore };
