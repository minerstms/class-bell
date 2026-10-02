'use strict';

let state = null;
let editor = null;
let bannerTimer = null;

const views = ['welcome', 'list', 'editor', 'settings'];

function $(id) {
  return document.getElementById(id);
}

function showView(name) {
  for (const view of views) $(`view-${view}`).hidden = view !== name;
  document.body.dataset.view = name;
  const nav = $('app-nav');
  nav.hidden = name === 'welcome';
  const onAnnouncements = name === 'list' || name === 'editor';
  $('tab-announcements').classList.toggle('on', onAnnouncements);
  $('tab-settings').classList.toggle('on', name === 'settings');
  $('tab-announcements').setAttribute('aria-current', onAnnouncements ? 'page' : 'false');
  $('tab-settings').setAttribute('aria-current', name === 'settings' ? 'page' : 'false');
  window.scrollTo(0, 0);
}

function showBanner(message, kind) {
  const banner = $('banner');
  $('banner-text').textContent = message;
  banner.classList.toggle('good', kind === 'good');
  banner.hidden = false;
  clearTimeout(bannerTimer);
  if (kind === 'good') {
    bannerTimer = setTimeout(() => {
      banner.hidden = true;
    }, 4000);
  }
}

function hideBanner() {
  $('banner').hidden = true;
}

function applyResult(result) {
  if (!result) return result;
  if (result.state) state = result.state;
  if (result.ok === false) showBanner(result.error || (result.errors || []).join('\n') || 'Something went wrong.');
  return result;
}

function voiceName(id) {
  const voice = (state.voices || []).find((item) => item.id === id);
  return voice ? voice.name : 'Default voice';
}

const REGION_ORDER = ['Australia', 'United Kingdom', 'United States'];

function fillVoices(select, selected) {
  select.replaceChildren();
  const voices = state.voices || [];
  const regions = [];
  for (const voice of voices) {
    const region = voice.region || 'Other';
    if (!regions.includes(region)) regions.push(region);
  }
  regions.sort((a, b) => {
    const ai = REGION_ORDER.indexOf(a);
    const bi = REGION_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
  for (const region of regions) {
    const group = document.createElement('optgroup');
    group.label = region;
    for (const voice of voices) {
      if ((voice.region || 'Other') !== region) continue;
      const option = document.createElement('option');
      option.value = voice.id;
      option.textContent = voice.name;
      group.append(option);
    }
    select.append(group);
  }
  if (selected && ![...select.options].some((option) => option.value === selected)) {
    const missing = document.createElement('option');
    missing.value = selected;
    missing.textContent = 'Saved voice is not installed';
    select.append(missing);
  }
  if (select.options.length) select.value = selected || state.settings.defaultVoiceId;
}

function voiceHelp(id) {
  const voice = (state.voices || []).find((item) => item.id === id);
  if (!voice) {
    return 'This saved voice is not installed. ClassBell speaks with the default voice, and the saved voice setting stays unchanged.';
  }
  const gender = voice.gender === 'female' ? 'Female' : voice.gender === 'male' ? 'Male' : '';
  const engine = voice.engine === 'kokoro' ? 'Kokoro' : 'Piper';
  return [voice.description, voice.region, gender, 'Installed', 'Works offline', engine].filter(Boolean).join(' · ');
}

function formatClock(date) {
  let hour = date.getHours();
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute}:${second} ${suffix}`;
}

function statusLabel() {
  const status = state.status || { phase: 'idle' };
  if (status.phase === 'speaking') {
    const extra = status.queued > 0 ? ` ${status.queued} more waiting.` : '';
    return `Speaking: ${status.title}.${extra}`;
  }
  if (status.phase === 'generating') return `Preparing: ${status.title}.`;
  if (state.settings.paused) return 'Announcements are paused. The schedule is still saved.';
  return 'Scheduler running.';
}

function renderChrome() {
  const paused = state.settings.paused === true;
  $('pause-button').textContent = paused ? 'Resume announcements' : 'Pause announcements';
  $('pause-button').classList.toggle('on', !paused);
  const enabledCount = state.announcements.filter((item) => item.enabled).length;
  $('list-count').textContent = `${enabledCount} on · ${state.announcements.length} saved`;
  $('scheduler-label').textContent = paused ? 'Announcements paused' : 'Scheduler running';
  const dot = $('scheduler-dot');
  const phase = state.status && (state.status.phase === 'speaking' || state.status.phase === 'generating');
  dot.dataset.state = paused ? 'paused' : phase ? 'speaking' : 'running';
  $('live-status').textContent = statusLabel();
  $('next-up').textContent = window.classbell.upcomingLabel(state.announcements);
  $('today').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  $('clock').textContent = formatClock(new Date());
}

function renderCards() {
  const list = $('list');
  list.replaceChildren();
  if (!state.announcements.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No announcements yet.';
    list.append(empty);
    return;
  }
  state.announcements.forEach((announcement, index) => {
    const card = document.createElement('article');
    card.className = 'card';
    card.dataset.announcementId = announcement.id;
    card.dataset.placeholder = announcement.placeholder ? 'true' : 'false';
    if (announcement.placeholder) card.classList.add('placeholder');
    const speaking = state.status && state.status.announcementId === announcement.id
      && (state.status.phase === 'speaking' || state.status.phase === 'generating');
    if (speaking) card.classList.add('speaking');

    const title = document.createElement('h2');
    title.textContent = announcement.title;
    card.append(title);

    const next = document.createElement('p');
    next.dataset.nextFor = announcement.id;
    next.textContent = `Next: ${window.classbell.nextLabel(announcement)}`;
    card.append(next);

    const voice = document.createElement('p');
    voice.textContent = `Voice: ${voiceName(announcement.voiceId)} · Rate ${Number(announcement.rate).toFixed(2)}× · Volume ${announcement.volume}%`;
    card.append(voice);

    if (announcement.placeholder) {
      const badge = document.createElement('p');
      badge.className = 'warning';
      badge.textContent = 'Incomplete placeholder. This will not speak.';
      card.append(badge);
    }

    const early = window.classbell.earlyTimesMessage(announcement.times);
    if (early) {
      const warning = document.createElement('p');
      warning.className = 'warning';
      warning.textContent = early;
      card.append(warning);
    }
    if (announcement.notes) {
      const notes = document.createElement('p');
      notes.textContent = announcement.notes;
      card.append(notes);
    }

    const times = document.createElement('div');
    times.className = 'chip-list';
    if (!announcement.times.length) {
      const none = document.createElement('p');
      none.textContent = 'No times yet.';
      times.append(none);
    }
    for (const hhmm of announcement.times) {
      const chip = document.createElement('div');
      chip.className = window.classbell.isEarlyHour(hhmm) ? 'chip warn' : 'chip';
      chip.textContent = `${window.classbell.format12(hhmm)} (${hhmm})`;
      times.append(chip);
    }
    card.append(times);

    const actions = document.createElement('div');
    actions.className = 'stack';
    actions.append(
      actionButton(announcement.placeholder ? 'Incomplete — will not speak' : (announcement.enabled ? 'Enabled' : 'Disabled'), 'toggle', announcement.placeholder, announcement.enabled && !announcement.placeholder),
      actionButton('Edit', 'edit'),
      actionButton('Test / Play', 'play', announcement.placeholder),
      actionButton('Duplicate', 'duplicate'),
      actionButton('Move up', 'up', index === 0),
      actionButton('Move down', 'down', index === state.announcements.length - 1),
      actionButton('Delete', 'delete', false, false, true)
    );
    card.append(actions);
    list.append(card);
  });
}

function actionButton(label, action, disabled, on, danger) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.action = action;
  button.textContent = label;
  button.disabled = Boolean(disabled);
  if (on) button.classList.add('on');
  if (danger) button.classList.add('danger');
  if (action === 'toggle') {
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', on ? 'true' : 'false');
  }
  return button;
}

function timeSelect(part, values, selected, index) {
  const select = document.createElement('select');
  select.dataset.part = part;
  select.id = `time-${index}-${part}`;
  const label = document.createElement('label');
  label.htmlFor = select.id;
  const names = { hour: 'Hour', minute: 'Minute', suffix: 'AM or PM' };
  label.textContent = names[part];
  for (const value of values) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = String(value);
    select.append(option);
  }
  select.value = String(selected);
  return { label, select };
}

function renderTimes() {
  const wrap = $('editor-times');
  wrap.replaceChildren();
  editor.times.forEach((hhmm, index) => {
    const parts = window.classbell.to12Parts(hhmm);
    const row = document.createElement('div');
    row.className = 'time-row';
    const hour = timeSelect('hour', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], parts.hour, index);
    const minutes = [];
    for (let minute = 0; minute < 60; minute += 1) minutes.push(String(minute).padStart(2, '0'));
    const minute = timeSelect('minute', minutes, String(parts.minute).padStart(2, '0'), index);
    const suffix = timeSelect('suffix', ['AM', 'PM'], parts.suffix, index);
    const stored = document.createElement('p');
    stored.className = 'stored-time';
    const commit = () => {
      const next = window.classbell.from12Parts(hour.select.value, minute.select.value, suffix.select.value);
      if (next) editor.times[index] = next;
      stored.textContent = `Stored ${editor.times[index]}`;
      updateEditorWarning();
    };
    hour.select.addEventListener('change', commit);
    minute.select.addEventListener('change', commit);
    suffix.select.addEventListener('change', commit);
    stored.textContent = `Stored ${hhmm}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove Time';
    remove.addEventListener('click', () => {
      editor.times.splice(index, 1);
      renderTimes();
      updateEditorWarning();
    });
    row.append(hour.label, hour.select, minute.label, minute.select, suffix.label, suffix.select, stored, remove);
    wrap.append(row);
  });
}

function updateEditorWarning() {
  const message = window.classbell.earlyTimesMessage(editor.times);
  const warning = $('editor-warning');
  warning.textContent = message;
  warning.hidden = !message;
}

function nextFreeTime(times) {
  for (let minutes = 8 * 60; minutes < 16 * 60; minutes += 5) {
    const hhmm = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
    if (!times.includes(hhmm)) return hhmm;
  }
  return '08:00';
}

function openEditor(announcement, heading) {
  editor = {
    original: announcement,
    times: [...(announcement.times || [])]
  };
  $('editor-heading').textContent = heading;
  $('editor-title').value = announcement.title || '';
  $('editor-message').value = announcement.message || '';
  $('editor-notes').value = announcement.notes || '';
  $('editor-enabled').checked = announcement.enabled === true;
  $('editor-rate').value = String(announcement.rate ?? state.settings.defaultRate);
  $('editor-volume').value = String(announcement.volume ?? state.settings.defaultVolume);
  $('editor-rate-label').textContent = `${Number($('editor-rate').value).toFixed(2)}×`;
  $('editor-volume-label').textContent = `${$('editor-volume').value}%`;
  fillVoices($('editor-voice'), announcement.voiceId || state.settings.defaultVoiceId);
  $('editor-voice-help').textContent = voiceHelp($('editor-voice').value);
  const placeholder = announcement.placeholder === true;
  $('editor-placeholder-note').hidden = !placeholder;
  $('editor-ready-wrap').hidden = !placeholder;
  $('editor-ready').checked = false;
  $('editor-enabled').disabled = placeholder;
  renderTimes();
  updateEditorWarning();
  showView('editor');
}

function openSettings() {
  fillVoices($('settings-voice'), state.settings.defaultVoiceId);
  $('settings-voice-help').textContent = voiceHelp($('settings-voice').value);
  $('settings-rate').value = String(state.settings.defaultRate);
  $('settings-volume').value = String(state.settings.defaultVolume);
  $('settings-rate-label').textContent = `${Number(state.settings.defaultRate).toFixed(2)}×`;
  $('settings-volume-label').textContent = `${state.settings.defaultVolume}%`;
  $('settings-startup').checked = state.settings.launchAtStartup === true;
  $('settings-tray').checked = state.settings.minimizeToTray !== false;
  $('settings-startup-sound').checked = state.settings.playStartupSound === true;
  $('settings-paths').textContent = `Data: ${state.paths.data}\nLogs: ${state.paths.logs}`;
  $('settings-paths').style.whiteSpace = 'pre-wrap';
  $('settings-version').textContent = `ClassBell ${state.version}`;
  showView('settings');
}

function applyStatus(status) {
  state.status = status;
  if (status.phase === 'error' && status.message) showBanner(status.message);
  renderChrome();
  for (const card of document.querySelectorAll('[data-announcement-id]')) {
    const active = card.dataset.announcementId === status.announcementId
      && (status.phase === 'speaking' || status.phase === 'generating');
    card.classList.toggle('speaking', active);
  }
}

function tickClock() {
  if (!state) return;
  $('clock').textContent = formatClock(new Date());
  $('today').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric'
  });
  for (const node of document.querySelectorAll('[data-next-for]')) {
    const announcement = state.announcements.find((item) => item.id === node.dataset.nextFor);
    if (announcement) node.textContent = `Next: ${window.classbell.nextLabel(announcement)}`;
  }
  $('next-up').textContent = window.classbell.upcomingLabel(state.announcements);
}

async function speakWelcome() {
  const result = await window.classbell.speak({
    text: 'Welcome. Your ClassBell is ready.',
    title: 'Welcome',
    voiceId: state.settings.defaultVoiceId,
    rate: state.settings.defaultRate,
    volume: state.settings.defaultVolume
  });
  applyResult(result);
}

async function importSchedule() {
  const preview = await window.classbell.chooseImport();
  if (!preview || preview.canceled) return;
  if (!preview.ok) {
    openModal('Could not import', (preview.errors || ['That file could not be imported.']).join('\n'), [
      { label: 'Close', onClick: closeModal }
    ]);
    return;
  }
  openModal(
    'Import schedule',
    `This file has ${preview.count} announcements.\nThis computer has ${preview.currentCount} announcements.\n\nReplace removes the current schedule and uses the file.\nMerge updates matching ids, adds new announcements, and keeps local announcements that are not in the file.`,
    [
      { label: 'Replace schedule', className: 'danger', onClick: () => confirmImport('replace') },
      { label: 'Merge by id', className: 'primary', onClick: () => confirmImport('merge') },
      {
        label: 'Cancel',
        onClick: async () => {
          await window.classbell.clearImport();
          closeModal();
        }
      }
    ]
  );
}

async function confirmImport(mode) {
  const result = applyResult(await window.classbell.applyImport(mode));
  closeModal();
  if (result && result.ok) {
    renderCards();
    renderChrome();
    showBanner(mode === 'replace' ? 'Schedule replaced.' : 'Schedule merged.', 'good');
    if (document.body.dataset.view === 'settings') showView('list');
  }
}

async function exportSchedule() {
  const result = await window.classbell.exportSchedule();
  if (!result || result.canceled) return;
  if (!result.ok) showBanner(result.error || 'Could not export the schedule.');
  else showBanner(`Saved ${result.path}`, 'good');
}

function openModal(title, body, actions) {
  $('modal-title').textContent = title;
  $('modal-body').textContent = body;
  const wrap = $('modal-actions');
  wrap.replaceChildren();
  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.className) button.className = action.className;
    button.addEventListener('click', action.onClick);
    wrap.append(button);
  }
  $('modal').hidden = false;
}

function closeModal() {
  $('modal').hidden = true;
}

function bind() {
  $('banner-dismiss').addEventListener('click', hideBanner);
  $('welcome-test').addEventListener('click', speakWelcome);
  $('welcome-continue').addEventListener('click', async () => {
    const result = applyResult(await window.classbell.completeFirstRun());
    if (result && result.ok) {
      showView('list');
      renderCards();
      renderChrome();
    }
  });
  $('pause-button').addEventListener('click', async () => {
    const result = applyResult(await window.classbell.setPaused(!state.settings.paused));
    if (result && result.state) {
      renderChrome();
    }
  });
  $('add-button').addEventListener('click', () => {
    openEditor({
      id: crypto.randomUUID(),
      title: '',
      message: '',
      enabled: true,
      placeholder: false,
      times: [],
      voiceId: state.settings.defaultVoiceId,
      rate: state.settings.defaultRate,
      volume: state.settings.defaultVolume,
      notes: ''
    }, 'Add announcement');
  });
  $('import-button').addEventListener('click', importSchedule);
  $('export-button').addEventListener('click', exportSchedule);
  $('tab-announcements').addEventListener('click', () => {
    editor = null;
    showView('list');
    renderCards();
    renderChrome();
  });
  $('tab-settings').addEventListener('click', () => {
    editor = null;
    openSettings();
  });
  $('list').addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    const card = button.closest('[data-announcement-id]');
    if (!card) return;
    const id = card.dataset.announcementId;
    const announcement = state.announcements.find((item) => item.id === id);
    if (!announcement) return;
    const action = button.dataset.action;
    if (action === 'toggle') {
      const result = applyResult(await window.classbell.setEnabled(id, !announcement.enabled));
      if (result && result.ok) {
        renderCards();
        renderChrome();
      }
      return;
    }
    if (action === 'edit') {
      openEditor(announcement, 'Edit announcement');
      return;
    }
    if (action === 'play') {
      applyResult(await window.classbell.speak({
        title: announcement.title,
        text: announcement.message,
        voiceId: announcement.voiceId,
        rate: announcement.rate,
        volume: announcement.volume,
        announcementId: announcement.id
      }));
      return;
    }
    if (action === 'duplicate') {
      const result = applyResult(await window.classbell.duplicateAnnouncement(id));
      if (result && result.ok) {
        renderCards();
        renderChrome();
        showBanner('Copy added at the bottom of the list.', 'good');
      }
      return;
    }
    if (action === 'up' || action === 'down') {
      const result = applyResult(await window.classbell.reorder(id, action === 'up' ? -1 : 1));
      if (result && result.ok) renderCards();
      return;
    }
    if (action === 'delete') {
      openModal(`Delete "${announcement.title}"?`, 'This removes it from this computer.', [
        {
          label: 'Delete',
          className: 'danger',
          onClick: async () => {
            const result = applyResult(await window.classbell.deleteAnnouncement(id));
            closeModal();
            if (result && result.ok) {
              renderCards();
              renderChrome();
            }
          }
        },
        { label: 'Cancel', onClick: closeModal }
      ]);
    }
  });
  $('editor-add-time').addEventListener('click', () => {
    editor.times.push(nextFreeTime(editor.times));
    renderTimes();
    updateEditorWarning();
  });
  $('editor-voice').addEventListener('change', () => {
    $('editor-voice-help').textContent = voiceHelp($('editor-voice').value);
  });
  $('editor-rate').addEventListener('input', () => {
    $('editor-rate-label').textContent = `${Number($('editor-rate').value).toFixed(2)}×`;
  });
  $('editor-volume').addEventListener('input', () => {
    $('editor-volume-label').textContent = `${$('editor-volume').value}%`;
  });
  $('editor-ready').addEventListener('change', () => {
    const ready = $('editor-ready').checked;
    if (ready && !$('editor-message').value.trim()) {
      $('editor-ready').checked = false;
      showBanner('Write a message before marking this announcement ready.');
      return;
    }
    $('editor-enabled').disabled = !ready;
    $('editor-enabled').checked = ready;
  });
  $('editor-message').addEventListener('input', () => {
    if (!$('editor-message').value.trim() && $('editor-ready').checked) {
      $('editor-ready').checked = false;
      $('editor-enabled').disabled = true;
      $('editor-enabled').checked = false;
    }
  });
  $('editor-test').addEventListener('click', async () => {
    const message = $('editor-message').value.trim() || window.classbell.sampleAnnouncement();
    applyResult(await window.classbell.speak({
      title: $('editor-title').value.trim() || 'Voice test',
      text: message,
      voiceId: $('editor-voice').value,
      rate: Number($('editor-rate').value),
      volume: Number($('editor-volume').value)
    }));
  });
  $('editor-cancel').addEventListener('click', () => {
    editor = null;
    showView('list');
  });
  $('editor-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const wasPlaceholder = editor.original.placeholder === true;
    const ready = $('editor-ready').checked;
    const placeholder = wasPlaceholder ? !ready : false;
    const message = $('editor-message').value;
    if (!placeholder && !message.trim()) {
      showBanner('Write a message before this announcement can speak.');
      return;
    }
    const payload = {
      id: editor.original.id,
      title: $('editor-title').value,
      message,
      enabled: placeholder ? false : $('editor-enabled').checked,
      placeholder,
      times: editor.times,
      voiceId: $('editor-voice').value,
      rate: Number($('editor-rate').value),
      volume: Number($('editor-volume').value),
      notes: $('editor-notes').value,
      createdAt: editor.original.createdAt
    };
    if (editor.original.days) payload.days = editor.original.days;
    const result = applyResult(await window.classbell.saveAnnouncement(payload));
    if (result && result.ok) {
      editor = null;
      showView('list');
      renderCards();
      renderChrome();
      showBanner('Saved.', 'good');
    }
  });
  $('settings-voice').addEventListener('change', () => {
    $('settings-voice-help').textContent = voiceHelp($('settings-voice').value);
    saveSettings({ defaultVoiceId: $('settings-voice').value });
  });
  $('settings-rate').addEventListener('change', () => {
    $('settings-rate-label').textContent = `${Number($('settings-rate').value).toFixed(2)}×`;
    saveSettings({ defaultRate: Number($('settings-rate').value) });
  });
  $('settings-volume').addEventListener('change', () => {
    $('settings-volume-label').textContent = `${$('settings-volume').value}%`;
    saveSettings({ defaultVolume: Number($('settings-volume').value) });
  });
  $('settings-startup').addEventListener('change', () => saveSettings({ launchAtStartup: $('settings-startup').checked }));
  $('settings-tray').addEventListener('change', () => saveSettings({ minimizeToTray: $('settings-tray').checked }));
  $('settings-startup-sound').addEventListener('change', () => saveSettings({ playStartupSound: $('settings-startup-sound').checked }));
  $('settings-test').addEventListener('click', async () => {
    applyResult(await window.classbell.speak({
      title: 'Test',
      text: window.classbell.sampleAnnouncement(),
      voiceId: $('settings-voice').value,
      rate: Number($('settings-rate').value),
      volume: Number($('settings-volume').value)
    }));
  });
  $('settings-import').addEventListener('click', importSchedule);
  $('settings-export').addEventListener('click', exportSchedule);
  $('settings-data').addEventListener('click', () => window.classbell.openDataFolder());
  $('settings-logs').addEventListener('click', () => window.classbell.openLogFolder());
  $('settings-done').addEventListener('click', () => {
    showView('list');
    renderCards();
    renderChrome();
  });
  $('settings-form').addEventListener('submit', (event) => event.preventDefault());
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('modal').hidden) {
      closeModal();
      return;
    }
    if (document.body.dataset.view === 'editor' || document.body.dataset.view === 'settings') {
      showView('list');
      renderCards();
      renderChrome();
    }
  });
}

async function saveSettings(partial) {
  const result = applyResult(await window.classbell.saveSettings(partial));
  if (result && result.ok) {
    renderChrome();
    showBanner('Saved.', 'good');
  }
}

async function init() {
  state = await window.classbell.getState();
  if (state.voiceWarning) showBanner(state.voiceWarning);
  bind();
  window.classbell.onStatus(applyStatus);
  if (state.firstRun) showView('welcome');
  else {
    showView('list');
    renderCards();
  }
  renderChrome();
  document.body.dataset.ready = state.firstRun ? 'welcome' : 'list';
  setInterval(tickClock, 250);
  if (state.firstRun && !state.suppressAutoSpeak) speakWelcome();
}

init().catch((error) => {
  document.body.dataset.ready = 'error';
  document.body.dataset.error = error && error.message ? error.message : String(error);
  showBanner(document.body.dataset.error);
});
