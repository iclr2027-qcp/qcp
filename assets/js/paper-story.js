(() => {
 'use strict';
 const root=document.getElementById('results');if(!root)return;
 const editing=root.hasAttribute('data-result-editor');
 const plots=[
  ['Square · Speed','Robomimic Square','square-speed',0],['Square · Smoothness','Robomimic Square','square-smooth',1],
  ['Pack Box · Speed','RoboEval Pack Box','packing-speed',2],['Pack Box · Joint path length','RoboEval Pack Box','packing-path',3],
  ['Transport · Speed','Robomimic Transport',null,4],['Transport · Smoothness','Robomimic Transport','transport-smooth',5],
  ['Pick Book · Speed','RoboEval Pick Book','book-speed',6],['Pick Book · Joint path length','RoboEval Pick Book','book-path',7]
 ];
 const select=root.querySelector('#paper-task'),plot=root.querySelector('#paper-main-plot'),videos=root.querySelector('.paper-videos');
 const reduced=matchMedia('(prefers-reduced-motion: reduce)'),sources=new Map(),states=new Map();let serial=0;
 const controlRail=root.querySelector('.control-grid');
 controlRail?.addEventListener('keydown',event=>{
  if(event.target!==controlRail||controlRail.scrollWidth<=controlRail.clientWidth)return;
  const step=controlRail.querySelector('figure').getBoundingClientRect().width;
  const destinations={ArrowRight:controlRail.scrollLeft+step,ArrowLeft:controlRail.scrollLeft-step,Home:0,End:controlRail.scrollWidth};
  if(!(event.key in destinations))return;
  event.preventDefault();controlRail.scrollTo({left:destinations[event.key],behavior:reduced.matches?'instant':'smooth'});
 });
 const stateFor=el=>{if(!states.has(el))states.set(el,{visible:false,animations:[],request:0});return states.get(el);};
 function source(url){if(!sources.has(url))sources.set(url,fetch(url+'?v=13').then(r=>{if(!r.ok)throw Error('Figure could not be loaded');return r.text();}));return sources.get(url);}
 // Use the untransformed CSS width so Studio zoom still scales the whole canvas.
 function sizeChartText(svg){
  const width=parseFloat(getComputedStyle(svg).width);
  if(width>0)svg.style.setProperty('--paper-text-scale',svg.viewBox.baseVal.width/width);
 }
 const textSizer=new ResizeObserver(entries=>entries.forEach(({target})=>sizeChartText(target)));
 function cancel(state){cancelAnimationFrame(state.raf);state.animations.forEach(a=>a.cancel());state.animations=[];state.radars=[];}
 function drawRadars(state){
  cancelAnimationFrame(state.raf);
  for(const {wrapper,clock,cx,cy} of state.radars||[]){
   const progress=clock.effect.getComputedTiming().progress??0,scale=.025+.975*progress;
   // The common axis intersection, not each polygon's bounding-box center.
   wrapper.setAttribute('transform',`translate(${cx} ${cy}) scale(${scale}) translate(${-cx} ${-cy})`);
  }
  if(state.radars?.length&&state.animations.some(a=>a.playState==='running'))state.raf=requestAnimationFrame(()=>drawRadars(state));
 }
 function animate(mount){
  const state=stateFor(mount);cancel(state);const svg=mount.querySelector('svg');if(!svg)return;
  const points=[...svg.querySelectorAll('.paper-marker')],lines=[...svg.querySelectorAll('.paper-connector')];
  function add(el,frames,delay,duration){const animation=el.animate(frames,{delay,duration,fill:'both',easing:'cubic-bezier(.22,.65,.3,1)'});animation.pause();animation.currentTime=0;state.animations.push(animation);return animation;}
  if(svg.hasAttribute('data-radar-center')){
   const [cx,cy]=svg.dataset.radarCenter.split(' ').map(Number);
   svg.querySelectorAll('[data-radar-grow]').forEach(shape=>{
    let wrapper=shape.closest('[data-radar-reveal]');
    if(!wrapper){wrapper=document.createElementNS(svg.namespaceURI,'g');wrapper.dataset.radarReveal='';shape.before(wrapper);wrapper.append(shape);}
    const clock=add(wrapper,[{opacity:0},{opacity:1,offset:.12},{opacity:1}],180+Number(shape.dataset.radarGrow)*150,1450);
    state.radars.push({wrapper,clock,cx,cy});
   });
   drawRadars(state);
  }else if(points.length){
   for(const line of lines){const step=+line.dataset.iteration,stagger=+line.dataset.series*55;add(line,[{strokeDashoffset:'1',opacity:0},{strokeDashoffset:'0',opacity:.72}],440+(step-1)*780+stagger-370,370);}
   for(const point of points){
    let wrapper=point.closest('[data-point-reveal]')||point.parentElement;
    if(!wrapper.hasAttribute('data-point-reveal')){wrapper=document.createElementNS(svg.namespaceURI,'g');wrapper.setAttribute('data-point-reveal','');point.before(wrapper);wrapper.append(point);}
    wrapper.dataset.iteration=point.dataset.iteration;wrapper.dataset.series=point.dataset.series;
    wrapper.style.transformBox='fill-box';wrapper.style.transformOrigin='center';
    add(wrapper,[{opacity:0,transform:'scale(.76)'},{opacity:1,transform:'scale(1)'}],440+(+point.dataset.iteration-1)*780+(+point.dataset.series*55),300);
   }
  }else{
   svg.querySelectorAll('.paper-band').forEach(band=>add(band,[{opacity:0},{opacity:1}],200+(+band.dataset.sequence)*420,450));
   const marks=[...svg.querySelectorAll('.paper-measurement')];
   marks.forEach((mark,i)=>add(mark,[{opacity:0},{opacity:1}],240+Math.min(i,80)*38,260));
  }
  const end=Math.max(0,...state.animations.map(a=>a.effect.getComputedTiming().endTime));
  state.clock=add(svg,[{opacity:1},{opacity:1}],0,end+200);
  state.clock.onfinish=()=>{mount.dataset.motionState='complete';drawRadars(state);};
  if(reduced.matches||editing){state.animations.forEach(a=>a.finish());mount.dataset.motionState='complete';drawRadars(state);}
  else{mount.dataset.motionState='ready';resume(mount,state);}
 }
 function resume(mount,state){if(!state.visible||document.hidden||mount.closest('[hidden]'))return;if(mount.dataset.motionState==='complete')return;state.animations.forEach(a=>{if(a.currentTime<a.effect.getComputedTiming().endTime)a.play();});mount.dataset.motionState='playing';drawRadars(state);}
 function pause(mount,state){if(mount.dataset.motionState==='complete')return;state.animations.forEach(a=>a.pause());cancelAnimationFrame(state.raf);mount.dataset.motionState='paused';}
 async function reveal(mount,replay=false){
  const state=stateFor(mount),url=mount.dataset.figure;
  if(state.url===url&&mount.querySelector('svg')){if(replay)animate(mount);return;}
  const request=++serial;state.request=request;state.url=url;cancel(state);mount.dataset.motionState='loading';
  try{
   const [text]=await Promise.all([source(url),document.fonts.ready]);if(state.request!==request)return;
   const doc=new DOMParser().parseFromString(text,'image/svg+xml'),svg=document.importNode(doc.documentElement,true);
   // Each inline figure owns its clip paths, even when several are visible.
   const prefix=`paper-${request}-`,ids=new Map([...svg.querySelectorAll('[id]')].map(el=>[el.id,prefix+el.id]));
   for(const el of [svg,...svg.querySelectorAll('*')])for(const attr of [...el.attributes]){
    if(attr.name==='id')el.id=ids.get(attr.value);
    else if(attr.value.includes('url(#'))el.setAttribute(attr.name,attr.value.replace(/url\(#([^)]+)\)/g,(_,id)=>`url(#${ids.get(id)||id})`));
    else if(attr.name.endsWith('href')&&attr.value.startsWith('#'))el.setAttributeNS(attr.namespaceURI,attr.name,'#'+(ids.get(attr.value.slice(1))||attr.value.slice(1)));
   }
   svg.setAttribute('aria-hidden','true');svg.classList.add('paper-vector');const previous=mount.querySelector('svg');if(previous)textSizer.unobserve(previous);mount.replaceChildren(svg);if(svg.querySelector('[data-chart-label]')){sizeChartText(svg);textSizer.observe(svg);}root.dispatchEvent(new CustomEvent('paper-figure-ready'));animate(mount);
  }catch(error){mount.textContent='The graph could not be loaded. Please reload the page.';console.error(error);}
 }
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{const mount=entry.target,state=stateFor(mount);state.visible=entry.isIntersecting;if(state.visible){reveal(mount);resume(mount,state);}else pause(mount,state);}),{threshold:.15});
 root.querySelectorAll('[data-figure]').forEach(mount=>observer.observe(mount));
 document.addEventListener('visibilitychange',()=>states.forEach((state,mount)=>document.hidden?pause(mount,state):resume(mount,state)));
 reduced.addEventListener('change',()=>{if(reduced.matches)states.forEach((state,mount)=>{state.animations.forEach(a=>a.finish());mount.dataset.motionState='complete';drawRadars(state);});});
 function choose(i,play=true){
  const [label,task,media,index]=plots[i];plot.dataset.figure='assets/images/paper/fig2-'+index+'.svg';plot.setAttribute('aria-label',label+', success rate versus execution quality across iterations');if(play)reveal(plot,true);
  videos.hidden=!media;root.querySelector('.paper-evidence').classList.toggle('no-video',!media);root.querySelector('#paper-task-name').textContent=task;
  videos.querySelectorAll('video').forEach(video=>{video.pause();if(editing)video.removeAttribute('controls');if(media){video.src='assets/media/'+media+'-'+video.dataset.role+'.mp4';video.poster='assets/media/'+media+'-'+video.dataset.role+'.jpg';video.load();}else{video.removeAttribute('src');video.load();}});root.querySelector('#paper-play-videos').textContent='Play both';
 }
 plots.forEach(([name],i)=>{const option=document.createElement('option');option.value=i;option.textContent=name;select.append(option);});select.addEventListener('change',()=>choose(Number(select.value)));
 // Result sections stay visible together; only the paired task comparison switches.
 root.addEventListener('paper-section-change',()=>{
  states.forEach((state,mount)=>mount.closest('[hidden]')?pause(mount,state):resume(mount,state));
  if(editing)root.querySelectorAll('.paper-result-panel:not([hidden]) [data-figure]').forEach(mount=>reveal(mount));
 });
 root.querySelector('#paper-play-videos').addEventListener('click',async e=>{const clips=[...videos.querySelectorAll('video')];if(clips.some(v=>!v.paused)){clips.forEach(v=>v.pause());e.currentTarget.textContent='Play both';return;}clips.forEach(v=>v.currentTime=0);const button=e.currentTarget;const outcomes=await Promise.allSettled(clips.map(v=>v.play()));button.textContent=outcomes.some(r=>r.status==='fulfilled')?'Pause videos':'Use video controls';});
 videos.querySelectorAll('video').forEach(v=>v.addEventListener('ended',()=>{if([...videos.querySelectorAll('video')].every(v=>v.paused))root.querySelector('#paper-play-videos').textContent='Play both';}));
 new IntersectionObserver(entries=>{if(!entries[0].isIntersecting){videos.querySelectorAll('video').forEach(v=>v.pause());root.querySelector('#paper-play-videos').textContent='Play both';}},{threshold:0}).observe(videos);
 choose(0,false);
})();
