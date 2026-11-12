"""One-day-ahead forecasting with expanding quarterly training windows.
Every feature uses only data known before the target incident date.
No random splits, no target-day arrest flag, no individual predictions.
"""
import json,hashlib,os
from pathlib import Path
os.environ.setdefault('OMP_NUM_THREADS','2')
import numpy as np
import pandas as pd
import sklearn
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import Ridge
from sklearn.ensemble import HistGradientBoostingRegressor
ROOT=Path(__file__).resolve().parents[1]

def features(series):
    f=pd.DataFrame(index=series.index)
    for lag in (1,7,14,28):f[f'lag_{lag}']=series.shift(lag)
    for window in (7,28):f[f'rolling_{window}']=series.shift(1).rolling(window).mean()
    f['weekday_sin']=np.sin(2*np.pi*f.index.dayofweek/7);f['weekday_cos']=np.cos(2*np.pi*f.index.dayofweek/7)
    f['year_sin']=np.sin(2*np.pi*f.index.dayofyear/365.25);f['year_cos']=np.cos(2*np.pi*f.index.dayofyear/365.25)
    f['elapsed_days']=(f.index-series.index[0]).days
    return f

def metrics(y,p):
    return {'mae':float(np.mean(abs(y-p))),'rmse':float(np.sqrt(np.mean((y-p)**2))),'wape':float(np.sum(abs(y-p))/np.sum(y)) if np.sum(y) else None}

def evaluate(series):
    f=features(series);folds=[];predictions=[]
    for start,end in [('2025-01-01','2025-04-01'),('2025-04-01','2025-07-01'),('2025-07-01','2025-10-01'),('2025-10-01','2026-01-01')]:
        train=(f.index<start)&f.notna().all(axis=1);test=(f.index>=start)&(f.index<end)&f.notna().all(axis=1)
        X,y=f.loc[train],series.loc[train];Xt,yt=f.loc[test],series.loc[test]
        models={'Weekly naive':None,'Ridge regression':make_pipeline(StandardScaler(),Ridge(alpha=10)),'Gradient boosting':HistGradientBoostingRegressor(max_iter=100,max_leaf_nodes=7,l2_regularization=10,learning_rate=.05,random_state=42)}
        fold={'start':start,'end_exclusive':end,'train_end':str(X.index[-1].date()),'train_days':len(X),'test_days':len(Xt),'scores':{}}
        for name,model in models.items():
            if model is None:p=Xt['lag_7'].to_numpy()
            else:model.fit(X,y);p=np.maximum(0,model.predict(Xt))
            fold['scores'][name]=metrics(yt.to_numpy(),p)
            for date,actual,pred in zip(Xt.index,yt,p):predictions.append({'date':str(date.date()),'actual':int(actual),'prediction':round(float(pred),3),'model':name,'fold_start':start})
        folds.append(fold)
    overall={}
    for name in models:
        rr=[r for r in predictions if r['model']==name];overall[name]=metrics(np.array([r['actual'] for r in rr]),np.array([r['prediction'] for r in rr]))
    anomaly=[]
    # Reference distribution excludes the current day; flags are descriptive, not a trained classifier.
    mean=series.shift(1).rolling(28).mean();sd=series.shift(1).rolling(28).std()
    for date in series.index:
        if pd.notna(sd.loc[date]) and sd.loc[date]>0:
            z=float((series.loc[date]-mean.loc[date])/sd.loc[date]);anomaly.append({'date':str(date.date()),'count':int(series.loc[date]),'expected':round(float(mean.loc[date]),2),'z':round(z,3)})
    return {'features':list(f.columns),'folds':folds,'overall':overall,'predictions':predictions,'anomalies':anomaly,'scope':'Citywide daily counts, all offenses; dashboard filters do not apply to these precomputed experiments.','target':'One day ahead: reported incident count. Observed prior-day counts are assumed available without reporting delay.','limitations':['Retrospective incident-date data may be revised; no historical as-of snapshots are available. Real-time performance may be worse.','Quarterly refits; actual observed lag counts update each test day. These are not recursive year-ahead forecasts.','Fixed hyperparameters specified before evaluation; no test-set tuning or model selection refit claimed.','No external validation, causal inference, individual risk prediction, or deployment of a real-time model.'],'seed':42,'dependencies':{'numpy':np.__version__,'pandas':pd.__version__,'scikit-learn':sklearn.__version__},'model_parameters':{'ridge_alpha':10,'gradient_boosting':{'max_iter':100,'max_leaf_nodes':7,'l2_regularization':10,'learning_rate':.05}},'data_sha256':hashlib.sha256((ROOT/'dist/daily.json').read_bytes()).hexdigest()}

def main():
    rows=json.loads((ROOT/'dist/daily.json').read_text());df=pd.DataFrame(rows);df['day']=pd.to_datetime(df['day']);df['n']=df['n'].astype(int);series=df.groupby('day')['n'].sum().reindex(pd.date_range('2024-01-01','2025-12-31'),fill_value=0)
    result=evaluate(series);(ROOT/'dist/models.json').write_text(json.dumps(result,separators=(',',':')));print(json.dumps(result['overall'],indent=2));print('folds',len(result['folds']),'evaluation days',len(result['predictions'])//3)
if __name__=='__main__':main()
