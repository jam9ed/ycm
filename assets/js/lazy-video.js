/* ==========================================================================
   <ycm-video> — a host-agnostic, intent-driven video element.

   The problem it solves: the current site mounts 94 Wix players on the home
   page. Every one of them ships a poster, a player bundle and a metadata
   request before the visitor has asked for anything.

   The rules here:
     1. Nothing loads until the element is near the viewport (poster only).
     2. No <video> element exists until the visitor signals intent (click,
        or hover-scrub on capable pointers).
     3. Exactly one video plays at a time, globally.
     4. Scrolled far away → pause, detach the source, free the decoder.
     5. Save-Data / 2g / reduced-motion → posters only, never autoplay.

   Usage:
     <ycm-video
        poster="/img/a.jpg"        (required — cheap, always the first paint)
        src="https://…/file.mp4"   (progressive fallback)
        hls="https://…/index.m3u8" (adaptive; preferred when supported)
        duration="2:14"
        label="1978 Whaler 11' — walkaround"
        data-ratio="16:9|4:3|9:16"></ycm-video>

   Host notes: `hls` plays natively in Safari. Elsewhere it is used only if
   window.Hls (hls.js) is present; otherwise it falls back to `src`.
   ========================================================================== */

(() => {
  'use strict';

  // ---- global single-playback registry --------------------------------
  const mounted = new Set();   // elements holding a live <video>
  let current = null;          // the one that is allowed to play

  const stats = { total: 0, observed: 0, mounted: 0, played: 0, bytesSaved: 0 };
  const listeners = new Set();
  const notify = () => listeners.forEach(fn => fn(stats));
  window.ycmVideoStats = { get: () => ({ ...stats }), subscribe: fn => (listeners.add(fn), () => listeners.delete(fn)) };

  // ---- environment ----------------------------------------------------
  const conn = navigator.connection || {};
  const saveData = !!conn.saveData;
  const slowNet = /(^|-)2g$/.test(conn.effectiveType || '');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const THRIFTY = saveData || slowNet;

  // Rough accounting for the HUD: what a naive page would have pulled per
  // player just to render it (poster + player chunk + metadata range req).
  const NAIVE_BYTES_PER_PLAYER = 320 * 1024;

  // ---- observers ------------------------------------------------------
  // Near: start fetching the poster. Generous margin, posters are cheap.
  const posterIO = new IntersectionObserver(entries => {
    for (const e of entries) {
      if (e.isIntersecting) { e.target._loadPoster(); posterIO.unobserve(e.target); }
    }
  }, { rootMargin: '600px 0px' });

  // Far: tear the decoder back down.
  const keepIO = new IntersectionObserver(entries => {
    for (const e of entries) if (!e.isIntersecting) e.target._release();
  }, { rootMargin: '900px 0px' });

  const ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.3-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z"/></svg>';

  class YcmVideo extends HTMLElement {
    connectedCallback() {
      if (this._built) return;
      this._built = true;
      stats.total++;

      const poster = this.getAttribute('poster') || '';
      const dur = this.getAttribute('duration') || '';
      const label = this.getAttribute('label') || 'Video';
      const hasSrc = !!(this.getAttribute('src') || this.getAttribute('hls'));

      this.innerHTML = `
        <img class="v-poster" alt="${esc(label)}" decoding="async" fetchpriority="low">
        <div class="v-scrim"></div>
        <button class="v-play" type="button" aria-label="Play ${esc(label)}"><span>${ICON_PLAY}</span></button>
        <div class="v-spin"><i></i></div>
        <div class="v-err"></div>
        <div class="v-meta">${dur ? `<span class="v-dur">${esc(dur)}</span>` : ''}</div>`;

      this.dataset.state = hasSrc ? 'idle' : 'nosrc';
      if (!hasSrc) {
        this.querySelector('.v-err').innerHTML =
          'No video source configured.<br>Set <code>src</code> or <code>hls</code> on this element.';
      }

      this.querySelector('.v-play').addEventListener('click', e => { e.stopPropagation(); this.play(); });

      // Hover-scrub: on a real mouse, and only for fast connections, warm the
      // first moments so the click feels instant. Never on touch or thrifty.
      if (finePointer && !THRIFTY && hasSrc) {
        this.addEventListener('pointerenter', () => { this._warmTimer = setTimeout(() => this._mount(false), 220); });
        this.addEventListener('pointerleave', () => { clearTimeout(this._warmTimer); if (this.dataset.state !== 'playing') this._release(); });
      }

      posterIO.observe(this);
      notify();
    }

    disconnectedCallback() { this._release(); posterIO.unobserve(this); keepIO.unobserve(this); }

    /* ---- stage 1: poster only ---------------------------------------- */
    _loadPoster() {
      if (this._posterLoaded) return;
      this._posterLoaded = true;
      stats.observed++; stats.bytesSaved = Math.max(0, (stats.total - stats.mounted) * NAIVE_BYTES_PER_PLAYER);
      const src = this.getAttribute('poster');
      if (src) {
        const img = this.querySelector('.v-poster');
        img.addEventListener('load', () => img.style.opacity = '1', { once: true });
        img.src = src;
      }
      notify();
    }

    /* ---- stage 2: real <video>, only on intent ----------------------- */
    _mount(autoplay) {
      if (this._video) return this._video;
      const hls = this.getAttribute('hls');
      const src = this.getAttribute('src');
      if (!hls && !src) return null;

      const v = document.createElement('video');
      v.playsInline = true;
      v.preload = autoplay ? 'auto' : 'metadata';
      v.controls = false;
      v.setAttribute('aria-label', this.getAttribute('label') || 'Video');
      // Poster stays visible underneath until the first frame is decoded, so
      // there is never a black flash on mount.
      v.addEventListener('loadeddata', () => { this.dataset.state = this._wantPlay ? 'playing' : 'ready'; });
      v.addEventListener('playing', () => { this.dataset.state = 'playing'; v.controls = true; });
      v.addEventListener('pause', () => { if (this.dataset.state === 'playing') this.dataset.state = 'ready'; });
      v.addEventListener('ended', () => { this.dataset.state = 'idle'; v.controls = false; this._release(); });
      v.addEventListener('error', () => this._fail('This video could not be loaded.'));
      v.addEventListener('waiting', () => { if (this._wantPlay) this.dataset.state = 'loading'; });

      const canNativeHls = v.canPlayType('application/vnd.apple.mpegurl');
      if (hls && canNativeHls) {
        v.src = hls;
      } else if (hls && window.Hls && window.Hls.isSupported()) {
        const h = new window.Hls({ maxBufferLength: 20, capLevelToPlayerSize: true, startLevel: -1 });
        h.loadSource(hls); h.attachMedia(v);
        h.on(window.Hls.Events.ERROR, (_, d) => { if (d.fatal) this._fail('Playback stream error.'); });
        this._hls = h;
      } else if (src) {
        v.src = src;
      } else {
        this._fail('This browser cannot play the provided stream.');
        return null;
      }

      this.insertBefore(v, this.querySelector('.v-scrim'));
      this._video = v;
      mounted.add(this);
      stats.mounted++; notify();
      keepIO.observe(this);
      return v;
    }

    /* ---- stage 3: give the memory back ------------------------------- */
    _release() {
      if (!this._video) return;
      if (current === this) current = null;
      this._wantPlay = false;
      try { this._video.pause(); } catch (_) {}
      if (this._hls) { try { this._hls.destroy(); } catch (_) {} this._hls = null; }
      // Detaching the source is what actually frees the decoder + buffer.
      this._video.removeAttribute('src');
      try { this._video.load(); } catch (_) {}
      this._video.remove();
      this._video = null;
      mounted.delete(this);
      stats.mounted = Math.max(0, stats.mounted - 1);
      if (this.dataset.state !== 'nosrc') this.dataset.state = 'idle';
      keepIO.unobserve(this);
      notify();
    }

    _fail(msg) {
      this.dataset.state = 'error';
      const e = this.querySelector('.v-err');
      if (e) e.textContent = msg;
    }

    /* ---- public ------------------------------------------------------ */
    play() {
      if (this.dataset.state === 'nosrc') return;
      // Rule 3: whoever was playing, stops.
      if (current && current !== this) current.pause();
      current = this;
      this._wantPlay = true;
      this.dataset.state = 'loading';
      const v = this._mount(true);
      if (!v) return;
      v.preload = 'auto';
      const p = v.play();
      if (p && p.catch) p.catch(() => { this.dataset.state = 'idle'; this._wantPlay = false; });
      stats.played++; notify();
    }

    pause() {
      this._wantPlay = false;
      if (this._video) { try { this._video.pause(); } catch (_) {} }
      if (this.dataset.state === 'playing' || this.dataset.state === 'loading') this.dataset.state = 'ready';
    }
  }

  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  customElements.define('ycm-video', YcmVideo);

  // Pause everything when the tab is hidden — no background decoding.
  document.addEventListener('visibilitychange', () => { if (document.hidden && current) current.pause(); });

  window.YCM_VIDEO_ENV = { saveData, slowNet, reduceMotion, thrifty: THRIFTY, finePointer };
})();
