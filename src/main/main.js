'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  ipcMain,
  dialog,
  shell,
  powerMonitor,
  nativeImage
} = require('electron');
const crypto = require('crypto');
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createLogger } = require('./logger');
const { createStore } = require('./store');
const { loadVoices, loadVoicePacks } = require('./voices');
const { synthesizeToFile, playWavFile } = require('./tts');
const { createQueue } = require('../shared/queue');
const { GRACE_MS, collectDue, collectClockChime } = require('../shared/scheduler');
const { SAMPLE_ANNOUNCEMENT } = require('../shared/defaults');
const { clampVolume } = require('../shared/time');
const { parseScheduleImport, exportScheduleJson } = require('../shared/validate');
const { wavDurationMs, peakAmplitude, applyVolume } = require('../shared/wav');

const isSmoke = process.argv.includes('--smoke');
const isSmokeUi = process.argv.includes('--smoke-ui');
const isSmokeList = process.argv.includes('--smoke-list');
const isSmokeVoices = process.argv.includes('--smoke-voices');
const smokeMode = isSmoke || isSmokeUi || isSmokeList || isSmokeVoices;
let startHidden = process.argv.includes('--hidden');

let smokeDataDir = null;
app.setName('ClassBell');
app.setAppUserModelId('com.classbell.desktop');
if (smokeMode) {
  smokeDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'classbell-smoke-'));
  app.setPath('userData', smokeDataDir);
}

let mainWindow = null;
let showOnSecondInstance = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) showWindow();
    else showOnSecondInstance = true;
  });
  app.whenReady().then(start).catch((error) => {
    console.error(error);
    finish(1);
  });
}

let tray = null;
let trayAvailable = false;
let store = null;
let log = null;
let voices = [];
let paths = null;
let timer = null;
let lastTickMs = 0;
let sessionLocked = false;
let presentationActive = false;
let presentationCheckStarted = false;
let isQuitting = false;
let pendingImport = null;
let currentStatus = { phase: 'idle', title: '', announcementId: '', message: '' };
const pendingKeys = new Set();
const queue = createQueue();

function installPaths() {
  const root = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', '..');
  const packRoots = app.isPackaged
    ? [path.join(path.dirname(process.execPath), 'voice-packs'), path.join(process.resourcesPath, 'voice-packs')]
    : [path.join(root, 'dist', 'voice-packs'), path.join(root, 'voice-packs')];
  return {
    voices: path.join(root, 'voices'),
    piper: path.join(root, app.isPackaged ? 'piper' : path.join('vendor', 'piper')),
    tray: path.join(root, app.isPackaged ? 'tray.png' : path.join('assets', 'tray.png')),
    icon: path.join(root, app.isPackaged ? 'icon.png' : path.join('assets', 'icon.png')),
    packRoots
  };
}

function publishStatus(partial) {
  currentStatus = {
    phase: 'idle',
    title: '',
    announcementId: '',
    message: '',
    ...currentStatus,
    ...partial,
    queued: queue.pending()
  };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('status', currentStatus);
}

function publicState() {
  const settings = store.getSettings();
  return {
    settings,
    announcements: store.getAnnouncements(),
    voices: voices.map((voice) => ({
      id: voice.id,
      name: voice.name,
      description: voice.description,
      region: voice.region,
      gender: voice.gender,
      engine: voice.engine,
      installed: voice.installed === true
    })),
    firstRun: settings.firstRunComplete !== true,
    paths: {
      data: app.getPath('userData'),
      logs: path.join(app.getPath('userData'), 'logs')
    },
    graceSeconds: GRACE_MS / 1000,
    version: app.getVersion(),
    packaged: app.isPackaged,
    suppressAutoSpeak: smokeMode,
    voiceWarning: voices.length ? '' : 'No offline voices were found. Reinstall ClassBell.',
    status: currentStatus
  };
}

function resolveVoice(voiceId) {
  return voices.find((voice) => voice.id === voiceId)
    || voices.find((voice) => voice.id === store.getSettings().defaultVoiceId)
    || voices[0]
    || null;
}

function cleanupTempAudio() {
  const tempDir = path.join(app.getPath('temp'), 'ClassBell');
  fs.mkdirSync(tempDir, { recursive: true });
  for (const name of fs.readdirSync(tempDir)) {
    if (!name.endsWith('.wav')) continue;
    const file = path.join(tempDir, name);
    try {
      const age = Date.now() - fs.statSync(file).mtimeMs;
      if (age > 60 * 60 * 1000) fs.rmSync(file, { force: true });
    } catch (error) {
      log.error(error);
    }
  }
  return tempDir;
}

async function speakNow(item) {
  const volume = clampVolume(item.volume, 100);
  if (volume <= 0) {
    log.info(`Skipped "${item.title}" because volume is 0.`);
    return;
  }
  const voice = resolveVoice(item.voiceId);
  if (!voice) throw new Error('No offline voices are installed.');
  if (voice.id !== item.voiceId) {
    log.info(`Voice "${item.voiceId}" is not installed. Using ${voice.name}.`);
  }
  const tempDir = path.join(app.getPath('temp'), 'ClassBell');
  const wavPath = path.join(tempDir, `${crypto.randomUUID()}.wav`);
  publishStatus({ phase: 'generating', title: item.title || 'Announcement', announcementId: item.announcementId || '', message: '' });
  try {
    await synthesizeToFile({
      engine: voice.engine,
      piperExe: path.join(paths.piper, 'piper.exe'),
      piperDir: paths.piper,
      engineExe: voice.engineExe,
      engineDir: voice.engineDir,
      modelPath: voice.modelPath,
      voicesPath: voice.voicesPath,
      kokoroVoice: voice.kokoroVoice,
      lang: voice.lang,
      speakerId: voice.speakerId,
      text: item.text,
      rate: item.rate,
      outputFile: wavPath
    });
    const scaled = applyVolume(fs.readFileSync(wavPath), volume);
    fs.writeFileSync(wavPath, scaled);
    const duration = wavDurationMs(scaled) || 60000;
    publishStatus({ phase: 'speaking', title: item.title || 'Announcement', announcementId: item.announcementId || '', message: '' });
    log.info(`Speaking "${item.title || 'Announcement'}" with ${voice.name}.`);
    await playWavFile(wavPath, duration + 15000);
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
}

function enqueueSpeech(item, next) {
  const accepted = next ? queue.enqueueNext(item) : queue.enqueue(item);
  if (!accepted) {
    if (item.key) pendingKeys.delete(item.key);
    log.error(`Could not queue "${item.title}" because the speech queue is full.`);
    return false;
  }
  publishStatus({});
  return true;
}

function tick() {
  const nowMs = Date.now();
  if (lastTickMs) {
    const jump = nowMs - lastTickMs;
    if (jump > 15000 || jump < -2000) {
      log.info(`Clock moved by ${Math.round(jump / 1000)} seconds. Announcements more than 30 seconds late are skipped.`);
    }
  }
  lastTickMs = nowMs;
  const now = new Date();
  const settings = store.getSettings();
  const fired = store.loadFired(now);
  for (const key of pendingKeys) fired.add(key);
  if (scheduledSpeechHeld(settings)) return;
  const due = collectDue(store.getAnnouncements(), now, fired, { graceMs: GRACE_MS, paused: settings.paused });
  for (const item of due) {
    pendingKeys.add(item.key);
    enqueueSpeech({
      kind: 'schedule',
      key: item.key,
      announcementId: item.announcement.id,
      title: item.announcement.title,
      text: item.announcement.message,
      voiceId: item.announcement.voiceId,
      rate: item.announcement.rate,
      volume: item.announcement.volume,
      hhmm: item.hhmm
    }, false);
  }
  const chime = collectClockChime(now, settings, fired, { graceMs: GRACE_MS });
  if (chime) {
    pendingKeys.add(chime.key);
    enqueueSpeech({
      kind: 'clock',
      key: chime.key,
      announcementId: '',
      title: chime.title,
      text: chime.text,
      voiceId: settings.defaultVoiceId,
      rate: settings.defaultRate,
      volume: settings.defaultVolume,
      hhmm: chime.hhmm
    }, false);
  }
}

function scheduledSpeechHeld(settings) {
  if (settings.suppressWhenLocked === true && sessionLocked) return true;
  if (settings.suppressWhenPresenting === true && presentationActive) return true;
  return false;
}

function refreshPresentation() {
  if (!store || store.getSettings().suppressWhenPresenting !== true) {
    presentationActive = false;
    return;
  }
  const script = [
    'if (-not ("ClassBellNote" -as [type])) {',
    '  Add-Type -TypeDefinition @"',
    'using System;',
    'using System.Runtime.InteropServices;',
    'public static class ClassBellNote {',
    '  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int pquns);',
    '}',
    '"@',
    '}',
    '$state = 0',
    '[void][ClassBellNote]::SHQueryUserNotificationState([ref]$state)',
    'Write-Output $state'
  ].join('\n');
  execFile('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true, timeout: 8000 }, (error, stdout) => {
    if (error || !store || store.getSettings().suppressWhenPresenting !== true) {
      presentationActive = false;
      return;
    }
    presentationActive = String(stdout || '').trim() === '4';
  });
}

function startScheduler() {
  tick();
  timer = setInterval(() => {
    try {
      tick();
    } catch (error) {
      log.error(error);
    }
  }, 500);
  powerMonitor.on('resume', () => {
    log.info('System resumed from sleep. Announcements more than 30 seconds late are skipped.');
    try {
      tick();
    } catch (error) {
      log.error(error);
    }
  });
  powerMonitor.on('suspend', () => {
    log.info('System is going to sleep.');
  });
  powerMonitor.on('lock-screen', () => {
    sessionLocked = true;
    if (store && store.getSettings().suppressWhenLocked === true) {
      log.info('The computer is locked. Scheduled announcements wait until it is unlocked.');
    }
  });
  powerMonitor.on('unlock-screen', () => {
    sessionLocked = false;
  });
  if (!presentationCheckStarted) {
    presentationCheckStarted = true;
    setInterval(refreshPresentation, 5000);
  }
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function refreshTray() {
  if (!tray) return;
  const paused = store.getSettings().paused;
  tray.setToolTip(paused ? 'ClassBell (paused)' : 'ClassBell');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ClassBell', click: showWindow },
    {
      label: paused ? 'Resume Announcements' : 'Pause Announcements',
      click: () => setPaused(!paused)
    },
    { label: 'Test Voice', click: () => testDefaultVoice() },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]));
}

function createTray() {
  const image = fs.existsSync(paths.tray)
    ? nativeImage.createFromPath(paths.tray)
    : nativeImage.createEmpty();
  if (image.isEmpty()) throw new Error('Tray icon is missing.');
  tray = new Tray(image);
  tray.on('double-click', showWindow);
  refreshTray();
}

function setPaused(paused) {
  store.updateSettings({ paused: paused === true });
  log.info(paused ? 'Announcements paused.' : 'Announcements resumed.');
  refreshTray();
  publishStatus({ phase: currentStatus.phase === 'error' ? 'idle' : currentStatus.phase });
  return publicState();
}

function testDefaultVoice() {
  const settings = store.getSettings();
  enqueueSpeech({
    kind: 'test',
    title: 'Test',
    text: 'ClassBell test. This is your default voice.',
    voiceId: settings.defaultVoiceId,
    rate: settings.defaultRate,
    volume: settings.defaultVolume,
    announcementId: null
  }, true);
}

function applyLoginSetting(enabled) {
  if (!app.isPackaged) {
    log.info(`Startup launch preference saved (${enabled ? 'on' : 'off'}). The installed app applies it for this Windows user only.`);
    return;
  }
  app.setLoginItemSettings({
    openAtLogin: enabled === true,
    args: enabled ? ['--hidden'] : []
  });
  log.info(`Per-user startup launch ${enabled ? 'enabled' : 'disabled'}.`);
}

function createWindow() {
  const windowOptions = {
    width: 860,
    height: 980,
    minWidth: 420,
    minHeight: 640,
    show: false,
    title: 'ClassBell',
    backgroundColor: '#f3efe4',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  };
  if (fs.existsSync(paths.icon)) windowOptions.icon = paths.icon;
  const win = new BrowserWindow(windowOptions);
  Menu.setApplicationMenu(null);
  win.setMenuBarVisibility(false);
  win.webContents.on('will-navigate', (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('console-message', (event, level, message) => {
    const text = (event && event.message) || message;
    if (text && smokeMode) console.log(`PAGE ${text}`);
  });
  win.webContents.on('did-fail-load', (_event, code, description) => {
    log.error(`Window failed to load (${code}): ${description}`);
    if (smokeMode) console.error(`LOAD FAIL ${code} ${description}`);
  });
  win.once('ready-to-show', () => {
    const showForFirstRun = store.getSettings().firstRunComplete !== true;
    if (!startHidden || showForFirstRun || showOnSecondInstance) win.show();
  });
  win.on('close', (event) => {
    if (isQuitting) return;
    if (trayAvailable && store.getSettings().minimizeToTray) {
      event.preventDefault();
      win.hide();
    }
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  return win;
}

function registerIpc() {
  ipcMain.handle('get-state', () => publicState());
  ipcMain.handle('complete-first-run', () => {
    store.updateSettings({ firstRunComplete: true });
    log.info('Welcome screen finished.');
    return { ok: true, state: publicState() };
  });
  ipcMain.handle('speak', (_event, payload) => {
    const text = String(payload && payload.text || '').trim();
    if (!text) return { ok: false, error: 'There is no text to speak.' };
    const settings = store.getSettings();
    const accepted = enqueueSpeech({
      kind: 'test',
      title: payload.title || 'Test',
      text,
      voiceId: payload.voiceId || settings.defaultVoiceId,
      rate: payload.rate == null ? settings.defaultRate : payload.rate,
      volume: payload.volume == null ? settings.defaultVolume : payload.volume,
      announcementId: payload.announcementId || null
    }, true);
    if (!accepted) return { ok: false, error: 'Speech queue is full. Wait for the current announcement to finish.' };
    return { ok: true };
  });
  ipcMain.handle('save-announcement', (_event, announcement) => {
    const result = store.saveAnnouncement(announcement);
    if (!result.ok) return { ...result, state: publicState() };
    log.info(`Saved announcement "${announcement.title}".`);
    return { ok: true, state: publicState() };
  });
  ipcMain.handle('delete-announcement', (_event, id) => {
    const result = store.deleteAnnouncement(id);
    if (!result.ok) return { ...result, state: publicState() };
    log.info(`Deleted announcement ${id}.`);
    return { ok: true, state: publicState() };
  });
  ipcMain.handle('duplicate-announcement', (_event, id) => {
    const result = store.duplicateAnnouncement(id);
    if (!result.ok) return { ...result, state: publicState() };
    return { ok: true, id: result.id, state: publicState() };
  });
  ipcMain.handle('set-enabled', (_event, id, enabled) => {
    const result = store.setEnabled(id, enabled);
    return { ...result, state: publicState() };
  });
  ipcMain.handle('reorder', (_event, id, direction) => {
    const result = store.reorder(id, direction);
    return { ...result, state: publicState() };
  });
  ipcMain.handle('set-paused', (_event, paused) => ({ ok: true, state: setPaused(paused) }));
  ipcMain.handle('save-settings', (_event, partial) => {
    const before = store.getSettings();
    const settings = store.updateSettings(partial || {});
    if (partial && Object.prototype.hasOwnProperty.call(partial, 'launchAtStartup') && partial.launchAtStartup !== before.launchAtStartup) {
      applyLoginSetting(settings.launchAtStartup);
    }
    if (settings.suppressWhenPresenting !== true) presentationActive = false;
    else refreshPresentation();
    refreshTray();
    return { ok: true, state: publicState() };
  });
  ipcMain.handle('choose-import', async () => {
    try {
      const picked = await dialog.showOpenDialog(mainWindow, {
        title: 'Import ClassBell schedule',
        filters: [{ name: 'ClassBell schedule', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (picked.canceled || !picked.filePaths[0]) return { ok: false, canceled: true };
      const text = fs.readFileSync(picked.filePaths[0], 'utf8');
      const parsed = parseScheduleImport(text, {
        fallbackVoice: store.getSettings().defaultVoiceId,
        now: new Date().toISOString()
      });
      if (!parsed.ok) return { ok: false, errors: parsed.errors };
      pendingImport = parsed.announcements;
      return {
        ok: true,
        count: parsed.announcements.length,
        titles: parsed.announcements.map((item) => item.title).slice(0, 12),
        currentCount: store.getAnnouncements().length
      };
    } catch (error) {
      log.error(error);
      return { ok: false, errors: [error.message || 'Could not read that file.'] };
    }
  });
  ipcMain.handle('apply-import', (_event, mode) => {
    if (!pendingImport) return { ok: false, error: 'Choose a schedule file first.' };
    if (mode !== 'replace' && mode !== 'merge') return { ok: false, error: 'Choose merge or replace.' };
    if (mode === 'replace') store.replaceAnnouncements(pendingImport);
    else store.mergeAnnouncements(pendingImport);
    pendingImport = null;
    log.info(`Imported schedule (${mode}).`);
    return { ok: true, state: publicState() };
  });
  ipcMain.handle('clear-import', () => {
    pendingImport = null;
    return { ok: true };
  });
  ipcMain.handle('export-schedule-data', () => ({
    ok: true,
    json: exportScheduleJson(store.getAnnouncements())
  }));
  ipcMain.handle('export-schedule', async () => {
    try {
      const picked = await dialog.showSaveDialog(mainWindow, {
        title: 'Export ClassBell schedule',
        defaultPath: 'classbell-schedule.json',
        filters: [{ name: 'ClassBell schedule', extensions: ['json'] }]
      });
      if (picked.canceled || !picked.filePath) return { ok: false, canceled: true };
      fs.writeFileSync(picked.filePath, exportScheduleJson(store.getAnnouncements()));
      log.info(`Exported schedule to ${picked.filePath}`);
      return { ok: true, path: picked.filePath };
    } catch (error) {
      log.error(error);
      return { ok: false, error: error.message || 'Could not save that file.' };
    }
  });
  ipcMain.handle('open-data-folder', async () => openFolder(app.getPath('userData')));
  ipcMain.handle('open-log-folder', async () => openFolder(path.join(app.getPath('userData'), 'logs')));
}

async function openFolder(folder) {
  fs.mkdirSync(folder, { recursive: true });
  const error = await shell.openPath(folder);
  if (error) {
    log.error(error);
    return { ok: false, error };
  }
  return { ok: true };
}

async function waitForReady(win) {
  const startMs = Date.now();
  while (Date.now() - startMs < 15000) {
    const ready = await win.webContents.executeJavaScript('document.body.dataset.ready || ""');
    if (ready) return ready;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('The window did not finish opening.');
}

async function runPiperSmoke() {
  const voice = voices.find((item) => item.id === 'linda') || voices[0];
  if (!voice) throw new Error('No voice available for the speech smoke test.');
  const wavPath = path.join(os.tmpdir(), `classbell-smoke-${process.pid}.wav`);
  await synthesizeToFile({
    piperExe: path.join(paths.piper, 'piper.exe'),
    piperDir: paths.piper,
    modelPath: voice.modelPath,
    text: 'Welcome. Your ClassBell is ready.',
    rate: 1,
    outputFile: wavPath
  });
  const bytes = fs.readFileSync(wavPath);
  const duration = wavDurationMs(bytes);
  const peak = peakAmplitude(bytes);
  console.log(`WAV bytes=${bytes.length} durationMs=${duration} peak=${peak} voice=${voice.id}`);
  if (!duration || duration < 500 || peak < 200) {
    throw new Error(`WAV did not look like speech (duration=${duration}, peak=${peak}).`);
  }
  try {
    await playWavFile(wavPath, duration + 10000);
    console.log('PLAYBACK_OK');
  } catch (error) {
    console.log(`PLAYBACK_FAIL ${error.message}`);
    throw error;
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
}

async function runUiSmoke(win) {
  await waitForReady(win);
  if (isSmokeUi) {
    const text = await win.webContents.executeJavaScript([
      '({',
      '  ready: document.body.dataset.ready,',
      '  title: document.querySelector("h1").textContent,',
      '  line: document.getElementById("welcome-line").textContent,',
      '  test: document.getElementById("welcome-test").textContent',
      '})'
    ].join('\n'));
    console.log(JSON.stringify(text));
    if (text.ready !== 'welcome') throw new Error('Welcome screen did not open.');
    if (!String(text.title).includes('ClassBell')) throw new Error('Title was missing.');
    if (text.line !== 'Welcome. Your ClassBell is ready.') throw new Error('Welcome sentence was missing.');
    if (!String(text.test).includes('Test Sound')) throw new Error('Test Sound button was missing.');
    return;
  }
  const result = await win.webContents.executeJavaScript([
    '(async () => {',
    '  const draft = await window.classbell.saveAnnouncement({ id: "draft-placeholder", title: "Unfinished sample", message: "", placeholder: true, enabled: true, times: [] });',
    '  const blocked = await window.classbell.setEnabled("draft-placeholder", true);',
    '  const toggle = await window.classbell.setEnabled("attendance-reminder", false);',
    '  const dup = await window.classbell.duplicateAnnouncement("welcome-to-class");',
    '  const copy = dup.state.announcements.find((item) => item.title === "Copy of Welcome to Class");',
    '  const removed = await window.classbell.deleteAnnouncement(copy.id);',
    '  await window.classbell.deleteAnnouncement("draft-placeholder");',
    '  const exported = await window.classbell.exportScheduleData();',
    '  document.querySelector("[data-announcement-id=\'welcome-to-class\'] [data-action=\'edit\']").click();',
    '  const editorTitle = document.getElementById("editor-title").value;',
    '  const editorOpen = document.getElementById("view-editor").hidden === false;',
    '  const hour = document.querySelector("#editor-times [data-part=hour]").value;',
    '  const minute = document.querySelector("#editor-times [data-part=minute]").value;',
    '  const suffix = document.querySelector("#editor-times [data-part=suffix]").value;',
    '  const stored = document.querySelector("#editor-times .stored-time").textContent;',
    '  const minuteEl = document.querySelector("#editor-times [data-part=minute]");',
    '  minuteEl.value = "15";',
    '  minuteEl.dispatchEvent(new Event("change"));',
    '  const storedAfter = document.querySelector("#editor-times .stored-time").textContent;',
    '  document.getElementById("editor-add-time").click();',
    '  const timeCount = document.querySelectorAll("#editor-times .time-row").length;',
    '  const firstButton = document.querySelector("#editor-times .time-row:last-child button").className;',
    '  const addText = document.querySelector("#editor-times .time-add").textContent;',
    '  const addColor = getComputedStyle(document.querySelector("#editor-times .time-add")).backgroundColor;',
    '  const removeColor = getComputedStyle(document.querySelector("#editor-times .time-remove")).color;',
    '  const repeat = document.querySelector("input[name=recurrence]:checked").value;',
    '  document.querySelector("#editor-times .time-row:last-child button").click();',
    '  const timeCountAfterRemove = document.querySelectorAll("#editor-times .time-row").length;',
    '  document.getElementById("editor-form").requestSubmit();',
    '  await new Promise((resolve) => setTimeout(resolve, 500));',
    '  const afterSave = await window.classbell.getState();',
    '  document.getElementById("tab-voice").click();',
    '  const voiceOpen = document.getElementById("view-voice").hidden === false;',
    '  document.getElementById("tab-clock").click();',
    '  const clockOpen = document.getElementById("view-clock").hidden === false;',
    '  const clockOff = document.getElementById("clock-enabled").checked === false;',
    '  document.getElementById("tab-settings").click();',
    '  const settingsOpen = document.getElementById("view-settings").hidden === false;',
    '  const lockOff = document.getElementById("settings-locked").checked === false;',
    '  const presentOff = document.getElementById("settings-presenting").checked === false;',
    '  document.getElementById("tab-announcements").click();',
    '  const welcomeTimes = afterSave.announcements.find((item) => item.id === "welcome-to-class").times;',
    '  return {',
    '    ready: document.body.dataset.ready,',
    '    cards: document.querySelectorAll("[data-announcement-id]").length,',
    '    welcome: document.querySelector("[data-announcement-id=\'welcome-to-class\']").innerText,',
    '    draftOk: draft.ok,',
    '    blocked: blocked.ok,',
    '    enabledAfter: toggle.state.announcements.find((item) => item.id === "attendance-reminder").enabled,',
    '    copyFound: Boolean(copy),',
    '    countAfterDelete: removed.state.announcements.length,',
    '    exportOk: exported.json.includes("Welcome to Class") && exported.json.includes("08:00"),',
    '    navHidden: document.getElementById("app-nav").hidden,',
    '    announcementsTab: document.getElementById("tab-announcements").textContent,',
    '    settingsTab: document.getElementById("tab-settings").textContent,',
    '    next: document.getElementById("next-up").textContent,',
    '    editorTitle: editorTitle,',
    '    editorOpen: editorOpen,',
    '    hour: hour,',
    '    minute: minute,',
    '    suffix: suffix,',
    '    stored: stored,',
    '    storedAfter: storedAfter,',
    '    timeCount: timeCount,',
    '    timeCountAfterRemove: timeCountAfterRemove,',
    '    welcomeTimes: welcomeTimes,',
    '    backToList: document.getElementById("view-list").hidden === false,',
    '    firstButton: firstButton,',
    '    addText: addText,',
    '    addColor: addColor,',
    '    removeColor: removeColor,',
    '    voiceOpen: voiceOpen,',
    '    clockOpen: clockOpen,',
    '    clockOff: clockOff,',
    '    settingsOpen: settingsOpen,',
    '    lockOff: lockOff,',
    '    presentOff: presentOff,',
    '    scale: window.devicePixelRatio,',
    '    repeat: repeat,',
    '    bodyFont: getComputedStyle(document.body).fontSize,',
    '    headingFont: getComputedStyle(document.querySelector("#view-list h1")).fontSize,',
    '    voiceTab: document.getElementById("tab-voice").textContent,',
    '    clockTab: document.getElementById("tab-clock").textContent',
    '  };',
    '})()'
  ].join('\n'));
  console.log(JSON.stringify(result));
  if (result.ready !== 'list') throw new Error('Announcement list did not open.');
  if (result.cards !== 6) throw new Error(`Expected 6 announcements, saw ${result.cards}.`);
  if (!result.welcome.includes('Welcome to Class') || !result.welcome.includes('8:15 AM')) throw new Error('Sample welcome announcement was not shown.');
  if (result.draftOk !== true) throw new Error('Placeholder draft was not saved.');
  if (result.blocked !== false) throw new Error('Placeholder was enabled.');
  if (result.enabledAfter !== false) throw new Error('Disable did not save.');
  if (!result.copyFound) throw new Error('Duplicate did not create a copy.');
  if (result.countAfterDelete !== 7) throw new Error('Delete did not remove the copy.');
  if (!result.exportOk) throw new Error('Export did not include the schedule.');
  if (result.navHidden !== false) throw new Error('Announcement navigation was hidden.');
  if (!String(result.announcementsTab).includes('Announcements')) throw new Error('Announcements tab was missing.');
  if (!String(result.settingsTab).includes('Settings')) throw new Error('Settings tab was missing.');
  if (!String(result.next).includes('Next announcement:')) throw new Error('Next announcement was missing.');
  if (result.editorOpen !== true) throw new Error('Editor did not open.');
  if (result.editorTitle !== 'Welcome to Class') throw new Error('Editor did not load the announcement.');
  if (result.hour !== '8' || result.minute !== '00' || result.suffix !== 'AM') throw new Error('Editor time was not 8:00 AM.');
  if (!String(result.stored).includes('08:00')) throw new Error('Stored time was not 08:00.');
  if (!String(result.storedAfter).includes('08:15')) throw new Error('Changed time was not stored as 08:15.');
  if (result.timeCount !== 2) throw new Error('Add Time did not add a time.');
  if (result.timeCountAfterRemove !== 1) throw new Error('Remove Time did not remove a time.');
  if (!Array.isArray(result.welcomeTimes) || result.welcomeTimes.join(',') !== '08:15') throw new Error('Saved time did not persist.');
  if (result.backToList !== true) throw new Error('Save did not return to announcements.');
  if (!String(result.firstButton).includes('time-remove')) throw new Error('The time row did not start with remove.');
  if (result.addText !== '+') throw new Error('The add-time button was missing.');
  if (result.repeat !== 'daily') throw new Error('A schedule without repeat settings was not daily.');
  if (result.bodyFont !== '22px' || result.headingFont !== '36px') throw new Error('Text size was outside 22–36.');
  if (!String(result.voiceTab).includes('Voice') || !String(result.clockTab).includes('Clock')) throw new Error('Voice or Clock tab was missing.');
  if (result.voiceOpen !== true || result.clockOpen !== true || result.settingsOpen !== true) throw new Error('A settings tab did not open.');
  if (result.clockOff !== true || result.lockOff !== true || result.presentOff !== true) throw new Error('Optional clock or suppression controls were on by default.');
  if (result.addColor !== 'rgb(29, 79, 145)' || result.removeColor !== 'rgb(141, 36, 36)') throw new Error('Time add and remove buttons were not blue and red.');
}

async function speakVoiceFile(voice) {
  const wavPath = path.join(os.tmpdir(), `classbell-voice-${voice.id}-${Date.now()}.wav`);
  const started = Date.now();
  await synthesizeToFile({
    engine: voice.engine,
    piperExe: path.join(paths.piper, 'piper.exe'),
    piperDir: paths.piper,
    engineExe: voice.engineExe,
    engineDir: voice.engineDir,
    modelPath: voice.modelPath,
    voicesPath: voice.voicesPath,
    kokoroVoice: voice.kokoroVoice,
    lang: voice.lang,
    speakerId: voice.speakerId,
    text: SAMPLE_ANNOUNCEMENT,
    rate: 1,
    outputFile: wavPath
  });
  const bytes = fs.readFileSync(wavPath);
  const duration = wavDurationMs(bytes);
  const peak = peakAmplitude(bytes);
  const generateMs = Date.now() - started;
  console.log(`WAV voice=${voice.id} engine=${voice.engine} bytes=${bytes.length} durationMs=${duration} peak=${peak} generateMs=${generateMs}`);
  if (!duration || duration < 500 || peak < 200) {
    throw new Error(`${voice.id} did not produce speech (duration=${duration}, peak=${peak}).`);
  }
  try {
    await playWavFile(wavPath, duration + 15000);
    console.log(`PLAYBACK_OK ${voice.id}`);
  } finally {
    fs.rmSync(wavPath, { force: true });
  }
}

async function runVoicePackSmoke() {
  const sequence = ['linda', 'bindi', 'bindi', 'alice', 'marlo', 'emma', 'kirra', 'cori'];
  for (const id of sequence) {
    const voice = voices.find((item) => item.id === id);
    if (!voice) throw new Error(`Voice ${id} is not available to the packaged app.`);
    await speakVoiceFile(voice);
  }
}

function finish(code) {
  if (smokeMode) console.log(code === 0 ? 'SMOKE_OK' : 'SMOKE_FAIL');
  if (smokeDataDir) {
    try {
      fs.rmSync(smokeDataDir, { recursive: true, force: true });
    } catch (error) {
      console.log('Smoke temp cleanup skipped.');
    }
  }
  app.exit(code);
  setTimeout(() => process.exit(code), 2000).unref();
}

async function start() {
  paths = installPaths();
  log = createLogger(path.join(app.getPath('userData'), 'logs', 'classbell.log'));
  store = createStore(app.getPath('userData'), { log });
  const bundledVoices = loadVoices(paths.voices, log);
  const seenVoiceIds = new Set(bundledVoices.map((voice) => voice.id));
  const packVoices = loadVoicePacks(paths.packRoots, log).filter((voice) => {
    if (seenVoiceIds.has(voice.id)) {
      log.error(`Voice pack id ${voice.id} matches a built-in voice, so the pack copy was not loaded.`);
      return false;
    }
    seenVoiceIds.add(voice.id);
    return true;
  });
  voices = bundledVoices.concat(packVoices);
  cleanupTempAudio();
  log.info(`ClassBell ${app.getVersion()} started. Data folder: ${app.getPath('userData')}`);
  if (voices.length === 0) log.error('No offline voices are available.');
  else log.info(`Loaded voices: ${voices.map((voice) => voice.name).join(', ')}`);

  queue.setRunner(async (item) => {
    try {
      if ((item.kind === 'schedule' || item.kind === 'clock') && store.getSettings().paused) {
        log.info(`Skipped "${item.title}" because announcements are paused.`);
        return;
      }
      if (item.kind === 'schedule' || item.kind === 'clock') store.markFired([item.key], new Date());
      await speakNow(item);
    } catch (error) {
      log.error(error);
      publishStatus({
        phase: 'error',
        title: item.title || '',
        announcementId: item.announcementId || '',
        message: error.message || 'Speech failed.'
      });
    } finally {
      if (item.key) pendingKeys.delete(item.key);
    }
  });
  queue.setOnIdle(() => {
    publishStatus({ phase: 'idle', title: '', announcementId: '', message: '' });
  });

  if (isSmoke) {
    await runPiperSmoke();
    finish(0);
    return;
  }

  if (isSmokeVoices) {
    await runVoicePackSmoke();
    finish(0);
    return;
  }

  if (isSmokeList) store.updateSettings({ firstRunComplete: true });
  registerIpc();
  try {
    createTray();
    trayAvailable = true;
  } catch (error) {
    log.error(error);
    startHidden = false;
    if (smokeMode) throw error;
  }
  mainWindow = createWindow();
  app.on('window-all-closed', () => {
    if (!trayAvailable || !store.getSettings().minimizeToTray) app.quit();
  });
  app.on('before-quit', () => {
    isQuitting = true;
  });
  app.on('will-quit', () => {
    if (timer) clearInterval(timer);
  });

  if (app.isPackaged && store.getSettings().launchAtStartup) {
    applyLoginSetting(true);
  }

  if (isSmokeUi || isSmokeList) {
    await runUiSmoke(mainWindow);
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
    if (tray) tray.destroy();
    finish(0);
    return;
  }

  startScheduler();
  const settings = store.getSettings();
  if (settings.firstRunComplete && settings.playStartupSound) {
    enqueueSpeech({
      kind: 'test',
      title: 'Startup',
      text: 'ClassBell is running.',
      voiceId: settings.defaultVoiceId,
      rate: settings.defaultRate,
      volume: settings.defaultVolume,
      announcementId: null
    }, true);
  }
}

process.on('uncaughtException', (error) => {
  try {
    if (log) log.error(error);
  } catch (loggingError) {
    console.error(loggingError);
  }
  console.error(error);
});

process.on('unhandledRejection', (error) => {
  try {
    if (log) log.error(error);
  } catch (loggingError) {
    console.error(loggingError);
  }
  console.error(error);
});
