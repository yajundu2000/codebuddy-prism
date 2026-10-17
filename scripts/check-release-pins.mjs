#!/usr/bin/env node
// Every place that names the release version must agree, because none of them
// is generated from another:
//   - package.json "version" at the root and in both workspaces
// This fork ships no prebuilt app images: docker-compose.yml builds the app
// from source and pulls the UNMODIFIED upstream compiler under its own
// variable (ALDINE_COMPILER_VERSION), so there is no self-pin that could
// drift. The second half of the gate is therefore inverted — it fails if
// anyone reintroduces a ${ALDINE_VERSION:-…} self-image pin into the compose
// file or the README's quick start.
// With --tag vX.Y.Z (the release preflight) the tag must match too, and the
// CHANGELOG must already carry a "## [X.Y.Z]" heading.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');
const version = (p) => JSON.parse(read(p)).version;

const tagArg = process.argv.indexOf('--tag');
const tag = tagArg >= 0 ? process.argv[tagArg + 1] : process.env.RELEASE_TAG;

const found = [];
found.push(['package.json', version('package.json')]);
found.push(['apps/server/package.json', version('apps/server/package.json')]);
found.push(['apps/web/package.json', version('apps/web/package.json')]);

const problems = [];
const expected = found[0][1];
for (const [where, v] of found.slice(1)) if (v !== expected) problems.push(`${where}: ${v} (expected ${expected})`);

// No self-image pins: the app is built from source, the compiler is upstream's.
for (const file of ['docker-compose.yml', 'README.md']) {
  const text = read(file);
  const stale = text.match(/\$\{ALDINE_VERSION:-[^}]*\}/g);
  if (stale) problems.push(`${file}: reintroduces a self-image pin (${stale[0]}) — the app builds from source, the compiler pins ALDINE_COMPILER_VERSION`);
}
if (!/ALDINE_COMPILER_VERSION:-\d/.test(read('docker-compose.yml'))) {
  problems.push('docker-compose.yml: compiler image lost its ALDINE_COMPILER_VERSION pin');
}

if (tag) {
  const m = /^v(\d+\.\d+\.\d+)$/.exec(tag);
  if (!m) problems.push(`tag ${tag}: not of the form vX.Y.Z`);
  else if (m[1] !== expected) problems.push(`tag ${tag}: version differs`);
  if (m && !read('CHANGELOG.md').includes(`## [${m[1]}]`)) problems.push(`CHANGELOG.md: no "## [${m[1]}]" heading`);
}

if (problems.length) {
  console.error('check-release-pins:');
  for (const p of problems) console.error(`  - ${p}`);
  console.error('Fix: npm pkg set version=X.Y.Z --workspaces --include-workspace-root; keep compose building the app from source.');
  process.exit(1);
}
console.log(`check-release-pins: all ${found.length} package versions say ${expected}${tag ? `, tag ${tag} matches` : ''}; no self-image pins`);
