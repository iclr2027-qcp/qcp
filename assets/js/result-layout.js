/* Shared Result presentation overrides for the public page and Result Studio. */
(() => {
'use strict';
const root=document.getElementById('results');if(!root)return;
const NS='http://www.w3.org/2000/svg',editing=root.hasAttribute('data-result-editor');
const entries=new Map(),originals=new WeakMap(),figures=new WeakMap(),clone=v=>structuredClone(v);
let clipSerial=0;
let book={version:1,overrides:{}},applying=false;
const rect=el=>{const r=el.getBoundingClientRect(),o=root.getBoundingClientRect();return{x:r.x-o.x,y:r.y-o.y,w:r.width,h:r.height};};
// The editor has a 840px content area inside its 1008px canvas. Browser
// gutters must never enlarge stored positions or typography on wider screens.
const factor=()=>Math.min(1,root.querySelector('.paper-inner').getBoundingClientRect().width/840);
function original(el){
 if(!originals.has(el))originals.set(el,{style:el.getAttribute('style'),text:el.textContent});
 return originals.get(el);
}
function add(el,id,label,type='shape',group=false){
 if(!el)return;
 const svg=el.namespaceURI===NS;
 let wrapper=null;
 if(svg){
  wrapper=el.closest('[data-result-wrapper]');
  if(!wrapper){wrapper=document.createElementNS(NS,'g');wrapper.dataset.resultWrapper=id;el.before(wrapper);wrapper.append(el);}
 }
 id=el.dataset.resultId||id;
 const entry={id,el,wrapper,label,type,group,svg};original(el);el.dataset.resultKey=id;entries.set(id,entry);
}
function releaseFigureBounds(svg,items){
 // Cropped source SVGs still contain neighboring plots. Keep those hidden,
 // and carry each object's original clipping WITH it instead of clipping
 // the entire editable graph at a stationary viewport.
 const visibleObjects=new Set(items.map(e=>e.el));
 const sourceShapes=[...svg.querySelectorAll('path,line,rect,circle,ellipse,polyline,polygon,text')].filter(el=>!el.closest('defs,clipPath,mask'));
 const owners=new Set(),plans=[];
 for(const entry of items){
  const inverse=entry.wrapper.getCTM().inverse(),clips=[];
  for(let parent=entry.wrapper.parentElement;parent&&parent!==svg;parent=parent.parentElement){
   const value=parent.getAttribute('clip-path'),id=value?.match(/url\(#([^)]+)\)/)?.[1];
   const source=id&&svg.querySelector('#'+CSS.escape(id));
   if(source){clips.push({source,matrix:inverse.multiply(parent.getCTM())});owners.add(parent);}
  }
  plans.push({entry,clips,viewport:inverse.multiply(svg.getCTM())});
 }
 let defs=svg.querySelector('defs');
 if(!defs){defs=document.createElementNS(NS,'defs');svg.prepend(defs);}
 const matrix=m=>`matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`;
 const makeClip=(source,m)=>{
  const clip=source.cloneNode(true);clip.id='result-object-clip-'+(++clipSerial);
  clip.setAttribute('transform',matrix(m)+(source.getAttribute('transform')?' '+source.getAttribute('transform'):''));
  defs.append(clip);return clip.id;
 };
 for(const {entry,clips,viewport} of plans){
  let inner=entry.wrapper;
  const enclose=id=>{const g=document.createElementNS(NS,'g');g.setAttribute('clip-path',`url(#${id})`);inner.append(g);inner=g;};
  for(const {source,matrix:m} of clips)enclose(makeClip(source,m));
  if(entry.type!=='text'){
   const clip=document.createElementNS(NS,'clipPath'),rect=document.createElementNS(NS,'rect'),v=svg.viewBox.baseVal;
   for(const [name,value]of Object.entries({x:v.x,y:v.y,width:v.width,height:v.height}))rect.setAttribute(name,value);
   clip.append(rect);enclose(makeClip(clip,viewport));
  }
  inner.append(entry.el);
 }
 owners.forEach(el=>el.removeAttribute('clip-path'));
 sourceShapes.forEach(el=>{if(!visibleObjects.has(el))el.setAttribute('data-result-source-hidden','');});
 svg.classList.add('result-overflow-ready');
}
function textPart(el,id,label){
 if(!el)return;
 const nodes=[...el.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim()||n.nodeType===Node.ELEMENT_NODE&&n.classList.contains('result-edit-copy'));
 nodes.forEach((n,i)=>{let span=n;if(n.nodeType===Node.TEXT_NODE){span=document.createElement('span');span.className='result-edit-copy';n.replaceWith(span);span.append(n);}add(span,id+(i?'-'+i:''),label,'text');});
}
function restore(entry){
 const {el,wrapper}=entry,b=original(el);
 b.style===null?el.removeAttribute('style'):el.setAttribute('style',b.style);
 if(entry.type==='text')el.textContent=b.text;
 if(wrapper)wrapper.removeAttribute('transform');
}
function paint(entry,props={}){
 const {el,wrapper,svg,type}=entry,s=factor(),style=el.style;
 if(type==='text'){
  if('text'in props)el.textContent=props.text;
  if('fontSize'in props){const ctm=svg?el.getScreenCTM():null,scale=ctm?Math.hypot(ctm.a,ctm.b):1;style.fontSize=props.fontSize*s/scale+'px';}
  if('fontWeight'in props)style.fontWeight=props.fontWeight;
  if('color'in props)style.setProperty(svg?'fill':'color',props.color);
  if(!svg&&'text'in props)style.whiteSpace='pre-wrap';
 }
 if('fill'in props)style.setProperty(svg?'fill':'background-color',props.fill);
 if('stroke'in props&&svg)style.stroke=props.stroke;
 if('opacity'in props)style.opacity=props.opacity;
 const dx=(props.dx||0)*s,dy=(props.dy||0)*s,sx=props.scaleX||1,sy=props.scaleY||1;
 if(wrapper){
  const m=wrapper.getScreenCTM(),inverse=m.inverse(),a=new DOMPoint(0,0).matrixTransform(inverse),b=new DOMPoint(dx,dy).matrixTransform(inverse),box=wrapper.getBBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  wrapper.setAttribute('transform',`translate(${b.x-a.x} ${b.y-a.y}) translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`);
 }else{
  if(dx||dy)style.translate=`${dx}px ${dy}px`;
  if(sx!==1||sy!==1){style.transformOrigin='center';style.scale=`${sx} ${sy}`;}
 }
}
function apply(){
 if(applying)return;applying=true;
 entries.forEach(restore);
 // Apply parents before children so nested text adjustments stay independent.
 const ordered=[...entries.values()].sort((a,b)=>a.el.contains(b.el)?-1:b.el.contains(a.el)?1:0);
 for(const e of ordered)if(book.overrides[e.id])paint(e,book.overrides[e.id]);
 applying=false;root.dispatchEvent(new CustomEvent('result-layout-updated'));
}
function visible(entry){
 const el=entry.el;if(!el.isConnected||el.closest('[hidden]'))return false;
 const b=el.getBoundingClientRect();if(b.width<.1&&b.height<.1)return false;
 return getComputedStyle(el).display!=='none';
}
function rebuild(){
 entries.forEach(restore);entries.clear();
 add(root.querySelector('#results-title'),'shared:title','Result 제목','text');
 root.querySelectorAll('[role=tab]').forEach(el=>{add(el,'shared:'+el.id,el.textContent+' 탭','box',true);textPart(el,'shared:'+el.id+':text',el.textContent+' 탭 글자');});
 root.querySelectorAll('.paper-result-panel').forEach(panel=>{
  const key=panel.id.replace('paper-','');
  add(panel.querySelector('.paper-result-head h3'),key+':title','결과 소제목','text');
  add(panel.querySelector('.result-section-dot'),key+':section-dot','섹션 색상 동그라미','shape');
  add(panel.querySelector('.result-summary'),key+':summary','결과 설명','text');
  panel.querySelectorAll('.result-kicker,.result-note,.result-chart h4').forEach((el,i)=>add(el,key+':copy-'+i,el.textContent,'text'));
  panel.querySelectorAll('select').forEach((el,i)=>add(el,key+':select-'+i,'항목 선택 메뉴','box'));
  panel.querySelectorAll('.paper-button').forEach((el,i)=>{const id=el.dataset.resultId||key+':button-'+i;add(el,id,el.textContent+' 버튼','box',true);textPart(el,id+':text',el.textContent+' 글자');});
  panel.querySelectorAll('figure').forEach((el,i)=>add(el,key+':card-'+i,'카드 '+(i+1),'box',true));
  panel.querySelectorAll('.result-axis-label,figcaption:not(.qcp-sr-only)').forEach((el,i)=>add(el,key+':caption-'+i,el.textContent,'text'));
  panel.querySelectorAll('video').forEach(el=>add(el,key+':video-'+el.dataset.role,(el.dataset.role==='base'?'Base':'QCP')+' 영상','video'));
  panel.querySelectorAll('.result-legend,.quality-legend,.pair-legend,.radar-legend').forEach((legend,i)=>{
   add(legend,key+':legend-'+i,'범례 묶음','box',true);
   legend.querySelectorAll(':scope>span').forEach((el,j)=>{add(el,key+':legend-'+i+':item-'+j,el.textContent+' 범례','box',true);textPart(el,key+':legend-'+i+':label-'+j,el.textContent+' 범례 글자');add(el.querySelector('.quality-marker'),key+':legend-'+i+':marker-'+j,'품질 마커 '+(j+1),'shape');});
  });
  add(panel.querySelector('.iteration-key'),key+':iterations','Iteration 순서 안내','box',true);
  panel.querySelectorAll('.iteration-key').forEach(el=>textPart(el,key+':iterations:text','Iteration 안내 글자'));
  panel.querySelectorAll('[data-figure]').forEach((mount,index)=>{
   add(mount,key+':graph'+(index?'-'+index:''),'그래프 전체','graph',true);
   const asset=mount.dataset.figure.split('/').pop().replace('.svg',''),svg=mount.querySelector('svg');if(!svg)return;
   const cached=figures.get(svg);
   if(cached){cached.forEach(e=>add(e.el,e.id,e.label,e.type,e.group));return;}
   if(mount.closest('[hidden]'))return;
   svg.querySelectorAll('text').forEach((el,i)=>add(el,'svg:'+asset+':text-'+i,el.textContent,'text'));
   // Axes, trajectories, marks, and uncertainty bands remain independent.
   let i=0;svg.querySelectorAll('path,line,rect,circle,ellipse,polyline,polygon').forEach(el=>{
    if(el.closest('defs,clipPath,mask'))return;
    const b=el.getBoundingClientRect(),r=svg.getBoundingClientRect();
    if(b.width<.1&&b.height<.1)return;
    const n=i++;
    if(b.right<r.left||b.left>r.right||b.bottom<r.top||b.top>r.bottom)return;
    if(b.width>r.width*.98&&b.height>r.height*.98)return;
    const label=el.classList.contains('paper-marker')?`Iteration ${el.dataset.iteration} · 점 ${+el.dataset.series+1}`:el.classList.contains('paper-connector')?`Iteration ${el.dataset.iteration} · 연결선 ${+el.dataset.series+1}`:el.classList.contains('paper-band')?'분포 / 오차 범위':el.classList.contains('paper-measurement')?'측정점':'축 / 선';
    add(el,'svg:'+asset+':shape-'+n,label+' '+(n+1),'shape');
   });
   const items=[...entries.values()].filter(e=>e.svg&&svg.contains(e.el));
   releaseFigureBounds(svg,items);figures.set(svg,items);
  });
 });
 apply();root.dispatchEvent(new CustomEvent('result-layout-ready'));
}
function metadata(){
 return [...entries.values()].filter(visible).map(e=>{
  const c=getComputedStyle(e.el),ctm=e.svg?e.el.getScreenCTM():null;
  const parent=[...entries.values()].filter(p=>p!==e&&p.el.contains(e.el)).sort((a,b)=>a.el.contains(b.el)?1:-1)[0];
  return {...e,parent:parent?.id,bounds:rect(e.el),text:e.type==='text'?e.el.textContent:undefined,fontSize:parseFloat(c.fontSize)*(ctm?Math.hypot(ctm.a,ctm.b):1),fontWeight:parseFloat(c.fontWeight)||400,color:e.svg?c.fill:c.color,fill:e.svg?c.fill:c.backgroundColor,stroke:e.svg?c.stroke:null,opacity:parseFloat(c.opacity)};
 });
}
const api={root,entries:metadata,getDocument:()=>clone(book),setDocument(value){book=clone(value);apply();},refresh:rebuild,factor,
 async choose(panel,index){
  if(editing)root.querySelectorAll('.paper-result-panel').forEach(el=>el.hidden=el.id!=='paper-'+panel);
  const picker=root.querySelector('#paper-task');
  if(panel==='main'&&index!==undefined){picker.value=String(index);picker.dispatchEvent(new Event('change',{bubbles:true}));}
  root.dispatchEvent(new CustomEvent('paper-section-change'));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));rebuild();
 },choices(panel){return panel==='main'?[...root.querySelector('#paper-task').options].map(o=>({value:o.value,label:o.textContent})):[{value:'0',label:'모든 그래프'}];}

};
window.QCP_RESULT_LAYOUT=api;
api.ready=fetch('assets/editor/result-layout.json',{cache:'no-store'}).then(r=>r.ok?r.json():{version:1,overrides:{}}).then(data=>{book=data;rebuild();return api;});
root.addEventListener('paper-figure-ready',rebuild);
root.addEventListener('paper-tab-change',rebuild);
let resize;
window.addEventListener('resize',()=>{clearTimeout(resize);resize=setTimeout(apply,100);});
})();
