#!/usr/bin/env node
/**
 * H5 build post-processing: copy `public/` → `dist/build/h5/`.
 *
 * 【为什么需要这个脚本】
 * uni-app 的 h5 build 不像标准 Vite 那样把 `public/` 直接 copy 到输出。而 `src/static/`
 * 又对 mp-weixin 主包一视同仁（1.7MB bg 图直接把主包顶爆 2MB 上限 → 上传微信体验版失败）。
 * 结论：用 `public/` 作为 **h5-only 静态资源**目录，用 build 后置脚本 copy 到 h5 输出。
 * mp-weixin 编译器不看 `public/`，天然被排除。
 *
 * 【契约】
 * `public/xxx/` 里的所有文件会拷到 `dist/build/h5/xxx/`（保持相对路径）。
 * 前端引用时用 root-relative URL：`/bg/bg1.jpg`（对应 `public/bg/bg1.jpg`）。
 */
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "public");
const DST = path.join(ROOT, "dist", "build", "h5");

if (!existsSync(SRC)) {
  console.log("[copy-h5-assets] no public/ dir, skip");
  process.exit(0);
}
if (!existsSync(DST)) {
  console.error(`[copy-h5-assets] dist output not found: ${DST}`);
  console.error("run `npm run build:h5` first");
  process.exit(1);
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const srcPath = path.join(src, e.name);
    const dstPath = path.join(dst, e.name);
    if (e.isDirectory()) await copyDir(srcPath, dstPath);
    else await fs.copyFile(srcPath, dstPath);
  }
}

const t0 = Date.now();
await copyDir(SRC, DST);
const pdfAssets = path.join(ROOT, "node_modules", "pdfjs-dist");
for (const folder of ["cmaps", "standard_fonts", "wasm"]) {
  await copyDir(path.join(pdfAssets, folder), path.join(DST, "pdf-preview", folder));
}
console.log(`[copy-h5-assets] copied public/ → dist/build/h5/ in ${Date.now() - t0}ms`);
