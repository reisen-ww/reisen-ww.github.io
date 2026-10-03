(() => {
  'use strict';
  const dock = document.querySelector('[data-music-dock]');
  const scoreElement = document.querySelector('[data-music-score]');
  if (!dock || !scoreElement) return;
  const score = JSON.parse(scoreElement.textContent);
  const script = document.querySelector('script[data-music-script]');
  const assets = new URL('./music/', script.src);
  const key = 'personal-site-music-v2';
  const toggle = dock.querySelector('[data-music-toggle]');
  const label = dock.querySelector('[data-music-label]');
  const dots = [...dock.querySelectorAll('[data-music-layer]')];
  let saved = {};
  try { saved = JSON.parse(sessionStorage.getItem(key) || '{}'); } catch (_) {}
  let clicks = Number.isInteger(saved.clicks) ? Math.max(0, Math.min(14, saved.clicks)) : 0;
  let enabled = false;
  let context;
  let master;
  let buffers;
  let loading;
  let sources = [];
  let gains = [];
  let startedAt = 0;
  let pausedAt = Number.isFinite(saved.position) ? Math.max(0, saved.position) % score.duration : 0;
  let attempt = 0;
  let pending = false;
  const activeCount = () => score.layers.filter(layer => clicks >= layer.afterClicks).length;
  const position = () => enabled && context ? Math.max(0, context.currentTime - startedAt) : pausedAt;
  const save = () => {
    try { sessionStorage.setItem(key, JSON.stringify({clicks, position: position() % score.duration, enabled})); } catch (_) {}
  };
  const update = (error = false) => {
    const count = activeCount();
    toggle.disabled = false;
    toggle.setAttribute('aria-pressed', String(enabled));
    toggle.setAttribute('aria-label', pending ? '取消音乐加载' : enabled ? '关闭音乐' : '开启音乐');
    toggle.textContent = pending ? '准备中' : enabled ? '关闭音乐' : '开启音乐';
    label.textContent = error ? '点击重试' : `${score.title} · ${count}/${score.layers.length}`;
    dock.title = `${score.title}，${clicks}次探索，${score.layers.slice(0, count).map(x => x.name).join('、')}`;
    dock.dataset.musicClicks = String(clicks);
    dock.dataset.musicLayers = String(count);
    dock.dataset.musicState = pending ? 'loading' : enabled ? 'playing' : 'muted';
    dots.forEach((dot, index) => dot.classList.toggle('is-on', index < count));
    document.dispatchEvent(new CustomEvent('site:music-state', {detail: {enabled, pending}}));
  };
  const stopSources = (fade = false) => {
    const when = context?.currentTime || 0;
    const retiringGains = gains;
    sources.forEach((source, index) => {
      const gain = retiringGains[index];
      if (fade && context.state === 'running') {
        if (gain.gain.cancelAndHoldAtTime) gain.gain.cancelAndHoldAtTime(when);
        else { const value = gain.gain.value; gain.gain.cancelScheduledValues(when); gain.gain.setValueAtTime(value, when); }
        gain.gain.linearRampToValueAtTime(0, when + .06);
        source.onended = () => { source.disconnect(); gain.disconnect(); };
        try { source.stop(when + .065); } catch (_) { source.disconnect(); gain.disconnect(); }
      } else {
        try { source.stop(); } catch (_) {}
        source.disconnect(); gain.disconnect();
      }
    });
    sources = []; gains = [];
  };
  const prepare = async () => {
    if (buffers) return buffers;
    if (!loading) loading = Promise.all(score.layers.map(async layer => {
      const response = await fetch(new URL(`${layer.file}?v=${layer.version}`, assets));
      if (!response.ok) throw Error('Music asset unavailable');
      const buffer = await context.decodeAudioData(await response.arrayBuffer());
      if (Math.abs(buffer.duration - score.duration) > .001) throw Error('Music length mismatch');
      return buffer;
    })).then(result => (buffers = result)).catch(error => { loading = null; throw error; });
    return loading;
  };
  const start = async ({restart = false} = {}) => {
    const request = ++attempt;
    pending = true; update();
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw Error('Audio is unavailable');
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = .5;
        master.connect(context.destination);
        context.addEventListener('statechange', () => {
          if (enabled && context.state !== 'running') mute();
        });
      }
      // Resume is invoked in the click's user activation before fetching the stems.
      await context.resume();
      const decoded = await prepare();
      if (request !== attempt) return false;
      if (context.state !== 'running' || document.hidden) throw Error('Audio is suspended');
      stopSources();
      const offset = restart ? 0 : pausedAt % score.duration;
      const when = context.currentTime + .035;
      startedAt = when - offset;
      decoded.forEach((buffer, index) => {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer; source.loop = true;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(clicks >= score.layers[index].afterClicks ? 1 : 0, when + .12);
        source.connect(gain); gain.connect(master);
        source.start(when, offset);
        sources.push(source); gains.push(gain);
      });
      enabled = true; pending = false; save(); update();
      return true;
    } catch (_) {
      if (request !== attempt) return false;
      enabled = false; pending = false; stopSources(); save(); update(true);
      return false;
    }
  };
  const mute = () => {
    attempt += 1;
    if (enabled) pausedAt = position();
    enabled = false; pending = false;
    stopSources(true); save(); update();
  };
  const explore = () => {
    const before = activeCount();
    clicks = Math.min(14, clicks + 1);
    if (enabled && activeCount() > before) {
      const bar = 4 * 60 / score.bpm;
      const when = startedAt + (Math.floor(position() / bar) + 1) * bar;
      gains.forEach((gain, index) => {
        if (index < before || clicks < score.layers[index].afterClicks) return;
        gain.gain.setValueAtTime(0, when);
        gain.gain.linearRampToValueAtTime(1, when + .75);
      });
    }
    save(); update();
  };
  const placeDock = () => document.querySelector('[data-music-slot]')?.append(dock);
  window.SiteMusic = {start, mute, get enabled() { return enabled; }, get pending() { return pending; }, get position() {return position();}};
  toggle.addEventListener('click', () => { if (enabled || pending) mute(); else void start(); });
  dock.hidden = false; placeDock(); update();
  document.addEventListener('visibilitychange', () => { if (document.hidden) mute(); });
  window.addEventListener('pagehide', () => {
    save(); attempt += 1;
    if (enabled) pausedAt = position();
    enabled = false; pending = false; stopSources(); update();
    cancelScrollReturn();
    navigationId += 1; navigationAbort?.abort(); navigationBusy = false;
  });

  // Keep the audio nodes alive across local content changes. Static links remain the fallback.
  let navigationId = 0;
  let navigationAbort;
  let navigationBusy = false;
  let scrollReturn = null;
  let renderedURL = new URL(location.href);
  const cancelScrollReturn = () => {
    if (!scrollReturn) return;
    scrollReturn.cancelled = true;
    scrollReturn = null;
    touch = null;
    navigationId += 1;
    navigationAbort?.abort();
    navigationBusy = false;
    window.SiteTransition?.cancel();
  };
  const navigate = async (url, push = true, transition = false, control = null) => {
    if (scrollReturn && scrollReturn !== control) cancelScrollReturn();
    const request = ++navigationId;
    navigationBusy = true;
    window.SiteTransition?.cancel();
    navigationAbort?.abort();
    navigationAbort = new AbortController();
    try {
      const response = await fetch(url, {signal: navigationAbort.signal});
      if (!response.ok) throw Error('Page unavailable');
      const next = new DOMParser().parseFromString(await response.text(), 'text/html');
      const view = next.querySelector('[data-site-view]');
      const current = document.querySelector('[data-site-view]');
      if (!view || !current) throw Error('Static fallback');
      if (request !== navigationId || control?.cancelled || document.hidden) return;
      if (transition && window.SiteTransition) {
        const completed = await window.SiteTransition.run(current, view, url, () => request === navigationId && !control?.cancelled, transition === 'reverse', control);
        if (!completed || request !== navigationId) return;
      }
      window.dispatchEvent(new Event('site:before-navigation'));
      document.body.append(dock);
      if (push) history.pushState({siteMusic: true}, '', url);
      document.documentElement.className = next.documentElement.className;
      document.documentElement.style.cssText = next.documentElement.style.cssText;
      document.body.className = next.body.className;
      document.title = next.title;
      const section = next.documentElement.getAttribute('data-section');
      if (section) document.documentElement.setAttribute('data-section', section);
      else document.documentElement.removeAttribute('data-section');
      current.replaceWith(document.importNode(view, true));
      renderedURL = new URL(url.href);
      placeDock();
      window.dispatchEvent(new Event('site:navigation'));
      const main = document.getElementById('main');
      main?.setAttribute('tabindex', '-1');
      main?.focus({preventScroll: true});
      window.scrollTo(0, 0);
      if (url.hash) document.getElementById(decodeURIComponent(url.hash.slice(1)))?.scrollIntoView();
    } catch (error) {
      if (request !== navigationId || control?.cancelled || error.name === 'AbortError') return;
      save(); location.assign(url.href);
    } finally {
      if (scrollReturn === control) scrollReturn = null;
      if (request === navigationId) { navigationBusy = false; touch = null; }
    }
  };
  // Scroll distance owns the reverse timeline. No clock advances a paused gesture.
  let touch = null;
  const returnLink = () => {
    if (!window.SiteTransition || document.hidden || window.scrollY > 2 || (navigationBusy && !scrollReturn)) return null;
    return document.querySelector('[data-thought-return]');
  };
  const editing = target => target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
  const scrubHome = (link, distance) => {
    if (scrollReturn) {
      const control = scrollReturn;
      control.distance = Math.max(0, Math.min(control.length, control.distance + distance));
      control.progress = control.distance / control.length;
      if (control.progress <= 0 && !control.seek) cancelScrollReturn();
      else control.seek?.(control.progress);
      return;
    }
    if (distance <= 0 || !window.SiteTransition || navigationBusy) return;
    const url = new URL(link.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return;
    const length = Math.max(180, Math.min(420, window.innerHeight * .55));
    const control = {distance:Math.min(length, distance), length, progress:Math.min(1, distance / length), seek:null, cancelled:false};
    scrollReturn = control;
    void navigate(url, true, 'reverse', control);
  };
  document.addEventListener('wheel', event => {
    const link = returnLink();
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || editing(event.target) || !event.deltaY || Math.abs(event.deltaX) > Math.abs(event.deltaY) || (!scrollReturn && event.deltaY >= 0)) return;
    event.preventDefault();
    scrubHome(link, -event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1));
  }, {passive:false});
  document.addEventListener('touchstart', event => {
    touch = event.touches.length === 1 && returnLink() && !editing(event.target)
      ? {x:event.touches[0].clientX, y:event.touches[0].clientY, lastY:event.touches[0].clientY, direction:scrollReturn?.touchDirection || 0} : null;
  }, {passive:true});
  document.addEventListener('touchmove', event => {
    const link = returnLink();
    if (!touch || !link || event.defaultPrevented || event.touches.length !== 1) { touch = null; return; }
    const dy = event.touches[0].clientY - touch.y;
    const dx = event.touches[0].clientX - touch.x;
    if (!touch.direction) {
      if (Math.abs(dx) >= Math.abs(dy)) { touch = null; return; }
      const staticPage = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) <= window.innerHeight + 2;
      if (dy > 0 || (dy < 0 && staticPage && !scrollReturn)) touch.direction = dy > 0 ? 1 : -1;
      else if (scrollReturn && dy < 0) touch.direction = 1;
      else { touch = null; return; }
    }
    event.preventDefault();
    const distance = (event.touches[0].clientY - touch.lastY) * touch.direction;
    const direction = touch.direction;
    touch.lastY = event.touches[0].clientY;
    scrubHome(link, distance);
    if (scrollReturn) scrollReturn.touchDirection = direction;
  }, {passive:false});
  const clearGesture = () => { touch = null; };
  document.addEventListener('touchend', clearGesture, {passive:true});
  document.addEventListener('touchcancel', clearGesture, {passive:true});
  window.addEventListener('site:before-navigation', clearGesture);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && scrollReturn) { event.preventDefault(); cancelScrollReturn(); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancelScrollReturn(); });
  window.addEventListener('resize', cancelScrollReturn);
  document.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target.closest('a,button');
    if (!target || target.closest('[data-music-dock],[data-entry]') || target.hasAttribute('data-entry-replay')) return;
    if (target.matches('[data-filter],[data-reset]')) { explore(); return; }
    if (target.tagName !== 'A' || target.hasAttribute('download') || (target.target && target.target !== '_self')) return;
    const url = new URL(target.href);
    if (url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) return;
    if (target.classList.contains('skip-link')) return;
    explore();
    if (url.pathname === location.pathname && url.search === location.search) {
      if (enabled && !url.hash) event.preventDefault();
      return;
    }
    const transition = window.SiteTransition && (target.hasAttribute('data-thought-return') ? 'reverse' : target.hasAttribute('data-thought-entry'));
    if ((!enabled && !transition) || !url.pathname.endsWith('.html')) return;
    event.preventDefault();
    void navigate(url, true, transition);
  });
  window.addEventListener('popstate', () => {
    cancelScrollReturn();
    window.SiteTransition?.cancel();
    const url = new URL(location.href);
    if (url.pathname !== renderedURL.pathname || url.search !== renderedURL.search) void navigate(url, false);
    else { navigationId += 1; navigationAbort?.abort(); navigationBusy = false; renderedURL = url; }
  });
  // A full reload can restore progress; failed autoplay keeps the visible music control.
  if (saved.enabled && !document.querySelector('[data-entry]')) void start();
})();
