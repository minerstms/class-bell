'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { createDefaultAnnouncements, createDefaultSettings } = require('../src/shared/defaults');
const { createQueue } = require('../src/shared/queue');
const { GRACE_MS, collectDue, occurrenceKey } = require('../src/shared/scheduler');
const { earlyTimesMessage, format12, from12Parts, nextLabel, to12Parts, upcomingLabel } = require('../src/shared/time');
const { exportScheduleJson, parseScheduleImport } = require('../src/shared/validate');
const { applyVolume, peakAmplitude, wavDurationMs } = require('../src/shared/wav');
const { lengthScaleForRate, piperArguments } = require('../src/main/tts');
const { createStore } = require('../src/main/store');
const { loadVoices, loadVoicePacks, phonemeMapFitsBundledPiper, speakerIdFromConfig } = require('../src/main/voices');

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
    const configPath = path.join(root, 'voices', voice.configFile);
    assert.equal(fs.existsSync(model), true, voice.modelFile);
    assert.equal(fs.existsSync(configPath), true, voice.configFile);
    assert.ok(fs.statSync(model).size > 40000000, voice.modelFile);
    assert.equal(voice.license, 'Public domain');
    assert.ok(voice.region === 'United States' || voice.region === 'United Kingdom');
    assert.ok(voice.gender === 'female' || voice.gender === 'male');
    assert.equal(voice.engine, 'piper');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(phonemeMapFitsBundledPiper(config), true, voice.id);
  }
  const loaded = loadVoices(path.join(root, 'voices'));
  assert.deepEqual(loaded.map((voice) => voice.id), ids);
  assert.equal(loaded.every((voice) => voice.installed === true && voice.speakerId === null), true);
  assert.equal(fs.existsSync(path.join(root, 'vendor', 'piper', 'piper.exe')), true);
  assert.equal(fs.existsSync(path.join(root, 'vendor', 'piper', 'espeak-ng-data')), true);
});

test('12-hour controls keep the stored 24-hour time', () => {
  assert.deepEqual(to12Parts('00:00'), { hour: 12, minute: 0, suffix: 'AM' });
  assert.deepEqual(to12Parts('08:05'), { hour: 8, minute: 5, suffix: 'AM' });
  assert.deepEqual(to12Parts('12:00'), { hour: 12, minute: 0, suffix: 'PM' });
  assert.deepEqual(to12Parts('13:15'), { hour: 1, minute: 15, suffix: 'PM' });
  assert.equal(from12Parts(12, 0, 'AM'), '00:00');
  assert.equal(from12Parts('12', '00', 'PM'), '12:00');
  assert.equal(from12Parts('8', '05', 'AM'), '08:05');
  assert.equal(from12Parts(1, 15, 'PM'), '13:15');
  assert.equal(from12Parts(11, 59, 'PM'), '23:59');
  assert.equal(format12(from12Parts(8, 5, 'AM')), '8:05 AM');
});

test('next announcement follows list order and skips disabled items', () => {
  const now = new Date(2026, 9, 2, 8, 6, 0);
  const items = [
    sample('later', { title: 'Later', times: ['09:00'] }),
    sample('soon', { title: 'Soon', times: ['08:10'] }),
    sample('off', { title: 'Off', times: ['08:07'], enabled: false })
  ];
  assert.equal(upcomingLabel(items, now), 'Next announcement: Soon, Today 8:10 AM');
  const tied = [
    sample('first', { title: 'First', times: ['08:00'] }),
    sample('second', { title: 'Second', times: ['08:00'] })
  ];
  assert.equal(upcomingLabel(tied, new Date(2026, 9, 2, 7, 0, 0)), 'Next announcement: First, Today 8:00 AM');
  assert.equal(upcomingLabel([sample('quiet', { enabled: false, times: ['08:00'] })], now), 'No upcoming announcement.');
});

test('saved voice ids stay unchanged when the model is unavailable', () => {
  const dir = tempDir();
  const store = createStore(dir);
  assert.equal(store.saveAnnouncement(sample('keep-voice', { voiceId: 'bindi', times: ['14:30'] })).ok, true);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'announcements.json'), 'utf8'));
  const kept = saved.announcements.find((item) => item.id === 'keep-voice');
  assert.equal(kept.voiceId, 'bindi');
  assert.deepEqual(kept.times, ['14:30']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('multi-speaker voices need a documented speaker, and Piper 2023 skips clustered phonemes', () => {
  const root = path.join(__dirname, '..');
  const australian = JSON.parse(fs.readFileSync(path.join(root, 'poc', 'australian-piper', 'en_AU-librivox-medium.onnx.json'), 'utf8'));
  assert.equal(australian.num_speakers, 10);
  assert.equal(phonemeMapFitsBundledPiper(australian), false);
  assert.equal(speakerIdFromConfig(australian, { speakerKey: 'jenno' }), 1);
  assert.equal(speakerIdFromConfig(australian, { speakerKey: 'lucy_burgoyne_1950_2014' }), 2);
  assert.equal(speakerIdFromConfig(australian, { speakerKey: 'magdalena' }), 3);
  assert.equal(speakerIdFromConfig(australian, { speakerKey: 'not-a-narrator' }), undefined);
  const dir = tempDir();
  fs.writeFileSync(path.join(dir, 'tiny.onnx'), 'not-a-model');
  fs.writeFileSync(path.join(dir, 'tiny.onnx.json'), JSON.stringify({
    num_speakers: 2,
    phoneme_id_map: { a: [1], 'aɪ': [2] },
    speaker_id_map: { jenno: 1 }
  }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    voices: [{
      id: 'bindi',
      name: 'Bindi (Australian female)',
      modelFile: 'tiny.onnx',
      configFile: 'tiny.onnx.json',
      speakerKey: 'jenno'
    }]
  }));
  const errors = [];
  const loaded = loadVoices(dir, { info() {}, error(message) { errors.push(message); } });
  assert.equal(loaded.length, 0);
  assert.equal(errors.some((message) => message.includes('newer Piper')), true);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Piper receives a speaker id only when the voice file documents one', () => {
  const plain = piperArguments({ modelPath: 'model.onnx', outputFile: 'out.wav', rate: 1, speakerId: null });
  assert.equal(plain.includes('--speaker'), false);
  const spoken = piperArguments({ modelPath: 'model.onnx', outputFile: 'out.wav', rate: 1, speakerId: 1 });
  assert.deepEqual(spoken.slice(-2), ['--speaker', '1']);
});

test('Piper 1.8 proof of concept synthesizes Bindi, Marlo, and Kirra', { timeout: 120000 }, (t) => {
  const { spawnSync } = require('node:child_process');
  const root = path.join(__dirname, '..');
  const python = path.join(root, 'tmp', 'piper-poc', 'Scripts', 'python.exe');
  const model = path.join(root, 'poc', 'australian-piper', 'en_AU-librivox-medium.onnx');
  if (!fs.existsSync(python) || !fs.existsSync(model)) {
    t.skip('Piper 1.8 and the Australian model are not on this computer.');
    return;
  }
  const outDir = tempDir();
  const scriptPath = path.join(outDir, 'synth.py');
  fs.writeFileSync(scriptPath, [
    'import wave',
    'from pathlib import Path',
    'from piper import PiperVoice, SynthesisConfig',
    `voice = PiperVoice.load(${JSON.stringify(model)})`,
    'text = "Welcome to class. Please find your seat and get ready to begin."',
    `out = Path(${JSON.stringify(outDir)})`,
    'for name, sid in [("bindi", 1), ("marlo", 2), ("kirra", 3)]:',
    '    dest = out / f"{name}.wav"',
    '    with wave.open(str(dest), "wb") as handle:',
    '        voice.synthesize_wav(text, handle, SynthesisConfig(speaker_id=sid))',
    ''
  ].join('\n'));
  const result = spawnSync(python, [scriptPath], { encoding: 'utf8', timeout: 90000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  for (const name of ['bindi', 'marlo', 'kirra']) {
    const bytes = fs.readFileSync(path.join(outDir, `${name}.wav`));
    assert.ok(wavDurationMs(bytes) > 500, name);
    assert.ok(peakAmplitude(bytes) > 200, name);
  }
  fs.rmSync(outDir, { recursive: true, force: true });
});

test('voice packs load only when the speech program and checksums match', () => {
  const crypto = require('node:crypto');
  const dir = tempDir();
  const pack = path.join(dir, 'australian');
  const engine = path.join(pack, 'engine');
  fs.mkdirSync(path.join(engine, '_internal'), { recursive: true });
  fs.writeFileSync(path.join(engine, 'piper18.exe'), 'engine');
  const model = path.join(pack, 'voice.onnx');
  const configPath = path.join(pack, 'voice.onnx.json');
  fs.writeFileSync(model, 'model-bytes');
  fs.writeFileSync(configPath, JSON.stringify({
    num_speakers: 10,
    speaker_id_map: { jenno: 1, lucy_burgoyne_1950_2014: 2, magdalena: 3 }
  }));
  const digest = crypto.createHash('sha256').update(fs.readFileSync(model)).digest('hex');
  const configDigest = crypto.createHash('sha256').update(fs.readFileSync(configPath)).digest('hex');
  fs.writeFileSync(path.join(pack, 'manifest.json'), JSON.stringify({
    id: 'australian',
    engine: 'piper18',
    engineExe: 'engine/piper18.exe',
    files: [
      { path: 'voice.onnx', sha256: digest, bytes: fs.statSync(model).size },
      { path: 'voice.onnx.json', sha256: configDigest, bytes: fs.statSync(configPath).size }
    ],
    voices: [
      { id: 'bindi', name: 'Bindi (Australian female)', region: 'Australia', gender: 'female', speakerKey: 'jenno', modelFile: 'voice.onnx', configFile: 'voice.onnx.json' },
      { id: 'missing', name: 'Missing', speakerKey: 'not-a-narrator', modelFile: 'voice.onnx', configFile: 'voice.onnx.json' }
    ]
  }));
  const loaded = loadVoicePacks([dir]);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, 'bindi');
  assert.equal(loaded[0].engine, 'piper18');
  assert.equal(loaded[0].speakerId, 1);
  fs.writeFileSync(model, 'changed');
  const rejected = loadVoicePacks([dir], { info() {}, error() {} });
  assert.equal(rejected.length, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('Kokoro proof of concept synthesizes a British female voice offline', { timeout: 120000 }, (t) => {
  const { spawnSync } = require('node:child_process');
  const root = path.join(__dirname, '..');
  const python = path.join(root, 'tmp', 'kokoro-poc', 'Scripts', 'python.exe');
  const model = path.join(root, 'poc', 'kokoro', 'kokoro-v1.0.onnx');
  const voices = path.join(root, 'poc', 'kokoro', 'voices-v1.0.bin');
  if (!fs.existsSync(python) || !fs.existsSync(model) || !fs.existsSync(voices)) {
    t.skip('Kokoro proof-of-concept files are not on this computer.');
    return;
  }
  const outDir = tempDir();
  const scriptPath = path.join(outDir, 'synth.py');
  const wavPath = path.join(outDir, 'emma.wav');
  fs.writeFileSync(scriptPath, [
    'import wave',
    'import numpy as np',
    'from kokoro_onnx import Kokoro',
    `kokoro = Kokoro(${JSON.stringify(model)}, ${JSON.stringify(voices)})`,
    'samples, rate = kokoro.create("Welcome to class. Please find your seat and get ready to begin.", voice="bf_emma", speed=1.0, lang="en-gb")',
    'pcm = (np.clip(samples, -1, 1) * 32767).astype(np.int16)',
    `with wave.open(${JSON.stringify(wavPath)}, "wb") as handle:`,
    '    handle.setnchannels(1)',
    '    handle.setsampwidth(2)',
    '    handle.setframerate(rate)',
    '    handle.writeframes(pcm.tobytes())',
    ''
  ].join('\n'));
  const result = spawnSync(python, [scriptPath], { encoding: 'utf8', timeout: 90000 });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const bytes = fs.readFileSync(wavPath);
  assert.ok(wavDurationMs(bytes) > 500);
  assert.ok(peakAmplitude(bytes) > 200);
  fs.rmSync(outDir, { recursive: true, force: true });
});
