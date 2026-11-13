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