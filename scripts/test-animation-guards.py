"""Isolated controller/repository guard tests, without loading Flask or real cloud services."""
import ast,io,tempfile,unittest
from pathlib import Path
from types import SimpleNamespace
BACKEND=Path(__file__).resolve().parents[2]/'demo/arbackend/src'
def extract(path,name):
    tree=ast.parse(path.read_text(encoding='utf-8'))
    node=next(n for n in ast.walk(tree) if isinstance(n,ast.FunctionDef) and n.name==name)
    node.decorator_list=[]
    return compile(ast.fix_missing_locations(ast.Module(body=[node],type_ignores=[])),str(path),'exec')
class Image:
    is_animated=True
    def __enter__(self):return self
    def __exit__(self,*args):pass
class Guards(unittest.TestCase):
    def test_both_upload_compressors_preserve_animated_original_bytes(self):
        controller=BACKEND/'presentation/controllers/media_controller.py'
        repo=BACKEND/'data/repositories/file/file_media_repository.py'
        for path,name in [(controller,'compress_image_if_large'),(repo,'_compress_image_if_large')]:
            env={'Path':Path,'PILImage':SimpleNamespace(open=lambda _p:Image()),'io':io}
            exec(extract(path,name),env)
            with tempfile.TemporaryDirectory() as folder:
                file=Path(folder)/'animation.gif';original=b'GIF89a'+b'frame-data'*100000;file.write_bytes(original)
                self.assertFalse(env[name](None,file) if name.startswith('_') else env[name](file));self.assertEqual(file.read_bytes(),original)
    def test_unsupported_decoder_still_uses_existing_heic_fallback(self):
        def cannot_decode(_path):raise OSError('HEIC decoder unavailable')
        converted=[]
        def convert(_src,dst):converted.append(True);dst.write_bytes(b'JPEG');return True
        env={'Path':Path,'PILImage':SimpleNamespace(open=cannot_decode),'io':io,'_convert_image_to_jpeg_ffmpeg':convert}
        exec(extract(BACKEND/'presentation/controllers/media_controller.py','compress_image_if_large'),env)
        with tempfile.TemporaryDirectory() as folder:
            file=Path(folder)/'image.heic';file.write_bytes(b'HEIC');self.assertTrue(env['compress_image_if_large'](file));self.assertEqual(file.read_bytes(),b'JPEG');self.assertEqual(len(converted),1)
if __name__=='__main__':unittest.main(verbosity=2)
