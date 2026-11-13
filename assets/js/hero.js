(() => {
  'use strict';
  const hero = document.getElementById('project-hero');
  if (!hero) return;
  const scenes = [...hero.querySelectorAll('[data-hero-scene]')];
  const videos = scenes.map(scene => scene.querySelector('video'));
  const choices = [...hero.querySelectorAll('[data-hero-choice]')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stacked = matchMedia('(max-width:600px)');
  const sources = videos.map(video => ({
    wide: video.dataset.src || video.querySelector('source').getAttribute('src'),
    mobile: video.dataset.mobileSrc,
    poster: video.getAttribute('poster')
  }));
  let active = 0, inView = false, paused = reduced.matches, switching = false;
  let request = 0, fadeTimer;
  const canPlay = () => inView && !document.hidden && !paused;

  function load(index, resumeTime = 0) {
    const video = videos[index];
    const source = stacked.matches ? sources[index].mobile : sources[index].wide;
    if (video.getAttribute('src') !== source) {
      video.preload = 'auto';
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = Math.min(resumeTime, Math.max(0, video.duration - .01));
      }, {once:true});
      video.src = source; video.load();
    }
    return video;
  }
  function syncPlayback() {
    videos.forEach((video, i) => {
      if (i === active && canPlay()) {
        video.muted = true;
        video.play().catch(error => {
          if (error.name !== 'AbortError' && i === active && canPlay()) paused = true;
        });
      } else video.pause();
    });
  }
  function ready(video) {
    if (video.readyState >= 2) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => finish(new Error('Video load timed out')), 12000);
      function finish(error) {
        clearTimeout(timer); video.removeEventListener('loadeddata', loaded); video.removeEventListener('error', failed);
        error ? reject(error) : resolve();
      }
      const loaded = () => finish(), failed = () => finish(new Error('Video unavailable'));
      video.addEventListener('loadeddata', loaded, {once:true});
      video.addEventListener('error', failed, {once:true});
    });
  }
  async function select(index) {
    if (index === active || switching) return;
    switching = true;
    const id = ++request, incoming = load(index);
    try {
      await ready(incoming);
      if (id !== request) return;
      incoming.currentTime = 0;
      active = index;
      scenes.forEach((scene, i) => scene.classList.toggle('is-active', i === active));
      choices.forEach((button, i) => button.setAttribute('aria-pressed', String(i === active)));
      syncPlayback();
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => { switching = false; }, reduced.matches ? 0 : 750);
    } catch { switching = false; paused = true; }
  }
  choices.forEach((button, i) => button.addEventListener('click', () => {
    paused = reduced.matches;
    if (i === active) {
      videos[i].currentTime = 0;
      syncPlayback();
    } else select(i);
  }));
  videos.forEach((video, i) => {
    video.addEventListener('loadeddata', syncPlayback);
    video.addEventListener('ended', () => { if (i === active && canPlay()) select((i + 1) % videos.length); });
  });
  new IntersectionObserver(entries => {
    inView = entries[0].isIntersecting;
    if (inView) load(active, videos[active].currentTime);
    syncPlayback();
  }, {threshold:0}).observe(hero);
  document.addEventListener('visibilitychange', syncPlayback);
  reduced.addEventListener('change', () => { paused = reduced.matches; syncPlayback(); });
  videos[0].addEventListener('loadeddata', () => { if (!reduced.matches) load(1); }, {once:true});
  function updateFormat() {
    hero.querySelector('.hero-media').setAttribute('aria-label', stacked.matches
      ? 'Real-world task comparison: Baseline above, QCP below. Both play simultaneously at the same speed.'
      : 'Real-world task comparison: Baseline on the left, QCP on the right. Both play simultaneously at the same speed.');
    videos.forEach((video, i) => {
      video.poster = stacked.matches ? sources[i].poster.replace('-poster.jpg', '-mobile-poster.jpg') : sources[i].poster;
    });
  }
  stacked.addEventListener('change', () => {
    request++; switching = false; clearTimeout(fadeTimer);
    const time = videos[active].currentTime;
    videos.forEach(video => video.pause());
    updateFormat(); load(active, time);
    syncPlayback();
  });
  updateFormat();
  choices.forEach(button => { button.disabled = false; });
})();
