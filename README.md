# 画匣子 Photolio

画匣子是个人作品项目，包含共同回忆与 NFC 礼品体验，以及用于展示设计作品的个人网站。前端使用 uni-app、Vue 3、Vite 和 TypeScript；配套服务端位于独立的 annualreport 仓库。

## 项目组成

- 多端前端：微信小程序、H5、Android、iOS 与鸿蒙相关页面和能力。
- 个人作品集：portfolio_subproject/yifang/，当前入口为 /#/pages/yifang-wang。
- 服务端：独立仓库 [castlewowohead/annualreport](https://github.com/castlewowohead/annualreport)。

## 本地开发

需要 Node.js 和 npm。安装依赖后可运行 H5 开发环境：

    npm install
    npm run dev:h5

常用命令：

- npm run build:h5：构建 H5 并复制静态资源。
- npm run build:mp-weixin：构建微信小程序。
- npm run type-check：运行 Vue/TypeScript 类型检查。

不同发布目标的环境配置和发布步骤请参阅 DEPLOY.md。uni-app 页面和入口位于 src/；静态文件位于 public/；个人作品集相关素材和页面位于 portfolio_subproject/。

## 画匣子个人作品集

当前作品集页面和内容位于 portfolio_subproject/yifang/。运行 H5 后访问 /#/pages/yifang-wang。

### 2026-11-16 视觉整理

首页轮播使用 `media.ts` 中明确选择的八张案例素材，不再从本地旧照片池随机补齐。`ProjectImage.vue` 区分实物照片、手机界面与桌面工作区，也用于 Selected Work 的图片揭幕。手机用设备边框，桌面截图保持完整比例；选图需要能说明对应案例。

媒体框复核后，首页所有素材底板均为透明，不再附带项目主题色矩形。`DeviceImage.vue` 统一首页、秒装与 Photolio 正文的设备包边：图片按原始宽高比撑开，只有一层屏幕裁切，四边统一 3px；桌面截图为 1px 细边，照片无外框。素材原始宽高用于预留空间，禁止把不同比例的截图放进固定比例的黑色容器。轮播键盘焦点用标题下划线提示，不显示整块图片区外框。

秒装开场保留 Broken rhythm，以建议结果和装修日记组成双机视觉；写道的曲线跟随标题尺寸，独立于正文，已移除箭头。BIG 的背景 B/I/G 使用相同字体、字重及透明度。各项目 logo 按视觉尺寸校准，Photolio 组织标志在竖屏排列为两列。

秒装开场采用左文右图：Room 标题、正文与节奏条留在左栏，右栏双机按屏幕剩余高度放大。MIAOZER 与 BIG 页首复用 Photolio 的编号、项目名和案例计数样式；秒装 logo 只在详情页 Related organizations 展示。各项目末页统一标志区、正文和底部 Continue 的网格顺序；写道奇绩标志复用 Photolio 的反相与正片叠底处理。BIG 开场的小标志复用详情页的透明素材，去掉白底。写道开场不作本轮修改。

BIG 标志来自官网页首：<https://brooklineinteractive.org/>（2026-11-16 获取）；`public/folio-big/logo.webp` 为本地副本。写道的 `wordmark.svg` 是本轮制作的中英文字标，未将其描述为历史官方 logo。正式页面与实验区入口继续分开，案例正文及项目贡献表述保持原样。
