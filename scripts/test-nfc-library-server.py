"""隔离NFC浏览器回归：假账号/假API/临时文件，不写现有生产服务。"""
import json
import tempfile
from email.parser import BytesParser
from email.policy import default
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import urlopen
from urllib.error import HTTPError


def sample_pdf():
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
               b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 300] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
               b'<< /Length 49 >>\nstream\nBT /F1 18 Tf 30 220 Td (Photolio PDF test) Tj ET\nendstream',
               b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    data = b'%PDF-1.4\n'; offsets = [0]
    for i, body in enumerate(objects, 1):
        offsets.append(len(data)); data += str(i).encode() + b' 0 obj\n' + body + b'\nendobj\n'
    xref = len(data); data += b'xref\n0 6\n0000000000 65535 f \n'
    data += b''.join(f'{offset:010} 00000 n \n'.encode() for offset in offsets[1:])
    return data + f'trailer\n<< /Root 1 0 R /Size 6 >>\nstartxref\n{xref}\n%%EOF\n'.encode()


class Fixture(BaseHTTPRequestHandler):
    records = {}
    requests = []
    binds = {}
    saved_sessions = {}
    first_save_fails = True
    origin = ''
    def log_message(self, *_): pass
    def send(self, value, status=200, content_type='application/json; charset=utf-8'):
        payload = value if isinstance(value, bytes) else json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type', content_type)
        self.send_header('Cache-Control','no-store'); self.send_header('Content-Length', str(len(payload))); self.end_headers(); self.wfile.write(payload)
    def ok(self, value): self.send({'status':'success','data':value})
    def do_GET(self):
        path = urlsplit(self.path).path
        if path == '/__test_login':
            return self.send(b'''<!doctype html><meta charset="utf-8"><title>NFC isolated test</title><h1>NFC isolated test</h1><button onclick="localStorage.clear();localStorage.setItem('photolio_token','nfc-test');location.href='/#/pages/nfc/index'">Test account</button>''',content_type='text/html')
        if path == '/__test_metrics':
            return self.send({'requests':self.requests,'binds':self.binds,'records':self.records})
        if path == '/uploads/nfc-test/sample.pdf': return self.send(sample_pdf(), content_type='application/pdf')
        if path.startswith('/api/'):
            self.requests.append({'method':'GET','path':self.path})
            if path == '/api/auth/me': return self.ok({'user_id':'nfc-test-user','nickname':'NFC Test','entitlements':[]})
            if path == '/api/user/shares':
                return self.ok({'shares':[{'share_id':sid,'report_title':r['report']['report_title'],'created_at':r['created_at'],'share_url':'/share/'+sid,'is_owner':True,'share_type':'memory'} for sid,r in self.records.items()]})
            if path == '/api/user/groups': return self.ok({'groups':[]})
            if path.startswith('/api/share/') and path.split('/')[-1] in self.records:
                return self.ok(self.records[path.split('/')[-1]])
            if path.startswith('/api/nfc/'):
                uid=path.rsplit('/',1)[-1]
                return self.ok({'preset_id':uid,'status':'filled' if uid in self.binds else 'empty',**self.binds.get(uid,{}),'bound_share_id':None})
            return self.send({'status':'error','message':'测试接口不存在'},404)
        try:
            with urlopen('http://127.0.0.1:5173'+self.path) as response:
                payload=response.read(); content_type=response.headers.get('Content-Type','text/plain')
            if path == '/src/config/env.ts':
                payload=payload.replace(b'https://upload.hxiazi.com/api',(self.origin+'/api').encode()).replace(b'https://hxiazi.com/api',(self.origin+'/api').encode()).replace(b'https://hxiazi.com',self.origin.encode())
            return self.send(payload,content_type=content_type)
        except HTTPError as error: return self.send(error.read(),error.code,'text/plain')
    def do_POST(self):
        body=self.rfile.read(int(self.headers.get('Content-Length',0))); path=urlsplit(self.path).path
        self.requests.append({'method':'POST','path':path})
        if path == '/api/upload-nfc-file':
            message=BytesParser(policy=default).parsebytes(('Content-Type: '+self.headers['Content-Type']+'\r\nMIME-Version: 1.0\r\n\r\n').encode()+body)
            parts={part.get_param('name',header='content-disposition'):part for part in message.iter_parts()}
            original=parts['original_name'].get_payload(decode=True).decode() if 'original_name' in parts else 'file.pdf'
            assert parts['file'].get_payload(decode=True).startswith(b'%PDF-')
            return self.ok({'file_url':self.origin+'/uploads/nfc-test/sample.pdf','original_name':original,'size_mb':0.1})
        data=json.loads(body or b'{}')
        if path == '/api/save-share':
            if self.first_save_fails:
                Fixture.first_save_fails=False
                return self.send({'status':'error','message':'模拟记录保存失败，请重试'},503)
            sid=self.saved_sessions.get(data['session_id']) or 'test-file-'+str(len(self.records)+1)
            self.saved_sessions[data['session_id']]=sid
            self.records[sid]={'share_id':sid,'created_at':'2026-11-05T04:00:00Z','nfc_fullscreen':True,'report':data['report']}
            return self.ok({'share_id':sid,'share_url':'/share/'+sid})
        if path.startswith('/api/preset/') and path.endswith('/bind'):
            uid=path.split('/')[-2]; self.binds[uid]=data
            return self.ok({'preset_id':uid,'status':'filled',**data})
        return self.send({'status':'error','message':'测试接口不存在'},404)

if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='nfc-browser-fixture-') as folder:
        pdf=Path(folder)/'测试作品集.pdf';pdf.write_bytes(sample_pdf())
        server=ThreadingHTTPServer(('127.0.0.1',0),Fixture);Fixture.origin='http://127.0.0.1:'+str(server.server_port)
        print(json.dumps({'url':Fixture.origin+'/__test_login','pdf':str(pdf)},ensure_ascii=False),flush=True)
        server.serve_forever()
