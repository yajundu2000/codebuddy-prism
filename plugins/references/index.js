/** Add-a-reference-by-DOI/arXiv plugin. Proves a second plugin extends Aldine. */

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
      onShow() {
        // The bibliography is the thing this panel works on: open the first
        // non-Zotero .bib in the editor so a paste lands where the user sees it.
        aldine.project.refreshFiles().then((files) => {
          const bib = (Array.isArray(files) ? files : []).find((f) => f.type === 'file' && f.path.endsWith('.bib') && !f.path.endsWith('zotero.bib'));
          if (bib) aldine.project.openFile(bib.path);
        }).catch(() => {});
      },
      render(root) {
        let busy = false;
        let query = '';
        let citation = '';
        let gbtBusy = false;
        let searchTerm = '';
        let results = [];
        let searching = false;
        let searchSeq = 0;

        const addQuery = async (q, label) => {
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
              aldine.editor.insertAtCursor(`\\cite{${body.key}}`);
              aldine.toast(body.duplicate ? `Already in bibliography — inserted \\cite{${body.key}}` : `Added ${body.key} and inserted citation`, 'ok');
            }
          } catch (err) {
            aldine.toast(`${label || 'Lookup'} failed: ${err.message}`, 'error');
          }
          busy = false; draw();
        };

        const add = () => { const q = query.trim(); if (q) { query = ''; addQuery(q, 'Lookup'); } };

        // GB/T 7714-2025 paste → BibTeX: offline parse, appended to the
        // project's bibliography (the server resolves which .bib that is).
        const addGbt = async () => {
          const c = citation.trim();
          if (!c || gbtBusy) return;
          gbtBusy = true; draw();
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
            if (body.bibFile) aldine.project.openFile(body.bibFile);
            aldine.toast(body.duplicate ? `Already in bibliography — ${body.key}` : `Added ${body.key} to ${body.bibFile}`, 'ok');
          } catch (err) {
            aldine.toast(err.message, 'error');
          }
          gbtBusy = false; draw();
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

        const cite = (hit) => addQuery(hit.doi || `openalex:${hit.id}`, 'Add');

        function draw() {
          const wrap = h('div', { class: 'panel-list', dataset: { testid: 'references-panel' }, style: { display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 6px' } });

          // --- search 250M+ papers ---
          wrap.append(
            h('div', { class: 'menu__label', style: { padding: '0 2px' } }, 'Search papers'),
            h('input', {
              class: 'input',
              placeholder: 'Title, author, keywords…',
              style: { width: '100%' },
              dataset: { testid: 'reference-search' },
              value: searchTerm,
              oninput: (e) => onSearchInput(e.target.value),
            }),
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

          // --- GB/T 7714-2025 paste ---
          wrap.append(
            h('div', { class: 'menu__label', style: { padding: '10px 2px 0' } }, 'Or paste a GB/T 7714 reference'),
            h('textarea', {
              class: 'input',
              placeholder: '[1]董丁槊,刘荣.《黑神话：悟空》对外传播效果探究[J].新传奇,2026,(37):47-49.DOI:…',
              style: { width: '100%', height: '72px', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 },
              dataset: { testid: 'gbt-citation-input' },
              oninput: (e) => { citation = e.target.value; },
            }, citation),
            h('button', {
              class: 'btn btn--primary',
              style: { width: '100%', justifyContent: 'center' },
              dataset: { testid: 'gbt-add' },
              disabled: gbtBusy ? '' : null,
              onclick: addGbt,
            }, gbtBusy ? 'Adding…' : 'Convert & add'),
          );

          // --- add by identifier ---
          wrap.append(
            h('div', { class: 'menu__label', style: { padding: '10px 2px 0' } }, 'Or add by identifier'),
            h('input', {
              class: 'input',
              placeholder: '10.1145/… · arXiv:2401.01234',
              style: { width: '100%' },
              dataset: { testid: 'reference-query' },
              value: query,
              oninput: (e) => { query = e.target.value; },
              onkeydown: (e) => { if (e.key === 'Enter') add(); },
            }),
            h('button', {
              class: 'btn btn--primary',
              style: { width: '100%', justifyContent: 'center' },
              dataset: { testid: 'reference-add' },
              disabled: busy ? '' : null,
              onclick: add,
            }, busy ? 'Fetching…' : 'Add & cite'),
          );

          root.replaceChildren(wrap);
        }

        draw();
      },
    });
  },
};
