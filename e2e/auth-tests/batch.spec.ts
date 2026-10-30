import { test, expect } from '../fixtures';

/** The auth stack starts with ALDINE_ADMIN_EMAILS=admin@test.com (see
 *  playwright.auth.config.ts); register-or-sign-in like admin.spec.ts. */
const ADMIN_EMAIL = 'admin@test.com';

/** Unique 学号 per run — the persisted user store survives re-runs. */
const uniqId = () => `s${Date.now()}${Math.floor(Math.random() * 1000)}`;

/** This test signs in seven or eight times; the login limiter (burst 10 per
 *  client IP) is shared with the rest of the suite, so every /api/auth/login
 *  below carries this dedicated client IP (the server runs TRUST_PROXY=1 —
 *  the same isolation trick auth.spec's rate-limit test uses). */
const XFF = { 'x-forwarded-for': '203.0.113.99' };

async function signInAdmin(page: import('@playwright/test').Page) {
  const reg = await page.request.post('/api/auth/register', { data: { email: ADMIN_EMAIL, password: 'password123', name: 'Admin' } });
  if (!reg.ok()) {
    const login = await page.request.post('/api/auth/login', { headers: XFF, data: { email: ADMIN_EMAIL, password: 'password123' } });
    expect(login.ok()).toBeTruthy();
  }
  await page.goto('/');
  await expect(page.getByTestId('new-project')).toBeVisible({ timeout: 15_000 });
}

test.describe('batch-provisioned accounts (学号/工号)', () => {
  test('admin pastes a roster; the account is forced through first-login setup', async ({ page, browser }) => {
    const s1 = uniqId();
    const s2 = uniqId();
    await signInAdmin(page);
    await page.getByTestId('admin-link').click();

    // A paste with an in-paste duplicate and an email-shaped 学号: 2 created,
    // 1 skipped, 1 per-line error naming the email-shaped line.
    await page.getByTestId('admin-batch-input').fill(`${s1} 张三\n${s1} 张三\n${s2} 李四\nbad@x.com 王五`);
    await page.getByTestId('admin-batch-submit').click();
    await expect(page.getByTestId('admin-batch-result')).toContainText('Created 2 · Skipped 1');
    await expect(page.getByTestId('admin-batch-result')).toContainText('bad@x.com');
    // the table shows the 学号 and the setup-pending badge
    await expect(page.getByTestId('admin-user-row').filter({ hasText: s1 })).toContainText('张三');
    await expect(page.getByTestId('admin-user-row').filter({ hasText: s1 })).toContainText('setup pending');

    // API level, in the student's own cookie jar (page.request would share
    // the admin page's session): login by 学号, the flag, and the guard
    // (incl. routes registered BEFORE the guard hook — /api/auth/password
    // must not offer a change-password shortcut that skips the email binding).
    const apiCtx = await browser.newContext();
    const login = await apiCtx.request.post('/api/auth/login', { headers: XFF, data: { email: s1, password: s1 } });
    expect(login.ok()).toBeTruthy();
    expect((await login.json()).user.mustChangePassword).toBe(true);
    expect((await apiCtx.request.get('/api/auth/me')).ok()).toBeTruthy(); // exempt
    const blocked = await apiCtx.request.get('/api/projects');
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe('MUST_CHANGE_PASSWORD');
    const pw = await apiCtx.request.post('/api/auth/password', { data: { currentPassword: s1, newPassword: 'password123' } });
    expect(pw.status()).toBe(403);
    await apiCtx.close();

    // UI, in a CLEAN context (a jar that already holds the s1 session would
    // land on the setup screen before the login form ever renders): the
    // sign-in field takes the 学号, and the app does not load until setup
    // is finished.
    const ui = await browser.newContext();
    const spage = await ui.newPage();
    await spage.goto('/');
    await spage.getByTestId('auth-email').fill(s1);
    await spage.getByTestId('auth-password').fill(s1);
    await spage.getByTestId('auth-submit').click();
    await expect(spage.getByTestId('setup-email')).toBeVisible({ timeout: 15_000 });
    await expect(spage.getByTestId('new-project')).toHaveCount(0);
    await spage.getByTestId('setup-email').fill(`${s1}@test.com`);
    await spage.getByTestId('setup-password').fill('password123');
    await spage.getByTestId('setup-password2').fill('password123');
    await spage.getByTestId('setup-submit').click();
    await expect(spage.getByTestId('new-project')).toBeVisible({ timeout: 15_000 });

    // After setup: the ID password is dead, the email + new password work,
    // the flag is gone, and the API opens up.
    const oldLogin = await ui.request.post('/api/auth/login', { headers: XFF, data: { email: s1, password: s1 } });
    expect(oldLogin.ok()).toBeFalsy();
    const newLogin = await ui.request.post('/api/auth/login', { headers: XFF, data: { email: `${s1}@test.com`, password: 'password123' } });
    expect(newLogin.ok()).toBeTruthy();
    expect((await newLogin.json()).user.mustChangePassword).toBeUndefined();
    expect((await ui.request.get('/api/projects')).ok()).toBeTruthy();
    await ui.close();

    // A second student cannot bind an email that is already taken.
    const s2ctx = await browser.newContext();
    await s2ctx.request.post('/api/auth/login', { headers: XFF, data: { email: s2, password: s2 } });
    const bind = await s2ctx.request.post('/api/auth/setup', { data: { email: `${s1}@test.com`, newPassword: 'password123' } });
    expect(bind.status()).toBe(400);
    await s2ctx.close();

    // Re-pasting the roster skips the existing 学号 — never resets a student
    // who already finished setting up.
    await signInAdmin(page);
    await page.getByTestId('admin-link').click();
    await page.getByTestId('admin-batch-input').fill(`${s1} 张三`);
    await page.getByTestId('admin-batch-submit').click();
    await expect(page.getByTestId('admin-batch-result')).toContainText('Created 0 · Skipped 1');

    // Admin reset-to-ID: the lost-password fallback. The account goes back to
    // the 学号 password and the forced setup — closed loop with the batch flow.
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('admin-user-row').filter({ hasText: s1 }).getByTestId('admin-reset').click();
    await expect(page.getByTestId('admin-user-row').filter({ hasText: s1 })).toContainText('setup pending');
    const ctx = await browser.newContext();
    const again = await ctx.request.post('/api/auth/login', { headers: XFF, data: { email: s1, password: s1 } });
    expect(again.ok()).toBeTruthy();
    expect((await again.json()).user.mustChangePassword).toBe(true);
    expect((await ctx.request.get('/api/projects')).status()).toBe(403); // the guard is back
    await ctx.close();
    // An ordinary email account is not a batch account — refused. Registering
    // it from a separate context (an in-page register would swap the admin
    // page's session cookie for the new account's).
    const negCtx = await browser.newContext();
    const plain = uniqId();
    const reg = await negCtx.request.post('/api/auth/register', { headers: XFF, data: { email: `${plain}@test.com`, password: 'password123', name: 'Plain' } });
    expect(reg.ok()).toBeTruthy();
    const reset = await page.request.post(`/api/admin/users/${(await reg.json()).user.id}/reset-to-id`);
    expect(reset.status()).toBe(400);
    await negCtx.close();
  });
});
