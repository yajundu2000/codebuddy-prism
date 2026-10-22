import { injectToken } from './gitops.js';
import { jsonRequest, RemoteApiError, type RemoteConnection, type RemoteProvider, type RemoteRepo } from './remote-types.js';

/**
 * Gitee (码云, gitee.com) as a remote provider — the host mainland-China
 * users can actually reach. One canonical instance, so the connection is a
 * token and nothing else. Personal access tokens only, no OAuth. Every call
 * below is checked against the live v5 API (probed 2026-10-21):
 *  - auth: `access_token` query parameter on every endpoint (Gitee's
 *    documented PAT auth; there is no header form to fall back to)
 *  - GET /user → login, name
 *  - GET /user/repos?page=&per_page= with type/sort filters → full_name, path,
 *    owner.login, private, default_branch, updated_at. `path` is the repo
 *    slug; `name` is a display name that may be Chinese or contain spaces.
 *    List responses carry no X-Total-Count or Link header, so a short page is
 *    the only end-of-list signal.
 *  - GET /repos/{owner}/{repo}; GET /repos/{owner}/{repo}/branches?page=&per_page=
 *  - POST /user/repos {name, private, auto_init} — personal repos only;
 *    organisation repos live under /enterprises/{ent}/repos, a different
 *    family this provider does not implement
 *  - POST /repos/{owner}/{repo}/pulls {title, head, base, body}
 *    → PullRequest {html_url, number}
 * Token scopes: the private-token defaults (user_info, projects,
 * pull_requests) cover everything here.
 *
 * The repo payload's https clone field comes back null (2026-10 probe), so
 * the clone URL is built from full_name; checkCloneUrl pins it to gitee.com
 * either way. Git over https takes the token as the basic-auth password
 * under the account login.
 *
 * GITEE_API_BASE replaces the https://gitee.com/api/v5 prefix and exists for
 * tests only; set, it also lifts the https/origin rule on clone URLs
 * (apiOverridden), which is how the mocks answer file://.
 */

/** Gitee's documented per_page maximum; the host honours it. */
const PAGE = 100;
/** Upper bound on pages walked, so a server that never returns an empty page cannot pin the request. */
const MAX_PAGES = 40;

const API = () => process.env.GITEE_API_BASE || 'https://gitee.com/api/v5';
const ORIGIN = 'https://gitee.com';

async function api(conn: RemoteConnection, path: string, init: RequestInit = {}): Promise<any> {
  const sep = path.includes('?') ? '&' : '?';
  return jsonRequest(`${API()}${path}${sep}access_token=${encodeURIComponent(conn.token)}`, {
    ...init,
    headers: {
      accept: 'application/json',
      'user-agent': 'aldine',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  }, 'Gitee');
}

/**
 * Walk `path` page by page until a page comes back empty or short: Gitee's
 * list responses carry no total, so a short page is the end. A full page at
 * the cap is an error, never a silently shortened list: a missing repository
 * would look like no access.
 */
async function pageAll(conn: RemoteConnection, path: string): Promise<any[]> {
  const sep = path.includes('?') ? '&' : '?';
  const all: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const list = (await api(conn, `${path}${sep}page=${page}&per_page=${PAGE}`)) as any[] | null;
    if (!list?.length) return all;
    all.push(...list);
    if (list.length < PAGE) return all;
  }
  throw new RemoteApiError(`Gitee lists more than ${all.length} entries, more than can be read in ${MAX_PAGES} pages`, 502);
}

export function mapRepo(r: any): RemoteRepo {
  const fullName: string = r.full_name;
  return {
    fullName,
    // `path` is the slug; `name` is a display name that may contain spaces or Chinese.
    name: r.path || fullName.split('/').at(-1) || '',
    owner: r.owner?.login || r.namespace?.path || fullName.split('/')[0],
    private: !!r.private,
    defaultBranch: r.default_branch || 'master',
    // The payload's https clone field is null on the live API (2026-10); tests
    // set it to file:// through this same field.
    cloneUrl: r.https_url || `${ORIGIN}/${fullName}.git`,
    updatedAt: r.updated_at || r.created_at || '',
  };
}

/** `owner/repo` → API path segment; anything else is refused before it reaches the network. */
function repoPath(fullName: string): string {
  const parts = fullName.split('/');
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('Expected "owner/repo"');
  return `/repos/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`;
}

export const gitee: RemoteProvider = {
  id: 'gitee',
  label: 'Gitee',
  changeRequestLabel: 'pull request',
  selfHosted: false,
  tokenScopeHint: 'the default scopes (user_info, projects, pull_requests)',
  pathHint: 'Expected "owner/repo"',
  instanceOrigin() { return ORIGIN; },
  apiOverridden() { return !!process.env.GITEE_API_BASE; },

  oauthEnabled() { return false; },
  connectUrl() { throw new Error('Gitee connects with a personal access token only'); },
  async exchangeCode() { throw new Error('Gitee connects with a personal access token only'); },

  async whoami(conn) {
    const u = await api(conn, '/user');
    return { login: u.login, name: u.name || u.login };
  },

  /** Every repository the token can see, most recently updated first (the API has no stable order of its own). */
  async listRepos(conn) {
    const list = await pageAll(conn, '/user/repos?type=all&sort=updated');
    return list.map(mapRepo).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  },

  async getRepo(conn, fullName) {
    return mapRepo(await api(conn, repoPath(fullName)));
  },

  async listBranches(conn, fullName) {
    const list = (await pageAll(conn, `${repoPath(fullName)}/branches`)) as Array<{ name: string }>;
    return list.map((b) => b.name);
  },

  /** Under the authenticated user only: organisation repos are a different endpoint family this provider does not implement. */
  async createRepo(conn, name, opts) {
    if (opts.namespace) throw new Error('Gitee publishing under an organisation or enterprise is not supported');
    return mapRepo(await api(conn, '/user/repos', {
      method: 'POST',
      body: JSON.stringify({ name, private: opts.private, auto_init: false }),
    }));
  },

  async createChangeRequest(conn, fullName, opts) {
    const pr = await api(conn, `${repoPath(fullName)}/pulls`, {
      method: 'POST',
      body: JSON.stringify({ title: opts.title, head: opts.head, base: opts.base, body: opts.body || '' }),
    });
    return { url: pr.html_url, number: pr.number };
  },

  tokenUrl(cloneUrl, token, login) {
    return injectToken(cloneUrl, login || 'aldine', token);
  },
};
