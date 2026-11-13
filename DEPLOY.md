# 画匣子 Photolio · 部署手册

一次性部署手册，覆盖：GitHub 同步、H5、微信小程序、Android、iOS、鸿蒙。
> 本文档仅用于部署与运维参考。项目组成、开发入口与交接信息请参阅 [README.md](README.md)。

---

## 0. 部署前自检

- [ ] `npm install` 能跑通，没有 peer deps 红字
- [ ] `npm run type-check` 通过
- [ ] [src/config/env.ts](src/config/env.ts) 里 `API_BASE` / `STATIC_BASE` / `VIDEO_UPLOAD_BASE` 指向生产域名
- [ ] [src/manifest.json](src/manifest.json) 里 `appid`（uni-app 项目 id）、`mp-weixin.appid`（微信小程序 AppID）、`versionName` / `versionCode` 已更新
- [ ] 没有 console.log 残留敏感信息（grep `console.log` src）
- [ ] 已 grep 用户语料违禁词：`grep -rn "片语\|AI \|群组" src --include="*.vue"` 应为空

---

## 1. 同步到 GitHub（首次）

### 1.1 在 GitHub 上建仓

1. 浏览器打开 https://github.com/new
2. **Repository name**：`photolio`（建议英文小写）
3. **Description**：`画匣子 Photolio · NFC 共同回忆 uni-app 前端`
4. **Public / Private**：建议先选 **Private**（私有），里面有商业域名 / AppID
5. **不要勾选** "Add a README"、"Add .gitignore"、"Choose a license" —— 仓库已有自己的 README 和 .gitignore，避免首次 push 冲突
6. 点 **Create repository**

### 1.2 本地初始化 + 首次推送

进入项目目录后逐条执行：

```bash
cd /f/xiedao/vue/photolio

# 初始化 git
git init
git branch -M main

# 配置作者（如未全局配置过）
git config user.name "你的名字"
git config user.email "yifangw9@gmail.com"

# 看一下 .gitignore 是否生效（不应出现 node_modules / dist / .claude/settings.local.json）
git status

# 首次提交
git add .
git commit -m "init: photolio uni-app 前端首次提交"

# 关联远程仓库（把 <USERNAME> 换成你的 GitHub 用户名）
git remote add origin https://github.com/<USERNAME>/photolio.git

# 推送
git push -u origin main
```

### 1.3 推送时的认证

GitHub 早已禁用密码登录，必须用 **Personal Access Token (PAT)** 或 **SSH key**：

**方式 A：PAT（推荐新手）**
1. https://github.com/settings/tokens → Generate new token (classic)
2. Scopes 只勾选 `repo`
3. 生成后**立刻复制**（只显示一次）
4. push 时弹出 Username 填 GitHub 用户名；Password **粘贴 PAT**
5. Windows 会自动把 PAT 存进凭据管理器，后续不用再输

**方式 B：SSH（推荐长期）**
```bash
ssh-keygen -t ed25519 -C "yifangw9@gmail.com"   # 一路回车
cat ~/.ssh/id_ed25519.pub                       # 把输出全部复制
```
到 https://github.com/settings/keys → New SSH key → 粘贴。然后把 remote 改成 SSH：
```bash
git remote set-url origin git@github.com:<USERNAME>/photolio.git
```

### 1.4 日常协作

```bash
git pull --rebase   # 拉远端最新（带 rebase，避免无意义 merge commit）
git add <file>      # 不要用 git add . 可能误入 .env
git commit -m "feat(play): xxx"
git push
```

提交信息约定（与现有 README 风格对齐）：
- `feat(模块): 新功能`
- `fix(模块): bug 修复`
- `refactor(模块): 重构`
- `docs: 文档`
- `chore: 构建/工具`

---

## 2. 微信小程序部署

### 2.1 构建

```bash
npm run build:mp-weixin
# 产物：dist/build/mp-weixin/
```

### 2.2 上传

1. 打开**微信开发者工具**，导入 `dist/build/mp-weixin/` 目录
2. AppID 选 `wx5ea018ce3dd2a6e5`（已在 manifest 里）
3. 右上角「上传」→ 填版本号（与 manifest 的 versionName 对齐）+ 项目备注
4. 浏览器打开 https://mp.weixin.qq.com → 管理 → 版本管理 → 找到刚上传的版本 → 提交审核
5. 审核通过后点「发布」

### 2.3 上线前必查（服务器域名）

mp.weixin.qq.com → 开发 → 开发管理 → 开发设置 → 服务器域名：

| 类别 | 域名 |
|---|---|
| request 合法域名 | `https://pian-yu.com`、`https://upload.pian-yu.com` |
| uploadFile 合法域名 | `https://pian-yu.com`、`https://upload.pian-yu.com` |
| downloadFile 合法域名 | `https://pian-yu.com` |
| 业务域名 | `https://pian-yu.com`（NFC 跳转中转页用） |

任何一个漏配，正式版直接报 `url not in domain list`。

---

## 3. H5 部署

### 3.1 构建

```bash
npm run build:h5
# 产物：dist/build/h5/
```

### 3.2 部署到自家服务器（nginx）

把 `dist/build/h5/` 整个目录上传到服务器，nginx 配置示例：

```nginx
server {
    listen 443 ssl http2;
    server_name h5.pian-yu.com;

    ssl_certificate     /etc/letsencrypt/live/h5.pian-yu.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/h5.pian-yu.com/privkey.pem;

    root /var/www/photolio-h5;
    index index.html;

    # SPA fallback（uni-app h5 用 hash 路由可省，history 路由必须）
    location / {
        try_files $uri $uri/ /index.html;
    }

    # 静态资源缓存
    location ~* \.(js|css|png|jpg|jpeg|gif|svg|woff2?)$ {
        expires 30d;
        add_header Cache-Control "public, immutable";
    }
}
```

部署脚本（在服务器跑）：
```bash
# 假设产物已 scp 上来到 /tmp/h5-build/
rm -rf /var/www/photolio-h5
mv /tmp/h5-build /var/www/photolio-h5
nginx -s reload
```

### 3.3 部署到 Vercel / Netlify（零运维）

- Vercel：连接 GitHub 仓库 → Framework Preset 选 **Other** → Build Command 填 `npm run build:h5` → Output Directory 填 `dist/build/h5`
- Netlify：同理，Publish directory 填 `dist/build/h5`
- 注意：商业生产环境用了 NFC URL Link，回跳必须是 `pian-yu.com` 主域，Vercel/Netlify 只能做预览环境

---

## 4. Android App 部署

### 4.1 云打包（推荐，零环境配置）

1. 用 **HBuilderX** 打开本项目（File → Open Directory）
2. 顶部菜单：发行 → 原生 App-云打包
3. 勾选 Android、填 keystore（首次需创建：HBuilderX 工具栏「证书」生成）
4. 提交云打包 → 等几分钟 → 下载 .apk

### 4.2 本地打包（需 Android Studio + uni-app 离线打包 SDK）

1. 到 [DCloud 离线 SDK](https://nativesupport.dcloud.net.cn/AppDocs/usesdk/android) 下载 Android 离线 SDK
2. `npm run build:app-plus` 出 wgt 资源 → 拷进 Android 工程的 apps 目录
3. Android Studio 打开 → 配 keystore → Build → Generate Signed APK / Bundle

### 4.3 发布到应用市场

各家应用市场分别注册账号，上传 apk + 截图 + 隐私政策链接：
- 华为应用市场：https://developer.huawei.com
- 小米 / OPPO / vivo / 应用宝同理
- Google Play（海外）：https://play.google.com/console

---

## 5. iOS App 部署

iOS 必须在 **Mac** 上完成。流程：

1. 注册 Apple Developer 账号（$99/年）
2. HBuilderX → 发行 → 原生 App-云打包 → 勾 iOS → 选证书 / profile
3. 拿到 .ipa 后用 **Transporter** App 上传到 App Store Connect
4. App Store Connect → 我的 App → 新建版本 → 截图 + 描述 + 隐私清单 → 提审
5. 审核常见拒因：未声明的 NFC 用途、隐私政策缺项、未实现账号注销

---

## 6. 鸿蒙 App 部署

1. `npm run build:mp-harmony` 出鸿蒙工程
2. 用 **DevEco Studio** 打开
3. 配 .p12 签名 → Build → Generate APP/HAP/HSP
4. 上传到 AppGallery Connect 提审

---

## 7. GitHub Actions（可选自动化）

如果要让每次 push 自动跑 type-check + h5 构建，建仓后加 `.github/workflows/ci.yml`：

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run type-check
      - run: npm run build:h5
      - uses: actions/upload-artifact@v4
        with:
          name: h5-dist
          path: dist/build/h5
```

小程序 CI 上传需要 `miniprogram-ci`，并把 **小程序代码上传密钥**（mp 后台 → 开发设置 → 小程序代码上传）放进 GitHub Secrets。生产开通前建议先手动上传跑顺再上自动化。

---

## 8. 版本回滚

- 微信小程序：mp 后台 → 版本管理 → 「回退到该版本」按钮（保留最近 5 个版本）
- H5：服务器上保留上一个 `photolio-h5.bak/`，出问题一行 `mv` 切回去
- App：应用市场无法回滚，只能紧急发新版盖掉

---

## 9. 常见踩坑速查

| 症状 | 原因 | 解决 |
|---|---|---|
| `git push` 报 403 | PAT 没勾 `repo` scope | 重新生成 PAT |
| `uploadFile:fail url not in domain list` | 小程序后台没加 upload 子域名 | 加 `https://upload.pian-yu.com` 到 uploadFile 合法域名 |
| H5 路由刷新 404 | nginx 没配 SPA fallback | `try_files $uri /index.html;` |
| Android 安装报「未签名」 | 用了调试 keystore | 云打包时换正式 keystore |
| 小程序审核拒「未提供测试账号」 | 后台审核备注没填 | 提审时备注里写测试手机号 / 验证码 |
| HBuilderX 打包说「证书过期」 | 自创 keystore 默认 25 年期，但 Apple .mobileprovision 1 年 | iOS 重生成 profile；Android 用同 keystore 续 |

---

## 10. 域名 / 证书续期日历（自填）

| 资源 | 到期日 | 续期地址 |
|---|---|---|
| pian-yu.com 域名 |  |  |
| HTTPS 证书（Let's Encrypt 自动续）| 90 天 | certbot --renew |
| 微信小程序认证（300/年）|  | mp.weixin.qq.com |
| Apple Developer（$99/年）|  | developer.apple.com |
| Android keystore | 25 年（自创时默认）| — |

把日期填上并设个日历提醒，**到期前两周**处理。
