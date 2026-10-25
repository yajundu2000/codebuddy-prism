---
name: codebuddy-prism web
description: AI-native collaborative LaTeX platform — deep navy "tech black" world with one violet accent, Manrope display over Inter UI
colors:
  app-bg: "#12141c"
  panel: "#1a1c24"
  panel-raised: "#20222c"
  inset: "#16181f"
  toolbar: "#171922"
  text: "#f4f5f9"
  text-2: "#9ca0ab"
  text-3: "#8a8f9e"
  accent: "#8c7cf6"
  accent-hover: "#a49dfa"
  accent-fill: "#6c5ce7"
  accent-soft: "rgba(140, 124, 246, 0.16)"
  hairline: "rgba(255, 255, 255, 0.10)"
typography:
  display:
    fontFamily: "Manrope Variable, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(2.5rem, 4.6vw, 3.5rem)"
    fontWeight: 700
    lineHeight: 1.18
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Manrope Variable, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "clamp(1.75rem, 2.8vw, 2.25rem)"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter Variable, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.8125rem"
    lineHeight: 1.45
  landing-body:
    fontFamily: "Inter Variable, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1.0625rem"
    lineHeight: 1.75
  label:
    fontFamily: "ui-monospace, SF Mono, JetBrains Mono, Menlo, monospace"
    fontSize: "0.75rem"
    letterSpacing: "0.08em"
rounded:
  xs: "4px"
  s: "6px"
  m: "8px"
  l: "12px"
  pill: "999px"
spacing:
  section: "88px"
  wrap: "1160px"
  pad: "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.s}"
  button-primary-hover:
    backgroundColor: "#5a49e0"
  landing-pill:
    backgroundColor: "{colors.accent-fill}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    padding: "13px 28px"
  landing-pill-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.pill}"
    padding: "13px 28px"
  landing-card:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.l}"
    padding: "28px 26px"
---

# Design System: codebuddy-prism web

## Overview

**Creative North Star: "The Prism in the Dark Room"（暗房里的棱镜）**

深海军蓝的界面世界里只点一盏紫罗兰灯：产品名里的 prism 是唯一强调色，
其余一切用面板深浅与发丝线分层。Manrope 承担展示性标题、Inter 承担界
面正文（均自托管），LaTeX 代码与等宽饰件交给系统 mono 栈。暗色是默认
主题（`index.html` 在绘制前盖戳 `data-theme="dark"`），亮色主题为完整
的第二套 tokens（theme.css），落地面与营销面只工作在暗色世界。

**Key Characteristics:**
- 深底分层：app (#12141c) → inset (#16181f) → toolbar (#171922) → panel (#1a1c24) → raised (#20222c)，深度靠底色台阶不靠影
- 单强调色：紫罗兰一家（text 级 #8c7cf6 / fill 级 #6c5ce7），稀缺即身份
- 发丝线 (rgba(255,255,255,0.10)) 是唯一的结构线
- 圆角阶梯 4/6/8/12px；胶囊 999px 只属于小控件与落地面 CTA
- 落地面独有语法：等宽小写眉标、浏览器框截图、全宽深带

## Colors

一句话：夜蓝纸面一枚紫，紫只做动作与指路。

### Primary
- **Prism Violet, text grade** (#8c7cf6): 眉标、链接、文字级强调（深底 ≥4.5:1）；hover 提亮 #a49dfa。
- **Prism Violet, fill grade** (#6c5ce7): 实心按钮/选中面（白字 4.9:1）；hover 压暗 #5a49e0。**fill 表面必须压暗提亮，不许变浅**（浅紫载不动白字）。
- **Violet wash** (rgba(140,124,246,0.16)): 落地面开源条的唯一染色面；其上的紫文字须升一档用 #a49dfa。

### Neutral
- **Night navy** (#12141c): 页面底。
- **Panel** (#1a1c24) / **Raised** (#20222c): 卡片与浮层。
- **Ink white** (#f4f5f9) 正文；**Mist** (#9ca0ab) 次级；**Faint** (#8a8f9e) 三级。
- **Hairline** (rgba(255,255,255,0.10)): 唯一分隔线语言。

### Named Rules
**The One Violet Rule.** 紫罗兰是唯一强调色；出现即意味着可点或可注目。蓝绿橙不进入这个世界（语义色 ok/warn/error 除外）。

**The Wash Steps Up Rule.** 紫色文字落在 violet wash 上时必须用亮档 #a49dfa——wash 抬高了地面，原对比会跌破 4.5:1。

## Typography

**Display Font:** Manrope Variable（自托管）+ PingFang SC / Microsoft YaHei（CJK 按字形回落）
**Body Font:** Inter Variable + 同上 CJK 回落
**Label/Mono Font:** ui-monospace / SF Mono / JetBrains Mono（代码、眉标、venue 名）

**Character:** Manrope 的几何感标题配 Inter 的中性正文，是"工具的克制"；等宽字体承担全部 LaTeX 身份——它是装饰更是身份声明。

### Hierarchy
- **Display** (700, clamp(2.5rem,4.6vw,3.5rem), 1.18)：落地页 hero 主标题。
- **Headline** (700, clamp(1.75rem,2.8vw,2.25rem), 1.25, balance)：落地面节标题；应用内对话框标题用 --text-l 级。
- **Title** (700, 1.375rem)：特性块 h3、卡片题。
- **Body** (400, 0.8125rem, 1.45)：应用界面；落地页正文升到 1.0625rem/1.75。
- **Label** (500 mono, 0.75rem, +0.08em)：`(eyebrow)`、chips、源码链接。

### Named Rules
**The Mono Is Identity Rule.** 等宽字体只写代码、venue 名与眉标——它是 LaTeX 的母语，不做通用"科技感"装扮。

## Layout

容器 1160px / 边距 32px / 节距 88px；锚点 scroll-margin 72px。落地面节律：sticky 半透明 nav → hero 两栏（文案 1.15fr + 登录卡 320–380px）→ 全宽数据带（4 列，780px 下 2×2）→ 特性块交替两栏（1fr/1.1fr，gap 64，1080px 下单列）→ 模板 chips → 三档卡（780px 下单列）→ 全宽 violet wash 开源条 → 页脚。应用面沿用自身网格，不在此展开。

## Elevation & Depth

深度靠**底色台阶**（app→inset→toolbar→panel→raised），不靠影；影只有三种语义：卡片浮起 (--shadow-card)、悬浮层 (--shadow-pop)、落地页浏览器框的物理存在感 (0 32px 64px -24px rgba(0,0,0,0.55)，hover 加深并抬 4px)。

### Named Rules
**The Shadow States Purpose Rule.** 影只在陈述"这是一块悬着的屏幕/浮层"；静态卡片不加影。

## Shapes

圆角阶梯 4/6/8/12px（卡片 12、chips 6、小件 4）；胶囊 999px 属于落地面 CTA 与小按钮。三圆点浏览器框（10px 圆点 #e8613c/#f0b83e/#59b75f + 12px 圆角 + 深影）是落地面唯一的图像容器。勾选符用 CSS 边框画（2px 紫边旋转 -45°），不用字形不用图标库。

## Components

### Buttons
- **应用 Primary:** 紫底白字 6px 圆角（.btn--primary，复用 .btn 骨架）；hover 压暗。
- **Landing Pill:** 紫底白字胶囊，13px/28px；ghost 变体透明底+发丝边。实心胶囊只出现在 nav/hero/定价卡/开源条。
- **Focus:** 全局 2px var(--accent) 描边（theme.css :where 规则）。

### Landing eyebrow（面级签名，勿外传）
等宽小写带括号 `(write your thesis)`，紫色 0.75rem +0.08em。**这是落地面被用户钉死的签名件，仅限落地面**；应用界面不引入眉标。

### 浏览器框（Landing 签名）
三圆点顶栏 + 1px 发丝边 + 深偏移影；内装真实产品截图（水平、不倾斜、lazy + 固定宽高比防 CLS）。落地页图像只有这一种。

### 数据带 / Violet wash 条
全宽 `--bg-inset` / `rgba(140,124,246,0.16)` 底 + 上下发丝线；内容仍锁 1160px 容器。大数字用 Manrope 700 tabular-nums（--text-3xl）。

### 卡片（Plans）
panel 底 + 1px 发丝边 + 12px 圆角；featured 变体 1.5px 紫边 + raised 底。

## Do's and Don'ts

### Do:
- **Do** 每个落地面节配一个等宽小写眉标；应用面不加。
- **Do** 落地面中段行动点用紫字链接；实心胶囊只放四处（nav/hero/定价/收尾）。
- **Do** 图像一律真实截图+浏览器框；营销数字只用已核实事实。
- **Do** 紫文字落 violet wash 上时升亮档（#a49dfa）。

### Don't:
- **Don't** 引入第二强调色或渐变；蓝绿橙不出现（语义色除外）。
- **Don't** 把眉标/胶囊/浏览器框带进应用界面（Operate 面）——那是落地面专属语法。
- **Don't** 用插画、图标库、emoji、点阵替代真实截图。
- **Don't** 静态卡片加影；影只陈述"悬着的屏幕"。
- **Don't** 在对外表面出现 github.com 链接、价格数字、编造的备案号（PRODUCT.md 红线）。
