# Attribution - en_AU-librivox-medium

Every second of audio behind this model was recorded by a LibriVox volunteer and
donated to the public domain. This records who they were and how their
recordings became a model.

## Provenance

| stage | what | licence |
|---|---|---|
| Recordings | LibriVox volunteers, 2008-2023 | Public domain |
| Source texts | Public-domain Australian books via Project Gutenberg | Public domain |
| Dataset | [`ablmontazer/australian-english-speech`](https://huggingface.co/datasets/ablmontazer/australian-english-speech) - 61,662 clips / 110.2 h / 214 readers | CC0-1.0 |
| Subset used | 10 accent-verified speakers, 17,454 clips, 31.01 h | CC0-1.0 |
| Base checkpoint | `en_GB-jenny_dioco-medium`, from the Jenny TTS dataset | Commercial OK, **attribution required** |
| Trainer | [`OHF-Voice/piper1-gpl`](https://github.com/OHF-Voice/piper1-gpl) v1.8.0 | GPL-3.0 (software only) |
| **This model** | epoch 599, 146,999 steps, espeak `en-gb-x-rp` | **CC BY 4.0** |

Accent was verified by ear, not from documentation, the source corpus is Australian *titles*, and LibriVox volunteers are international, so an Australian book is no guarantee of an Australian narrator. Ten of 214 readers were judged Australian enough by Data Craftsman.

## The narrators

| id | narrator | h | clips | read |
|---:|---|---:|---:|---|
| 0 | `son_of_the_exiles` | 3.39 | 1,669 | Australian Explorers; Short Poetry Collection 159 |
| 1 | `jenno` | 2.16 | 1,409 | Australian Explorers; Australian Fairy Tales; History of Australia and New Zealand 1606-1890 |
| 2 | `lucy_burgoyne_1950_2014` | 1.49 | 934 | Australian Legendary Tales; A Lady's Visit to the Gold Diggings of Australia 1852-53; Selection of Australian Poetry and Prose |
| 3 | `magdalena` | 6.05 | 3,093 | Australian Legendary Tales; Robert O'Hara Burke and the Australian Exploring Expedition of 1860 |
| 4 | `algy_pug` | 1.80 | 1,185 | Australian Miscellany; Leaves from Australian Forests; Short Poetry Collections 092 & 159 |
| 5 | `timothy_ferguson` | 7.97 | 4,002 | Australian Miscellany; Gladstone Colony |
| 6 | `howard_skyman` | 0.58 | 492 | Old Broadbrim into the Heart of Australia |
| 7 | `ophelia_darcy` | 3.15 | 1,900 | Seven Little Australians (Ethel Turner) |
| 8 | `kirsty_leishman` | 3.57 | 2,188 | Two Sides To Every Question: From A South Australian Standpoint |
| 9 | `jane_bennett` | 0.86 | 582 | History of Australia and New Zealand 1606-1890 |

The other 204 readers in the source dataset are listed in its `CREDITS.md`. These are the narrators' own LibriVox display names. If you rename these voices, please keep the original name alongside — it is the only link back to the person who recorded it.

## Licence

**This model is released under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Commercial use, redistribution, modification and further fine-tuning are permitted. The audio, texts and source dataset are CC0 / public domain and constrain nothing. `piper1-gpl` is GPL-3.0, but that covers the training software, not the weights it produced, and none of it is distributed here.

### Attribution to Jenny (Dioco)

The base checkpoint derives from the **Jenny TTS dataset**, recorded by **Jenny** and published by **Dioco**, whose licence reads:

> Attribution is required in software/websites/projects/interfaces (including
> voice interfaces) that generate audio in response to user action using this
> dataset. Atribution means: the voice must be referred to as "Jenny", and
> where at all practical, "Jenny (Dioco)". Attribution is not required when
> distributing the generated clips (although welcome). Commercial use is
> permitted. Don't do unfair things like claim the dataset is your own. No
> further restrictions apply.

Source: <https://github.com/dioco-group/jenny-tts-dataset>. 


This was not waived upstream: `rhasspy/piper-voices` is MIT at the repo level, but the per-voice `MODEL_CARD` for `jenny_dioco` declines to grant a licence and states `License: See URL`, deferring to Dioco. The obligation is real and it travels — including to anything you fine-tune from this model.

Jenny (Dioco) is therefore a **designated attribution party** under CC BY 4.0 §3(a)(1)(A). Retain this notice:

> `en_AU-librivox-medium`, CC BY 4.0. Fine-tuned from `en_GB-jenny_dioco-medium`,
> derived from the Jenny TTS dataset by **Jenny (Dioco)**. Training audio is
> public domain, recorded by LibriVox volunteers.

**One gap.** CC BY's attribution duty triggers when you *share* the model; the upstream requirement triggers when software *generates audio for a user*, which reaches server-side use where nothing is distributed. No standard licence closes that gap (Apache-2.0's NOTICE has the same limit). Please credit Jenny (Dioco) in that case anyway.

**Interpretation, stated openly.** The clause *"the voice must be referred to as Jenny"* is written for a project using Jenny's voice. This model does not produce it, it was fine-tuned on 31.01 h from ten other speakers with their own learned embeddings, and its outputs are those narrators. The reading taken here is that the requirement attaches to the lineage rather than the output: Jenny (Dioco) is credited as the origin of the base checkpoint, and the voices are named for the narrators who produced them. Good-faith compliance with a licence that did not anticipate this case; not a legal conclusion, not legal advice.

Please support Jenny!
Commissions: dioco@dioco.io

## Not required, but asked for

The narrators donated these readings years ago to make books freely available, at a time when training a speech model on them was not a consideration anyone weighed. The dedication is unconditional and nothing obliges you to credit them. It is still a reason to name them, and not to represent these voices as belonging to anyone else.
