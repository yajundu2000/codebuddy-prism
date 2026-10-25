import { test, expect } from '../fixtures';
import { createProject, openProject, cleanup } from './helpers';

test.describe('nested repos', () => {
  test('file tree renders directories and nested files', async ({ page, request }) => {
    const id = await createProject(request, 'Nested Tree');
    try {
      for (const [p, c] of Object.entries({
        'paper/main.tex': '\\documentclass{article}\\begin{document}x\\end{document}\n',
        'paper/chapters/intro.tex': 'Intro.\n',
        'figs/a.tex': 'fig\n',
      })) await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: p, content: c } });
      await openProject(page, id);
      await expect(page.getByTestId('dir-paper')).toBeVisible();
      await expect(page.getByTestId('dir-paper/chapters')).toBeVisible();
      await expect(page.getByTestId('file-paper/chapters/intro.tex')).toBeVisible();
      // collapse a folder → its child hides
      await page.getByTestId('dir-paper/chapters').click();
      await expect(page.getByTestId('file-paper/chapters/intro.tex')).toHaveCount(0);
    } finally { await cleanup(request, id); }
  });

  test('a root file in a subdirectory compiles (latexmk -cd)', async ({ page, request }) => {
    const id = await createProject(request, 'Subdir Root');
    try {
      await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: 'book/main.tex',
        content: '\\documentclass{article}\\begin{document}\\input{sections/one}\\end{document}\n' } });
      await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: 'book/sections/one.tex', content: 'Hello from a subdir input.\n' } });
      await request.patch(`/api/projects/${id}`, { data: { rootFile: 'book/main.tex' } });
      await openProject(page, id);
      await page.getByTestId('typeset-button').click();
      await expect(page.getByTestId('pdf-status')).toContainText('Typeset in', { timeout: 60_000 });
      await expect(page.locator('canvas.pdf-page').first()).toBeVisible({ timeout: 20_000 });
    } finally { await cleanup(request, id); }
  });
});

test.describe('editor layout', () => {
  test('a long document does not push the page past the viewport', async ({ page, request }) => {
    const id = await createProject(request, 'Long Doc');
    try {
      const long = Array.from({ length: 300 }, (_, i) => `Line ${i + 1} of a very long document.`).join('\n');
      await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: 'main.tex', content: long } });
      await openProject(page, id);
      await expect(page.locator('.cm-content')).toContainText('Line 1', { timeout: 10_000 });
      // the page itself must not scroll — the editor scrolls internally
      const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(overflow).toBeLessThanOrEqual(2);
      await expect(page.getByTestId('typeset-button')).toBeVisible();
    } finally { await cleanup(request, id); }
  });
});

test.describe('file tree clutter', () => {
  test('dot-dirs collapse by default and source-only hides non-source', async ({ page, request }) => {
    const id = await createProject(request, 'Clutter');
    try {
      for (const p of ['paper/main.tex', '.github/workflows/ci.yml', 'Makefile', 'README.md'])
        await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: p, content: 'x\n' } });
      await openProject(page, id);
      // source-only is the default view: Makefile/README hidden, and .github
      // is pruned entirely (it contains no source files)
      await expect(page.getByTestId('file-paper/main.tex')).toBeVisible();
      await expect(page.getByTestId('file-Makefile')).toHaveCount(0);
      await expect(page.getByTestId('dir-.github')).toHaveCount(0);
      // switch to All: non-source files appear…
      await page.getByTestId('source-only').click();
      await expect(page.getByTestId('file-Makefile')).toBeVisible();
      await expect(page.getByTestId('dir-.github')).toBeVisible();
      // …but dot-dirs still start collapsed → the nested file is not shown
      await expect(page.getByTestId('file-.github/workflows/ci.yml')).toHaveCount(0);
    } finally { await cleanup(request, id); }
  });
});

test.describe('file guards (QA regressions)', () => {
  test('create/rename onto an existing name never destroys the file', async ({ request }) => {
    const id = await createProject(request, 'Guards');
    try {
      const before = await (await request.get(`/api/projects/${id}/file?branch=main&path=main.tex`)).text();
      expect(before.length).toBeGreaterThan(0);
      // createOnly onto an existing file → 409, file untouched
      const c = await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: 'main.tex', content: '', createOnly: true } });
      expect(c.status()).toBe(409);
      // rename onto an existing file → 409, both files untouched
      const r = await request.post(`/api/projects/${id}/file/rename`, { data: { branch: 'main', from: 'references.bib', to: 'main.tex' } });
      expect(r.status()).toBe(409);
      const after = await (await request.get(`/api/projects/${id}/file?branch=main&path=main.tex`)).text();
      expect(after).toBe(before);
      const bib = await request.get(`/api/projects/${id}/file?branch=main&path=references.bib`);
      expect(bib.ok()).toBeTruthy();
    } finally {
      await cleanup(request, id);
    }
  });

  test('deleting the typeset root reassigns rootFile to another .tex', async ({ request }) => {
    const id = await createProject(request, 'Root Reassign');
    try {
      await request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path: 'other.tex', content: '\\documentclass{article}\\begin{document}y\\end{document}\n' } });
      const del = await request.delete(`/api/projects/${id}/file?branch=main&path=main.tex`);
      expect((await del.json()).newRoot).toBe('other.tex');
    } finally {
      await cleanup(request, id);
    }
  });
});

test.describe('drag to move', () => {
  const put = (request: any, id: string, path: string, content: string) =>
    request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path, content } });
  const read = async (request: any, id: string, path: string) =>
    (await (await request.get(`/api/projects/${id}/file?branch=main&path=${path}`)).text());

  test('dragging a file into a directory moves it, content intact, no upload overlay', async ({ page, request }) => {
    const id = await createProject(request, 'Drag Into Dir');
    try {
      await put(request, id, 'chapters/intro.tex', 'INTRO-BODY\n');
      await put(request, id, 'loose.tex', 'LOOSE-BODY\n');
      await openProject(page, id);
      await page.getByTestId('file-loose.tex').dragTo(page.getByTestId('dir-chapters'));
      await expect(page.getByTestId('file-chapters/loose.tex')).toBeVisible();
      await expect(page.getByTestId('file-loose.tex')).toHaveCount(0);
      // the OS-file upload overlay must not have claimed the internal drag —
      // a drop on a row never reaches the container, so it would be stuck
      await expect(page.locator('.filetree--drag')).toHaveCount(0);
      await page.getByTestId('file-chapters/loose.tex').click();
      await expect(page.locator('.cm-content')).toContainText('LOOSE-BODY');
    } finally { await cleanup(request, id); }
  });

  test('dropping on a file row lands the file in that row\'s directory', async ({ page, request }) => {
    const id = await createProject(request, 'Drag Onto File');
    try {
      await put(request, id, 'chapters/intro.tex', 'INTRO-BODY\n');
      await put(request, id, 'loose.tex', 'LOOSE-BODY\n');
      await openProject(page, id);
      await page.getByTestId('file-loose.tex').dragTo(page.getByTestId('file-chapters/intro.tex'));
      await expect(page.getByTestId('file-chapters/loose.tex')).toBeVisible();
      await expect(page.getByTestId('file-loose.tex')).toHaveCount(0);
    } finally { await cleanup(request, id); }
  });

  test('dropping on the panel empty space moves the file back to the root', async ({ page, request }) => {
    const id = await createProject(request, 'Drag To Root');
    try {
      await put(request, id, 'chapters/loose.tex', 'LOOSE-BODY\n');
      await put(request, id, 'chapters/intro.tex', 'INTRO-BODY\n');
      await openProject(page, id);
      // the hint line sits in the panel but is not a row → container drop = root
      await page.getByTestId('file-chapters/loose.tex').dragTo(page.locator('.filetree__hint'));
      await expect(page.getByTestId('file-loose.tex')).toBeVisible();
      await expect(page.getByTestId('file-chapters/loose.tex')).toHaveCount(0);
      expect(await read(request, id, 'loose.tex')).toBe('LOOSE-BODY\n');
    } finally { await cleanup(request, id); }
  });

  test('a name collision is refused: toast, both files untouched', async ({ page, request }) => {
    const id = await createProject(request, 'Drag Collision');
    try {
      await put(request, id, 'loose.tex', 'ROOT-BODY\n');
      await put(request, id, 'chapters/loose.tex', 'CHAPTERS-BODY\n');
      await openProject(page, id);
      await page.getByTestId('file-loose.tex').dragTo(page.getByTestId('dir-chapters'));
      await expect(page.locator('.toast__text').filter({ hasText: 'already exists' })).toBeVisible();
      await expect(page.getByTestId('file-loose.tex')).toBeVisible();
      await expect(page.getByTestId('file-chapters/loose.tex')).toBeVisible();
      expect(await read(request, id, 'loose.tex')).toBe('ROOT-BODY\n');
      expect(await read(request, id, 'chapters/loose.tex')).toBe('CHAPTERS-BODY\n');
    } finally { await cleanup(request, id); }
  });

  test('dragging a directory moves its children with it', async ({ page, request }) => {
    const id = await createProject(request, 'Drag Dir');
    try {
      await put(request, id, 'figs/diag.tex', 'DIAG-BODY\n');
      await put(request, id, 'chapters/intro.tex', 'INTRO-BODY\n');
      await openProject(page, id);
      await page.getByTestId('dir-figs').dragTo(page.getByTestId('dir-chapters'));
      await expect(page.getByTestId('dir-chapters/figs')).toBeVisible();
      await expect(page.getByTestId('file-chapters/figs/diag.tex')).toBeVisible();
      await expect(page.getByTestId('dir-figs')).toHaveCount(0);
      await page.getByTestId('file-chapters/figs/diag.tex').click();
      await expect(page.locator('.cm-content')).toContainText('DIAG-BODY');
    } finally { await cleanup(request, id); }
  });

  test('a directory dragged into its own subtree stays put', async ({ page, request }) => {
    const id = await createProject(request, 'Drag Dir Into Self');
    try {
      await put(request, id, 'outer/inner/leaf.tex', 'LEAF\n');
      await put(request, id, 'other.tex', 'OTHER\n');
      await openProject(page, id);
      await page.getByTestId('dir-outer').dragTo(page.getByTestId('dir-outer/inner'));
      await expect(page.getByTestId('dir-outer')).toBeVisible();
      await expect(page.getByTestId('file-outer/inner/leaf.tex')).toBeVisible();
      expect(await read(request, id, 'outer/inner/leaf.tex')).toBe('LEAF\n');
    } finally { await cleanup(request, id); }
  });
});

test.describe('folder context menu', () => {
  const put = (request: any, id: string, path: string, content: string) =>
    request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path, content } });

  test('renaming a folder from its context menu moves its children', async ({ page, request }) => {
    const id = await createProject(request, 'Dir Rename Menu');
    try {
      await put(request, id, 'old/chapter.tex', 'CHAPTER\n');
      await openProject(page, id);
      await page.getByTestId('dir-old').click({ button: 'right' });
      await expect(page.getByTestId('file-menu')).toBeVisible();
      // folder menu offers no "Set as main document"
      await expect(page.getByTestId('file-menu').getByText('Set as main document')).toHaveCount(0);
      await page.getByTestId('file-menu-rename').click();
      await page.getByTestId('dialog-input').fill('new');
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByTestId('dir-new')).toBeVisible();
      await expect(page.getByTestId('file-new/chapter.tex')).toBeVisible();
      const got = await (await request.get(`/api/projects/${id}/file?branch=main&path=new/chapter.tex`)).text();
      expect(got).toBe('CHAPTER\n');
    } finally { await cleanup(request, id); }
  });

  test('deleting a folder removes its children and warns about them', async ({ page, request }) => {
    const id = await createProject(request, 'Dir Delete Menu');
    try {
      await put(request, id, 'gone/inner/leaf.tex', 'LEAF\n');
      await put(request, id, 'gone/other.tex', 'OTHER\n');
      await openProject(page, id);
      await page.getByTestId('dir-gone').click({ button: 'right' });
      await page.getByTestId('file-menu-delete').click();
      // the confirm names the folder's blast radius before anything happens
      await expect(page.getByText('every file inside it')).toBeVisible();
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByTestId('dir-gone')).toHaveCount(0);
      await expect(page.getByTestId('file-gone/inner/leaf.tex')).toHaveCount(0);
      const res = await request.get(`/api/projects/${id}/file?branch=main&path=gone/other.tex`);
      expect(res.status()).toBe(404);
    } finally { await cleanup(request, id); }
  });
});
