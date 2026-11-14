const {JSDOM}=require('jsdom'),fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');const root=path.resolve(__dirname,'..')+'/';let html=fs.readFileSync(root+'dist/index.html','utf8');let dom=new JSDOM(html,{runScripts:'outside-only',url:'https://demo.test/'}),w=dom.window,plots=[];w.Plotly={react:(id,traces,layout)=>plots.push({id,traces,layout})};w.fetch=async file=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(root+'dist/'+file))});w.scrollTo=()=>{};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};const ctx=dom.getInternalVMContext();for(let f of ['app.js','advanced.js','experience.js','city.js'])vm.runInContext(fs.readFileSync(root+'dist/'+f,'utf8'),ctx);const wait=ms=>new Promise(r=>setTimeout(r,ms)),q=s=>w.document.querySelector(s),run=s=>vm.runInContext(s,ctx);(async()=>{
 for(let i=0;i<100&&!w.experienceReady;i++)await wait(30);
 assert(w.experienceReady);
 const total=q('#total').textContent;
 q('[data-map-lens="change"]').click();
 assert.equal(run('cityMapLens'),'change');
 assert.equal(q('#map-scale-labels').textContent,'DecreaseIncrease');
 assert(q('#map-lens-note').textContent.includes('same selected months'));
 const path=q('#map path[data-id="32"]');
 const expected=run(`(()=>{const s={...state(),year:'all'};const rows=DATA.filter(r=>matches(r,s,true)&&r.c===32);const a=sum(rows.filter(r=>r.y===2024)),b=sum(rows.filter(r=>r.y===2025));return ((b-a)/a*100).toFixed(1)})()`);
 assert(path.dataset.tip.includes(expected+'%'));
 assert.equal(q('#total').textContent,total,'changing map shading must not change the analytical scope');
 q('#discover-area').click();assert.equal(q('#area').value,'1');assert.equal(q('#map-name').textContent,'Rogers Park');
 q('#citywide-view').click();assert.equal(q('#area').value,'all');
 q('[data-map-lens="count"]').click();assert.equal(run('cityMapLens'),'count');
 assert.equal(q('#map path').getAttribute('aria-label').includes('reports'),true);
 q('[data-city-jump="temporal"]').click();await wait(60);assert.equal(w.document.body.dataset.view,'temporal');
 run('stopTime()');w.close();console.log('PASS: city map lenses, exact year-over-year calculation, scope stability, community discovery/reset, and dispatch navigation');
})().catch(e=>{console.error(e);try{run('stopTime()')}catch(_){}w.close();process.exitCode=1});
