/* ==========================================================================
   problem.js — Section 2 "The Problem" animations
   --------------------------------------------------------------------------
   Ported verbatim from the source project ("adversado kimi 2.6") so the
   section animates identically: scrubbed headline fly-in, badge fade,
   staggered card slide-in, ambient glow parallax, magnetic-tilt headline
   hover, and 3D card pop-out on hover.

   Difference from the source:
     - The source loads GSAP + ScrollTrigger via <script> tags in <head>
       and reaches into the global `gsap`. Here the hero is an ES-module
       Vite app, so this module lazily injects the same CDN scripts at
       runtime and awaits their `load` event before wiring anything up.
     - DOM queries are guarded so a missing section no-ops instead of
       crashing the page (the hero must always keep working).
     - `prefers-reduced-motion: reduce` skips the GSAP path entirely;
       the section stays visible in its rest state via CSS overrides.
   ========================================================================== */

import '../styles/problem.css';

// CDN URLs — pinned to the same versions the source project uses.
const GSAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
const SCROLLTRIGGER_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';

// ---------------------------------------------------------------------------
// Inject a <script src> tag and resolve once it has loaded. We attach to
// <head> so the browser doesn't try to parse the script inline; one tag per
// CDN keeps the load order (GSAP first, ScrollTrigger second) deterministic.
// ---------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // If the page already loaded the same script (e.g. added manually), don't
    // load it twice — GSAP throws if it initializes twice.
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = false; // preserve insertion order vs. other CDN scripts
    el.dataset.loaded = 'false';
    el.addEventListener('load', () => {
      el.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    el.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(el);
  });
}

// ---------------------------------------------------------------------------
// Reduced-motion fallback: keep all GSAP-relevant elements at their rest
// state so the section reads normally without any motion.
// ---------------------------------------------------------------------------
function applyReducedMotionRestState() {
  // Headline lines: CSS parked them off-screen at opacity 0; bring them in.
  document.querySelectorAll('.headline-line').forEach((line) => {
    line.style.opacity = '1';
    line.style.transform = 'none';
  });
  // Badge + cards: same — show them in their default positions.
  const badge = document.querySelector('.behind-badge');
  if (badge) {
    badge.style.opacity = '1';
    badge.style.transform = 'none';
  }
  document.querySelectorAll('.problem-card').forEach((card) => {
    card.style.opacity = '1';
    card.style.transform = 'none';
  });
}

// ===========================================================================
// Public entrypoint — called from main.js once the hero has booted.
// ===========================================================================
export async function initProblemSection() {
  const section = document.getElementById('problem-section');
  if (!section) return; // section absent — nothing to wire, hero keeps working

  // Honor OS-level preference; the section stays visible and static.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    applyReducedMotionRestState();
    return;
  }

  // Load GSAP + ScrollTrigger from CDN, in order, then register.
  try {
    await loadScript(GSAP_URL);
    await loadScript(SCROLLTRIGGER_URL);
  } catch (e) {
    console.error('Problem section: CDN load failed', e);
    applyReducedMotionRestState(); // graceful fallback — show content anyway
    return;
  }

  // eslint-disable-next-line no-undef
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.error('Problem section: GSAP globals not present after load');
    applyReducedMotionRestState();
    return;
  }
  // eslint-disable-next-line no-undef
  gsap.registerPlugin(ScrollTrigger);

  // ====================================================================
  // GSAP SCROLL-TRIGGERED ANIMATIONS FOR SECTION 2
  // (ported verbatim from the source project)
  // ====================================================================

  // --- Headline Lines: Slide from far left/right on scroll ---
  const headlineLines = document.querySelectorAll('.headline-line');

  headlineLines.forEach((line, index) => {
    const isLeft = line.classList.contains('left');
    const isRight = line.classList.contains('right');
    const isCenter = line.classList.contains('center');

    let fromX = '0';
    let fromRotateY = '0';

    if (isLeft || isCenter) {
      fromX = '-120vw';
      fromRotateY = '25deg';
    } else if (isRight) {
      fromX = '120vw';
      fromRotateY = '-25deg';
    }

    // eslint-disable-next-line no-undef
    gsap.set(line, {
      x: fromX,
      rotateY: fromRotateY,
      opacity: 0,
      transformOrigin: isRight ? 'left center' : 'right center',
    });

    // eslint-disable-next-line no-undef
    gsap.to(line, {
      x: 0,
      rotateY: 0,
      opacity: 1,
      ease: 'power3.out',
      scrollTrigger: {
        trigger: '#problem-section',
        start: 'top 85%',
        end: 'top 20%',
        scrub: 1.2 + index * 0.15,
        toggleActions: 'play none none reverse',
      },
    });
  });

  // --- "But behind the scenes..." badge fade-in ---
  // eslint-disable-next-line no-undef
  gsap.set('.behind-badge', { opacity: 0, y: 30, scale: 0.9 });
  // eslint-disable-next-line no-undef
  gsap.to('.behind-badge', {
    opacity: 1,
    y: 0,
    scale: 1,
    ease: 'back.out(1.7)',
    scrollTrigger: {
      trigger: '#problem-section',
      start: 'top 50%',
      end: 'top 30%',
      scrub: 1.5,
      toggleActions: 'play none none reverse',
    },
  });

  // --- Problem Cards: Staggered slide-in from right ---
  const problemCards = document.querySelectorAll('.problem-card');

  problemCards.forEach((card, index) => {
    // eslint-disable-next-line no-undef
    gsap.set(card, {
      x: 120,
      opacity: 0,
      rotateY: -8,
    });

    // eslint-disable-next-line no-undef
    gsap.to(card, {
      x: 0,
      opacity: 1,
      rotateY: 0,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: '#problem-section',
        start: 'top 70%',
        end: 'top 10%',
        scrub: 1 + index * 0.2,
        toggleActions: 'play none none reverse',
      },
    });
  });

  // --- Ambient background glows parallax ---
  // eslint-disable-next-line no-undef
  gsap.to('#glow-lime', {
    y: -80,
    x: 40,
    scrollTrigger: {
      trigger: '#problem-section',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 2,
    },
  });

  // eslint-disable-next-line no-undef
  gsap.to('#glow-cyan', {
    y: 80,
    x: -40,
    scrollTrigger: {
      trigger: '#problem-section',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 2,
    },
  });

  // --- Headline hover: magnetic tilt effect ---
  const headlineContainer = document.getElementById('headline-container');
  if (headlineContainer) {
    headlineContainer.addEventListener('mousemove', (e) => {
      const rect = headlineContainer.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;

      // eslint-disable-next-line no-undef
      gsap.to(headlineContainer, {
        rotateY: x * 6,
        rotateX: -y * 4,
        duration: 0.4,
        ease: 'power2.out',
      });

      // Subtle parallax on individual lines
      document.querySelectorAll('.headline-line').forEach((line, i) => {
        const depth = i % 2 === 0 ? 8 : -8;
        // eslint-disable-next-line no-undef
        gsap.to(line, {
          x: x * depth,
          duration: 0.5,
          ease: 'power2.out',
        });
      });
    });

    headlineContainer.addEventListener('mouseleave', () => {
      // eslint-disable-next-line no-undef
      gsap.to(headlineContainer, {
        rotateY: 0,
        rotateX: 0,
        scale: 1,
        duration: 0.6,
        ease: 'elastic.out(1, 0.5)',
      });

      document.querySelectorAll('.headline-line').forEach((line) => {
        // eslint-disable-next-line no-undef
        gsap.to(line, {
          x: 0,
          duration: 0.6,
          ease: 'elastic.out(1, 0.5)',
        });
      });
    });
  }

  // --- Problem card hover: 3D pop-out with number bounce ---
  problemCards.forEach((card) => {
    const number = card.querySelector('.problem-number');

    card.addEventListener('mouseenter', () => {
      // eslint-disable-next-line no-undef
      gsap.to(card, {
        z: 60,
        scale: 1.03,
        duration: 0.4,
        ease: 'power2.out',
      });

      if (number) {
        // eslint-disable-next-line no-undef
        gsap.to(number, {
          scale: 1.3,
          z: 50,
          duration: 0.35,
          ease: 'back.out(2)',
        });
      }
    });

    card.addEventListener('mouseleave', () => {
      // eslint-disable-next-line no-undef
      gsap.to(card, {
        z: 0,
        scale: 1,
        duration: 0.5,
        ease: 'power2.out',
      });

      if (number) {
        // eslint-disable-next-line no-undef
        gsap.to(number, {
          scale: 1,
          z: 0,
          duration: 0.4,
          ease: 'power2.out',
        });
      }
    });
  });
}
