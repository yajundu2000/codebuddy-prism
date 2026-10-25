/** Landing-page screenshots from the live R&D stack (real editor, real compile,
 *  real AI) — see plans/gitea-forgejo-gitee-enchanted-pony. Usage:
 *    node e2e/landing-shots.mjs [base-url]   (default: the R&D server)
 *  Registers a throwaway demo account and writes apps/web/public/landing/*.png. */
import { chromium } from '@playwright/test';

const BASE = process.argv[2] || 'http://1.12.226.86:8080';
const OUT = new URL('../apps/web/public/landing/', import.meta.url).pathname;
const EMAIL = `landing-demo@wenzao.site`;
const PASSWORD = 'LandingDemo2026!';

const MAIN_TEX = String.raw`\documentclass[12pt]{ctexart}
\usepackage{amsmath, amsthm}
\usepackage{graphicx}
\usepackage[backend=biber, style=gb7714-2015]{biblatex}
\addbibresource{references.bib}

\title{分布式文档协作系统的一致性研究}
\author{张三 \quad 李四}
\date{2026年10月}

\begin{document}
\maketitle

\section{引言}
协同写作系统需要在多人同时编辑的场景下保证文档一致性。本文在
Yjs~\cite{zhang2026xie} 的基础上提出一种增量快照方案，将暖编译时间
控制在两秒以内~\cite{liu2025bian}。

\section{方法}
设文档状态为 $Y \in \mathcal{Y}$，编辑操作为二元组 $(u, \delta)$，
则状态迁移满足
\begin{equation}
  Y_{t+1} = Y_t \oplus \bigoplus_{i=1}^{n} \delta_i
  \label{eq:merge}
\end{equation}
其中 $\oplus$ 表示无冲突合并，如式~\eqref{eq:merge} 所示。

\section{结论}
实验表明，该方案在十人并发编辑下仍保持线性合并开销。

\printbibliography
\end{document}
`;

const REFERENCES_BIB = `@article{zhang2026xie,
  author  = {张三 and 刘荣},
  title   = {基于操作变换的协同编辑算法综述},
  journal = {计算机学报},
  year    = {2026},
  volume  = {49},
  number  = {3},
  pages   = {47--59},
}

@article{liu2025bian,
  author  = {李四 and 王五},
  title   = {增量编译在在线 LaTeX 平台中的应用},
  journal = {软件学报},
  year    = {2025},
  volume  = {36},
  number  = {12},
  pages   = {102--115},
}
`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  window.localStorage.setItem('aldine.onboarded', '1');
  window.localStorage.setItem('aldine.theme', 'dark');
});
const page = await ctx.newPage();

// --- register (or fall back to login if the throwaway already exists) ---
await page.goto(BASE);
await page.getByTestId('auth-switch').click();
await page.getByTestId('auth-name').fill('演示账号');
await page.getByTestId('auth-email').fill(EMAIL);
await page.getByTestId('auth-password').fill(PASSWORD);
await page.getByTestId('auth-submit').click();
const authed = () => page.getByTestId('user-name').waitFor({ timeout: 12_000 });
if (!(await authed().then(() => true, () => false))) {
  // account existed already → switch back to sign-in
  await page.getByTestId('auth-switch').click();
  await page.getByTestId('auth-email').fill(EMAIL);
  await page.getByTestId('auth-password').fill(PASSWORD);
  await page.getByTestId('auth-submit').click();
  await authed();
}
console.log('authed');

// --- seed the Chinese demo paper ---
const res = await ctx.request.post(`${BASE}/api/projects`, { data: { name: '分布式文档协作系统的一致性研究' } });
if (!res.ok()) throw new Error(`create project: ${res.status()}`);
const id = (await res.json()).id;
for (const [path, content] of [['main.tex', MAIN_TEX], ['references.bib', REFERENCES_BIB]]) {
  const r = await ctx.request.put(`${BASE}/api/projects/${id}/file`, { data: { branch: 'main', path, content } });
  if (!r.ok()) throw new Error(`put ${path}: ${r.status()}`);
}

await page.goto(`${BASE}/p/${id}`);
await page.getByTestId('editor-shell').waitFor({ timeout: 20_000 });
await page.locator('.cm-content').waitFor();

// ① editor + compiled PDF (the money shot: Chinese paper, first render)
await page.getByTestId('typeset-button').click();
await page.getByTestId('pdf-status').filter({ hasText: 'Typeset in' })
  .waitFor({ timeout: 240_000 })
  .catch(async () => {
    const errs = await page.locator('[data-testid="errors-panel"], .errors').first().innerText({ timeout: 3_000 }).catch(() => '(no errors panel)');
    const status = await page.getByTestId('pdf-status').innerText().catch(() => '?');
    console.error('COMPILE NOT OK — status:', status, '\nerrors:', errs.slice(0, 800));
    process.exit(1);
  });
await page.locator('canvas.pdf-page').first().waitFor({ timeout: 30_000 });
await page.waitForTimeout(400); // let the first page paint
await page.screenshot({ path: OUT + 'editor.png' });
console.log('shot: editor');

// ② AI assistant with a real edit → diff review modal
await page.getByTestId('tab-chat').click();
await page.getByTestId('assistant-panel').waitFor();
await page.getByTestId('assistant-input').fill('在「结论」一节末尾追加一句话，说明后续将在真实课题组中验证。');
await page.getByTestId('assistant-send').click();
await page.getByTestId('agent-review-modal').waitFor({ timeout: 90_000 });
await page.waitForTimeout(600); // settle the diff render
await page.screenshot({ path: OUT + 'ai.png' });
console.log('shot: ai');
await page.keyboard.press('Escape');

// ③ Cite: .bib open with BibTeX highlighting + the GB/T panel
await page.getByTestId('tab-plugin:references').click().catch(async () => {
  // the panel opens the first .bib itself on show
});
await page.waitForTimeout(1_200);
await page.screenshot({ path: OUT + 'cite.png' });
console.log('shot: cite');

// ④ branches: the project-is-a-git-repo proof
await page.getByTestId('branch-menu').click();
await page.waitForTimeout(600);
await page.screenshot({ path: OUT + 'git.png' });
console.log('shot: git');

await browser.close();
await ctx.request.delete(`${BASE}/api/projects/${id}?permanent=1`).catch(() => {});
console.log('done →', OUT);
