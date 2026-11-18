"""Host-only reader fixtures; no disks or TV paths are accessed."""
import importlib.util,json,shutil,struct,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('read_result',Path(__file__).with_name('read-result.py'))
reader=importlib.util.module_from_spec(spec);spec.loader.exec_module(reader)
class ReaderTests(unittest.TestCase):
    def test_saved_image_reads_fat_result_and_bounded_diagnostic(self):
        fat_spec=importlib.util.spec_from_file_location('fat32',Path(__file__).with_name('fat32.py'))
        fat=importlib.util.module_from_spec(fat_spec);fat_spec.loader.exec_module(fat)
        with tempfile.TemporaryDirectory() as d:
            p2=Path(d)/'p2';fat.create(p2,{'RESULT.JSON':b'{"phase":"fixture-only"}'})
            saved=Path(d)/'saved.img';mbr=bytearray(512);mbr[510:512]=b'\x55\xaa';mbr[466]=12
            struct.pack_into('<II',mbr,470,18432,131072)
            with saved.open('wb') as f:
                f.truncate(80*1024*1024);f.write(mbr);f.seek(4096);f.write(b'FIXTURE-DIAGNOSTIC')
                f.seek(18432*512)
                with p2.open('rb') as src:shutil.copyfileobj(src,f)
            result=reader.image(saved)
            self.assertEqual(result['result']['phase'],'fixture-only')
            self.assertEqual(result['bootstrapDiagnostic'],'FIXTURE-DIAGNOSTIC')
    def test_result_and_boundary(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'RESULT.JSON';p.write_text(json.dumps({'phase':'fixture-only'}))
            self.assertEqual(reader.result(p)['result']['phase'],'fixture-only')
            with self.assertRaises(ValueError):reader.regular(Path(d),65536)
            link=Path(d)/'link';link.symlink_to(p)
            with self.assertRaises(ValueError):reader.result(link)
            p.write_bytes(b'x'*65537)
            with self.assertRaises(ValueError):reader.result(p)
    def test_non_image_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'wrong.img';p.write_bytes(b'not an image')
            with self.assertRaises(ValueError):reader.image(p)
if __name__=='__main__':unittest.main()
