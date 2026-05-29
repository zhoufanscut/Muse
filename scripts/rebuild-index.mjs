import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs';

const CHECK = process.argv.includes('--check');
const errors = [];
const seen = new Set();

function listIds(dir) {
  return readdirSync(`data/${dir}`)
    .filter(f => f.endsWith('.json') && !f.startsWith('_'))
    .map(f => f.replace(/\.json$/, ''))
    .sort();
}

function readJSON(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); }
  catch (e) { errors.push(`${path}: invalid JSON — ${e.message}`); return null; }
}

function need(obj, fields, where) {
  for (const f of fields) if (obj[f] == null) errors.push(`${where}: missing field "${f}"`);
}

function unique(key, where) {
  if (seen.has(key)) errors.push(`${where}: duplicate id`);
  seen.add(key);
}

for (const id of listIds('fonts')) {
  const path = `data/fonts/${id}.json`;
  const obj = readJSON(path); if (!obj) continue;
  unique(`font:${id}`, path);
  need(obj, ['id', 'name', 'stack'], path);
  if (obj.id !== id) errors.push(`${path}: id "${obj.id}" must match filename`);
}

for (const id of listIds('languages')) {
  const path = `data/languages/${id}.json`;
  const obj = readJSON(path); if (!obj) continue;
  unique(`lang:${id}`, path);
  need(obj, ['id', 'label', 'shikiLang', 'sample', 'summary'], path);
  if (obj.id !== id) errors.push(`${path}: id "${obj.id}" must match filename`);
  if (obj.sample && !existsSync(obj.sample)) {
    errors.push(`${path}: sample "${obj.sample}" not found`);
  }
}

for (const id of listIds('themes')) {
  const path = `data/themes/${id}.json`;
  const obj = readJSON(path); if (!obj) continue;
  unique(`theme:${id}`, path);
  if (!obj.colors && !obj.tokenColors && !obj.settings) {
    errors.push(`${path}: missing colors/tokenColors/settings — not a VSCode theme`);
  }
}

const builtin = readJSON('data/themes/_builtin.json');
if (!Array.isArray(builtin) || !builtin.every(s => typeof s === 'string')) {
  errors.push('data/themes/_builtin.json: must be an array of strings');
}

if (Array.isArray(builtin)) {
  for (const id of listIds('themes')) {
    if (builtin.includes(id)) {
      errors.push(`data/themes/${id}.json: filename collides with built-in theme name "${id}"`);
    }
  }
}

if (errors.length) {
  for (const e of errors) console.error('✗', e);
  process.exit(1);
}

if (!CHECK) {
  const index = {
    fonts: listIds('fonts'),
    themes: listIds('themes'),
    languages: listIds('languages'),
  };
  writeFileSync('data/_index.json', JSON.stringify(index, null, 2) + '\n');
  console.log('wrote data/_index.json');
}
