import { defineConfig } from "vite";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import uni from "@dcloudio/vite-plugin-uni";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [{ name: 'h5-about-static', configureServer(server) {
    server.middlewares.use((req, res, next) => {
      const pathname = decodeURIComponent((req.url || '').split('?')[0]);
      if (pathname !== '/about.html' && pathname !== '/favicon.ico' && !pathname.startsWith('/about/') && !pathname.startsWith('/uniform/')) return next();
      const file = resolve(__dirname, 'public', '.' + pathname);
      const root = resolve(__dirname, 'public');
      if (!file.startsWith(root + '/') && !file.startsWith(root + '\\')) return next();
      if (!existsSync(file)) return next();
      const extension = file.split('.').pop()?.toLowerCase();
      res.setHeader('Content-Type', extension === 'html' ? 'text/html; charset=utf-8' : extension === 'svg' ? 'image/svg+xml' : extension === 'png' ? 'image/png' : extension === 'ico' ? 'image/x-icon' : 'image/jpeg');
      res.end(readFileSync(file));
    });
  } }, uni()],
  build: {
    rollupOptions: {
      output: {
        // 生产静态站的 MIME 表识别 .js，模块 worker 也必须以 JavaScript 类型返回。
        assetFileNames: asset => asset.name === 'pdf.worker.min.mjs'
          ? 'assets/pdf.worker-[hash].js'
          : 'assets/[name]-[hash][extname]',
      },
    },
  },
  server: {
    proxy: {
      "/personal-api": {
        target: `http://127.0.0.1:${process.env.PERSONAL_SPACE_PORT || 5001}`,
        rewrite: (path) => path.replace(/^\/personal-api/, "/api"),
      },
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
});
