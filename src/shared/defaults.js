'use strict';

const DEFAULT_VOICE_ID = 'linda';
const SAMPLE_ANNOUNCEMENT = 'Welcome to class. Please find your seat and get ready to begin.';

const RAW_ANNOUNCEMENTS = [
  {
    id: 'welcome-to-class',
    title: 'Welcome to Class',
    message: 'Welcome to class. Please find your seat and get ready to begin.',
    enabled: true,
    placeholder: false,
    times: ['08:00'],
    voiceId: DEFAULT_VOICE_ID,
    rate: 1,
    volume: 100,
    notes: ''
  },
  {
    id: 'attendance-reminder',
    title: 'Attendance Reminder',
    message: 'Please make sure attendance has been taken.',
    enabled: true,
    placeholder: false,
    times: ['08:05'],
    voiceId: DEFAULT_VOICE_ID,
    rate: 1,
    volume: 100,
    notes: ''
  },
  {
    id: 'begin-independent-work',
    title: 'Begin Independent Work',
    message: 'It is time to begin independent work. Stay focused and do your best.',
    enabled: true,
    placeholder: false,
    times: ['08:10'],
    voiceId: DEFAULT_VOICE_ID,
    rate: 1,
    volume: 100,
    notes: ''
  },
  {
    id: 'halfway-reminder',
    title: 'Halfway Reminder',
    message: 'This is the halfway reminder. Check your progress and keep going.',
    enabled: true,
    placeholder: false,
    times: ['08:25'],
    voiceId: DEFAULT_VOICE_ID,
    rate: 1,
    volume: 100,
    notes: ''
  },
  {
    id: 'cleanup-warning',
    title: 'Cleanup Warning',
    message: 'Cleanup warning. You have a few minutes to finish, save your work, and put materials away.',
    enabled: true,
    placeholder: false,
    times: ['08:45'],
    voiceId: DEFAULT_VOICE_ID,
    rate: 1,
    volume: 100,
    notes: ''
  },
  {
    id: 'end-of-class',
    title: 'End of Class',
    message: 'Class is ending. Please turn in your work and leave the room ready for the next class.',
    enabled: true,
    placeholder: false,
    times: ['08:55'],
    voiceId: DEFAULT_VOICE_ID,
    rate: 1,
    volume: 100,
    notes: ''
  }
];

function createDefaultAnnouncements() {
  return RAW_ANNOUNCEMENTS.map((item) => ({
    ...item,
    times: [...item.times]
  }));
}

function createDefaultSettings() {
  return {
    version: 1,
    firstRunComplete: false,
    defaultVoiceId: DEFAULT_VOICE_ID,
    defaultRate: 1,
    defaultVolume: 100,
    launchAtStartup: false,
    minimizeToTray: true,
    playStartupSound: false,
    paused: false,
    clockAnnouncements: false,
    clockIntervalMinutes: 60,
    suppressWhenLocked: false,
    suppressWhenPresenting: false
  };
}

module.exports = {
  DEFAULT_VOICE_ID,
  SAMPLE_ANNOUNCEMENT,
  createDefaultAnnouncements,
  createDefaultSettings
};
