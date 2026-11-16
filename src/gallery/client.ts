/**
 * The gallery's own script (inlined with the page's nonce). It keeps the user's decisions in localStorage, shows one
 * proposal at a time from the round's board (←/→ or a tile), and hands the decisions back three ways: Copy decisions
 * (text to paste into chat, ending in a fenced markilo-feedback block — the same text `feedbackText` builds), Download
 * decisions (a file for `feedback --import`), or Send to your agent when served. It sets text only through
 * textContent and attributes, never markup, and calls the network only to POST to its own server when served.
 */
export const GALLERY_SCRIPT = `(()=>{const T=(s,...v)=>window.markiloUi?window.markiloUi.t(s,...v):s.replace(/\\{(\\d)\\}/g,(m,i)=>v[i]);
const K='markilo-review:'+location.pathname;let st={};try{st=JSON.parse(localStorage.getItem(K)||'{}')}catch(e){}
const q=new URLSearchParams(location.search),TOKEN=q.get('t'),SERVED=location.protocol.startsWith('http')&&!!TOKEN;
const keep=()=>{try{localStorage.setItem(K,JSON.stringify(st))}catch(e){}};const save=()=>{keep();render()};
const boxes=[...document.querySelectorAll('.decide:not(.sketch)')];const get=k=>st[k]=st[k]||{};
const skcards=[...document.querySelectorAll('.sketchcard')];const rejs=[...document.querySelectorAll('.rejectall')];const rk=r=>'_reject:'+r.dataset.brand+'/'+r.dataset.round;
const where=(x,y)=>(y<34?'top':y>66?'bottom':'middle')+'-'+(x<34?'left':x>66?'right':'center');
const PICK={keep:'select',refine:'change',drop:'drop'};
const picked=p=>p==='keep'?T('Selected'):p==='refine'?T('Changes requested'):p==='drop'?T('Dropped'):'';
const sendLabel=()=>T(SERVED?'Send to your agent':'Download decisions');
const groups=[...document.querySelectorAll('.proposals')].map(list=>({list,board:list.parentElement.querySelector(':scope>.board')})).filter(g=>g.board);let cur=groups[0];
function show(g,id){const a=document.getElementById(id);if(!a||a.parentElement!==g.list)return;cur=g;g.list.classList.add('one');
[...g.list.children].forEach(x=>x.classList.toggle('on',x===a));g.board.querySelectorAll('.tile').forEach(t=>{const on=t.dataset.target===id;t.classList.toggle('on',on);t.setAttribute('aria-current',on?'true':'false')})}
groups.forEach(g=>{const first=g.list.querySelector(':scope>.proposal');const h=decodeURIComponent(location.hash.slice(1));const fromHash=h&&g.list.querySelector(':scope>#'+CSS.escape(h));if(first)show(g,(fromHash||first).id);
g.board.querySelectorAll('.tile').forEach(t=>t.onclick=e=>{e.preventDefault();show(g,t.dataset.target);try{history.replaceState(null,'','#'+t.dataset.target)}catch(e){}})});
if(groups[0])cur=groups.find(g=>g.list.querySelector('#'+CSS.escape(decodeURIComponent(location.hash.slice(1))||'-')))||groups[0];
document.addEventListener('keydown',e=>{if(!cur||e.metaKey||e.ctrlKey||e.altKey||(e.target.closest&&e.target.closest('input,textarea,dialog')))return;if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;
const ids=[...cur.list.children].map(x=>x.id),at=ids.indexOf((cur.list.querySelector(':scope>.on')||{}).id);const next=ids[(at+(e.key==='ArrowRight'?1:ids.length-1))%ids.length];if(next){e.preventDefault();show(cur,next)}});
function render(){boxes.forEach(b=>{const k=b.dataset.key,v=st[k]||{};b.classList.toggle('refine',v.pick==='refine');
b.querySelectorAll('[data-pick]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.pick===v.pick)));
b.querySelectorAll('[data-chip]').forEach(x=>x.classList.toggle('on',(v.chips||[]).includes(x.dataset.chip)));
const n=b.querySelector('.note');if(document.activeElement!==n)n.value=v.note||'';
const c=b.querySelector('[data-cmp]');if(c)c.checked=!!v.compare;
const ol=b.querySelector('.pins');const focused=ol.contains(document.activeElement);if(!focused){ol.textContent='';(v.pins||[]).forEach(p=>{const li=document.createElement('li');const inp=document.createElement('input');inp.placeholder=T('What should change here ({0})?',T(where(p.x,p.y)));inp.value=p.note||'';inp.oninput=e=>{p.note=e.target.value;keep()};li.append(inp);ol.append(li)})}
const g=document.querySelector('.pinnable[data-key="'+CSS.escape(k)+'"]');if(g){g.querySelectorAll('.pin').forEach(p=>p.remove());(v.pins||[]).forEach((p,i)=>{const d=document.createElement('span');d.className='pin';d.style.left=p.x+'%';d.style.top=p.y+'%';d.textContent=i+1;d.title=T('Remove pin');d.onclick=e=>{e.stopPropagation();v.pins.splice(i,1);save()};g.append(d)})}});
document.querySelectorAll('.tile').forEach(t=>{const a=document.getElementById(t.dataset.target),d=a&&a.querySelector('.decide'),v=(d&&st[d.dataset.key])||{};const s=t.querySelector('.tile-pick');if(s)s.textContent=picked(v.pick)});
rejs.forEach(r=>{const v=st[rk(r)]||{};r.querySelector('[data-reject-all]').classList.toggle('on',!!v.on);const n=r.querySelector('.note');if(document.activeElement!==n)n.value=v.note||''});
skcards.forEach(c=>{const v=st[c.dataset.key]||{};c.querySelectorAll('[data-sketch]').forEach(x=>x.classList.toggle('on',x.dataset.sketch===v.sketch));const n=c.querySelector('.note');if(document.activeElement!==n)n.value=v.note||''});
const title=k=>{const b=document.querySelector('.decide[data-key="'+CSS.escape(k)+'"]');return b&&b.dataset.title||k.split('/')[1]};
const e=Object.entries(st).filter(([k,v])=>k!=='_prefer'&&!k.startsWith('_reject:')&&v&&(v.pick||v.sketch));const ra=Object.entries(st).filter(([k,v])=>k.startsWith('_reject:')&&v&&v.on).map(([k])=>T('reject all of round {0}',k.split('/')[1]));
document.getElementById('sum').textContent=e.length||ra.length?[...ra,...e.map(([k,v])=>(v.sketch?T('sketch {0}',v.sketch):T(PICK[v.pick]))+': '+title(k))].join(' · '):T('No decisions yet.');
const nc=Object.entries(st).filter(([k,v])=>k!=='_prefer'&&v&&v.compare).length;const cb=document.getElementById('cmpbtn');cb.textContent=T('Compare ({0})',nc);cb.disabled=nc<2;
const send=document.getElementById('send');send.textContent=sendLabel();send.classList.toggle('primary',SERVED);document.getElementById('copy').classList.toggle('primary',!SERVED)}
boxes.forEach(b=>{const k=b.dataset.key;
b.querySelectorAll('[data-pick]').forEach(x=>x.onclick=()=>{const v=get(k);v.pick=v.pick===x.dataset.pick?undefined:x.dataset.pick;save()});
b.querySelectorAll('[data-chip]').forEach(x=>x.onclick=()=>{const v=get(k);v.chips=v.chips||[];const c=x.dataset.chip;v.chips=v.chips.includes(c)?v.chips.filter(y=>y!==c):[...v.chips,c];save()});
b.querySelector('.note').oninput=e=>{get(k).note=e.target.value;keep()};
const c=b.querySelector('[data-cmp]');if(c)c.onchange=()=>{get(k).compare=c.checked;save()}});
rejs.forEach(r=>{const k=rk(r);r.querySelector('[data-reject-all]').onclick=()=>{const v=get(k);v.on=!v.on;save()};r.querySelector('.note').oninput=e=>{get(k).note=e.target.value;keep()}});
skcards.forEach(c=>{const k=c.dataset.key;c.querySelectorAll('[data-sketch]').forEach(x=>x.onclick=()=>{const v=get(k);v.sketch=v.sketch===x.dataset.sketch?undefined:x.dataset.sketch;save()});
c.querySelector('.note').oninput=e=>{get(k).note=e.target.value;keep()}});
document.querySelectorAll('.pinnable').forEach(g=>g.onclick=ev=>{const r=g.getBoundingClientRect();const v=get(g.dataset.key);v.pins=v.pins||[];if(v.pins.length>=6)return;
v.pins.push({x:Math.round((ev.clientX-r.left)/r.width*100),y:Math.round((ev.clientY-r.top)/r.height*100),note:''});if(!v.pick)v.pick='refine';save();
const ol=document.querySelector('.decide[data-key="'+CSS.escape(g.dataset.key)+'"] .pins');const last=ol&&ol.lastElementChild;if(last)last.querySelector('input').focus()});
function feedback(){const d=[];for(const[k,v]of Object.entries(st)){if(k==='_prefer'||k.startsWith('_reject:')||!v||!(v.pick||v.sketch||(v.pins||[]).length||v.note))continue;const[brand,concept]=k.split('/');
d.push({brand,concept,decision:v.pick||null,...(v.sketch?{sketch:v.sketch}:{}),tags:v.chips||[],note:v.note||'',pins:(v.pins||[]).map((p,i)=>({n:i+1,x:p.x,y:p.y,where:where(p.x,p.y),note:p.note||''}))})}
const rejectAll=Object.entries(st).filter(([k,v])=>k.startsWith('_reject:')&&v&&v.on).map(([k,v])=>{const[brand,round]=k.slice(8).split('/');return{brand,round:Number(round),note:v.note||''}});
const p=st._prefer;return{schema:'markilo/feedback@1',gallery:location.pathname,savedAt:new Date().toISOString(),decisions:d,preferred:p?{brand:p.brand,concept:p.concept,why:p.why||'',over:p.over||[]}:null,rejectAll}}
function requests(f){const out=[],tail=d=>d.note?' ('+d.note+')':'';for(const r of f.rejectAll)out.push('reject all of round '+r.round+' for '+r.brand+(r.note?': '+r.note:''));
const comb=f.decisions.filter(d=>d.tags.includes('combine with another'));if(comb.length>1)out.push('combine '+comb.map(d=>d.brand+'/'+d.concept+tail(d)).join(' + '));
for(const d of f.decisions){if(d.sketch)out.push(d.sketch==='none'?'no sketch for '+d.brand+'/'+d.concept+': try a different move'+tail(d):'develop sketch '+d.sketch+' of '+d.brand+'/'+d.concept+tail(d));
if(d.decision==='refine'){const w=[...d.tags,...(d.note?[d.note]:[]),...d.pins.map(p=>'at '+p.where+(p.note?': '+p.note:''))];out.push('refine '+d.brand+'/'+d.concept+(w.length?': '+w.join('; '):''))}
else if(d.decision)out.push((d.decision==='keep'?'select':d.decision)+' '+d.brand+'/'+d.concept+tail(d))}
if(f.preferred)out.push('preferred '+f.preferred.brand+'/'+f.preferred.concept+(f.preferred.over.length?' over '+f.preferred.over.join(', '):'')+(f.preferred.why?' — '+f.preferred.why:''));return out}
const text=()=>{const f=feedback();return requests(f).map(r=>'- '+r).join('\\n')+'\\n\\n\`\`\`markilo-feedback\\n'+JSON.stringify(f)+'\\n\`\`\`'};
const flash=(id,t,orig)=>{const b=document.getElementById(id);b.textContent=t;setTimeout(()=>b.textContent=orig(),1800)};
const copyd=document.getElementById('copyd');document.getElementById('copyclose').onclick=()=>copyd.close();
document.getElementById('copy').onclick=async()=>{const t=text();try{await navigator.clipboard.writeText(t);flash('copy',T('Copied ✓ — paste it into the chat'),()=>T('Copy decisions'))}catch(e){const a=document.getElementById('copytext');a.value=t;copyd.showModal();a.focus();a.select()}};
const send=document.getElementById('send');
send.onclick=async()=>{const f=feedback();if(SERVED){try{const r=await fetch('/feedback',{method:'POST',headers:{'content-type':'application/json','x-markilo-token':TOKEN},body:JSON.stringify(f)});flash('send',r.ok?T('Sent ✓ — tell your agent'):T('Not saved ({0})',r.status),sendLabel)}catch(e){flash('send',T('Not saved'),sendLabel)}}
else{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(f,null,2)],{type:'application/json'}));a.download='markilo-feedback.json';a.click();flash('send',T('Saved — run markilo feedback --import'),sendLabel)}};
document.getElementById('clear').onclick=()=>{st={};save()};
const dlg=document.getElementById('cmpd');document.getElementById('cmpclose').onclick=()=>dlg.close();
document.getElementById('cmpbtn').onclick=()=>{const keys=Object.entries(st).filter(([k,v])=>k!=='_prefer'&&v&&v.compare).map(([k])=>k);if(keys.length<2)return;
const grid=document.getElementById('cmpgrid');grid.textContent='';for(const k of keys){const box=document.querySelector('.decide[data-key="'+CSS.escape(k)+'"]');const card=box&&box.closest('.proposal');if(!card)continue;const col=document.createElement('div');col.className='cmpcol';
col.append(card.querySelector('h3').cloneNode(true));for(const sel of['.showcase','.idea','.flags']){const n=card.querySelector(sel);if(n){const c=n.cloneNode(true);c.querySelectorAll('.pin').forEach(p=>p.remove());c.querySelectorAll('.pinnable').forEach(p=>p.classList.remove('pinnable'));col.append(c)}}
const b=document.createElement('button');b.type='button';b.className='btn prefer'+(st._prefer&&st._prefer.key===k?' on':'');b.textContent=T('Prefer this');b.onclick=()=>{const why=document.getElementById('cmpreason').value.trim();st._prefer={key:k,brand:k.split('/')[0],concept:k.split('/')[1],why,over:keys.filter(x=>x!==k).map(x=>x.split('/')[1])};save();dlg.close()};col.append(b);grid.append(col)}
document.getElementById('cmpwhy').textContent=st._prefer?T('Current preference: {0}',st._prefer.concept+(st._prefer.why?' — '+st._prefer.why:'')):'';dlg.showModal()};
document.addEventListener('markilo:ui',render);
render()})();`;
