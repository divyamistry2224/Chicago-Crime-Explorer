import unittest,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from pipeline.prepare import normalize,prepare,warehouse
BASE={'id':'1','date':'01/02/2024 03:04:05 PM','primary_type':'  motor   vehicle theft ','community_area':'32','latitude':'41.88','longitude':'-87.63','arrest':'FALSE','domestic':'true'}
class PipelineTests(unittest.TestCase):
 def test_standardizes_date_category_flags(self):
  r,w,e=normalize(BASE);self.assertIsNone(e);self.assertEqual(r['date'],'2024-01-02T15:04:05');self.assertEqual(r['primary_type'],'MOTOR VEHICLE THEFT');self.assertFalse(r['arrest']);self.assertTrue(r['domestic'])
 def test_bad_date_and_duplicate_reconcile(self):
  rows,q,r=prepare([BASE,BASE,{**BASE,'id':'2','date':'invalid'}]);self.assertEqual(len(rows),1);self.assertEqual(len(q),2);self.assertTrue(r['reconciled']);self.assertEqual(r['checks']['duplicate_id'],1)
 def test_bad_location_retains_incident(self):
  r,w,e=normalize({**BASE,'latitude':'0','longitude':'0','community_area':'999'});self.assertIsNone(e);self.assertIsNone(r['latitude']);self.assertEqual(r['community_area'],0);self.assertIn('invalid_coordinates',w)
 def test_unknown_flag_not_imputed_false(self):
  r,w,e=normalize({**BASE,'arrest':'unknown'});self.assertIsNone(r['arrest']);self.assertIn('unknown_arrest',w)
 def test_sql_gold_reconciles(self):
  rows,q,r=prepare([BASE,{**BASE,'id':'2'}])
  with tempfile.TemporaryDirectory() as d:self.assertEqual(warehouse(rows,Path(d)/'test.db'),2)
if __name__=='__main__':unittest.main()
