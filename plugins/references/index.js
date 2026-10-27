/** Cite plugin: paste a GB/T 7714-2025 reference (CNKI export) as BibTeX. */

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(c));
  return el;
};

export default {
  activate(aldine) {
    aldine.ui.registerSidebarPanel({
      id: 'references',
      title: 'Cite',
      // No onShow file switch: opening the panel must not pull the editor off
      // the prose the user is writing. The .bib opens on demand — when a
      // paste or a search hit lands an entry, at that entry's line.
      render(root) {
        let citation = '';
        let busy = false;
        let searchTerm = '';
        let results = [];
        let searching = false;
        let searchSeq = 0;

        // OpenAlex search → pick a hit → the server fetches its BibTeX and
        // appends it; the \cite lands at the cursor of the open file.
        const addQuery = async (q) => {
          if (!q || busy) return;
          busy = true; draw();
          try {
            const res = await aldine.fetch(`/api/projects/${aldine.project.id}/references/add`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ query: q, branch: aldine.project.branch }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            await aldine.project.refreshFiles();
            if (body.key) {
              // \cite belongs in the prose file at the cursor — NOT in the .bib
              // itself (onShow may have made the .bib the active file)
              if (body.bibFile && aldine.project.activeFile() === body.bibFile) {
                aldine.toast(body.duplicate ? `Already in bibliography — ${body.key}` : `Added ${body.key}; type \\cite{${body.key}} where you cite it`, 'ok');
              } else {
                aldine.editor.insertAtCursor(`\\cite{${body.key}}`);
                aldine.toast(body.duplicate ? `Already in bibliography — inserted \\cite{${body.key}}` : `Added ${body.key} and inserted citation`, 'ok');
              }
              // show the entry where it landed, same as a GB/T paste
              if (body.bibFile) aldine.project.openFile(body.bibFile, body.line);
            }
          } catch (err) {
            aldine.toast(`Lookup failed: ${err.message}`, 'error');
          }
          busy = false; draw();
        };

        // GB/T 7714-2025 paste → BibTeX: offline parse, appended to the
        // project's bibliography (the server resolves which .bib that is).
        const addGbt = async () => {
          const c = citation.trim();
          if (!c || busy) return;
          busy = true; draw();
          try {
            const res = await aldine.fetch(`/api/projects/${aldine.project.id}/references/add-gbt`, {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ citation: c, branch: aldine.project.branch }),
            });
            const body = await res.json();
            if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
            citation = '';
            await aldine.project.refreshFiles();
            if (body.bibFile) aldine.project.openFile(body.bibFile, body.line);
            aldine.toast(body.duplicate ? `Already in bibliography — ${body.key}` : `Added ${body.key} to ${body.bibFile}`, 'ok');
          } catch (err) {
            aldine.toast(err.message, 'error');
          }
          busy = false; draw();
        };

        let searchTimer = null;
        const runSearch = () => {
          const q = searchTerm.trim();
          if (q.length < 3) { results = []; searching = false; draw(); return; }
          const seq = ++searchSeq;
          searching = true; draw();
          aldine.fetch(`/api/references/search?q=${encodeURIComponent(q)}`)
            .then((r) => r.json())
            .then((body) => {
              if (seq !== searchSeq) return;
              results = Array.isArray(body) ? body : [];
              searching = false; draw();
            })
            .catch(() => { if (seq === searchSeq) { searching = false; draw(); } });
        };
        const onSearchInput = (v) => {
          searchTerm = v;
          if (searchTimer) clearTimeout(searchTimer);
          searchTimer = setTimeout(runSearch, 350);
        };

        const cite = (hit) => addQuery(hit.doi || `openalex:${hit.id}`);

        function draw() {
          const wrap = h('div', { class: 'panel-list', dataset: { testid: 'references-panel' }, style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 6px' } });

          wrap.append(
            h('div', { class: 'menu__label', style: { padding: '0 2px' } }, 'Paste a GB/T 7714 reference or a BibTeX entry'),
            h('textarea', {
              class: 'input',
              placeholder: '[1]张三,李四.题名[J].刊名,2026,(37):47-49.DOI:…\n或 @article{key, title = {…}, …}',
              style: { width: '100%', height: '88px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
              dataset: { testid: 'gbt-citation-input' },
              oninput: (e) => { citation = e.target.value; },
            }, citation),
            h('button', {
              class: 'btn btn--primary',
              style: { width: '100%', justifyContent: 'center' },
              dataset: { testid: 'gbt-add' },
              disabled: busy ? '' : null,
              onclick: addGbt,
            }, busy ? 'Adding…' : 'Convert & add'),
          );

          // --- search 250M+ papers (OpenAlex) ---
          wrap.append(
            h('div', { class: 'menu__label', style: { padding: '10px 2px 0' } }, 'Search papers (OpenAlex)'),
            // a textarea, not an input: password managers classify a
            // single-line input as a username field and squeeze the login
            // email into it; multi-line fields are not login candidates
            h('textarea', {
              class: 'input',
              rows: 1,
              placeholder: 'Title, author, keywords…',
              style: { width: '100%', resize: 'none', fontFamily: 'inherit', lineHeight: 1.5 },
              autocomplete: 'off',
              name: 'citation-query',
              dataset: { testid: 'reference-search' },
              onkeydown: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); runSearch(); }
              },
              oninput: (e) => onSearchInput(e.target.value.replace(/\s*\n+\s*/g, ' ')),
            }, searchTerm),
          );
          if (searching) wrap.append(h('div', { class: 'spinner', style: { margin: '6px auto' } }));
          const list = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } });
          for (const hit of results.slice(0, 12)) {
            list.append(h('button', {
              class: 'tree__item',
              style: { height: 'auto', padding: '6px 8px', display: 'block' },
              dataset: { testid: `search-hit-${hit.id}` },
              title: `Insert \\cite for “${hit.title}”`,
              onclick: () => cite(hit),
            },
              h('div', { style: { fontWeight: '600', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, hit.title),
              h('div', { style: { color: 'var(--text-2)', fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                [hit.authors, hit.year, hit.venue].filter(Boolean).join(' · ')),
            ));
          }
          if (results.length) wrap.append(list);

          root.replaceChildren(wrap);
        }

        draw();
      },
    });
  },
};
