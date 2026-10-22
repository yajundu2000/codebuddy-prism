# codebuddy-prism

**Write LaTeX together — with an AI assistant. Fast, versioned, yours.**

[![License: AGPL v3](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)

A fork of [Aldine](https://aldine.dev) (AGPL-3.0) that adds a prism-style AI
writing assistant: streaming chat, model selection, and agent edits you review
as diffs with Keep/Undo. The AI backend is any OpenAI-compatible endpoint
(default: Tencent Hunyuan) with the key held server-side only.

Independent open-source project. Not affiliated with or endorsed by Tencent
CodeBuddy.

Aldine is a self-hosted, open-source collaborative LaTeX editor and an
Overleaf alternative. It is slim and built for speed: real-time multi-cursor
editing, every project a real git repo with branches, native Zotero, ~2s warm
recompiles. Two containers and flat files by default: no database to migrate,
nothing to babysit.

**[Homepage](https://aldine.dev)** ·
**[Try the live demo](https://demo.aldine.dev)** (resets nightly) ·
[Quick start](#quick-start) · [How Aldine compares](#how-aldine-compares) ·
[Screenshots](#screenshots) · [Self-hosting](#production-deploy) ·
[Contributing](CONTRIBUTING.md)

Guides on aldine.dev:
[Self-hosting Overleaf (Community Edition, Server Pro) compared with Aldine](https://aldine.dev/self-hosted-overleaf/) ·
[Git with Overleaf and a git-native alternative](https://aldine.dev/overleaf-git/) ·
[A LaTeX MCP server for Claude](https://aldine.dev/latex-mcp/)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="e2e/shots/editor-dark.png">
  <img alt="Aldine editor: LaTeX source on the left, live PDF on the right, collaborator cursors visible" src="e2e/shots/editor-light.png">
</picture>

Live collaboration, a recompile, and a SyncTeX jump, in one real recording (compile wait trimmed):

![A collaborator's edits stream in live, the PDF recompiles in about two seconds, and double-clicking the PDF jumps the editor to the source line](e2e/shots/demo.gif)

> **Status:** Aldine is young (v0.x). It compiles real papers daily and every
> headline feature has a Playwright end-to-end test, but expect rough edges.
> (CI runs typecheck, build, and the integration suites; the browser tests run
> locally, since they need a TeX Live container.) File issues generously.

## Features

- **Bring your Overleaf projects, and take them with you**: download any Overleaf project as a ZIP,
  drop it on the home screen, keep writing — root file detected, first typeset
  automatic.
- **Real-time collaboration**: CRDT-based (Yjs), multi-cursor with live
  presence, conflict-free by construction. Unlimited collaborators.
- **Git-native with branches**: every project is a real git repository.
  Create branches, edit them independently, merge back from the UI. Publish a
  project to GitHub, GitLab or Gitee and a co-author can clone it and
  keep using VS Code; their commits come back with one Pull.
- **Fast, sandboxed compiles**: TeX Live + latexmk with persistent
  incremental builds (~2s warm recompiles) in a no-egress container with
  restricted shell-escape; errors surfaced with line numbers and
  click-to-jump.
- **GitHub/GitLab/Gitee sync**: import from GitHub, GitLab or Gitee as a
  project *or publish a local project to a fresh repo*, push/pull
  with ahead/behind indicators, branches, conflict resolution, server-side
  autopush, and open a pull or merge request, all from the editor. gitlab.com
  and self-hosted GitLab, gitee.com (the host mainland-China users can reach);
  a personal access token needs no OAuth app. A team instance can create
  every new project in a GitLab group automatically and push every autosave
  from the server.
- **Native Zotero integration**: link your whole Zotero library *or a single
  collection*, from My Library or any of your group libraries, no premium
  tier required; keep a `.bib` in sync with cheap
  version-aware refresh, insert citations from a search panel or via `\cite{`
  autocomplete.
- **Claude as a collaborator** (optional, `ALDINE_MCP=1`): Aldine has a
  built-in MCP server. Connect your
  instance to claude.ai, Claude Desktop, Cowork or Claude Code over MCP and
  Claude edits, typesets and shows the PDF in the chat (inline on claude.ai,
  Claude Desktop and Cowork; a signed link elsewhere); every change is a git
  commit authored "Claude" with a review-and-revert toast in the editor.
  Setup, reachability and the security model: [docs/AGENT_API.md](docs/AGENT_API.md).

  ![Claude edits the open document, adds a section, typesets, and History lists its commits with a review prompt](e2e/shots/agent-demo.gif)

<details>
<summary><strong>Everything else</strong>: visual editor, review mode, AI error fix, SyncTeX, plugins, auth, scaling…</summary>

- **Visual editing mode** (experimental): LaTeX renders as formatted text
  while the source stays authoritative and **byte-stable** (it never rewrites
  source you didn't deliberately edit). WYSIWYG math (click an equation to edit
  it in a MathLive popover), editable tables, inline tracked changes from review
  suggestions, paste-rich-text-to-LaTeX, image-previewing figure chips, and an
  outline. Cursor-reveal shows raw source under the caret, including a remote
  collaborator's. Enable it in the command palette (⌘K), off by default.
- **Review mode**: select text and leave an anchored, threaded comment;
  optionally attach a suggested replacement the author accepts with one click.
  Comments highlight in the editor, resolve/reopen, and track edits.
- **AI error fix** (optional, BYO key): on a failed typeset, get a
  plain-English diagnosis and one-click fixes. Set `OPENROUTER_API_KEY`,
  `OPENAI_API_KEY`, or `ANTHROPIC_API_KEY` on the server to enable (that
  precedence order if several are set; `ALDINE_AI_MODEL` overrides the model).
  The key stays server-side and never reaches the browser. Unset the key and
  Aldine is a 100% AI-free editor.
- **Find and cite papers without leaving the editor**: search the literature
  by title or author (OpenAlex), or paste a DOI / arXiv id — one click appends
  the BibTeX and inserts the `\cite` (no account, free public APIs).
- **SyncTeX both ways**: double-click the PDF to jump to source; ⌘J to jump
  the PDF to your cursor, with a highlight flash.
- **Plugin system**: manifest + ES module plugins add sidebar panels and
  write into the editor. Zotero, references, and AI-fix ship as plugins;
  write your own.
- **Templates & import**: article, IAC conference paper, beamer,
  report/thesis, plus your group's own templates from any git repository
  (`TEMPLATE_REPOS`); or import an existing project from an Overleaf ZIP.
- **Editor niceties**: auto-typeset on idle, live whole-document word count,
  spellcheck, PDF zoom + download, drag-drop figure upload, plain-English
  error hints + raw log, command palette (⌘K / Ctrl+K).
- **Multi-user auth** (optional): set `AUTH_ENABLED=1` for login, per-project
  ownership, and sharing (invite-only or link). Google, GitHub & ORCID SSO,
  your own OpenID Connect provider (Keycloak, Authentik, Authelia, Pocket ID;
  [docs/OIDC.md](docs/OIDC.md)), or email/password (scrypt-hashed, revocable HTTP-only-cookie sessions);
  `ALDINE_SSO_ONLY=1` disables passwords entirely. Off by default
  (single-tenant); the collab socket is access-checked.
  `ALDINE_ADMIN_EMAILS=you@example.org` opens `/admin`: accounts, active
  users (7 / 30 days, editing now), projects, compile time. Metadata only.
  No compose file passes this variable through; add it under `environment:`
  of the `app` service.
- **Scales when you need it**: flat-file storage by default; set
  `DATABASE_URL` for Postgres and `REDIS_URL` for shared rate limits and
  cross-node collab events. One app node is still the supported topology;
  [docs/SCALING.md](docs/SCALING.md) says exactly what is and isn't built.
- **Apple-style UI**: system fonts, hairline borders, light & dark mode,
  keyboard-first (⌘S typeset, ⌘J jump, ⌘K command palette).

</details>

## Quick start

Clone and build: the app image is built on your machine from this source,
and the compiler is the unmodified upstream Aldine TeX Live image:

    git clone https://github.com/yajundu2000/codebuddy-prism && cd codebuddy-prism
    docker compose up -d --build

On networks where docker.io or npmjs.org are slow, pass build args:
`NPM_REGISTRY=https://registry.npmmirror.com` and
`NODE_IMAGE=docker.m.daocloud.io/library/node:22-alpine`.

Open http://localhost:8080. That's it. Projects live in the `aldine-data`
volume, and everything else (auth, SSO, AI assistant, email) is opt-in via
environment variables when you want it. The repo-root `docker-compose.yml`
is exactly what you just built; keep its `name: codebuddy-prism` line
wherever you copy it, because it fixes the volume names — that is what lets
you switch compose files later and what `deploy/backup.sh` looks for.

- **The compiler is a pinned upstream image.** `ALDINE_COMPILER_VERSION`
  (default 0.11.0) selects it. It is the unmodified Aldine compiler — a
  sandboxed TeX Live wrapper — so its version moves independently of this
  project's releases.
- **CJK documents need TeX Live full.** The default compiler scheme lacks
  ctex/Fandol; pull the full variant (about 9 GB on disk) with
  `ALDINE_TEXLIVE=-full docker compose pull compiler && docker compose up -d`.
- **Upgrading.** Read the [CHANGELOG](CHANGELOG.md), back up
  (`deploy/backup.sh`), then `git pull && docker compose up -d --build`: the
  app image is rebuilt from the new source while your projects stay in the
  `aldine-data` and `aldine-secrets` volumes, which a rebuild never touches.
  To roll back, check out the previous tag and run the same command.

- **Pre-1.0 stability.** Versions follow SemVer with one caveat: before 1.0
  a minor bump (0.3 to 0.4) may change behaviour or on-disk layout, a patch
  bump (0.4.0 to 0.4.1) will not. Every release is built from a commit that
  passed CI, and its images are booted and made to typeset a real document
  before `:latest` moves to them. Upgrades across a minor are not yet tested
  against existing data, so back up first. Watch the repo's Releases for
  security fixes: per [SECURITY.md](SECURITY.md), only the latest release
  gets them.
- **The first pull is big.** TeX Live lives in the compiler image: about
  1.1 GB compressed, 4.3 GB on disk. It carries TeX Live's medium scheme plus
  the pictures, latexextra and bibtexextra collections (pgfplots, tikz-cd,
  cleveref, todonotes, minted, biblatex, …), the publisher classes, and the
  Arabic, Persian, Cyrillic and Greek scripts; the one family it leaves out
  is CJK. After the first pull, starts take
  seconds. Ready when `curl localhost:8080/api/health` returns
  `{"ok":true,"name":"aldine"}`.
- **Need a package it does not have?** The missing-package error in the
  editor names it. Two ways to get it, and project settings show which
  image you are on:
  - Add just that package. Put a `docker-compose.override.yml` next to
    `docker-compose.yml` that builds a derived compiler image, then
    `docker compose up -d --build`. `tlmgr` installs from the same dated
    TeX Live snapshot the release was built from, so this keeps working
    after the release ages:
    ```yaml
    services:
      compiler:
        image: aldine-compiler-local
        build:
          dockerfile_inline: |
            FROM ghcr.io/trahloff/aldine-compiler:0.11.0
            RUN tlmgr install pgfplots tikz-cd
    ```
    Bump the `FROM` tag when you bump `ALDINE_COMPILER_VERSION`. Compose builds the
    image on your machine, so this works for `arm64` servers as well.
  - Get everything. Every release from 0.4.0 also ships all of TeX Live as
    `-full` (about 2.8 GB compressed, 9 GB on disk; CJK is only here). Add
    `ALDINE_TEXLIVE=-full` next to `ALDINE_COMPILER_VERSION` and pull again.
- **Port 8080 taken?** Change the left side of `ports:`; with
  `docker-compose.full.yml`, set `ALDINE_PORT=8081` in `.env` instead.
- **Everything beyond the minimum**: building from source (latest `main`,
  not a release), auth/SSO/AI/email options, TLS, Postgres/Redis. All of it
  lives in [`docker-compose.full.yml`](docker-compose.full.yml), which carries
  the same compiler sandbox and the same volumes, so you can switch without
  losing data: `docker compose -f docker-compose.full.yml up -d --build`.
  The first build installs TeX Live into the compiler image; expect 20–60
  minutes (the `tlmgr install` step is most of it), then seconds per start.
  `ALDINE_TEXLIVE_SCHEME=full` builds the all-of-TeX-Live variant instead.

## How Aldine compares

| | Aldine | Overleaf CE (self-hosted) | git + VS Code + LaTeX Workshop |
|---|---|---|---|
| Deploy | 2 containers, `docker compose up` | Overleaf Toolkit; `sharelatex`, `mongo` and `redis` containers ([source][ol-req]) | n/a (local) |
| Real-time collaboration | ✅ CRDT, unlimited collaborators | ✅ ([source][ol-repo]) | ❌ (async via git) |
| Review comments / suggested edits | ✅ | ❌ commenting and track changes are Server Pro only ([source][ol-cmp]) | PR reviews |
| Git branches from the UI | ✅ projects *are* git repos | ❌ git integration is Server Pro only ([source][ol-cmp]) | ✅ (it *is* git) |
| GitHub/GitLab/Gitee sync + PRs/MRs from the editor | ✅ | Overleaf documents GitHub synchronization as "a premium feature for Overleaf Cloud users" ([source][ol-gitdocs]); absent from its on-premises comparison ([source][ol-cmp]) | ✅ natively |
| Zotero | Whole library **or one collection** | Overleaf lists Zotero among the third-party integrations of its cloud platform ([source][ol-onprem]); absent from its on-premises comparison ([source][ol-cmp]) | Via Better BibTeX auto-export |
| Warm recompile | ~2s (persistent latexmk cache) | Not measured | Local |
| Templates gallery | 4 built-in, plus your own from git repositories | ❌ private template management is Server Pro only ([source][ol-cmp]) | CTAN / your own |
| Package coverage | TeX Live medium + pictures, latexextra, bibtexextra, publisher classes, most scripts by default (~4.3 GB); any extra with one `tlmgr install` line; **all of TeX Live** with `ALDINE_TEXLIVE=-full` | Minimal TeX Live in the image; full with `tlmgr install scheme-full` ([source][ol-tl]) | Whatever you install |
| Rich-text / visual editing | ✅ experimental: byte-stable, WYSIWYG math, editable tables, review suggestions shown inline (accept/dismiss) | ✅ Visual Editor; its code is in the open-source repository ([source][ol-visual]) | ❌ |
| Maturity | Young (v0.x, 2026) | Overleaf dates from 2011 ([source][ol-about]) | Very mature |
| License | AGPL-3.0 | AGPL-3.0 ([source][ol-repo]) | MIT/varies |

[ol-cmp]: https://docs.overleaf.com/on-premises/welcome/server-pro-vs.-community-edition
[ol-req]: https://docs.overleaf.com/on-premises/getting-started/requirements/software-requirements
[ol-tl]: https://docs.overleaf.com/on-premises/installation/upgrading-tex-live
[ol-repo]: https://github.com/overleaf/overleaf
[ol-about]: https://www.overleaf.com/about
[ol-gitdocs]: https://docs.overleaf.com/integrations-and-add-ons/git-integration-and-github-synchronization
[ol-onprem]: https://www.overleaf.com/for/enterprises/when-to-use-overleaf-on-premises-vs-in-the-cloud
[ol-visual]: https://github.com/overleaf/overleaf/tree/main/services/web/frontend/js/features/source-editor/extensions/visual

If Overleaf CE fits you, use it; it's good software. Aldine exists for people
who want review comments with suggested edits, git and Zotero without paid
tiers, in a deployment they can hold in their head.

Every Overleaf CE cell except "Not measured" links to the Overleaf page it
was checked against on 2026-10-12. For GitHub synchronization and Zotero we
found no Overleaf page that states them for the on-premises editions, so
those cells quote what Overleaf does say. A longer, dated version of this
comparison is at
[aldine.dev/self-hosted-overleaf](https://aldine.dev/self-hosted-overleaf/).

## Screenshots

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="e2e/shots/visual-dark.png">
  <img alt="Visual editing mode: the same LaTeX paper rendered as formatted text with typeset math, next to the live PDF" src="e2e/shots/visual-light.png">
</picture>

*Visual editing (experimental): the source rendered as formatted text, byte-stable, with math and tables editable in place. Enable via ⌘K.*

| | |
|---|---|
| <picture><source media="(prefers-color-scheme: dark)" srcset="e2e/shots/review-dark.png"><img alt="Review mode: anchored comment threads with suggested edits" src="e2e/shots/review-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="e2e/shots/branches-dark.png"><img alt="Branch menu on a project" src="e2e/shots/branches-light.png"></picture> |
| Review mode: threads + one-click suggestions | Branches: create, switch, merge from the UI |
| <picture><source media="(prefers-color-scheme: dark)" srcset="e2e/shots/zotero-dark.png"><img alt="Zotero panel: search your library and insert citations" src="e2e/shots/zotero-light.png"></picture> | <picture><source media="(prefers-color-scheme: dark)" srcset="e2e/shots/history-dark.png"><img alt="History view with checkpoints and diffs" src="e2e/shots/history-light.png"></picture> |
| Zotero: cite from your library or collection | History: auto-checkpoints, named checkpoints, diffs |

## Development

```bash
npm install
npm run dev:server     # API + collab on :3000
npm run dev:web        # Vite on :5173 (proxies to :3000)
docker build -t aldine-compiler apps/compiler
docker run -d -p 4020:4020 -v $PWD/.data:/data aldine-compiler
```

### Tests

```bash
npm run typecheck -w apps/web && npm run test -w apps/web   # tsc + vitest
npm run test:github -w apps/server                          # GitHub-sync integration
npm run test:gitlab -w apps/server                          # GitLab-sync integration
npm run test:gitee -w apps/server                           # Gitee-sync integration
npm run test:db -w apps/server                              # datastore conformance
```

End-to-end (Playwright; covers compile, collab, branches, plugins, Zotero). The
suite starts its own app on :3100 but not the compiler, and it runs against
`.data-e2e`, so the compiler has to point at that directory or every compile
test fails against a healthy-looking compiler:

```bash
npx playwright install chromium
DATA_DIR=$(pwd)/.data-e2e PORT=4020 node apps/compiler/server.js &   # or a container on the same dir
npm run test:e2e
ALDINE_URL=http://localhost:8080 npm run test:e2e   # against a running compose stack instead
```

## Production deploy

Settings live in a `.env` file next to the compose files, so every later
`docker compose` call picks them up. Give each comment its own line: anything
after a value becomes part of the value, and `AUTH_ENABLED=1  multi-user login`
is not `1`, so auth silently stays off.

```dotenv
# app on loopback only; your reverse proxy fronts it
ALDINE_APP_BIND=127.0.0.1
# absolute URL of the app, used in OAuth callbacks, password-reset links and
# the PDF links the MCP connector hands out. Give it a path to serve Aldine
# under a prefix (https://server/internal/aldine); the Claude connector URL
# is <ALDINE_PUBLIC_URL>/mcp
ALDINE_PUBLIC_URL=https://aldine.example.com
# signs the connector's 15-minute PDF links; generated into META_DIR when
# unset — set it explicitly when several nodes do not share that volume.
# At least 32 characters (`openssl rand -base64 32`); shorter values refuse to boot
ALDINE_SIGNING_SECRET=
# MCP endpoint for Claude (docs/AGENT_API.md); needs AUTH_ENABLED=1 or ALDINE_MCP_TOKEN
ALDINE_MCP=
# static bearer for /mcp with auth off (single-tenant); ignored when AUTH_ENABLED=1
ALDINE_MCP_TOKEN=

# Everything below is optional and off unless set.
# multi-user login, ownership and sharing (unset = single-tenant)
AUTH_ENABLED=1
# Google SSO
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
# GitHub SSO
GITHUB_LOGIN_CLIENT_ID=
GITHUB_LOGIN_CLIENT_SECRET=
# ORCID SSO: a Public API client (orcid.org/developer-tools, HTTPS callback
# <ALDINE_PUBLIC_URL>/api/auth/oauth/orcid/callback); ORCID_SANDBOX=1 for sandbox.orcid.org
ORCID_CLIENT_ID=
ORCID_CLIENT_SECRET=
# OpenID Connect SSO (Keycloak, Authentik, Authelia, Pocket ID, …): redirect URI
# <ALDINE_PUBLIC_URL>/api/auth/oauth/oidc/callback; every option in docs/OIDC.md
OIDC_ISSUER=
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_LABEL=
OIDC_ALLOWED_GROUPS=
# GitHub repo sync: a separate OAuth app with repo scope
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
# GitLab sync (gitlab.com or self-hosted); PAT connect works without these
GITLAB_URL=https://gitlab.com
GITLAB_CLIENT_ID=
GITLAB_CLIENT_SECRET=
# Gitee sync needs nothing here: users paste a private-access token
# REMOTE_PROVIDERS=github,gitlab,gitee   # hide a provider by leaving it out
# Optional: every new project is also created on GitLab in this group (service
# account PAT with scope api and Owner on the group). Off unless both are set.
GITLAB_TOKEN=
GITLAB_DEFAULT_GROUP=
# GITLAB_DEFAULT_VISIBILITY=private   # or internal | public
# AUTOPUSH_DEBOUNCE_MS=30000
# AI error fix, bring your own key
OPENROUTER_API_KEY=
# password-reset email: SMTP, or SES_FROM + AWS_REGION instead
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM=
# error tracking, and which instance the errors came from
SENTRY_DSN=
SENTRY_ENVIRONMENT=production
# Templates from your own git repositories (see templates/README.md)
# TEMPLATE_REPOS='[{"id":"lab","label":"Lab templates","url":"https://gitlab.example.org/latex/templates.git","tokenEnv":"TEMPLATE_REPO_LAB_TOKEN"}]'
# TEMPLATE_REPO_LAB_TOKEN=
```

```bash
# Behind your existing reverse proxy (nginx, Traefik, …), the usual setup. The
# prod overlay trusts proxy headers, sets secure cookies, and rotates logs;
# point your proxy at 127.0.0.1:8080.
# Sample nginx vhost (WebSocket + body-size gotchas handled): deploy/nginx.conf
docker compose -f docker-compose.full.yml -f deploy/docker-compose.prod.yml \
  up -d --build

# …or, if nothing else owns ports 80/443, add the bundled Caddy for
# zero-config HTTPS: append `--profile tls` and set ALDINE_DOMAIN in .env.

# Back up the data + secrets volumes:
deploy/backup.sh aldine-backup.tar.gz
# Restore, after stopping the stack with `docker compose down`:
#   deploy/restore.sh aldine-backup.tar.gz
```

Every variable Aldine reads is listed in
[deploy/README.md](deploy/README.md#all-configuration).

**Isolation & limits.** The compiler runs on an internal-only Docker network
(no internet egress), drops all Linux capabilities, and is bounded on CPU /
memory / PIDs; LaTeX compiles with **restricted shell-escape** (whitelist
only) and `openin_any=p`. Per-client rate limits guard login, AI, and
reference lookups; compiles are concurrency-capped, with optional per-user
compile quotas (`ALDINE_COMPILE_QUOTA_MIN`) if you host for a group.

See [deploy/README.md](deploy/README.md) for the full single-VPS runbook
(nginx/Traefik/Caddy ingress, backups, SSO setup, Postgres/Redis, every
config variable),
[deploy/aws](deploy/aws) for a Terraform/Fargate deployment, and
[SECURITY.md](SECURITY.md) for the threat model and how to report
vulnerabilities.

## Architecture

```
┌────────────┐   HTTP/WS    ┌──────────────────────────────┐
│  Browser   │ ───────────► │  app (Node 22)               │
│  React +   │              │  Fastify API + Hocuspocus    │
│  CM6 + Yjs │              │  git repos + worktrees       │
└────────────┘              └──────────┬───────────────────┘
                                       │ shared volume /data
                            ┌──────────▼───────────────────┐
                            │  compiler (TeX Live medium)  │
                            │  latexmk wrapper, sandboxed  │
                            └──────────────────────────────┘
```

- One Yjs document per file per branch (`project::branch::path`), persisted
  straight to the git worktree with debounced writes and auto-commits.
- Branches are git worktrees, so every branch is editable concurrently.
- Compile output stays inside the project tree (`.aldine-out/`, kept out of
  git history) which keeps latexmk's incremental cache warm.

### Data & storage

Two separate concerns, behind two seams:

- **Project files**: real git repos + worktrees on disk (`store.ts`). This is
  what gives you branches and history.
- **Relational/metadata**: users, sessions, project metadata, review comments,
  and usage go through the `DataStore` interface (`db/`). Two backends:
  - **JSON files** (default, zero-dependency): the slim single-node self-host.
  - **Postgres** (set `DATABASE_URL`): the horizontally-scalable backend, and
    the prerequisite for ever running multiple app nodes. `pg` is an optional
    dependency; the same conformance suite runs against both.

For how this scales past one box (and what the remaining walls are), see
[docs/SCALING.md](docs/SCALING.md).

## Plugins

A plugin is a folder in `plugins/`:

```
plugins/hello/
├── manifest.json   # { "id": "hello", "name": "Hello", "version": "1.0.0", "entry": "index.js" }
└── index.js        # export default { activate(aldine) { ... } }
```

The `aldine` API exposes `ui.registerSidebarPanel`, `editor.insertAtCursor`,
`project` context, `compile()`, `toast()`, and `fetch()`. See
`plugins/zotero` for a complete example.

## Templates

A template is a folder with a `template.json` and the files to start from;
the shipped ones live in `templates/`. A group that keeps its own thesis,
poster or report templates puts the same layout in any git repository
(GitHub, GitLab, Gitee, a bare repo over https), lists it in
`TEMPLATE_REPOS`, and the templates appear in the gallery under the
repository's name, refreshed on an interval or with "Refresh templates", with
`{{PROJECT_NAME}}`, `{{AUTHOR}}` and `{{DATE}}` filled in on create. Layout,
manifest fields, placeholders and private-repository tokens:
[templates/README.md](templates/README.md).

## License

Copyright (C) 2026 Tobias Rahloff.

[AGPL-3.0](LICENSE): self-host freely; if you offer a modified Aldine as a
service, share your changes. Third-party plugins interact with Aldine over its
plugin API and may use any license. Each folder under `templates/` carries its
own `LICENSE` and states it in `template.json` (the gallery shows it on the
tile): the generic templates are MIT, and `templates/iac-paper` is LPPL-1.3c,
the customary license for a LaTeX class file. Venue templates are generated
from the classes installed in the compiler image, with the license `tlmgr`
reports; no publisher file is stored in this repository. Overleaf is a
trademark of its owner. Claude, Zotero, GitHub, GitLab and other names are
trademarks of their respective owners. Aldine is an independent project, not
affiliated with or endorsed by any of them.

Two things stated plainly, because finding them out later feels like a
bait-and-switch. **A hosted Aldine service is planned**, and contributions are
accepted under a [CLA](CLA.md) that permits relicensing, so a commercially
licensed edition is possible in future. What will not change: the self-hosted
edition stays AGPL-3.0, and no feature that works today moves behind a paid
tier. The name is handled separately in [TRADEMARK.md](TRADEMARK.md).
