"""独立端口/临时数据的浏览器验收环境；不进入正常开发或生产认证路径。"""
import json
import tempfile
import threading
import time
import os
from urllib.parse import urlsplit
from http.server import ThreadingHTTPServer
from urllib.request import urlopen
from urllib.error import HTTPError
from dev_server import Handler, SpaceRepository
from test_spaces import Gateway
import dev_server


class FixtureGateway(Gateway):
    def __init__(self, authorization):
        self.user = {'Bearer fixture-a': 'a', 'Bearer fixture-b': 'b'}.get(authorization)
        self.authorization = authorization

    def get(self, path, anonymous=False):
        if path == '/auth/me' and self.user:
            return {'user_id': self.user}
        raise PermissionError('这是独立测试环境，请选择测试账号')

    def share(self, user, sid):
        value, public = super().share(user, sid)
        value['report']['episodes'][0]['images'][0]['image_url'] = self.origin + '/__test_image.svg'
        return value, public


class FixtureHandler(Handler):
    content_requests = []
    def do_GET(self):
        if self.path == '/__test_metrics':
            return self.reply(json.dumps(self.content_requests).encode(), 'application/json')
        if urlsplit(self.path).path == '/personal-api/spaces/content':
            self.content_requests.append(self.path)
            time.sleep(float(os.environ.get('FIXTURE_CONTENT_DELAY', '0')))

        if self.path == '/__test_login':
            html = '''<!doctype html><meta charset="utf-8"><title>独立验收环境</title>
            <h1>个人空间：独立测试账号</h1><p>使用临时数据，不连接真实账号。</p>
            <button onclick="login('a')">使用测试账号A</button><button onclick="login('b')">使用测试账号B</button>
            <button onclick="localStorage.clear();location.href='/#/pages/personal/index'">以访客身份查看</button>
            <script>function login(id){localStorage.clear();localStorage.setItem('photolio_token','fixture-'+id);location.href='/#/pages/personal/index'}</script>'''
            return self.reply(html.encode(), 'text/html; charset=utf-8')
        if self.path == '/__test_image.svg':
            svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#c5f8ca"/><text x="60" y="300" font-size="64">Photolio / test asset</text></svg>'
            return self.reply(svg.encode(), 'image/svg+xml')
        if self.path.startswith('/personal-api/'):
            self.path = self.path.replace('/personal-api/', '/api/', 1)
            return self.handle_space()
        try:
            with urlopen('http://127.0.0.1:5173' + self.path, timeout=20) as response:
                return self.reply(response.read(), response.headers.get('Content-Type', 'text/plain'))
        except HTTPError as exc:
            return self.reply(exc.read(), exc.headers.get('Content-Type', 'text/plain'), exc.code)

    def do_POST(self):
        self.path = self.path.replace('/personal-api/', '/api/', 1)
        self.handle_space()

    do_PUT = do_POST

    def reply(self, data, content_type, status=200):
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='photolio-browser-test-') as folder:
        dev_server.repository = SpaceRepository(folder)
        dev_server.RemoteGateway = FixtureGateway
        server = ThreadingHTTPServer(('127.0.0.1', 0), FixtureHandler)
        FixtureGateway.origin = 'http://127.0.0.1:' + str(server.server_port)
        print(FixtureGateway.origin + '/__test_login', flush=True)
        server.serve_forever()
