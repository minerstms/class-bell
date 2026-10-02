'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function isSingleCodepoint(text) {
  return [...String(text)].length === 1;
}

function phonemeMapFitsBundledPiper(config) {
  const map = config && config.phoneme_id_map;
  if (!map || typeof map !== 'object' || Array.isArray(map)) return false;
  const keys = Object.keys(map);
  if (!keys.length) return false;
  return keys.every(isSingleCodepoint);
}

function speakerIdFromConfig(config, voice) {
  const count = Number(config && config.num_speakers ? config.num_speakers : 1);
  if (!Number.isInteger(count) || count <= 1) return null;
  const map = config.speaker_id_map;
  if (!map || typeof map !== 'object' || !voice || !voice.speakerKey) return undefined;
  if (!Object.prototype.hasOwnProperty.call(map, voice.speakerKey)) return undefined;
  const id = map[voice.speakerKey];
  if (!Number.isInteger(id) || id < 0 || id >= count) return undefined;
  return id;
}

function loadVoices(voicesDir, log) {
  const logger = log || { info() {}, error() {} };
  const manifestPath = path.join(voicesDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    logger.error(`Voice list was not found at ${manifestPath}`);
    return [];
  }
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    logger.error(`Voice list could not be read. ${error.message}`);
    return [];
  }
  const voices = [];
  for (const voice of manifest.voices || []) {
    if (!voice || !voice.id || !voice.modelFile || !voice.configFile) continue;
    const modelPath = path.join(voicesDir, voice.modelFile);
    const configPath = path.join(voicesDir, voice.configFile);
    if (!fs.existsSync(modelPath) || !fs.existsSync(configPath)) {
      logger.error(`Missing voice files for ${voice.name || voice.id}.`);
      continue;
    }
    let config;
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
      logger.error(`Voice settings for ${voice.name || voice.id} could not be read. ${error.message}`);
      continue;
    }
    if (!phonemeMapFitsBundledPiper(config)) {
      logger.error(`${voice.name || voice.id} needs a newer Piper than the one bundled with ClassBell, so it was not loaded.`);
      continue;
    }
    const speakerId = speakerIdFromConfig(config, voice);
    if (speakerId === undefined) {
      logger.error(`${voice.name || voice.id} does not have a documented speaker in its voice file, so it was not loaded.`);
      continue;
    }
    voices.push({
      id: voice.id,
      name: voice.name || voice.id,
      description: voice.description || '',
      region: voice.region || '',
      gender: voice.gender || '',
      engine: voice.engine || 'piper',
      modelPath,
      configPath,
      speakerId,
      installed: true
    });
  }
  return voices;
}

function fileSha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function packFilesMatch(packDir, manifest, logger) {
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!files.length) {
    logger.error(`Voice pack ${manifest.id || packDir} has no file list.`);
    return false;
  }
  for (const file of files) {
    if (!file || !file.path || !file.sha256) {
      logger.error(`Voice pack ${manifest.id || packDir} has an incomplete file record.`);
      return false;
    }
    const full = path.join(packDir, file.path);
    if (!fs.existsSync(full)) {
      logger.error(`Voice pack file ${file.path} is missing.`);
      return false;
    }
    const size = fs.statSync(full).size;
    if (file.bytes != null && size !== file.bytes) {
      logger.error(`Voice pack file ${file.path} is ${size} bytes, expected ${file.bytes}.`);
      return false;
    }
    const actual = fileSha256(full);
    if (actual !== file.sha256) {
      logger.error(`Voice pack file ${file.path} did not match its checksum.`);
      return false;
    }
  }
  return true;
}

function loadVoicePacks(packRoots, log) {
  const logger = log || { info() {}, error() {} };
  const voices = [];
  for (const root of packRoots || []) {
    if (!root || !fs.existsSync(root)) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(root, { withFileTypes: true });
    } catch (error) {
      logger.error(`Could not read voice packs in ${root}. ${error.message}`);
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const packDir = path.join(root, entry.name);
      const manifestPath = path.join(packDir, 'manifest.json');
      if (!fs.existsSync(manifestPath)) continue;
      let manifest;
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      } catch (error) {
        logger.error(`Voice pack ${entry.name} could not be read. ${error.message}`);
        continue;
      }
      if (!manifest || (manifest.engine !== 'piper18' && manifest.engine !== 'kokoro') || !manifest.engineExe) {
        logger.error(`Voice pack ${entry.name} does not name a supported speech program.`);
        continue;
      }
      const engineExe = path.join(packDir, manifest.engineExe);
      const engineDir = path.dirname(engineExe);
      if (!fs.existsSync(engineExe) || !fs.existsSync(path.join(engineDir, '_internal'))) {
        logger.error(`Voice pack ${entry.name} is missing its speech program.`);
        continue;
      }
      if (!packFilesMatch(packDir, manifest, logger)) continue;
      if (manifest.engine === 'piper18') {
        for (const voice of manifest.voices || []) {
          if (!voice || !voice.id || !voice.modelFile || !voice.configFile || !voice.speakerKey) continue;
          const configPath = path.join(packDir, voice.configFile);
          let config;
          try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          } catch (error) {
            logger.error(`Voice settings for ${voice.name || voice.id} could not be read. ${error.message}`);
            continue;
          }
          const speakerId = speakerIdFromConfig(config, voice);
          if (speakerId === undefined || speakerId === null) {
            logger.error(`${voice.name || voice.id} does not have a documented speaker in its voice file, so it was not loaded.`);
            continue;
          }
          voices.push({
            id: voice.id,
            name: voice.name || voice.id,
            description: voice.description || '',
            region: voice.region || '',
            gender: voice.gender || '',
            engine: 'piper18',
            engineExe,
            engineDir,
            modelPath: path.join(packDir, voice.modelFile),
            configPath,
            speakerId,
            installed: true
          });
        }
        continue;
      }
      const modelPath = path.join(packDir, manifest.modelFile || '');
      const voicesPath = path.join(packDir, manifest.voicesFile || '');
      for (const voice of manifest.voices || []) {
        if (!voice || !voice.id || !voice.kokoroVoice || !/^bf_[a-z]+$/.test(voice.kokoroVoice)) continue;
        voices.push({
          id: voice.id,
          name: voice.name || voice.id,
          description: voice.description || '',
          region: voice.region || '',
          gender: voice.gender || '',
          engine: 'kokoro',
          engineExe,
          engineDir,
          modelPath,
          voicesPath,
          kokoroVoice: voice.kokoroVoice,
          lang: voice.lang || 'en-gb',
          speakerId: null,
          installed: true
        });
      }
    }
  }
  return voices;
}

module.exports = {
  loadVoices,
  loadVoicePacks,
  phonemeMapFitsBundledPiper,
  speakerIdFromConfig,
  isSingleCodepoint
};
