import { test, expect } from '../fixtures';
import { createProject, openProject, cleanup } from './helpers';
import { EDIT_QUOTE, EDIT_SUFFIX } from './mock-ai.mjs';

test.describe('assistant panel', () => {
  test('a chat turn edits the file, streams tool cards, opens the review dialog, and Undo reverts the agent commit', async ({ page, request }) => {
    const id = await createProject(request, 'Assistant');
    try {
      await request.put(`/api/projects/${id}/file`, {
        data: { branch: 'main', path: 'main.tex', content: `\\documentclass{article}\n\\begin{document}\n${EDIT_QUOTE}\n\\end{document}\n` },
      });

      const status = await (await request.get('/api/ai/status')).json();
      expect(status.chatConfigured).toBe(true);

      await openProject(page, id);
      await page.getByTestId('tab-chat').click();
      await expect(page.getByTestId('assistant-panel')).toBeVisible();

      await page.getByTestId('assistant-input').fill('Improve the document');
      await page.getByTestId('assistant-send').click();

      // the tool card appears while the turn runs
      await expect(page.getByTestId('assistant-tool').first()).toContainText('edit_file', { timeout: 20_000 });
      // the final prose turn
      await expect(page.getByTestId('assistant-assistant').last()).toContainText('main.tex', { timeout: 20_000 });

      // the existing agent-review dialog opened with the agent commit's diff
      const modal = page.getByTestId('agent-review-modal');
      await expect(modal).toBeVisible({ timeout: 10_000 });
      await expect(modal.getByTestId('agent-review-commit')).toContainText('Append the assistant marker');
      await expect(modal.locator('.diff')).toContainText(EDIT_SUFFIX.split(' ')[0]);

      // Keep is just Close — the file keeps the edit
      await modal.locator('button', { hasText: 'Close' }).click();
      const afterKeep = await (await request.get(`/api/projects/${id}/file?branch=main&path=main.tex`)).text();
      expect(afterKeep).toContain(EDIT_SUFFIX);

      // a second turn re-uses the session; Undo reverts that turn's commit only
      // (the dialog carries the commits made during the turn), so the marker
      // collapses from two to one — the first Keep survives by design.
      await page.getByTestId('assistant-input').fill('again');
      await page.getByTestId('assistant-send').click();
      await expect(page.getByTestId('agent-review-modal')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('agent-revert').click();
      await expect(page.getByTestId('agent-review-modal')).toBeHidden({ timeout: 10_000 });
      const afterRevert = await (await request.get(`/api/projects/${id}/file?branch=main&path=main.tex`)).text();
      expect(afterRevert.split(EDIT_SUFFIX).length - 1).toBe(1);
    } finally {
      await cleanup(request, id);
    }
  });

  test('sessions persist server-side and can be deleted', async ({ page, request }) => {
    const id = await createProject(request, 'Assistant Sessions');
    try {
      await request.put(`/api/projects/${id}/file`, {
        data: { branch: 'main', path: 'main.tex', content: `\\documentclass{article}\n\\begin{document}\n${EDIT_QUOTE}\n\\end{document}\n` },
      });
      await openProject(page, id);
      await page.getByTestId('tab-chat').click();
      await page.getByTestId('assistant-input').fill('hello there');
      await page.getByTestId('assistant-send').click();
      // The reply paragraph appears with the first delta, but the session is
      // persisted server-side only when the turn completes — wait for the
      // input to unlock (streaming ended) before reading the session store.
      await expect(page.getByTestId('assistant-send')).toBeEnabled({ timeout: 20_000 });

      const title = async (): Promise<string> => {
        const list = await (await request.get(`/api/projects/${id}/agent/sessions`)).json();
        return list.sessions[0]?.title || '';
      };
      await expect.poll(title, { timeout: 10_000 }).toContain('hello there');

      const list = await (await request.get(`/api/projects/${id}/agent/sessions`)).json();
      expect(list.sessions.length).toBe(1);
      await request.delete(`/api/projects/${id}/agent/sessions/${list.sessions[0].id}`);
      const after = await (await request.get(`/api/projects/${id}/agent/sessions`)).json();
      expect(after.sessions.length).toBe(0);
    } finally {
      await cleanup(request, id);
    }
  });
});
