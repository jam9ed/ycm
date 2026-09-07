/* ==========================================================================
   Preview gate.

   READ THIS BEFORE TRUSTING IT: this is a curtain, not a lock. The page is
   served by a static host, so there is no server to check a password — the
   check happens in the visitor's own browser, in code they can read. Anyone
   who opens devtools, or fetches a file directly, walks straight past it.
   If the repository is public, the content is public.

   What it is good for: stopping a casual visitor, or someone who stumbles on
   the URL, from wandering through an unfinished redesign. That is all it is
   claimed to do.

   For real protection: make the repo private and host somewhere with genuine
   access control, or run server.js with YCM_PASSWORD set (that one is real
   HTTP Basic Auth, checked server-side).
   ========================================================================== */
(() => {
  'use strict';
  const KEY  = 'ycm.preview.v1';
  /* djb2, not SHA-256, on purpose: crypto.subtle only exists in a secure
     context, so a sha256 gate throws and never unlocks over plain http on a
     LAN address — exactly the case you would use this for. The hash is
     obfuscation either way; see the note above. */
  const HASH = 1139670464;
  const hash = s => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h; };

  if (sessionStorage.getItem(KEY) === '1') return;

  // hide the page before it can paint
  const hide = document.createElement('style');
  hide.textContent = 'body > *:not(#gate){display:none !important} body{background:#0F1C2B}';
  (document.head || document.documentElement).appendChild(hide);

  /* DOMContentLoaded can reach us more than once; building twice would leave
     two overlays with duplicate ids. */
  let built = false;
  function build() {
    if (built || !document.body) return;
    built = true;
    const g = document.createElement('div');
    g.id = 'gate';
    g.innerHTML = `
      <form id="gate-form" autocomplete="off">
        <svg viewBox="0 0 48 26" fill="none" aria-hidden="true">
          <g stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="miter">
            <path d="M20.5 9 V6.8 Q20.5 4.8 24 4.8 Q27.5 4.8 27.5 6.8 V9" stroke-linejoin="round"/>
            <path d="M4 9 H44"/>
            <path d="M4.8 9.4 L8.9 18.1 Q15.2 12.9 24 21.4 Q32.8 12.9 39.1 18.1 L43.2 9.4"/>
          </g>
        </svg>
        <strong>York County Marine</strong>
        <span>Redesign preview</span>
        <input type="password" id="gate-pw" placeholder="Password" aria-label="Password" autofocus>
        <button type="submit">View</button>
        <em id="gate-msg" hidden>That is not it.</em>
      </form>`;
    document.body.appendChild(g);

    const form = g.querySelector('#gate-form');
    if (!form) return;
    form.addEventListener('submit', e => {
      e.preventDefault();
      const pw  = g.querySelector('#gate-pw');
      const msg = g.querySelector('#gate-msg');
      if (hash(pw.value.trim()) === HASH) {
        sessionStorage.setItem(KEY, '1');
        hide.remove(); g.remove();
        window.dispatchEvent(new Event('ycm:unlocked'));
      } else {
        msg.hidden = false; pw.value = ''; pw.focus();
        form.classList.remove('shake');
        void g.offsetWidth;
        form.classList.add('shake');
      }
    });
  }
  document.readyState === 'loading'
    ? document.addEventListener('DOMContentLoaded', build)
    : build();
})();
