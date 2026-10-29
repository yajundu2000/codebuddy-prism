import type { ReactNode } from 'react';
import { withBase } from '../basePath';
import Brand from './Brand';
import '../landing.css';

/** The marketing surface around the sign-in card (Persuade). Overleaf-style
 *  section rhythm — hero + stat band + alternating features + templates +
 *  plans + open-source close — set inside the app's dark navy world; the
 *  login card itself is passed in untouched so every auth testid keeps
 *  working. Copy comes from the 2026-10 pitch doc; claims stay measured
 *  (1270万 graduates, ≈2s warm compile, 250M OpenAlex, 25 venue kits) and
 *  prices stay off the page (payment rails not built yet). */

const STATS = [
  { n: '1270万', label: '中国高校毕业生·年（2026）' },
  { n: '≈2s', label: '增量暖编译，改完即见 PDF' },
  { n: '2.5亿', label: 'OpenAlex 文献可检索引用' },
  { n: '25', label: '主流期刊/会议样式包' },
];

const FEATURES = [
  {
    h: '中文开箱，即刻成稿',
    p: '默认 XeLaTeX 引擎，编译环境内置 ctex 与中文字体——中文论文从第一行起正常渲染，不配环境、不装字体。',
    bullets: ['PDF 与源码双向定位（SyncTeX）', '错误带行号，点击直达源码行', '暖编译约 2 秒，即改即见'],
    shot: '/landing/editor.png',
    alt: '编辑器中的中文论文源码，右侧同步显示编译出的 PDF 预览',
  },
  {
    h: 'AI 动手改稿，你审你定',
    p: 'AI 助手不只给建议：它读项目、改稿件、插引文、跑编译、提交版本，每一次落笔都以 diff 呈现。',
    bullets: ['逐行核对改动，一键保留或撤销', 'AI 改动独立成版本，随时整体回滚', '支持 DeepSeek、混元等主流模型'],
    shot: '/landing/ai.png',
    alt: 'AI 助手修改稿件的审查弹窗：红绿 diff 逐行展示，可保留或撤销',
  },
  {
    h: '论文项目即 git 仓库',
    p: '学生开分支改稿、导师看差异审阅、定稿一键合并——全程不敲一条 git 命令。',
    bullets: ['分支并行修改，界面里合并', '历史与逐行对比随时回看', '同步 Gitee / GitHub / GitLab，直接开 PR；支持导入 Overleaf ZIP'],
    shot: '/landing/git.png',
    alt: '项目的分支菜单：main 与 revision 分支可切换',
  },
  {
    h: '文献引用，一贴即得',
    p: '把 GB/T 7714 格式的文献条目粘贴进 Cite 面板，自动转为 BibTeX 并入引用库，正文 \\cite 自动补全。',
    bullets: ['Zotero 整库同步为 .bib', 'OpenAlex 两亿五千万篇文献检索', 'DOI / arXiv 一键转引文'],
    shot: '/landing/cite.gif',
    alt: '动图：GB/T 7714 文献粘贴进 Cite 面板，\\cite 自动落入正文光标处，.bib 闪现新条目后回到正文',
  },
];

const VENUES = ['NeurIPS', 'ICML', 'ICLR', 'CVPR', 'ACL', 'AAAI', 'IEEE', 'USENIX', 'Springer', 'MDPI', 'eLife', 'Optica'];

const PLANS = [
  {
    h: '免费层',
    tag: '现在就开始',
    bullets: ['多人实时协同编辑', '项目编译与 AI 助手体验', '适合课程报告与轻量写作'],
    cta: '免费注册',
    featured: false,
  },
  {
    h: '个人版 · 学生版',
    tag: '适合高频写作者',
    bullets: ['更高的 AI 与编译额度', '适合学位论文长周期写作', '学生认证享专属优惠'],
    cta: '联系商务开通',
    featured: true,
  },
  {
    h: '课题组版',
    tag: '导师与学生的共同工作台',
    bullets: ['组内共享项目与模板', '导师批注与建议修改留痕', '支持校园网私有化部署'],
    cta: '联系商务开通',
    featured: false,
  },
];

/** Prices are deliberately absent (payment rails + metering not built, price
 *  A/B not run) — the note below is the honest line until they ship. */
const PRICE_NOTE = '价格上线后公布 · 商务微信 yajun__du';

const focusLogin = () => {
  document.querySelector<HTMLInputElement>('[data-testid="auth-email"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  setTimeout(() => document.querySelector<HTMLInputElement>('[data-testid="auth-email"]')?.focus(), 350);
};

export default function Landing({ login }: { login: ReactNode }) {
  return (
    <div className="landing" data-testid="landing">
      <header className="landing__nav" data-testid="landing-nav">
        <div className="landing__nav-inner">
          <Brand />
          <nav className="landing__nav-links" aria-label="页面导航">
            <a href="#features">特性</a>
            <a href="#templates">模板</a>
            <a href="#plans">计划</a>
            <a href="#open-source">开源</a>
          </nav>
          <button className="landing__pill" onClick={focusLogin}>免费开始</button>
        </div>
      </header>

      <main>
        <section className="landing__hero" data-testid="landing-hero" id="top">
          <div className="landing__hero-copy">
            <p className="landing__eyebrow">(write your thesis)</p>
            <h1 className="landing__title">论文写作，<br />从打开浏览器开始</h1>
            <p className="landing__sub">AI 原生的协作 LaTeX 平台：实时协同、git 分支、导师批注、文献引用，中文开箱即用。AI 助手直接读稿改稿，每一次改动可审、可退。</p>
            <div className="landing__cta-row">
              <button className="landing__pill landing__pill--lg" onClick={focusLogin}>免费开始写作 →</button>
              <a className="landing__pill landing__pill--ghost landing__pill--lg" href="#features">看看能做什么</a>
            </div>
            <p className="landing__trust">AGPL-3.0 开源 · 数据自留 · 无需安装任何环境</p>
          </div>
          <div className="landing__hero-login">{login}</div>
        </section>

        <section className="landing__band" data-testid="landing-band">
          <div className="landing__band-inner">
            {STATS.map((s) => (
              <div className="landing__stat" key={s.n}>
                <span className="landing__stat-n">{s.n}</span>
                <span className="landing__stat-label">{s.label}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="landing__features" data-testid="landing-features" id="features">
          <p className="landing__eyebrow">(features)</p>
          <h2>写作、协作、评审、投稿，同一个页面</h2>
          <p className="landing__section-sub">围绕论文全流程的七个模块开箱即用，这里是最重要的四个。</p>
          {FEATURES.map((f, i) => (
            <div className={`landing__feature${i % 2 ? ' landing__feature--flip' : ''}`} key={f.h}>
              <div className="landing__feature-copy">
                <h3>{f.h}</h3>
                <p>{f.p}</p>
                <ul>
                  {f.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
              </div>
              <figure className="landing__shot">
                <span className="landing__shot-bar" aria-hidden="true"><i /><i /><i /></span>
                <img src={withBase(f.shot)} alt={f.alt} loading="lazy" decoding="async" width={1440} height={900} />
              </figure>
            </div>
          ))}
        </section>

        <section className="landing__templates" data-testid="landing-templates" id="templates">
          <p className="landing__eyebrow">(templates)</p>
          <h2>模板与样式包就位</h2>
          <p className="landing__section-sub">文章、报告、幻灯、期刊论文四个内置模板起步，再挂一层主流 venue 样式包。</p>
          <ul className="landing__chips">
            {VENUES.map((v) => <li key={v}>{v}</li>)}
            <li className="landing__chips-more">+13</li>
          </ul>
        </section>

        <section className="landing__plans" data-testid="landing-plans" id="plans">
          <p className="landing__eyebrow">(plans)</p>
          <h2>人人可用的三档计划</h2>
          <p className="landing__section-sub">{PRICE_NOTE}</p>
          <div className="landing__plan-grid">
            {PLANS.map((p) => (
              <div className={`landing__plan${p.featured ? ' landing__plan--featured' : ''}`} key={p.h}>
                <h3>{p.h}</h3>
                <p className="landing__plan-tag">{p.tag}</p>
                <ul>
                  {p.bullets.map((b) => <li key={b}>{b}</li>)}
                </ul>
                <button className="landing__pill landing__plan-cta" onClick={focusLogin}>{p.cta}</button>
              </div>
            ))}
          </div>
        </section>

        <section className="landing__oss" data-testid="landing-oss" id="open-source">
          <div className="landing__oss-inner">
            <div>
              <p className="landing__eyebrow landing__eyebrow--onoss">(open source)</p>
              <h2>开源可自部署，数据不出网</h2>
              <p className="landing__oss-sub">AGPL-3.0 开源；docker compose 两个容器即可在校园网内跑起一个院系规模的写作平台，论文、文献库与批注全部留在自己服务器。</p>
            </div>
            <div className="landing__oss-actions">
              <button className="landing__pill landing__pill--ghost" onClick={focusLogin}>在浏览器里试用</button>
              <a className="landing__oss-src" href={withBase('/source-code.tar.gz')} download>下载完整源码 ↓</a>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing__footer" data-testid="landing-footer">
        <div className="landing__footer-row">
          <Brand />
          <p className="landing__footer-note">TeX写作智能体 · 文灶网</p>
        </div>
        <p className="landing__footer-note">商务微信 yajun__du · 邮箱 yajundu@126.com · <a href={withBase('/manual.html')} target="_blank" rel="noreferrer">用户手册</a> · AGPL-3.0 · <a href={withBase('/source-code.tar.gz')} download>源码</a> · © 2026</p>
        {/* 备案沿用主体站 wenzao.site（同一运营主体：深蓝湾流） */}
        <p className="landing__beian" data-testid="landing-beian">
          <a href="https://beian.miit.gov.cn/" target="_blank" rel="noreferrer">粤ICP备2026116494号-1</a>
          <a href="https://beian.mps.gov.cn/#/query/webSearch?code=44011402001422" target="_blank" rel="noreferrer">
            <img src={withBase('/landing/beian-logo.png')} alt="" width={12} height={13} decoding="async" />
            粤公网安备44011402001422号
          </a>
        </p>
      </footer>
    </div>
  );
}
