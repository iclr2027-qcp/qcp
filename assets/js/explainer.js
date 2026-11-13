/* An interactive explanation. Robot profiles and the training loop are illustrative. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),host=$('qcp-explainer');if(!host)return;
 // Small phones reuse the 390px composition, including its edited layout.
 const fitSmallMobile=()=>host.parentElement.style.setProperty('--qcp-mobile-scale',String(Math.min(1,innerWidth/390)));
 fitSmallMobile();window.addEventListener('resize',fitSmallMobile);
 const stage=$('qcp-stage'),frame=$('qcp-task-frame'),picker=$('qcp-quality-picker'),dialControls=$('qcp-knob-controls'),dial=$('qcp-quality-knob'),flow=$('qcp-token-flow'),board=$('qcp-learning-board'),closingBoard=$('qcp-closing-board'),timeline=$('qcp-timeline'),play=$('qcp-play'),replay=$('qcp-replay'),next=$('qcp-next'),previous=$('qcp-previous');
 const chapterButtons=[...host.querySelectorAll('[data-step]')],qualityButtons=[...picker.querySelectorAll('button')],segments=[...timeline.querySelectorAll('.qcp-progress-segment')],loop=host.querySelector('.qcp-loop-strip'),loopSteps=[...host.querySelectorAll('[data-loop]')];
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),clamp=v=>Math.max(0,Math.min(1,v)),ease=x=>{const t=clamp(x);return t*t*(3-2*t);};
 const chapters=[
  {title:'Choose the quality you care about.',description:'Choose a quality to condition the policy.',duration:11900},
  {title:'One policy. Your quality.',description:'Turn the dial to change how the robot moves.',duration:12000},
  {title:'What if you want even more?',description:'Fix the dial at the desired quality and collect successful rollouts.',duration:14100},
  {title:'Better experience. A wider range.',description:'Retraining expands the quality range beyond the best initial demo.',duration:10500},
  {title:'QCP',description:'Quality conditioning helps push the quality frontier through collection and retraining.',duration:8500}
 ];
 const introduction={title:'Introduction',description:'',duration:14600};
 const collectionStartsAt=4100,chooseSequenceDuration=8500,trainedCardAt=10000,trainedCardReveal=500;
 const trainedCard=$('qcp-trained-policy');
 const info=i=>i===-1?introduction:chapters[i];
 const qualities=[
  {name:'Speed',profile:['Measured pace','Brisk transfer','Quick pickup','Rapid cycling']},
  {name:'Smoothness',profile:['Jerky','Slightly jerky','Mostly smooth','Smooth']},
  null,
  {name:'Safety',profile:['Minimal clearance','Small clearance','Moderate clearance','Wide clearance']}
 ];
 let editorMode=false,collectionAdvanceWait=null,transitionTimer=null,transitionAnimations=[],policyTransfer=null,transitionHidden=[],snapshotSerial=0,closingRangeStart=0;
 // Keep the trajectories still: 2 s hold, .4 s copy change, 2 s Retrain QCP.
 const collectionAdvanceDelay=4400;
 let collectionSeekRequest=null,collectionSeekSerial=0,collectionCycle=0;
 let chapter=-1,selected=1,chosen=false,value=1,level=3,conditioned=false,elapsed=0,chooseWait=0,playing=!reduced.matches,visible=false,lastFrame=0,ready=false,lastState='',iteration=0,rollouts=[],rolloutSerial=0,restart=0,collectionComplete=false,dialTouched=false,controlPreview='high',introExamplesDuration=introduction.duration;
 function loadRobot(){if(!frame.hasAttribute('src'))frame.src='assets/interactive/franka.html?v=studio-91';}
 function robotState(force=false){
  flow.dataset.running=String(visible&&!document.hidden&&!reduced.matches&&(!chosen||playing));
  if(!ready)return;
  const collectionRevealed=chapter!==2||elapsed>=collectionStartsAt;
  const state={source:'qcp-story',type:'state',quality:chapter===-1?1:selected,level:chapter>=2?3:level,introTime:chapter===-1?Math.round(elapsed/20)/50:undefined,collectionSeek:chapter===2?collectionSeekRequest:null,mode:chapter===-1?'intro':['choose','control','collect','train','train'][chapter],iteration,restart,autoPreview:chapter===1&&!dialTouched&&!reduced.matches,active:visible&&!document.hidden&&chapter<3&&collectionRevealed,playing:collectionRevealed&&(chapter===-1?playing:!chosen?!reduced.matches:playing)};
  const key=JSON.stringify(state);if(force||key!==lastState){frame.contentWindow.postMessage(state,location.origin);lastState=key;}
 }
 window.addEventListener('message',event=>{
  if(event.source!==frame.contentWindow||event.origin!==location.origin||event.data?.source!=='qcp-franka')return;
  const v=event.data;if(v.type==='ready'){ready=true;if(Number.isFinite(v.introExamplesDuration)&&v.introExamplesDuration>0)introExamplesDuration=Math.min(introduction.duration,v.introExamplesDuration*1000);render();robotState(true);}
  if(v.type==='control-progress'&&chapter===1&&v.quality===selected&&v.level===level&&v.restart===restart&&Number.isFinite(v.fraction)){
   const fraction=clamp(v.fraction),progress=dialTouched?fraction:controlPreview==='done'?1:((controlPreview==='low'?1:0)+fraction)/2;
   elapsed=chapters[1].duration*progress;renderTimeline();
  }
  if(v.type==='control-complete'&&chapter===1&&!reduced.matches&&v.quality===selected&&v.level===level&&v.restart===restart){
   if(controlPreview==='high'){controlPreview='low';value=0;level=0;elapsed=chapters[1].duration/2;lastFrame=0;}
   else{controlPreview='done';elapsed=chapters[1].duration;}
   render();updatePlay();if(controlPreview==='done'&&playing){if(editorMode){playing=false;updatePlay();}else go(2);}
  }
  if(v.type==='collection-restart'&&chapter===2){elapsed=collectionStartsAt;seekCollectionAt(elapsed);playing=!reduced.matches;lastFrame=0;updateGate();render();updatePlay();}
  const currentCollection=chapter===2&&v.quality===selected&&v.restart===restart&&v.seekId===(collectionSeekRequest?.id??null);
  if(v.type==='collection-progress'&&currentCollection&&playing&&Number.isFinite(v.fraction)){
   collectionCycle=clamp(v.cycleProgress||0);elapsed=collectionStartsAt+clamp(v.fraction)*(chapters[2].duration-collectionStartsAt);renderDial(elapsed/chapters[2].duration);renderTimeline();
  }
  if(v.type==='collection-seeked'&&currentCollection){collectionCycle=clamp(v.cycleProgress||0);
   collectionComplete=v.trial===5;collectionAdvanceWait=null;if(collectionComplete)playing=false;
   render();updateGate();updatePlay();$('qcp-flow-status').textContent=`${v.trial} rollouts completed: ${v.kept} kept, ${v.excluded} excluded.`;
  }
  if(v.type==='collection-complete'&&currentCollection){if(!collectionComplete)collectionAdvanceWait=editorMode?null:0;collectionComplete=true;playing=false;elapsed=chapters[2].duration;render();updateGate();updatePlay();$('qcp-flow-status').textContent=`Collection complete: ${v.kept} kept, ${v.excluded} excluded from ${v.trial} rollouts. Relabel the accumulated experience and retrain QCP.`;}
  if(v.type==='rollout'&&currentCollection&&Number.isFinite(v.score)){
   rolloutSerial++;if(v.success){rollouts.push({id:'τ'+rolloutSerial,metric:String(v.metric).slice(0,40),score:v.score,trace:Array.isArray(v.trace)?v.trace.filter(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite)).slice(0,32):[],fresh:true,level:3});}
   $('qcp-flow-status').textContent=v.success?'Successful rollout collected. Its achieved quality will be used for relabeling.':v.demonstrationFailure?'Failure example excluded from replay.':'Failed rollout excluded from replay.';
  }
 });
 function updateGate(){
  next.disabled=chapter>0&&!conditioned;previous.disabled=chapter===-1;previous.style.visibility=chapter===-1?'hidden':'visible';
  const backName=['Intro','Choose','Control','Go beyond','Extend'][chapter]||'Intro';
  previous.lastElementChild.textContent=backName;previous.setAttribute('aria-label','Back to '+backName);
  $('qcp-next-label').textContent=chapter===-1?'Choose quality':['Continue','Go beyond','Relabel & train','Closing','Collect again'][chapter];
  host.dataset.chosen=String(chosen);$('qcp-select-prompt').dataset.awaiting=String(!chosen);$('qcp-select-label').textContent=chosen?`${qualities[selected].name} selected`:'Select a quality';
  chapterButtons.forEach(b=>b.disabled=Number(b.dataset.step)>0&&!conditioned);play.disabled=chapter!==-1&&(!chosen||(chapter===2&&collectionComplete));replay.disabled=chapter!==-1&&!chosen;
  timeline.setAttribute('aria-disabled',String(!conditioned&&chapter!==-1));host.dataset.conditioned=String(conditioned);
 }
 function updatePlay(){play.querySelector('path').setAttribute('d',playing?'M9 7v10M15 7v10':'M9 6l9 6-9 6Z');play.setAttribute('aria-label',playing?'Pause explanation':'Play explanation');play.setAttribute('aria-pressed',String(playing));robotState();}
 function selectChapter(index,time=0){
  if(index>0&&!conditioned)return;cancelTransition();collectionAdvanceWait=null;if(index!==2)collectionSeekRequest=null;const enteringControl=index===1&&chapter!==1;chapter=Math.max(-1,Math.min(chapters.length-1,index));elapsed=time;if(enteringControl&&!dialTouched){controlPreview='high';value=1;level=3;}
  document.getElementById('how-it-works').setAttribute('aria-label',chapter===-1?'QCP introduction':'How QCP works');document.getElementById('how-it-works').removeAttribute('aria-labelledby');
  const item=info(chapter);$('qcp-story-title').textContent=item.title;$('qcp-story-description').textContent=item.description;
  host.dataset.chapter=stage.dataset.chapter=String(chapter);picker.hidden=chapter!==0;dialControls.hidden=chapter<=0;flow.hidden=chapter!==0;loop.hidden=chapter<2||chapter===4;board.hidden=chapter!==3;closingBoard.hidden=chapter!==4;frame.hidden=chapter>=3;
  $('qcp-collect-intro').hidden=chapter!==2;
  chapterButtons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.step)===chapter)));dial.setAttribute('aria-disabled',String(chapter!==1));dial.tabIndex=chapter===1?0:-1;
  if(chapter===3)buildLearningBoard();if(chapter===4)buildClosingBoard();updateGate();render();
 }
 function returnToChoose(){collectionComplete=false;chosen=false;conditioned=false;chooseWait=0;playing=false;value=1;level=3;lastFrame=0;selectChapter(0);updatePlay();$('qcp-flow-status').textContent='Choose an execution quality. Smoothness will be selected after five seconds without a selection.';}
 function commitChapter(index){if(index===-1){playing=!reduced.matches;selectChapter(-1,reduced.matches?introduction.duration:0);lastFrame=0;updatePlay();return;}if(index===0){returnToChoose();return;}if(index>0&&!conditioned)return;if(index===4&&chapter!==4)closingRangeStart=chapter===3?clamp((Number(board.dataset.rangeEnd)-24)/124):0;if(index===2){collectionCycle=0;collectionComplete=false;collectionSeekRequest=null;rollouts.forEach(r=>r.fresh=false);restart++;}playing=!reduced.matches;selectChapter(index,index===0?chapters[0].duration:reduced.matches?chapters[Math.max(0,Math.min(chapters.length-1,index))].duration*.93:0);if(chapter===0)playing=false;lastFrame=0;updatePlay();}
 function cancelTransition(){
  clearTimeout(transitionTimer);transitionTimer=null;transitionAnimations.forEach(a=>a.cancel());transitionAnimations=[];policyTransfer?.remove();policyTransfer=null;transitionHidden.forEach(el=>el.removeAttribute('data-qcp-transition-hidden'));transitionHidden=[];delete host.dataset.transitioning;delete host.dataset.bridge;
 }
 function snapshotVisual(source){
  // Preserve the user's edited font, scale and placement in the moving visual.
  const references=new Map(),prefix='qcp-snapshot-'+(++snapshotSerial)+'-';
  const clone=source.cloneNode(true),originals=[source,...source.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];
  originals.forEach((el,i)=>{
   const style=el.ownerDocument.defaultView.getComputedStyle(el),copy=copies[i];
   for(const key of style)copy.style.setProperty(key,style.getPropertyValue(key));
   if(el.id){references.set(el.id,prefix+el.id);copy.id=prefix+el.id;}copy.removeAttribute('data-edit-id');copy.removeAttribute('data-qe-element');copy.removeAttribute('tabindex');
   copy.style.animation='none';copy.style.transition='none';copy.style.pointerEvents='none';
   if(el.tagName==='CANVAS'){
    copy.width=el.width;copy.height=el.height;copy.getContext('2d').drawImage(el,0,0);
   }
   if(el.tagName==='IFRAME'){
    // A visual copy must never load a second simulator or move the live iframe.
    const still=document.createElement('div');still.style.cssText=copy.style.cssText;
    const scene=el.contentDocument?.getElementById('scene');
    if(scene?.qcpCaptureFrame){scene.qcpCaptureFrame();still.append(snapshotVisual(scene));}
    copy.replaceWith(still);
   }
  });
  // Snapshot SVG gradients, markers and shadows stay self-contained.
  for(const el of [clone,...clone.querySelectorAll('*')])for(const attribute of [...el.attributes]){
   const value=attribute.value.replace(/url\((['"]?)[^()]*#([\w:.-]+)\1\)/g,(match,quote,id)=>references.has(id)?`url(#${references.get(id)})`:match);
   if(value!==attribute.value)el.setAttribute(attribute.name,value);
   if(attribute.name==='href'&&references.has(attribute.value.slice(1)))el.setAttribute('href','#'+references.get(attribute.value.slice(1)));
  }
  clone.setAttribute('aria-hidden','true');clone.inert=true;return clone;
 }
 function morphPolicyToDial(){
  const heading=host.querySelector('.qcp-story-heading'),bounds=host.getBoundingClientRect();
  const source=trainedCard.querySelector('.qcp-trained-mark'),sourceBounds=source.getBoundingClientRect(),sourceCircle=snapshotVisual(source);
  const transfer=document.createElement('div');transfer.className='qcp-policy-transition';transfer.setAttribute('aria-hidden','true');transfer.inert=true;
  const outgoing=document.createElement('div');outgoing.className='qcp-policy-outgoing';transfer.append(outgoing);
  // Keep the old robot frame intact; only the policy circle travels between scenes.
  for(const element of [heading,stage]){
   const rect=element.getBoundingClientRect(),visual=snapshotVisual(element);
   Object.assign(visual.style,{position:'absolute',left:rect.left-bounds.left-host.clientLeft+'px',top:rect.top-bounds.top-host.clientTop+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',transform:'none',translate:'none',scale:'none',rotate:'none'});
   visual.querySelector('.qcp-trained-mark')?.style.setProperty('opacity','0');outgoing.append(visual);
  }
  selectChapter(1);playing=false;updatePlay();
  const target=host.querySelector('.qcp-dial-wrap'),targetBounds=target.getBoundingClientRect(),hub=target.querySelector('.qcp-dial-hub'),hubBounds=hub.getBoundingClientRect();
  const targetVisual=snapshotVisual(target),morph=document.createElement('div');morph.className='qcp-policy-morph';
  Object.assign(morph.style,{left:targetBounds.left-bounds.left-host.clientLeft+'px',top:targetBounds.top-bounds.top-host.clientTop+'px',width:targetBounds.width+'px',height:targetBounds.height+'px'});
  Object.assign(targetVisual.style,{position:'absolute',inset:'0',margin:'0',translate:'none',transform:'none',scale:'none',rotate:'none',visibility:'visible'});
  const center={x:hubBounds.left+hubBounds.width/2,y:hubBounds.top+hubBounds.height/2},scale=sourceBounds.width/hubBounds.width;
  morph.style.transformOrigin=`${center.x-targetBounds.left}px ${center.y-targetBounds.top}px`;
  // The same disc grows continuously. The dial's rim, ticks and pointer form
  // around it while the policy symbol gently dissolves inside the hub.
  Object.assign(sourceCircle.style,{position:'absolute',left:center.x-targetBounds.left+'px',top:center.y-targetBounds.top+'px',width:sourceBounds.width+'px',height:sourceBounds.height+'px',margin:'0',translate:'-50% -50%',transform:`scale(${1/scale})`,transformOrigin:'center',scale:'none',rotate:'none',zIndex:'2',boxSizing:'border-box'});
  morph.append(targetVisual,sourceCircle);transfer.append(morph);policyTransfer=transfer;host.append(transfer);host.dataset.transitioning='policy';
  const duration=3000,options={duration,fill:'both'},dx=sourceBounds.left+sourceBounds.width/2-center.x,dy=sourceBounds.top+sourceBounds.height/2-center.y;
  const travel=morph.animate([
   {transform:`translate(${dx}px,${dy}px) scale(${scale})`},
   {offset:.12,transform:`translate(${dx}px,${dy}px) scale(${scale})`,easing:'cubic-bezier(.4,0,.2,1)'},
   {offset:.9,transform:'translate(0,0) scale(1)'},{transform:'translate(0,0) scale(1)'}
  ],options);
  const fade=(el,from,to)=>el.animate([{opacity:0},{offset:from,opacity:0},{offset:to,opacity:1},{opacity:1}],options);
  transitionAnimations=[travel,
   outgoing.animate([{opacity:1},{offset:.12,opacity:1},{offset:.44,opacity:0},{opacity:0}],options),
   fade(targetVisual,.10,.66),
   sourceCircle.animate([{opacity:1},{offset:.46,opacity:1},{offset:.77,opacity:0},{opacity:0}],options),
   sourceCircle.firstElementChild.animate([{opacity:1},{offset:.23,opacity:1},{offset:.55,opacity:0},{opacity:0}],options),
   fade(targetVisual.querySelector('.qcp-dial-hint'),.78,.98),
   fade(host.querySelector('.qcp-world'),.44,.86),fade(heading,.52,.88),fade($('qcp-dial-quality'),.65,.93)
  ];
  const pointer=targetVisual.querySelector('.qcp-dial-pointer'),ring=targetVisual.querySelector('.qcp-quality-knob');
  transitionAnimations.push(pointer.animate([{opacity:0,transform:'rotate(-104deg)'},{offset:.35,opacity:0,transform:'rotate(-104deg)'},{offset:.88,opacity:1,transform:'rotate(104deg)'},{opacity:1,transform:'rotate(104deg)'}],options));
  // Resolve the conic fill progressively instead of fading in a finished dial.
  const formDial=()=>{
   if(policyTransfer!==transfer)return;
   const progress=ease(((travel.currentTime||0)/duration-.24)/.62),fill=208*progress;
   ring.style.backgroundImage=`conic-gradient(from 256deg,#4b75a8 0deg ${fill}deg,#e5ebf3 ${fill}deg 208deg,transparent 208deg)`;
   requestAnimationFrame(formDial);
  };formDial();
  $('qcp-flow-status').textContent='The trained policy becomes a quality dial. Turn it to control execution quality.';
  travel.finished.then(()=>{
   if(policyTransfer!==transfer)return;
   cancelTransition();playing=!reduced.matches;lastFrame=0;render();updatePlay();
  }).catch(()=>{});
 }
 function transitionPolicy(){
  const alreadyShown=elapsed>=trainedCardAt+trainedCardReveal;
  playing=false;elapsed=chapters[0].duration;render();updatePlay();host.dataset.transitioning='policy-ready';
  if(!alreadyShown)transitionAnimations=[trainedCard.animate([{opacity:0,transform:'translateY(9px)'},{opacity:1,transform:'translateY(0)'}],{duration:450,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'})];
  const delay=alreadyShown?220:1250;
  transitionTimer=setTimeout(morphPolicyToDial,delay);
 }
 // Shared objects carry the explanation between adjacent chapters.
 function hideDuringTransition(elements){
  for(const el of elements){el.setAttribute('data-qcp-transition-hidden','');transitionHidden.push(el);}
 }
 function captureTransition(){
  playing=false;lastFrame=0;updatePlay();
  const bounds=host.getBoundingClientRect(),origin={x:bounds.left+host.clientLeft,y:bounds.top+host.clientTop};
  const layer=document.createElement('div'),outgoing=document.createElement('div');layer.className='qcp-scene-transition';outgoing.className='qcp-scene-outgoing';layer.append(outgoing);layer.inert=true;layer.setAttribute('aria-hidden','true');
  const heading=host.querySelector('.qcp-story-heading'),elements=getComputedStyle(heading).display==='contents'?[stage,previous,next]:[heading,stage];
  for(const element of elements){
   const rect=element.getBoundingClientRect();if(!rect.width||!rect.height)continue;
   const visual=snapshotVisual(element);Object.assign(visual.style,{position:'absolute',left:rect.left-origin.x+'px',top:rect.top-origin.y+'px',width:rect.width+'px',height:rect.height+'px',margin:'0',transform:'none',translate:'none',scale:'none',rotate:'none'});outgoing.append(visual);
  }
  return {layer,outgoing,origin};
 }
 function dialSnapshot(index){
  if(index<3){
   const element=host.querySelector('.qcp-dial-wrap'),visual=snapshotVisual(element),rect=element.getBoundingClientRect();
   visual.querySelector('.qcp-dial-hint')?.remove();Object.assign(visual.style,{position:'absolute',inset:'0',margin:'0',translate:'none',transform:'none',scale:'none',rotate:'none'});
   return {visual,rect,elements:[element],angle:parseFloat(dial.style.getPropertyValue('--angle'))||0,fill:parseFloat(dial.style.getPropertyValue('--fill'))||0};
  }
  const root=index===3?board:closingBoard,selector=index===3?'[data-edit-group="dial"]':'[data-edit-group="sr-quality-dial"]',group=root.querySelector(selector),svg=root.querySelector('svg');
  const elements=[...group.children].filter(el=>el.tagName!=='text'),boxes=elements.map(el=>el.getBoundingClientRect());
  const left=Math.min(...boxes.map(r=>r.left)),top=Math.min(...boxes.map(r=>r.top)),right=Math.max(...boxes.map(r=>r.right)),bottom=Math.max(...boxes.map(r=>r.bottom));
  const rect={left,top,width:right-left,height:bottom-top},svgRect=svg.getBoundingClientRect(),visual=document.createElement('div'),copy=snapshotVisual(svg),copyGroup=copy.querySelector(selector);
  for(const child of [...copy.children])if(child.tagName!=='defs'&&child!==copyGroup)child.remove();copyGroup.querySelectorAll('text').forEach(el=>el.remove());
  Object.assign(copy.style,{position:'absolute',left:svgRect.left-left+'px',top:svgRect.top-top+'px',width:svgRect.width+'px',height:svgRect.height+'px',overflow:'visible',transform:'none',translate:'none'});
  Object.assign(visual.style,{position:'absolute',inset:'0',width:rect.width+'px',height:rect.height+'px'});visual.append(copy);
  return {visual,rect,elements,angle:index===3?Number(board.dataset.rangeEnd):24,center:index===3?[learning.cx,learning.cy]:[closing.cx,closing.cy]};
 }
 function morphShared(bridge,from,to,duration,fadeStart=.25,fadeEnd=.8){
  const holder=document.createElement('div'),incoming=document.createElement('div');holder.className='qcp-shared-object';
  Object.assign(holder.style,{left:from.rect.left-bridge.origin.x+'px',top:from.rect.top-bridge.origin.y+'px',width:from.rect.width+'px',height:from.rect.height+'px'});
  Object.assign(incoming.style,{position:'absolute',inset:'0',width:to.rect.width+'px',height:to.rect.height+'px',transformOrigin:'0 0',transform:`scale(${from.rect.width/to.rect.width},${from.rect.height/to.rect.height})`});
  incoming.append(to.visual);holder.append(from.visual,incoming);bridge.layer.append(holder);
  const options={duration,fill:'both'},move=holder.animate([{transform:'translate(0,0) scale(1)',easing:'cubic-bezier(.4,0,.2,1)'},{transform:`translate(${to.rect.left-from.rect.left}px,${to.rect.top-from.rect.top}px) scale(${to.rect.width/from.rect.width},${to.rect.height/from.rect.height})`}],options);
  transitionAnimations.push(move,from.visual.animate([{opacity:1},{offset:fadeStart,opacity:1},{offset:fadeEnd,opacity:0},{opacity:0}],options),incoming.animate([{opacity:0},{offset:fadeStart,opacity:0},{offset:fadeEnd,opacity:1},{opacity:1}],options));
  hideDuringTransition(to.elements);return move;
 }
 function setBridgeDial(snapshot,angle,fill){
  const pointer=snapshot.visual.querySelector('.qcp-dial-pointer'),needle=snapshot.visual.querySelector('.qcp-shared-needle');
  if(pointer)pointer.style.transform=`rotate(${angle}deg)`;
  if(needle){needle.style.transformBox='view-box';needle.style.transformOrigin=snapshot.center.join('px ')+'px';needle.style.transform=`rotate(${angle}deg)`;}
  const ring=snapshot.visual.querySelector('.qcp-quality-knob');if(ring)ring.style.backgroundImage=`conic-gradient(from 256deg,#4b75a8 0deg ${fill}deg,#e5ebf3 ${fill}deg 208deg,transparent 208deg)`;
 }
 function mountTransition(bridge,name,duration,onFrame){
  policyTransfer=bridge.layer;host.append(bridge.layer);host.dataset.transitioning='bridge';host.dataset.bridge=name;
  const options={duration,fill:'both'},clock=bridge.outgoing.animate([{opacity:1},{offset:.12,opacity:1},{offset:.65,opacity:0},{opacity:0}],options);
  transitionAnimations.push(clock);
  // Change sentences in sequence rather than superimposing two chapters' copy.
  for(const el of bridge.outgoing.querySelectorAll('.qcp-story-heading,.qcp-knob-controls,.qcp-collect-intro,.intro-message-panel,.collection-complete,.collection-rate,.scene-label,.qcp-dial-readout,.qcp-learning-board text,.qcp-step-arrow'))transitionAnimations.push(el.animate([{opacity:parseFloat(el.style.opacity)||0},{offset:.26,opacity:0},{opacity:0}],options));
  for(const el of bridge.outgoing.querySelectorAll('.qcp-world'))transitionAnimations.push(el.animate([{opacity:parseFloat(el.style.opacity)||0},{offset:.38,opacity:0},{opacity:0}],options));
  const heading=host.querySelector('.qcp-story-heading'),elements=getComputedStyle(heading).display==='contents'?[stage,previous,next]:[stage,heading];
  for(const el of elements)transitionAnimations.push(el.animate([{opacity:0},{offset:.34,opacity:0},{offset:.86,opacity:1},{opacity:1}],options));
  const advance=()=>{if(policyTransfer!==bridge.layer)return;onFrame?.(clamp((clock.currentTime||0)/duration));requestAnimationFrame(advance);};advance();
  clock.finished.then(()=>{if(policyTransfer!==bridge.layer)return;cancelTransition();playing=chapter!==0&&!reduced.matches;lastFrame=0;render();updatePlay();}).catch(()=>{});
 }
 function successfulRolloutSnapshots(){
  const outer=frame.getBoundingClientRect(),doc=frame.contentDocument;if(!doc)return[];
  const sx=outer.width/(doc.documentElement.clientWidth||outer.width),sy=outer.height/(doc.documentElement.clientHeight||outer.height);
  return [...doc.querySelectorAll('#rollouts .success')].map(el=>{const r=el.getBoundingClientRect();return{visual:snapshotVisual(el),rect:{left:outer.left+r.left*sx,top:outer.top+r.top*sy,width:r.width*sx,height:r.height*sy}};});
 }
 function transitionDialChapter(index){
  const sourceChapter=chapter,from=dialSnapshot(chapter),badges=chapter===2?successfulRolloutSnapshots():[],bridge=captureTransition();
  if(chapter<3)bridge.outgoing.querySelectorAll('.qcp-dial-wrap').forEach(el=>el.style.opacity='0');
  else bridge.outgoing.querySelectorAll('[data-edit-group="dial"]>*:not(text)').forEach(el=>el.style.opacity='0');
  if(badges.length)bridge.outgoing.querySelectorAll('.qcp-world .success').forEach(el=>el.style.opacity='0');
  commitChapter(index);playing=false;lastFrame=0;
  if(index===3&&badges.length){elapsed=chapters[3].duration*.08;render();}
  updatePlay();const to=dialSnapshot(index),duration=index===3?2200:index===4?1800:1600;
  morphShared(bridge,from,to,duration);
  if(badges.length){
   const target=learning.rows[0].dot.getBoundingClientRect(),cx=target.left+target.width/2,cy=target.top+target.height/2;
   badges.forEach((badge,i)=>{
    const el=badge.visual;Object.assign(el.style,{position:'absolute',left:badge.rect.left-bridge.origin.x+'px',top:badge.rect.top-bridge.origin.y+'px',width:badge.rect.width+'px',height:badge.rect.height+'px',margin:'0',transform:'none',translate:'none',transformOrigin:'center'});bridge.layer.append(el);
    const dx=cx-badge.rect.left-badge.rect.width/2+(i-(badges.length-1)/2)*6,dy=cy-badge.rect.top-badge.rect.height/2;
    transitionAnimations.push(el.animate([{opacity:1,transform:'translate(0,0) scale(1)'},{offset:.12+i*.025,opacity:1,transform:'translate(0,0) scale(1)'},{offset:.55+i*.025,opacity:1,transform:`translate(${dx}px,${dy}px) scale(.16)`},{offset:.76,opacity:0,transform:`translate(${dx}px,${dy}px) scale(.08)`},{opacity:0}],{duration,fill:'both',easing:'cubic-bezier(.35,0,.25,1)'}));
   });
  }
  mountTransition(bridge,`${sourceChapter}-${index}`,duration,p=>{
   if(index===3&&badges.length){elapsed=chapters[3].duration*(.08+.125*ease((p-.48)/.52));render();loopSteps.forEach((el,i)=>el.classList.toggle('is-active',i===(p<.25?1:p<.48?2:3)));}
   const end=index===3?Number(board.dataset.rangeEnd):to.angle,t=ease(p),angle=from.angle+(end-from.angle)*t,fill=from.fill===undefined?208:from.fill+(208-from.fill)*t;
   setBridgeDial(from,angle,fill);setBridgeDial(to,angle,fill);
   if(index===3){const range=to.visual.querySelector('.qcp-shared-range');if(range){range.setAttribute('d',learning.range.getAttribute('d'));range.style.stroke=learning.range.getAttribute('stroke');}}
  });
 }
 function transitionIntro(){
  const doc=frame.contentDocument,scene=doc?.getElementById('scene'),card=doc?.querySelector('.intro-demo');
  if(!scene?.qcpCaptureFrame||!card)return false;
  const outer=frame.getBoundingClientRect(),r=card.getBoundingClientRect();scene.qcpCaptureFrame();
  const sx=outer.width/doc.documentElement.clientWidth,sy=outer.height/doc.documentElement.clientHeight;
  const source={left:outer.left+r.left*sx,top:outer.top+r.top*sy,width:r.width*sx,height:r.height*sy};
  const image=snapshotVisual(scene),visual=document.createElement('div');
  Object.assign(visual.style,{position:'absolute',left:'0',top:'0',width:r.width+'px',height:r.height+'px',overflow:'hidden',transformOrigin:'0 0'});
  Object.assign(image.style,{position:'absolute',left:-r.left+'px',top:-r.top+'px'});visual.append(image);
  const bridge=captureTransition();bridge.outgoing.querySelectorAll('canvas,.intro-demo').forEach(el=>el.style.opacity='0');
  commitChapter(0);playing=false;updatePlay();
  const world=host.querySelector('.qcp-world'),target=world.getBoundingClientRect(),duration=1500,options={duration,fill:'both'};
  const holder=document.createElement('div');holder.className='qcp-workspace-transition';
  Object.assign(holder.style,{position:'absolute',left:source.left-bridge.origin.x+'px',top:source.top-bridge.origin.y+'px',width:source.width+'px',height:source.height+'px',overflow:'hidden',borderRadius:'12px',background:'#f5f6f7',transformOrigin:'0 0'});
  holder.append(visual);bridge.layer.append(holder);
  // Resize the clipping window, not the scene's aspect ratio. Both axes of the
  // frozen robot scene use one scale so people and glasses cannot get squeezed.
  const endScale=target.height/r.height,endX=(target.width-r.width*endScale)/2;
  transitionAnimations.push(
   holder.animate([{width:source.width+'px',height:source.height+'px',transform:'translate(0,0)',easing:'cubic-bezier(.4,0,.2,1)'},{width:target.width+'px',height:target.height+'px',transform:`translate(${target.left-source.left}px,${target.top-source.top}px)`}],options),
   visual.animate([{transform:`scale(${sx})`,easing:'cubic-bezier(.4,0,.2,1)'},{transform:`translateX(${endX}px) scale(${endScale})`}],options),
   holder.animate([{opacity:1},{offset:.48,opacity:1},{offset:.94,opacity:0},{opacity:0}],options),
   world.animate([{opacity:0},{offset:.48,opacity:0},{offset:.94,opacity:1},{opacity:1}],options)
  );
  for(const el of image.querySelectorAll('.intro-demo>*:not(canvas),.controls'))transitionAnimations.push(el.animate([{opacity:1},{offset:.24,opacity:0},{opacity:0}],options));
  mountTransition(bridge,'intro-choose',duration);return true;
 }
 function go(index){
  if(index>0&&!conditioned)return;
  cancelTransition();collectionAdvanceWait=null;
  if(editorMode||reduced.matches||index===chapter){commitChapter(index);return;}
  if(chapter===0&&index===1){transitionPolicy();return;}
  // On stacked layouts, crossfade instead of carrying a wide camera snapshot
  // across two differently arranged panels and their navigation controls.
  if(chapter===-1&&index===0&&!matchMedia('(max-width:900px)').matches&&transitionIntro())return;
  if(chapter>=1&&chapter<=3&&index===chapter+1){transitionDialChapter(index);return;}
  const direction=index>chapter?1:-1,copy=host.querySelector('.qcp-story-copy');
  playing=false;lastFrame=0;updatePlay();host.dataset.transitioning='out';
  transitionAnimations=[stage.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:`translateX(${-direction*8}px)`}],{duration:140,easing:'ease-in',fill:'forwards'}),copy.animate([{opacity:1},{opacity:0}],{duration:140,fill:'forwards'}),loop.animate([{opacity:1},{opacity:0}],{duration:140,fill:'forwards'})];
  transitionTimer=setTimeout(()=>{
   commitChapter(index);host.dataset.transitioning='in';
   transitionAnimations=[stage.animate([{opacity:0,transform:`translateX(${direction*10}px)`},{opacity:1,transform:'translateX(0)'}],{duration:360,easing:'cubic-bezier(.22,1,.36,1)'}),copy.animate([{opacity:0},{opacity:1}],{duration:300}),loop.animate([{opacity:0},{opacity:1}],{duration:300})];
   transitionAnimations[0].finished.then(()=>{delete host.dataset.transitioning;}).catch(()=>{});
  },140);
 }
 function chooseQuality(index){cancelTransition();if(editorMode)index=1;dialTouched=false;controlPreview='high';selected=index;chosen=true;conditioned=false;elapsed=reduced.matches?chapters[0].duration:0;value=1;level=3;iteration=0;rollouts=[];rolloutSerial=0;qualityButtons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.quality)===index)));$('qcp-flow-status').textContent=`${qualities[index].name} selected. Encoding the quality token.`;playing=!reduced.matches;lastFrame=0;loadRobot();updateGate();updatePlay();render();}
 qualityButtons.forEach(button=>{
  const i=Number(button.dataset.quality);
  button.addEventListener('click',()=>chooseQuality(i));
 });
 function setDial(request){if(chapter!==1)return;dialTouched=true;controlPreview='manual';value=clamp(request);level=Math.min(3,Math.round(value*3));elapsed=0;playing=!reduced.matches;lastFrame=0;updatePlay();render();}
 let turning=false,startY=0,startValue=0;
 dial.addEventListener('pointerdown',event=>{if(chapter!==1||event.button!==0)return;event.preventDefault();turning=true;startY=event.clientY;startValue=value;dial.focus({preventScroll:true});dial.setPointerCapture(event.pointerId);pointToDial(event);});
 function pointToDial(event){const r=dial.getBoundingClientRect(),dx=event.clientX-r.left-r.width/2,dy=event.clientY-r.top-r.height/2;if(Math.hypot(dx,dy)<r.width*.16){setDial(startValue+(startY-event.clientY)/150);return;}const angle=Math.atan2(dx,-dy)*180/Math.PI;setDial((angle+104)/208);}
 dial.addEventListener('pointermove',event=>{if(turning)pointToDial(event);});['pointerup','pointercancel','lostpointercapture'].forEach(type=>dial.addEventListener(type,()=>turning=false));
 dial.addEventListener('keydown',event=>{const requests={ArrowLeft:value-1/3,ArrowDown:value-1/3,ArrowRight:value+1/3,ArrowUp:value+1/3,Home:0,End:1};if(event.key in requests){event.preventDefault();setDial(requests[event.key]);}});
 function renderDial(p){
  const q=qualities[selected??1];$('qcp-dial-quality').textContent=q.name+'\nQuality Dial';
  let angle=-104+value*208,fill=value*208;
  if(chapter===1)$('qcp-behavior-name').textContent=q.profile[level];
  if(chapter===2){
   // Push into the stop, rattle against it, then release and try again.
   // This is a visual cue only: collection remains conditioned on level 3.
   const t=elapsed<collectionStartsAt?(elapsed%2800)/1000:collectionCycle*2.8;let pressure=0,recoil=0,state='approach';
   if(reduced.matches||collectionComplete){state='held';}
   else if(t<.65){recoil=8*(1-ease(t/.65));}
   else if(t<1.4){pressure=1;recoil=2.8*Math.abs(Math.sin((t-.65)*36));state='blocked';}
   else if(t<1.85){const release=ease((t-1.4)/.45);pressure=1-release;recoil=8*release;state='recoil';}
   else{recoil=8;state='reset';}
   angle=104-recoil;fill=208;
   dialControls.style.setProperty('--limit-pressure',pressure.toFixed(3));
   dialControls.style.setProperty('--limit-push',(14*pressure).toFixed(2)+'deg');
   dialControls.dataset.limitState=state;
   $('qcp-behavior-name').textContent='';const message=$('qcp-limit-message');if(message.dataset.quality!==String(selected)){message.dataset.quality=String(selected);message.innerHTML='<span data-edit-id="limit-line-1">Want it even</span><br><span data-edit-id="limit-line-2">'+(selected===0?'faster?':selected===3?'safer?':'smoother?')+'</span>';}}
  if(chapter===3){const expanded=ease((p-.76)/.2);angle=104+42*expanded;fill=208+42*expanded;$('qcp-behavior-name').textContent=expanded>.6?'Range expanded':'Learning…';}
  dial.style.setProperty('--angle',angle+'deg');dial.style.setProperty('--fill',fill+'deg');dial.setAttribute('aria-valuenow',String(Math.round(value*100)));dial.setAttribute('aria-valuetext',`${q.name}: ${q.profile[level]}`);
 }
 const NS='http://www.w3.org/2000/svg',blue='#416fa6',ink='#344f71';
 const node=(tag,attrs,parent,text)=>{const el=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>el.setAttribute(k,v));if(text!==undefined)el.textContent=text;parent.append(el);return el;};
 let learning={};
 function buildLearningBoard(){
  const mobile=matchMedia('(max-width:560px)').matches,tablet=!mobile&&matchMedia('(max-width:700px)').matches,W=mobile?330:tablet?600:800,H=mobile?440:tablet?280:240;
  const ink='#424b55',muted='#657487',accent='#315f96';
  board.replaceChildren();board.dataset.source='illustrative';
  const svg=node('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Illustrative progression: five retraining iterations expand the quality dial and move the quality distribution beyond the best initial demonstration. Curves illustrate the idea, not measured experiment results.'},board);
  const text=(value,x,y,size=14,color=ink,anchor='middle',parent=svg)=>node('text',{x,y,'font-size':size,fill:color,'font-weight':500,'text-anchor':anchor},parent,value);
  const defs=node('defs',{},svg);
  const gradient=node('radialGradient',{id:'growth-dial-face',cx:'35%',cy:'28%',r:'80%'},defs);
  [['0%','#ffffff'],['65%','#f3f4f6'],['100%','#e2e6eb']].forEach(([offset,color])=>node('stop',{offset,'stop-color':color},gradient));
  const shadow=node('filter',{id:'growth-shadow',x:'-30%',y:'-30%',width:'160%',height:'160%'},defs);
  node('feDropShadow',{dx:0,dy:3,stdDeviation:3,'flood-color':'#455467','flood-opacity':.12},shadow);
  const cx=mobile?82:tablet?84:126,cy=mobile?82:tablet?158:146,r=mobile?43.5:tablet?47:51,outer=r+4;
  const point=(a,rad=outer)=>{const t=(a-90)*Math.PI/180;return[cx+rad*Math.cos(t),cy+rad*Math.sin(t)];};
  const arc=(from,to)=>{const a=point(from),b=point(to);return `M${a[0]} ${a[1]}A${outer} ${outer} 0 ${to-from>180?1:0} 1 ${b[0]} ${b[1]}`;};
  const dialTitle=text(qualities[selected].name,mobile?224:tablet?84:126,mobile?57:tablet?52:33,mobile?23:tablet?22:24,'#202124');
  dialTitle.setAttribute('font-weight',600);dialTitle.setAttribute('letter-spacing','-.035em');
  node('tspan',{x:mobile?224:tablet?84:126,dy:'1.16em'},dialTitle,'Quality Dial');
  const outerTicks=node('g',{'data-edit-id':'outer-ticks','data-edit-label':'바깥 눈금','data-edit-collapsed':''},svg);
  for(let a=-104;a<=152;a+=16){const p=point(a,outer+7),q=point(a,outer+11);node('path',{d:`M${p[0]} ${p[1]}L${q[0]} ${q[1]}`,stroke:'#cbd1d8','stroke-width':1.1,'stroke-linecap':'round'},outerTicks);}
  node('path',{'data-edit-id':'future-range','data-edit-label':'확장 가능 범위 · 점선',d:arc(-104,152),fill:'none',stroke:'#b8cde6','stroke-width':2,'stroke-dasharray':'3 5','stroke-linecap':'round'},svg);
  node('path',{'data-edit-id':'initial-range','data-edit-label':'초기 품질 범위',d:arc(-104,24),fill:'none',stroke:'#86a8d4','stroke-width':7,'stroke-linecap':'round'},svg);
  const range=node('path',{class:'qcp-shared-range','data-edit-id':'expanded-range','data-edit-label':'확장된 품질 범위',d:arc(24,24),fill:'none',stroke:'#5f86b8','stroke-width':7,'stroke-linecap':'round'},svg);
  node('circle',{cx,cy,r,fill:'#eef2f7',stroke:'#b7c6d8','stroke-width':1,filter:'url(#growth-shadow)'},svg);
  const innerTicks=node('g',{'data-edit-id':'inner-ticks','data-edit-label':'다이얼 눈금','data-edit-collapsed':''},svg);
  for(let a=0;a<360;a+=4){const p=point(a,r-2),q=point(a,r-6);node('path',{d:`M${p[0]} ${p[1]}L${q[0]} ${q[1]}`,stroke:'#cbd5e0','stroke-width':1},innerTicks);}
  node('circle',{cx,cy,r:r-7,fill:'url(#growth-dial-face)',stroke:'#d9e1eb','stroke-width':1},svg);
  const needle=node('path',{class:'qcp-shared-needle','data-edit-id':'needle','data-edit-label':'다이얼 바늘',d:`M${cx} ${cy-r+13}V${cy-r+34}`,stroke:'#315f96','stroke-width':4,'stroke-linecap':'round',transform:`rotate(24 ${cx} ${cy})`},svg);
  const tip=node('circle',{'data-edit-id':'range-tip','data-edit-label':'범위 끝점',cx:point(24)[0],cy:point(24)[1],r:0,fill:'#315f96',stroke:'#fff','stroke-width':1.5},svg);
  const iterationLabel=text('Initial range',mobile?224:tablet?84:126,mobile?118:tablet?244:230,14,'#6b7889');
  const dialParts=[...svg.children].filter(el=>el.tagName!=='defs'),dialGroup=node('g',{'data-edit-group':'dial','aria-label':'Quality range dial'},svg);dialParts.forEach(el=>dialGroup.append(el));
  if(mobile)node('path',{d:'M18 157H312',stroke:'#e6e9ee','stroke-width':1},svg);
  else node('path',{d:tablet?'M172 36V250':'M258 24V219',stroke:'#e6e9ee','stroke-width':1},svg);

  const chartStart=svg.children.length;
  const left=mobile?18:tablet?188:292,right=mobile?312:tablet?588:787,plotWidth=right-left,baseline=mobile?394:tablet?224:202,plotTop=mobile?246:tablet?84:66;
  const axisY=mobile?411:tablet?242:218,best=.48,reverse=selected===3;
  const x=v=>left+(reverse?1-v:v)*plotWidth,bestX=x(best);
  const titleX=(left+right)/2,titleY=mobile?188:tablet?46:31;
  const title=text(mobile?'Explore beyond':'Explore beyond the initial best',titleX,titleY,mobile?22:tablet?22:24,'#294f80');
  title.setAttribute('font-weight',700);title.setAttribute('letter-spacing','-.025em');
  if(mobile)node('tspan',{x:titleX,dy:'1.12em'},title,'the initial best');
  // Retain this empty text slot so saved editor element IDs stay stable.
  text('',right,mobile?182:25,11.5,muted,'end');
  const surpass=node('rect',{'data-edit-id':'surpassed-area','data-edit-label':'초기 최고 품질을 넘는 영역',x:reverse?bestX:left,y:plotTop,width:Math.abs(x(0)-bestX),height:baseline-plotTop,rx:6,fill:'#eaf1fa',opacity:0},svg);
  const amplitude=spread=>Math.min(mobile?138:tablet?128:124,(mobile?76:70)*.10/spread);
  const density=(mean,spread)=>{
   const lo=Math.max(0,mean-3*spread),hi=Math.min(1,mean+3*spread),height=amplitude(spread);
   let d=`M${x(lo)} ${baseline}`;
   for(let i=0;i<=80;i++){const u=lo+(hi-lo)*i/80,z=(u-mean)/spread;d+=`L${x(u).toFixed(2)} ${(baseline-height*Math.exp(-.5*z*z)).toFixed(2)}`;}
   return d+`L${x(hi)} ${baseline}Z`;
  };
  const peakLabel=(name,color,i,mean,spread)=>{
   // Preserve editor IDs, but anchor each label to its own distribution peak.
   const group=node('g',{'data-edit-id':`legend-${i}`,'data-edit-label':`${name} 봉우리 표시`},svg);
   text(name,x(mean),baseline-amplitude(spread)-9,mobile?12:12.5,color,'middle',group);return group;
  };
  const initialLabel=peakLabel('Initial','#8e9cad',0,.78,.10);
  node('path',{'data-edit-id':'initial-curve','data-edit-label':'Initial 분포 곡선',d:density(.78,.10),fill:'#dce2e9','fill-opacity':.30,stroke:'#9baaba','stroke-width':1.5,'stroke-dasharray':'4 3','stroke-linejoin':'round'},svg);
  const means=[.54,.42,.31,.21,.12],spreads=[.12,.11,.09,.07,.055],colors=['#8ba8cb','#6e93bf','#527fb1','#3c6ca3','#28598f'];
  const rows=means.map((mean,i)=>{
   const label=peakLabel(`Iter${i+1}`,colors[i],i+1,mean,spreads[i]),group=node('g',{opacity:0,'data-growth-row':i+1},svg);
   const curve=node('path',{'data-edit-id':`iteration-${i+1}-curve`,'data-edit-label':`Iter${i+1} 분포 곡선`,d:density(.78,.10),fill:colors[i],'fill-opacity':.14,stroke:colors[i],'stroke-width':1.8,'stroke-linejoin':'round'},group);
   const dot=node('circle',{'data-edit-id':`iteration-${i+1}-peak`,'data-edit-label':`Iter${i+1} 정점`,cx:x(.78),cy:baseline-amplitude(.10),r:2.6,fill:colors[i]},group);
   return {group,label,curve,dot,mean,spread:spreads[i]};
  });
  node('path',{'data-edit-id':'best-reference','data-edit-label':'Best initial demo 기준선',d:`M${bestX} ${plotTop}V${baseline+1}`,stroke:'#858f9c','stroke-width':1.5,'stroke-dasharray':'4 5'},svg);
  text('Best initial demo',bestX,plotTop-9,12.5,'#6c7684','middle');
  const axisLeft=left+plotWidth*.18,axisRight=right-plotWidth*.18,arrowX=reverse?axisRight:axisLeft;
  const arrowHead=reverse?`M${arrowX-5} ${axisY-3}l5 3-5 3`:`M${arrowX+5} ${axisY-3}l-5 3 5 3`;
  // One path keeps the line and its rounded arrowhead aligned when edited.
  node('path',{'data-edit-id':'quality-axis','data-edit-label':'품질 방향 화살표',d:`M${axisLeft} ${axisY}H${axisRight}${arrowHead}`,fill:'none',stroke:'#8fa1b7','stroke-width':1.4,'stroke-linecap':'round','stroke-linejoin':'round'},svg);
  text(selected===0?'Faster execution':selected===3?'More clearance':'Lower action jerk',(left+right)/2,mobile?432:tablet?263:235,13,'#697d87');
  const chartParts=[...svg.children].slice(chartStart),chartGroup=node('g',{'data-edit-group':'distribution','aria-label':'Quality distributions'},svg);chartParts.forEach(el=>chartGroup.append(el));
  learning={mobile,title,range,needle,tip,iterationLabel,cx,cy,arc,point,rows,density,amplitude,baseline,x,surpass,accent,initialLabel};
 }
 function renderLearning(p){
  const l=learning;if(!l.title)return;
  let steps=0,current=0,bestMean=.78;
  l.rows.forEach((row,i)=>{
   const t=ease((p-.08-i*.15)/.125);steps+=t;if(t>0)current=i+1;
   const mean=.78+(row.mean-.78)*t,spread=.10+(row.spread-.10)*t;bestMean=Math.min(bestMean,mean);
   row.moving=t>0&&t<1;row.peakX=l.x(mean);row.peakY=l.baseline-l.amplitude(spread);
   row.group.setAttribute('opacity',t===0?0:Math.min(1,t*4));
   row.curve.setAttribute('d',l.density(mean,spread));
   row.curve.setAttribute('fill-opacity',t<1?.16:.08);
   // Follow the moving peak, retaining the user's final label placement.
   row.label.setAttribute('transform',`translate(${l.x(mean)-l.x(row.mean)} ${l.amplitude(row.spread)-l.amplitude(spread)})`);
   row.dot.setAttribute('cx',l.x(mean));row.dot.setAttribute('cy',l.baseline-l.amplitude(spread));row.dot.setAttribute('opacity',t<1?1:0);
  });
  const active=l.rows[current-1],nearActive=(x,y)=>active?.moving&&Math.abs(x-active.peakX)<34&&Math.abs(y-active.peakY)<16;
  l.initialLabel.setAttribute('opacity',nearActive(l.x(.78),l.baseline-l.amplitude(.10))?0:1);
  l.rows.forEach((row,i)=>{const opacity=Number(row.group.getAttribute('opacity'))*(i+1===current?1:.74);row.group.setAttribute('opacity',opacity);row.label.setAttribute('opacity',row!==active&&nearActive(row.peakX,row.peakY)?0:opacity);row.curve.setAttribute('stroke-width',i+1===current?2.2:1.5);});
  const end=24+124*steps/l.rows.length,tip=l.point(end),surpassed=bestMean<.48;
  l.range.setAttribute('d',l.arc(24,end));l.range.setAttribute('stroke',surpassed?l.accent:'#527fa4');
  l.needle.setAttribute('transform',`rotate(${end} ${l.cx} ${l.cy})`);l.tip.setAttribute('cx',tip[0]);l.tip.setAttribute('cy',tip[1]);l.tip.setAttribute('fill',surpassed?l.accent:'#527fa4');
  l.iterationLabel.textContent=current?`Iteration ${current}`:'Initial range';l.iterationLabel.setAttribute('fill',surpassed?l.accent:'#6b7889');
  l.surpass.setAttribute('opacity',ease((.48-bestMean)/.08)*.7);
  const titleReveal=reduced.matches?1:ease(p/.10);
  l.title.setAttribute('opacity',titleReveal);
  l.title.setAttribute('transform',`translate(0 ${(1-titleReveal)*6})`);
  board.dataset.phase=p>=.805?'expanded':steps===0?'initial':'expanding';board.dataset.iteration=String(current);board.dataset.rangeEnd=end.toFixed(1);board.dataset.beyondInitial=String(surpassed);
 }
 let closing={};
 function buildClosingBoard(){
  const mobile=matchMedia('(max-width:560px)').matches,tablet=!mobile&&matchMedia('(max-width:700px)').matches,W=mobile?330:tablet?600:800,H=mobile?425:280;
  const accent='#315f96',muted='#5b6c81';
  closingBoard.replaceChildren();
  const svg=node('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':'Quality on the horizontal axis and success rate, SR, on the vertical axis. One policy point advances from an initial point along a bent path over five rounds of quality conditioning, collection and retraining. A short curve through the current point moves with it. Earlier curves remain as faint traces. This is an illustration, without numerical experimental results.'},closingBoard);
  const text=(value,x,y,size,color='#46515c',anchor='start',weight=500)=>node('text',{x,y,'font-size':size,fill:color,'text-anchor':anchor,'font-weight':weight},svg,value);
  const label=(id,value,x,y,size,color=muted,anchor='middle',weight=500)=>{const el=text(value,x,y,size,color,anchor,weight);el.dataset.editId='sq-'+id;el.dataset.editLabel=value;return el;};
  const tx=mobile?165:tablet?16:30,anchor=mobile?'middle':'start';
  text('Condition on quality.',tx,mobile?39:83,mobile?26:tablet?23:29,'#344354',anchor,550);
  text('Push the frontier.',tx,mobile?75:tablet?119:123,mobile?28:tablet?25:31,accent,anchor,600);
  text('Condition. Collect. Retrain.',tx,mobile?108:tablet?157:170,mobile?14:tablet?13:15,'#5b6c81',anchor);

  // A single policy improves in alternating directions, leaving a connected history.
  const ox=mobile?130:tablet?416:548,oy=mobile?360:212,width=mobile?170:tablet?164:211,height=mobile?190:tablet?150:164;
  const waypoints=[[.12,.16],[.39,.27],[.46,.51],[.66,.57],[.73,.76],[.89,.88]].map(([x,y])=>[ox+x*width,oy-y*height]);
  const chart=node('g',{'data-edit-group':'sr-quality-progress','aria-label':'Policy improvement in SR and quality'},svg);
  const defs=node('defs',{},svg),trailInk=node('linearGradient',{id:'closing-progress-ink',gradientUnits:'userSpaceOnUse',x1:waypoints[0][0],y1:waypoints[0][1],x2:waypoints.at(-1)[0],y2:waypoints.at(-1)[1]},defs);
  [['0%','#6b8eb9'],['48%','#4b75a8'],['100%',accent]].forEach(([offset,color])=>node('stop',{offset,'stop-color':color},trailInk));
  const axisTop=oy-height-12,axisEnd=ox+width+14;
  node('path',{'data-edit-id':'sq-quality-axis','data-edit-label':'Quality 축',d:`M${ox} ${oy}H${axisEnd}m-5-4 5 4-5 4`,fill:'none',stroke:'#8798ad','stroke-width':1.3,'stroke-linecap':'round','stroke-linejoin':'round'},chart);
  node('path',{'data-edit-id':'sq-sr-axis','data-edit-label':'Success rate 축',d:`M${ox} ${oy}V${axisTop}m-4 5 4-5 4 5`,fill:'none',stroke:'#8798ad','stroke-width':1.3,'stroke-linecap':'round','stroke-linejoin':'round'},chart);
  // One circular arc, centered at -45 degrees on the policy point. A single
  // SVG arc keeps the curvature uniform, with no join or inflection at the point.
  const curveThrough=([x,y])=>{
   const a=Math.SQRT1_2-Math.sin(Math.PI/12),b=Math.cos(Math.PI/12)-Math.SQRT1_2;
   const r=Math.min(mobile?50:62,(x-ox-8)/a,(ox+width-x-6)/b,(oy-y-8)/a,(y-oy+height-4)/b);
   return `M${x-r*a} ${y-r*b}A${r} ${r} 0 0 1 ${x+r*b} ${y+r*a}`;
  };
  const curveHistory=waypoints.slice(0,-1).map((point,i)=>node('path',{'data-edit-id':`sq-curve-history-${i}`,'data-edit-label':i?`Iteration ${i} · 곡선 흔적`:'Initial · 곡선 흔적',d:curveThrough(point),fill:'none',stroke:'#6685ab','stroke-width':1.6,'stroke-linecap':'round',opacity:0},chart));
  const qualityCurve=node('path',{'data-edit-id':'sq-quality-curve','data-edit-label':'현재 점을 지나는 확장 곡선',d:curveThrough(waypoints[0]),fill:'none',stroke:'#416fa6','stroke-width':2,'stroke-linecap':'round',opacity:1},chart);
  const trace=node('path',{'data-edit-id':'sq-policy-history','data-edit-label':'단계적으로 꺾이는 발전 경로',d:`M${waypoints[0].join(' ')}`,fill:'none',stroke:'url(#closing-progress-ink)','stroke-width':3.1,'stroke-linecap':'round','stroke-linejoin':'round'},chart);
  node('circle',{'data-edit-id':'sq-initial-policy','data-edit-label':'Initial policy · 시작점',cx:waypoints[0][0],cy:waypoints[0][1],r:4,fill:'#6b87aa',stroke:'#fcfcfd','stroke-width':1.5},chart);
  const currentPolicy=node('circle',{'data-edit-id':'sq-current-policy','data-edit-label':'현재 policy · 움직이는 점',cx:waypoints[0][0],cy:waypoints[0][1],r:4.5,fill:accent,stroke:'#fcfcfd','stroke-width':2},chart);
  const arrow=(from,to,inset=0)=>{
   const vx=to[0]-from[0],vy=to[1]-from[1],length=Math.hypot(vx,vy)||1,ux=vx/length,uy=vy/length,x=to[0]-ux*inset,y=to[1]-uy*inset;
   return `M${from[0]} ${from[1]}L${x} ${y}M${x-ux*4-uy*3} ${y-uy*4+ux*3}L${x} ${y}L${x-ux*4+uy*3} ${y-uy*4-ux*3}`;
  };
  const cx=mobile?48:tablet?330:425,cy=mobile?273:146,r=mobile?30:tablet?32:40,outer=r+10,start=[cx+r+17,cy];
  const connection=node('g',{'data-edit-group':'sr-quality-conditioning','aria-label':'Quality conditioning'},svg);
  const line=node('path',{'data-edit-id':'sq-conditioning-link','data-edit-label':'Token conditioning 연결',d:arrow(start,waypoints[0],8),fill:'none',stroke:'#6d8db3','stroke-width':1.5,'stroke-linecap':'round','stroke-linejoin':'round'},connection);
  const tokens=node('g',{'data-closing-tokens':'','data-edit-id':'sq-tokens','data-edit-label':'Quality token 묶음',opacity:0},connection);
  ['#7296c3','#4f7aaf','#315f96'].forEach((fill,i)=>node('rect',{x:i*8-11,y:-5,width:6,height:10,rx:1.6,fill},tokens));
  const face=node('radialGradient',{id:'closing-dial-face',cx:'32%',cy:'24%',r:'82%'},defs);
  [['0%','#ffffff'],['68%','#f2f4f6'],['100%','#dfe4e9']].forEach(([offset,color])=>node('stop',{offset,'stop-color':color},face));
  const dialGroup=node('g',{'data-edit-group':'sr-quality-dial','aria-label':'Quality dial'},svg);
  const point=(angle,rad=outer)=>{const a=(angle-90)*Math.PI/180;return[cx+rad*Math.cos(a),cy+rad*Math.sin(a)];};
  const arc=(a,b)=>{const p=point(a),q=point(b);return`M${p[0]} ${p[1]}A${outer} ${outer} 0 ${b-a>180?1:0} 1 ${q[0]} ${q[1]}`;};
  node('path',{'data-edit-id':'sq-future-range','data-edit-label':'다이얼 확장 가능 범위',d:arc(-112,148),fill:'none',stroke:'#9baabe','stroke-width':2.5,'stroke-dasharray':'3 5','stroke-linecap':'round'},dialGroup);
  const range=node('path',{'data-edit-id':'sq-dial-range','data-edit-label':'다이얼 품질 범위',d:arc(-112,24),fill:'none',stroke:accent,'stroke-width':3.8,'stroke-linecap':'round'},dialGroup);
  node('circle',{cx,cy:cy+3,r,fill:'#dce2e7',opacity:.4},dialGroup);
  node('circle',{cx,cy,r,fill:'#edf0f3',stroke:'#c4ced8','stroke-width':1},dialGroup);
  const innerTicks=node('g',{'data-edit-id':'sq-inner-ticks','data-edit-label':'다이얼 눈금','data-edit-collapsed':''},dialGroup);
  for(let a=0;a<360;a+=8){const p=point(a,r-2),q=point(a,r-5);node('path',{d:`M${p[0]} ${p[1]}L${q[0]} ${q[1]}`,stroke:'#ccd5df','stroke-width':1},innerTicks);}
  const dialFace=node('circle',{cx,cy,r:r-7,fill:'url(#closing-dial-face)',stroke:'#dce2e7'},dialGroup);
  const needle=node('path',{class:'qcp-shared-needle','data-edit-id':'sq-needle','data-edit-label':'다이얼 바늘',d:`M${cx} ${cy-r+10}v12`,stroke:accent,'stroke-width':3.3,'stroke-linecap':'round',transform:`rotate(24 ${cx} ${cy})`},dialGroup);
  label('dial-label','Quality dial',cx,mobile?332:214,13,'#4f627a');
  const tokenLabel=label('token-label','Token',mobile?104:tablet?390:512,mobile?297:178,mobile?11:12);
  label('sr-label','SR',ox-6,axisTop-8,13,'#4f627a','end');
  label('quality-label','Quality',mobile?247:tablet?510:674,oy+26,13,'#4f627a');
  label('initial-label','Initial',waypoints[0][0]+8,waypoints[0][1]+16,12,'#64768d','start');
  closing={mobile,trace,qualityCurve,curveHistory,curveThrough,currentPolicy,waypoints,line,tokens,tokenLabel,dialFace,needle,range,cx,cy,arc,arrow,start};
 }
 function renderClosing(p){
  const c=closing;if(!c.trace)return;
  const rounds=c.waypoints.length-1;
  let progress=0,packet=0,packetOpacity=0,step=0,arrival=0;
  for(let i=0;i<rounds;i++){
   const t=(p-.04-i*.155)/.155;
   progress+=ease((t-.44)/.45);
   if(t>=0&&t<1){step=i+1;packet=ease(t/.46);packetOpacity=ease(t/.08)*(1-ease((t-.42)/.14));arrival=ease((t-.4)/.08)*(1-ease((t-.57)/.16));}
  }
  const segment=Math.min(rounds-1,Math.floor(progress)),fraction=progress-segment,growth=progress/rounds;
  const from=c.waypoints[segment],to=c.waypoints[segment+1],current=from.map((v,i)=>v+(to[i]-v)*fraction);
  const visited=[...c.waypoints.slice(0,segment+1),current];
  c.trace.setAttribute('d',visited.map((point,i)=>`${i?'L':'M'}${point[0]} ${point[1]}`).join(''));
  c.qualityCurve.setAttribute('d',c.curveThrough(current));
  c.curveHistory.forEach((curve,i)=>curve.setAttribute('opacity',ease((progress-i)/.35)*(.48+.045*i)));
  c.currentPolicy.setAttribute('cx',current[0]);c.currentPolicy.setAttribute('cy',current[1]);c.currentPolicy.setAttribute('r',4.5+growth*2+arrival*.7);
  const settled=ease((p-.84)/.08),travel=packet*(1-settled)+(c.mobile ? .08 : .16)*settled;
  c.travel=travel;c.line.setAttribute('opacity',.7-.2*settled);
  c.tokens.setAttribute('opacity',Math.max(packetOpacity,settled*.95));
  c.range.setAttribute('d',c.arc(-112,24+124*(closingRangeStart+(1-closingRangeStart)*growth)));c.needle.setAttribute('transform',`rotate(${24+124*growth} ${c.cx} ${c.cy})`);
  closingBoard.dataset.phase=p>=.84?'complete':'improving';closingBoard.dataset.cycle=String(step||Math.round(progress));closingBoard.dataset.frontier=growth.toFixed(3);closingBoard.dataset.segment=String(segment);
 }
 // Connect the rendered geometry, including the user's layout translations.
 // Resolve this after editor overrides so replay, scrubbing and editing agree.
 function alignClosingConnection(){
  const c=closing;if(chapter!==4||!c.line?.isConnected)return;
  const inSpace=(element,x,y,target)=>{
   const from=element.getScreenCTM(),to=target.getScreenCTM();
   if(!from||!to)return null;
   const p=new DOMPoint(x,y).matrixTransform(from).matrixTransform(to.inverse());return[p.x,p.y];
  };
  const current=[Number(c.currentPolicy.getAttribute('cx')),Number(c.currentPolicy.getAttribute('cy'))];
  const from=inSpace(c.dialFace,...c.start,c.line),to=inSpace(c.currentPolicy,...current,c.line);
  if(!from||!to)return;
  const radius=Number(c.currentPolicy.getAttribute('r'));
  const edge=inSpace(c.currentPolicy,current[0]+radius,current[1],c.line);
  c.line.setAttribute('d',c.arrow(from,to,Math.hypot(edge[0]-to[0],edge[1]-to[1])+2));
  const along=t=>from.map((v,i)=>v+(to[i]-v)*t);
  const packet=inSpace(c.line,...along(c.travel||0),c.tokens.parentElement),box=c.tokens.getBBox();
  c.tokens.setAttribute('transform',`translate(${packet[0]-box.x-box.width/2} ${packet[1]-box.y-box.height/2})`);
  const caption=inSpace(c.line,...along(c.mobile ? .08 : .16),c.tokenLabel);
  c.tokenLabel.setAttribute('x',caption[0]);c.tokenLabel.setAttribute('y',caption[1]+19);
 }
 const total=introduction.duration+chapters.reduce((s,c)=>s+c.duration,0),start=i=>i<0?0:introduction.duration+chapters.slice(0,i).reduce((s,c)=>s+c.duration,0);
 function renderTimeline(){const p=clamp(elapsed/info(chapter).duration);if(chapter===1)host.dataset.controlProgress=p.toFixed(3);segments.forEach((s,i)=>s.firstElementChild.style.width=(i<chapter+1?100:i===chapter+1?p*100:0)+'%');const bounds=timeline.getBoundingClientRect(),part=segments[chapter+1].getBoundingClientRect();timeline.querySelector('.qcp-progress-knob').style.left=(part.left-bounds.left+p*part.width)+'px';timeline.setAttribute('aria-valuenow',String(Math.round((start(chapter)+elapsed)/total*1000)));timeline.setAttribute('aria-valuetext',chapter===-1?'Introduction':`Step ${chapter+1}: ${info(chapter).title}`);}
 function render(){
  host.dataset.introComplete=String(chapter===-1&&elapsed>=introExamplesDuration);
  host.dataset.knobAwaiting=String(chapter===1&&!dialTouched);host.dataset.controlPreview=controlPreview;
  const p=clamp(elapsed/info(chapter).duration);
  const trainedReveal=chapter===0&&chosen?ease((elapsed-trainedCardAt)/trainedCardReveal):0;
  trainedCard.hidden=trainedReveal===0;trainedCard.setAttribute('aria-hidden',String(trainedReveal===0));trainedCard.style.setProperty('--trained-reveal',trainedReveal);
  flow.dataset.trained=String(trainedReveal===1);
  if(chapter===0){
   const p=clamp(elapsed/chooseSequenceDuration);renderQuantization(p,chosen);flow.dataset.actionComplete=String(p>=1);
   // This sequence illustrates token-conditioned policy training, not a live model update.
   const reveal=(from,duration)=>chosen?ease((p-from)/duration):0,training=chosen?ease((p-.44)/.32):0;
   flow.querySelectorAll('[data-flow-quality]').forEach(el=>el.textContent=qualities[selected].name);
   flow.setAttribute('aria-label',chosen?`${qualities[selected].name} is encoded as a quality token. An illustration of policy training follows, then the trained policy outputs a quality-conditioned action.`:'Select a quality to reveal the token, policy training, and action.');
   if(trainedReveal>0)flow.setAttribute('aria-label','The quality-controllable policy is trained. Next, adjust its quality dial.');
   flow.dataset.preview='false';flow.dataset.state=!chosen?'idle':p<.44?'encoding':p<.76?'training':p<.98?'acting':'ready';
   for(const [name,from,duration] of [['token',0,.06],['input',.40,.10],['policy',.44,.10],['output',.79,.10],['action',.88,.12]])flow.style.setProperty(`--reveal-${name}`,reveal(from,duration));
   flow.style.setProperty('--condition-offset',1-reveal(.40,.10));flow.style.setProperty('--action-offset',1-reveal(.79,.12));
   flow.style.setProperty('--training-progress',training);flow.style.setProperty('--training-emphasis',training>0&&training<1?1:.25);
   flow.querySelectorAll('[data-training-label]').forEach(el=>el.textContent=training<1?'Training':'Trained ✓');
   flow.style.setProperty('--token-strength',.35+.65*reveal(.10,.18));flow.style.setProperty('--policy-glow',training>0&&training<1?.35+.25*Math.sin(training*Math.PI*4)**2:.15);flow.style.setProperty('--action-strength',1);
   if(chosen&&p>=.98&&!conditioned){conditioned=true;updateGate();$('qcp-flow-status').textContent='The training illustration is complete. The policy is conditioned on your selected quality.';}
  }
  else if(chapter>0&&chapter<4)renderDial(p);
  if(chapter===3)renderLearning(p);if(chapter===4)renderClosing(p);
  if(chapter===2){
   const shift=reduced.matches?1:ease((elapsed-3100)/1000),reveal=reduced.matches?1:ease((elapsed-3450)/650),copy=reduced.matches?0:1-ease((elapsed-2900)/600);
   stage.style.setProperty('--collect-shift',shift);stage.style.setProperty('--collect-reveal',reveal);stage.style.setProperty('--collect-copy',copy);
   host.dataset.collectionStage=elapsed<2900?'invitation':elapsed<collectionStartsAt?'transition':'rollouts';
   $('qcp-collect-intro').setAttribute('aria-hidden',String(copy===0));frame.inert=reveal<1;
  }else{frame.inert=false;delete host.dataset.collectionStage;}
  loopSteps.forEach((el,i)=>el.classList.toggle('is-active',i===(chapter===2?0:chapter===3?3:p<.16?1:p<.58?2:3)));$('qcp-iteration').textContent=`k = ${iteration}`;
  renderTimeline();robotState();host.dispatchEvent(new Event('qcp:render'));alignClosingConnection();
 }
 function renderQuantization(p,active){
  const morph=ease((p-.16)/.17),solid=ease((p-.30)/.055);
  flow.querySelectorAll('.qcp-token-label').forEach(el=>el.textContent=!active||p>=.36?'Quality token':p<.16?'Trajectory data':'Quantize');
  flow.querySelectorAll('.qcp-token-cluster').forEach(cluster=>{
   if(!cluster.querySelector('.qcp-quantization-traces')){
    const group=document.createElementNS(NS,'g');group.classList.add('qcp-quantization-traces');group.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++){const path=document.createElementNS(NS,'path');path.setAttribute('fill','none');path.setAttribute('stroke',['#7296c3','#4f7aaf','#315f96'][i]);path.setAttribute('stroke-width','1.6');path.setAttribute('stroke-linejoin','round');group.append(path);}cluster.append(group);
   }
   const paths=cluster.querySelectorAll('.qcp-quantization-traces path');
   paths.forEach((path,i)=>{
    const x=-23+i*17,target=[[x,-7],[x+6,-7],[x+12,-7],[x+12,0],[x+12,7],[x+6,7],[x,7],[x,0],[x,-7]];
    const points=target.map(([tx,ty],j)=>{const sx=-42+j*10.5,sy=(i-1)*5+Math.sin(j*1.8+i*1.4)*(3-i*.7);return[(sx+(tx-sx)*morph).toFixed(2),(sy+(ty-sy)*morph).toFixed(2)];});
    path.setAttribute('pathLength','1');path.setAttribute('stroke-dasharray','1');path.setAttribute('stroke-dashoffset',String(1-ease(p/.12)));path.setAttribute('d',points.map((point,j)=>(j?'L':'M')+point.join(' ')).join(''));path.style.opacity=active?1-solid:0;
   });
   cluster.querySelectorAll('.qcp-token-cell').forEach(el=>el.style.setProperty('opacity',active?solid:0,'important'));
  });
 }
 function togglePlay(){if(host.dataset.transitioning){cancelTransition();playing=false;updatePlay();return;}if(chapter===1&&controlPreview==='done'){go(2);return;}if(!chosen&&chapter!==-1)return;if((chapter===-1||chapter===4)&&elapsed>=info(chapter).duration){elapsed=0;render();}playing=!playing;lastFrame=0;updatePlay();}
 play.addEventListener('click',togglePlay);previous.addEventListener('click',()=>go(chapter-1));
 next.addEventListener('click',()=>{if(chapter===-1){go(0);}else if(chapter===0){if(!chosen)chooseQuality(selected);conditioned=true;updateGate();go(1);}else if(chapter===4){iteration=Math.min(3,iteration+1);go(2);}else go(chapter+1);});
 chapterButtons.forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.step))));
 replay.addEventListener('click',()=>{if(!chosen&&chapter!==-1)return;cancelTransition();collectionAdvanceWait=null;collectionComplete=false;collectionSeekRequest=null;if(chapter===1&&!dialTouched){controlPreview='high';value=1;level=3;}if(chapter===2)rollouts.forEach(r=>r.fresh=false);updateGate();elapsed=reduced.matches?info(chapter).duration:0;playing=!reduced.matches;lastFrame=0;restart++;lastState='';updatePlay();render();});
 function seekCollectionAt(time){
  collectionAdvanceWait=null;collectionComplete=false;
  collectionSeekRequest={id:++collectionSeekSerial,fraction:clamp((time-collectionStartsAt)/(chapters[2].duration-collectionStartsAt))};
 }
 function seek(time){if(!conditioned){if(chapter!==-1)return;playing=false;selectChapter(-1,Math.max(0,Math.min(introduction.duration,time)));updatePlay();return;}time=Math.max(0,Math.min(total,time));let i=-1;while(i<chapters.length-1&&time>=info(i).duration)time-=info(i++).duration;playing=false;if(i===2)seekCollectionAt(time);selectChapter(i,time);updatePlay();}
 function pointerTime(x){let nearest={distance:Infinity,time:0};segments.forEach((segment,i)=>{const b=segment.getBoundingClientRect(),f=clamp((x-b.left)/b.width),d=Math.abs(x-b.left-f*b.width);if(d<nearest.distance)nearest={distance:d,time:start(i-1)+f*info(i-1).duration};});return nearest.time;}
 let scrubbing=false;timeline.addEventListener('pointerdown',e=>{if((!conditioned&&chapter!==-1)||e.button!==0)return;e.preventDefault();scrubbing=true;timeline.setPointerCapture(e.pointerId);seek(pointerTime(e.clientX));});timeline.addEventListener('pointermove',e=>{if(scrubbing)seek(pointerTime(e.clientX));});['pointerup','pointercancel','lostpointercapture'].forEach(t=>timeline.addEventListener(t,()=>scrubbing=false));
 timeline.addEventListener('keydown',e=>{if(!conditioned&&chapter!==-1)return;const t=start(chapter)+elapsed,map={ArrowLeft:t-1000,ArrowDown:t-1000,ArrowRight:t+1000,ArrowUp:t+1000,PageUp:t+total/10,PageDown:t-total/10,Home:0,End:total};if(e.key in map){e.preventDefault();seek(map[e.key]);}if(e.key===' '){e.preventDefault();togglePlay();}});
 for(const breakpoint of [560,700])matchMedia(`(max-width:${breakpoint}px)`).addEventListener('change',()=>{if(chapter===3)buildLearningBoard();if(chapter===4)buildClosingBoard();if(chapter>=3)render();});new ResizeObserver(renderTimeline).observe(timeline);new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible)loadRobot();lastFrame=0;robotState();}).observe(host);document.addEventListener('visibilitychange',()=>{lastFrame=0;robotState();});
 reduced.addEventListener('change',event=>{if(event.matches){cancelTransition();playing=false;if(chapter===-1)elapsed=introduction.duration;if(chapter===0&&chosen)elapsed=chapters[0].duration;render();updatePlay();}});
 function tick(now){
  const dt=lastFrame?Math.min(100,now-lastFrame):0;lastFrame=now;
  if(!editorMode&&!host.dataset.transitioning&&chapter===0&&!chosen&&visible&&!document.hidden){chooseWait+=dt;if(chooseWait>=5000)chooseQuality(1);}
  // Leave the completed collection visible briefly before retraining.
  // Count only visible viewing time; editing, seeking and replaying cancel it.
  if(!editorMode&&chapter===2&&collectionComplete&&collectionAdvanceWait!==null&&visible&&!document.hidden){
   collectionAdvanceWait+=dt;if(collectionAdvanceWait>=collectionAdvanceDelay)go(3);
  }
  if(playing&&!host.dataset.transitioning&&visible&&!document.hidden&&(chapter!==-1||ready)){
   // The simulator owns Control and collection progress, so playback and scrubbing agree.
   if(chapter===2){if(elapsed<collectionStartsAt)elapsed=Math.min(collectionStartsAt,elapsed+dt);}
   else if(chapter!==1)elapsed=Math.min(info(chapter).duration,elapsed+dt);
   render();
   if(editorMode&&chapter!==1&&elapsed===info(chapter).duration){playing=false;updatePlay();}
   else if((chapter===-1||chapter===0||chapter===3)&&elapsed===info(chapter).duration)go(chapter+1);
   else if(chapter===4&&elapsed===info(chapter).duration){playing=false;updatePlay();}
  }
  requestAnimationFrame(tick);
 }

 // A small bridge lets the local layout editor pause and inspect a real scene.
 // It does not replace the animation or the simulator with a separate preview.
 host.qcpLayoutEditor={
  state:()=>({chapter,quality:selected,progress:clamp(elapsed/info(chapter).duration),duration:info(chapter).duration,playing}),
  alignConnections:alignClosingConnection,
  activate(active){cancelTransition();collectionAdvanceWait=null;editorMode=active;playing=false;lastFrame=0;updatePlay();render();},
  scene(index,quality=selected){
   selected=!editorMode&&[0,1,3].includes(quality)?quality:1;chosen=conditioned=true;playing=false;collectionComplete=false;dialTouched=false;controlPreview='high';value=1;level=3;restart++;
   qualityButtons.forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.quality)===selected)));
   const target=Math.max(-1,Math.min(4,index)),fraction=target===0?chooseSequenceDuration/chapters[0].duration:target===1?0:target===2?.36:1;
   if(target===2)seekCollectionAt(info(target).duration*fraction);
   loadRobot();selectChapter(target,info(target).duration*fraction);lastFrame=0;updatePlay();
  },
  scrub(fraction){cancelTransition();playing=false;elapsed=info(chapter).duration*clamp(fraction);if(chapter===2)seekCollectionAt(elapsed);lastFrame=0;updateGate();render();updatePlay();},
  play(){if(chapter===1&&controlPreview==='done'){controlPreview='high';value=1;level=3;restart++;elapsed=0;}if(elapsed>=info(chapter).duration){elapsed=0;if(chapter===2){collectionComplete=false;collectionSeekRequest=null;collectionAdvanceWait=null;restart++;updateGate();}}playing=!playing;lastFrame=0;render();updatePlay();}
 };
 selectChapter(-1,reduced.matches?introduction.duration:0);updatePlay();requestAnimationFrame(tick);
})();
