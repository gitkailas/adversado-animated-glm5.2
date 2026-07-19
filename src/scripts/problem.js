/* ==========================================================================
   problem.js — Section 2 "The Problem" animations
   --------------------------------------------------------------------------
   GSAP ScrollTrigger animations for the problem section:
     - Headlines fly in from far left/right
     - "But behind the scenes..." badge fades in
     - Problem cards slide in from right, ONE BY ONE (staggered scroll ranges)
     - Ambient background glows parallax
     - Magnetic-tilt headline hover
     - 3D card pop-out + lighting glow on hover

   If GSAP CDN fails to load, an IntersectionObserver fallback reveals
   all hidden elements so the section is always readable.
   ========================================================================== */

import '../styles/problem.css';

const GSAP_URL = 'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/gsap.min.js';
const SCROLLTRIGGER_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.2/ScrollTrigger.min.js';

// ---------------------------------------------------------------------------
// Inject a <script src> and resolve once loaded.
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
// Fallback: reveal all hidden elements via inline styles (no GSAP needed).
// ---------------------------------------------------------------------------
function revealAll() {
  document.querySelectorAll('.headline-line').forEach((l) => {
    l.style.opacity = '1';
    l.style.transform = 'none';
  });
  const badge = document.querySelector('.behind-badge');
  if (badge) { badge.style.opacity = '1'; badge.style.transform = 'none'; }
  document.querySelectorAll('.problem-card').forEach((c) => {
    c.style.opacity = '1';
    c.style.transform = 'none';
  });
}

// ---------------------------------------------------------------------------
// IntersectionObserver fallback — reveals elements as they scroll into view.
// Only used when GSAP CDN fails. Each element gets a CSS-transition fade-in.
// ---------------------------------------------------------------------------
function initObserverFallback() {
  const targets = document.querySelectorAll(
    '.headline-line, .behind-badge, .problem-card',
  );
  if (!targets.length) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
          entry.target.style.opacity = '1';
          entry.target.style.transform = 'none';
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 },
  );
  targets.forEach((el) => observer.observe(el));
}

// ===========================================================================
// Public entrypoint
// ===========================================================================
export async function initProblemSection() {
  const section = document.getElementById('problem-section');
  if (!section) return;

  // Reduced-motion: show everything static.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    revealAll();
    return;
  }

  // Load GSAP + ScrollTrigger from CDN.
  try {
    await loadScript(GSAP_URL);
    await loadScript(SCROLLTRIGGER_URL);
  } catch (e) {
    console.error('Problem section: CDN load failed', e);
    initObserverFallback();
    return;
  }

  // eslint-disable-next-line no-undef
  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
    console.error('Problem section: GSAP globals not present after load');
    initObserverFallback();
    return;
  }

  // eslint-disable-next-line no-undef
  gsap.registerPlugin(ScrollTrigger);

  // ====================================================================
  // HEADLINE LINES — fly in from far left / right
  // ====================================================================
  const headlineLines = document.querySelectorAll('.headline-line');

  headlineLines.forEach((line, index) => {
    const isLeft  = line.classList.contains('left');
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
      },
    });
  });

  // ====================================================================
  // BADGE — "But behind the scenes..."
  // ====================================================================
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
    },
  });

  // ====================================================================
  // PROBLEM CARDS — staggered slide-in from right, ONE BY ONE
  // Each card gets its own scroll range so they enter sequentially.
  // ====================================================================
  const problemCards = document.querySelectorAll('.problem-card');

  // Scroll ranges per card — each card starts slightly later so they
  // slide in one after another as the user scrolls down.
  const cardRanges = [
    { start: 'top 80%', end: 'top 55%' },  // card 01
    { start: 'top 72%', end: 'top 47%' },  // card 02
    { start: 'top 64%', end: 'top 39%' },  // card 03
    { start: 'top 56%', end: 'top 31%' },  // card 04
  ];

  problemCards.forEach((card, index) => {
    const range = cardRanges[index] || cardRanges[cardRanges.length - 1];

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
        start: range.start,
        end: range.end,
        scrub: 1,
      },
    });
  });

  // ====================================================================
  // AMBIENT BACKGROUND GLOWS — parallax
  // ====================================================================
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

  // ====================================================================
  // HEADLINE HOVER — magnetic tilt
  // ====================================================================
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

  // ====================================================================
  // PROBLEM CARD HOVER — 3D pop-out + lighting glow
  // GSAP handles transform (z, scale) + box-shadow glow.
  // CSS :hover handles border-color glow as a belt-and-suspenders backup.
  // ====================================================================
  problemCards.forEach((card) => {
    const number = card.querySelector('.problem-number');

    card.addEventListener('mouseenter', () => {
      // eslint-disable-next-line no-undef
      gsap.to(card, {
        z: 60,
        scale: 1.03,
        boxShadow:
          '0 25px 50px rgba(0,0,0,0.4), ' +
          '0 0 30px rgba(204,255,0,0.15), ' +
          '0 0 60px rgba(0,229,255,0.08)',
        borderColor: 'rgba(204,255,0,0.3)',
        duration: 0.4,
        ease: 'power2.out',
      });

      if (number) {
        // eslint-disable-next-line no-undef
        gsap.to(number, {
          scale: 1.3,
          z: 50,
          boxShadow: number.classList.contains('cyan-num')
            ? '0 0 25px rgba(0,229,255,0.5)'
            : '0 0 25px rgba(204,255,0,0.5)',
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
        boxShadow: 'none',
        borderColor: 'rgba(255,255,255,0.05)',
        duration: 0.5,
        ease: 'power2.out',
      });

      if (number) {
        // eslint-disable-next-line no-undef
        gsap.to(number, {
          scale: 1,
          z: 0,
          boxShadow: 'none',
          duration: 0.4,
          ease: 'power2.out',
        });
      }
    });
  });
}
