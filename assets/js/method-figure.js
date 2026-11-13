/* QCP main figure: native SVG elements from the original Figure Studio composition.
 * Geometry and the procedural shape renderer are adapted from the user's local
 * qcp_figure_studio/dist/app.js. Text remains text, never glyph outlines.
 */
(() => {
 'use strict';
 const host = document.getElementById('paper-method-diagram');
 if (!host) return;
 const NS = 'http://www.w3.org/2000/svg', PT = 3.52778;
 const palette = {'#8C1515':'#315f96','#C58A8A':'#87a5cc','#F1DEDE':'#e5edf8'};
 const measure = document.createElement('canvas').getContext('2d');
 const fontStyle = key => ({family: ['italic','bolditalic','math'].includes(key) ? '"QCP Math"' : 'Inter', weight: ['bold','bolditalic'].includes(key) ? 600 : 400});
 const fonts = Object.fromEntries(['regular','bold','italic','bolditalic','math'].map(key => [key, {
   getAdvanceWidth(text, size) { const font = fontStyle(key); measure.font = `${font.weight} ${size}px ${font.family}`; return measure.measureText(text).width; }
 }]));
 let config, edits={version:1,overrides:{}};
 const editing=host.hasAttribute("data-method-editor");
 function node(tag, attrs = {}, parent) {
   const n = document.createElementNS(NS, tag);
   for (const [key, value] of Object.entries(attrs)) if (value !== undefined) n.setAttribute(key, String((key === 'fill' || key === 'stroke') ? palette[value] || value : value));
   if (parent) parent.append(n);
   return n;
 }
function parseFormula(input,size){
 let text=input.replace(/\\(theta|pi|tau|ldots|cdots|times|rightarrow)/g,(_,x)=>({theta:'θ',pi:'π',tau:'τ',ldots:'…',cdots:'⋯',times:'×',rightarrow:'→'}[x])).replace(/\\mathcal\{D\}/g,'𝒟').replace(/\\mathcal\{R\}/g,'ℛ').replace(/\\mathrm\{([^}]+)\}/g,'$1').replace(/\\,/g,' ');let i=0;
 function atom(fs,style){const command=text.slice(i).match(/^\\(boldsymbol|mathbf)\{/);if(command){i+=command[0].length;return seq(fs,true,command[1]==='boldsymbol'?'bolditalic':'bold');}if(text[i]==='{'){i++;return seq(fs,true,style);}const c=Array.from(text.slice(i))[0]||'';i+=c.length;return word(c,fs,style);}
 function word(t,fs,style){const f=/[𝒟ℛ⋯]/u.test(t)?'math':style||'italic';return{runs:[{text:t,size:fs,dy:0,font:f,x:0}],width:fonts[f].getAdvanceWidth(t,fs)};}
 function seq(fs,brace=false,style){let runs=[],x=0;while(i<text.length){if(text[i]==='}'){if(brace){i++;break;}i++;continue;}let b=atom(fs,style);for(const r of b.runs)runs.push({...r,x:r.x+x});x+=b.width;let scriptW=0;while(text[i]==='_'||text[i]==='^'){const up=text[i++]==='^',s=atom(fs*.66,style);for(const r of s.runs)runs.push({...r,x:r.x+x,dy:r.dy+(up?-fs*.42:fs*.24)});scriptW=Math.max(scriptW,s.width);}x+=scriptW;}return{runs,width:x};}
 return seq(size);
}
function lineRuns(text,size,bold){let runs=[],x=0;const parts=text.split('$');parts.forEach((p,i)=>{if(i%2){const m=parseFormula(p,size);m.runs.forEach(r=>runs.push({...r,x:r.x+x}));x+=m.width;}else{const f=bold?'bold':'regular';runs.push({text:p,x,dy:0,size,font:f});x+=fonts[f].getAdvanceWidth(p,size);}});return{runs,width:x};}
function textSize(e) {
 if(e.fontPx!==undefined)return e.fontPx;
 let size=e.fontSize*PT;
 const widest=Math.max(...e.text.split('\n').map(line=>lineRuns(line,size,e.bold).width));
 if(widest>e.w-4)size*=(e.w-4)/widest;
 return size*(e.fontSize>=7.7?.90:.93)*(e.textScale||1);
}
function drawText(e,g) {
 const lines=e.text.split('\n'),size=textSize(e);
 const lh = size * 1.15;
 let baseline = (e.h - lh * lines.length) / 2 + size * .88;
 for (const line of lines) {
   const v = lineRuns(line,size,e.bold);
   const x = e.align === 'left' ? 0 : e.align === 'right' ? e.w - v.width : (e.w - v.width) / 2;
   const text = node('text', {'aria-label':v.runs.map(r => r.text).join(''), 'data-text-line':true}, g);
   for (const r of v.runs) {
     if (!r.text) continue;
     const font = fontStyle(r.font);
     const span = node('tspan', {x:x+r.x,y:baseline+r.dy,'font-size':r.size,'font-family':font.family,'font-weight':font.weight,fill:e.color||'#252e39'}, text);
     span.textContent = r.text;
   }
   baseline += lh;
 }
}
// End the shaft inside the arrowhead, so its round cap cannot protrude through the tip.
function arrowLayout(total,strokeWidth,dashed=false,headStyle="standard"){
 const width=Math.max(.1,strokeWidth),sharp=headStyle==="sharp",length=Math.min(Math.max(sharp?12:10,width*(sharp?4.3:2.8)),total*.55);
 const half=sharp?Math.min(Math.max(4.5,width*1.25),length*.30):Math.min(Math.max(5.5,width*1.6),length*.52);
 const inset=Math.max(length*.72,width*.6*(1+length/half)),shaftEnd=Math.max(0,total-inset);
 const drawShaft=half>width/2&&inset<length+width*.4&&shaftEnd>width/2;
 let pattern=drawShaft?[shaftEnd,total+width+1]:[];
 if(dashed&&drawShaft){
  const gap=Math.max(7,width*1.4),preferredDash=Math.max(10,width*2.3);
  const count=Math.max(1,Math.round((shaftEnd+gap)/(preferredDash+gap)));
  const dash=(shaftEnd-gap*(count-1))/count;
  pattern=Array.from({length:count},(_,i)=>[dash,i===count-1?total+width+1:gap]).flat();
 }
 return{length,half,shaftEnd,drawShaft,pattern};
}
const arrowGeometryCache=new Map();
const scaledArrowCache=new Map();
function scaleArrowPath(d,sx,sy){
 if(sx===1&&sy===1)return d;
 const key=JSON.stringify([d,sx,sy]);if(scaledArrowCache.has(key))return scaledArrowCache.get(key);
 let result;
 if(/[aA]/.test(d)){
  // Imported arc paths are sampled in their final coordinates; built-in curves stay Béziers.
  const path=node('path',{d}),length=path.getTotalLength(),n=Math.max(1,Math.min(8192,Math.ceil(length*Math.max(sx,sy)/.25)));
  result=Array.from({length:n+1},(_,i)=>{const p=path.getPointAtLength(length*i/n);return`${i?'L':'M'}${p.x*sx} ${p.y*sy}`;}).join(' ');
 }else result=d.replace(/([MLHVCSQTZ])([^MLHVCSQTZ]*)/gi,(_,command,args)=>{let i=0;return command+args.replace(/[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g,n=>String(Number(n)*(command.toUpperCase()==='H'?sx:command.toUpperCase()==='V'?sy:i++%2?sy:sx)));});
 if(scaledArrowCache.size>1000)scaledArrowCache.clear();scaledArrowCache.set(key,result);return result;
}
const solidArrowCache=new Map();
function solidArrowOutline(d,strokeWidth){
 const key=JSON.stringify([d,strokeWidth]);if(solidArrowCache.has(key))return solidArrowCache.get(key);
 const measure=node('path',{d}),total=measure.getTotalLength();if(!Number.isFinite(total)||total<.001)return null;
 const layout=arrowLayout(total,strokeWidth,false,'sharp'),neck=Math.max(0,total-layout.length),r=strokeWidth/2;
 const left=[],right=[],steps=Math.max(1,Math.ceil(neck/.35));
 const point=p=>`${p.x.toFixed(4)} ${p.y.toFixed(4)}`;
 for(let i=0;i<=steps;i++){
  const s=neck*i/steps,p=measure.getPointAtLength(s),a=measure.getPointAtLength(Math.max(0,s-.05)),b=measure.getPointAtLength(Math.min(total,s+.05));
  const length=Math.hypot(b.x-a.x,b.y-a.y)||1,nx=-(b.y-a.y)/length,ny=(b.x-a.x)/length;
  left.push({x:p.x+nx*r,y:p.y+ny*r});right.push({x:p.x-nx*r,y:p.y-ny*r});
 }
 const base=measure.getPointAtLength(neck),tip=measure.getPointAtLength(total),length=Math.hypot(tip.x-base.x,tip.y-base.y)||1;
 const nx=-(tip.y-base.y)/length,ny=(tip.x-base.x)/length;
 const a={x:base.x+nx*layout.half,y:base.y+ny*layout.half},b={x:base.x-nx*layout.half,y:base.y-ny*layout.half};
 // A single closed vector outline: no overlapping stroked shaft or separate head.
 const outline=`M${point(left[0])} ${left.slice(1).map(p=>'L'+point(p)).join(' ')} L${point(a)} L${point(tip)} L${point(b)} ${right.reverse().map(p=>'L'+point(p)).join(' ')} A${r} ${r} 0 0 0 ${point(left[0])} Z`;
 if(solidArrowCache.size>1000)solidArrowCache.clear();solidArrowCache.set(key,outline);return outline;
}
function drawArrow(g,d,color,strokeWidth,dashed=false,headStyle="standard"){
 if(headStyle==='sharp'&&!dashed){const outline=solidArrowOutline(d,strokeWidth);if(outline)node('path',{d:outline,fill:color,stroke:'none','data-arrow-part':'solid','data-arrow-head':'sharp'},g);return;}

 let geometry=arrowGeometryCache.get(d);
 if(!geometry){
  const measure=node('path',{d}),total=measure.getTotalLength();
  if(!Number.isFinite(total)||total<.001)return;
  const tip=measure.getPointAtLength(total),near=measure.getPointAtLength(Math.max(0,total-Math.min(.05,total/100)));
  geometry={total,x:tip.x,y:tip.y,angle:Math.atan2(tip.y-near.y,tip.x-near.x)*180/Math.PI};
  if(arrowGeometryCache.size>1000)arrowGeometryCache.clear();
  arrowGeometryCache.set(d,geometry);
 }
 const layout=arrowLayout(geometry.total,strokeWidth,dashed,headStyle);
 if(layout.drawShaft)node('path',{d,fill:'none',stroke:color,'stroke-width':strokeWidth,'stroke-linejoin':'round','stroke-linecap':'round','stroke-dasharray':layout.pattern.join(' '),'data-arrow-part':'shaft'},g);
 node('path',{d:`M0 0 L${-layout.length} ${-layout.half} L${-layout.length} ${layout.half} Z`,fill:color,stroke:'none',transform:`translate(${geometry.x} ${geometry.y}) rotate(${geometry.angle})`,'data-arrow-part':'head'},g);
}
function drawFlowMarkers(g,d,color,width,count){
 const path=node('path',{d}),total=path.getTotalLength(),size=Math.max(6,width*1.65);
 for(let i=0;i<count;i++){
  const distance=total*(.2+.52*i/Math.max(1,count-1)),p=path.getPointAtLength(distance),q=path.getPointAtLength(Math.min(total,distance+.1));
  const angle=Math.atan2(q.y-p.y,q.x-p.x)*180/Math.PI;
  node('path',{d:`M${-size} ${-size*.65} L0 0 L${-size} ${size*.65}`,fill:'none',stroke:color,'stroke-width':width*.8,'stroke-linejoin':'round','stroke-linecap':'round',transform:`translate(${p.x} ${p.y}) rotate(${angle})`,'data-flow-marker':i+1},g);
 }
}
function drawing(e,g){
 const W=e.w,H=e.h;
 if(e.type==='text'){drawText(e,g);return;}
 if(e.type==='rect')node('rect',{width:W,height:H,rx:e.radius,fill:e.fill,stroke:e.stroke,'stroke-width':e.strokeWidth},g);
 if(e.type==='circle')node('ellipse',{cx:W/2,cy:H/2,rx:W/2,ry:H/2,fill:e.fill},g);
 if(e.type==='image')node('image',{href:config.assets?.[e.src]||e.src,width:W,height:H,preserveAspectRatio:'xMidYMid meet',opacity:e.opacity??1},g);
 if(e.type==='tokens'){const w=(W-e.gap*(e.count-1))/e.count;for(let i=0;i<e.count;i++)node('rect',{x:i*(w+e.gap),width:w,height:H,rx:e.radius,fill:e.fill},g);}
 if(e.type==='path'){const sx=W/(e.baseW||W),sy=H/(e.baseH||H);if(e.arrow){const d=scaleArrowPath(e.d,sx,sy);drawArrow(g,d,e.stroke,e.strokeWidth,e.dash,e.arrowHead);if(e.flowMarkers)drawFlowMarkers(g,d,e.stroke,e.strokeWidth,e.flowMarkers);}else if(e.dashArray){node('path',{d:scaleArrowPath(e.d,sx,sy),fill:e.fill,stroke:e.stroke,'stroke-width':e.strokeWidth,'stroke-linecap':'round','stroke-dasharray':e.dashArray.join(' ')},g);}else{const a=node('g',{transform:`scale(${sx} ${sy})`},g);node('path',{d:e.d,fill:e.fill,stroke:e.stroke,'stroke-width':e.strokeWidth,'stroke-linejoin':'round','stroke-linecap':'round','stroke-dasharray':e.dash?'10 7':undefined},a);}}
 if(e.type==='knob'){
  const sub=node('g',{transform:`scale(${W/100} ${H/100})`},g);
  node('path',{d:'M 22 78 A 40 40 0 1 1 78 78',fill:'none',stroke:'#B1B5BC','stroke-width':4},sub);
  node('path',{d:e.high?'M 22 78 A 40 40 0 1 1 87 65':'M 22 78 A 40 40 0 0 1 11 42',fill:'none',stroke:'#8C1515','stroke-width':5,'stroke-linecap':'round'},sub);
  node('circle',{cx:50,cy:50,r:29,fill:'#F1DEDE',stroke:'#5D6269','stroke-width':1.8},sub);
  node('path',{d:e.high?'M 50 50 L 69 39':'M 50 50 L 29 44',stroke:'#5D6269','stroke-width':4,'stroke-linecap':'round'},sub);
  node('circle',{cx:50,cy:50,r:2.8,fill:'#5D6269'},sub);
 }
 if(e.type==='cube'){const a=node('g',{transform:`scale(${W/44} ${H/44})`},g);node('path',{d:'M0 10 L28 15 L28 44 L0 39 Z',fill:e.fill,stroke:'#737A84','stroke-width':.8},a);node('path',{d:'M28 15 L44 5 L44 34 L28 44 Z',fill:e.fill,stroke:'#737A84','stroke-width':.8},a);node('path',{d:'M0 10 L16 0 L44 5 L28 15 Z',fill:e.fill,stroke:'#737A84','stroke-width':.8},a);node('path',{d:'M0 10 L16 0 L44 5 L28 15 Z',fill:'#ffffff',opacity:.4},a);}
 if(e.type==='belt'){const a=node('g',{transform:`scale(${W/322} ${H/55})`},g);
  for(const x of[40,255]){node('rect',{x,y:31,width:8,height:24,fill:'#C5C6C5',stroke:'#5D6269','stroke-width':1},a);node('path',{d:`M${x-7} 55 H${x+15}`,stroke:'#5D6269','stroke-width':2},a);}
  node('rect',{x:0,y:21,width:301,height:21,rx:9,fill:'#AEB1B5',stroke:'#5D6269','stroke-width':1.4},a);
  for(const x of[11,290]){node('circle',{cx:x,cy:31.5,r:6.8,fill:'#E2E4E5',stroke:'#5D6269','stroke-width':1.2},a);}
  node('path',{d:'M0 21 L26 0 H322 L296 21 Z',fill:'#E5E5E4',stroke:'#5D6269','stroke-width':1.4},a);
  for(let x=28;x<=259;x+=33)node('path',{d:`M${x} 20 L${x+25} 1`,stroke:'#B1B5BC','stroke-width':1},a);
  drawArrow(a,'M140 31 H220','#5D6269',4);
 }
 if(e.type==='database'){const a=node('g',{transform:`scale(${W/101} ${H/116})`},g);node('path',{d:'M0 16 L0 100 A50.5 16 0 0 0 101 100 L101 16 Z',fill:e.fill,opacity:.3,stroke:e.fill,'stroke-width':2},a);for(const y of[45,76])node('path',{d:`M0 ${y} A50.5 16 0 0 0 101 ${y}`,fill:'none',stroke:e.fill,'stroke-width':1.6},a);node('ellipse',{cx:50.5,cy:16,rx:50.5,ry:16,fill:e.fill,opacity:.65,stroke:e.fill,'stroke-width':2},a);}
 if(e.type==='success'){node('circle',{cx:W/2,cy:H/2,r:Math.min(W,H)/2,fill:'#5D6269'},g);node('path',{d:`M${W*.25} ${H*.52} L${W*.44} ${H*.73} L${W*.78} ${H*.29}`,fill:'none',stroke:'white','stroke-width':W*.09,'stroke-linejoin':'round'},g);}
 if(e.type==='star'){const pts=Array.from({length:10},(_,i)=>{const a=(i*36-90)*Math.PI/180,r=(i%2?.24:.5);return[W/2+Math.cos(a)*W*r,H/2+Math.sin(a)*H*r].join(',');});node('polygon',{points:pts.join(' '),fill:e.fill},g);}
}

 // Website-specific spacing, kept separate from the original Studio document.
 // Align both quality rows and shorten the policy's unused vertical space.
 const policyLayout = {
   e4:{y:74,h:268},e5:{y:0,h:34,fontSize:8},
   'v2-condition-note':{y:38,h:26,fontSize:5.8},
   e6:{y:87,h:58},e7:{y:99,h:34},e8:{y:105,w:22,h:22},e9:{y:98,w:22,h:34},
   e10:{y:154,h:58},e11:{y:166,h:34,bold:true},e12:{y:172,w:22,h:22},e13:{y:173,h:22},
   e14:{y:221,h:58},e15:{y:233,h:34},e16:{y:239,w:22,h:22},e17:{y:231,h:38},e18:{y:300,h:30},
   'v2-condition-heading':{y:0,h:34,fontSize:8},'v2-axis-label':{y:38,h:26,fontSize:5.8},
   'v2-quality-axis':{y:183},
   'v2-axis-token-low':{y:134,h:49,baseH:49,d:'M0 49 V0 H27'},
   'v2-axis-token-high':{y:183,h:99,baseH:99,d:'M0 0 V99 H27'},
   'v2-token-card-low':{y:74,h:120},'v2-q-low':{y:84,h:38,fontSize:9},
   'v2-token-low':{x:321,y:139,w:122,h:28},'v2-token-policy-low':{y:134},
   'v2-token-card-high':{y:222,h:120},'v2-q-high':{y:232,h:38,fontSize:9},
   'v2-token-high':{x:321,y:287,w:122,h:28},'v2-token-policy-high':{y:282},
   'v2-observation-box':{y:14,h:39},'v2-observation':{y:16,h:34},
   'v2-observation-policy':{y:55,h:17},
   'v2-policy':{y:74,h:268},'v2-knob-label':{y:110,h:30,text:'Quality knob'},
   'v2-policy-knob':{y:154},'v2-policy-name':{y:251,h:66},
   'v2-actions-heading':{y:0,h:34,fontSize:8},
   'v2-action-card-low':{y:74,h:120},'v2-action-card-high':{y:222,h:120},
   'v2-policy-action-low':{y:134},'v2-policy-action-high':{y:282},
   'v2-behavior-low':{y:84,h:32,fontSize:6.8},'v2-behavior-high':{y:232,h:32,fontSize:6.8},
   'v2-motion-low':{y:126,h:26},'v2-motion-high':{y:274,h:26},
   'v2-step-low':{y:163,h:26,text:'Abrupt changes',fontSize:5.8},
   'v2-step-high':{y:311,h:26,text:'Gradual changes',fontSize:5.8}
 };
 const processHeadings = new Set(['e78','e86','v2-measure-heading','e105','e116','e117']);
 function websiteElement(source,panel) {
   const e={...source};
   if(panel.key==='policy')return Object.assign(e,policyLayout[e.id]);
   // Compress the two process rows together, keeping every connector attached.
   const scale=.82;
   e.y=20+(source.y-158)*scale;e.h=source.h*scale;
   if(['knob','image','database'].includes(e.type)) {
     e.w=source.w*scale;e.x+=(source.w-e.w)/2;
   }else if(e.type==='circle') {
     e.h=source.h;e.y-=(source.h-source.h*scale)/2;
   }
   if(processHeadings.has(e.id))e.bold=true;
   if(e.type==='text')e.textScale=.9;
   return e;
 }
 const panels = [
   {key:'policy', title:'Condition on quality', box:[0,-2,970,360], include:e => e.x < 975 && e.y < 600},
   {key:'relabel', title:'Expand the controllable range', box:[990,10,970,360], include:e => e.x > 975 && e.y < 600}
 ];
 const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
 const motionStates = [];
 function animatePanel(step, svg, panel, elements) {
   const groups = new Map([...svg.querySelectorAll('[data-figure-id]')].map(g => [g.dataset.figureId,g]));
   const records = new Map(elements.map(e => [e.id,e]));
   const state = {step, animations:[], visible:false, started:false, done:false};
   motionStates.push(state);
   // Each diagram has a local clock; the shared scheduler always finishes
   // conditioning before it starts expanding the controllable range.
   function animate(el, frames, delay=0, duration=420, options={}) {
     if (!el) return;
     const animation=el.animate(frames,{duration,delay,fill:'both',easing:'ease-out',...options});
     // Speed up every beat and the shared completion clock together.
     animation.playbackRate=2;
     animation.pause();animation.currentTime=0;state.animations.push(animation);
     return animation;
   }
   const reveal=(ids,at)=>ids.forEach(id=>animate(groups.get(id),[{opacity:0},{opacity:1}],at));
   function flow(id,at,duration=580) {
     const g=groups.get(id),e=records.get(id);if(!g||!e)return;
     const d=scaleArrowPath(e.d,e.w/(e.baseW||e.w),e.h/(e.baseH||e.h));
     const measure=node('path',{d}),length=measure.getTotalLength();
     const dot=node('circle',{r:5.5,fill:e.stroke,opacity:0,'aria-hidden':'true','data-flow-packet':id},g);
     const frames=Array.from({length:31},(_,i)=>{const p=measure.getPointAtLength(length*i/30);return{transform:`translate(${p.x}px,${p.y}px)`,opacity:i===0||i===30?0:1,offset:i/30};});
     animate(dot,frames,at,duration,{easing:'linear'});
   }
   function tokens(id,at) {
     [...groups.get(id).querySelectorAll('rect')].forEach((rect,i)=>animate(rect,[{opacity:0,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],at+i*130,380));
   }
   function dial(id,at) {
     const g=groups.get(id);if(!g)return;
     const pointer=[...g.querySelectorAll('path')].find(path=>path.getAttribute('d').startsWith('M 50 50'));
     if(pointer){pointer.style.transformOrigin='50px 50px';animate(pointer,[{transform:'rotate(-100deg)'},{transform:'rotate(0deg)'}],at,900,{easing:'cubic-bezier(.22,.65,.3,1)'});}
   }
   function emphasize(id,at) {
     const shape=groups.get(id)?.querySelector('rect');if(!shape)return;
     const initial=shape.getAttribute('fill'),stroke=shape.getAttribute('stroke');
     animate(shape,[{fill:initial,stroke},{fill:'#dce9f8',stroke:'#315f96',offset:.45},{fill:initial,stroke}],at,1300);
   }
   // Each content element belongs to one semantic beat, rather than receiving
   // a generic DOM-order stagger that would reveal arrows before their nodes.
   if(panel.key==='policy') {
     reveal(['e4','e5','v2-condition-note'],200);
     reveal(['e6','e7','e8','e9'],420);
     reveal(['e10','e11','e12','e13'],600);
     reveal(['e14','e15','e16','e17','e18'],780);
     emphasize('e10',1000);
     reveal(['v2-condition-heading','v2-axis-label','v2-quality-axis'],1150);
     reveal(['v2-axis-token-low','v2-axis-token-high'],1250);
     flow('v2-axis-token-low',1300);flow('v2-axis-token-high',1300);
     reveal(['v2-token-card-low','v2-q-low','v2-token-card-high','v2-q-high'],1600);
     reveal(['v2-token-low','v2-token-high'],1850);
     tokens('v2-token-low',1850);tokens('v2-token-high',1850);
     reveal(['v2-observation-box','v2-observation'],2500);
     reveal(['v2-token-policy-low','v2-token-policy-high','v2-observation-policy'],2650);
     flow('v2-token-policy-low',2700);flow('v2-token-policy-high',2700);flow('v2-observation-policy',2850,380);
     reveal(['v2-policy','v2-policy-name','v2-knob-label','v2-policy-knob'],3150);
     dial('v2-policy-knob',3350);
     reveal(['v2-actions-heading','v2-policy-action-low'],4100);
     flow('v2-policy-action-low',4150,450);
     reveal(['v2-action-card-low','v2-behavior-low','v2-step-low','v2-motion-low'],4500);
     flow('v2-motion-low',4750,1150);
     reveal(['v2-policy-action-high'],5400);
     flow('v2-policy-action-high',5450,450);
     reveal(['v2-action-card-high','v2-behavior-high','v2-step-high','v2-motion-high'],5850);
     flow('v2-motion-high',6050,1150);
     state.duration=7600;
   } else {
     reveal(['e77','e78','e79','e80','e81','e82'],200);dial('e81',400);
     reveal(['e84'],1100);flow('e84',1150,500);
     reveal(['e85','e86','e87'],1500);
     reveal(['e88','e89','e90','e91','e92'],1850);flow('e92',2050,850);
     reveal(['e93'],2800);flow('e93',2850,500);
     reveal(['v2-measure-card','v2-measure-heading','v2-measure-divider','v2-score-speed','v2-track-speed','v2-score-stability','v2-track-stability'],3250);
     reveal(['v2-bar-speed','v2-bar-stability'],3500);
     for(const id of ['v2-bar-speed','v2-bar-stability'])animate(groups.get(id).querySelector('rect'),[{transform:'scaleX(0)'},{transform:'scaleX(1)'}],3500,700);
     reveal(['e103'],4150);flow('e103',4200,450);
     reveal(['e104','e105'],4550);
     reveal(['e107','e110'],4700);reveal(['e108','e112'],4950);reveal(['e109'],5150);
     reveal(['e114'],5500);flow('e114',5550,500);
     reveal(['e115','e116','e117','e118'],5950);
     const points=Array.from({length:12},(_,i)=>'e'+(122+i));
     points.forEach((id,i)=>{reveal([id],6250+i*65);animate(groups.get(id).querySelector('ellipse'),[{transform:'translateY(-9px)'},{transform:'translateY(0)'}],6250+i*65,450);});
     reveal(['e119','e120','e121','e134','e135','e136','e137'],7200);
     reveal(['e138','e139'],7750);flow('e138',7850,600);
     emphasize('e77',8350);
     state.duration=9900;
   }
   // A completion clock lets us coordinate adjacent visible panels without
   // timeouts, including replay, tab visibility changes, and reduced motion.
   state.clock=animate(svg,[{opacity:1},{opacity:1}],0,state.duration,{easing:'linear'});
   state.clock.onfinish=()=>{state.done=true;step.dataset.motionState='complete';resumeVisible();};
   state.play=()=>{
     state.started=true;step.dataset.motionState='playing';
     const elapsed=state.clock.currentTime||0;
     state.animations.forEach(animation=>{
       animation.currentTime=elapsed;
       // Finished beats must stay finished when scrolling back into view.
       if(elapsed<animation.effect.getComputedTiming().endTime)animation.play();
       else animation.pause();
     });
   };
   state.pause=()=>{if(!state.started||state.done)return;state.animations.forEach(animation=>animation.pause());step.dataset.motionState='paused';};
   const button=step.querySelector('.method-replay');
   button.hidden=false;
   button.addEventListener('click',()=>{
     if(reducedMotion.matches)return;
     // Replaying an earlier step also queues the following steps again.
     motionStates.slice(motionStates.indexOf(state)).forEach(next=>{
       next.done=false;next.started=false;
       next.animations.forEach(animation=>{animation.pause();animation.currentTime=0;});
       next.step.dataset.motionState='waiting';
     });
     resumeVisible();
   });
   step.classList.add('motion-ready');
   step.dataset.motionState='waiting';
   if(reducedMotion.matches){state.animations.forEach(animation=>animation.finish());state.done=true;step.dataset.motionState='complete';button.hidden=true;}
 }
 function resumeVisible() {
   const lastVisible=motionStates.reduce((last,state,i)=>state.visible?i:last,-1);
   const next=motionStates.findIndex(state=>!state.done);
   motionStates.forEach((state,i)=>{
     // Scrolling straight to step 2 must not skip step 1 or leave it paused
     // forever. Continue the prerequisite while either method is in view.
     const shouldPlay=!document.hidden&&!reducedMotion.matches&&i===next&&i<=lastVisible;
     if(shouldPlay){if(state.step.dataset.motionState!=='playing')state.play();}
     else state.pause();
   });
 }
 function elementsFor(panel) {
   return config.elements.filter(e=>!e.hidden&&!['e1','e2','e3','e75'].includes(e.id)&&panel.include(e))
     .map(source=>Object.assign(websiteElement(source,panel),edits.overrides[source.id]||{}));
 }
 function paintElement(e,g) {
   g.replaceChildren();
   g.setAttribute('transform',`translate(${e.x} ${e.y}) rotate(${e.rotation||0} ${e.w/2} ${e.h/2})`);
   g.setAttribute('opacity',e.opacity??1);
   drawing(e,g);
 }
 function render() {
   for (const panel of panels) {
     const step=host.querySelector(`[data-method-panel="${panel.key}"]`);
     const svg=node('svg',{viewBox:panel.box.join(' '),class:'method-panel method-panel-'+panel.key,role:'img','aria-labelledby':'method-panel-title-'+panel.key});
     node('title',{id:'method-panel-title-'+panel.key},svg).textContent=panel.title;
     const elements=elementsFor(panel);
     for(const e of elements){
       const g=node('g',{'data-figure-id':e.id,'data-element-type':e.type,'data-element-name':e.name,transform:`translate(${e.x} ${e.y}) rotate(${e.rotation||0} ${e.w/2} ${e.h/2})`},svg);
       paintElement(e,g);
     }
     step.querySelector('.method-figure-mount').replaceChildren(svg);
     if(!editing)animatePanel(step,svg,panel,elements);
   }
   host.methodFigureEditor={
     panels:panels.map(({key,title,box})=>({key,title,box})),
     getDocument:()=>structuredClone(edits),
     elements:key=>elementsFor(panels.find(p=>p.key===key)).map(e=>({...e,fontPx:e.type==='text'?textSize(e):undefined})),
     setDocument(value) {
       edits=structuredClone(value);
       for(const panel of panels)for(const e of elementsFor(panel)) {
         const g=host.querySelector(`[data-figure-id="${e.id}"]`);if(g)paintElement(e,g);
       }
       host.dispatchEvent(new Event('method-figure-update'));
     }
   };
   if(editing){host.dataset.ready='true';host.dispatchEvent(new Event('method-figure-ready'));return;}
   const observer=new IntersectionObserver(entries=>{
     for(const entry of entries){const state=motionStates.find(s=>s.step===entry.target.closest('.method-step'));state.visible=entry.intersectionRatio>=.25;}
     resumeVisible();
   },{threshold:[0,.25]});
   motionStates.forEach(state=>observer.observe(state.step.querySelector('.method-figure-mount')));
   document.addEventListener('visibilitychange',()=>document.hidden?motionStates.forEach(state=>state.pause()):resumeVisible());
   reducedMotion.addEventListener('change',()=>{
     if(reducedMotion.matches)motionStates.forEach(state=>{state.animations.forEach(animation=>animation.finish());state.done=true;state.step.dataset.motionState='complete';state.step.querySelector('.method-replay').hidden=true;});
     else motionStates.forEach(state=>{state.step.querySelector('.method-replay').hidden=false;});
   });
   host.dataset.ready='true';
 }
 Promise.all([
   fetch('assets/editor/method-figure.json').then(response=>{if(!response.ok)throw Error('Method figure could not be loaded.');return response.json();}),
   fetch('assets/editor/method-layout.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Method layout could not be loaded.');return r.json();}),
   document.fonts.load('400 24px Inter'),document.fonts.load('600 24px Inter'),document.fonts.load('24px "QCP Math"')
 ]).then(([value,layout])=>{config=value;edits=layout;render();}).catch(error=>{
   console.error(error);
   host.querySelectorAll('.method-figure-mount').forEach(mount=>{mount.textContent='The method diagram could not be loaded. Please reload the page.';});
 });
})();
