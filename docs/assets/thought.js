(() => {
  'use strict';
  // The existing navigator owns URL/history/audio. This module owns only its visual handoff.
  const duration = 2800; // Shared path coordinates; independent of playback speed.
  const playbackDuration = 1600;
  const redImpact = 1690;
  const whiteImpact = 1760;
  let generation = 0;
  let activeFinish = null;
  const clamp = value => Math.max(0, Math.min(1, value));
  const range = (time, start, end) => clamp((time - start) / (end - start));
  const ease = value => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;
  const mix = (a, b, value) => a + (b - a) * value;
  const colour = (a, b, value) => 'rgb(' + a.map((v, index) => Math.round(mix(v, b[index], value))).join(',') + ')';
  const cancel = () => { generation += 1; activeFinish?.(false); };

  const run = async (current, next, url, isCurrent = () => true, reverse = false, control = null) => {
    cancel();
    const token = generation;
    const home = reverse ? next : current;
    const scene = reverse ? current : next;
    const portal = home.querySelector('[data-thought-entry]');
    const heading = home.querySelector('.home-copy h1');
    const art = scene.querySelector('[data-thought-art]');
    if (!portal || !heading || !art || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
    // Resolve the incoming page's asset against its own URL, including a Pages subdirectory.
    const href = new URL(art.querySelector('image').getAttribute('href'), reverse ? location.href : url).href;
    try {
      const assets = [href];
      if (reverse) home.querySelectorAll('img').forEach(image => assets.push(new URL(image.getAttribute('src'), url).href));
      await Promise.all(assets.map(async src => {
        const preload = new Image();
        preload.src = src;
        await preload.decode();
      }));
    } catch (_) { return isCurrent() && token === generation; }
    if (!isCurrent() || token !== generation || document.hidden) return false;

    const overlay = document.createElement('div');
    overlay.className = 'thought-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.dataset.thoughtDuration = String(playbackDuration);
    overlay.dataset.thoughtMode = control ? 'scroll' : 'automatic';
    overlay.dataset.thoughtDirection = reverse ? 'reverse' : 'forward';
    const incoming = document.importNode(next, true);
    incoming.classList.add('thought-preview');
    if (reverse) incoming.classList.add('thought-home-preview');
    incoming.inert = true;
    incoming.querySelector('.skip-link')?.remove();
    if (reverse) {
      incoming.querySelector('.entry-screen')?.remove();
      incoming.querySelectorAll('img').forEach(image => image.setAttribute('src', new URL(image.getAttribute('src'), url).href));
    }
    const svg = reverse ? art : incoming.querySelector('[data-thought-art]');
    const image = svg.querySelector('image');
    const originalHref = image.getAttribute('href');
    image.setAttribute('href', href);
    const circles = [svg.querySelector('[data-ink-red]'), svg.querySelector('[data-ink-white]')];
    const originalRadii = circles.map(circle => circle.getAttribute('r'));
    circles.forEach(circle => circle.setAttribute('r', reverse ? '2100' : '0'));
    overlay.append(incoming);
    // The home must be attached at its final size before measuring its sources.
    if (reverse) document.body.append(overlay);
    const sources = reverse ? [incoming.querySelector('[data-thought-entry]'), incoming.querySelector('.home-copy h1')] : [portal, heading];
    const drops = sources.map((source, index) => {
      const rect = source.getBoundingClientRect();
      const drop = document.createElement('div');
      drop.className = 'thought-drop thought-drop-' + (index ? 'white' : 'red');
      const fill = document.createElement('div');
      fill.className = 'thought-drop-fill';
      const copy = document.createElement('div');
      copy.className = 'thought-drop-copy';
      if (index) {
        const clone = source.cloneNode(true);
        const computed = getComputedStyle(source);
        clone.style.font = computed.font;
        clone.style.letterSpacing = computed.letterSpacing;
        clone.style.color = computed.color;
        const originalEm = source.querySelector('em');
        const em = clone.querySelector('em');
        if (em && originalEm) {
          em.style.cssText = 'font-style:normal;color:transparent;background-clip:text;-webkit-background-clip:text';
          em.style.backgroundImage = getComputedStyle(originalEm).backgroundImage;
        }
        copy.append(clone);
      } else {
        [...source.children].forEach(child => copy.append(child.cloneNode(true)));
        copy.style.padding = getComputedStyle(source).padding;
      }
      drop.append(fill, copy);
      const splash = document.createElement('div');
      splash.className = 'thought-splash';
      overlay.append(drop, splash);
      splash.style.color = index ? '#f5e5d5' : '#f61d20';
      return {drop, fill, copy, splash, rect, visibility: source.style.visibility, radius:reverse ? '2100' : '0'};
    });
    document.body.append(overlay);
    const width = overlay.clientWidth;
    const height = overlay.clientHeight;
    // Measure the SVG in its final position before sliding it below the viewport.
    const matrix = svg.getScreenCTM();
    const targets = circles.map(circle => {
      const x = Number(circle.getAttribute('cx'));
      const y = Number(circle.getAttribute('cy'));
      return {x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f};
    });
    drops.forEach((state, index) => {
      state.splash.style.left = targets[index].x + 'px';
      state.splash.style.top = targets[index].y + 'px';
    });
    const transform = current.style.transform;
    const willChange = current.style.willChange;
    const inert = current.inert;
    current.style.willChange = 'transform';
    current.inert = true;
    sources.forEach(source => { source.style.visibility = 'hidden'; });
    document.body.classList.add('thought-transitioning');

    return new Promise(resolve => {
      let frame = 0;
      let done = false;
      const started = performance.now();
      const finish = completed => {
        if (done) return;
        done = true;
        cancelAnimationFrame(frame);
        if (control) control.seek = null;
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('visibilitychange', onHidden);
        window.removeEventListener('resize', onResize);
        current.style.transform = transform;
        current.style.willChange = willChange;
        current.inert = inert;
        sources.forEach((source, index) => { source.style.visibility = drops[index].visibility; });
        if (reverse) {
          circles.forEach((circle, index) => circle.setAttribute('r', originalRadii[index]));
          image.setAttribute('href', originalHref);
        }
        document.body.classList.remove('thought-transitioning');
        overlay.remove();
        activeFinish = null;
        if (!completed && !document.hidden) (reverse ? current.querySelector('[data-thought-return]') : portal)?.focus?.({preventScroll:true});
        resolve(completed);
      };
      const onKey = event => { if (event.key === 'Escape') { event.preventDefault(); finish(false); } };
      const onHidden = () => { if (document.hidden) finish(false); };
      // Resize invalidates geometry. A paused gesture restores the scene for another attempt.
      const onResize = () => finish(!control);
      document.addEventListener('keydown', onKey);
      document.addEventListener('visibilitychange', onHidden);
      window.addEventListener('resize', onResize);
      activeFinish = finish;
      const render = progress => {
        const time = duration * (reverse ? 1 - progress : progress);
        overlay.dataset.thoughtProgress = String(progress);
        overlay.dataset.thoughtElapsed = String(Math.round(progress * playbackDuration));
        overlay.dataset.thoughtTime = String(Math.round(time));
        overlay.dataset.thoughtPhase = reverse
          ? time >= redImpact ? 'gathering-ink' : time >= 950 ? 'rising' : time >= 480 ? 'reuniting' : 'restoring'
          : time < 480 ? 'condensing' : time < 950 ? 'separating' : time < redImpact ? 'falling' : 'painting';
        const slide = ease(range(time, 430, 1470));
        current.style.transform = 'translate3d(0,' + (reverse ? height * (1 - slide) : -height * slide) + 'px,0)';
        incoming.style.transform = 'translate3d(0,' + (reverse ? -height * slide : height * (1 - slide)) + 'px,0)';
        drops.forEach((state, index) => {
          const {drop, fill, copy, splash, rect} = state;
          const target = targets[index];
          const condense = ease(range(time, 0, 480));
          const split = ease(range(time, 480, 950));
          const impact = index ? whiteImpact : redImpact;
          const fall = range(time, 950, impact);
          const gatherX = width * (index ? .505 : .455);
          const gatherY = height * (index ? .215 : .245);
          const releaseX = Math.max(26, Math.min(width - 26, target.x + width * (index ? .09 : -.13)));
          const releaseY = Math.min(height * (index ? .14 : .23), target.y - 100);
          let x = mix(rect.left + rect.width / 2, gatherX, condense);
          let y = mix(rect.top + rect.height / 2, gatherY, condense);
          if (time >= 480) { x = mix(gatherX, releaseX, split); y = mix(gatherY, releaseY, split); }
          if (time >= 950) { x = mix(releaseX, target.x, ease(fall)); y = mix(releaseY, target.y, fall ** 2.15); }
          const w = mix(rect.width, 30, condense);
          const h = mix(rect.height, 30, condense);
          if (drop.style.width !== w + 'px') drop.style.width = w + 'px';
          if (drop.style.height !== h + 'px') drop.style.height = h + 'px';
          drop.style.borderRadius = mix(3, 50, condense) + '% ' + mix(3, 8, condense) + '% ' + mix(3, 50, condense) + '% ' + mix(3, 50, condense) + '%';
          const squash = range(time, impact, impact + 110);
          drop.style.transform = 'translate3d(' + (x - w / 2) + 'px,' + (y - h / 2) + 'px,0) rotate(' + (-45 * condense) + 'deg) scale(' + mix(1, .25, squash) + ',' + ((1 + Math.sin(fall * Math.PI) * .28) * (1 - squash)) + ')';
          drop.style.opacity = String(1 - squash);
          copy.style.opacity = String(1 - range(time, 70, 340));
          fill.style.opacity = String(index ? condense : 1);
          fill.style.backgroundColor = colour(index ? [238, 238, 242] : [248, 102, 118], index ? [245, 229, 213] : [246, 29, 32], range(time, 950, impact));
          const ink = range(time, impact, impact + 920);
          const radius = String(2100 * (1 - (1 - ink) ** 2.4));
          if (state.radius !== radius) { circles[index].setAttribute('r', radius); state.radius = radius; }
          splash.style.opacity = String(time < impact ? 0 : (1 - range(time, impact, impact + 410)) * .7);
          splash.style.transform = 'scale(' + mix(.1, 2.1, range(time, impact, impact + 410)) + ')';
        });
      };
      const seek = value => {
        if (done) return;
        if (!isCurrent() || generation !== token) { finish(false); return; }
        const progress = clamp(value);
        render(progress);
        if (progress >= 1) finish(true);
      };
      if (control) {
        let displayed = 0;
        let target = 0;
        let lastFrame = performance.now();
        let changedAt = lastFrame;
        const smooth = now => {
          frame = 0;
          const delta = Math.max(0, Math.min(40, now - lastFrame));
          lastFrame = now;
          displayed += (target - displayed) * (1 - Math.exp(-delta / 45));
          if (now - changedAt >= 180 || Math.abs(target - displayed) < .0001) displayed = target;
          seek(displayed);
          if (!done && displayed === 0 && target === 0) finish(false);
          if (!done && displayed !== target) frame = requestAnimationFrame(smooth);
        };
        control.seek = value => {
          target = clamp(value);
          changedAt = performance.now();
          if (!frame) { lastFrame = changedAt; frame = requestAnimationFrame(smooth); }
        };
        render(0);
        control.seek(control.progress);
      } else {
        const tick = now => {
          seek((now - started) / playbackDuration);
          if (!done) frame = requestAnimationFrame(tick);
        };
        tick(started);
      }
    });
  };
  window.SiteTransition = {run, cancel};
  window.addEventListener('pagehide', cancel);
})();
