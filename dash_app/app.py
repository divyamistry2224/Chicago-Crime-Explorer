"""Runnable Plotly Dash companion. Public hosted frontend is JavaScript.
Run from repository root: python dash_app/app.py
"""
from pathlib import Path
import json,sys
import pandas as pd
import plotly.express as px
from dash import Dash,dcc,html,Input,Output,State,ctx
ROOT=Path(__file__).resolve().parents[1]
df=pd.DataFrame(json.loads((ROOT/'dist/cube.json').read_text()))
for col in ('year','month','n'):df[col]=df[col].astype(int)
df['community_area']=pd.to_numeric(df['community_area'],errors='coerce').fillna(0).astype(int)
geo=json.loads((ROOT/'dist/geo.json').read_text())
for f in geo['features']:f['id']=str(int(f['properties']['area_numbe']))
area_names={int(f['id']):f['properties']['community'].title() for f in geo['features']};area_names[0]='Unknown / unassigned'
PALETTE=['#0e7b67','#9abc9a','#193e38'];PANEL={'background':'white','padding':'20px','borderRadius':'9px','border':'1px solid #dfe6d8'}
app=Dash(__name__,title='Chicago Crime Explorer | Plotly Dash');server=app.server
app.layout=html.Div([
 html.H1('Chicago Crime Explorer'),html.P('Data preparation, linked reporting and transparent analysis · 2024–2025 official snapshot'),
 html.Div([html.Label(['Year',dcc.Dropdown([{'label':str(y),'value':y} for y in [2024,2025]],2025,id='year',clearable=False)]),html.Label(['Offense',dcc.Dropdown([{'label':'All offenses','value':'all'}]+[{'label':t.title(),'value':t} for t in sorted(df.primary_type.unique())],'all',id='offense',clearable=False)]),html.Label(['Community',dcc.Dropdown([{'label':'All communities','value':-1}]+[{'label':name,'value':area} for area,name in sorted(area_names.items())],-1,id='area',clearable=False)]),html.Label(['Arrest',dcc.Dropdown([{'label':'All','value':'all'},{'label':'Recorded','value':'true'},{'label':'Not recorded','value':'false'}],'all',id='arrest',clearable=False)]),html.Label(['Domestic',dcc.Dropdown([{'label':'All','value':'all'},{'label':'Yes','value':'true'},{'label':'No','value':'false'}],'all',id='domestic',clearable=False)])],style={'display':'grid','gridTemplateColumns':'repeat(auto-fit,minmax(160px,1fr))','gap':'15px',**PANEL}),
 html.Div([html.Label('Month window'),dcc.RangeSlider(1,12,1,value=[1,12],marks={i:pd.Timestamp(2025,i,1).strftime('%b') for i in range(1,13)},id='month-window')],style={'marginTop':'18px',**PANEL}),
 html.Div(id='metrics',style={'padding':'25px 0','fontSize':'20px'}),
 html.Div([html.Div([dcc.Graph(id='map'),html.P('Map uses all communities for context; other filters apply. Click a community to filter the other views.')],style=PANEL),html.Div([dcc.Graph(id='trend'),html.P('Monthly incident counts; descriptive, not a causal comparison.')],style=PANEL)],style={'display':'grid','gridTemplateColumns':'repeat(auto-fit,minmax(320px,1fr))','gap':'18px'}),
 html.Div([dcc.Graph(id='offenses'),html.Button('Export filtered CSV',id='export'),dcc.Download(id='download')],style={'marginTop':'18px',**PANEL}),
 html.P('Counts are not population-adjusted crime rates. Reports may be revised or unverified. An arrest is not a conviction or clearance. Public citywide aggregate and raw-record sample audit are independent.'),
 html.A('City of Chicago source',href='https://data.cityofchicago.org/Public-Safety/Crimes-2001-to-Present/ijzp-q8t2',target='_blank'),
],style={'fontFamily':'Arial,sans-serif','background':'#f5f7f1','color':'#193e38','padding':'30px','maxWidth':'1500px','margin':'auto'})

def filtered(year,offense,area,arrest,domestic,window,ignore_area=False):
 r=df[(df.year==int(year))&df.month.between(*window)]
 if offense!='all':r=r[r.primary_type==offense]
 if area!=-1 and not ignore_area:r=r[r.community_area==area]
 if arrest!='all':r=r[r.arrest==(arrest=='true')]
 if domestic!='all':r=r[r.domestic==(domestic=='true')]
 return r

@app.callback(Output('area','value'),Input('map','clickData'),prevent_initial_call=True)
def click_area(click):
 if click and click.get('points'):return int(click['points'][0]['location'])
 return -1

@app.callback(Output('metrics','children'),Output('map','figure'),Output('trend','figure'),Output('offenses','figure'),Input('year','value'),Input('offense','value'),Input('area','value'),Input('arrest','value'),Input('domestic','value'),Input('month-window','value'))
def figures(year,offense,area,arrest,domestic,window):
 r=filtered(year,offense,area,arrest,domestic,window);total=int(r.n.sum());ar=int(r.loc[r.arrest,'n'].sum());dom=int(r.loc[r.domestic,'n'].sum());metrics=f'{total:,} incident reports · Arrest recorded: {ar/total:.1%} · Domestic flag: {dom/total:.1%}' if total else 'No matching reports'
 city=filtered(year,offense,area,arrest,domestic,window,True).groupby('community_area',as_index=False).n.sum();city['community']=city.community_area.map(area_names);city['location']=city.community_area.astype(str)
 mapfig=px.choropleth(city,geojson=geo,locations='location',color='n',hover_name='community',color_continuous_scale='Greens',labels={'n':'Incidents'});mapfig.update_geos(fitbounds='locations',visible=False);mapfig.update_layout(title='Community counts',margin={'l':0,'r':0,'t':40,'b':0})
 timeline=r.groupby('month',as_index=False).n.sum().set_index('month').reindex(range(window[0],window[1]+1),fill_value=0).reset_index();timeline['date']=pd.to_datetime({'year':[year]*len(timeline),'month':timeline.month,'day':[1]*len(timeline)})
 trend=px.line(timeline,x='date',y='n',markers=True,color_discrete_sequence=PALETTE,labels={'n':'Incident reports','date':'Month'},title='Selected monthly reports')
 composition=r.groupby('primary_type',as_index=False).n.sum().nlargest(10,'n').sort_values('n');bars=px.bar(composition,x='n',y='primary_type',orientation='h',color_discrete_sequence=PALETTE,labels={'n':'Reports','primary_type':'Offense'},title='Leading offense categories')
 return metrics,mapfig,trend,bars

@app.callback(Output('download','data'),Input('export','n_clicks'),State('year','value'),State('offense','value'),State('area','value'),State('arrest','value'),State('domestic','value'),State('month-window','value'),prevent_initial_call=True)
def export(n,year,offense,area,arrest,domestic,window):return dcc.send_data_frame(filtered(year,offense,area,arrest,domestic,window).to_csv,'chicago-filtered.csv',index=False)
if __name__=='__main__':app.run(debug=False,host='127.0.0.1',port=8050)
