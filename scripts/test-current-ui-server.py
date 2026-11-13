import importlib.util,json,copy
from pathlib import Path
from http.server import ThreadingHTTPServer
from urllib.parse import urlsplit
spec=importlib.util.spec_from_file_location('fixture',Path(__file__).with_name('test-nfc-library-server.py'));module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
class Current(module.Fixture):
    space={'space_id':'qa-space','title':'QA personal space','template_id':'charles-grid','template_version':1,'revision':1,'can_edit':True,'sections':[{'id':'projects','title':'Projects','layout':'grid','fixed_size':True,'aspect_ratio':'4:3','blocks':[{'id':'doc','kind':'url','title':'Resume.pdf','media_type':'file','url':'/uploads/nfc-test/sample.pdf','cover_url':'/qa-cover.svg','image_fit':'top','autoplay':True},{'id':'text','kind':'text','title':'Original title','text':'用户原文 stays unchanged.\nDraft text remains editable.'}]}]}
    def do_GET(self):
        path=urlsplit(self.path).path
        if path=='/__test_login': return self.send(b'''<!doctype html><meta charset="utf-8"><title>Current synthetic QA</title><button onclick="localStorage.clear();localStorage.setItem('photolio_token','nfc-test');location.href='/#/pages/account/settings'">Test settings</button><button onclick="localStorage.clear();localStorage.setItem('photolio_token','nfc-test');location.href='/#/pages/personal/index?space=qa-space'">Test space</button><a href="/#/pages/share/edit?id=qa-memory">Audio editor</a><a href="/#/pages/nfc/landing?uid=04000000000001">NFC album</a>''',content_type='text/html')
        if path=='/qa-audio.wav':
            import wave,io
            buffer=io.BytesIO()
            with wave.open(buffer,'wb') as audio: audio.setnchannels(1);audio.setsampwidth(2);audio.setframerate(8000);audio.writeframes(b'\0\0'*40000)
            return self.send(buffer.getvalue(),content_type='audio/wav')
        if path=='/qa-cover.svg': return self.send(b'<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="600" height="800" fill="#d7e4c8"/><text x="30" y="65" font-size="32">PDF COVER - TOP</text><path d="M30 100H570M30 160H570M30 220H570" stroke="#344" stroke-width="6"/></svg>',content_type='image/svg+xml')
        if path=='/api/auth/me':return self.ok({'user_id':'nfc-test-user','nickname':'QA User','username':'qa','entitlements':['preset_links']})
        if path.startswith('/personal-api/spaces'):
            if path.endswith('/mine'):return self.ok({'spaces':[{'space_id':'qa-space','title':'QA personal space','revision':1}]})
            if path.endswith('/content'):return self.ok({'items':[],'total':0})
            return self.ok(self.space)
        if path=='/api/share/qa-memory':return self.ok({'share_id':'qa-memory','share_type':'memory','report':{'report_title':'Original title','episodes':[{'episode_id':0,'author_id':'nfc-test-user','template_id':'reflection','copywriting':{'h1':'Original title','h2':'','body':'用户原文 stays unchanged.'},'images':[],'audio_url':self.origin+'/qa-audio.wav','audio_duration':5}]}})
        if path=='/api/share/qa-memory/permissions':return self.ok({'can_edit':True,'is_owner':True,'share_type':'memory'})
        if path=='/api/nfc/04000000000001':return self.ok({'status':'filled','bound_type':'share','bound_share_id':'qa-album','preset_id':'qa'})
        if path=='/api/share/qa-album':return self.ok({'share_id':'qa-album','report':{'report_title':'QA album','episodes':[{'episode_id':0,'images':[]}]}})
        if path=='/api/share/qa-album/permissions':return self.ok({'share_type':'album','can_edit':True,'is_owner':True})
        return super().do_GET()
    def do_PUT(self):
        body=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))) or b'{}');path=urlsplit(self.path).path
        self.requests.append({'method':'PUT','path':path,'body':body})
        if path=='/personal-api/spaces/qa-space':Current.space=body;Current.space['revision']+=1;return self.ok(Current.space)
        return self.ok({})
    def do_POST(self):
        if self.path=='/api/share/qa-memory/update':
            data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))));self.requests.append({'method':'POST','path':self.path,'body':data});return self.ok({})
        if self.path.endswith(('/begin-edit','/end-edit')):
            self.rfile.read(int(self.headers.get('Content-Length',0)));return self.ok({})
        return super().do_POST()
if __name__=='__main__':
 server=ThreadingHTTPServer(('127.0.0.1',12437),Current);Current.origin='http://127.0.0.1:'+str(server.server_port);Current.space['sections'][0]['blocks'][0]['cover_url']=Current.origin+'/qa-cover.svg';print(Current.origin+'/__test_login',flush=True);server.serve_forever()
