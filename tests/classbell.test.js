'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createDefaultAnnouncements, createDefaultSettings } = require('../src/shared/defaults');
const { createQueue } = require('../src/shared/queue');
const { GRACE_MS, collectDue, occurrenceKey } = require('../src/shared/scheduler');
const { earlyTimesMessage, format12, nextLabel } = require('../src/shared/time');
const { exportScheduleJson, parseScheduleImport } = require('../src/shared/validate');
const { applyVolume, peakAmplitude, wavDurationMs } = require('../src/shared/wav');
const { lengthScaleForRate } = require('../src/main/tts');
const { createStore } = require('../src/main/store');

const EXPECTED = {
  'welcome-to-class': {
    title: 'Welcome to Class',
    times: ['08:00'],
    message: 'Welcome to class. Please find your seat and get ready to begin.'
  },
  'attendance-reminder': {
    title: 'Attendance Reminder',
    times: ['08:05'],
    message: 'Please make sure attendance has been taken.'
  },
  'begin-independent-work': {
    title: 'Begin Independent Work',
    times: ['08:10'],
    message: 'It is time to begin independent work. Stay focused and do your best.'
  },
  'halfway-reminder': {
    title: 'Halfway Reminder',
    times: ['08:25'],
    message: 'This is the halfway reminder. Check your progress and keep going.'
  },
  'cleanup-warning': {
    title: 'Cleanup Warning',
    times: ['08:45'],
    message: 'Cleanup warning. You have a few minutes to finish, save your work, and put materials away.'
  },
  'end-of-class': {
    title: 'End of Class',
    times: ['08:55'],
    message: 'Class is ending. Please turn in your work and leave the room ready for the next class.'
  }
};

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'classbell-test-'));
}

function sample(id, overrides = {}) {
  return {
    id,
    title: id,
    message: 'Hello class.',
    enabled: true,
    placeholder: false,
    times: ['08:50'],
    voiceId: 'linda',
    rate: 1,
    volume: 100,
    notes: '',
    ...overrides
  };
}

test('default announcements are generic samples', () => {
  const announcements = createDefaultAnnouncements();
  assert.equal(announcements.length, 6);
  for (const [id, expected] of Object.entries(EXPECTED)) {
    const item = announcements.find((entry) => entry.id === id);
    assert.ok(item, id);
    assert.equal(item.title, expected.title);
    assert.equal(item.message, expected.message);
    assert.deepEqual(item.times, expected.times);
    assert.equal(item.enabled, true);
    assert.equal(item.placeholder, false);
    assert.equal(item.voiceId, 'linda');
  }
  assert.equal(announcements.some((item) => item.placeholder), false);
});

test('defaults are safe and 12-hour labels keep the stored hour', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.firstRunComplete, false);
  assert.equal(settings.launchAtStartup, false);
  assert.equal(settings.minimizeToTray, true);
  assert.equal(settings.paused, false);
  assert.equal(format12('00:05'), '12:05 AM');
  assert.equal(format12('01:15'), '1:15 AM');
  assert.equal(format12('12:00'), '12:00 PM');
  assert.equal(format12('13:05'), '1:05 PM');
  assert.equal(format12('08:50'), '8:50 AM');
  assert.equal(
    earlyTimesMessage(['01:15', '02:15', '03:15']),
    'Early times saved exactly as stored: 1:15 AM (stored 01:15), 2:15 AM (stored 02:15), 3:15 AM (stored 03:15). Change it if this should be later in the day.'
  );
});

test('scheduler speaks once inside 30 seconds and skips stale or paused items', () => {
  assert.equal(GRACE_MS, 30000);
  const thursday = new Date(2026, 9, 1, 8, 50, 0, 0);
  assert.equal(thursday.getDay(), 4);
  const first = sample('a', { times: ['08:50'] });
  const second = sample('b', { times: ['08:50'] });
  const onTime = collectDue([first, second], new Date(2026, 9, 1, 8, 50, 30, 0), new Set());
  assert.deepEqual(onTime.map((item) => item.announcement.id), ['a', 'b']);
  const tooLate = collectDue([first], new Date(2026, 9, 1, 8, 50, 30, 1), new Set());
  assert.equal(tooLate.length, 0);
  const afterSleep = collectDue([first], new Date(2026, 9, 1, 9, 10, 0, 0), new Set());
  assert.equal(afterSleep.length, 0);
  const key = occurrenceKey('a', thursday, '08:50');
  const again = collectDue([first], new Date(2026, 9, 1, 8, 50, 10, 0), new Set([key]));
  assert.equal(again.length, 0);
  assert.equal(collectDue([first], thursday, new Set(), { paused: true }).length, 0);
  assert.equal(collectDue([sample('off', { enabled: false })], thursday, new Set()).length, 0);
  assert.equal(collectDue([sample('empty', { message: '   ' })], thursday, new Set()).length, 0);
  assert.equal(collectDue([sample('draft', { placeholder: true, enabled: true, message: 'x' })], thursday, new Set()).length, 0);
  assert.equal(collectDue([sample('monday', { days: ['mon'] })], thursday, new Set()).length, 0);
  assert.equal(collectDue([sample('today', { days: ['thu'] })], thursday, new Set()).length, 1);
  assert.equal(nextLabel(first, new Date(2026, 9, 1, 8, 40, 0)), 'Today 8:50 AM');
  assert.equal(nextLabel(sample('later', { times: ['08:50', '10:50'] }), new Date(2026, 9, 1, 16, 0, 0)), 'Tomorrow 8:50 AM');
  assert.equal(nextLabel(sample('draft', { placeholder: true }), thursday), 'Will not speak');
});

test('speech queue does not overlap and can play a test next', async () => {
  const queue = createQueue();
  const events = [];
  let releaseFirst;
  const gate = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  queue.setRunner(async (item) => {
    events.push(`start ${item.id}`);
    if (item.id === 'a') await gate;
    events.push(`end ${item.id}`);
  });
  assert.equal(queue.enqueue({ id: 'a' }), true);
  assert.equal(queue.enqueue({ id: 'b' }), true);
  assert.equal(queue.enqueueNext({ id: 'c' }), true);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.deepEqual(events, ['start a']);
  releaseFirst();
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.deepEqual(events, ['start a', 'end a', 'start c', 'end c', 'start b', 'end b']);
});

test('import validates, merges, and replaces without dropping early times', () => {
  const dir = tempDir();
  const store = createStore(dir);
  const originalCount = store.getAnnouncements().length;
  const bad = parseScheduleImport('{"format":"classbell-schedule","announcements":[{"title":"Bell","message":"Hi","times":["8:50"]}]}');
  assert.equal(bad.ok, false);
  const parsed = parseScheduleImport({
    format: 'classbell-schedule',
    version: 1,
    announcements: [
      sample('attendance-reminder', { title: 'Attendance Reminder', message: 'Updated attendance.', times: ['01:15', '08:09'] }),
      sample('new-bell', { title: 'New Bell', times: ['09:00'] })
    ]
  }, { now: '2026-10-01T12:00:00.000Z', preserveTimestamps: true });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.announcements[0].times, ['01:15', '08:09']);
  store.mergeAnnouncements(parsed.announcements);
  const merged = store.getAnnouncements();
  assert.equal(merged.length, originalCount + 1);
  assert.equal(merged.find((item) => item.id === 'attendance-reminder').message, 'Updated attendance.');
  assert.ok(merged.find((item) => item.id === 'welcome-to-class'));
  store.replaceAnnouncements(parsed.announcements);
  const replaced = store.getAnnouncements();
  assert.equal(replaced.length, 2);
  assert.equal(replaced.find((item) => item.id === 'welcome-to-class'), undefined);
  const exported = exportScheduleJson(replaced, '2026-10-01T12:00:00.000Z');
  assert.match(exported, /"format": "classbell-schedule"/);
  assert.match(exported, /"01:15"/);
  const wrong = parseScheduleImport({ format: 'something-else', announcements: [] });
  assert.equal(wrong.ok, false);
});

test('store survives corrupt files and will not enable a placeholder', () => {
  const dir = tempDir();
  const store = createStore(dir);
  const draft = store.saveAnnouncement({
    id: 'draft-placeholder',
    title: 'Unfinished sample',
    message: '',
    placeholder: true,
    enabled: true,
    times: []
  });
  assert.equal(draft.ok, true);
  assert.equal(store.setEnabled('draft-placeholder', true).ok, false);
  assert.equal(store.getAnnouncements().find((item) => item.id === 'draft-placeholder').enabled, false);
  assert.equal(store.setEnabled('attendance-reminder', false).ok, true);
  const copy = store.duplicateAnnouncement('welcome-to-class');
  assert.equal(copy.ok, true);
  assert.equal(store.getAnnouncements().at(-1).title, 'Copy of Welcome to Class');
  assert.equal(store.reorder(copy.id, -1).ok, true);
  store.deleteAnnouncement(copy.id);
  for (const item of store.getAnnouncements()) store.deleteAnnouncement(item.id);
  assert.equal(store.getAnnouncements().length, 0);
  const reopened = createStore(dir);
  assert.equal(reopened.getAnnouncements().length, 0);

  fs.writeFileSync(path.join(dir, 'announcements.json'), '{not json');
  const restored = createStore(dir);
  assert.equal(restored.getAnnouncements().length, 6);
  assert.ok(fs.readdirSync(dir).some((name) => name.startsWith('announcements.json.corrupt-')));
  fs.writeFileSync(path.join(dir, 'settings.json'), '{not json');
  const settingsRestored = createStore(dir);
  assert.equal(settingsRestored.getSettings().defaultVoiceId, 'linda');
  assert.equal(settingsRestored.getSettings().firstRunComplete, false);
});

test('wav duration, peak, and volume scaling', () => {
  const sampleRate = 22050;
  const samples = sampleRate;
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples; i += 1) buffer.writeInt16LE(i % 20 < 10 ? 8000 : -8000, 44 + i * 2);
  assert.equal(wavDurationMs(buffer), 1000);
  assert.equal(peakAmplitude(buffer), 8000);
  assert.equal(peakAmplitude(applyVolume(buffer, 50)), 4000);
  assert.equal(lengthScaleForRate(1), '1.000');
  assert.equal(lengthScaleForRate(1.25), '0.800');
});

test('bundled Piper engine and public-domain voices are present', () => {
  const root = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'voices', 'manifest.json'), 'utf8'));
  const ids = manifest.voices.map((voice) => voice.id);
  assert.deepEqual(ids, ['linda', 'kristin', 'norman', 'john', 'cori']);
  for (const voice of manifest.voices) {
    const model = path.join(root, 'voices', voice.modelFile);
    const config = path.join(root, 'voices', voice.configFile);
    assert.equal(fs.existsSync(model), true, voice.modelFile);
    assert.equal(fs.existsSync(config), true, voice.configFile);
    assert.ok(fs.statSync(model).size > 40000000, voice.modelFile);
    assert.equal(voice.license, 'Public domain');
  }
  assert.equal(fs.existsSync(path.join(root, 'vendor', 'piper', 'piper.exe')), true);
  assert.equal(fs.existsSync(path.join(root, 'vendor', 'piper', 'espeak-ng-data')), true);
});
