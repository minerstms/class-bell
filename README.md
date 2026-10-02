# ClassBell

ClassBell is an offline Windows app for classroom announcements. Teachers add a message, pick a voice, and set one or more times. The app speaks on the local clock with bundled Piper voices. It does not use a browser, a cloud voice, an account, or an API key.

## Install

Download `ClassBell-Setup-1.0.0.exe` from the [v1.0.0-beta.1 pre-release](https://github.com/minerstms/class-bell/releases/tag/v1.0.0-beta.1). The installer is per user. It does not need administrator rights and it does not change system-wide settings. After installation, start ClassBell from the desktop or Start menu shortcut.

Internet is not required after installation. Speech stays on this computer.

## First launch

The welcome screen has a large **Test Sound** button. ClassBell speaks: “Welcome. Your ClassBell is ready.” Choose **Continue** to open the schedule. No account is required.

A new installation starts with six sample announcements: Welcome to Class, Attendance Reminder, Begin Independent Work, Halfway Reminder, Cleanup Warning, and End of Class. A schedule already saved on this computer is left as it is. To use a different schedule, choose Import Schedule and then Replace or Merge by id.

## Adding and editing announcements

After the welcome screen, ClassBell opens on **Announcements**. **Announcements** and **Settings** are the two tabs at the top. The first launch still shows the welcome screen until you choose **Continue**.

Choose **Add Announcement** or **Edit** on a card. Set the title and the message, then **Save**. Changes are written immediately to this computer. The announcement list shows the next upcoming announcement, and whether the schedule is running or paused.

**Enabled** and **Disabled** on each card turn that announcement on or off. **Test / Play** speaks it now. **Duplicate** adds a copy at the bottom. **Move up** and **Move down** change the order. When two announcements are due at the same minute, they speak in list order, one after another, and they do not talk over each other.

**Delete** asks before it removes an announcement.

## Adding times

In the editor, choose **Add Time** and set the hour, minute, and AM or PM. ClassBell stores that choice as 24-hour `HH:MM`. **Remove Time** deletes one time.

Times before 7:00 AM are highlighted on the card, with both the 12-hour label and the stored `HH:MM` value, so an early time is easy to correct.

## Selecting voices

Each announcement has its own voice, rate, and volume. Rate is passed to Piper as a speaking-length adjustment. Volume is applied to the audio before it plays. The settings screen sets the defaults used for new announcements and for **Test Voice**. The voice list is grouped by region. Every voice in that list is installed and works offline.

Bundled voices:

- Linda (US female)
- Kristin (US female)
- Norman (US male)
- John (US male)
- Cori (UK female)

The installer also includes these voices. They work offline, and teachers do not install Python:

- Bindi, Marlo, and Kirra (Australian female, Piper 1.8)
- Alice and Emma (British female, Kokoro)

Those packs are self-contained. Teachers do not install Python. See `THIRD_PARTY_NOTICES.md`.

## Import and export

**Export Schedule** writes a JSON file. **Import Schedule** checks the file, then asks you to **Replace** the current schedule or **Merge by id**. Merge updates announcements that share an id, adds new ones, and keeps local announcements that are not in the file. Nothing is uploaded.

## Where data is stored

ClassBell stores data for the current Windows user:

- `%APPDATA%\ClassBell\announcements.json`
- `%APPDATA%\ClassBell\settings.json`
- `%APPDATA%\ClassBell\fired.json` (which announcements already spoke today)

**Open data folder** in Settings opens that location. If a file cannot be read, ClassBell renames it to `*.corrupt-<time>` and restores a usable copy. The unreadable file is kept.

## Where logs are stored

Logs are in `%APPDATA%\ClassBell\logs\classbell.log`. **Open logs folder** in Settings opens that folder. The log records speech failures and clock jumps. It does not record the announcement message text.

## Schedule behavior

ClassBell checks the local Windows clock about twice a second. An announcement speaks once for each date and time. If the computer was asleep, turned off, or the clock jumped, ClassBell speaks only when it notices the time within 30 seconds after the scheduled minute. Older missed announcements stay quiet. Pause stops scheduled speech, including announcements still waiting in the queue. Test / Play still works while paused.

The schedule runs every day. Saved announcements can later grow an optional `days` list (`sun` through `sat`) without a format change. The editor does not show that field yet.

Closing the window keeps ClassBell in the system tray. The tray menu can open the app, pause announcements, play a voice test, or exit. Launch at startup is off until you turn it on. That choice is stored for your Windows user and does not need administrator rights. The installed app then starts in the tray.

## Troubleshooting

- No sound: raise the announcement volume and the Windows volume, then use **Test Sound**. If it still fails, open the log.
- A bell did not speak: check that it is **On**, that it is not an incomplete placeholder, that announcements are not paused, and that the computer was awake within 30 seconds of the time.
- Two bells at the same time: they play in list order, not at the same time.
- A second ClassBell window: the app is already running. The second launch opens the first window.
- Early morning times: they are stored exactly as `HH:MM`. Change them in Edit if they should be afternoon times.

## Voice and model licensing

See `THIRD_PARTY_NOTICES.md`. The bundled voices are public domain. Piper’s application code, piper-phonemize, and ONNX Runtime are MIT. espeak-ng, which Piper uses for pronunciation, is GPL-3.0. License copies are in `vendor/piper/licenses/` and the model cards are in `voices/cards/`.

## Development

Requirements: Node.js 20 or newer, on Windows.

```text
npm install
npm test
npm run check
npm start
```

`npm run vendor` downloads Piper and the voice models when they are missing, then checks `voices/SHA256SUMS.txt`. Those program files and `.onnx` models stay on this computer. They are not committed. `npm run icon` redraws the icon.

Production installer, written to `dist/` and not published:

```text
npm run dist
```

This repository is an Electron app. It is not a Cloudflare Pages project, so `npx wrangler pages functions build` does not apply.
