import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const sources = new Map();
function add(text, file, explicit = false) {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!/[a-zA-Z]/.test(clean) || clean.length > 4000) return;
  if (!explicit && /^(?:https?:|\/|@\/|\.|[A-Z_]+\s*=)/.test(clean)) return;
  if (!explicit && /^(?:You are the|You are a |Return (?:a |only )?(?:JSON|valid)|Output only|Use only the supplied)/i.test(clean)) return;
  if (!explicit && (/^(?:SELECT\s[\s\S]*\bFROM\b|INSERT\s+INTO\b|UPDATE\s+\w+\s+SET\b|DELETE\s+FROM\b|CREATE\s+(?:TABLE|INDEX|TRIGGER)\b|ALTER\s+TABLE\b|DROP\s+(?:TABLE|INDEX|TRIGGER)\b|PRAGMA\s)/i.test(clean) || /(?:=>|\bconst\b|className=)/.test(clean))) return;
  if (!explicit && (clean.length < 2 || (!/\s/.test(clean) && !/^[A-Z][a-zA-Z]+$/.test(clean)))) return;
  if (!sources.has(clean)) sources.set(clean, new Set());
  sources.get(clean).add(file);
}
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? walk(path.join(dir, entry.name)) : /\.(tsx?|mjs)$/.test(entry.name) ? [path.join(dir, entry.name)] : []);
}
for (const file of [...walk('app'), ...walk('lib'), ...walk('server')]) {
  if (/i18n|localized-text|api[\\/]auth|server[\\/]seed\.ts/.test(file)) continue;
  const ast = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) {
    if (ts.isJsxText(node)) add(ts.decodeEntities?.(node.text) ?? node.text, file);
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === 'text' && node.initializer && ts.isStringLiteral(node.initializer)) add(node.initializer.text, file, true);
    if (ts.isCallExpression(node) && /^(?:text|translate)$/.test(node.expression.getText(ast)) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) add(node.arguments[0].text, file, true);
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && !ts.isImportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent)) add(node.text, file);
    if (ts.isTemplateExpression(node)) add(node.head.text + node.templateSpans.map((span, i) => `{${i}}${span.literal.text}`).join(''), file);
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const i18nFile = fs.readFileSync('lib/i18n.ts', 'utf8');
const ast = ts.createSourceFile('i18n.ts', i18nFile, ts.ScriptTarget.Latest, true);
function english(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'english') {
    function collect(n) { if (ts.isPropertyAssignment(n) && ts.isStringLiteral(n.initializer)) add(n.initializer.text, 'lib/i18n.ts'); ts.forEachChild(n, collect); }
    collect(node.initializer);
  } else ts.forEachChild(node, english);
}
english(ast);
// Preserve the existing reviewed translations for navigation and the homepage.
const definitions = {};
for (const statement of ast.statements) if (ts.isVariableStatement(statement)) {
  for (const declaration of statement.declarationList.declarations) {
    let initializer = declaration.initializer;
    while (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))) initializer = initializer.expression;
    if (!initializer || !ts.isObjectLiteralExpression(initializer)) continue;
    definitions[declaration.name.getText(ast)] = Object.fromEntries(initializer.properties.filter((property) => ts.isPropertyAssignment(property) && ts.isStringLiteral(property.initializer)).map((property) => [property.name.text, property.initializer.text]));
  }
}
const overrides = Object.fromEntries(Object.entries({ 'es-ES':'spanish', 'fr-FR':'french', 'pt-BR':'portuguese', 'de-DE':'german', 'ar-SA':'arabic' }).map(([locale,name]) => [locale,Object.fromEntries(Object.entries(definitions[name]).filter(([key]) => definitions.english[key]).map(([key,value]) => [definitions.english[key],value]))]));
// UI title-casing of machine statuses is presentation only; persisted values stay unchanged.
for (const word of ['active','inactive','archived','open','closed','pending','completed','converted','qualified','exploring','proposal','negotiation','won','lost','draft','sent','partial','paid','overdue','void','resolved','new','medium','high','low','urgent','personal','business','enterprise','enabled','disabled','paused','available','authorized','rejected','approved','cancelled','succeeded','failed','simulator','read','write','connected','disconnected','preview','blocked','healthy','attention','stale','unknown','none','all','clean','demo','assisted','supervised','autonomous','owner','admin','member','viewer','running','queued','revoked','expired','waiting','note','manual','record.created','record.updated','lead.qualified','invoice.issued','task.completed']) {
  add(word.replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), 'lib/crm-platform.ts');
  add(word, 'lib/crm-platform.ts', true);
}
const sorted = Object.fromEntries([...sources].sort(([a], [b]) => a.localeCompare(b)).map(([key, files]) => [key, [...files].sort()]));
const messages = Object.fromEntries(Object.keys(sorted).map((key) => [key, key]));
const sourcePath = path.join(root, 'locales/source.json');
if (process.argv.includes('--write-source')) {
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, JSON.stringify(messages, null, 2) + '\n');
}
if (process.argv.includes('--check-source')) {
  const previous = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
  const missing = Object.keys(messages).filter((key) => !Object.hasOwn(previous, key));
  const removed = Object.keys(previous).filter((key) => !Object.hasOwn(messages, key));
  if (missing.length || removed.length) {
    console.error(JSON.stringify({ error: 'Source catalog is stale. Run npm run i18n:extract, translate additions, then npm run i18n:check.', missing: missing.slice(0, 10), removed: removed.slice(0, 10) }));
    process.exit(1);
  }
  process.exit(0);
}
fs.mkdirSync(path.join(root, 'output/localization'), { recursive: true });
fs.writeFileSync(path.join(root, 'output/localization/source-index.json'), JSON.stringify(sorted, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'output/localization/en-US.json'), JSON.stringify(messages, null, 2) + '\n');
fs.writeFileSync(path.join(root, 'output/localization/reviewed-overrides.json'), JSON.stringify(overrides, null, 2) + '\n');
console.log(JSON.stringify({ messages: sources.size, words: [...sources.keys()].join(' ').split(/\s+/).length, index: 'output/localization/source-index.json' }));
