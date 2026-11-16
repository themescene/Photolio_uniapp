# 画匣子 · 服务器运维手册

**唯一生产服务器**：杭州阿里云 ECS `112.124.70.124` (`iZbp1h5tq0bt2fn6eq9pgpZ`, 2C8G Ubuntu 22.04)
**SSH 别名**：`hz`（root 直连，公钥已配）
**域名**：
- `hxiazi.com` / `www.hxiazi.com` — **新 photolio h5**（2026-09-14 由老 vue 切换而来）
- `old.hxiazi.com` — **老 vue 网页版兜底**（2026-09-15 新增；用户名密码登录、老账号数据）
- `upload.hxiazi.com` — 大视频直连子域（绕 CF 100MB）
- `umami.hxiazi.com` — 站点分析
- `app.hxiazi.com` — 早期预留，2026-09-14 已废（曾经的 photolio h5 早期部署，切根域后无引用）
**旧机**：香港 `47.242.185.178` → `hz-hk` 别名，2026-08-12 到期，仅做回滚兜底

---

## 一、服务器目录布局（记住这几个路径就够了）

| 路径 | 归属 | 用途 |
|---|---|---|
| `/opt/src/annualreport/` | 老 vue 版官网**源码** | git clone 自 `git@github.com:themescene/f8se9f7s6fb5.git`（**master 分支，非 main**） |
| `/opt/src/annualreport/dist/` | 老 vue 版 build 产物 | `npm run build` 输出；也直接 commit 进 git |
| `/var/www/pianyu/dist/` | **官网静态部署目录** | nginx `root` 指这里，用户访问 `hxiazi.com` 命中它 |
| `/var/www/pianyu-backend/` | backend Python 代码 | git clone 自 `git@github-backend:castlewowohead/annualreport.git`（**main 分支**） |
| `/var/www/pianyu-backend/data/` | backend 运行时数据 | shares/ users.json uploads/ presets/ storage_boosts/ wx_url_links.json 等 |
| `/etc/nginx/sites-available/pianyu` | nginx 站点配置 | 软链到 `sites-enabled/pianyu`；仓库源在 `/var/www/pianyu-backend/deploy/nginx.conf` |
| `/etc/systemd/system/pianyu-backend.service` | gunicorn service unit | `systemctl restart pianyu-backend` |

**部署路径 ≠ 源码路径**，改代码在 `/opt/src/annualreport` 或 `/var/www/pianyu-backend`，产物在 `/var/www/pianyu/dist` 或跑在 gunicorn 里 —— 别搞混。

---

## 二、三条一键部署命令

### 1. Backend Python 代码改后（改的是 `demo/arbackend/src/**`）

```powershell
# 本地 push
cd F:\xiedao\vue\demo\arbackend; git commit ...; git push origin main

# 服务器一键部署（Windows PowerShell）
ssh hz 'cd /var/www/pianyu-backend && git pull --ff-only origin main && systemctl restart pianyu-backend && sleep 3 && systemctl is-active pianyu-backend'
```

### 2. Nginx 配置改后（改的是 `demo/arbackend/deploy/nginx.conf`）

```powershell
# 本地 push 后
ssh hz 'cd /var/www/pianyu-backend && git pull --ff-only origin master && cp deploy/nginx.conf /etc/nginx/sites-available/pianyu && nginx -t && systemctl reload nginx'
```

**不要 restart nginx**，用 `reload`（零停机）。`nginx -t` 通过再 reload；失败直接停手别 reload。

### 3. 官网静态页面改后（改的是 `demo/annualreport/public/**` 或 `src/**`）

**2026-09-14 起 hxiazi.com 根域名已切到新 h5**，老 vue 网页版只作为 `old.hxiazi.com` 子域兜底使用。改老站的场景现在只剩 3 个：老 `about.html` 内容、老站资源修复、临时数据恢复。

**必看**：annualreport 仓库是 `master` 分支不是 `main`。dist 是 commit 进 git 的（build 产物入库），服务器**不 build 直接 cp**。

改老 about.html（注意：photolio 首页右上角"关于"按钮打开的**是新根目录**的 `/var/www/photolio-h5/about.html`，这是切换时从老站 cp 过去的副本；改老 about.html **不影响新首页**，需要同时 cp 到新根）：

```powershell
ssh hz 'cd /opt/src/annualreport && git pull --ff-only origin master && \
  cp public/about.html /var/www/pianyu/dist/about.html && \
  cp public/about.html /var/www/photolio-h5/about.html && \
  rsync -av public/about/ /var/www/pianyu/dist/about/ && \
  rsync -av public/about/ /var/www/photolio-h5/about/'
```
> 从 `public/`（源）直接拷到两处（新 h5 根 + 老站根）。`about/` 用 rsync 同步新增图，**同样不加 `--delete`**。验证：`curl -sI https://hxiazi.com/about.html`（200）+ `curl -sI https://old.hxiazi.com/about.html`（200）。`hxiazi.com` 走阿里云 DNS、不过 Cloudflare → 部署后 `Ctrl+Shift+R` 硬刷即可，无需清 CDN。

改的是 vue 源码需要重 build 后同步 dist（尽量避免，产物入库容易冲突）：
```powershell
ssh hz 'cd /opt/src/annualreport && git pull --ff-only origin master && rsync -av dist/ /var/www/pianyu/dist/'
```

**永远不加 `--delete`**：`/var/www/pianyu/dist/` 里可能有历史遗留但仍在服役的资源，`--delete` 会误伤。

### 4. photolio h5 前端发版（改的是 `photolio/src/**`）

2026-11-06核查：前端远程为`themescene/Photolio_uniapp`的main，后端远程为`castlewowohead/annualreport`的main。先分别提交/推送源码（排除.env、.codex、本地空间数据和Python缓存），后端服务器`pull --ff-only`；H5本机构建并执行copy-h5-assets，再上传产物。当前public包含about.html、about/、favicon和uniform，构建会同步这些资源，因此下文“三样产物、不撞名”描述已过时；必须先备份，再明确覆盖当前受版本管理的同名资源，不删除站点遗留文件。个人空间生产调用`/api/spaces`，需先发布后端空间蓝图后再切前端；开发用`/personal-api`不可当生产接口。

```powershell
cd F:\xiedao\vue\photolio; npm run build:h5
scp -r F:\xiedao\vue\photolio\dist\build\h5\* hz:/var/www/photolio-h5/
```

> **切换时搬过来的老站文件不要动**：`/var/www/photolio-h5/about.html`、`about/`、`favicon.ico`、`robots.txt`、`sitemap.xml`、`uniform/` —— scp 加 `*` 通配符**不会**覆盖到这些名字之外的东西，天然安全（build 产物就 `assets/ static/ index.html` 三样，不会撞名）。想彻底刷新则手动删旧 `assets/` 目录再 scp。

### 5. photolio 小程序发版（改的是 `photolio/src/**`，走微信）

### 2026-11-06 H5与空间接口发布记录/回滚

2026-11-08 H5 增量发布：源码 `2cfb601` 已推送 GitHub main，生产后端仍为 `a9ad1a0`。本次发布保留旧资产，先同步资源再切换首页，384 个文件校验通过。旧站备份为 `/var/backups/photolio/20261108-reading-2cfb601/frontend-before.tar.gz`。快速回退可从该备份提取 `./index.html` 到站点临时文件，再原子替换首页，沿用下方 11 月 6 日命令的流程。

- 用户明确授权本次直接上线测试；后端main=`a9ad1a0`（发布前`ddf113e`），前端功能源码main=`95f932f`（首批`945a14e`加生产语言初始化修复）。后端先拉取/语法检查/重启，再发布H5。健康地址为`/health`，`/api/health`不提供。
- 备份目录`/var/backups/photolio/20261106-p2-a9ad1a0/`：`frontend.tar.gz`为原站全量静态备份，`backend-source.tar.gz`为原后端源码，`backend-before.txt`记旧提交；`h5-fixed.tar.gz`为最终发布包，`release.sha256`/`verification.log`核对全部183个文件。未删除旧assets、robots、sitemap或后端数据，未迁移本地测试账号空间。
- 上传先解包到备份目录的frontend-fixed，再`rsync -a --exclude=index.html`到站点，最后通过index.html.next原子替换入口。首页SHA256=`8c356e8d32ed3a76d576b86964625b6094503303d77dd06eb74bd94665d1a670`；最终包SHA256=`5c2f5c9e294ee5a80c60a169930012d693c9cfe773efc8805876ed59dd4c3d06`。Windows生成sha256清单需先`tr -d "\r"`再交给sha256sum。
- 快速恢复旧首页（旧assets仍保留）：`ssh hz 'tar -xOf /var/backups/photolio/20261106-p2-a9ad1a0/frontend.tar.gz ./index.html > /var/www/photolio-h5/index.html.next && mv /var/www/photolio-h5/index.html.next /var/www/photolio-h5/index.html'`。恢复全部旧静态文件可将frontend.tar.gz解包覆盖站点，不删除新文件。后端需回滚时先核对无新增未提交代码，再`git switch --detach ddf113e`＋重启pianyu-backend；保留data/personal_spaces，禁止删用户数据。随后健康检查；重新发布回到main并拉取已确认版本。
- 已验证：线上浏览器模板匿名直达、英文切换、返回主站；template接口成功、匿名mine/创建401、不存在空间404、about和old站200，backend/nginx active。真实账号上传保存、实卡NFC、手机录音及Safari未替用户完成。

### 小程序原发布流程（本次未执行）

`npm run build:mp-weixin` 输出到 `dist/build/mp-weixin/`（**不是 `dist/dev/mp-weixin/`**）。发版流程：

1. 本地：`cd F:\xiedao\vue\photolio; npm run build:mp-weixin`
2. 打开微信开发者工具 → 详情 → 项目路径改为 `F:\xiedao\vue\photolio\dist\build\mp-weixin` （日常调试用的是 `dist/dev/mp-weixin`，别弄混）
3. 顶部「上传」→ 填版本号 + 备注 → 上传体验版
4. 小程序管理后台 mp.weixin.qq.com → 版本管理 → 提交审核

**上传前自检**（避免历史踩坑）：
- 生产版启动**必须** `wx.setEnableDebug({enableDebug: false})`（[App.vue onLaunch](../src/App.vue)），否则老用户手机 vConsole 一直开
- 服务器域名白名单要包含 `https://hxiazi.com` + `https://upload.hxiazi.com`（request / uploadFile / downloadFile 三处）

---

## 三、日志查看

```powershell
# backend 实时日志（含所有 print + logger + gunicorn 请求）
ssh hz 'journalctl -u pianyu-backend -f'

# backend 最近 100 行 + 过滤关键字
ssh hz "journalctl -u pianyu-backend -n 500 --no-pager | grep -E 'ERROR|text-trace|content-security'"

# nginx access log
ssh hz 'tail -f /var/log/nginx/access.log'

# nginx error log（真出问题看这个）
ssh hz 'tail -50 /var/log/nginx/error.log'
```

**backend print 不刷 buffer 的坑**：`systemd unit` 里必须有 `--capture-output` + `Environment="PYTHONUNBUFFERED=1"`，否则 `print()` 永远进不了 journalctl。当前已配好，别删。

---

## 四、Windows PowerShell 传 ssh 的地雷

从本地跑 `ssh hz "..."` 时 PowerShell 会先解析引号里的东西，几个高频崩点：

| 危险 | 症状 | 修法 |
|---|---|---|
| `$(date +%s)` | PowerShell 把 `$(...)` 当自己的子表达式 → Get-Date 报错 | 外层用**单引号** `ssh hz '...date +%s...'` |
| `(...)` 出现在 bash 命令里 | bash 保留字，syntax error near unexpected token `(` | 拆语句 / 去掉括号 / 只用 echo 不带括号 |
| 双引号嵌套 | 内外引号打架 | 外层单引号 + 内层双引号（不能双单套双单） |
| `\|` 管道 | 沙箱 bash 特殊环境某些场景把 `\|` 拆掉 | 优先用 `grep -E 'a\|b\|c'`（引号包住） |

**内网命令记忆**：**外层永远单引号 + 内层双引号 + 关键管道用 grep -E 包住整个 pattern**。

---

## 五、Nginx 配置的两个历史地雷

写在 [nginx.conf](../../demo/arbackend/deploy/nginx.conf) 顶部注释里，此处再复述：

1. **服务器 nginx 版本 1.18.0（Ubuntu），不认 `http2 on;` 新指令**。必须用 `listen 443 ssl http2;` 老语法（1.9.5+ 全支持）。除非哪天你升级到 1.25.1+ 才能换。
2. **location regex 里含花括号 `{6,32}` 必须用双引号包整个 pattern**：`location ~ "^/s/[A-Za-z0-9_-]{6,32}$" { ... }`。否则 nginx 把 `{` 当成 block 起始，报 `unknown directive "6,32}$"`。

---

## 六、SSL 证书续期

Let's Encrypt 证书 90 天有效期，certbot 自动续。手动检查：

```powershell
ssh hz 'certbot certificates 2>&1 | grep -E "Domain|Expiry"'
```

到期 30 天前会自动跑（cron / systemd timer 已配）。首次颁发命令：
```bash
certbot certonly --webroot -w /var/www/certbot \
  -d hxiazi.com -d www.hxiazi.com -d upload.hxiazi.com -d umami.hxiazi.com
```

---

## 七、微信小程序服务器域名白名单（改了记得同步这里 → 微信后台）

**这不是服务器上能改的**，但**当你改了 backend 域名或加了新子域**，必须去：
- 小程序后台 → 开发管理 → 服务器域名
- request / uploadFile / downloadFile **三处都要加**：
  - `https://hxiazi.com`
  - `https://upload.hxiazi.com`（视频大文件）

否则前端 `uni.request` 直接报 `url not in domain list`。

---

## 八、备份与灾备

- **backend data**：`/var/www/pianyu-backend/data/`。每晚 3AM `backup_data_to_home.sh` 通过 Tailscale 传家里 Windows。
- **家里硬盘冷存储**：`rclone crypt` 加密，密码本地 3 份（1Password + 打印 + 抽屉）。
- **香港旧机**：`hz-hk` 别名可 SSH，2026-08-12 前保留一份 backend 快照做回滚兜底。

**服务器坏了的应急手册**（详细步骤在 [`demo/arbackend/deploy/MIGRATION_HANDOVER.md`](../../demo/arbackend/deploy/MIGRATION_HANDOVER.md)）：
1. 新开阿里云 ECS
2. `ssh-copy-id` 加公钥
3. clone backend + annualreport 两个仓库
4. 装 nginx / python3.11 / gunicorn / rclone / tailscale
5. 从家里备份还原 `data/` 到 `/var/www/pianyu-backend/data/`
6. cp deploy/nginx.conf + systemd unit
7. certbot 申请新证书
8. DNS 换 A 记录到新 IP

### 阿里云欠费停机的故障签名（2026-09-16 用户实测踩坑）

**症状**（跟 nginx/gunicorn 挂几乎一模一样，容易走错路）：
- ✅ DNS 解析正常（`nslookup hxiazi.com` 返 `112.124.70.124`）
- ✅ TCP 443 端口 `Test-NetConnection` 返 True（TCP 层可 accept）
- ❌ HTTPS 请求 timeout（`Invoke-WebRequest https://hxiazi.com/` 30s 无响应）
- ❌ SSH 22 端口也 timeout（连不上服务器）
- ❌ 所有客户端全挂（h5 / mp-weixin / 手机浏览器一起不通）

**跟 nginx 挂的区别**：nginx 挂了 SSH 通得进去；欠费停机 SSH 也不通。**SSH 22 timeout 是关键判别信号**。

**处理**：
1. 阿里云控制台看 ECS `iZbp1h5tq0bt2fn6eq9pgpZ` 状态 —— 欠费会显示"已停机"或"欠费"
2. 充值 → 自动恢复（不需要手工重启，阿里云自动开机）
3. 全线自动恢复无需其他动作

**预防**：
- 阿里云控制台 → **账户与权益** → 设**余额报警**（低于 X 元邮件短信）
- 或者开**自动续费**（ECS 每月自动扣，避免忘记充值）

**排查顺序（下次会话遇到"全线 timeout"直接照抄）**：
1. `nslookup hxiazi.com`：DNS 正常吗？
2. `Test-NetConnection hxiazi.com -Port 443`：TCP 通吗？
3. `Test-NetConnection 112.124.70.124 -Port 22`：SSH 通吗？
4. **如果 443 TCP 通但 HTTPS timeout 且 22 也 timeout** → 直接查阿里云控制台欠费 / 停机状态，别浪费时间猜 nginx / DNS / VPN

---

## 九、启用 `old.hxiazi.com` 老 vue 兜底（2026-09-15 新增）

**用户场景**：新 photolio h5 用微信登录为主，但老账号仍存在于老 vue 网页版（用户名密码）。有些人想回老网页找老数据 → 给个 `old.hxiazi.com` 子域名即可。

**为什么不用 `hxiazi.com/old/` 前缀**：老 vue 用 root-relative asset 路径（`/assets/xxx.js`），加前缀后浏览器请求会命中新 h5 的 assets（同名不同内容）→ 老站崩。子域名方案零改动。

**一次性开启步骤**：

1. **DNS**：阿里云 DNS 控制台加 `old.hxiazi.com` A 记录 → `112.124.70.124`（跟主站同 IP）
2. **certbot 加 SAN**（把 old.hxiazi.com 加进主证书）：
   ```bash
   ssh hz "certbot certonly --webroot -w /var/www/certbot \
     -d hxiazi.com -d www.hxiazi.com -d upload.hxiazi.com \
     -d umami.hxiazi.com -d app.hxiazi.com -d old.hxiazi.com"
   ```
   `-d` 原来那几个**全部要重列一遍**，certbot 才会做一张含所有域的新证书；漏 `-d` 就会掉。
3. **push backend 拿脚本 + conf 到服务器**：
   ```powershell
   cd F:\xiedao\vue\demo\arbackend; git push origin main
   ```
4. **服务器执行 enable 脚本**：
   ```bash
   ssh hz "cd /var/www/pianyu-backend && git pull --ff-only origin main && bash deploy/enable-old-subdomain.sh"
   ```
   脚本会自检证书 SAN、备份 nginx site、include 新 conf、`nginx -t` + reload、冒烟测试。

**验证**：
```powershell
ssh hz 'curl -skI https://old.hxiazi.com/ | head -3'   # 200
ssh hz 'curl -skI https://hxiazi.com/ | head -3'       # 200，新 photolio 不受影响
```

**回滚**：脚本末尾会打印。核心：`cp -a` bak 覆盖回去 + `nginx -t` + `reload`。

**契约**（写死，勿改）：
- 老站源目录 `/var/www/pianyu/dist` 一个字节不动 —— 切换到新版时脚本本来就没删
- `old.hxiazi.com/api/`、`old.hxiazi.com/uploads/` 走本机 backend / uploads 原封复用
- 新 h5 首页右上角"旧版"按钮直接跳 `https://old.hxiazi.com/`

---

## 十、相册误串合集的数据回收（2026-09-16 新增）

**背景**：用户在旧版前端非 owner 追加走了 CreationFlow 路径 → 建了新 share 绑 group_id → 原相册被识别为合集成员 → 打开就是画匣子模式。前端 R19 契约（[README.md R19](../README.md#R19)）已修，但存量数据要人工回收。

**判定当前 share 是否踩坑**：
```bash
ssh hz "python3 -c \"
import json
d = json.load(open('/var/www/pianyu-backend/data/shares/<SHARE_ID>.json'))
print('share_type:', d.get('share_type'))
print('group_id:  ', d.get('group_id'))
print('eps:       ', len(d.get('report',{}).get('episodes',[])))
\""
```

`share_type == 'album'` 且 `group_id` 非 None → 踩坑，需要回收。

**回收流程（合并型，保留追加内容）**：

1. **找绑到同一 group 的其他 share**：
   ```bash
   ssh hz "grep -l '\"group_id\": \"<SHARE_ID>\"' /var/www/pianyu-backend/data/shares/*.json"
   ```
2. **备份 + 合并**（合追加者的 media 进主 episode.images）+ 删 chapter share + 删 group file + 清 group_id
3. **验证**：`share_type == 'album'`, `group_id == null`, `imgs` 数量正确

**参考实际案例**（QkB8FQOy 事故）：

```bash
ssh hz "cat > /tmp/rescue.py <<'PY'
import json, shutil, os, sys
from pathlib import Path
DATA = Path('/var/www/pianyu-backend/data')
STAMP = 'YYYYMMDD-HHMM'  # 每次跑改一下
BAK = Path(f'/tmp/rescue-{STAMP}'); BAK.mkdir(exist_ok=True)
apply = '--apply' in sys.argv
def load(p): return json.load(open(p, encoding='utf-8'))
def save(p, d):
    tmp = str(p)+'.tmp'
    json.dump(d, open(tmp,'w',encoding='utf-8'), ensure_ascii=False, indent=2)
    os.replace(tmp, p)
MAIN='QkB8FQOy'; CHAP='Qadwz8ds'
main_p=DATA/'shares'/f'{MAIN}.json'; chap_p=DATA/'shares'/f'{CHAP}.json'
grp_p=DATA/'groups'/f'{MAIN}.json'
main=load(main_p); chap=load(chap_p)
main_ep=main['report']['episodes'][0]; chap_ep=chap['report']['episodes'][0]
main_imgs=main_ep.get('images',[]) or []
chap_imgs=chap_ep.get('images',[]) or []
print(f'合并 {len(main_imgs)} + {len(chap_imgs)} -> {len(main_imgs)+len(chap_imgs)} 张')
if not apply:
    print('（预演）'); sys.exit()
for p in [main_p, chap_p, grp_p]:
    if p.exists(): shutil.copy2(p, BAK/p.name)
main_ep['images'] = main_imgs + chap_imgs
main['group_id'] = None
save(main_p, main)
os.remove(chap_p)
if grp_p.exists(): os.remove(grp_p)
print(f'备份 -> {BAK}. 回滚: cp {BAK}/*.json 到对应位置')
PY
python3 /tmp/rescue.py           # 预演
python3 /tmp/rescue.py --apply   # 应用"
```

**注意事项**：
- 追加者是别人时（`user_id` 不同），合并前跟原 owner 确认要不要保留追加内容
- backend **无缓存**，改完直接生效，**不用重启**
- 用户浏览器可能缓存了旧 share manifest，让用户硬刷（Ctrl+Shift+R）

---

## 九、常见巡检命令

```powershell
# 服务器整体健康
ssh hz 'uptime; df -h /; free -m; systemctl is-active pianyu-backend nginx; certbot certificates 2>&1 | grep VALID'

# backend 内存占用
ssh hz 'ps aux | grep gunicorn | grep -v grep | head -6'

# 磁盘用量按目录
ssh hz 'du -sh /var/www/pianyu-backend/data/* 2>/dev/null | sort -h | tail -10'

# 今日请求量
ssh hz "awk '\$4 ~ /$(date +%d/%b/%Y)/' /var/log/nginx/access.log | wc -l"
```

---

## 十、绝对禁止清单

- ❌ `git push --force` 到 backend / annualreport master
- ❌ 直接改 `/var/www/pianyu/dist/**` 的文件（改 `/opt/src/annualreport` 源码 → 走 pull + cp 流程）
- ❌ 直接改 `/etc/nginx/sites-available/pianyu`（改 `deploy/nginx.conf` → git push → cp 部署）
- ❌ `rm -rf /var/www/pianyu-backend/data/`（要备份后再动）
- ❌ `systemctl restart nginx`（用 `reload`）
- ❌ SSH 修改 backend 代码不 commit（服务器只是"部署副本"，源真理在本地 git）


## 2026-11-13 Yifang当前版发布

- 用户授权上线取材；GitHub themescene/Photolio_uniapp main源码281b1cc。部署路径/var/www/photolio-h5；备份/var/backups/photolio/20261113-yifang/frontend-before.tar.gz，发布包h5.tar.gz、manifest.json、deploy.py同目录。本机对应.local-backups/release-20261113。
- 先tar备份、上传、解包校验，再rsync -a --exclude=index.html（不删除遗留文件），最后index.html.next原子替换。412文件SHA256一致；公网首页与本地匹配，入口JS/CSS和照片/PDF/视频/health正常。未改后端/nginx。
- 回退入口：`ssh hz 'tar -xOf /var/backups/photolio/20261113-yifang/frontend-before.tar.gz ./index.html > /var/www/photolio-h5/index.html.next && mv /var/www/photolio-h5/index.html.next /var/www/photolio-h5/index.html'`。旧assets保留；如需完整恢复则解包备份覆盖站点，不删除文件。


## 2026-11-13 手机布局/ASR修复发布

前端0ab35d0、后端71b8a5e已推各自GitHub main。后端只发布round controller/service和media repository三文件，保留服务器.env.bak-hk、data-snapshots等已有未跟踪项；语法检查后重启active。前端备份/发布包/manifest/deploy脚本在/var/backups/photolio/20261113-mobile-asr/，本机.local-backups/mobile-asr-20261113；不删除旧assets，原子切首页，412文件SHA256一致。线上实际浏览器录音ASR200且回填20字符，WebM/碎片MP4与静音错误分支均真实验证。

前端回退：`ssh hz 'tar -xOf /var/backups/photolio/20261113-mobile-asr/frontend-before.tar.gz ./index.html > /var/www/photolio-h5/index.html.next && mv /var/www/photolio-h5/index.html.next /var/www/photolio-h5/index.html'`。后端前版a9ad1a0；需要回退时先核对工作区再切对应提交并重启，不动data。


2026-11-13 项目名实心快修：前端发布包/校验清单/旧站备份位于/var/backups/photolio/20261113-solid-names/，frontend-before.tar.gz可恢复上一版首页。沿用先资源后原子切index流程，不删除旧资产，无后端改动。

## 2026-11-16 作品集媒体框与开场排版发布

- 前端源码 `7addcf4` 已推送 `themescene/Photolio_uniapp` 的 main。H5 本地构建及资源复制通过，经 `ssh hz` 发布至 `/var/www/photolio-h5`。本次不发布后端、不改 nginx。
- 备份及发布记录位于 `/var/backups/photolio/20261116-yifang-7addcf4/`：`frontend-before.tar.gz` 为原站完整备份，`h5.tar.gz`、`manifest.json`、`deploy.py` 为本次发布包与校验脚本。本地副本为 `.local-backups/release-20261116/`。
- 先校验暂存目录，再 rsync 资源（不加 `--delete`），最后原子替换 index.html。429 文件 SHA256 校验一致；公网首页 SHA256 为 `697d555ca8265d3626866a80981b6d09999b6eb9d0e4b6c50536d77360b9f1d6`，与本地匹配。新 logo、秒装截图、最新简历及 `/health` 均返回 200，nginx/backend 均 active。未重新上传 `folio-local`，保留线上既有文件。
- 回退首页：`ssh hz 'tar -xOf /var/backups/photolio/20261116-yifang-7addcf4/frontend-before.tar.gz ./index.html > /var/www/photolio-h5/index.html.next && mv /var/www/photolio-h5/index.html.next /var/www/photolio-h5/index.html'`。旧 assets 保留，可随入口恢复；用户数据不作改动。
