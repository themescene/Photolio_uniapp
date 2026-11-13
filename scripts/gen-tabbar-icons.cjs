/**
 * 生成 mp-weixin tabBar 用的 PNG 图标。
 *
 * 微信小程序 tabBar.iconPath 只支持 PNG/JPG，所以这里用 pngjs 直接合成 5 组 × 2 张
 * 共 10 张 48×48 透明背景小图标（普通态 + 选中态）。
 *
 * 设计：用极简的几何线条勾勒出 5 个 tab 的形象，避免引入第三方字体或 SVG → PNG
 * 转换链：
 *   - home    画匣子：横条 + 下面一行小点 (代表卡片列表)
 *   - upload  上传：上箭头 + 底框 (代表上传到云端)
 *   - play    播放：三角形 ▶
 *   - nfc     NFC：圆角矩形 + 中间圆点 (代表 NFC 卡)
 *   - profile 我的：圆头 + 圆肩 (代表头像剪影)
 *
 * 运行：node scripts/gen-tabbar-icons.cjs
 * 输出：src/static/tabbar/<name>.png + src/static/tabbar/<name>-active.png
 */
const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const OUT = path.resolve(__dirname, '../src/static/tabbar');
fs.mkdirSync(OUT, { recursive: true });

const SIZE = 48;
const INACTIVE = [0x9a, 0xa0, 0xaa, 0xff];  // #9aa0aa 与 pages.json 对齐
const ACTIVE   = [0x2c, 0x3e, 0x50, 0xff];  // #2c3e50

/** 创建一个空 PNG（透明） */
function blank() {
  const png = new PNG({ width: SIZE, height: SIZE, colorType: 6 });  // RGBA
  png.data.fill(0);
  return png;
}

function setPixel(png, x, y, color) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (SIZE * y + x) << 2;
  png.data[i] = color[0];
  png.data[i + 1] = color[1];
  png.data[i + 2] = color[2];
  png.data[i + 3] = color[3];
}

function fillRect(png, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) setPixel(png, xx, yy, color);
  }
}

function fillCircle(png, cx, cy, r, color) {
  for (let yy = cy - r; yy <= cy + r; yy++) {
    for (let xx = cx - r; xx <= cx + r; xx++) {
      const dx = xx - cx, dy = yy - cy;
      if (dx * dx + dy * dy <= r * r) setPixel(png, xx, yy, color);
    }
  }
}

function strokeRect(png, x, y, w, h, color) {
  fillRect(png, x, y, w, 2, color);
  fillRect(png, x, y + h - 2, w, 2, color);
  fillRect(png, x, y, 2, h, color);
  fillRect(png, x + w - 2, y, 2, h, color);
}

function fillTriangleRight(png, cx, cy, size, color) {
  // 等边三角形（指向右），cx/cy 为中心
  const halfH = size;
  const halfW = size;
  for (let dy = -halfH; dy <= halfH; dy++) {
    const ratio = 1 - Math.abs(dy) / halfH;
    const w = Math.floor(halfW * 2 * ratio);
    for (let xx = cx - halfW; xx < cx - halfW + w; xx++) {
      setPixel(png, xx, cy + dy, color);
    }
  }
}

// ── 五个 tab 各自的绘制函数 ─────────────────────────────
function drawHome(png, color) {
  // 大方框（画匣子轮廓）+ 内部一道横线（图片）+ 底部 3 个小点（列表项）
  strokeRect(png, 8, 10, 32, 28, color);
  fillRect(png, 12, 18, 24, 2, color);          // 顶部"图片"分割线
  for (let i = 0; i < 3; i++) {
    fillRect(png, 12 + i * 9, 26, 7, 4, color); // 3 个小条
  }
}

function drawUpload(png, color) {
  // 向上箭头 + 底部托盘
  fillRect(png, 8, 36, 32, 4, color);          // 底盘
  fillRect(png, 22, 10, 4, 22, color);         // 箭头主干
  // 箭头头部（用三角填充模拟）
  for (let i = 0; i < 8; i++) {
    fillRect(png, 16 + i, 16 - i, 16 - i * 2, 2, color);
  }
}

function drawPlay(png, color) {
  // 大三角播放符
  fillTriangleRight(png, 24, 24, 14, color);
}

function drawNfc(png, color) {
  // 圆角矩形外框 + 中间小同心圆（NFC 标志）
  strokeRect(png, 8, 12, 32, 24, color);
  fillCircle(png, 24, 24, 3, color);
  // 外圈（断点圆，用半圆段模拟，简化为另一个稍大的圆环）
  for (let yy = 16; yy <= 32; yy++) {
    for (let xx = 16; xx <= 32; xx++) {
      const dx = xx - 24, dy = yy - 24;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 36 && d2 <= 49) setPixel(png, xx, yy, color);
    }
  }
}

function drawProfile(png, color) {
  // 头像：上圆头 + 下圆肩
  fillCircle(png, 24, 17, 7, color);
  // 圆肩（半圆）
  for (let yy = 26; yy <= 40; yy++) {
    for (let xx = 10; xx <= 38; xx++) {
      const dx = xx - 24, dy = yy - 26;
      if (dx * dx + dy * dy <= 14 * 14 && dy >= 0) setPixel(png, xx, yy, color);
    }
  }
}

const ICONS = [
  { name: 'home',    draw: drawHome    },
  { name: 'upload',  draw: drawUpload  },
  { name: 'play',    draw: drawPlay    },
  { name: 'nfc',     draw: drawNfc     },
  { name: 'profile', draw: drawProfile },
];

for (const { name, draw } of ICONS) {
  const png1 = blank();
  draw(png1, INACTIVE);
  png1.pack().pipe(fs.createWriteStream(path.join(OUT, `${name}.png`)));

  const png2 = blank();
  draw(png2, ACTIVE);
  png2.pack().pipe(fs.createWriteStream(path.join(OUT, `${name}-active.png`)));

  console.log(`generated ${name}.png + ${name}-active.png`);
}
