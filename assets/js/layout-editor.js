/* Local presentation-style layout editor. Overrides also render on the public static site. */
(async () => {
 'use strict';
 const scriptURL=document.currentScript.src,params=new URLSearchParams(location.search);
 if(params.has('layout-preview'))return;
 const preview=document.getElementById('qcp-editor-preview');

 const presets=[
  {id:'desktop',name:'데스크톱',width:1440,range:'901px 이상'},
  {id:'half',name:'반폭',width:768,range:'701–900px'},
  {id:'tablet',name:'작은 태블릿',width:600,range:'561–700px'},
  {id:'mobile',name:'모바일',width:390,range:'361–560px'},
  {id:'small-mobile',name:'작은 모바일',width:320,range:'360px 이하'}
 ];
 let preset=presets.find(p=>p.id===params.get('width'))||presets[1];
 let sceneDocument=document,sceneWindow=window,host,api,frame;
 const viewportKey=()=>preview?(preset.id==='small-mobile'?'mobile':preset.id):sceneWindow.innerWidth>900?'desktop':sceneWindow.innerWidth>700?'half':sceneWindow.innerWidth>560?'tablet':'mobile';
 const canvasKey=()=>`${viewportKey()}|-1|1|p:canvas`;
 const sizesCanvas=entry=>entry?.id==='p:canvas'||entry?.id==='p:stage';
 const local=false;
 const asset=new URL('../editor/layout.json',scriptURL),cssURL=new URL('../css/layout-editor.css?v=studio-57',scriptURL);
 const storeKey='qcp-layout-draft-v1',names=['Intro','Choose','Control','Go beyond','Extend','Closing'];
 const backgroundInert=new Map(),folded=new Map(),selection=new Set();
 let editorZoom=null,canvasZoom=1,marquee=null,marqueeBox=null,marqueeMode=false;
 const empty=()=>({version:2,overrides:{}}),clone=v=>JSON.parse(JSON.stringify(v));
 const limits={width:[40,2000],height:[40,1600],x:[-1500,1500],y:[-1500,1500],scale:[.2,4],rotation:[-180,180],fontSize:[6,100],fontWeight:[100,900],lineHeight:[.7,3],opacity:[0,1]};
 let book=empty(),saved=JSON.stringify(book),entries=[],selected=null,active=false,scope='',signature='',originals=new Map(),undo=[],redo=[],dialog,placeholder,outline,layerList,form,status,launcher,drag=null,saveTimer,refreshing=false;
 const drafts=()=>{try{return localStorage.getItem(storeKey);}catch{return null;}};
 function validate(value){
  if(!value||![1,2].includes(value.version)||!value.overrides||Array.isArray(value.overrides)||typeof value.overrides!=='object')throw Error('QCP 편집 JSON 형식이 아닙니다.');
  const result=empty(),pairs=Object.entries(value.overrides);if(pairs.length>7500)throw Error('수정 항목이 너무 많습니다.');
  for(const [key,props] of pairs){
   if(!/^(desktop|half|tablet|mobile|small-mobile)\|(-1|[0-4])\|[013]\|[a-zA-Z0-9:._-]+$/.test(key)||!props||Array.isArray(props)||typeof props!=='object')throw Error('잘못된 요소 키입니다.');
   const clean={};for(const [p,v] of Object.entries(props)){
    if(Object.hasOwn(limits,p)){if(typeof v!=='number'||!Number.isFinite(v)||v<limits[p][0]||v>limits[p][1])throw Error('숫자 범위를 확인해 주세요.');}
    else if(p==='color'||p==='backgroundColor'){if(typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))throw Error('색상 형식을 확인해 주세요.');}
    else if(p==='fontFamily'){if(!['Inter','QCP Math','Georgia'].includes(v))throw Error('지원하지 않는 글꼴입니다.');}
    else if(p==='text'){if(typeof v!=='string'||v.length>500)throw Error('문구는 500자 이내로 입력해 주세요.');}
    else throw Error('지원하지 않는 속성입니다.');
    clean[p]=v;
   }
   if(Object.keys(clean).length){
    const commonKey=key.replace(/^(desktop|half|tablet|mobile|small-mobile)\|(-1|[0-4])\|[013]\|/,'$1|$2|1|');
    // Accept older exports, preferring explicit Smoothness edits on conflicts.
    result.overrides[commonKey]=key===commonKey?{...result.overrides[commonKey],...clean}:{...clean,...result.overrides[commonKey]};
   }
  }
  // Old mobile edits were shared by every compact width. Copy them once when
  // importing v1. Legacy small-mobile keys remain importable; rendering and
  // editing now use the mobile key for both phone previews.
  if(value.version===1)for(const [key,props] of Object.entries(result.overrides))if(key.startsWith('mobile|')){
   for(const id of ['half','tablet','small-mobile'])result.overrides[key.replace(/^mobile/,id)]={...props};
  }
  return result;
 }
 function restore(){
  for(const [el,base] of originals){
   for(const [key,[value,priority]] of base.styles)value?el.style.setProperty(key,value,priority):el.style.removeProperty(key);
   if(base.html!==undefined&&el.innerHTML===base.lastHTML&&el.innerHTML!==base.html)el.innerHTML=base.html;
  }originals.clear();
 }
 function writeStyle(el,key,value){
  let base=originals.get(el);if(!base){base={styles:new Map()};originals.set(el,base);}
  if(!base.styles.has(key))base.styles.set(key,[el.style.getPropertyValue(key),el.style.getPropertyPriority(key)]);
  if(el.style.getPropertyValue(key)!==value||el.style.getPropertyPriority(key)!=='important')el.style.setProperty(key,value,'important');
 }
 function apply(entry){
  // New Closing marks inherit the point's existing placement until edited separately.
  const followsPolicy=/^close:sq-(quality-curve|curve-history-\d+|initial-policy)$/.test(entry.id);
  const pointPlacement=followsPolicy?book.overrides[entry.key.slice(0,-entry.id.length)+'close:sq-current-policy']:null;
  const props=book.overrides[entry.key]||(pointPlacement?{x:pointPlacement.x||0,y:pointPlacement.y||0}:null);if(!props)return;const el=entry.el;
  if('width' in props){
   writeStyle(el,'width',props.width+'px');writeStyle(el,'min-width','0');
   if(entry.id==='p:canvas'){writeStyle(el.parentElement,'max-width','none');writeStyle(el,'max-width','100%');writeStyle(el,'margin-inline','auto');}
  }
  if('height' in props&&entry.id!=='p:canvas'){writeStyle(el,'height',props.height+'px');writeStyle(el,'min-height','0');}
  if('backgroundColor' in props){writeStyle(el,'background-color',props.backgroundColor);if(entry.id==='f:background')writeStyle(el,'--qcp-scene-background',props.backgroundColor);}
  if('x' in props||'y' in props)writeStyle(el,'translate',`${props.x||0}px ${props.y||0}px`);
  if('scale' in props||'rotation' in props){writeStyle(el,'transform-origin','center');if(entry.svg)writeStyle(el,'transform-box','fill-box');}
  if('scale' in props&&!sizesCanvas(entry))writeStyle(el,'scale',String(props.scale));if('rotation' in props&&!sizesCanvas(entry))writeStyle(el,'rotate',props.rotation+'deg');
  if('opacity' in props)writeStyle(el,'opacity',String(props.opacity));
  if(entry.text){
   if('fontSize' in props)writeStyle(el,'font-size',props.fontSize+'px');
   if('fontWeight' in props)writeStyle(el,'font-weight',String(props.fontWeight));
   if('fontFamily' in props)writeStyle(el,'font-family',props.fontFamily);
   if('lineHeight' in props)writeStyle(el,'line-height',String(props.lineHeight));
   if('color' in props)writeStyle(el,entry.svg?'fill':'color',props.color);
   if('text' in props&&entry.copy){
    let base=originals.get(el);if(!base){base={styles:new Map()};originals.set(el,base);}
    if(base.html===undefined||el.innerHTML!==base.lastHTML)base.html=el.innerHTML;
    if(entry.svg&&props.text.includes('\n')){
     const font=props.fontSize||parseFloat(el.ownerDocument.defaultView.getComputedStyle(el).fontSize),line=props.lineHeight||1.2,signature=props.text+'|'+font+'|'+line;
     if(el.innerHTML!==base.lastHTML||base.copySignature!==signature){
      el.replaceChildren();props.text.split('\n').forEach((part,i)=>{const span=document.createElementNS('http://www.w3.org/2000/svg','tspan');span.setAttribute('x',el.getAttribute('x')||'0');span.setAttribute('dy',i?String(font*line):'0');span.textContent=part||' ';el.append(span);});base.copySignature=signature;
     }
    }else if(el.textContent!==props.text)el.textContent=props.text;
    base.lastHTML=el.innerHTML;if(!entry.svg)writeStyle(el,'white-space','pre-line');
   }
  }
 }
 // Apply the outer height last so phase-specific content cannot override it.
 function applyAll(){
  entries.forEach(apply);
  const size=book.overrides[canvasKey()];
  if(size?.height!==undefined){
   const stage=host.querySelector('.qcp-stage'),rest=host.offsetHeight-stage.offsetHeight;
   writeStyle(stage,'height',Math.max(80,size.height-rest)+'px');writeStyle(stage,'min-height','0');
  }
 }
 function setCanvasSize(entry,dimensions){
  const stage=host.querySelector('.qcp-stage'),outer=entry.id==='p:canvas';
  const props={...book.overrides[canvasKey()]};
  for(const axis of ['width','height'])if(axis in dimensions){
   const dimension=axis==='width'?'offsetWidth':'offsetHeight';
   const extra=outer?0:host[dimension]-stage[dimension];
   props[axis]=Math.round(Math.max(limits[axis][0],Math.min(limits[axis][1],dimensions[axis]+extra)));
   // Old per-phase dimensions must never win over the common canvas size.
   for(const [key,localProps] of Object.entries(book.overrides))if(key.startsWith(viewportKey()+'|')&&key.endsWith('|p:stage')){
    const previous=localProps[axis];delete localProps[axis];
    const workspace=book.overrides[key.replace(/p:stage$/,'p:workspace')];
    if(previous!==undefined&&workspace?.[axis]===previous)delete workspace[axis];
   }
  }
  delete props.scale;delete props.rotation;book.overrides[canvasKey()]=props;
 }
 function visible(el){
  if(!el?.isConnected||!el.getClientRects().length)return false;
  for(let p=el;p&&p.nodeType===1;p=p.parentElement){const s=p.ownerDocument.defaultView.getComputedStyle(p);if(s.display==='none'||s.visibility==='hidden')return false;}
  const r=el.getBoundingClientRect();return r.width>0||r.height>0;
 }
 function buildEntries(){
  const result=[],state=api.state(),mobile=sceneWindow.matchMedia('(max-width:560px)').matches;
  const byElement=new Map();
  const add=(el,id,label,text=false,copy=text)=>{
   if(!el||byElement.has(el))return byElement.get(el);
   const svg=el.namespaceURI==='http://www.w3.org/2000/svg';
   if(!svg&&el.querySelector('svg')){text=false;copy=false;}
   // Edit once in Smoothness; every quality uses the same layout.
   const shared=true;
   const commonScope=scope.replace(/\|[013]\|$/,'|1|');
   // Progress labels retain one alignment in every chapter.
   const key=(id==='p:canvas'?commonScope.replace(/\|(-1|[0-4])\|1\|$/,'|-1|1|'):id.startsWith('p:chapter-')?commonScope.replace(/\|(-1|[0-4])\|1\|$/,'|2|1|'):commonScope)+id;
   // Selection feedback follows the live choice; saved copy must not freeze it.
   const dynamicChoice=id==='p:select-label'||id==='p:select-prompt';
   const entry={el,key,id,label,text,copy:copy&&!dynamicChoice&&!el.hasAttribute('data-flow-quality'),svg,shared};
   result.push(entry);byElement.set(el,entry);el.dataset.qeElement=id;
   if(text&&!svg&&el.ownerDocument.defaultView.getComputedStyle(el).display==='inline')el.dataset.qeInline='true';
   return entry;
  };
  add(host,'p:canvas','전체 애니메이션 · 모든 단계 공통');
  add(host.querySelector('.qcp-stage'),'p:stage','내용 영역 · 크기는 모든 단계 공통');
  const parentSpecs=[
   ['#qcp-story-title','title','단계 제목',true],['#qcp-previous','back','이전 버튼'],['#qcp-next','next','다음 버튼'],['#qcp-next-label','next-label','다음 버튼 문구',true],
   ['.qcp-loop-strip','loop','반복 학습 안내'],['#qcp-select-prompt','select-prompt','선택 안내',true],['#qcp-quality-picker','choices','품질 선택 목록'],
   ['#qcp-dial-quality','quality-name','품질 이름',true],['#qcp-limit-message','limit-copy','Want it even…',true],['.qcp-dial-wrap','dial','다이얼 전체'],
   ['#qcp-dial-hint','dial-hint','회전 안내'],['#qcp-dial-hint>span','dial-hint-text','Turn to adjust',true],['#qcp-behavior-name','behavior','동작 이름',true],
   ['#qcp-collect-intro p','collect-copy','수집 안내 문구',true],['#qcp-token-flow','conditioning','Conditioning 전체'],['#qcp-trained-policy','trained-card','학습 완료 카드']
  ];
  parentSpecs.forEach(([s,id,label,text])=>add(host.querySelector(s),'p:'+id,label,!!text));
  add(host.querySelector('.qcp-world'),'p:workspace','작업 공간 전체');
  host.querySelectorAll('[data-quality] strong').forEach(el=>add(el,'p:choice-'+el.parentElement.dataset.quality,el.textContent,true));
  host.querySelectorAll('[data-loop]').forEach(el=>add(el,'p:loop-'+el.dataset.loop,el.textContent,true));
  if(state.chapter===0){
   const svg=host.querySelector(mobile?'.qcp-conditioning-mobile':'.qcp-conditioning-desktop');
   [['.qcp-flow-token','token','Quality token 묶음'],['.qcp-token-cluster','cells','토큰 3개'],['.qcp-flow-input','input','입력 화살표'],['.qcp-flow-policy','policy','Policy 묶음'],['.qcp-flow-output','output','출력 화살표'],['.qcp-flow-action','action','Action 묶음']].forEach(([s,id,label])=>add(svg.querySelector(s),'flow:'+id,label));
   svg.querySelectorAll('text').forEach((el,i)=>add(el,'flow:text-'+i,el.textContent,true,!el.querySelector('tspan')));
   ['.qcp-quality-capsule','.qcp-policy-frame','.qcp-observation-wire'].forEach((s,i)=>add(svg.querySelector(s),'flow:shape-'+i,['품질 상자','Policy 상자','관측 입력 선'][i]));
  }
  if(state.chapter>=3){
   const prefix=state.chapter===3?'learn':'close',svg=host.querySelector(state.chapter===3?'#qcp-learning-board svg':'#qcp-closing-board svg');
   svg?.querySelectorAll('[data-edit-group]').forEach(el=>add(el,prefix+':'+el.dataset.editGroup,el.getAttribute('aria-label')));
   svg?.querySelectorAll('text').forEach((el,i)=>add(el,prefix+':'+(state.chapter===4&&el.dataset.editId?el.dataset.editId:'text-'+i),el.textContent,true));
   svg?.querySelectorAll('[data-growth-row]').forEach(el=>add(el,prefix+':curve-'+el.dataset.growthRow,'Iteration '+el.dataset.growthRow+' 곡선'));
  }
  const doc=frame.contentDocument;
  if(state.chapter<3&&doc){
   add(doc.querySelector('#scene'),'f:background','시뮬레이션 배경');
   if(state.chapter!==-1)add(doc.querySelector('canvas'),'f:robot-canvas','MuJoCo 화면');
   const specs=state.chapter===-1?[
    ['.intro-message-panel','message','Intro 메시지 전체'],['.intro-message-panel h2','headline','Same success. Different quality.',true],['.intro-takeaway','takeaway','Intro 설명',true],
    ['.intro-quality-scale','quality-axis','품질 비교 축'],['.intro-quality-labels span:first-child','less','Less stable',true],['.intro-quality-labels span:last-child','more','More stable',true],
    ['.intro-success','served','Served 배지',true],['.intro-example','example','예시 번호',true],['.intro-motion','motion','동작 설명과 궤적'],['.intro-motion strong','motion-label','Wine spills 문구',true],['.intro-motion svg','trace','궤적 그림']
   ]:[['#behavior','behavior','작업 이름',true],['.scene-actions','actions','다시 보기 / 전체 화면'],['.collection-rate','counts','수집 개수 안내'],['#collection-rate','count','수집 횟수',true],['#collection-summary','summary','성공 / 실패 개수',true],['.collection-rejection','rejection','실패 필터 문구',true],['#rollouts','rollouts','수집 결과 배지'],['#collection-complete p','complete','수집 완료 문구',true]];
   specs.forEach(([s,id,label,text])=>add(doc.querySelector(s),'f:'+id,label,!!text));
  }
  // Keep the old group IDs and add every meaningful visual part underneath them.
  const extra=[
   ['#qcp-previous>span:first-child','back-arrow','이전 버튼 · 화살표',true],['#qcp-previous>span:last-child','back-label','이전 버튼 · 문구',true],
   ['#qcp-next>span:last-child','next-arrow','다음 버튼 · 화살표',true],['#qcp-story-description','description','단계 설명',true],
   ['.qcp-playback','playback','하단 재생 컨트롤'],['#qcp-timeline','timeline','진행 막대 전체'],['.qcp-progress-knob','timeline-knob','진행 위치 표시'],['.qcp-chapters','chapters','단계 이름 목록'],['#qcp-play','play-button','재생 버튼'],['#qcp-replay','replay-button','다시 재생 버튼'],
   ['#qcp-select-label','select-label','Select a quality 문구',true],['#qcp-quality-knob','knob','다이얼 · 범위와 손잡이'],
   ['.qcp-extra-range','extra-range','다이얼 · 확장 가능 범위'],['.qcp-dial-ticks','dial-ticks','다이얼 · 바깥 눈금'],
   ['.qcp-dial-face','dial-face','다이얼 · 테두리'],['.qcp-dial-pointer','dial-pointer','다이얼 · 회전축'],['.qcp-dial-needle','dial-needle','다이얼 · 바늘'],['.qcp-dial-hub','dial-hub','다이얼 · 중심 면'],
   ['.qcp-limit-arrow','limit-arrow','한계 도전 화살표'],['#qcp-dial-hint svg','hint-arrow','Turn to adjust 화살표']
  ];
  extra.forEach(([selector,id,label,text])=>add(host.querySelector(selector),'p:'+id,label,!!text));
  host.querySelectorAll('.qcp-progress-segment').forEach((el,i)=>{add(el,'p:progress-'+i,names[i]+' · 진행 막대');add(el.firstElementChild,'p:progress-fill-'+i,names[i]+' · 진행 색');});
  host.querySelectorAll('.qcp-chapters button').forEach(el=>{add(el,'p:chapter-'+el.dataset.step,el.textContent,true,false);});
  host.querySelectorAll('#qcp-quality-picker button[data-quality]').forEach(el=>{
   const id=el.dataset.quality,name=el.querySelector('strong').textContent;
   add(el,'p:option-'+id,name+' 선택 버튼');add(el.querySelector('.qcp-choice-check'),'p:check-'+id,name+' · 선택 원');add(el.querySelector('.qcp-choice-tick'),'p:tick-'+id,name+' · 체크');
  });
  host.querySelectorAll('[data-edit-id]').forEach(el=>{if(!el.closest('svg'))add(el,'p:'+el.dataset.editId,el.dataset.editLabel||el.textContent,true);});
  host.querySelectorAll('.qcp-loop-strip>i').forEach((el,i)=>add(el,'p:loop-arrow-'+i,'루프 화살표 '+(i+1),true));
  if(state.chapter<3&&doc){
   const specs=state.chapter===-1?[
    ['.intro-demo','demo','MuJoCo 셀 · 화면과 배지'],['.intro-robot-view','robot-view','MuJoCo 화면'],['.intro-lens','lens','와인잔 확대 화면'],['.intro-success .intro-served-check','served-check','Served · 체크',true],['.intro-success .intro-served-label','served-label','Served · 글자',true],
    ['.intro-quality-axis','axis-line','품질 비교 · 기준선'],['.intro-quality-trail','axis-fill','품질 비교 · 진행 선'],['.intro-quality-axis>b','axis-marker','품질 비교 · 움직이는 점'],
    ['.intro-example-track','example-track','예시 재생 막대'],['.intro-motion path','trace-line','궤적 · 선']
   ]:[['#reset','restart','다시 보기 버튼',true],['#expand','fullscreen','전체 화면 버튼',true],['.collection-quality-line','complete-quality','수집 완료 · 높은 품질',true],['.collection-result-line','complete-result','수집 완료 · 모인 경험',true],['.collection-retrain span','retrain-copy','수집 완료 · 재학습 연결',true]];
   specs.forEach(([selector,id,label,text])=>add(doc.querySelector(selector),'f:'+id,label,!!text));
   doc.querySelectorAll(state.chapter===-1?'#intro-stage [data-edit-id]':'#rollouts [data-edit-id]').forEach(el=>add(el,'f:'+el.dataset.editId,el.dataset.editLabel||el.textContent,!el.matches('#rollouts>span')));
   doc.querySelectorAll(state.chapter===-1?'.intro-quality-axis>i':':not(*)').forEach((el,i)=>add(el,'f:axis-stop-'+i,'품질 비교 · 기준점 '+(i+1)));
   doc.querySelectorAll(state.chapter===-1?'.intro-example-track>span':':not(*)').forEach((el,i)=>add(el,'f:example-segment-'+i,'예시 '+(i+1)+' 재생 막대'));
   doc.querySelectorAll('#rollouts>span').forEach((el,i)=>{add(el,'f:rollout-'+(i+1),'Rollout '+(i+1)+' 배지');add(el.querySelector('.rollout-name'),'f:rollout-'+(i+1)+'-name','Rollout '+(i+1)+' · 번호',true);add(el.querySelector('.rollout-result'),'f:rollout-'+(i+1)+'-result','Rollout '+(i+1)+' · 성공/실패',true);});
  }
  const labels={
   'qcp-token-cell':'토큰','qcp-token-brackets':'토큰 괄호','qcp-circuit-base':'화살표 · 기본 선','qcp-circuit-light':'화살표 · 강조 선',
   'qcp-policy-aura':'Policy · 강조 테두리','qcp-training-track':'학습 진행 · 바탕 선','qcp-training-progress':'학습 진행 · 채워진 선'
  };
  const svgParts=(root,prefix)=>{
   if(!root)return;
   root.querySelectorAll('[data-edit-id]').forEach(el=>add(el,prefix+':'+el.dataset.editId,el.dataset.editLabel||el.textContent,el.tagName==='text'));
   root.querySelectorAll('g,path,rect,circle,ellipse,line,polyline,polygon,text,image,use').forEach(el=>{
    if(el.closest('defs')||byElement.has(el))return;
    // Derive IDs from structure, never from animated text, coordinates, or path data.
    const parts=[];let p=el;
    while(p&&p!==root&&!byElement.has(p)){
     const tag=p.tagName.toLowerCase(),siblings=[...p.parentElement.children].filter(v=>v.tagName===p.tagName);
     parts.unshift(tag+'-'+(siblings.indexOf(p)+1));p=p.parentElement;
    }
    const owner=byElement.get(p),id=(owner?.id||prefix)+':'+parts.join('.');
    const kind=el.tagName.toLowerCase(),siblings=[...el.parentElement.children].filter(v=>v.tagName===el.tagName),number=siblings.indexOf(el)+1;
    const label=el.dataset.editLabel||Object.entries(labels).find(([c])=>el.classList.contains(c))?.[1]||({g:'묶음',path:el.parentElement.dataset.editId?.includes('ticks')?'눈금':'선',rect:el.parentElement.hasAttribute('data-closing-tokens')?'토큰':'상자',circle:'원',ellipse:'타원',line:'선',polyline:'선',polygon:'도형',text:el.textContent,image:'이미지',use:'기호'}[kind]||'도형');
    add(el,id,label+(siblings.length>1&&kind!=='text'?' '+number:''),kind==='text');
   });
  };
  svgParts(host.querySelector('#qcp-play svg'),'play');svgParts(host.querySelector('#qcp-replay svg'),'replay');
  if(state.chapter===0)svgParts(host.querySelector(mobile?'.qcp-conditioning-mobile':'.qcp-conditioning-desktop'),'flow');
  if(state.chapter>=3)svgParts(host.querySelector(state.chapter===3?'#qcp-learning-board svg':'#qcp-closing-board svg'),state.chapter===3?'learn':'close');
  if(state.chapter===1||state.chapter===2){svgParts(host.querySelector('.qcp-limit-arrow'),'limit');svgParts(host.querySelector('#qcp-dial-hint svg'),'hint');}
  for(const entry of result){
   let parent=entry.el.parentElement;while(parent&&!byElement.has(parent))parent=parent.parentElement;
   entry.parent=byElement.get(parent)||null;
   if(!entry.parent&&entry.el.ownerDocument!==sceneDocument)entry.parent=byElement.get(host.querySelector('.qcp-world'))||null;
   entry.children=[];
  }
  result.forEach(entry=>entry.parent?.children.push(entry));
  result.forEach(entry=>{entry.group=entry.children.length>0;entry.editCopy=entry.copy&&!entry.children.some(child=>child.text);if(entry.el.hasAttribute('data-edit-collapsed')&&!folded.has(entry.id))folded.set(entry.id,true);});
  return result;
 }
 let scenePaintSignature='';
 function repaintScene(){
  const root=frame.contentDocument?.getElementById('scene');if(!root?.qcpCaptureFrame)return;
  const sig=JSON.stringify([scope,root.clientWidth,root.clientHeight,entries.filter(e=>e.id.startsWith('f:')||['p:canvas','p:stage','p:workspace'].includes(e.id)).map(e=>[e.key,book.overrides[e.key]])]);
  if(sig!==scenePaintSignature){scenePaintSignature=sig;root.qcpCaptureFrame();}
 }
 function sync(force=false){
  if(refreshing)return;refreshing=true;
  try{
   const s=api.state(),nextScope=`${viewportKey()}|${s.chapter}|${s.quality}|`;
   const svg=host.querySelector(s.chapter===3?'#qcp-learning-board svg':'#qcp-closing-board svg');
   const newSignature=`${nextScope}:${frame.contentDocument?.querySelector('#intro-stage')?'ready':'loading'}:${frame.contentDocument?.querySelector('#rollouts')?.childElementCount||0}:${host.querySelector('#qcp-limit-message')?.dataset.quality||''}`;
   if(force||scope!==nextScope||signature!==newSignature||sync.svg!==svg||sync.doc!==frame.contentDocument){
    restore();scope=nextScope;signature=newSignature;sync.svg=svg;sync.doc=frame.contentDocument;entries=buildEntries();
    const previous=selected;selected=entries.find(e=>e.key===previous?.key)||null;for(const key of selection)if(!entries.some(e=>e.key===key))selection.delete(key);
    if(active){renderLayers();syncSceneControls();}
   }
   applyAll();api.alignConnections?.();repaintScene();
   if(active){
    const playing=api.state().playing;if(sync.wasPlaying!==playing){sync.wasPlaying=playing;renderLayers();}dialog.querySelector('#qe-play').textContent=playing?'일시정지':'장면 재생';
    dialog.querySelector('#qe-scrub').value=String(Math.round(s.progress*1000));dialog.querySelector('#qe-time').textContent=(s.progress*s.duration/1000).toFixed(1)+'s';
    sceneDocument.documentElement.classList.toggle('qcp-edit-freeze',!playing);frame.contentDocument?.documentElement?.classList.toggle('qcp-edit-freeze',!playing);
    fitCanvas();if(force)renderProperties();positionOutline();
   }
  }finally{refreshing=false;}
 }
 function notify(text){if(status)status.textContent=text;}
 function persistDraft(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>{try{localStorage.setItem(storeKey,JSON.stringify({base:saved,book}));}catch{notify('브라우저 임시 저장을 사용할 수 없습니다. 파일로 저장해 주세요.');}},120);}
 function changed(){persistDraft();sync(true);if(dialog){dialog.querySelector('#qe-undo').disabled=!undo.length;dialog.querySelector('#qe-redo').disabled=!redo.length;dialog.querySelector('#qe-save').textContent=JSON.stringify(book)===saved?'저장됨':'프로젝트에 저장';}notify('브라우저에 임시 보관 · 프로젝트 저장 전');}
 function remember(){undo.push(clone(book));if(undo.length>80)undo.shift();redo=[];}
 function chosen(){return entries.filter(e=>selection.has(e.key));}
 function ancestorOf(a,b){for(let p=b?.parent;p;p=p.parent)if(p.key===a.key)return true;return false;}
 function edit(props){if(!selected)return;const targets=chosen();if(targets.every(e=>Object.entries(props).every(([k,v])=>book.overrides[e.key]?.[k]===v)))return;remember();targets.forEach(e=>book.overrides[e.key]={...book.overrides[e.key],...props});changed();}
 function travel(from,to){if(!from.length)return;to.push(clone(book));book=from.pop();changed();}
 function select(entry,toggle=false){
  if(!toggle)selection.clear();
  if(entry){
   if(toggle&&selection.has(entry.key))selection.delete(entry.key);
   else{for(const other of chosen())if(ancestorOf(other,entry)||ancestorOf(entry,other))selection.delete(other.key);selection.add(entry.key);}
  }
  selected=entry&&selection.has(entry.key)?entry:chosen().at(-1)||null;
  for(const item of chosen())for(let p=item.parent;p;p=p.parent)folded.set(p.id,false);
  renderLayers();renderProperties();positionOutline();
  const row=layerList?.querySelector('[aria-pressed="true"]');if(row){const a=row.getBoundingClientRect(),b=layerList.getBoundingClientRect();if(a.top<b.top)layerList.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)layerList.scrollTop+=a.bottom-b.bottom;}if(dialog)dialog.querySelector('.qe-inspector').scrollTop=0;
 }
 function renderLayers(){
  if(!layerList)return;const scroll=layerList.scrollTop;layerList.replaceChildren();
  const query=dialog.querySelector('#qe-layer-search')?.value.trim().toLowerCase()||'';
  const matches=e=>e.label.toLowerCase().includes(query)||e.id.toLowerCase().includes(query);
  const visit=(e,depth)=>{
   if(!visible(e.el))return;
   if(!query||matches(e)){
    const row=document.createElement('div');row.className='qe-layer-row';row.style.setProperty('--depth',Math.min(depth,4));
    const toggle=document.createElement('button');toggle.type='button';toggle.className='qe-fold';toggle.textContent=e.group?(folded.get(e.id)?'▸':'▾'):'';toggle.disabled=!e.group;toggle.setAttribute('aria-label',e.label+' 하위 요소');if(e.group)toggle.setAttribute('aria-expanded',String(!folded.get(e.id)));toggle.onclick=()=>{folded.set(e.id,!folded.get(e.id));renderLayers();};
    const button=document.createElement('button');button.type='button';button.className='qe-layer';button.textContent=(e.group?'▧  ':e.text?'T  ':'◇  ')+e.label;button.title=e.label;button.dataset.element=e.id;button.setAttribute('aria-pressed',String(selection.has(e.key)));button.onclick=event=>select(e,event.ctrlKey||event.metaKey);row.append(toggle,button);layerList.append(row);
   }
   if(query||!folded.get(e.id))e.children.forEach(child=>visit(child,depth+1));
  };
  entries.filter(e=>!e.parent).forEach(e=>visit(e,0));layerList.scrollTop=scroll;
 }
 function rgbHex(color){const m=color.match(/\d+/g);return m?'#'+m.slice(0,3).map(v=>Number(v).toString(16).padStart(2,'0')).join(''):'#46515c';}
 function renderProperties(forceInputs=false){
  if(!form)return;form.hidden=!selected;dialog.querySelector('#qe-empty').hidden=!!selected;
  const multi=selection.size>1;form.querySelector('.qe-coordinate-note').textContent='장면 왼쪽 위 (0, 0) 기준 · px'+(selected?.shared?' · 품질 공통':'');
  dialog.querySelector('#qe-selection-name').textContent=multi?`${selection.size}개 요소 선택`:selected?.label||'요소를 선택하세요';
  const parentButton=dialog.querySelector('#qe-parent');parentButton.disabled=multi||!selected?.parent;parentButton.title=selected?.parent?.label||'상위 묶음이 없습니다';if(!selected)return;
  const p=book.overrides[selected.key]||{},style=selected.el.ownerDocument.defaultView.getComputedStyle(selected.el),pos=absolutePosition();
  const defaults={width:selected.el.offsetWidth||selected.el.getBoundingClientRect().width,height:selected.el.offsetHeight||selected.el.getBoundingClientRect().height,backgroundColor:rgbHex(style.backgroundColor),x:pos.x,y:pos.y,scale:100,rotation:0,fontSize:parseFloat(style.fontSize),fontWeight:parseInt(style.fontWeight)||400,lineHeight:Math.round((parseFloat(style.lineHeight)/parseFloat(style.fontSize)||1.2)*100)/100,opacity:1,color:rgbHex(selected.svg?style.fill:style.color),fontFamily:'',text:selected.svg?selected.el.textContent:selected.el.innerText};
  for(const input of form.querySelectorAll('[data-prop]')){
   const key=input.dataset.prop;
   if(forceInputs||document.activeElement!==input)input.value=key==='x'||key==='y'?defaults[key]:key==='scale'?Math.round((p.scale||1)*100):key in p?p[key]:defaults[key];
   input.disabled=(sizesCanvas(selected)&&['scale','rotation'].includes(key))||(['f:robot-view','f:lens'].includes(selected.id)&&['rotation','opacity','backgroundColor'].includes(key))||(['width','height','backgroundColor'].includes(key)&&selected.svg)||(multi&&!['x','y','opacity'].includes(key))||(['fontSize','fontWeight','fontFamily','lineHeight','color','text'].includes(key)&&!selected.text)||(key==='text'&&!selected.editCopy);
  }
  form.querySelector('[data-prop=backgroundColor]').closest('label').hidden=['f:robot-view','f:lens','f:robot-canvas','f:demo'].includes(selected.id);
  form.querySelector('#qe-text-fields').hidden=multi||!selected.text;form.querySelector('#qe-box-fields').hidden=multi||selected.svg;
  if(sizesCanvas(selected))form.querySelector('.qe-coordinate-note').textContent='가로·세로 변경은 이 화면 폭의 여섯 단계에 함께 적용됩니다.';
 }
 function commitInput(input){
  const key=input?.dataset.prop;if(!key||!selected||input.disabled)return;
  let value=input.value;
  if(Object.hasOwn(limits,key)){
   if(value===''||!input.checkValidity()){input.reportValidity();return;}
   value=Number(value);if(key==='scale')value/=100;
  }
  if(key==='x'||key==='y'){
   const pos=absolutePosition(),amount=value-pos[key];
   if(Math.abs(amount)>.0005)moveSelection(key==='x'?amount:0,key==='y'?amount:0);
  }else if(key==='fontFamily'&&!value){if(book.overrides[selected.key]?.fontFamily){remember();delete book.overrides[selected.key].fontFamily;changed();}}
  else if(sizesCanvas(selected)&&['width','height'].includes(key)){remember();setCanvasSize(selected,{[key]:value});changed();}
  else edit({[key]:value});
  renderProperties(true);
 }
 function commitFocused(){const input=document.activeElement;if(form?.contains(input)&&input.matches('[data-prop]'))commitInput(input);}
 function outerRect(rect,doc){
  let r={x:rect.x,y:rect.y,width:rect.width,height:rect.height};
  while(doc!==document){
   const embed=doc.defaultView.frameElement;if(!embed)break;
   const f=embed.getBoundingClientRect(),sx=f.width/embed.offsetWidth,sy=f.height/embed.offsetHeight;
   r={x:f.x+(embed.clientLeft+r.x)*sx,y:f.y+(embed.clientTop+r.y)*sy,width:r.width*sx,height:r.height*sy};doc=embed.ownerDocument;
  }return r;
 }
 function rectOf(el){return outerRect(el.getBoundingClientRect(),el.ownerDocument);}
 function sceneScale(){return rectOf(host).width/host.offsetWidth||1;}
 function selectionBounds(){
  const rs=chosen().filter(e=>visible(e.el)).map(e=>rectOf(e.el));if(!rs.length)return null;
  const x=Math.min(...rs.map(r=>r.x)),y=Math.min(...rs.map(r=>r.y));
  return{x,y,width:Math.max(...rs.map(r=>r.x+r.width))-x,height:Math.max(...rs.map(r=>r.y+r.height))-y};
 }
 const round=value=>Math.round(value*1000)/1000;
 function absolutePosition(){const r=selectionBounds(),origin=rectOf(host),z=sceneScale();return r?{x:round((r.x-origin.x)/z),y:round((r.y-origin.y)/z)}:{x:0,y:0};}
 function fitCanvas(){
  if(!active||!dialog)return;
  const canvas=dialog.querySelector('.qe-canvas'),surface=dialog.querySelector('#qe-canvas-surface'),slot=dialog.querySelector('#qe-canvas-slot');
  if(preview){
   const r=host.getBoundingClientRect();
   preview.style.height=Math.ceil(r.y+r.height)+'px';
   preview.style.left=-r.x+'px';preview.style.top=-r.y+'px';
  }
  const bounds=host.getBoundingClientRect(),width=preview?bounds.width:innerWidth>=760?852:Math.max(280,canvas.clientWidth-24);slot.style.width=width+'px';
  const height=preview?bounds.height:host.offsetHeight;
  if(preview)slot.style.height=height+'px';
  const fit=Math.min(1,(canvas.clientWidth-32)/width,(canvas.clientHeight-32)/height);
  canvasZoom=editorZoom??fit;
  const w=Math.max(canvas.clientWidth,width*canvasZoom+48),h=Math.max(canvas.clientHeight,height*canvasZoom+48);
  surface.style.width=w+'px';surface.style.height=h+'px';
  slot.style.left=(w-width*canvasZoom)/2+'px';slot.style.top=(h-height*canvasZoom)/2+'px';slot.style.transform=`scale(${canvasZoom})`;
  const input=dialog.querySelector('#qe-zoom');if(document.activeElement!==input)input.value=Math.round(canvasZoom*100);
  dialog.querySelector('#qe-fit').setAttribute('aria-pressed',String(editorZoom===null));
 }
 function zoomTo(value,anchor){
  if(!active)return;const canvas=dialog.querySelector('.qe-canvas'),r=canvas.getBoundingClientRect(),old=rectOf(host);
  const chosenRect=selectionBounds(),at=anchor||(chosenRect?{x:chosenRect.x+chosenRect.width/2,y:chosenRect.y+chosenRect.height/2}:{x:r.x+r.width/2,y:r.y+r.height/2});
  const local={x:(at.x-old.x)/sceneScale(),y:(at.y-old.y)/sceneScale()};
  editorZoom=value===null?null:Math.max(.25,Math.min(4,value));fitCanvas();
  if(value===null){canvas.scrollLeft=0;canvas.scrollTop=0;}
  else{const now=rectOf(host);const target=anchor||{x:r.x+r.width/2,y:r.y+r.height/2};canvas.scrollLeft+=now.x+local.x*sceneScale()-target.x;canvas.scrollTop+=now.y+local.y*sceneScale()-target.y;}
  dialog.querySelector('#qe-zoom').value=Math.round(canvasZoom*100);positionOutline();renderProperties();
 }
 function zoomWheel(event){if(!active||!(event.ctrlKey||event.metaKey))return;event.preventDefault();const p=point(event);zoomTo(canvasZoom*Math.exp(-event.deltaY*.004),p);}
 function positionOutline(){
  if(!outline)return;const r=selectionBounds(),canvas=dialog?.querySelector('.qe-canvas').getBoundingClientRect();
  if(!active||!r||api.state().playing||!dialog.querySelector('#qe-export-panel').hidden||r.x+r.width<canvas.x||r.x>canvas.right||r.y+r.height<canvas.y||r.y>canvas.bottom){outline.hidden=true;return;}
  const w=Math.max(8,r.width),h=Math.max(8,r.height);outline.hidden=false;outline.classList.toggle('qe-multiple',selection.size>1);
  Object.assign(outline.style,{left:(r.x-(w-r.width)/2)+'px',top:(r.y-(h-r.height)/2)+'px',width:w+'px',height:h+'px'});
  outline.querySelector('span').textContent=selection.size>1?`${selection.size}개 선택`:selected.label;outline.querySelector('button').hidden=selection.size>1;
  const members=outline.querySelector('.qe-members');members.replaceChildren();
  if(selection.size>1)for(const entry of chosen()){const box=rectOf(entry.el),el=document.createElement('i');Object.assign(el.style,{left:(box.x-r.x)+'px',top:(box.y-r.y)+'px',width:Math.max(4,box.width)+'px',height:Math.max(4,box.height)+'px'});members.append(el);}
  // Zoomed content can be scrolled behind the inspector; clip selection UI to the canvas.
  outline.style.clipPath=`inset(${Math.max(-40,canvas.top-r.y-1)}px ${Math.max(-8,r.x+w-canvas.right)}px ${Math.max(-8,r.y+h-canvas.bottom)}px ${Math.max(-8,canvas.left-r.x-1)}px)`;
 }
 function movement(entry){
  // Measure the actual local-to-screen mapping, including SVG, iframe, rotated
  // groups, and editor zoom. Probing restores the exact original inline style.
  const el=entry.el,p=book.overrides[entry.key]||{},value=el.style.getPropertyValue('translate'),priority=el.style.getPropertyPriority('translate');
  const x=p.x||0,y=p.y||0,r=rectOf(el);
  el.style.setProperty('translate',`${x+1}px ${y}px`,'important');const rx=rectOf(el);
  el.style.setProperty('translate',`${x}px ${y+1}px`,'important');const ry=rectOf(el);
  value?el.style.setProperty('translate',value,priority):el.style.removeProperty('translate');
  return{entry,props:{...p},a:rx.x-r.x,b:rx.y-r.y,c:ry.x-r.x,d:ry.y-r.y};
 }
 function translateItems(items,dx,dy){
  for(const m of items){const det=m.a*m.d-m.b*m.c;if(Math.abs(det)<1e-8)continue;
   const x=(m.d*dx-m.c*dy)/det,y=(m.a*dy-m.b*dx)/det;
   book.overrides[m.entry.key]={...m.props,x:round(Math.max(-1500,Math.min(1500,(m.props.x||0)+x))),y:round(Math.max(-1500,Math.min(1500,(m.props.y||0)+y)))};
  }
 }
 function moveSelection(dx,dy){if(!selection.size)return;const items=chosen().map(movement),z=sceneScale();remember();translateItems(items,dx*z,dy*z);changed();}
 function point(event){return outerRect({x:event.clientX,y:event.clientY,width:0,height:0},event.target.ownerDocument);}
 function painted(entry){
  if(!visible(entry.el))return false;
  for(let p=entry.el;p;p=p.parentElement)if(Number(p.ownerDocument.defaultView.getComputedStyle(p).opacity)<.01)return false;
  return entry.el.ownerDocument===sceneDocument||visible(frame)&&Number(sceneWindow.getComputedStyle(frame.parentElement).opacity)>.01;
 }
 function marqueeRect(entry){
  if(!entry.text||entry.svg)return rectOf(entry.el);
  // Text blocks may span the whole workspace. Hit-test the visible text instead.
  const range=entry.el.ownerDocument.createRange();range.selectNodeContents(entry.el);const r=range.getBoundingClientRect();
  if(!r.width&&!r.height)return rectOf(entry.el);
  return outerRect(r,entry.el.ownerDocument);
 }
 function beginMarquee(event,fallback=null){
  const at=point(event);event.preventDefault();event.stopImmediatePropagation();
  host.tabIndex=-1;host.focus({preventScroll:true});
  marquee={fallback:marqueeMode||event.shiftKey?null:fallback,start:at,before:[...selection],base:event.ctrlKey||event.metaKey?[...selection]:[],moved:false,candidates:entries.filter(e=>!e.group&&painted(e)).map(entry=>({entry,rect:marqueeRect(entry)}))};
  if(!marquee.base.length)select(null);
  event.target.setPointerCapture?.(event.pointerId);
 }
 function moveMarquee(event){
  const p=point(event),canvas=dialog.querySelector('.qe-canvas').getBoundingClientRect();
  const x=Math.max(canvas.left,Math.min(canvas.right,p.x)),y=Math.max(canvas.top,Math.min(canvas.bottom,p.y));
  const left=Math.min(marquee.start.x,x),top=Math.min(marquee.start.y,y),right=Math.max(marquee.start.x,x),bottom=Math.max(marquee.start.y,y);
  if(right-left<3&&bottom-top<3&&!marquee.moved)return;
  marquee.moved=true;event.preventDefault();marqueeBox.hidden=false;
  Object.assign(marqueeBox.style,{left:left+'px',top:top+'px',width:(right-left)+'px',height:(bottom-top)+'px'});
  selection.clear();marquee.base.forEach(key=>selection.add(key));
  for(const {entry,rect:r} of marquee.candidates){
   if(r.x<=right&&r.y<=bottom&&r.x+r.width>=left&&r.y+r.height>=top){
    for(const other of chosen())if(ancestorOf(other,entry)||ancestorOf(entry,other))selection.delete(other.key);
    selection.add(entry.key);
   }
  }
  selected=chosen().at(-1)||null;positionOutline();
 }
 function endMarquee(cancel=false){
  if(!marquee)return;const clicked=!marquee.moved&&!cancel?marquee.fallback:null;
  if(cancel){selection.clear();marquee.before.forEach(key=>selection.add(key));}
  marquee=null;marqueeBox.hidden=true;selected=chosen().at(-1)||null;if(clicked){selection.clear();selection.add(clicked.key);selected=clicked;}
  marqueeMode=false;dialog.querySelector('#qe-marquee-tool').setAttribute('aria-pressed','false');dialog.querySelector('.qe-canvas').classList.remove('qe-box-select');
  renderLayers();renderProperties();positionOutline();notify(selection.size?`${selection.size}개 요소 선택 · 드래그하거나 방향키로 함께 이동`:'선택 영역과 조금이라도 겹치는 요소를 선택합니다.');
 }
 function beginDrag(event,resize=false,keepSelection=false){
  if(!active||event.button!==0||api.state().playing)return;
  commitFocused();if(form?.contains(document.activeElement))document.activeElement.blur();
  if(!resize&&!keepSelection){
   const hits=[];for(let el=event.target;el;el=el.parentElement){const entry=entries.find(e=>e.el===el);if(entry&&visible(el))hits.push(entry);}
   let hit=hits[0]||(event.target.ownerDocument!==sceneDocument?entries.find(e=>e.id==='p:workspace'):null);
   const surface=!hit||['p:canvas','p:stage','f:background','p:workspace','p:conditioning','learn:distribution','close:distribution'].includes(hit.id)||['svg','g'].includes(event.target.tagName?.toLowerCase());
   if(!event.altKey&&(marqueeMode||event.shiftKey||surface)){beginMarquee(event,hit);return;}
   if(event.altKey)hit=selected&&hits.includes(selected)?selected:hit?.parent||hit;
   if(!hit)return;
   if(event.ctrlKey||event.metaKey){select(hit,true);event.preventDefault();event.stopImmediatePropagation();if(!selection.has(hit.key))return;}
   else if(!selection.has(hit.key))select(hit);
  }
  if(!selected)return;
  host.tabIndex=-1;host.focus({preventScroll:true});event.preventDefault();event.stopImmediatePropagation();const at=point(event);
  drag={entry:selected,x:at.x,y:at.y,before:clone(book),props:{...book.overrides[selected.key]},items:chosen().map(movement),resize,box:{width:selected.el.offsetWidth,height:selected.el.offsetHeight},width:Math.max(20,selectionBounds().width),origin:absolutePosition(),zoom:sceneScale(),moved:false};
  event.target.setPointerCapture?.(event.pointerId);
 }
 function moveDrag(event){
  if(marquee){moveMarquee(event);return;}
  if(!drag)return;event.preventDefault();const p=point(event);let dx=p.x-drag.x,dy=p.y-drag.y;if(Math.hypot(dx,dy)<1&&!drag.moved)return;drag.moved=true;
  if(drag.resize&&sizesCanvas(drag.entry))setCanvasSize(drag.entry,{width:drag.box.width+dx/drag.zoom,height:drag.box.height+dy/drag.zoom});
  else if(drag.resize)book.overrides[drag.entry.key]={...drag.props,scale:Math.max(.2,Math.min(4,(drag.props.scale||1)*(1+dx/drag.width)))};
  else{const snap=dialog.querySelector('#qe-snap').checked?4:1;dx=(Math.round((drag.origin.x+dx/drag.zoom)/snap)*snap-drag.origin.x)*drag.zoom;dy=(Math.round((drag.origin.y+dy/drag.zoom)/snap)*snap-drag.origin.y)*drag.zoom;translateItems(drag.items,dx,dy);}
  applyAll();api.alignConnections?.();repaintScene();renderProperties();positionOutline();
 }
 function endDrag(){if(marquee){endMarquee();return;}if(!drag)return;if(drag.moved){undo.push(drag.before);if(undo.length>80)undo.shift();redo=[];changed();}drag=null;}
 function keys(event){
  if(!active)return;const mod=event.ctrlKey||event.metaKey;
  if(mod&&event.key.toLowerCase()==='s'){event.preventDefault();commitFocused();save();return;}
  if(event.target.closest('input,textarea,select'))return;
  if(mod&&event.key.toLowerCase()==='z'){event.preventDefault();travel(event.shiftKey?redo:undo,event.shiftKey?undo:redo);return;}
  if(event.key==='Escape'){if(marquee)endMarquee(true);else select(null);return;}if(!selected)return;
  const d={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[event.key];
  if(d){event.preventDefault();event.stopImmediatePropagation();const step=event.shiftKey?10:1;moveSelection(d[0]*step,d[1]*step);}
 }
 function attachDocument(doc){
  if(!doc||!doc.head||!doc.body||doc.qcpEditorAttached)return;doc.qcpEditorAttached=true;
  doc.addEventListener('pointerdown',e=>{if(doc===document&&!host.contains(e.target)&&!dialog?.querySelector('.qe-canvas').contains(e.target))return;beginDrag(e);},true);
  doc.addEventListener('pointermove',moveDrag,true);doc.addEventListener('pointerup',endDrag,true);doc.addEventListener('pointercancel',()=>{if(marquee)endMarquee(true);else endDrag();},true);doc.addEventListener('keydown',keys,true);
  doc.addEventListener('click',e=>{if(active&&!api.state().playing&&(doc!==document||host.contains(e.target))){e.preventDefault();e.stopImmediatePropagation();}},true);
  if(doc!==document){doc.addEventListener('wheel',zoomWheel,{passive:false});const link=doc.createElement('link');link.rel='stylesheet';link.href=cssURL.href;doc.head.append(link);const body=doc.body;if(body)new doc.defaultView.MutationObserver(()=>sync()).observe(body,{childList:true,subtree:true,characterData:true});}
 }
 function syncSceneControls(){if(!dialog)return;dialog.querySelectorAll('[data-select-part]').forEach(b=>{const id=b.dataset.selectPart==='robot'?(api.state().chapter===-1?'f:robot-view':'f:robot-canvas'):b.dataset.selectPart;b.disabled=!entries.some(e=>e.id===id&&visible(e.el));});const s=api.state();dialog.querySelectorAll('[data-scene]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.scene)===s.chapter)));dialog.querySelector('#qe-scrub').disabled=s.chapter===1;dialog.querySelector('#qe-scope').textContent=preview?`${preset.name} · ${preset.width}px 미리보기 · ${preset.id==='small-mobile'?'모바일 배치 비례 축소':preset.range+'에 적용'}`:`${viewportKey()} · 모든 품질 공통`;
  dialog.querySelectorAll('[data-select-part]').forEach(b=>b.onclick=()=>{const id=b.dataset.selectPart==='robot'?(api.state().chapter===-1?'f:robot-view':'f:robot-canvas'):b.dataset.selectPart;select(entries.find(e=>e.id===id)||null);});
  dialog.querySelectorAll('[data-viewport]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.viewport===preset.id)));}
 function goScene(index){endMarquee(true);commitFocused();selected=null;selection.clear();api.scene(index,1);if(preview){const url=new URL(location.href);url.searchParams.set('scene',index);history.replaceState(null,'',url);}sync(true);}
 let exportURL;
 function download(){
  const panel=dialog.querySelector('#qe-export-panel'),text=JSON.stringify(book,null,2)+'\n';
  if(exportURL)URL.revokeObjectURL(exportURL);exportURL=URL.createObjectURL(new Blob([text],{type:'application/json'}));
  panel.querySelector('textarea').value=text;panel.querySelector('a').href=exportURL;panel.hidden=false;outline.hidden=true;panel.querySelector('textarea').focus();
 }

 async function setViewport(id){
  const next=presets.find(p=>p.id===id);if(!preview||!next||next===preset)return;
  endMarquee(true);endDrag();commitFocused();api.activate(true);restore();selected=null;selection.clear();preset=next;
  preview.style.width=preset.width+'px';editorZoom=null;scope='';signature='';
  const url=new URL(location.href);url.searchParams.set('width',id);history.replaceState(null,'',url);
  // Let media queries and the SVG scene rebuild before measuring selection bounds.
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  sync(true);zoomTo(null);notify(viewportKey()==='mobile'?'모바일·작은 모바일은 같은 배치를 공유합니다. 작은 모바일은 비율대로 축소됩니다.':`${preset.name}만 편집 중 · 다른 폭의 배치는 유지됩니다.`);
 }
 async function save(){
  const snapshot=JSON.stringify(book);const button=dialog.querySelector('#qe-save');button.disabled=true;notify('프로젝트에 저장 중…');
  try{const r=await fetch('/__qcp_editor/layout',{method:'POST',headers:{'Content-Type':'application/json'},body:snapshot});if(!r.ok)throw Error('저장 서버 응답 '+r.status);saved=snapshot;persistDraft();notify('프로젝트 파일에 저장됨 · 새로고침 후에도 적용됩니다.');button.textContent=JSON.stringify(book)===saved?'저장됨':'프로젝트에 저장';}
  catch{notify('프로젝트 저장에 실패했습니다. 로컬 서버를 확인하거나 JSON을 내보내 주세요.');}
  finally{button.disabled=false;}
 }
 function align(axis){if(!selected)return;const r=selectionBounds(),target=rectOf(host),z=sceneScale();moveSelection(axis==='x'?(target.width-r.width)/2/z-(r.x-target.x)/z:0,axis==='y'?(target.height-r.height)/2/z-(r.y-target.y)/z:0);}
 function makeUI(){
  dialog=document.createElement('div');dialog.id='qcp-layout-studio';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.setAttribute('aria-label','QCP 애니메이션 편집기');
  dialog.innerHTML=`<header class="qe-top"><div><b>QCP Studio</b><span>애니메이션 레이아웃</span></div><div class="qe-actions"><button id="qe-undo" aria-label="실행 취소" disabled title="실행 취소 (⌘Z)">↶</button><button id="qe-redo" aria-label="다시 실행" disabled title="다시 실행 (⇧⌘Z)">↷</button><button id="qe-export">JSON 내보내기</button><button id="qe-import">불러오기</button><button id="qe-save" class="qe-primary">프로젝트에 저장</button><button id="qe-close" aria-label="편집기 닫기">닫기</button></div></header>
  <nav class="qe-scenes" aria-label="편집할 장면">${names.map((n,i)=>`<button data-scene="${i-1}"><small>${String(i+1).padStart(2,'0')}</small>${n}</button>`).join('')}</nav>
  <nav class="qe-widths" aria-label="편집할 화면 폭">${presets.map(p=>`<button data-viewport="${p.id}" title="${p.range}에 적용"><span>${p.name}</span><small>${p.width}px</small></button>`).join('')}<span>크기는 모든 단계 공통 · 작은 모바일은 모바일과 공유</span></nav>
  <div class="qe-workspace"><div class="qe-canvas-column"><div class="qe-viewbar"><span id="qe-scope"></span><span class="qe-quality-reference">Smoothness 기준</span><label><input id="qe-snap" type="checkbox"> 4px 스냅</label></div><div class="qe-structure-bar"><button data-select-part="p:canvas">전체 크기 · 공통</button><button data-select-part="p:stage">내용 높이 · 공통</button><button data-select-part="f:background">배경</button><button data-select-part="robot">MuJoCo 화면</button></div><div class="qe-zoom-bar"><span>캔버스 확대</span><button id="qe-zoom-out" aria-label="축소">−</button><label><input id="qe-zoom" type="number" min="25" max="400" step="1" value="100" aria-label="확대 비율">%</label><button id="qe-zoom-in" aria-label="확대">+</button><button id="qe-fit">화면에 맞춤</button><button id="qe-marquee-tool" aria-pressed="false" title="드래그한 사각형과 조금이라도 겹치는 요소 선택">영역 선택</button><small>Ctrl / ⌘ + 휠</small></div><div class="qe-canvas"><div id="qe-canvas-surface"><div id="qe-canvas-slot"></div></div></div><div class="qe-timebar"><button id="qe-play">장면 재생</button><input id="qe-scrub" type="range" min="0" max="1000" value="1000" aria-label="현재 장면의 시간"><output id="qe-time"></output></div><p class="qe-help">빈 공간 드래그: 영역 선택 · Shift + 드래그: 어디서든 영역 선택<br>Ctrl / ⌘ + 클릭: 다중 선택 · 드래그: 함께 이동 · 방향키: 1px / Shift: 10px<br>숫자 입력 후 Enter: 적용 · Alt + 드래그: 묶음 이동 · 확대 후 스크롤로 둘러보기<br>3D 동작은 ‘장면 재생’으로 확인하세요. MuJoCo 화면과 확대 화면은 위치·가로·세로를 조절할 수 있습니다. 로봇 모델 자체는 편집하지 않습니다.</p></div>
  <aside class="qe-inspector"><div class="qe-inspector-heading"><b id="qe-selection-name">요소를 선택하세요</b><button id="qe-reset" title="선택 요소 초기화">초기화</button></div><button id="qe-parent" type="button" disabled>↑ 상위 묶음 선택</button><p id="qe-empty">글자나 그림을 클릭하거나 아래 요소 목록에서 골라 주세요.</p>
  <form id="qe-properties" hidden><p class="qe-coordinate-note">장면 왼쪽 위 (0, 0) 기준 · px</p><div class="qe-grid"><label>절대 X<input data-prop="x" type="number" min="-1500" max="1500" step="any"></label><label>절대 Y<input data-prop="y" type="number" min="-1500" max="1500" step="any"></label><label>크기 %<input data-prop="scale" type="number" min="20" max="400" step="1"></label><label>회전 °<input data-prop="rotation" type="number" min="-180" max="180" step="1"></label></div>
  <div class="qe-grid" id="qe-box-fields"><label>가로 px<input data-prop="width" type="number" min="40" max="2000" step="1"></label><label>세로 px<input data-prop="height" type="number" min="40" max="1600" step="1"></label><label>배경 색<input data-prop="backgroundColor" type="color"></label></div><div class="qe-align"><button type="button" id="qe-center-x">가로 중앙</button><button type="button" id="qe-center-y">세로 중앙</button></div>
  <div id="qe-text-fields"><label>문구<textarea data-prop="text" rows="3" maxlength="500"></textarea></label><div class="qe-grid"><label>글씨 크기<input data-prop="fontSize" type="number" min="6" max="100" step="any"></label><label>줄 간격<input data-prop="lineHeight" type="number" min="0.7" max="3" step="any"></label><label>두께<select data-prop="fontWeight"><option value="400">Regular</option><option value="500">Medium</option><option value="550">550</option><option value="600">Semibold</option><option value="700">Bold</option></select></label><label>색상<input data-prop="color" type="color"></label></div><label>글꼴<select data-prop="fontFamily"><option value="">기존 글꼴</option><option value="Inter">Inter</option><option value="QCP Math">수식용 STIX</option><option value="Georgia">Georgia</option></select></label></div>
  <label>불투명도<input data-prop="opacity" type="range" min="0" max="1" step="0.05"></label></form>
  <details class="qe-layers" open><summary>장면 요소</summary><input id="qe-layer-search" type="search" placeholder="요소 검색" aria-label="장면 요소 검색"><div id="qe-layer-list"></div></details></aside></div>
  <footer class="qe-footer"><span id="qe-status" role="status">폭별 저장 · 모바일·작은 모바일 공유 · 모든 품질 공통</span><button id="qe-reset-scene">이 장면 초기화</button></footer><input id="qe-file" type="file" accept="application/json,.json" hidden>
  <div id="qe-export-panel" class="qe-backup" hidden><div role="region" aria-label="JSON 백업"><b>레이아웃 백업</b><p>파일로 다운로드하거나 JSON을 복사해 보관하세요.</p><textarea readonly aria-label="백업 JSON" rows="10"></textarea><div class="qe-backup-actions"><a download="qcp-layout.json">파일 다운로드</a><button id="qe-copy-json">JSON 복사</button><button id="qe-close-export">닫기</button></div><p id="qe-backup-status" role="status">다운로드가 지원되지 않는 브라우저에서는 복사를 이용하세요.</p></div></div>`;
  document.body.append(dialog);outline=document.createElement('div');outline.id='qe-selection';outline.hidden=true;outline.innerHTML='<div class="qe-members"></div><span></span><button aria-label="선택 요소 크기 조절" title="드래그하여 크기 조절"></button>';document.body.append(outline);marqueeBox=document.createElement('div');marqueeBox.id='qe-marquee';marqueeBox.hidden=true;marqueeBox.setAttribute('aria-hidden','true');document.body.append(marqueeBox);
  form=dialog.querySelector('#qe-properties');layerList=dialog.querySelector('#qe-layer-list');status=dialog.querySelector('#qe-status');
  form.onsubmit=e=>{e.preventDefault();commitFocused();};
  form.addEventListener('input',e=>{if(e.target.type!=='number')commitInput(e.target);});
  form.addEventListener('change',e=>commitInput(e.target));
  form.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.matches('input[data-prop]')){e.preventDefault();e.stopPropagation();commitInput(e.target);e.target.select?.();}});
  const zoomInput=dialog.querySelector('#qe-zoom');const commitZoom=()=>{if(zoomInput.value&&zoomInput.checkValidity())zoomTo(Number(zoomInput.value)/100);};
  zoomInput.onchange=commitZoom;zoomInput.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();commitZoom();zoomInput.select();}};
  dialog.querySelector('#qe-zoom-in').onclick=()=>zoomTo(Math.round(canvasZoom*100/25)*.25+.25);
  dialog.querySelector('#qe-zoom-out').onclick=()=>zoomTo(Math.round(canvasZoom*100/25)*.25-.25);
  dialog.querySelector('#qe-fit').onclick=()=>zoomTo(null);
  const canvas=dialog.querySelector('.qe-canvas');canvas.addEventListener('wheel',zoomWheel,{passive:false});canvas.addEventListener('scroll',positionOutline);dialog.querySelector('#qe-marquee-tool').onclick=()=>{marqueeMode=!marqueeMode;dialog.querySelector('#qe-marquee-tool').setAttribute('aria-pressed',String(marqueeMode));canvas.classList.toggle('qe-box-select',marqueeMode);};
  dialog.querySelectorAll('[data-viewport]').forEach(b=>b.onclick=()=>setViewport(b.dataset.viewport));
  dialog.querySelectorAll('[data-scene]').forEach(b=>b.onclick=()=>goScene(Number(b.dataset.scene)));
  dialog.querySelector('#qe-play').onclick=()=>{commitFocused();api.play();sync(true);};dialog.querySelector('#qe-scrub').oninput=e=>{api.scrub(Number(e.target.value)/1000);sync();};
  dialog.querySelector('#qe-undo').onclick=()=>travel(undo,redo);dialog.querySelector('#qe-redo').onclick=()=>travel(redo,undo);
  dialog.querySelector('#qe-close-export').onclick=()=>{dialog.querySelector('#qe-export-panel').hidden=true;positionOutline();dialog.querySelector('#qe-export').focus();};
  dialog.querySelector('#qe-copy-json').onclick=async()=>{const text=dialog.querySelector('#qe-export-panel textarea');try{await navigator.clipboard.writeText(text.value);dialog.querySelector('#qe-backup-status').textContent='JSON을 클립보드에 복사했습니다.';}catch{text.focus();text.select();dialog.querySelector('#qe-backup-status').textContent='JSON을 선택했습니다. ⌘/Ctrl + C로 복사하세요.';}};
  dialog.querySelector('#qe-save').onclick=()=>{commitFocused();save();};dialog.querySelector('#qe-export').onclick=download;dialog.querySelector('#qe-import').onclick=()=>dialog.querySelector('#qe-file').click();
  dialog.querySelector('#qe-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>1000000)throw Error('파일은 1MB 이내여야 합니다.');const imported=validate(JSON.parse(await file.text()));remember();book=imported;changed();notify('편집값을 불러왔습니다. 프로젝트에 저장하면 확정됩니다.');}catch(error){notify(error.message);}e.target.value='';};
  dialog.querySelector('#qe-reset').onclick=()=>{if(!selected)return;remember();chosen().forEach(e=>delete book.overrides[e.key]);changed();};
  dialog.querySelector('#qe-reset-scene').onclick=()=>{remember();const keys=new Set(entries.filter(e=>e.id!=='p:canvas').map(e=>e.key));for(const key of Object.keys(book.overrides))if(!key.endsWith('|p:canvas')&&(key.startsWith(scope)||keys.has(key)))delete book.overrides[key];changed();notify('현재 폭의 이 장면만 초기화했습니다. 실행 취소로 되돌릴 수 있습니다.');};
  dialog.querySelector('#qe-center-x').onclick=()=>align('x');dialog.querySelector('#qe-center-y').onclick=()=>align('y');dialog.querySelector('#qe-close').onclick=close;
  outline.querySelector('button').onpointerdown=e=>beginDrag(e,true);outline.querySelector('span').onpointerdown=e=>beginDrag(e,false,true);
  dialog.querySelector('#qe-layer-search').oninput=renderLayers;dialog.querySelector('#qe-parent').onclick=()=>{if(selected?.parent)select(selected.parent);};
  // Keep keyboard focus within the editor; arrow shortcuts apply outside form controls.
  dialog.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const controls=[...dialog.querySelectorAll('button,input,textarea,select,summary')].filter(el=>!el.disabled&&visible(el));const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}});
 }
 function open(){
  if(active)return;if(!dialog)makeUI();active=true;api.activate(true);
  if(!preview){placeholder=document.createComment('QCP animation position');host.before(placeholder);dialog.querySelector('#qe-canvas-slot').append(host);}
  dialog.hidden=false;document.documentElement.classList.add('qcp-editor-open');for(const el of document.body.children)if(el!==dialog&&el!==outline){backgroundInert.set(el,el.inert);el.inert=true;}
  // Moving a live iframe reloads its document, so reattach on its load event.
  const requested=Number(params.get('scene'));api.scene(preview&&params.has('scene')&&Number.isInteger(requested)&&requested>=-1&&requested<=4?requested:api.state().chapter,1);sync(true);dialog.querySelector('#qe-close').focus();
 }
 function close(){if(preview){commitFocused();clearTimeout(saveTimer);try{localStorage.setItem(storeKey,JSON.stringify({base:saved,book}));}catch{}location.href='./#how-it-works';return;}if(!active)return;endMarquee(true);active=false;outline.hidden=true;placeholder.replaceWith(host);dialog.hidden=true;for(const [el,inert] of backgroundInert)el.inert=inert;backgroundInert.clear();document.documentElement.classList.remove('qcp-editor-open','qcp-edit-freeze');frame.contentDocument?.documentElement?.classList.remove('qcp-edit-freeze');api.activate(false);sync(true);host.scrollIntoView({block:'center'});host.querySelector('button')?.focus({preventScroll:true});}
 async function init(){
  let loadingControls;
  if(preview){
   makeUI();dialog.hidden=false;dialog.setAttribute('aria-busy','true');loadingControls=[...dialog.querySelectorAll('button,input,select,textarea')].map(el=>[el,el.disabled]);loadingControls.forEach(([el])=>el.disabled=true);dialog.querySelector('#qe-scope').textContent='미리보기 준비 중…';dialog.querySelector('#qe-canvas-slot').append(preview);
   preview.style.width=preset.width+'px';
   await new Promise(resolve=>{preview.addEventListener('load',resolve,{once:true});preview.src='index.html?layout-preview=1&preview-revision='+Date.now();});
   sceneDocument=preview.contentDocument;sceneWindow=sceneDocument.defaultView;
  }
  host=sceneDocument.getElementById('qcp-explainer');api=host?.qcpLayoutEditor;if(!api)return;
  frame=sceneDocument.getElementById('qcp-task-frame');
  frame.addEventListener('load',()=>{attachDocument(frame.contentDocument);sync(true);});host.addEventListener('qcp:render',()=>sync());
  if(preview){sceneWindow.addEventListener('resize',()=>sync(true));new ResizeObserver(()=>{fitCanvas();positionOutline();}).observe(host);}
  window.addEventListener('resize',()=>sync(true));window.addEventListener('scroll',positionOutline,true);
  try{const response=await fetch(asset,{cache:'no-store'});if(response.ok)book=validate(await response.json());}catch{ /* An absent optional layout file leaves the original design intact. */ }
  saved=JSON.stringify(book);attachDocument(frame.contentDocument);
  if(local){const raw=drafts();if(raw)try{const draft=JSON.parse(raw);if(JSON.stringify(validate(JSON.parse(draft.base)))===saved)book=validate(draft.book);}catch{ /* Ignore corrupt or obsolete local drafts. */ }
   attachDocument(document);if(preview)attachDocument(sceneDocument);attachDocument(frame.contentDocument);
   if(preview){loadingControls.forEach(([el,disabled])=>el.disabled=disabled);dialog.removeAttribute('aria-busy');dialog.querySelector('#qe-save').textContent=JSON.stringify(book)===saved?'저장됨':'프로젝트에 저장';}
   if(preview||new URLSearchParams(location.search).get('edit')==='1')open();
  }sync(true);
 }
 init();
})();
