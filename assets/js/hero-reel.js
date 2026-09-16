/* The hero runs a short loop of boats going past on the York River.
   Four clips, two and a half seconds each — ten seconds all told, then round
   again. It is scenery, not content: muted always, no controls, and it steps
   aside entirely for anyone who has asked for less motion or is paying for
   their bytes. The still poster is what everybody gets first, and what some
   people keep. */
(function () {
  const FADE = 0.7;                       // crossfade, seconds
  const host = document.querySelector('[data-hero-reel]');
  if (!host) return;

  const clips = JSON.parse(host.dataset.heroReel || '[]');
  if (!clips.length) return;

  const still = host.querySelector('.hero-still');

  // Reasons to never start: the poster alone is a perfectly good hero.
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const conn = navigator.connection || {};
  const thrifty = conn.saveData === true || /^([23]g|slow-2g)$/.test(conn.effectiveType || '');
  if (reduced || thrifty) return;

  const layers = [0, 1].map(() => {
    const v = document.createElement('video');
    v.muted = true; v.defaultMuted = true; v.playsInline = true;
    v.autoplay = false; v.controls = false; v.loop = false;
    v.preload = 'none';
    v.setAttribute('aria-hidden', 'true');
    v.tabIndex = -1;
    host.insertBefore(v, still.nextSibling);
    return v;
  });

  let at = 0;            // which clip
  let front = 0;         // which layer is showing
  let running = false;
  let armed = false;     // has a crossfade been scheduled for this clip

  const load = (v, i) => {
    if (v.dataset.clip === String(i)) return;
    v.dataset.clip = String(i);
    v.poster = clips[i].poster;
    v.src = clips[i].src;
    v.preload = 'auto';
    v.load();
  };

  function advance() {
    const next = (at + 1) % clips.length;
    const back = layers[1 - front];
    load(back, next);
    const go = back.play();
    if (go && go.catch) go.catch(() => {});
    back.classList.add('on');
    layers[front].classList.remove('on');
    // Rewind the outgoing layer once it is invisible, ready for its next turn.
    const wasFront = layers[front];
    setTimeout(() => { if (!wasFront.classList.contains('on')) wasFront.currentTime = 0; },
               FADE * 1000 + 60);
    front = 1 - front;
    at = next;
    armed = false;
    load(layers[1 - front], (at + 1) % clips.length);
  }

  // A clip is short enough that timeupdate is the honest signal — start the
  // handover FADE seconds before the end so the two overlap rather than cut.
  layers.forEach(v => {
    v.addEventListener('timeupdate', () => {
      if (!running || armed || !v.classList.contains('on')) return;
      const dur = v.duration;
      if (!isFinite(dur) || dur <= 0) return;
      if (v.currentTime >= dur - FADE) { armed = true; advance(); }
    });
    v.addEventListener('ended', () => {
      if (running && !armed && v.classList.contains('on')) { armed = true; advance(); }
    });
    v.addEventListener('error', () => { stop(); });
  });

  function start() {
    if (running) return;
    running = true;
    load(layers[front], at);
    const go = layers[front].play();
    if (go && go.catch) go.catch(() => stop());   // autoplay refused: keep the still
    layers[front].classList.add('on');
    load(layers[1 - front], (at + 1) % clips.length);
  }

  function stop() {
    running = false;
    layers.forEach(v => { v.pause(); v.classList.remove('on'); });
  }

  // Only run while it is actually on screen and the tab is in front.
  const seen = new IntersectionObserver(es => {
    es.forEach(e => (e.isIntersecting && !document.hidden) ? start() : stop());
  }, { threshold: 0.15 });
  seen.observe(host);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (host.getBoundingClientRect().bottom > 0) start();
  });
})();
