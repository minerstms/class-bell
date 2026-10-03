'use strict';

const { contextBridge, ipcRenderer } = require('electron');
const { SAMPLE_ANNOUNCEMENT } = require('../shared/defaults');
const time = require('../shared/time');

contextBridge.exposeInMainWorld('classbell', {
  getState: () => ipcRenderer.invoke('get-state'),
  completeFirstRun: () => ipcRenderer.invoke('complete-first-run'),
  speak: (payload) => ipcRenderer.invoke('speak', payload),
  saveAnnouncement: (announcement) => ipcRenderer.invoke('save-announcement', announcement),
  deleteAnnouncement: (id) => ipcRenderer.invoke('delete-announcement', id),
  duplicateAnnouncement: (id) => ipcRenderer.invoke('duplicate-announcement', id),
  setEnabled: (id, enabled) => ipcRenderer.invoke('set-enabled', id, enabled),
  reorder: (id, direction) => ipcRenderer.invoke('reorder', id, direction),
  setPaused: (paused) => ipcRenderer.invoke('set-paused', paused),
  saveSettings: (partial) => ipcRenderer.invoke('save-settings', partial),
  chooseImport: () => ipcRenderer.invoke('choose-import'),
  applyImport: (mode) => ipcRenderer.invoke('apply-import', mode),
  clearImport: () => ipcRenderer.invoke('clear-import'),
  exportSchedule: () => ipcRenderer.invoke('export-schedule'),
  exportScheduleData: () => ipcRenderer.invoke('export-schedule-data'),
  openDataFolder: () => ipcRenderer.invoke('open-data-folder'),
  openLogFolder: () => ipcRenderer.invoke('open-log-folder'),
  sampleAnnouncement: () => SAMPLE_ANNOUNCEMENT,
  format12: (hhmm) => time.format12(hhmm),
  to12Parts: (hhmm) => time.to12Parts(hhmm),
  from12Parts: (hour, minute, suffix) => time.from12Parts(hour, minute, suffix),
  isEarlyHour: (hhmm) => time.isEarlyHour(hhmm),
  nextLabel: (announcement) => time.nextLabel(announcement, new Date()),
  upcomingLabel: (announcements) => time.upcomingLabel(announcements, new Date()),
  earlyTimesMessage: (times) => time.earlyTimesMessage(times),
  duplicateTimes: (times) => time.duplicateTimes(times),
  recurrenceMode: (days) => time.recurrenceMode(days),
  recurrenceLabel: (days) => time.recurrenceLabel(days),
  onStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on('status', listener);
    return () => ipcRenderer.removeListener('status', listener);
  }
});
