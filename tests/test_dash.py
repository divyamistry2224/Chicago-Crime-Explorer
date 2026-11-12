import importlib.util,unittest
from pathlib import Path
class DashTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  path=Path(__file__).resolve().parents[1]/'dash_app/app.py'
  spec=importlib.util.spec_from_file_location('dash_companion',path);cls.module=importlib.util.module_from_spec(spec);spec.loader.exec_module(cls.module)
 def test_http_layout(self):
  client=self.module.server.test_client();self.assertEqual(client.get('/').status_code,200);self.assertEqual(client.get('/_dash-layout').status_code,200)
 def test_linked_callback_totals(self):
  metric,map_fig,trend,bars=self.module.figures(2025,'all',-1,'all','all',[1,12]);self.assertIn('238,222',metric);self.assertEqual(len(map_fig.data),1);self.assertEqual(len(trend.data[0].x),12)
 def test_filters_and_empty_state(self):
  metric,*_=self.module.figures(2025,'THEFT',32,'true','all',[1,3]);self.assertNotIn('238,222',metric)
  metric,*_=self.module.figures(2025,'NONEXISTENT',32,'all','all',[1,3]);self.assertEqual(metric,'No matching reports')
