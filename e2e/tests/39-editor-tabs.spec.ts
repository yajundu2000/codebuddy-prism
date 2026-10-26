import { test, expect } from '../fixtures';
import { createProject, openProject, cleanup } from './helpers';

test.describe('editor tabs', () => {
  const put = (request: any, id: string, path: string, content: string) =>
    request.put(`/api/projects/${id}/file`, { data: { branch: 'main', path, content } });

  test('opening files adds tabs; clicking switches; exactly one editor pane is mounted', async ({ page, request }) => {
    const id = await createProject(request, 'Tabs Basics');
    try {
      for (const [p, c] of Object.entries({
        'main.tex': 'MAIN-BODY\n',
        'a.tex': 'AAA\n',
        'b.tex': 'BBB\n',
      })) await put(request, id, p, c);
      await openProject(page, id);
      await expect(page.getByTestId('etab-main.tex')).toBeVisible();
      // open two more from the tree — three tabs, order = open order
      await page.getByTestId('file-a.tex').click();
      await page.getByTestId('file-b.tex').click();
      await expect(page.getByTestId('etab-main.tex')).toBeVisible();
      await expect(page.getByTestId('etab-a.tex')).toBeVisible();
      await expect(page.getByTestId('etab-b.tex')).toBeVisible();
      await expect(page.getByTestId('active-file')).toHaveText('b.tex');
      // switching is a tab click; the full path stays authoritative in the header
      await page.getByTestId('etab-a.tex').click();
      await expect(page.getByTestId('active-file')).toHaveText('a.tex');
      await expect(page.locator('.cm-content')).toContainText('AAA');
      // only the active pane is in the DOM — dozens of specs assert on bare
      // .cm-content, so a second mounted pane would break them all
      await expect(page.locator('.cm-content')).toHaveCount(1);
    } finally { await cleanup(request, id); }
  });

  test('switching away and back restores the cursor line and scroll', async ({ page, request }) => {
    const id = await createProject(request, 'Tabs State');
    try {
      const lines = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\n');
      await put(request, id, 'long.tex', lines);
      await put(request, id, 'b.tex', 'BBB\n');
      await openProject(page, id);
      await page.getByTestId('file-long.tex').click();
      await expect(page.locator('.cm-content')).toContainText('line 1');
      // park the cursor on line 120 and scroll to it
      await page.getByTestId('code-pane').click();
      await page.keyboard.press('Control+Home');
      for (let i = 0; i < 119; i++) await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Control+l'); // CM: select line → active line visible
      const activeBefore = await page.locator('.cm-activeLine').innerText();
      const scrollBefore = await page.evaluate(() => (document.querySelector('.cm-scroller') as HTMLElement).scrollTop);
      expect(scrollBefore).toBeGreaterThan(100);
      // switch away and back — the pane remounts, the stash should land us where we were
      await page.getByTestId('file-b.tex').click();
      await expect(page.locator('.cm-content')).toContainText('BBB');
      await page.getByTestId('etab-long.tex').click();
      await expect(page.locator('.cm-content')).toContainText('line 120');
      await expect(page.locator('.cm-activeLine')).toHaveText(activeBefore);
      const scrollAfter = await page.evaluate(() => (document.querySelector('.cm-scroller') as HTMLElement).scrollTop);
      // within two lines — CM re-anchors the scroll by a line on re-layout
      expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(48);
    } finally { await cleanup(request, id); }
  });

  test('closing tabs: neighbour activates, last close empties the editor', async ({ page, request }) => {
    const id = await createProject(request, 'Tabs Close');
    try {
      for (const [p, c] of Object.entries({
        'main.tex': 'MAIN\n', 'a.tex': 'AAA\n', 'b.tex': 'BBB\n',
      })) await put(request, id, p, c);
      await openProject(page, id);
      await page.getByTestId('file-a.tex').click();
      await page.getByTestId('file-b.tex').click();
      // close the active tab (b) → the left neighbour (a) activates
      await page.getByTestId('etab-close-b.tex').click();
      await expect(page.getByTestId('etab-b.tex')).toHaveCount(0);
      await expect(page.getByTestId('active-file')).toHaveText('a.tex');
      // close the rest → empty state
      await page.getByTestId('etab-close-a.tex').click();
      await page.getByTestId('etab-close-main.tex').click();
      await expect(page.getByTestId('editor-tabs')).toHaveCount(0);
      await expect(page.getByTestId('active-file')).toHaveCount(0);
      await expect(page.locator('.pane--editor')).toContainText('Select a file');
    } finally { await cleanup(request, id); }
  });

  test('renaming an open file retitles its tab; deleting closes it', async ({ page, request }) => {
    const id = await createProject(request, 'Tabs Rename Delete');
    try {
      await put(request, id, 'main.tex', 'MAIN\n');
      await put(request, id, 'other.tex', 'OTHER\n');
      await openProject(page, id);
      await page.getByTestId('file-other.tex').click();
      // rename the open file via the tree menu
      await page.getByTestId('file-other.tex').click({ button: 'right' });
      await page.getByTestId('file-menu-rename').click();
      await page.getByTestId('dialog-input').fill('renamed.tex');
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByTestId('etab-renamed.tex')).toBeVisible();
      await expect(page.getByTestId('active-file')).toHaveText('renamed.tex');
      // delete it via the menu → its tab closes and the neighbour activates
      await page.getByTestId('file-renamed.tex').click({ button: 'right' });
      await page.getByTestId('file-menu-delete').click();
      await page.getByTestId('dialog-confirm').click();
      await expect(page.getByTestId('etab-renamed.tex')).toHaveCount(0);
      await expect(page.getByTestId('active-file')).toHaveText('main.tex');
    } finally { await cleanup(request, id); }
  });

  test('a file deleted from another tab is dropped from the tab bar', async ({ page, request }) => {
    const id = await createProject(request, 'Tabs Remote Delete');
    try {
      await put(request, id, 'main.tex', 'MAIN\n');
      await put(request, id, 'chapter2.tex', 'CH2\n');
      await openProject(page, id);
      await page.getByTestId('file-chapter2.tex').click();
      await expect(page.getByTestId('etab-chapter2.tex')).toBeVisible();
      await request.delete(`/api/projects/${id}/file?branch=main&path=chapter2.tex`);
      // the files-signal refetch drops the stale tab and moves the editor off it
      await expect(page.getByTestId('etab-chapter2.tex')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByTestId('active-file')).toHaveText('main.tex');
      await expect(page.locator('.cm-content')).toHaveCount(1);
    } finally { await cleanup(request, id); }
  });
});
