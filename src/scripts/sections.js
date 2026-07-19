/* ==========================================================================
   sections.js — Sections 3-12 initialization
   --------------------------------------------------------------------------
   Ported from the source project ("adversado kimi 2.6"). Handles:
     - AOS (Animate On Scroll) lazy-load + init
     - FAQ accordion toggle
     - Flip card mobile tap-to-flip
     - Edge card slide-in (IntersectionObserver)
     - Ecosystem card slide-in (IntersectionObserver)
     - Edge / Ecosystem ambient glow parallax (GSAP ScrollTrigger)
     - Smooth scroll for anchor links

   GSAP is expected to already be loaded by problem.js. If it is not
   available (e.g. problem.js failed or was skipped), parallax effects
   are silently skipped — the sections still render and work.
   ========================================================================== */

import '../styles/sections.css';

// ---------------------------------------------------------------------------
// Lazy-load a CDN script, resolving once loaded.  Reuses the same pattern
// as problem.js to avoid duplicate injection.
// ---------------------------------------------------------------------------
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') return resolve();
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const el = document.createElement('script');
    el.src = src;
    el.async = false;
    el.dataset.loaded = 'false';
    el.addEventListener('load', () => { el.dataset.loaded = 'true'; resolve(); }, { once: true });
    el.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(el);
  });
}

// ---------------------------------------------------------------------------
// AOS (Animate On Scroll)
// ---------------------------------------------------------------------------
const AOS_CSS_URL = 'https://unpkg.com/aos@2.3.1/dist/aos.css';
const AOS_JS_URL  = 'https://unpkg.com/aos@2.3.1/dist/aos.js';

async function initAOS() {
  // Inject AOS stylesheet if not already present
  if (!document.querySelector(`link[href="${AOS_CSS_URL}"]`)) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = AOS_CSS_URL;
    document.head.appendChild(link);
  }

  await loadScript(AOS_JS_URL);

  // eslint-disable-next-line no-undef
  if (typeof AOS !== 'undefined') {
    // eslint-disable-next-line no-undef
    AOS.init({
      duration: 1000,
      once: false,
      mirror: true,
      offset: 100,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
    });
  }
}

// ---------------------------------------------------------------------------
// FAQ accordion
// ---------------------------------------------------------------------------
function initFAQ() {
  // Expose toggle globally so inline onclick handlers in the HTML work.
  window.toggleFaq = function (button) {
    const answer = button.nextElementSibling;
    const icon = button.querySelector('.faq-icon');
    if (!answer || !icon) return;

    const isOpen = answer.classList.contains('open');

    // Close all others
    document.querySelectorAll('.faq-answer').forEach((el) => el.classList.remove('open'));
    document.querySelectorAll('.faq-icon').forEach((el) => el.classList.remove('open'));

    if (!isOpen) {
      answer.classList.add('open');
      icon.classList.add('open');
    }
  };
}

// ---------------------------------------------------------------------------
// Flip card mobile tap-to-flip
// ---------------------------------------------------------------------------
function initFlipCards() {
  document.querySelectorAll('.flip-card').forEach((card) => {
    card.addEventListener('click', function () {
      if (window.innerWidth <= 768) {
        this.classList.toggle('flipped-mobile');
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Edge card slide-in via IntersectionObserver
// ---------------------------------------------------------------------------
function initEdgeCards() {
  const cards = document.querySelectorAll('.edge-card');
  if (!cards.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15, rootMargin: '0px 0px -50px 0px' },
  );
  cards.forEach((card) => observer.observe(card));
}

// ---------------------------------------------------------------------------
// Ecosystem card slide-in via IntersectionObserver
// ---------------------------------------------------------------------------
function initEcoCards() {
  const cards = document.querySelectorAll('.eco-card');
  if (!cards.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -60px 0px' },
  );
  cards.forEach((card) => observer.observe(card));
}

// ---------------------------------------------------------------------------
// GSAP-powered ambient glow parallax  (edge + ecosystem sections)
// Requires GSAP + ScrollTrigger (already loaded by problem.js).
// ---------------------------------------------------------------------------
function initGlowParallax() {
  // eslint-disable-next-line no-undef
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  // Edge section glows
  const edgeGlow1 = document.querySelector('.edge-glow-1');
  const edgeGlow2 = document.querySelector('.edge-glow-2');
  if (edgeGlow1 && edgeGlow2) {
    // eslint-disable-next-line no-undef
    gsap.to(edgeGlow1, {
      y: -60, x: -30,
      scrollTrigger: { trigger: '#edge-section', start: 'top bottom', end: 'bottom top', scrub: 2 },
    });
    // eslint-disable-next-line no-undef
    gsap.to(edgeGlow2, {
      y: 60, x: 30,
      scrollTrigger: { trigger: '#edge-section', start: 'top bottom', end: 'bottom top', scrub: 2 },
    });
  }

  // Ecosystem section glows
  const ecoGlowLime = document.querySelector('.eco-glow-lime');
  const ecoGlowCyan = document.querySelector('.eco-glow-cyan');
  if (ecoGlowLime && ecoGlowCyan) {
    // eslint-disable-next-line no-undef
    gsap.to(ecoGlowLime, {
      y: -50, x: 40,
      scrollTrigger: { trigger: '#ecosystem-section', start: 'top bottom', end: 'bottom top', scrub: 2.5 },
    });
    // eslint-disable-next-line no-undef
    gsap.to(ecoGlowCyan, {
      y: 50, x: -40,
      scrollTrigger: { trigger: '#ecosystem-section', start: 'top bottom', end: 'bottom top', scrub: 2.5 },
    });
  }
}

// ---------------------------------------------------------------------------
// Smooth scroll for anchor links
// ---------------------------------------------------------------------------
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector(href);
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

// ===========================================================================
// Public entrypoint — called from main.js after the hero has booted.
// ===========================================================================
export async function initSections() {
  // Non-blocking: start AOS load + all sync inits in parallel.
  initFAQ();
  initFlipCards();
  initEdgeCards();
  initEcoCards();
  initSmoothScroll();

  // AOS loads a CDN script; kick it off but don't block the rest.
  initAOS().catch((e) => console.error('Sections: AOS init failed', e));

  // GSAP parallax relies on globals already loaded by problem.js.
  // Give problem.js a tick to finish loading before checking.
  requestAnimationFrame(() => {
    initGlowParallax();
  });
}
