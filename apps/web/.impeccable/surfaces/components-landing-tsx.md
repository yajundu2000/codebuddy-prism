---
version: 1
slug: "components-landing-tsx"
primary_target: "components/Landing.tsx"
related_targets: []
---

- **Scope & mode**: 未登录 `/` 落地页（whole surface, Persuade）；登录后各面不动。
- **Audience / job / action**: 国内毕业生与课题组（师生同页）；5 秒认知「AI 原生协作 LaTeX 平台·中文开箱·开源可自部署」；主行动 = 注册/登录（hero 右侧登录卡即行动点），次行动 = 了解特性后回到卡上注册。
- **Proof / content**: 推介书事实——1270 万毕业生/年、≈2s 暖编译、OpenAlex 2.5 亿文献、4 内置模板+24 venue 样式包、AGPL-3.0 自托管、AI diff 审查；真实编辑器截图（浏览器框）为唯一图像语言。
- **Constraints**: 深色世界不变（--bg-app #12141c 等 tokens）；零 github.com 链接（源码→/source-code.tar.gz）；不露价格数字；无备案号；中文主文案+英文等宽眉标。

## Direction contract

**THESIS**: 把「Overleaf 式学术工具官网」的证明结构（hero+数据带+特性交替块+定价三卡+开源带）整体搬进我们的深海军蓝紫世界——品类一眼可辨（LaTeX 协作工具），身份一眼是我们的（科技黑+紫+中文）。
**OWN-WORLD**: 深蓝底上：紫罗兰等宽小写眉标 `(collaborate)`、紫胶囊 CTA、三圆点浏览器框装真实截图、`--bg-inset` 深带放大数字（Manrope tabular）、发丝线分节；去掉内容后仍认得出=深底+紫眉标+浏览器框三件套。
**STORY**: 访客先被 1270 万写作刚需与登录卡迎住 → 三块特性（协同批注/git 同步/AI 动手改稿）用真截图证明 → 模板与中文开箱打消环境顾虑 → 三档计划卡（无价）承接意向 → 开源带与页脚给出信任收口（AGPL、数据自留、同站源码）。
**FIRST VIEWPORT**: 顶部细 nav（Brand+锚点+胶囊「免费开始」）；下方 hero 两栏：左侧眉标+中文 display 主标题（Manrope clamp 40-56px）+副文+双 CTA+信任行，右侧原样 `.login__card`（首个视口即能登录）。
**FORM**: Overleaf 结构直译（用户钉死，免 concept-seed 掷签）；code-led（本 harness 无图像生成）；候选序首位的深色翻译版。
**FINISH**: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
