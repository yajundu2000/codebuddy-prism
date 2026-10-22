/**
 * In-process Gitee v5 mock for the gitee-sync suite. Repositories are backed
 * by real bare repositories under `tmp` (https_url `file://<bare>`) so pushes
 * land somewhere the tests can inspect with git.
 *
 * Shapes follow the live gitee.com/api/v5 responses (probed 2026-10).
 * Deviations the tests rely on are deliberate and small:
 *  - auth is the `access_token` query parameter on every route, Gitee's
 *    documented PAT form; an `Authorization` header is refused, so a
 *    regression to the GitHub/GitLab header shape fails loudly;
 *  - pagination honours the requested `per_page` exactly (clamped to Gitee's
 *    documented 100 max), because the provider ends its walk on a short page:
 *    a mock that shrank pages below the request would end the walk early and
 *    test nothing. `flags.neverEnds` instead answers every page exactly full,
 *    the host that never runs out, so the walk's page cap is what stops it;
 *  - `path` is the repo slug and `name` a display name, the way the live API
 *    separates them (a Chinese display name over an ASCII slug is normal);
 *  - `revoked` tokens answer 401 like an expired token.
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { execSync } from 'node:child_process';

const sh = (cmd) => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
export const refs = (bare) => sh(`git --git-dir="${bare}" for-each-ref --format='%(refname:short)' refs/heads`).trim().split('\n').filter(Boolean);
export const show = (bare, spec) => sh(`git --git-dir="${bare}" show ${spec}`);

export async function startGiteeMock({ tmp, login = 'tester' }) {
  const repos = new Map(); // full_name → record
  let nextId = 100;
  const userJson = (name) => ({ id: name === login ? 7 : 8, login: name, name: name === login ? 'Tester' : name, type: 'User' });
  const repoJson = (r) => ({
    id: r.id, path: r.slug, name: `${r.slug}的仓库`, full_name: r.fullName,
    owner: userJson(r.owner), namespace: { type: 'user', path: r.owner },
    private: r.private, default_branch: 'main',
    https_url: `file://${r.bare}`, ssh_url: `git@gitee.com:${r.fullName}.git`, html_url: `https://gitee.com/${r.fullName}`,
    created_at: r.createdAt, updated_at: r.updatedAt,
  });
  /** Register an already existing repository (an "imported" one). */
  const addRepo = (fullName, bare, extra = {}) => {
    const [owner, slug] = fullName.split('/');
    const r = { id: nextId++, fullName, owner, slug, private: extra.private ?? true, bare, createdAt: '2026-01-01T00:00:00Z', updatedAt: extra.updatedAt || '2026-02-02T00:00:00Z' };
    repos.set(fullName, r);
    return r;
  };

  const flags = { neverEnds: false, failNextCreate: false };
  const recorded = { created: [], pulls: [], requests: [] };
  const revoked = new Set();
  const readBody = (req) => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : {})); });
  const pageParams = (u) => ({
    page: Math.max(Number(u.searchParams.get('page')) || 1, 1),
    per: Math.min(Math.max(Number(u.searchParams.get('per_page')) || 20, 1), 100),
  });
  const paginate = (list, u) => {
    const { page, per } = pageParams(u);
    return list.slice((page - 1) * per, page * per);
  };
  /** A synthetic full page, never registered — listing is all it is for. */
  const synthPage = (u) => {
    const { page, per } = pageParams(u);
    return Array.from({ length: per }, (_, i) => {
      const slug = `endless-${page}-${i}`;
      return { id: 900000 + page * 100 + i, path: slug, name: slug, full_name: `${login}/${slug}`, owner: userJson(login), namespace: { type: 'user', path: login }, private: true, default_branch: 'main', https_url: `file:///nonexistent/${slug}.git`, ssh_url: '', html_url: `https://gitee.com/${login}/${slug}`, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' };
    });
  };

  const server = http.createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json');
    const send = (code, body) => { res.statusCode = code; res.end(JSON.stringify(body)); };
    const u = new URL(req.url, 'http://mock');
    const token = u.searchParams.get('access_token');
    // recorded lines carry no token, so assertions stay readable
    recorded.requests.push(`${req.method} ${u.pathname}${u.search.replace(/([?&])access_token=[^&]*/, '$1access_token=…')}`);
    if (!token || revoked.has(token)) return send(401, { message: '401 Unauthorized' });
    if (req.headers.authorization) return send(401, { message: 'access_token query parameter, not an Authorization header' });
    const segs = u.pathname.split('/').filter(Boolean).map(decodeURIComponent);

    if (segs[0] === 'user' && segs.length === 1) return send(200, userJson(login));
    if (segs[0] === 'user' && segs[1] === 'repos') {
      if (req.method === 'POST') return create(login, await readBody(req));
      if (flags.neverEnds) return send(200, synthPage(u));
      const sorted = [...repos.values()].sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      return send(200, paginate(sorted.map(repoJson), u));
    }
    if (segs[0] === 'repos' && segs.length >= 3) {
      const r = repos.get(`${segs[1]}/${segs[2]}`);
      if (!r) return send(404, { message: '404 The repository does not exist' });
      if (segs.length === 3 && req.method === 'GET') return send(200, repoJson(r));
      if (segs[3] === 'branches' && req.method === 'GET') return send(200, paginate(refs(r.bare).map((name) => ({ name })), u));
      if (segs[3] === 'pulls' && req.method === 'POST') {
        const body = await readBody(req);
        const number = recorded.pulls.length + 1;
        recorded.pulls.push({ repo: r.fullName, number, ...body });
        return send(201, { id: number, number, html_url: `https://gitee.com/${r.fullName}/pulls/${number}`, title: body.title });
      }
    }

    console.error('gitee mock: unhandled', req.method, req.url);
    send(404, { message: 'unhandled' });

    function create(owner, body) {
      if (flags.failNextCreate) { flags.failNextCreate = false; return send(500, { message: 'internal error (test switch)' }); }
      const fullName = `${owner}/${body.name}`;
      if (repos.has(fullName)) return send(409, { message: 'The repository with the same name already exists' });
      const bare = path.join(tmp, 'gitee-repos', `${owner}-${body.name}.git`);
      fs.mkdirSync(path.dirname(bare), { recursive: true });
      execSync(`git init -q --bare -b main "${bare}"`);
      const r = addRepo(fullName, bare, { private: !!body.private, updatedAt: new Date().toISOString() });
      recorded.created.push({ owner, ...body, fullName });
      return send(201, repoJson(r));
    }
  });
  await new Promise((r) => server.listen(0, r));
  return {
    url: `http://localhost:${server.address().port}`,
    flags, recorded, revoked, repos, addRepo,
    close: () => new Promise((r) => server.close(r)),
  };
}
