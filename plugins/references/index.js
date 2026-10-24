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
      onShow() {
        // The bibliography is the thing this panel works on: open the first
        // non-Zotero .bib in the editor so a paste lands where the user sees it.
        aldine.project.refreshFiles().then((files) => {
          const bib = (Array.isArray(files) ? files : []).find((f) => f.type === 'file' && f.path.endsWith('.bib') && !f.path.endsWith('zotero.bib'));
          if (bib) aldine.project.openFile(bib.path);
        }).catch(() => {});
      },
      render(root) {
        let citation = '';
        let busy = false;

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
            if (body.bibFile) aldine.project.openFile(body.bibFile);
            aldine.toast(body.duplicate ? `Already in bibliography — ${body.key}` : `Added ${body.key} to ${body.bibFile}`, 'ok');
          } catch (err) {
            aldine.toast(err.message, 'error');
          }
          busy = false; draw();
        };

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

          root.replaceChildren(wrap);
        }

        draw();
      },
    });
  },
};
