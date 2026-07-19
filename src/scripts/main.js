/* ==========================================================================
   main.js — Adversado hero entry point
   --------------------------------------------------------------------------
   Pulls the manifest, preloads, drives the loader UI, then hands off to the
   HeroController which runs the scroll-tied + autoplay rendering loop.

   Flow
     1. fetch(/frames-manifest.json) → list of frames
     2. FramePreloader loads all frames (12 parallel decodes)
     3. Progress callbacks update the crafted preloader UI:
          - percent counter
          - linear bar fill
          - caption ("Loading 142/300"…) for satisfying feedback
     4. On complete: hand frames to CanvasImageSequence, start controller,
        flip .hero-scene[data-state="ready"] so the overlay fades in.
     5. Fade out the preloader.
   ========================================================================== */

import '../styles/hero.css';
import { FramePreloader } from './frame-preloader.js';
import { CanvasImageSequence } from './canvas-image-sequence.js';
import { HeroController } from './hero-controller.js';

// ---------------------------------------------------------------------------
// DOM references. Cached once; we never re-query for the life of the page.
// Only the canvas, scene, spacer, preloader overlay, and bar fill remain —
// all other text elements (headline, CTAs, brand, caption, percent counter)
// were intentionally removed from the hero per project decision.
// ---------------------------------------------------------------------------
const canvas = document.getElementById('hero-canvas');
const sceneEl = document.querySelector('.hero-scene');
const spacerEl = document.querySelector('.hero-spacer');
const preloader = document.getElementById('preloader');
const barFill = document.getElementById('preloader-bar-fill');

// ---------------------------------------------------------------------------
// Wire-up. Wrap in try/catch so the user sees a friendly fallback if the
// manifest or a frame is missing — not a blank screen.
// ---------------------------------------------------------------------------
async function boot() {
  if (!canvas || !sceneEl || !spacerEl) {
    console.error('Hero DOM missing — check index.html.');
    return;
  }

  // Build the sequence + controller eagerly so resize during preload is
  // already correct (e.g. device rotating mid-load).
  const sequence = new CanvasImageSequence(canvas);
  const controller = new HeroController({
    sequence,
    sceneEl,
    spacerEl,
    options: {
      autoplay: true,
      autoplayFps: 12,
      idleMs: 2500,
    },
  });

  // Preloader drives the UI via these callbacks.
  const preloader_ = new FramePreloader({
    manifestUrl: '/frames-manifest.json',
    concurrency: 12,
    onProgress: (p, _total, _loaded) => {
      // No text surface in the hero — drive only the slim bar width.
      const pct = Math.floor(p * 100);
      barFill.style.width = `${pct}%`;
    },
    onError: (e) => {
      console.error('Preload error:', e);
    },
  });

  try {
    const frames = await preloader_.load();

    // Hand the decoded frames to the canvas and start the controller.
    sequence.setFrames(frames);
    controller._onResize();     // prime the cached scroll layout
    controller.start();

    // Flip the scene into "ready" — there is no overlay text to fade in,
    // but the attribute may still be inspected for testing/debugging.
    sceneEl.dataset.state = 'ready';

    // Give a beat for the bar fill to settle at 100%, then fade out the
    // preloader overlay entirely so only the animation is visible.
    barFill.style.width = '100%';
    requestAnimationFrame(() => {
      setTimeout(() => {
        preloader.dataset.state = 'done';
      }, 300);
    });

    // The hero is up — hand off to the imported content section(s) below the
    // spacer. The Problem section (#problem-section) is physically off-screen
    // until the user scrubs to the last hero frame, but its GSAP ScrollTrigger
    // animations need to be registered ahead of time so they're live when the
    // section enters the viewport. Dynamic-imported so it never blocks the
    // hero's first paint, and isolated so a failure here can't break the hero.
    import('./problem.js')
      .then((m) => m.initProblemSection())
      .catch((e) => console.error('Problem section init failed', e));

    // Sections 3-12 (Transition, Services, Marquee, Process, Edge, Ecosystem,
    // Team, FAQ, CTA, Footer) — also dynamic-imported so they never block
    // the hero's first paint. AOS is lazy-loaded inside sections.js.
    import('./sections.js')
      .then((m) => m.initSections())
      .catch((e) => console.error('Sections init failed', e));
  } catch (e) {
    console.error('Boot failed', e);
  }
}

// Kick off when DOM is parsed. fontsapi links in <head> may still be loading
// but we don't need them for the canvas — only for overlay text, which
// repaints via CSS once fonts arrive.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
