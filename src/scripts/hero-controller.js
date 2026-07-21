/* ==========================================================================
   hero-controller.js
   --------------------------------------------------------------------------
   Ties scroll position → frame index on a pinned hero canvas, with an
   autoplay fallback that kicks in when the user hasn't scrolled for a while
   (often the case above-the-fold on long sessions).

   Scroll math
     The page is laid out (see index.html) as:
        <section class="hero-scene" sticky />  ← canvas + overlay, 100vh
         <section class="hero-spacer" />        ← 188.6vh of scroll runway

     Scroll progress P is computed as:
        P = (scrollY − sceneTop) / (scrollRunway)
     where scrollRunway = (heroSpacer height).
     We clamp P to [0,1] and multiply by (frameCount − 1) → frameIndex.

   Why not IntersectionObserver + scrollend?
     IntersectionObserver gives discrete updates, not the continuous scrub
     feel Apple's pages have. We use a rAF-throttled scroll listener so
     scrolling fires a single rAF callback per frame regardless of how
     many scroll events the browser dispatches.

   Performance
     - One rAF loop, gated by a `dirty` flag so we only redraw when needed
       (scroll moved OR autoplay advanced).
     - We don't allocate per-frame; the only allocations are at attach time.
     - Scroll info is read from `window.scrollY` (cheap on modern browsers;
       no layout reflow because we don't read `offsetTop` per tick).
   ========================================================================== */

export class HeroController {
  /**
   * @param {object} cfg
   * @param {import('./canvas-image-sequence.js').CanvasImageSequence} cfg.sequence
   * @param {HTMLElement} cfg.sceneEl  .hero-scene (sticky)
   * @param {HTMLElement} cfg.spacerEl  .hero-spacer (runway)
   * @param {object}   [cfg.options]
   * @param {boolean}  [cfg.options.autoplay=true]     enable idle autoplay
   * @param {number}   [cfg.options.autoplayFps=12]     idle play rate
   * @param {number}   [cfg.options.idleMs=2500]       pause before autoplay resumes
   */
  constructor({ sequence, sceneEl, spacerEl, options = {} }) {
    this.seq = sequence;
    this.sceneEl = sceneEl;
    this.spacerEl = spacerEl;

    const o = { autoplay: true, autoplayFps: 12, idleMs: 2500, ...options };
    this.autoplay = o.autoplay;
    this.autoplayFps = o.autoplayFps;
    this.idleMs = o.idleMs;

    this._frame = 0;          // last drawn frame
    this._dirty = false;      // requests a redraw on the next rAF tick
    this._lastInteraction = performance.now();
    this._autoplayPhase = 0;  // accumulated idle play progress
    this._reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Bound callbacks; we keep single bound refs so removeEventListener works.
    this._onScroll = this._onScroll.bind(this);
    this._onResize = this._onResize.bind(this);
    this._onInteract = this._onInteract.bind(this);
    this._tick = this._tick.bind(this);

    this._raf = 0;
    this._running = false;
  }

  // -------------------------------------------------------------------------
  // Attach listeners + start the rAF loop.
  start() {
    if (this._running) return;
    this._running = true;

    window.addEventListener('scroll', this._onScroll, { passive: true });
    window.addEventListener('resize', this._onResize, { passive: true });
    window.addEventListener('orientationchange', this._onResize, { passive: true });
    // Interaction suppresses autoplay for a grace period so a mouse move on
    // the hero doesn't yank the scrub frame around.
    window.addEventListener('pointerdown', this._onInteract, { passive: true });
    window.addEventListener('keydown', this._onInteract, { passive: true });
    window.addEventListener('wheel', this._onInteract, { passive: true });

    this._tick();
  }

  stop() {
    if (!this._running) return;
    this._running = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('scroll', this._onScroll);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.removeEventListener('pointerdown', this._onInteract);
    window.removeEventListener('keydown', this._onInteract);
    window.removeEventListener('wheel', this._onInteract);
  }

  // -------------------------------------------------------------------------
  // Compute progress through the hero as a number in [0,1].
  // - sceneTop  = where the hero-scene top sits (assumed 0 since the hero is
  //   the first section of the page; we read it lazily but cache per resize
  //   to avoid reflow churn).
  // - runway    = distance the user can scroll before the hero un-sticks.
  //   On our layout that's exactly the height of .hero-spacer.
  _progress() {
    // hero-scene is the first element and pinned to top:0, so its top
    // equals 0 for the duration of the scrub. We still read it defensively.
    const sceneTop = this._cachedSceneTop ?? 0;
    const runway = this._cachedRunway || this.spacerEl.offsetHeight;
    if (runway <= 0) return 0;
    const p = (window.scrollY - sceneTop) / runway;
    // Clamp to [0, 1] — past the hero we want to rest on the last frame.
    return p < 0 ? 0 : p > 1 ? 1 : p;
  }

  _onScroll() {
    // Mark dirty; the rAF loop will compute the frame and draw it. We don't
    // compute the frame here because the OS may fire dozens of scroll
    // events per frame on touchpad momentum scroll; rAF coalesces them.
    this._dirty = true;
    this._lastInteraction = performance.now();
    // Mark scrolled-once so the hint can fade out (CSS attribute hook).
    if (this.sceneEl.dataset.scrolled !== 'true') {
      this.sceneEl.dataset.scrolled = 'true';
    }
  }

  _onResize() {
    // Cache layout that's expensive to re-read per scroll tick.
    this._cachedSceneTop = this.sceneEl.offsetTop || 0;
    this._cachedRunway = this.spacerEl.offsetHeight;
    this.seq.resize();
    this.seq.redrawCurrent();
    this._dirty = true;
  }

  _onInteract() {
    this._lastInteraction = performance.now();
  }

  // -------------------------------------------------------------------------
  // Advance the idle autoplay phase. We accumulate dt in seconds, then
  // interpolate by autoplayFps so a "low fps" feels like a real film reel
  // rather than a slow creep. Loop the sequence so the hero never sits dead
  // above the fold.
  _advanceAutoplay(dt) {
    if (!this.autoplay || this._reduceMotion) return;
    this._autoplayPhase += dt * this.autoplayFps;
    const n = this.seq.length;
    if (n <= 1) return;
    // Loop: wrap into [0, n) — using floor + modulo keeps it integer-stable.
    const idx = Math.floor(this._autoplayPhase) % n;
    if (idx !== this._frame) {
      this._frame = idx;
      this._dirty = true;
    }
  }

  // -------------------------------------------------------------------------
  // The single rAF tick. Updates the target frame, then if dirty asks the
  // sequence to draw.
  _tick(now) {
    if (!this._running) return;
    const dt = this._lastTime ? Math.min((now - this._lastTime) / 1000, 0.1) : 0;
    this._lastTime = now;

    // Scrub target depends on progress. While the hero is pinned the user's
    // scroll should override autoplay; if the user is idle, autoplay takes
    // over and plays the loop.
    const idle = (now - this._lastInteraction) > this.idleMs;
    const p = this._progress();

    if (p > 0 && p < 1) {
      // User is mid-scrub inside the hero → show the scroll-tied frame.
      const target = Math.round(p * (this.seq.length - 1));
      if (target !== this._frame) {
        this._frame = target;
        this._dirty = true;
      }
      // Autoplay pauses while the user is in control.
      this._autoplayPhase = this._frame;
    } else if (p <= 0) {
      // At the very top of the hero (sticky-pinned at scrollY 0). The user
      // hasn't scrubbed yet — if they're idle, autoplay loops so the hero
      // looks alive on first paint. Hold the last frame otherwise.
      if (idle) {
        this._advanceAutoplay(dt);
      }
    }
    // p >= 1 — scrolled past hero onto the next page section. Freeze on
    // the last frame; the hero is no longer visible so no autoplay needed.

    if (this._dirty) {
      this._dirty = false;
      this.seq.drawFrame(this._frame);
    }

    this._raf = requestAnimationFrame(this._tick);
  }
}
