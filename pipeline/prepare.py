"""Reproducible raw-record normalization and audited SQLite warehouse.
The 10,000-record sample is separate from the complete city aggregate snapshot.
"""
import argparse,csv,hashlib,json,sqlite3
from pathlib import Path
from datetime import datetime,timezone
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]

def boolean(value):
    if isinstance(value,bool):return value
    if str(value).strip().lower() in ('true','1','yes','y'):return True
    if str(value).strip().lower() in ('false','0','no','n'):return False
    return None

def normalize(row):
    """Return silver record, warnings, or a quarantine reason. No imputation of dates."""
    row={str(k).strip().lower().replace(' ','_'):v for k,v in row.items()}
    warnings=[]
    ident=str(row.get('id','')).strip()
    if not ident:return None,[], 'missing_id'
    raw=str(row.get('date','')).strip()
    date=None
    for pattern in ('%Y-%m-%dT%H:%M:%S.%f','%Y-%m-%dT%H:%M:%S','%Y-%m-%d %H:%M:%S','%m/%d/%Y %I:%M:%S %p'):
        try:date=datetime.strptime(raw,pattern);break
        except ValueError:pass
    if date is None:return None,[], 'invalid_date'
    category=' '.join(str(row.get('primary_type','')).upper().split())
    if not category:category='UNKNOWN';warnings.append('missing_category')
    try:community=int(float(row.get('community_area',0)))
    except (ValueError,TypeError):community=0
    if not 1<=community<=77:community=0;warnings.append('unknown_community')
    lat=lon=None
    try:
        lat,lon=float(row.get('latitude')),float(row.get('longitude'))
        if not (41.6<=lat<=42.1 and -87.95<=lon<=-87.5):lat=lon=None;warnings.append('invalid_coordinates')
    except (TypeError,ValueError):warnings.append('missing_coordinates')
    arrest,domestic=boolean(row.get('arrest')),boolean(row.get('domestic'))
    if arrest is None:warnings.append('unknown_arrest')
    if domestic is None:warnings.append('unknown_domestic')
    return {'id':ident,'date':date.isoformat(),'primary_type':category,'community_area':community,'arrest':arrest,'domestic':domestic,'latitude':lat,'longitude':lon},warnings,None

def prepare(rows):
    cleaned=[];quarantine=[];checks=Counter();seen=set()
    for i,row in enumerate(rows):
        record,warnings,error=normalize(row)
        if error:quarantine.append({'row':i+1,'reason':error});checks[error]+=1;continue
        if record['id'] in seen:quarantine.append({'row':i+1,'reason':'duplicate_id'});checks['duplicate_id']+=1;continue
        seen.add(record['id']);cleaned.append(record);checks.update(warnings)
    report={'input_records':len(rows),'accepted_records':len(cleaned),'quarantined_records':len(quarantine),'checks':dict(checks),'reconciled':len(rows)==len(cleaned)+len(quarantine),'sample_scope':'10,000 published rows returned within the 2024–2025 window; convenience snapshot, not a representative sample. Dashboard totals use independent complete source aggregates.','rules':['Parse incident dates without inventing missing values','Trim and uppercase offense labels','Deduplicate by published incident ID, first occurrence wins','Map missing/out-of-range community to Unknown (0)','Null missing or out-of-Chicago bounding-box coordinates; retain incident','Preserve unknown boolean flags as null','Quarantine invalid dates and missing IDs']}
    return cleaned,quarantine,report

def warehouse(rows,database):
    con=sqlite3.connect(database)
    con.executescript('DROP TABLE IF EXISTS silver_incidents; CREATE TABLE silver_incidents(id TEXT PRIMARY KEY, date TEXT NOT NULL, primary_type TEXT NOT NULL, community_area INTEGER, arrest INTEGER, domestic INTEGER, latitude REAL, longitude REAL);')
    con.executemany('INSERT INTO silver_incidents VALUES(:id,:date,:primary_type,:community_area,:arrest,:domestic,:latitude,:longitude)',rows)
    con.executescript("CREATE INDEX IF NOT EXISTS idx_incident_date ON silver_incidents(date); CREATE INDEX IF NOT EXISTS idx_type_area ON silver_incidents(primary_type,community_area); DROP VIEW IF EXISTS gold_monthly; CREATE VIEW gold_monthly AS SELECT substr(date,1,7) AS month,primary_type,community_area,COUNT(*) AS incidents,SUM(arrest) AS arrests FROM silver_incidents GROUP BY 1,2,3;")
    con.commit();n=con.execute('SELECT SUM(incidents) FROM gold_monthly').fetchone()[0] or 0;con.close();return n

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--input',type=Path,default=ROOT/'data/raw_sample.json');parser.add_argument('--output',type=Path,default=ROOT/'data');args=parser.parse_args()
    rows=json.loads(args.input.read_text()) if args.input.suffix=='.json' else list(csv.DictReader(args.input.open(encoding='utf-8-sig')))
    args.output.mkdir(parents=True,exist_ok=True);cleaned,quarantine,report=prepare(rows)
    if args.input.resolve()!=(ROOT/'data/raw_sample.json').resolve():report['sample_scope']='User-supplied preparation input; this audit does not replace or estimate citywide aggregate totals.'
    report['sha256_input']=hashlib.sha256(args.input.read_bytes()).hexdigest();report['gold_records']=warehouse(cleaned,args.output/'warehouse.sqlite');report['generated_at']=datetime.now(timezone.utc).isoformat()
    cube=json.loads((ROOT/'dist/cube.json').read_text());clock=json.loads((ROOT/'dist/clock.json').read_text());keys=[tuple(str(r.get(k)) for k in ['year','month','primary_type','community_area','arrest','domestic']) for r in cube]
    report['aggregate_audit']={'incidents':sum(int(r['n']) for r in cube),'temporal_incidents':sum(int(r['n']) for r in clock),'totals_reconcile':sum(int(r['n']) for r in cube)==sum(int(r['n']) for r in clock),'unique_keys':len(keys)==len(set(keys)),'schema_valid':all(int(r['n'])>0 and 1<=int(r['month'])<=12 and int(r['year']) in (2024,2025) and isinstance(r['arrest'],bool) and isinstance(r['domestic'],bool) for r in cube)}
    (args.output/'cleaned_sample.json').write_text(json.dumps(cleaned,separators=(',',':')));(args.output/'quarantine.json').write_text(json.dumps(quarantine));(ROOT/'dist/quality.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
if __name__=='__main__':main()
