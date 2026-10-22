import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

execFileSync(process.execPath, ['scripts/localization/catalog.mjs', '--check-source'], { stdio: 'inherit' });
const source = JSON.parse(fs.readFileSync('locales/source.json', 'utf8'));
const locales = [...fs.readFileSync('lib/i18n.ts', 'utf8').matchAll(/\{ locale: '([^']+)'/g)].map((match) => match[1]);
const placeholders = (value) => (value.match(/\{\w+\}/g) ?? []).sort().join('|');
const failures = [];
const reports = [];
for (const locale of locales.filter((locale) => locale !== 'en-US')) {
  const file = `public/locales/${locale}.json`;
  if (!fs.existsSync(file)) { failures.push(`${locale}: missing catalog`); continue; }
  const translated = JSON.parse(fs.readFileSync(file, 'utf8'));
  let changed = 0;
  for (const [key, english] of Object.entries(source)) {
    const value = translated[key];
    if (typeof value !== 'string' || !value.trim()) failures.push(`${locale}: missing/empty ${key}`);
    else if (placeholders(value) !== placeholders(english)) failures.push(`${locale}: changed placeholders in ${key}`);
    else if (value !== english) changed++;
  }
  const extras = Object.keys(translated).filter((key) => !Object.hasOwn(source, key));
  if (extras.length) failures.push(`${locale}: ${extras.length} obsolete entries`);
  // A copied English file is not language support. Technical source text and
  // shared brand names may legitimately remain unchanged.
  if (changed < Object.keys(source).length * 0.75) failures.push(`${locale}: insufficient translated coverage`);
  reports.push({ locale, messages: Object.keys(translated).length, translated: changed });
}
if (failures.length) {
  console.error(JSON.stringify({ failures: failures.length, examples: failures.slice(0, 25) }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ languages: locales.length, sourceMessages: Object.keys(source).length, catalogs: reports }, null, 2));
