import { readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const directory = process.argv[2] ?? 'public/locales';
const overridePaths = process.argv.slice(3);
if (!overridePaths.length) overridePaths.push('scripts/localization/overrides.json', 'scripts/localization/curated-controls.json', 'output/localization/reviewed-overrides.json');
const overrides = {};
for (const file of overridePaths) {
  let content;
  try { content = await readFile(file, 'utf8'); } catch (error) {
    if (error.code === 'ENOENT' && file === 'scripts/localization/curated-controls.json') continue;
    throw error;
  }
  const source = JSON.parse(content);
  for (const [locale, messages] of Object.entries(source)) {
    overrides[locale] = { ...overrides[locale], ...messages };
  }
}
const placeholders = (value) => [...value.matchAll(/\{\{?[^{}]+\}\}?/g)].map((match) => match[0]).sort().join('|');
for (const file of await readdir(directory)) {
  if (!file.endsWith('.json')) continue;
  const locale = file.slice(0, -5);
  if (!overrides[locale]) continue;
  const target = path.join(directory, file);
  const catalog = JSON.parse(await readFile(target, 'utf8'));
  let changed = 0;
  for (const [source, translation] of Object.entries(overrides[locale])) {
    if (!(source in catalog)) continue;
    if (!translation.trim() || placeholders(source) !== placeholders(translation)) {
      throw new Error(`Invalid override ${locale}: ${source}`);
    }
    if (catalog[source] !== translation) {
      catalog[source] = translation;
      changed++;
    }
  }
  if (changed) {
    await writeFile(`${target}.tmp`, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
    await rename(`${target}.tmp`, target);
  }
  console.log(`${locale}: ${changed} editorial overrides applied`);
}
