"""仅本地开发：空间数据落本机，认证及已有素材只读复用现有API。"""
import json
import os
import importlib.util
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.parse import parse_qs, urlsplit

BACKEND = Path(__file__).resolve().parents[3] / 'demo' / 'arbackend'
def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, BACKEND / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


SpaceContent = load_module('space_content', 'src/business/services/space_content.py').SpaceContent
SpaceService = load_module('space_service', 'src/business/services/space_service.py').SpaceService
dispatch_space = load_module('space_dispatch', 'src/business/services/space_dispatch.py').dispatch_space
repo_module = load_module('space_repository', 'src/data/repositories/file/space_repository.py')
SpaceRepository, SpaceConflict = repo_module.SpaceRepository, repo_module.SpaceConflict

DATA = Path(os.environ.get('PERSONAL_SPACE_DATA', Path(__file__).parent / '.local-data'))
repository = SpaceRepository(DATA)


from remote_gateway import RemoteGateway


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass  # 不记录含用户空间地址的访问日志或认证头

    def do_GET(self):
        self.handle_space()

    def do_POST(self):
        self.handle_space()

    def do_PUT(self):
        self.handle_space()

    def handle_space(self):
        parsed = urlsplit(self.path)
        status, result = 200, None
        user = None
        started = time.perf_counter()
        try:
            prefix = '/api/spaces'
            if parsed.path != prefix and not parsed.path.startswith(prefix + '/'):
                raise FileNotFoundError('接口不存在')
            tail = parsed.path[len(prefix):].strip('/')
            authorization = self.headers.get('Authorization', '')
            gateway = RemoteGateway(authorization)
            query = {key: values[0] for key, values in parse_qs(parsed.query).items()}
            if authorization and self.command == 'GET' and tail == 'content' and hasattr(gateway, 'prefetch'):
                gateway.prefetch(query)
            try:
                user = gateway.get('/auth/me').get('user_id') if authorization and tail != 'template' else None
            except PermissionError:
                user = None
                gateway.authorization = ''
            length = int(self.headers.get('Content-Length', 0))
            if length > 2_000_000:
                raise ValueError('空间配置过大')
            body = json.loads(self.rfile.read(length)) if length else {}
            result, status = dispatch_space(SpaceService(repository, SpaceContent(gateway)),
                                             self.command, tail, user, query, body)
            result = {'status': 'success', 'data': result}
        except SpaceConflict as exc:
            status, result = 409, {'status': 'error', 'message': str(exc)}
        except PermissionError as exc:
            status, result = 403 if user else 401, {'status': 'error', 'message': str(exc)}
        except FileNotFoundError as exc:
            status, result = 404, {'status': 'error', 'message': str(exc)}
        except (ValueError, TypeError, KeyError):
            status, result = 400, {'status': 'error', 'message': '请求格式或源内容不正确，请检查后重试'}
        except (URLError, TimeoutError, OSError):
            status, result = 503, {'status': 'error', 'message': '服务暂时无法连接，请稍后重试'}
        except Exception:
            status, result = 500, {'status': 'error', 'message': '个人空间暂时无法读取，请稍后重试'}
        print('[space-perf] ' + json.dumps({'operation': self.command + ' ' + parsed.path, 'status': status, 'elapsed_ms': round((time.perf_counter() - started) * 1000)}), flush=True)
        payload = json.dumps(result, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)


if __name__ == '__main__':
    httpd = ThreadingHTTPServer(('127.0.0.1', int(os.environ.get('PERSONAL_SPACE_PORT', '0'))), Handler)
    print('PERSONAL_SPACE_READY=' + str(httpd.server_port), flush=True)
    httpd.serve_forever()
