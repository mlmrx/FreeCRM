# Language support

> Development status: platform-wide selection and persistence are implemented,
> but the 53 non-English catalogs are not release-ready. Earlier generated
> drafts failed quality review and were removed from publishable assets.
> `npm run i18n:check` intentionally blocks release until complete catalogs
> are supplied and reviewed. The behavior below describes the implementation
> and intended release, not a claim that all 54 choices are currently usable.

Choose **Language** on any screen, then search by the language's English or
native name. The same choice follows you through the public pages, tour,
presentation, setup guides, CRM, second brain, and Today.

## Target languages

The language registry includes 54 choices:

- English, Spanish, French, Portuguese, German, Italian, Dutch, Swedish,
  Danish, Norwegian Bokmål, Finnish, Polish, Czech, Romanian, Hungarian,
  Greek, Turkish, Russian, and Ukrainian.
- Arabic, Hebrew, Persian, and Urdu, with right-to-left page direction.
- Hindi, Bengali, Punjabi (Gurmukhi), Marathi, Gujarati, Tamil, Telugu,
  Kannada, Malayalam, Nepali, and Sinhala.
- Simplified Chinese, Traditional Chinese, Japanese, Korean, Vietnamese,
  Thai, Indonesian, Malay, Filipino, Burmese, Khmer, Lao, Javanese, and
  Sundanese.
- Swahili, Amharic, Hausa, Yoruba, Zulu, and Igbo.

Regional browser preferences are matched to the closest supported choice.
For example, Spanish regional variants share the Spanish catalog; Chinese
script preferences distinguish Simplified and Traditional Chinese.

## What is remembered

An explicit choice is stored in this browser, with a first-party cookie as a
fallback when local storage is unavailable. It lasts across full page changes,
reloads, and other tabs on the same installation. Different domains and devices
have separate browser preferences.

In the CRM header or settings, choosing a language also saves the workspace
default. A previously selected browser language is never replaced by that
default. A failed workspace save does not undo your browser choice. If the
browser blocks both storage methods, the choice lasts for the current page
session; permanent browser persistence cannot be guaranteed in that mode.

Only the chosen language file is downloaded, from the same installation.
There is no translation API, cloud key, account, or model needed at runtime.
An unsuccessful download keeps the current language and offers a retry.

## Translation quality and boundaries

Planned catalogs are machine-assisted interface translations, not certified or
fully native-reviewed translations. Existing reviewed homepage and navigation
copy remains in the source. Broader catalogs require quality review before
publication, especially consent, approval, emergency-stop, and setup wording.
Technical commands, environment variables, URLs, provider names, and permission
scopes remain exact. Technical setup wording is retained in English when a
draft cannot preserve its protected content reliably.

Language selection changes presentation only. It does not translate customer
names, notes, documents, saved conversations, imported text, or vendor release
descriptions. It does not change stored statuses, command names, policy checks,
receipts, or the exact `RESET`, `REVOKE`, and `FORGET` confirmation tokens.
Dates, counts, and money use locale-aware formatters where presented; currency
selection and timezone behavior are unchanged.

This release does not expand the existing English-pattern promise detection
and goal-matching heuristics. Optional AI model language capabilities depend
on the model you configure. Interface translation is not a claim of equal
analysis quality in every language. Search over private records continues to
search the original text; public tour and feature search also match translated
labels.

Page metadata, the standalone offline fallback, and the RSS feed remain in
their original editorial language.

## Improving copy

Catalogs live in `public/locales/<locale>.json`. Keys are the English source
messages; values are the translations. Keep every `{placeholder}`, technical
token, and URL intact. Correct a translation directly and submit a pull
request explaining the language and screen you reviewed.

For new interface text, use `T` for rendered content or `useI18n().text()` for
string-valued attributes and messages. Translate only known product copy.
Pass record names or counts as interpolation values, never as translation
keys. Keep explicit `value` attributes on select options so translated labels
cannot become stored machine values.

Run `npm run i18n:extract` after changing source copy, update each language's
catalog, and run `npm run i18n:check`. The check detects stale source keys,
missing/empty entries, changed placeholders, and copied-English catalogs.
It runs in the normal release check. It cannot certify linguistic quality.

Optional local generation tools and model provenance are documented in
[`scripts/localization/README.md`](../scripts/localization/README.md). Models,
caches, test workspaces, and generation reports are not application dependencies
and are not deployed.
