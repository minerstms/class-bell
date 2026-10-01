'use strict';

const fs = require('fs');
const path = require('path');

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
    voices.push({
      id: voice.id,
      name: voice.name || voice.id,
      description: voice.description || '',
      modelPath,
      configPath
    });
  }
  return voices;
}

module.exports = { loadVoices };
