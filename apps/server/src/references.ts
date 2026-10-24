import * as store from './store.js';
import { ensureWorktree, checkpointPathsHeld, withRepoLock } from './gitops.js';
import { flushBranchDocs, refreshBranchDocsFromDisk, scheduleCommit, commitAgentWrite } from './collab.js';
import { bibKeys } from './bib.js';
import { pinyin } from 'pinyin-pro';

/**
 * Resolve a DOI, doi.org URL, or arXiv id to a BibTeX entry using free public
 * endpoints — no account, complements the Zotero integration.
 */

const ARXIV_RE = /(?:arxiv:|arxiv\.org\/abs\/)?(\d{4}\.\d{4,5})(v\d+)?/i;
const DOI_RE = /10\.\d{4,9}\/[^\s"']+/;

const DOI_BASE = process.env.DOI_API_BASE || 'https://doi.org';
const ARXIV_BASE = process.env.ARXIV_API_BASE || 'https://export.arxiv.org';
const OPENALEX_BASE = process.env.OPENALEX_API_BASE || 'https://api.openalex.org';

/** Decode the HTML entities upstream metadata (CrossRef, arXiv, OpenAlex) ships. */
function unescapeHtml(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

/** Escape LaTeX specials that would break a compile, skipping already-escaped ones.
 *  Paired `$…$` is TeX math the author typed (arXiv titles carry it) and stays as
 *  it is, subscripts included; an odd stray `$` is escaped. */
function latexEscape(s: string): string {
  const escape = (t: string) => t.replace(/(\\?)([&%$#_])/g, (_, bs, ch) => (bs ? bs + ch : `\\${ch}`));
  const dollars = s.match(/(?<!\\)\$/g)?.length ?? 0;
  if (dollars < 2 || dollars % 2) return escape(s);
  return s.split(/((?<!\\)\$(?:\\.|[^$\\])*\$)/).map((part, i) => (i % 2 ? part : escape(part))).join('');
}

/**
 * Characters pdflatex's utf8 inputenc has no macro for, with the macro that
 * typesets them under every engine. Latin-1 symbols (×, ±, °, ·) and the
 * typographic quotes and dashes are set up by inputenc and stay as they are;
 * so do Cyrillic and CJK, which compile under xelatex/lualatex.
 */
const TEX_FOR_CHAR: Record<string, string> = {
  '\u00a0': '~', '\u2009': ' ', '\u200a': ' ', '\u202f': ' ', '\u2002': ' ', '\u2003': ' ',
  '\u2212': '-', '\u2010': '-', '\u2011': '-',
  'ﬀ': 'ff', 'ﬁ': 'fi', 'ﬂ': 'fl', 'ﬃ': 'ffi', 'ﬄ': 'ffl',
  '≤': '$\\leq$', '≥': '$\\geq$', '≠': '$\\neq$', '≈': '$\\approx$', '≃': '$\\simeq$', '≡': '$\\equiv$',
  '∼': '$\\sim$', '∝': '$\\propto$', '∞': '$\\infty$', '→': '$\\rightarrow$', '←': '$\\leftarrow$',
  '↔': '$\\leftrightarrow$', '⇒': '$\\Rightarrow$', '∂': '$\\partial$', '∇': '$\\nabla$', '∑': '$\\sum$',
  '∏': '$\\prod$', '√': '$\\surd$', '∈': '$\\in$', '⋅': '$\\cdot$', '•': '$\\bullet$', '′': '$\\prime$',
  '″': '$\\prime\\prime$', '≪': '$\\ll$', '≫': '$\\gg$', '⊂': '$\\subset$', '∪': '$\\cup$', '∩': '$\\cap$', 'ℓ': '$\\ell$',
  'α': '$\\alpha$', 'β': '$\\beta$', 'γ': '$\\gamma$', 'δ': '$\\delta$', 'ε': '$\\varepsilon$', 'ϵ': '$\\epsilon$',
  'ζ': '$\\zeta$', 'η': '$\\eta$', 'θ': '$\\theta$', 'ι': '$\\iota$', 'κ': '$\\kappa$', 'λ': '$\\lambda$',
  'μ': '$\\mu$', 'ν': '$\\nu$', 'ξ': '$\\xi$', 'π': '$\\pi$', 'ρ': '$\\rho$', 'σ': '$\\sigma$', 'ς': '$\\varsigma$',
  'τ': '$\\tau$', 'υ': '$\\upsilon$', 'φ': '$\\varphi$', 'ϕ': '$\\phi$', 'χ': '$\\chi$', 'ψ': '$\\psi$', 'ω': '$\\omega$',
  'Γ': '$\\Gamma$', 'Δ': '$\\Delta$', 'Θ': '$\\Theta$', 'Λ': '$\\Lambda$', 'Ξ': '$\\Xi$', 'Π': '$\\Pi$',
  'Σ': '$\\Sigma$', 'Υ': '$\\Upsilon$', 'Φ': '$\\Phi$', 'Ψ': '$\\Psi$', 'Ω': '$\\Omega$',
};
const TEX_CHAR_RE = new RegExp(`[${Object.keys(TEX_FOR_CHAR).join('')}]`, 'g');

/**
 * Make upstream text typesettable with pdflatex, the default engine: emoji
 * and everything else outside the BMP go (no engine's default fonts have
 * them; a title's 🦜 broke the build at \printbibliography with an error
 * pointing at the .tex), so do zero-width and variation selectors, and
 * combining marks left after NFC composition, and the space a removal
 * leaves before punctuation; the symbols above become their macros.
 */
function pdflatexSafe(s: string): string {
  return s.normalize('NFC')
    .replace(/[\u{10000}-\u{10FFFF}]|[\u200b-\u200d\u2060\ufe0e\ufe0f\ufeff]|[\u0300-\u036f]/gu, '')
    .replace(/ {2,}/g, ' ').replace(/ (?=[,.:;!?)}])/g, '')
    .replace(TEX_CHAR_RE, (ch) => TEX_FOR_CHAR[ch]);
}

/** A field value built from upstream metadata: HTML-decode, LaTeX-escape, then make it
 *  pdflatex-safe — the macros that step adds carry `$`, which the escape must not see. */
function bibField(s: string): string {
  return pdflatexSafe(latexEscape(unescapeHtml(s))).trim();
}

/**
 * doi.org emits `month = June`, an undefined macro to bibtex and biber (a
 * warning on every build and no month in the bibliography); the defined
 * macros are the lowercase three-letter ones. An unbraced value that is not
 * a month name is braced so it is at least a string.
 */
const MONTH_NAME = /^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sept?(ember)?|oct(ober)?|nov(ember)?|dec(ember)?)$/i;
function normalizeMonths(bib: string): string {
  return bib.replace(/\b(month\s*=\s*)([A-Za-z]+)(?=\s*[,}\n])/gi, (_, lhs: string, name: string) =>
    (MONTH_NAME.test(name) ? `${lhs}${name.slice(0, 3).toLowerCase()}` : `${lhs}{${name}}`));
}

interface BibFieldValue { name: string; value: string; bare: boolean }

/** One entry's fields; null when the blob is not a single well-formed entry (it is then kept as received). */
function parseEntry(bib: string): { type: string; key: string; fields: BibFieldValue[] } | null {
  const head = /^\s*@(\w+)\s*\{\s*([^,\s]+)\s*,/.exec(bib);
  if (!head) return null;
  const fields: BibFieldValue[] = [];
  const nameRe = /([A-Za-z][\w-]*)\s*=\s*/y;
  const n = bib.length;
  let i = head[0].length;
  while (i < n) {
    while (i < n && /[\s,]/.test(bib[i])) i++;
    if (i >= n) return null;
    if (bib[i] === '}') return /^\s*$/.test(bib.slice(i + 1)) ? { type: head[1].toLowerCase(), key: head[2], fields } : null;
    nameRe.lastIndex = i;
    const nm = nameRe.exec(bib);
    if (!nm) return null;
    i = nameRe.lastIndex;
    let value: string;
    let bare = false;
    if (bib[i] === '{') {
      const start = i;
      for (let depth = 0; i < n; i++) {
        if (bib[i] === '{') depth++;
        else if (bib[i] === '}' && --depth === 0) break;
      }
      if (i >= n) return null;
      value = bib.slice(start + 1, i++);
    } else if (bib[i] === '"') {
      const start = ++i;
      while (i < n && bib[i] !== '"') i++;
      if (i >= n) return null;
      value = bib.slice(start, i++);
    } else {
      const start = i;
      while (i < n && !/[,}\s]/.test(bib[i])) i++;
      value = bib.slice(start, i);
      bare = true;
    }
    fields.push({ name: nm[1].toLowerCase(), value: value.trim(), bare });
  }
  return null;
}

/**
 * One key rule for every upstream (doi.org's `LeCun_2015` and the synthesized
 * `vaswani2017` used to differ): the first author's surname in ASCII
 * lowercase plus the year, falling back to the upstream's key when either is
 * missing.
 */
function entryKey(fields: BibFieldValue[], fallback: string): string {
  const author = fields.find((f) => f.name === 'author')?.value ?? '';
  const year = /\d{4}/.exec(fields.find((f) => f.name === 'year')?.value ?? '')?.[0] ?? '';
  const first = author.split(/\s+and\s+/i)[0] ?? '';
  const surname = first.includes(',') ? first.split(',')[0] : first.trim().split(/\s+/).pop() ?? '';
  const slug = surname.normalize('NFD').replace(/[^A-Za-z]/g, '').toLowerCase();
  return slug && year ? `${slug}${year}` : fallback;
}

/** One layout for every upstream: title, author, year first, then the rest as received, names aligned; macros (month) stay bare. */
const LEADING_FIELDS = ['title', 'author', 'year'];
function formatEntry(type: string, key: string, fields: BibFieldValue[]): string {
  const ordered = [...LEADING_FIELDS.flatMap((n) => fields.filter((f) => f.name === n)), ...fields.filter((f) => !LEADING_FIELDS.includes(f.name))];
  const width = Math.max(0, ...ordered.map((f) => f.name.length));
  const lines = ordered.map((f) => `  ${f.name.padEnd(width)} = ${f.bare && !/^\d+$/.test(f.value) ? f.value : `{${f.value}}`},`);
  return `@${type}{${key},\n${lines.join('\n')}\n}`;
}

/**
 * Sanitize a raw BibTeX blob (e.g. CrossRef via doi.org) so the entry
 * compiles: decode HTML entities, drop or map what pdflatex cannot typeset,
 * escape bare & / % inside brace-delimited values (a bare `&` is read by
 * LaTeX as an alignment tab — the classic broken-.bib bug), fix month
 * macros, then re-key and lay the entry out like a synthesized one.
 */
function sanitizeBibtex(bib: string): string {
  const safe = normalizeMonths(pdflatexSafe(unescapeHtml(bib)).replace(/(\\?)([&%])/g, (_, bs, ch) => (bs ? bs + ch : `\\${ch}`)));
  const parsed = parseEntry(safe);
  return parsed ? formatEntry(parsed.type, entryKey(parsed.fields, parsed.key), parsed.fields) : safe;
}

export interface SearchHit { id: string; doi: string | null; title: string; authors: string; year: number | null; venue: string }

/** Full-text search across OpenAlex (250M+ works, no key). */
export async function searchWorks(query: string, limit = 12): Promise<SearchHit[]> {
  const url = `${OPENALEX_BASE}/works?search=${encodeURIComponent(query)}&per_page=${limit}&mailto=aldine@localhost`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Search failed (HTTP ${res.status})`);
  const data = JSON.parse(await readCapped(res, 4 * 1024 * 1024)) as { results?: Array<Record<string, unknown>> };
  return (data.results || []).map((w) => {
    const authorships = (w.authorships as Array<{ author?: { display_name?: string } }> | undefined) || [];
    const authors = authorships.slice(0, 4).map((a) => a.author?.display_name).filter(Boolean).join(', ') + (authorships.length > 4 ? ', et al.' : '');
    const loc = (w.primary_location as { source?: { display_name?: string } } | undefined)?.source?.display_name;
    return {
      id: String(w.id || '').split('/').pop() || '',
      doi: w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//, '') : null,
      title: String(w.title || w.display_name || 'Untitled'),
      authors,
      year: (w.publication_year as number) ?? null,
      venue: loc || '',
    };
  });
}

/** BibTeX for an OpenAlex work id (Wxxxx): prefer its DOI, else synthesize from metadata. */
async function fetchOpenAlex(id: string): Promise<string | null> {
  const res = await fetch(`${OPENALEX_BASE}/works/${encodeURIComponent(id)}?mailto=aldine@localhost`);
  if (notRegistered(res)) return null;
  if (!res.ok) throw new Error(`OpenAlex lookup failed (HTTP ${res.status})`);
  const w = JSON.parse(await readCapped(res)) as Record<string, unknown>;
  const doi = w.doi ? String(w.doi).replace(/^https?:\/\/doi\.org\//, '') : null;
  if (doi) { try { const b = await fetchDoi(doi); if (b) return b; } catch { /* fall through to synthesis */ } }
  const authorships = (w.authorships as Array<{ author?: { display_name?: string } }> | undefined) || [];
  const authorField = authorships.map((a) => {
    const n = a.author?.display_name || '';
    const parts = n.split(' ');
    const last = parts.pop();
    return last ? `${last}, ${parts.join(' ')}` : n;
  }).join(' and ');
  const year = (w.publication_year as number) ?? '';
  const title = String(w.title || w.display_name || 'Untitled');
  const venue = (w.primary_location as { source?: { display_name?: string } } | undefined)?.source?.display_name || '';
  const fields: BibFieldValue[] = [
    { name: 'title', value: bibField(title), bare: false },
    { name: 'author', value: bibField(authorField), bare: false },
    { name: 'year', value: String(year), bare: false },
    ...(venue ? [{ name: 'journaltitle', value: bibField(venue), bare: false }] : []),
    { name: 'url', value: String(w.id), bare: false },
  ];
  return formatEntry('article', entryKey(fields, `anon${year}`), fields);
}

export async function fetchBibEntry(query: string): Promise<string | null> {
  // OpenAlex work id (openalex:W… or a full openalex.org/W… URL)
  const oa = query.match(/(?:openalex[:/]|openalex\.org\/)?(W\d{2,})/i);
  if (/openalex/i.test(query) && oa) return fetchOpenAlex(oa[1]);

  // A real DOI (starts with 10.) wins even if it mentions arXiv (e.g. 10.48550/arXiv.1706.03762).
  const doiMatch = query.match(DOI_RE);
  if (doiMatch) return fetchDoi(doiMatch[0]);

  // an explicit arXiv reference or a bare arXiv id
  const arxiv = query.match(ARXIV_RE);
  if (arxiv) return fetchArxiv(arxiv[1]);

  // a bare OpenAlex id
  if (oa) return fetchOpenAlex(oa[1]);
  return null;
}

/** 404/410 is a resolver's answer that the id is not registered — a wrong
 *  identifier the caller can fix, not an outage to relay (5xx, 429 are). */
function notRegistered(res: Response): boolean {
  return res.status === 404 || res.status === 410;
}

/** Stream a response body and abort as soon as it exceeds the cap (a chunked/
 *  unknown-length upstream can't OOM us by omitting content-length). */
async function readCapped(res: Response, cap = 2 * 1024 * 1024): Promise<string> {
  const len = Number(res.headers.get('content-length') || 0);
  if (len && len > cap) throw new Error('reference response too large');
  if (!res.body) return (await res.text()).slice(0, cap);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) { await reader.cancel(); throw new Error('reference response too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchDoi(doi: string): Promise<string | null> {
  const res = await fetch(`${DOI_BASE}/${encodeURIComponent(doi)}`, {
    headers: { Accept: 'application/x-bibtex; charset=utf-8' },
    redirect: 'follow',
  });
  if (notRegistered(res)) return null;
  if (!res.ok) throw new Error(`DOI lookup failed (HTTP ${res.status})`);
  const bib = (await readCapped(res)).trim();
  return bib.startsWith('@') ? sanitizeBibtex(bib) : null;
}

async function fetchArxiv(id: string): Promise<string | null> {
  const res = await fetch(`${ARXIV_BASE}/api/query?id_list=${encodeURIComponent(id)}`);
  if (notRegistered(res)) return null;
  if (!res.ok) throw new Error(`arXiv lookup failed (HTTP ${res.status})`);
  const feed = await readCapped(res);
  // parse within the <entry> element only — the feed also has its own <title>
  const xml = (feed.match(/<entry>([\s\S]*?)<\/entry>/) || [])[1];
  if (!xml) return null;
  const pick = (tag: string) => (xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) || [])[1]?.trim();
  const title = pick('title')?.replace(/\s+/g, ' ');
  if (!title) return null;
  const published = pick('published') || '';
  const year = published.slice(0, 4);
  const authors = Array.from(xml.matchAll(/<name>([^<]+)<\/name>/g)).map((m) => m[1].trim());
  const authorField = authors.map((a) => {
    const parts = a.split(' ');
    const last = parts.pop();
    return `${last}, ${parts.join(' ')}`;
  }).join(' and ');
  const fields: BibFieldValue[] = [
    { name: 'title', value: bibField(title), bare: false },
    { name: 'author', value: bibField(authorField), bare: false },
    { name: 'year', value: year, bare: false },
    { name: 'eprint', value: id, bare: false },
    { name: 'archiveprefix', value: 'arXiv', bare: false },
    { name: 'url', value: `https://arxiv.org/abs/${id}`, bare: false },
  ];
  return formatEntry('article', entryKey(fields, `anon${year}`), fields);
}

/**
 * The identifiers an entry carries, comparable across upstreams and key
 * styles: its DOI (from `doi`, or a doi.org `url`), case-folded as the DOI
 * system is, and its arXiv `eprint`. Entries added before the one key rule
 * keep their upstream key (`LeCun_2015`), so a key match alone would miss
 * them.
 */
const ID_FIELD_RE = /\b(doi|eprint|url)\s*=\s*(?:\{([^}]*)\}|"([^"]*)")/gi;
const DOI_URL_RE = /^https?:\/\/(?:dx\.)?doi\.org\//i;
function entryIdentifiers(entry: string): Set<string> {
  const ids = new Set<string>();
  for (const m of entry.matchAll(ID_FIELD_RE)) {
    const name = m[1].toLowerCase();
    const value = (m[2] ?? m[3] ?? '').trim();
    if (!value) continue;
    if (name === 'eprint') ids.add(`eprint:${value}`);
    else if (name === 'doi' || DOI_URL_RE.test(value)) ids.add(`doi:${value.replace(DOI_URL_RE, '').toLowerCase()}`);
  }
  return ids;
}

/** The key of the first entry in `source` sharing an identifier with `entry`, if any. */
function entryWithSameIdentifier(source: string, entry: string): string | null {
  const wanted = entryIdentifiers(entry);
  if (!wanted.size) return null;
  const starts = [...source.matchAll(/@([a-zA-Z]+)\s*\{\s*([^,\s]+)\s*,/g)];
  for (let i = 0; i < starts.length; i++) {
    const s = starts[i];
    if (['comment', 'preamble', 'string'].includes(s[1].toLowerCase())) continue;
    const body = source.slice(s.index!, starts[i + 1]?.index ?? source.length);
    for (const id of entryIdentifiers(body)) if (wanted.has(id)) return s[2];
  }
  return null;
}

/** `created`: the .bib did not exist before this call (folders included). */
export interface AddedReference { key: string; bibFile: string; duplicate: boolean; created: boolean }

/**
 * Look a query up and append the entry to `bibFile` on the branch (created
 * if missing), skipping a key that is already there. Shared by the REST
 * route and the MCP tool — the caller validates `bibFile` and takes the
 * rate-limit token. Returns null when nothing resolves; upstream failures
 * throw with a user-readable message. With `author` set the write is
 * checkpointed and committed at once like every other agent mutation, so
 * the attributed commit carries only the new entry. `beforeWrite` runs
 * right before the file is written — and not at all when nothing is.
 */
export async function addReference(projectId: string, branch: string, query: string, bibFile: string, author?: string, beforeWrite?: () => void): Promise<AddedReference | null> {
  const entry = await fetchBibEntry(query.trim());
  if (!entry) return null;
  return appendReference(projectId, branch, bibFile, entry, author, beforeWrite);
}

/**
 * The one collab-safe .bib append (read → dedup → write → push the new disk
 * content into open Yjs docs → commit). Synchronous body on purpose: with an
 * author it runs inside the repo lock, and an await between the write and
 * the commit's snapshot would let a keystroke into the attributed commit.
 */
async function appendReference(projectId: string, branch: string, bibFile: string, entry: string, author?: string, beforeWrite?: () => void): Promise<AddedReference | null> {
  await ensureWorktree(projectId, branch);
  const append = (): AddedReference & { before: Buffer | null; after: string } => {
    let before: Buffer | null = null;
    try { before = store.readFile(projectId, branch, bibFile); } catch { /* new file */ }
    const existing = before?.toString('utf8') ?? null;
    // Dedup on the key via the shared bibKeys scanner (consistent with the
    // /bib index: skips @comment/@string) and on the DOI / eprint, which
    // finds the same paper under an older key style; the existing key is
    // reported so the caller cites that one.
    const key = [...bibKeys(entry)][0] ?? '';
    const present = key && bibKeys(existing ?? '').has(key) ? key : entryWithSameIdentifier(existing ?? '', entry);
    if (present) return { key: present, bibFile, duplicate: true, created: false, before, after: existing ?? '' };
    const after = (existing ?? '').trimEnd() + '\n\n' + entry.trim() + '\n';
    beforeWrite?.();
    store.writeFile(projectId, branch, bibFile, after);
    refreshBranchDocsFromDisk(projectId, branch, [bibFile]);
    if (!author) scheduleCommit(projectId, branch);
    return { key, bibFile, duplicate: false, created: existing === null, before, after };
  };
  if (!author) { const { key, duplicate, created } = append(); return { key, bibFile, duplicate, created }; }
  return withRepoLock(projectId, async () => {
    flushBranchDocs(projectId, branch);
    await checkpointPathsHeld(projectId, branch, [bibFile]);
    flushBranchDocs(projectId, branch);
    const { key, duplicate, created, before, after } = append();
    if (!duplicate) await commitAgentWrite(projectId, branch, [{ path: bibFile, before, after }], `Add reference ${key || bibFile}`);
    return { key, bibFile, duplicate, created };
  });
}

// ---------- GB/T 7714-2025 (the Chinese national standard; CNKI exports it) ----------

/** Type markers per GB/T 7714-2025 table 8, fullwidth brackets tolerated. */
const GBT_MARKER_RE = /[\[［]\s*([A-Z]{1,2}(?:\/OL)?)\s*[\]］]/;
const GBT_STRIP_PREFIX_RE = /^\s*[\[［]\d+[\]］]\s*/;

/** CNKI-style cite key: initials of the source (pinyin for CJK, word initials
 *  for Latin, ≤4, upper) + year + issue (2) + first page (3). CNKI's own tail
 *  digit is a database sequence nobody outside CNKI can derive; the first
 *  page is the closest stable stand-in, and keys are opaque to the compiler. */
function gbtKey(source: string, title: string, year: string, issue: string, firstPage: string): string {
  const src = (source || title).trim();
  const initials = /\p{Script=Han}/u.test(src)
    ? pinyin(src, { pattern: 'first', type: 'array', nonZh: 'consecutive' }).join('')
    : src.split(/\s+/).map((w) => w.charAt(0)).join('');
  return (initials.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'REF')
    + (year || '0000') + issue.padStart(2, '0') + firstPage.padStart(3, '0');
}

/**
 * Parse one GB/T 7714-2025 reference string into a BibTeX entry, anchored on
 * the `[J]`-style type marker — never on dots, which appear inside titles.
 * Null when no marker is found: the caller turns that into a 422 the user
 * can act on. Values keep their original bytes (CJK, 《》, ——) through
 * bibField like every other entry source.
 */
export function parseGbt7714(citation: string): { type: string; key: string; fields: BibFieldValue[] } | null {
  const s = GBT_STRIP_PREFIX_RE.test(citation) ? citation.replace(GBT_STRIP_PREFIX_RE, '') : citation.trim();
  const marker = GBT_MARKER_RE.exec(s);
  if (!marker) return null;
  const kind = marker[1];
  const head = s.slice(0, marker.index).trim();
  let tail = s.slice(marker.index + marker[0].length).trim().replace(/^[.．。,，;；、\s]+/, '');

  // Trailing identifier tokens come off first: DOI:, an URL, 引文日期, ISSN/ISBN.
  const ids: Record<string, string> = {};
  const take = (re: RegExp, into: string): void => {
    const m = re.exec(tail);
    if (m) { ids[into] = m[1].trim().replace(/[.．。，,]+$/, ''); tail = (tail.slice(0, m.index) + tail.slice(m.index + m[0].length)).trim(); }
  };
  take(/DOI[:：]\s*(\S+)/i, 'doi');
  // URLs never contain Han; excluding it stops the value at a trailing 引文日期 token
  take(/(https?:\/\/[^\s，。；;\u4e00-\u9fff]+)/i, 'url');
  take(/引文日期[:：]?\s*([\d-]+)/, 'urldate');
  take(/ISSN[:：]?\s*([\dXx-]+)/, 'issn');
  take(/ISBN[:：]?\s*([\d-]+)/, 'isbn');

  // Head: authors up to the first sentence dot, then the title. A 《…》 title
  // may contain dots, so when it starts before that dot the split moves past
  // the closing 》.
  const firstDot = head.search(/[.．。]/);
  const bookish = head.indexOf('《');
  const splitAt = firstDot === -1 ? head.length
    : bookish !== -1 && bookish < firstDot ? head.indexOf('》', bookish) + 1 || head.length
    : firstDot;
  const authorPart = head.slice(0, splitAt).replace(/[.．。,，]\s*$/, '').trim();
  const titlePart = head.slice(splitAt).replace(/^[.．。\s]+/, '').trim();
  if (!titlePart) return null;
  const authors = authorPart.split(/[,，;；]/).map((a) => a.trim()).filter(Boolean)
    .map((a) => (/^(等|et\s*al\.?)$/i.test(a) ? 'others' : a))
    .join(' and ');

  // Tail per family: journal `source,year,vol(issue):pages` (issue optional);
  // book/thesis `place:publisher,year:pages`.
  let sourceName = '';
  let year = '';
  let volume = '';
  let issue = '';
  let pages = '';
  let place = '';
  let publisher = '';
  const jm = tail.match(/^(.*?)[,，]\s*(\d{4})\s*[,，]?\s*(\d+)?\s*[（(]\s*([\d+-]+)\s*[)）]\s*[：:]\s*([\d+\-–—~～,，\s]+)/);
  const jmNoIssue = tail.match(/^(.*?)[,，]\s*(\d{4})\s*[,，]?\s*(\d+)?\s*(?:[（(]\s*[\d+-]+\s*[)）]\s*)?[：:]\s*([\d+\-–—~～,，\s]+)/);
  const bm = tail.match(/^(?:([^:：]{2,20}?)[:：]\s*)?(.+?)[,，]\s*(\d{4})(?:\s*[：:]\s*([\d+\-–—]+))?\s*[.．]?\s*$/);
  if (bm && /^[MCS]/.test(kind)) {
    place = (bm[1] ?? '').trim();
    publisher = (bm[2] ?? '').trim();
    year = bm[3] ?? '';
    pages = (bm[4] ?? '').replace(/[\s,，]/g, '');
  } else if (jm) {
    sourceName = jm[1].trim(); year = jm[2]; volume = jm[3] ?? ''; issue = jm[4] ?? ''; pages = jm[5].replace(/[\s,，]/g, '');
  } else if (jmNoIssue) {
    sourceName = jmNoIssue[1].trim(); year = jmNoIssue[2]; volume = jmNoIssue[3] ?? ''; pages = jmNoIssue[4].replace(/[\s,，]/g, '');
  } else {
    const sm = tail.match(/^(.+?)[,，;；.。]/);
    sourceName = (sm?.[1] ?? tail).trim();
    year = tail.match(/(\d{4})/)?.[1] ?? '';
  }
  if (!sourceName && !publisher) return null;
  if (/^D/.test(kind)) sourceName = sourceName.replace(/^[^:：]{1,10}[:：]\s*/, ''); // `place:school,year`

  const firstPage = (pages.match(/\d+/) ?? [''])[0];
  const F = (name: string, value: string): BibFieldValue => ({ name, value: bibField(value), bare: false });
  const key = gbtKey(sourceName || publisher, titlePart, year, issue, firstPage);
  const fields: BibFieldValue[] = [
    F('title', titlePart),
    ...(authors ? [F('author', authors)] : []),
    ...(year ? [{ name: 'year', value: year, bare: false }] : []),
  ];
  const extra = (pairs: Array<[string, string]>): void => { for (const [n, v] of pairs) if (v) fields.push(F(n, v)); };
  if (/^[JN]/.test(kind)) {
    extra([['journaltitle', sourceName], ['volume', volume], ['number', issue], ['pages', pages]]);
  } else if (/^M/.test(kind)) {
    extra([['publisher', publisher], ['address', place], ['pages', pages]]);
  } else if (/^C/.test(kind)) {
    extra([['booktitle', sourceName || publisher], ['pages', pages]]);
  } else if (/^D/.test(kind)) {
    extra([['school', sourceName]]);
  } else if (/^S/.test(kind) || /^P/.test(kind)) {
    extra([['number', (tail.match(/[\d.]+(?:[-—][\d.]+)?\s*$/)?.[1] ?? '').trim()], ['organization', sourceName]]);
  } else {
    extra([['howpublished', sourceName]]);
  }
  extra([['doi', ids.doi ?? ''], ['issn', ids.issn ?? ''], ['isbn', ids.isbn ?? ''], ['url', ids.url ?? ''], ['urldate', ids.urldate ?? '']]);
  const type = /^[JN]/.test(kind) ? 'article'
    : /^M/.test(kind) ? 'book'
    : /^C/.test(kind) ? 'inproceedings'
    : /^D/.test(kind) ? (/硕士/.test(sourceName) ? 'mastersthesis' : 'phdthesis')
    : 'misc';
  return { type, key, fields };
}

/**
 * Where an appended entry belongs: the first .bib the root file actually
 * loads (\addbibresource / \bibliography) that exists on disk and is not
 * the Zotero-managed file, else the first other existing .bib, else the
 * classic root-sibling references.bib (created by the write). The old
 * `references.bib` default landed entries in a file the document never reads
 * whenever a project already had its own .bib.
 */
export async function resolveAppendBib(projectId: string, branch: string, meta: store.ProjectMeta): Promise<string> {
  flushBranchDocs(projectId, branch);
  const zotero = meta.zotero?.bibFile;
  const exists = (p: string): boolean => { try { store.readFile(projectId, branch, p); return true; } catch { return false; } };
  let root = '';
  try { root = store.readFile(projectId, branch, meta.rootFile).toString('utf8'); } catch { /* no root yet */ }
  const referenced: string[] = [];
  for (const m of root.matchAll(/\\(?:addbibresource|bibliography)\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g)) {
    for (const raw of m[1].split(',')) {
      const p = raw.trim().replace(/^\.\//, '');
      if (p) referenced.push(/\.bib$/i.test(p) ? p : `${p}.bib`);
    }
  }
  const candidates = referenced.filter((p) => p !== zotero && exists(p));
  if (candidates.length) return candidates[0];
  const existing = store.listFiles(projectId, branch)
    .filter((f) => f.type === 'file' && f.path.endsWith('.bib') && f.path !== zotero)
    .map((f) => f.path).sort();
  return existing[0] ?? rootSiblingBib(meta.rootFile);
}

function rootSiblingBib(rootFile: string): string {
  const slash = rootFile.lastIndexOf('/');
  return slash === -1 ? 'references.bib' : `${rootFile.slice(0, slash + 1)}references.bib`;
}

/** The string carried no GB/T 7714 type marker — a 422 the user can fix, unlike a write failure. */
export class GbtParseError extends Error {}

export async function addGbtReference(projectId: string, branch: string, citation: string, bibFile?: string): Promise<AddedReference> {
  // A leading `@` is raw BibTeX (the user already has the entry); anything
  // else is parsed as a GB/T 7714-2025 citation string.
  const raw = citation.trim();
  let entry: string;
  if (raw.startsWith('@')) {
    entry = sanitizeBibtex(raw);
    if (!parseEntry(entry)) throw new GbtParseError('Could not parse that as a BibTeX entry — expected @type{key, field = {value}, …}');
  } else {
    const parsed = parseGbt7714(raw);
    if (!parsed) throw new GbtParseError('Could not parse that as a GB/T 7714 reference — expected 作者.题名[类型].来源,年,(期):页码.DOI:…');
    entry = formatEntry(parsed.type, parsed.key, parsed.fields);
  }
  const meta = await store.readMeta(projectId);
  const target = bibFile || await resolveAppendBib(projectId, branch, meta);
  // A key collision with a different paper gets a suffix; the same DOI is a
  // duplicate and never reaches the write.
  let before: Buffer | null = null;
  try { before = store.readFile(projectId, branch, target); } catch { /* new file */ }
  const existingKeys = bibKeys(before?.toString('utf8') ?? '');
  const key = [...bibKeys(entry)][0] ?? '';
  if (key && existingKeys.has(key)) {
    const same = entryWithSameIdentifier(before?.toString('utf8') ?? '', entry);
    if (same) return { key: same, bibFile: target, duplicate: true, created: false };
    const re = new RegExp(`@([a-zA-Z]+)\\s*\\{\\s*${key}\\s*,`);
    for (const suffix of 'abcdefghij') {
      if (!existingKeys.has(key + suffix)) { entry = entry.replace(re, `@$1{${key}${suffix},`); break; }
    }
  }
  const added = await appendReference(projectId, branch, target, entry);
  if (!added) throw new Error('Could not append the reference'); // unreachable: appendReference only nulls on a null entry
  return added;
}
