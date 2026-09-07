const { JSDOM } = require('jsdom');
const fs=require('fs'), path=require('path');
const ROOT=require('path').join(__dirname,'..');
const out=[]; const chk=(n,c,x='')=>out.push(`${c?'PASS':'**FAIL**'}  ${n}${x?'  — '+x:''}`);
const dom=new JSDOM('<!doctype html><body><nav id="anav"></nav><main id="amain"></main>',{
  url:'http://localhost:8899/admin.html', runScripts:'dangerously', pretendToBeVisual:true,
  beforeParse(w){ w.matchMedia=()=>({matches:false}); w.scrollTo=()=>{}; w.structuredClone=o=>JSON.parse(JSON.stringify(o));
    w.fetch=async()=>({ok:false,status:404,json:async()=>({})}); }});
const w=dom.window;
['assets/js/config.js','assets/js/data.js','assets/js/media-library.js'].forEach(f=>w.eval(fs.readFileSync(path.join(ROOT,f),'utf8')));

// a draft as it existed before the ids were regenerated
const oldDraft=[
  { id:'bw-montauk-17-1998', title:'The nicest Boston Whaler Montauk 17 anywhere!', media:['a.jpg','b.jpg'] },
  { id:'nucamp-tab-320s-2018', title:'2018 NuCamp T@B 320 Camper!', media:['c.jpg'] },
  { id:'portland-pudgy', title:'Portland Pudgy!', media:['d.jpg'] },
  { id:'bw-13-sport-1961-sold', title:'1961 Boston Whaler 13 Sport', media:['e.jpg'] },
];
w.localStorage.setItem('ycm.inventory.v1', JSON.stringify(oldDraft));
w.eval(fs.readFileSync(path.join(ROOT,'assets/js/admin.js'),'utf8'));

setTimeout(()=>{
  const rows=JSON.parse(w.localStorage.getItem('ycm.inventory.v1'))||[];
  const byId=id=>rows.find(r=>r.id===id);
  const doc=w.document;
  const shown=[...doc.querySelectorAll('#amain')].length;
  // read live state off the module by re-reading storage after a save is triggered
  const cfg=w.YCM_CONFIG;
  const links={},titles={};
  oldDraft.forEach(r=>{links[r.id]=r.media;titles[r.id]=r.title;});
  const res=cfg.reconcile(links,titles,w.YCM.boats);
  chk('renamed id is remapped', res.links['featured-montauk-17']?.length===2, JSON.stringify(res.links['featured-montauk-17']));
  chk('second rename remapped', res.links['nucamp-tab-2018']?.[0]==='c.jpg');
  chk('unchanged id is left alone', res.links['portland-pudgy']?.[0]==='d.jpg');
  chk('an ad that no longer exists is reported, not dropped',
      res.orphans.length===1 && res.orphans[0].files[0]==='e.jpg', JSON.stringify(res.orphans));
  chk('it is NOT force-matched onto a lookalike (the 1/24 scale model)',
      !Object.keys(res.links).includes('danbury-13-sport'));
  // an id that changed but kept its exact headline is still recovered
  const renamed = w.YCM.boats[5];
  const r3 = cfg.reconcile({ 'some-old-id':['z.jpg'] }, { 'some-old-id': renamed.title }, w.YCM.boats);
  chk('an identical headline still reconnects', r3.links[renamed.id]?.[0]==='z.jpg', JSON.stringify(r3.links));
  chk('nothing is silently lost',
      Object.values(res.links).flat().length + res.orphans.flatMap(o=>o.files).length === 5);
  chk('a healthy draft is untouched', (()=>{
      const good={}; w.YCM.boats.slice(0,2).forEach(b=>good[b.id]=['x.jpg']);
      const r2=cfg.reconcile(good,{},w.YCM.boats);
      return r2.moved.length===0 && r2.orphans.length===0 && Object.keys(r2.links).length===2;
  })());
  console.log(out.join('\n'));
  const f=out.filter(l=>l.startsWith('**')).length;
  console.log(`\n${f} failures of ${out.length}`);
  process.exit(f?1:0);
},300);
