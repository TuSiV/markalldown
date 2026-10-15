import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from converter import Converter,ConversionError
import anydoc
ROOT=Path(__file__).parent/'fixtures/local-engines'
class LocalEngineTests(unittest.TestCase):
 def test_legacy_office_contains_actual_content(self):
  c=Converter()
  for name,expected in [('sample.doc','Fixture Document'),('sample.ppt','Title'),('sample.xls','Name'),('sample.xlsb','Region'),('chinese.doc','中文合同'),('chinese.ppt','中文合同汇报')]:
   with self.subTest(name=name):
    text=c.convert_file(str(ROOT/name));self.assertTrue(text.strip());self.assertIn(expected.lower(),text.lower())
 def test_chinese_rtf_and_corrupt_legacy(self):
  c=Converter()
  with tempfile.TemporaryDirectory() as d:
   p=Path(d)/'chinese.rtf';p.write_bytes(b'{\\rtf1\\ansi \\u20013?\\u25991? 13800138000}')
   self.assertIn('中文',c.convert_file(str(p)))
   for ext in ['doc','ppt']:
    p=Path(d)/('broken.'+ext);p.write_bytes(b'broken document')
    with self.assertRaises(ConversionError):c.convert_file(str(p))
 def test_magic_signature_ignores_mislabeled_extension(self):
  self.assertEqual(anydoc.format_from_bytes((ROOT/'sample.doc').read_bytes()),'doc')
