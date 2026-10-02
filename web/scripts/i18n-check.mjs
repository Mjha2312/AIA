#!/usr/bin/env node
/**
 * i18n:check — fails when a locale is missing a key that exists in en.json.
 *
 * Also fails when `messages/` and the `locales` registry in
 * `src/i18n/locales.ts` disagree, so a half-finished language cannot land.
 *
 * Adding a language: register the code in src/i18n/locales.ts, add the native
 * name in `localeNames`, and add messages/<code>.json.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const messagesDir = join(root, 'messages');
const referenceLocale = 'en';

/** @returns {Record<string, unknown>} */
function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** @returns {string[]} dot-separated leaf keys */
function flatten(value, prefix = '') {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) => flatten(child, prefix ? `${prefix}.${key}` : key));
}

function readRegisteredLocales() {
  const source = readFileSync(join(root, 'src', 'i18n', 'locales.ts'), 'utf8');
  const match = /export const locales = \[([^\]]+)\]/s.exec(source);
  if (!match?.[1]) {
    throw new Error('Could not parse `locales` from src/i18n/locales.ts');
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

const referencePath = join(messagesDir, `${referenceLocale}.json`);
if (!readdirSync(messagesDir).includes(`${referenceLocale}.json`)) {
  console.error(`i18n:check: missing reference file messages/${referenceLocale}.json`);
  process.exit(1);
}

const referenceKeys = new Set(flatten(readJson(referencePath)));
const registered = readRegisteredLocales();
const onDisk = readdirSync(messagesDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

const problems = [];

for (const locale of registered) {
  if (!onDisk.includes(locale)) {
    problems.push(`${locale}: registered in src/i18n/locales.ts but messages/${locale}.json is missing`);
  }
}
for (const locale of onDisk) {
  if (locale !== referenceLocale && !registered.includes(locale)) {
    problems.push(`${locale}: messages/${locale}.json exists but is not registered in src/i18n/locales.ts`);
  }
}

for (const locale of onDisk.filter((entry) => entry !== referenceLocale)) {
  const keys = new Set(flatten(readJson(join(messagesDir, `${locale}.json`))));
  const missing = [...referenceKeys].filter((key) => !keys.has(key));
  const extra = [...keys].filter((key) => !referenceKeys.has(key));
  for (const key of missing) {
    problems.push(`${locale}: missing key "${key}"`);
  }
  for (const key of extra) {
    problems.push(`${locale}: key "${key}" is not present in ${referenceLocale}.json`);
  }
}

if (problems.length > 0) {
  console.error(`i18n:check failed — ${problems.length} problem(s):`);
  for (const problem of problems) {
    console.error(`  - ${problem}`);
  }
  process.exit(1);
}

console.log(`i18n:check ok — ${registered.length} locales (${registered.join(', ')}), ${referenceKeys.size} keys each`);