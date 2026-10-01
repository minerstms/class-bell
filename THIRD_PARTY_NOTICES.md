# Third-party notices

ClassBell bundles an unmodified Piper Windows build and five public-domain English voice models. No cloud speech service is used.

## Piper speech engine

- Build: Piper 2023.11.14-2, `piper_windows_amd64.zip`
- Source: https://github.com/rhasspy/piper/releases/tag/2023.11.14-2
- Piper application code: MIT License, Copyright (c) 2022 Michael Hansen
- License file: `vendor/piper/licenses/piper-MIT.txt`
- The zip is redistributed unmodified, including `piper.exe`

## piper-phonemize

- Binary: `piper_phonemize.dll` from the Piper Windows zip
- Source: https://github.com/rhasspy/piper-phonemize
- License: MIT License, Copyright (c) 2023 Michael Hansen
- License file: `vendor/piper/licenses/piper-phonemize-LICENSE.txt`

## espeak-ng

- Binaries and data: `espeak-ng.dll` and `espeak-ng-data/` from the Piper Windows zip
- Source: https://github.com/espeak-ng/espeak-ng
- License: GNU General Public License version 3
- License file: `vendor/piper/licenses/espeak-ng-GPL-3.0.txt`
- That full GPL-3.0 text is included in the Windows installer at `resources/piper/licenses/espeak-ng-GPL-3.0.txt`.
- Corresponding source for this unmodified library and data is the espeak-ng project shipped inside the official Piper 2023.11.14-2 Windows zip: https://github.com/espeak-ng/espeak-ng and https://github.com/rhasspy/piper/releases/tag/2023.11.14-2

## ONNX Runtime

- Binaries: `onnxruntime.dll` and `onnxruntime_providers_shared.dll` from the Piper Windows zip
- Source: https://github.com/microsoft/onnxruntime
- License: MIT License, Copyright (c) Microsoft Corporation
- License file: `vendor/piper/licenses/onnxruntime-MIT.txt`

## Voice models

These five models are the ones whose trainer, Bryce Beattie, marked the model itself public domain and wrote: “Feel free to use these for any legal and ethical purpose. If somebody wants to upload these to HuggingFace or somewhere similar, you have my blessing.” Source page checked 2026-10-01: https://brycebeattie.com/files/tts/

A downloadable Piper voice is not treated as public domain unless that page, the model card, and the dataset terms all allow redistribution. Voices that are finetuned from the Lessac/Blizzard model, non-commercial, or all-rights-reserved were not included.

| UI name | File | Bytes | License and source |
| --- | --- | --- | --- |
| Linda (US female) | `en_US-ljspeech-high.onnx` | 114,199,011 | Public domain. File from https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/high. Its model card says it was trained from scratch for 1000 epochs on medium quality settings. Bryce Beattie lists both the LJSpeech medium and LJSpeech high releases as public domain. Dataset: LJ Speech by Keith Ito, public domain, https://keithito.com/LJ-Speech-Dataset/ |
| Kristin (US female) | `en_US-kristin-medium.onnx` | 63,531,379 | Public domain. LibriVox recordings. Trained from scratch by Bryce Beattie. https://brycebeattie.com/files/tts/ |
| Norman (US male) | `en_US-norman-medium.onnx` | 63,531,379 | Public domain. LibriVox recordings. Trained from scratch by Bryce Beattie. https://brycebeattie.com/files/tts/ |
| John (US male) | `en_US-john-medium.onnx` | 63,531,379 | Public domain. LibriVox recordings. Bryce Beattie continued training from the public-domain Kristin model and released John as public domain. https://brycebeattie.com/files/tts/ |
| Cori (UK female) | `en_GB-cori-medium.onnx` | 63,531,379 | Public domain. LibriVox recordings. Trained from scratch by Bryce Beattie. https://brycebeattie.com/files/tts/ |

Copied model cards are in `voices/cards/`. Checksums are in `voices/SHA256SUMS.txt`. The Hugging Face `rhasspy/piper-voices` copies are the files the installer ships. `npm run vendor` downloads them and checks those checksums. The `.onnx` files and Piper program files are not stored in Git because `en_US-ljspeech-high.onnx` is larger than GitHub’s 100 MB file limit.

The five model files total about 351 MB. That is most of the installer size.

### Voices that were not bundled

- US Lessac: the Blizzard 2013 dataset license is not a clear right to ship the model in an app.
- US Ryan: CC BY-NC-SA 4.0, and the medium model is also finetuned from Lessac.
- US Amy and UK Jenny (the Hugging Face copies): finetuned from Lessac, with dataset terms that are not clear enough to ship.
- UK Alan: all rights reserved.
- UK Northern English male: target dataset is CC BY-SA, but the model is finetuned from Lessac.
- Australian English: the official Piper voice set has no Australian model with a clear redistribution license.

More voices can be added later by placing a Piper `.onnx` file, its `.onnx.json` file, and a new entry in `voices/manifest.json`.
