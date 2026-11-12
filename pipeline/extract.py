"""Repeatable Socrata extraction, bounded pagination, retries and atomic writes."""
import argparse,json,time,urllib.request,urllib.parse,os
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];BASE='https://data.cityofchicago.org/resource/ijzp-q8t2.json'
def request(params):
    url=BASE+'?'+urllib.parse.urlencode(params)
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url,timeout=90) as response:rows=json.load(response)
            if not isinstance(rows,list):raise ValueError('Expected Socrata row list')
            return rows
        except Exception:
            if attempt==2:raise
            time.sleep(2**attempt)
def save(path,rows):
    path.parent.mkdir(parents=True,exist_ok=True);temp=path.with_suffix('.tmp');temp.write_text(json.dumps(rows,separators=(',',':')));os.replace(temp,path)
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--sample-size',type=int,default=10000);args=parser.parse_args()
    if not 1<=args.sample_size<=100000:parser.error('sample-size must be 1–100000')
    where="date >= '2024-01-01T00:00:00' AND date < '2026-01-01T00:00:00'"
    sample=[]
    for offset in range(0,args.sample_size,10000):
        rows=request({'$select':'id,date,primary_type,community_area,arrest,domestic,latitude,longitude','$where':where,'$order':'id','$limit':min(10000,args.sample_size-offset),'$offset':offset});sample.extend(rows)
        if len(rows)<min(10000,args.sample_size-offset):break
    save(ROOT/'data/raw_sample.json',sample)
    for name,select,group in [('cube','date_extract_y(date) as year,date_extract_m(date) as month,primary_type,community_area,arrest,domestic,count(*) as n','year,month,primary_type,community_area,arrest,domestic'),('clock','date_extract_y(date) as year,date_extract_m(date) as month,date_extract_dow(date) as dow,date_extract_hh(date) as hour,primary_type,count(*) as n','year,month,dow,hour,primary_type')]:
        records=[]
        for offset in range(0,1000000,50000):
            rows=request({'$select':select,'$where':where,'$group':group,'$order':group,'$limit':50000,'$offset':offset});records.extend(rows)
            if len(rows)<50000:break
        save(ROOT/'dist'/(name+'.json'),records);print(name,len(records))
    daily=[]
    for year in (2024,2025):
        daily.extend(request({'$select':'date_trunc_ymd(date) as day,count(*) as n','$where':f'year = {year}','$group':'day','$order':'day','$limit':1000}))
    save(ROOT/'dist/daily.json',daily);print('daily',len(daily))
if __name__=='__main__':main()
