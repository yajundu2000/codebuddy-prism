/**
 * Gitee as a remote provider, end to end over the routes: PAT connect (token
 * only — one canonical host), import, push/pull/conflict, branches and a pull
 * request, publish (`link`) under the user (organisations refused before the
 * network), page walking past one page and past the page cap, the
 * token-invalid path and the REMOTE_PROVIDERS allowlist.
 *
 * One bare repo stands in for the host (https_url is `file://<bare>`); the
 * `node:http` mock from ./mock-gitee-api.mjs answers the REST calls behind
 * GITEE_API_BASE, which must be set before the routes are imported.
 */
import { check } from './assert.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import { execSync } from 'node:child_process';
import { startGiteeMock, refs, show } from './mock-gitee-api.mjs';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aldine-ge-'));
process.env.DATA_DIR = path.join(tmp, 'data'); process.env.META_DIR = path.join(tmp, 'secrets');
delete process.env.REMOTE_PROVIDERS;

function seedBare(name, content) {
  const bare = path.join(tmp, `${name}.git`); execSync(`git init -q --bare -b main "${bare}"`);
  const seed = path.join(tmp, `${name}-seed`); execSync(`git clone -q "${bare}" "${seed}" 2>/dev/null`);
  fs.writeFileSync(path.join(seed, 'main.tex'), content);
  fs.writeFileSync(path.join(seed, 'README.md'), `# ${name}\n`);
  execSync(`cd "${seed}" && git add -A && git -c user.email=a@b.c -c user.name=t commit -q -m init && git push -q origin main`);
  return { bare, seed };
}
const ge = seedBare('paper', '\\documentclass{article}\\begin{document}From Gitee\\end{document}\n');

const mock = await startGiteeMock({ tmp });
mock.addRepo('tester/paper', ge.bare);
mock.revoked.add('bad');
process.env.GITEE_API_BASE = mock.url;

const { initDb } = await import('../src/db/index.ts'); await initDb();
const Fastify = (await import('fastify')).default;
const { registerRoutes } = await import('../src/routes.ts');
const store = await import('../src/store.ts');
const remotes = await import('../src/remotes.ts');
const app = Fastify(); await registerRoutes(app);
const J = (r) => { try { return JSON.parse(r.body); } catch { return r.body; } };
const projectDir = (id) => path.join(process.env.DATA_DIR, 'projects', id);

// ---------- account level ----------
let r = await app.inject({url: '/api/remotes'});
const listed = J(r);
check(r.statusCode === 200 && listed.map((p) => p.id).sort().join() === 'gitee,github,gitlab', 'all three providers listed: ' + r.body);
const gitee = listed.find((p) => p.id === 'gitee');
check(gitee.label === 'Gitee' && gitee.changeRequestLabel === 'pull request', 'gitee label and noun: ' + JSON.stringify(gitee));
check(gitee.selfHosted === false && !gitee.baseUrlRequired && gitee.oauth === false, 'gitee is a canonical host with no OAuth: ' + JSON.stringify(gitee));
check(listed.find((p) => p.id === 'gitlab').baseUrlRequired === false && listed.find((p) => p.id === 'github').baseUrlRequired === false, 'no provider requires a URL');

r = await app.inject({url: '/api/remotes/gitee/status'});
check(r.statusCode === 200 && J(r).connected === false && J(r).selfHosted === false, 'gitee not connected yet: ' + r.body);
r = await app.inject({url: '/api/remotes/gitee/oauth'});
check(r.statusCode === 404, 'no OAuth start for gitee (got ' + r.statusCode + ')');

r = await app.inject({method: 'POST', url: '/api/remotes/gitee/connect', payload: {token: ''}});
check(r.statusCode === 400 && /A Gitee token is required/.test(J(r).error), 'empty token → 400: ' + r.body);
r = await app.inject({method: 'POST', url: '/api/remotes/gitee/connect', payload: {token: 'good', baseUrl: 'https://gitee.com'}});
check(r.statusCode === 400 && /has no configurable URL/.test(J(r).error), 'a baseUrl is refused — there is nothing to configure: ' + r.body);
r = await app.inject({method: 'POST', url: '/api/remotes/gitee/connect', payload: {token: 'bad'}});
check(r.statusCode === 400 && /rejected by Gitee/.test(J(r).error) && /default scopes \(user_info, projects, pull_requests\)/.test(J(r).error), 'bad token → 400 naming the scopes: ' + r.body);
r = await app.inject({url: '/api/remotes/gitee/status'});
check(J(r).connected === false, 'a rejected token stores no connection');

r = await app.inject({method: 'POST', url: '/api/remotes/gitee/connect', payload: {token: 'good'}});
check(r.statusCode === 200 && J(r).login === 'tester' && J(r).baseUrl === undefined, 'PAT connect, no baseUrl to store: ' + r.body);
r = await app.inject({url: '/api/remotes/gitee/status'});
check(J(r).connected === true && J(r).login === 'tester', 'status shows the connection: ' + r.body);
check(mock.recorded.requests.includes('GET /user?access_token=…'), 'whoami hit GET /user with the token in the query: ' + mock.recorded.requests[0]);

r = await app.inject({url: '/api/remotes/gitee/repos'});
check(r.statusCode === 200 && Array.isArray(J(r)) && J(r).length === 1 && J(r)[0].fullName === 'tester/paper', 'repos list: ' + r.body);
check(J(r)[0].owner === 'tester' && J(r)[0].name === 'paper' && J(r)[0].private === true && J(r)[0].defaultBranch === 'main' && J(r)[0].cloneUrl === `file://${ge.bare}`, 'repo mapped from the v5 shape — the slug, not the display name: ' + r.body);

// ---------- page walk: a short page ends the list, a full page walks on, the cap errors ----------
mock.addRepo('tester/older', ge.bare, { updatedAt: '2025-01-01T00:00:00Z' });
mock.addRepo('research/shared', ge.bare, { updatedAt: '2026-03-03T00:00:00Z' });
r = await app.inject({url: '/api/remotes/gitee/repos'});
check(r.statusCode === 200 && J(r).length === 3, 'three repos, one short page: ' + r.body);
check(J(r).map((x) => x.fullName).join() === 'research/shared,tester/paper,tester/older', 'most recently updated first: ' + J(r).map((x) => x.fullName).join());

// past one page: 203 repos share one bare (listing is all they are for)
for (let i = 0; i < 200; i++) mock.addRepo(`tester/filler-${String(i).padStart(3, '0')}`, ge.bare, { updatedAt: `2024-01-01T00:00:${String(i % 60).padStart(2, '0')}Z` });
mock.recorded.requests.length = 0;
r = await app.inject({url: '/api/remotes/gitee/repos'});
check(r.statusCode === 200 && J(r).length === 203, 'all 203 repos across three pages: ' + J(r).length);
let pages = mock.recorded.requests.filter((x) => x.startsWith('GET /user/repos'));
check(pages.length === 3 && pages[0] === 'GET /user/repos?type=all&sort=updated&page=1&per_page=100&access_token=…' && pages[2] === 'GET /user/repos?type=all&sort=updated&page=3&per_page=100&access_token=…', 'the short third page ends the walk: ' + pages.join(' | '));
for (let i = 0; i < 200; i++) mock.repos.delete(`tester/filler-${String(i).padStart(3, '0')}`);
// a host that never returns a short page is an error, never a list that looks complete
mock.flags.neverEnds = true;
mock.recorded.requests.length = 0;
r = await app.inject({url: '/api/remotes/gitee/repos'});
check(r.statusCode === 502 && /more than 4000 entries/.test(J(r).error), 'past the page cap → 502 naming the count: ' + r.body);
pages = mock.recorded.requests.filter((x) => x.startsWith('GET /user/repos'));
check(pages.length === 40 && pages.at(-1).includes('page=40'), 'the walk asked all 40 pages before giving up: ' + pages.length);
mock.flags.neverEnds = false;

// ---------- import ----------
r = await app.inject({method: 'POST', url: '/api/remotes/gitee/import', payload: {fullName: 'nope'}});
check(r.statusCode === 400 && /owner\/repo/.test(J(r).error), 'import without a slash → 400 asking for owner/repo: ' + r.body);
r = await app.inject({method: 'POST', url: '/api/remotes/gitee/import', payload: {fullName: 'tester/missing'}});
check(r.statusCode === 400 && /not found/.test(J(r).error), 'import of an unknown repo → 400: ' + r.body);
r = await app.inject({method: 'POST', url: '/api/remotes/gitee/import', payload: {fullName: 'a/b/c'}});
check(r.statusCode === 400 && /owner\/repo/.test(J(r).error), 'a three-segment path never reaches the network: ' + r.body);

r = await app.inject({method: 'POST', url: '/api/remotes/gitee/import', payload: {fullName: 'tester/paper'}});
check(r.statusCode === 200, 'import status ' + r.body);
const pid = J(r).id; check(pid, 'got project id');
check(J(r).remote?.provider === 'gitee' && J(r).remote?.fullName === 'tester/paper', 'summary carries the gitee link: ' + r.body);
check(J(r).remote?.owner === 'tester' && J(r).remote?.repo === 'paper' && J(r).remote?.remoteBranch === 'main', 'link fields: ' + JSON.stringify(J(r).remote));
check(J(r).remote?.baseUrl === undefined, 'a canonical-host link records no instance: ' + JSON.stringify(J(r).remote));
check(!('github' in J(r)) || J(r).github == null, 'no legacy github field for a gitee link: ' + r.body);
check(fs.readFileSync(path.join(projectDir(pid), 'main.tex'), 'utf8').includes('From Gitee'), 'imported the repository content');
check((await store.readMeta(pid)).remote?.provider === 'gitee', 'stored meta names the provider');

// ---------- push / pull / conflict ----------
fs.writeFileSync(path.join(projectDir(pid), 'main.tex'), '\\documentclass{article}\\begin{document}EDITED IN ALDINE\\end{document}\n');
r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/push`});
check(r.statusCode === 200, 'push status ' + r.body);
check(show(ge.bare, 'main:main.tex').includes('EDITED IN ALDINE'), 'push reached the bare repo');

execSync(`cd "${ge.seed}" && git pull -q && printf 'EXTERNAL\\n' >> main.tex && git -c user.email=a@b.c -c user.name=t commit -qam ext && git push -q`);
r = await app.inject({url: `/api/projects/${pid}/remote/status`});
check(r.statusCode === 200 && J(r).linked === true && J(r).provider === 'gitee' && J(r).behind === 1, 'behind 1 after external push: ' + r.body);
r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/pull`});
check(r.statusCode === 200, 'pull ok ' + r.body);
check(fs.readFileSync(path.join(projectDir(pid), 'main.tex'), 'utf8').includes('EXTERNAL'), 'pulled external change');

execSync(`cd "${ge.seed}" && git pull -q && printf 'REMOTE VERSION\\n' > main.tex && git -c user.email=a@b.c -c user.name=t commit -qam remoteedit && git push -q`);
fs.writeFileSync(path.join(projectDir(pid), 'main.tex'), 'LOCAL VERSION\n');
r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/pull`});
check(r.statusCode === 409 && Array.isArray(J(r).conflicts) && J(r).conflicts.includes('main.tex'), 'pull conflicts with 409 listing main.tex: ' + r.body);
r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/reset-to-remote`});
check(r.statusCode === 200 && fs.readFileSync(path.join(projectDir(pid), 'main.tex'), 'utf8').trim() === 'REMOTE VERSION', 'reset-to-remote took the remote version');

// ---------- branches + pull request ----------
r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/change-request`, payload: {title: 'Too early'}});
check(r.statusCode === 400 && /default branch/.test(J(r).error), 'PR from the default branch → 400: ' + r.body);

r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/create-branch`, payload: {name: 'feature-y'}});
check(r.statusCode === 200 && J(r).branch === 'feature-y', 'create-branch ' + r.body);
check(refs(ge.bare).includes('feature-y'), 'bare repo has feature-y');
r = await app.inject({url: `/api/projects/${pid}/remote/branches`});
check(J(r).current === 'feature-y' && J(r).default === 'main' && J(r).branches.includes('main') && J(r).branches.includes('feature-y'), 'branches list + current: ' + r.body);

r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/change-request`, payload: {title: 'My PR'}});
check(r.statusCode === 200 && J(r).number === 1 && J(r).url === 'https://gitee.com/tester/paper/pulls/1', 'PR opened: ' + r.body);
const pull = mock.recorded.pulls.at(-1);
check(pull?.head === 'feature-y' && pull?.base === 'main' && pull?.title === 'My PR' && pull?.body === '', 'PR body uses the v5 field names: ' + JSON.stringify(pull));

r = await app.inject({method: 'POST', url: `/api/projects/${pid}/remote/switch-branch`, payload: {branch: 'main'}});
check(r.statusCode === 200 && J(r).branch === 'main', 'switch back to main ' + r.body);

// ---------- publish under the user; organisations are refused ----------
r = await app.inject({method: 'POST', url: '/api/projects', payload: {name: 'New Paper'}});
const fresh = J(r).id;
check((r.statusCode === 200 || r.statusCode === 201) && J(r).remote === null, 'fresh project has no link: ' + r.body);
r = await app.inject({method: 'POST', url: `/api/projects/${fresh}/remote/link`, payload: {provider: 'gitee', name: 'New Paper'}});
check(r.statusCode === 200 && J(r).ok === true, 'link → ' + r.body);
check(J(r).remote?.provider === 'gitee' && J(r).remote?.fullName === 'tester/New-Paper' && J(r).remote?.owner === 'tester', 'link response: ' + r.body);
const created = mock.recorded.created.at(-1);
check(created?.owner === 'tester' && created?.name === 'New-Paper' && created?.private === true && created?.auto_init === false, 'POST /user/repos body: ' + JSON.stringify(created));
const bare = mock.repos.get('tester/New-Paper').bare;
check(refs(bare).includes('main') && show(bare, 'main:main.tex').includes('documentclass'), 'first push landed in the created repo');
r = await app.inject({method: 'POST', url: `/api/projects/${fresh}/remote/link`, payload: {provider: 'gitee', name: 'Again'}});
check(r.statusCode === 400 && /already linked/.test(J(r).error), 'link twice → 400: ' + r.body);
r = await app.inject({url: `/api/projects/${fresh}/remote/status`});
check(r.statusCode === 200 && J(r).provider === 'gitee' && J(r).ahead === 0 && J(r).behind === 0, 'published project in sync: ' + r.body);

r = await app.inject({method: 'POST', url: '/api/projects', payload: {name: 'Org Paper'}});
const orgProject = J(r).id;
r = await app.inject({method: 'POST', url: `/api/projects/${orgProject}/remote/link`, payload: {provider: 'gitee', name: 'org-paper', namespace: 'research'}});
check(r.statusCode === 400 && /Could not create the repository/.test(J(r).error) && /organisation or enterprise/.test(J(r).error), 'a namespace is refused before the network: ' + r.body);
check(!mock.recorded.requests.some((x) => x.startsWith('POST /enterprises')), 'no enterprise route was ever hit');
r = await app.inject({url: '/api/remotes/gitee/repos'});
check(J(r).some((p) => p.fullName === 'tester/New-Paper'), 'created repos are listed');

// ---------- disconnect, revoked token ----------
r = await app.inject({method: 'POST', url: '/api/remotes/gitee/disconnect'});
check(r.statusCode === 200 && J(r).ok === true, 'disconnect');
r = await app.inject({url: '/api/remotes/gitee/status'});
check(J(r).connected === false, 'disconnected');
r = await app.inject({url: `/api/projects/${pid}/remote/status`});
check(r.statusCode === 400 && /^Connect Gitee to sync/.test(J(r).error), 'sync without a connection → 400, no instance to name: ' + r.body);

r = await app.inject({method: 'POST', url: '/api/remotes/gitee/connect', payload: {token: 'later-revoked'}});
check(r.statusCode === 200, 'reconnect ' + r.body);
mock.revoked.add('later-revoked');
r = await app.inject({url: '/api/remotes/gitee/repos'});
check(r.statusCode === 401 && J(r).reason === 'token-invalid' && /Gitee rejected/.test(J(r).error), 'revoked token → 401 token-invalid: ' + r.body);
r = await app.inject({url: `/api/projects/${pid}/remote/branches`});
check(r.statusCode === 401 && J(r).reason === 'token-invalid', 'branches with a revoked token → 401 token-invalid: ' + r.body);

// ---------- allowlist: a disabled provider is unknown to the routes ----------
process.env.REMOTE_PROVIDERS = 'github,gitlab';
r = await app.inject({url: '/api/remotes'});
check(J(r).map((p) => p.id).join() === 'github,gitlab', 'REMOTE_PROVIDERS=github,gitlab hides gitee: ' + r.body);
r = await app.inject({url: '/api/remotes/gitee/status'});
check(r.statusCode === 404, 'disabled provider → 404');
r = await app.inject({url: `/api/projects/${pid}/remote/status`});
check(r.statusCode === 400 && /disabled/.test(J(r).error), 'a project linked to a disabled provider says so: ' + r.body);
process.env.REMOTE_PROVIDERS = 'gitee';
r = await app.inject({url: '/api/remotes'});
check(J(r).length === 1 && J(r)[0].id === 'gitee', 'REMOTE_PROVIDERS=gitee lists only gitee: ' + r.body);
delete process.env.REMOTE_PROVIDERS;

await mock.close(); await app.close(); fs.rmSync(tmp, { recursive: true, force: true });
console.log('Gitee integration (connect→import→push→pull→conflict→branches→PR→link→pages→revoked→allowlist): ALL PASSED');
