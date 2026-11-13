import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';

const root = process.cwd();
const python = process.env.PYTHON || 'python';
function freePort(preferred) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', error => preferred ? freePort(0).then(resolve, reject) : reject(error));
    probe.listen(preferred, '0.0.0.0', () => {
      const address = probe.address();
      probe.close(() => resolve(address.port));
    });
  });
}
const frontendPort = await freePort(5173);
const backend = join(root, '..', 'demo', 'arbackend', 'src', 'business', 'services', 'space_service.py');
if (!existsSync(backend)) {
  console.error('缺少同级 demo/arbackend 的个人空间接口源码，请先完成后端安装。');
  process.exit(1);
}
const api = spawn(python, ['-u', 'portfolio_subproject/server/dev_server.py'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
let vite;
let pending = '';
api.stdout.on('data', data => {
  pending += data.toString();
  const lines = pending.split(/\r?\n/);
  pending = lines.pop() || '';
  for (const line of lines) {
    const match = line.match(/^PERSONAL_SPACE_READY=(\d+)$/);
    if (match && !vite) {
      console.log('个人空间本地保存服务已启动，已有内容继续读取画匣子。');
      vite = spawn(process.execPath, ['node_modules/@dcloudio/vite-plugin-uni/bin/uni.js', '--port', String(frontendPort)], {
        cwd: root, stdio: 'inherit', env: { ...process.env, PERSONAL_SPACE_PORT: match[1] },
      });
      vite.on('exit', code => { api.kill(); process.exitCode = code ?? 0; });
    } else if (line.startsWith('[space-perf]')) console.log(line);
  }
});
api.on('error', () => { console.error('无法启动 Python，请安装 Python 3.10+ 或设置 PYTHON 路径。'); process.exitCode = 1; });
api.on('exit', code => { if (code) { vite?.kill(); process.exitCode = code; } });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { vite?.kill(); api.kill(); process.exit(); });
