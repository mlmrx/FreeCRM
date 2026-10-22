# Local translation tools

These optional authoring tools translate public English interface copy into draft
catalogs using an on-device model. They are never installed in the application,
never receive CRM records, and never make runtime translation requests.

## Quality status

These are authoring experiments, not approved translators. The M2M100 and OPUS
prototypes failed representative product-copy review (including incorrect
negation and omitted sentences). Do not publish their output just because a
catalog is complete or its placeholder checks pass. Keep existing reviewed
translations and require an editorial review of controls, consent, approvals,
emergency stops, and setup instructions before releasing a new catalog.

Use Python 3.11 or newer in an isolated environment, with PyTorch, Transformers
4.57.6, SentencePiece, CTranslate2 4.6.3, huggingface-hub and OpenCC installed. The
default working directory is ignored `output/localization-tools/`.

```powershell
uv venv --python 3.11 output/localization-tools/venv
uv pip install --python output/localization-tools/venv/Scripts/python.exe torch transformers==4.57.6 sentencepiece ctranslate2==4.6.3 huggingface-hub opencc-python-reimplemented
output/localization-tools/venv/Scripts/python.exe scripts/localization/prepare-model.py
output/localization-tools/venv/Scripts/python.exe scripts/localization/translate-catalog.py output/localization/en-US.json --locales es-ES,fr-FR,ar-SA --output output/localization-tools/catalogs
```

The source is a JSON object mapping message keys to English text, or an object
with that map in `messages`. Every generated locale is a flat JSON object with
the same keys. `translation-cache.jsonl` stores a SHA-256 key derived from model
revision, beam size, locale and source text. Restarting a job reuses completed
strings; changing source text creates a new cache entry. Outputs are atomically
replaced when a locale finishes. The report lists unchanged strings, empty
translations and placeholder mismatches for review.

`--device cuda` uses a supported NVIDIA GPU. On Windows, `--dll-dir` may point to
an existing CUDA 12 cuBLAS directory; no running service needs to be modified.
CPU execution uses int8. GPU execution uses int8 weights and float16 compute.
`--batch-size`, `--beam-size`, `--threads`, and `--limit` support measured tuning
and small representative reviews before full generation.

Machine generated catalogs need editorial review. The script preserves message
placeholders, brands, links, email addresses, code, environment variable names,
permission scopes, boolean values, and numeric literals. If a model changes one
of these, it retains the original English message and reports that fallback for
editorial review. Existing reviewed translations override generated drafts. OpenCC
converts Chinese drafts into Traditional Chinese for `zh-TW`.

The pinned model is [M2M100 418M](https://huggingface.co/facebook/m2m100_418M),
revision `55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636`, published under MIT. It
supports 100 languages, but does not support Telugu. The original 1.94 GB weights
are downloaded from the publisher and verified by SHA-256 before local int8
conversion. [CTranslate2's official M2M100 example](https://opennmt.net/CTranslate2/guides/transformers.html#m2m-100)
documents the inference method.

## Bounded MADLAD trial

`prepare-madlad.py` downloads the Apache-2.0
[Nextcloud CT2 int8 conversion](https://huggingface.co/Nextcloud-AI/madlad400-3b-mt-ct2-int8)
of [Google MADLAD-400 3B](https://huggingface.co/google/madlad400-3b-mt), pinned to
`aa32bbdeba7880eff2096ec044cb155a340a9400`. The 2.95 GB weights and large tokenizer
artifacts are checksum-verified; no model repository code is executed. This
conversion is third-party maintained, not a Google release artifact.

`madlad-prototype.py` translates 20 real allowlisted public source messages into
Spanish, French, Hindi, Japanese, and Telugu. It compares raw output with
protected/hinted output without reviewed overrides, so curated controls cannot
hide model errors. Its report stays under ignored `output/localization-tools`.
This trial alone does not establish quality in all supported languages.

The bounded download trial was stopped on 2026-09-11 at 18:09:15
America/Los_Angeles, after 884.8 seconds, before its first 15-minute timeout and
automatic retry. Only **1,505,239,040 of 2,950,208,329 bytes** had arrived. The
incomplete artifact remains at
`output/localization-tools/madlad-int8/model.bin.part` for an explicitly resumed
trial. Tokenizer files were verified and all 52 unique target-language tokens
exist, including Telugu; the two Chinese catalogs share a target token. Full
weights were not verified or loaded. **No MADLAD inference, translation-quality
result, or full-generation throughput was measured.** The trial is inconclusive.

The four rejected M2M100 catalog drafts were moved out of `public/locales` to
ignored `output/localization-tools/rejected-catalogs/`, with checksums verified
after the move. They are recoverable, but must not be published. The original
reviewed application dictionaries were not removed.

## Source syntax and editorial priority

`translation-policy.py` audits exact-source entries that are program syntax, not
natural-language messages. The current 4,461-entry source contains 35 such entries:
10 HTTP expressions, 8 SQL expressions, 8 CSS tokens, 4 confirmation tokens,
3 shell commands, and 2 XML documents. The generated audit report stays at
`output/localization-tools/source-preservation-report.json`. Integration of this
policy into a release-quality translation provider remains pending.

Run `python scripts/localization/test-translation-policy.py` for its focused
tests. They ensure ordinary actions such as Delete, Update, and Create table, and
natural-language consent and safety messages are not mistaken for code.
`apply-overrides.mjs` applies generic controls, curated safety controls, then the
original reviewed dictionaries in increasing priority. An override must preserve
all source placeholders.

## Unsuccessful public-copy experiment

A separate, optional build-time prototype attempted to translate only authored
public interface copy through a no-key public endpoint. It never read workspace
records, credentials, or environment files, and was never a runtime dependency.
The endpoint returned HTTP 429 during its bounded prototype; no generated
catalogs were obtained. It remains stopped, with no change of endpoint or identity
to bypass the limit. Its source is archived only in ignored
`output/localization-tools/experiments/`, not supplied as a supported command.
A supported translation provider or reviewed contributed catalogs are still
needed for a releasable language expansion.
