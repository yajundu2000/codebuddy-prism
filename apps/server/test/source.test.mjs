/**
 * The AGPL §13 source-bundle route: 200 with the packed tarball when the
 * build shipped one, 404 in a dev checkout (the About dialog then still
 * links here; the offer is a deployment concern, not a dev one).
 */
import { check } from './assert.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aldine-source-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.META_DIR = path.join(tmp, 'secrets');

const Fastify = (await import('fastify')).default;
const { registerRoutes } = await import('../src/routes.ts');
const app = Fastify();
await registerRoutes(app);

// a dev checkout has no bundle
let r = await app.inject({ url: '/source-code.tar.gz' });
check(r.statusCode === 404, 'no bundle in the tree → 404: ' + r.statusCode);

// a packed build serves it from the image root
const fake = path.join(process.cwd(), 'source-code.tar.gz');
fs.writeFileSync(fake, 'not-really-gzip');
try {
  const app2 = Fastify(); await registerRoutes(app2);
  r = await app2.inject({ url: '/source-code.tar.gz' });
  check(r.statusCode === 200 && r.headers['content-type'] === 'application/gzip' && r.body === 'not-really-gzip', 'packed bundle → 200 gz: ' + r.statusCode);
  await app2.close();
} finally { fs.rmSync(fake, { force: true }); }

await app.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log('source route: all assertions passed');
