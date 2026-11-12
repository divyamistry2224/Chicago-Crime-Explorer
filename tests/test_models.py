import unittest,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import pandas as pd,numpy as np
from pipeline.models import features,metrics
class ModelTests(unittest.TestCase):
 def test_target_day_does_not_leak(self):
  s=pd.Series(np.arange(100),index=pd.date_range('2024-01-01',periods=100));f=features(s);changed=s.copy();changed.iloc[50:]=999999;g=features(changed);np.testing.assert_array_equal(f.iloc[50].to_numpy(),g.iloc[50].to_numpy());self.assertEqual(f.iloc[50]['lag_1'],49)
 def test_metrics(self):
  m=metrics(np.array([10,20]),np.array([12,18]));self.assertEqual(m['mae'],2);self.assertAlmostEqual(m['wape'],4/30)
if __name__=='__main__':unittest.main()

class ArtifactTests(unittest.TestCase):
 def test_time_splits_and_snapshot_reconciliation(self):
  import json
  root=Path(__file__).resolve().parents[1]
  model=json.loads((root/'dist/models.json').read_text())
  self.assertEqual(len(model['folds']),4)
  for fold in model['folds']:
   self.assertLess(fold['train_end'],fold['start'])
   self.assertGreater(fold['test_days'],0)
  self.assertEqual(len(model['predictions']),365*3)
  cube=json.loads((root/'dist/cube.json').read_text());daily=json.loads((root/'dist/daily.json').read_text())
  self.assertEqual(sum(int(r['n']) for r in cube),sum(int(r['n']) for r in daily))
