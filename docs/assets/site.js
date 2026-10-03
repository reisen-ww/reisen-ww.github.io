(() => {
  'use strict';
  let dispose = () => {};
  const initialize = (autoEntry = true) => {
  dispose();
  const listeners = [];
  const cleanup = [];
  const listen = (target, name, handler, options) => {
    target?.addEventListener(name, handler, options);
    listeners.push(() => target?.removeEventListener?.(name, handler, options));
  };
  dispose = () => { cleanup.forEach(stop => stop()); listeners.forEach(remove => remove()); };
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const menu = document.querySelector('.mobile-menu');
  if (menu) {
    listen(document, 'keydown', (event) => {
      if (event.key === 'Escape' && menu.open) {
        menu.open = false;
        menu.querySelector('summary').focus();
      }
    });
    listen(document, 'click', (event) => {
      if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
  }
  const listing = document.querySelector('[data-listing]');
  if (listing) {
    const cards = [...listing.querySelectorAll('[data-card]')];
    const buttons = [...listing.querySelectorAll('[data-filter]')];
    const input = listing.querySelector('[data-search-input]');
    const results = listing.querySelector('[data-results]');
    const empty = listing.querySelector('[data-empty]');
    const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().trim();
    const cache = new Map(cards.map((card) => [card, normalize(card.dataset.search)]));
    let category = 'all';
    const urlCategory = new URLSearchParams(location.search).get('category');
    if (buttons.some((button) => button.dataset.filter === urlCategory)) category = urlCategory;
    const update = () => {
      const query = normalize(input.value);
      let count = 0;
      cards.forEach((card) => {
        const show = (category === 'all' || card.dataset.category === category) && cache.get(card).includes(query);
        card.hidden = !show;
        if (show) count += 1;
      });
      buttons.forEach((button) => {
        const active = button.dataset.filter === category;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      });
      results.textContent = '显示 ' + count + ' / ' + cards.length + ' 条内容';
      empty.hidden = count > 0;
    };
    listing.querySelector('.tools').hidden = false;
    results.hidden = false;
    buttons.forEach((button) => listen(button, 'click', () => {
      category = button.dataset.filter;
      update();
    }));
    listen(input, 'input', update);
    listen(listing.querySelector('[data-reset]'), 'click', () => {
      category = 'all';
      input.value = '';
      update();
      input.focus();
    });
    update();
  }
  const home = document.querySelector('.home-main');
  const halo = document.querySelector('[data-halo]');
  if (home && halo) {
    const portals = [...home.querySelectorAll('[data-halo-colour]')];
    const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activePortal = null;
    let frame = 0;
    let lastTime = 0;
    let spin = 0;
    let targetSpin = 0;
    const tick = (now) => {
      frame = 0;
      if (!activePortal) return;
      const dt = lastTime ? Math.min(64, now - lastTime) : 16;
      lastTime = now;
      const turn = motionPreference.matches ? 1 : 1 - Math.exp(-dt / 130);
      spin += (targetSpin - spin) * turn;
      if (Math.abs(targetSpin - spin) < 0.05) {
        spin = targetSpin;
        halo.style.setProperty('--halo-spin', `${spin}deg`);
        return;
      }
      halo.style.setProperty('--halo-spin', `${spin}deg`);
      frame = requestAnimationFrame(tick);
    };
    const activate = (portal) => {
      if (portal === activePortal) return;
      if (document.body.classList.contains('entry-active')) return;
      cancelAnimationFrame(frame);
      frame = 0;
      if (activePortal) activePortal.classList.remove('is-lit');
      activePortal = portal;
      activePortal.classList.add('is-lit');
      home.style.setProperty('--halo-colour', portal.dataset.haloColour);
      const desired = 25 - Number(portal.dataset.haloIndex) * 360 / portals.length;
      const current = ((spin % 360) + 360) % 360;
      const delta = ((((desired - current) % 360) + 540) % 360) - 180;
      targetSpin = spin + delta;
      if (motionPreference.matches) spin = targetSpin;
      halo.style.setProperty('--halo-spin', `${spin}deg`);
      home.classList.add('halo-active');
      if (!motionPreference.matches) {
        lastTime = 0;
        frame = requestAnimationFrame(tick);
      }
    };
    const reset = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      if (activePortal) activePortal.classList.remove('is-lit');
      activePortal = null;
      home.classList.remove('halo-active');
    };
    cleanup.push(reset);
    listen(home, 'pointerleave', reset);
    portals.forEach(portal => {
      listen(portal, 'pointerenter', event => {
        if (event.pointerType !== 'touch') activate(portal);
      }, { passive: true });
      listen(portal, 'pointerleave', () => {
        if (portal === activePortal) reset();
      }, { passive: true });
      listen(portal, 'focus', () => activate(portal));
      listen(portal, 'blur', () => {
        if (portal === activePortal) reset();
      });
    });
    listen(window, 'blur', reset);
    listen(window, 'pagehide', reset);
    listen(document, 'visibilitychange', () => { if (document.hidden) reset(); });
    listen(document.querySelector('[data-entry-replay]'), 'click', reset);
  }
  const entry = document.querySelector('[data-entry]');
  const replay = document.querySelector('[data-entry-replay]');
  if (entry && replay && typeof entry.showModal === 'function') {
    const phases = [
      ['01 / 03', 'NOTES & IDEAS', '把想法写下来。'],
      ['02 / 03', 'PROJECTS & PROCESS', '让过程留下证据。'],
      ['03 / 03', 'HELLO, THERE', '保持好奇，欢迎进来。'],
    ];
    const phase = entry.querySelector('[data-entry-phase]');
    const step = entry.querySelector('[data-entry-step]');
    const message = entry.querySelector('[data-entry-message]');
    const meter = entry.querySelector('[data-entry-meter]');
    const progress = entry.querySelector('[data-entry-progress]');
    const segments = [...entry.querySelectorAll('[data-entry-colour]')];
    const fills = segments.map(segment => segment.querySelector('.rainbow-fill'));
    const portals = [...document.querySelectorAll('.colour-portals .colour-portal')];
    const copies = segments.map(segment => segment.querySelector('.rainbow-copy'));
    const soundButton = entry.querySelector('[data-entry-sound]');
    const choice = entry.querySelector('[data-entry-choice]');
    const sequence = entry.querySelector('[data-entry-sequence]');
    const beginButton = entry.querySelector('[data-entry-begin]');
    const mutedButton = entry.querySelector('[data-entry-muted]');
    const duration = 4500;
    const fadeDuration = 650;
    const seenKey = 'personal-site-entry-music-v2';
    let timers = [];
    let reels = [];
    let morphs = [];
    let frame = 0;
    let startedAt = 0;
    let lastProgress = -1;
    let closing = false;
    let motionOff = reducedMotion;
    let replaying = false;
    let audioPlaying = false;
    let audioStartedAt = 0;
    let audioAttempt = 0;
    let currentPhase = -1;
    const stopAudio = () => {
      audioAttempt += 1;
      if (audioPlaying) startedAt = performance.now() - Math.max(0, window.SiteMusic.position - audioStartedAt) * 1000;
      audioPlaying = false;
      if (soundButton) soundButton.disabled = false;
      if (window.SiteMusic?.pending) window.SiteMusic.mute();
    };
    const clearTimers = () => {
      timers.forEach(clearTimeout);
      timers = [];
      cancelAnimationFrame(frame);
      reels.forEach(animation => animation.cancel());
      reels = [];
      morphs.forEach(animation => animation.cancel());
      morphs = [];
      copies.forEach(copy => {
        copy.removeAttribute('style');
        copy.querySelector('.icon')?.removeAttribute('style');
      });
    };
    const rollText = (element, text) => {
      const previous = element.dataset.text || '';
      element.dataset.text = text;
      const label = document.createElement('span');
      label.className = 'sr-only';
      label.textContent = text;
      const visual = document.createElement('span');
      visual.className = 'reel-word';
      visual.setAttribute('aria-hidden', 'true');
      Array.from(text).forEach((character, index) => {
        const cell = document.createElement('span');
        cell.className = 'reel-cell' + (/[^\x00-\x7F]/.test(character) ? ' reel-wide' : '');
        const track = document.createElement('span');
        track.className = 'reel-track';
        const pool = /[^\x00-\x7F]/.test(character) ? Array.from('想法过程留下证据保持好奇') : Array.from('NOTES0123456789&PROCESS');
        const characters = [previous[index] || character, ...Array.from({ length: 8 }, (_, n) => pool[(index + n * 3) % pool.length]), character];
        characters.forEach(letter => {
          const row = document.createElement('span');
          row.textContent = letter === ' ' ? '\u00a0' : letter;
          track.append(row);
        });
        track.style.transform = 'translateY(-90%)';
        cell.append(track);
        visual.append(cell);
        if (!motionOff && typeof track.animate === 'function') {
          reels.push(track.animate([
            { transform: 'translateY(0)', offset: 0 },
            { transform: 'translateY(-60%)', offset: 0.42 },
            { transform: 'translateY(-30%)', offset: 0.58, easing: 'cubic-bezier(.12,.8,.2,1)' },
            { transform: 'translateY(-90%)', offset: 1 },
          ], { duration: 620 + index * 12, easing: 'linear' }));
        }
      });
      element.replaceChildren(label, visual);
    };
    const showPhase = (index) => {
      currentPhase = index;
      reels.forEach(animation => animation.cancel());
      reels = [];
      phase.textContent = phases[index][0];
      rollText(step, phases[index][1]);
      rollText(message, phases[index][2]);
    };
    const setProgress = (value) => {
      if (value === lastProgress) return;
      lastProgress = value;
      meter.setAttribute('aria-valuenow', String(value));
      progress.textContent = String(value).padStart(3, '0') + '%';
    };
    const showLoad = (elapsed) => {
      const amount = Math.max(0, Math.min(1, elapsed / duration)) * segments.length;
      const index = Math.min(segments.length - 1, Math.floor(amount));
      entry.style.setProperty('--entry-colour', segments[index].dataset.entryColour);
      entry.style.setProperty('--entry-glow', String(.65 + Math.min(1, amount - index) * .35));
      entry.dataset.entrySegment = String(index);
      fills.forEach((fill, n) => {
        const loaded = Math.max(0, Math.min(1, amount - n));
        fill.style.transform = `scaleX(${loaded})`;
      });
      setProgress(Math.min(100, Math.floor(elapsed / duration * 100)));
    };
    const tick = (now) => {
      const elapsed = audioPlaying && window.SiteMusic?.enabled ? Math.max(0, window.SiteMusic.position - audioStartedAt) * 1000 : now - startedAt;
      showLoad(elapsed);
      if (audioPlaying) {
        const index = Math.min(phases.length - 1, Math.floor(elapsed / (duration / phases.length)));
        if (index !== currentPhase) showPhase(index);
      }
      if (elapsed >= duration) { closeEntry(true); return; }
      if (entry.open && !closing && lastProgress < 100) frame = requestAnimationFrame(tick);
    };
    const finishEntry = () => {
      clearTimers();
      stopAudio();
      if (entry.open) entry.close();
      entry.classList.remove('entry-leaving', 'entry-morph');
      document.body.classList.remove('entry-active', 'entry-leaving', 'entry-morph');
      closing = false;
      const target = replaying ? replay : document.getElementById('main');
      if (target) {
        if (!replaying) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    };
    const morphToPortals = () => {
      // Measure both layouts before fixing the same seven strips above the fading dialog.
      const starts = segments.map(segment => segment.getBoundingClientRect());
      const ends = portals.map(portal => portal.getBoundingClientRect());
      const styles = portals.map(portal => getComputedStyle(portal));
      const box = rect => ({ left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      entry.classList.add('entry-morph');
      document.body.classList.add('entry-morph');
      segments.forEach((segment, index) => {
        const copy = copies[index];
        const style = styles[index];
        ['padding', 'gap', 'alignItems'].forEach(name => { copy.style[name] = style[name]; });
        const icon = copy.querySelector('.icon');
        const portalIcon = portals[index].querySelector('.icon');
        if (icon && portalIcon) {
          const iconStyle = getComputedStyle(portalIcon);
          ['position', 'top', 'right', 'width', 'height'].forEach(name => { icon.style[name] = iconStyle[name]; });
        }
        morphs.push(segment.animate([box(starts[index]), box(ends[index])], { duration: fadeDuration, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }));
        morphs.push(copy.animate([
          { opacity: 0, transform: 'translateY(8px)', offset: 0 },
          { opacity: 0, transform: 'translateY(8px)', offset: .28 },
          { opacity: 1, transform: 'translateY(0)', offset: 1 },
        ], { duration: fadeDuration, easing: 'ease', fill: 'both' }));
      });
    };
    const closeEntry = (completed = false) => {
      if (!entry.open || closing) return;
      clearTimers();
      stopAudio();
      closing = true;
      if (motionOff) { finishEntry(); return; }
      if (completed === true && portals.length === segments.length && segments.every(segment => typeof segment.animate === 'function')) morphToPortals();
      entry.classList.add('entry-leaving');
      document.body.classList.add('entry-leaving');
      timers.push(setTimeout(finishEntry, fadeDuration));
    };
    const startSequence = () => {
      if (!entry.open || closing) return;
      clearTimers();
      showPhase(0);
      lastProgress = -1;
      showLoad(0);
      const elapsed = audioPlaying ? Math.max(0, window.SiteMusic.position - audioStartedAt) * 1000 : 0;
      startedAt = performance.now() - elapsed;
      frame = requestAnimationFrame(tick);
      timers.push(setTimeout(() => { if (!audioPlaying) showPhase(1); }, Math.max(0, duration / 3 - elapsed)));
      timers.push(setTimeout(() => { if (!audioPlaying) showPhase(2); }, Math.max(0, duration * 2 / 3 - elapsed)));
      timers.push(setTimeout(() => { if (!audioPlaying) { showLoad(duration); closeEntry(true); } }, Math.max(0, duration - elapsed)));
    };
    const playSequence = async () => {
      const attempt = ++audioAttempt;
      beginButton.disabled = true;
      beginButton.textContent = '准备音乐…';
      const playing = await window.SiteMusic?.start({restart: true});
      if (attempt !== audioAttempt || !entry.open || closing) return;
      beginButton.disabled = false;
      beginButton.textContent = '有声进入';
      audioPlaying = !!playing; audioStartedAt = 0;
      choice.hidden = true; sequence.hidden = false;
      entry.classList.remove('entry-waiting');
      soundButton.hidden = motionOff || !window.SiteMusic;
      soundButton.textContent = playing ? '关闭音乐' : '开启音乐重播';
      soundButton.setAttribute('aria-pressed', String(!!playing));
      if (motionOff) { showPhase(2); showLoad(duration); finishEntry(); }
      else { sequence.querySelector('[data-entry-close]')?.focus(); startSequence(); }
    };
    const openEntry = (manual = false) => {
      if (entry.open) return;
      clearTimers();
      stopAudio();
      replaying = manual;
      closing = false;
      motionOff = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      entry.classList.toggle('entry-still', motionOff);
      showPhase(motionOff ? 2 : 0);
      lastProgress = -1;
      showLoad(motionOff ? duration : 0);
      choice.hidden = false; sequence.hidden = true;
      beginButton.disabled = false; mutedButton.disabled = false;
      beginButton.textContent = '有声进入';
      entry.classList.add('entry-waiting');
      if (soundButton) soundButton.hidden = true;
      document.body.classList.add('entry-active');
      entry.showModal();
      entry.scrollTop = 0;
      if (!motionOff) {
        if (manual && window.SiteMusic?.enabled) void playSequence();
      }
    };
    listen(beginButton, 'click', () => { if (!closing) void playSequence(); });
    listen(mutedButton, 'click', () => {
      if (closing) return;
      window.SiteMusic?.mute(); stopAudio();
      choice.hidden = true; sequence.hidden = false; entry.classList.remove('entry-waiting');
      soundButton.hidden = motionOff || !window.SiteMusic;
      if (motionOff) { showPhase(2); showLoad(duration); finishEntry(); }
      else { sequence.querySelector('[data-entry-close]')?.focus(); startSequence(); }
    });
    listen(soundButton, 'click', () => {
      if (!entry.open || closing || motionOff) return;
      if (window.SiteMusic?.enabled) {
        stopAudio();
        window.SiteMusic.mute();
        soundButton.textContent = '开启音乐重播';
        soundButton.setAttribute('aria-pressed', 'false');
      } else void playSequence();
    });
    listen(document, 'site:music-state', event => {
      if (!event.detail.enabled && audioPlaying) stopAudio();
      soundButton.disabled = event.detail.pending;
      beginButton.disabled = event.detail.pending;
      if (!event.detail.pending) beginButton.textContent = '有声进入';
      soundButton.textContent = event.detail.enabled ? '关闭音乐' : '开启音乐重播';
      soundButton.setAttribute('aria-pressed', String(event.detail.enabled));
    });
    listen(document, 'visibilitychange', () => { if (document.hidden) stopAudio(); });
    listen(window, 'pagehide', stopAudio);
    entry.querySelectorAll('[data-entry-close]').forEach(button => listen(button, 'click', closeEntry));
    listen(entry, 'cancel', event => {
      event.preventDefault();
      closeEntry();
    });
    listen(entry, 'close', () => {
      if (document.body.classList.contains('entry-active')) finishEntry();
    });
    replay.hidden = false;
    listen(replay, 'click', () => openEntry(true));
    cleanup.push(() => { clearTimers(); stopAudio(); if (entry.open) entry.close(); document.body.classList.remove('entry-active', 'entry-leaving', 'entry-morph'); });
    let seen = false;
    try { seen = sessionStorage.getItem(seenKey) === '1'; } catch (_) {}
    const navigation = performance.getEntriesByType('navigation')[0];
    if (autoEntry && !seen && !reducedMotion && !location.hash && navigation?.type !== 'back_forward') {
      try { sessionStorage.setItem(seenKey, '1'); } catch (_) {}
      openEntry();
    }
  }
  };
  window.addEventListener('site:before-navigation', () => dispose());
  window.addEventListener('site:navigation', () => initialize(false));
  initialize();
})();
