# Adversado — Hero animation

A 60fps, scroll-driven 300-frame hero animation built with **Vite + Vanilla JS** and an HTML5 `<canvas>`. Includes a Node asset pipeline that compresses the source PNGs to lossless WebP, plus a branded full-page loader.

This is the deliverable for the Senior Creative Frontend Engineer brief.

---

## Project layout

```
Adversado-animated/
├─ herosection-images/         # raw source frames (300 × PNG, ~90MB)
├─ public/
│  ├─ frames-all/             # ← generated WebP frames (gitignored)
│  └─ frames-manifest.json    # ← generated frame list
├─ scripts/
│  └─ process-frames.js       # Node asset pipeline (deliverable #2)
├─ src/
│  ├─ styles/
│  │  └─ hero.css             # responsive hero + branded loader + UI
│  └─ scripts/
│     ├─ frame-preloader.js   # manifest→Image[] pipeline
│     ├─ canvas-image-sequence.js
│     │                        # canvas + DPR + object-cover draw
│     ├─ hero-controller.js   # scroll-tie + autoplay fallback
│     └─ main.js              # wires everything together
├─ index.html                 # hero markup + loader skeleton
├─ vite.config.js
└─ package.json
```

---

## Setup & run

```bash
# 1. Install dev dependencies (vite + sharp)
npm install

# 2. Compress the 300 source PNGs to lossless WebP and emit the manifest.
#    Reads ./herosection-images/, writes ./public/frames-all/ + ./public/frames-manifest.json.
npm run process:frames

# 3. Start the Vite dev server (default http://localhost:5173)
npm run dev

# 4. Build a production bundle to ./dist
npm run build
npm run preview
```

You only need to re-run `npm run process:frames` when the source image set changes.

---

## How it works

### Animation engine

The hero canvas never holds 300 `<img>` nodes in the DOM.

- `FramePreloader` (`src/scripts/frame-preloader.js`) fetches `frames-manifest.json`, then decodes **all 300 frames into `HTMLImageElement`s concurrently (12 at a time)** using `img.decode()`. Decoded images live in memory but never touch the DOM.
- `CanvasImageSequence` (`src/scripts/canvas-image-sequence.js`) owns the canvas. It sizes the backing store in **device pixels** (`cssW × dpr`) and caps `dpr` at 2 to keep memory bounds tight on 4K/5K displays. Frames are drawn with `object-fit: cover` math so the 16:9 source always fills the (possibly portrait) viewport without distortion.
- `HeroController` (`src/scripts/hero-controller.js`) is the single orchestrator. It runs **one** `requestAnimationFrame` loop, gated by a `dirty` flag so we only redraw when the frame actually changes. Scroll events just set `dirty = true`; the rAF tick computes the target frame and asks the canvas to draw.

### Scroll-tied + autoplay

The page layout is:

```
[.hero-scene, position: sticky, height: 100vh]  ← canvas + overlay (pinned)
[.hero-spacer, height: 200vh]                   ← scroll runway
```

Scroll progress `P` is `(scrollY − sceneTop) / spacerHeight`, clamped to `[0,1]`.
Target frame is `round(P × (count − 1))`.

- While `0 < P < 1` the user is mid-scrub → scroll drives the frame.
- While `P == 0` and the user has been idle for 2500ms → autoplay loop at 12fps keeps the hero alive above the fold.
- While `P >= 1` (scrolled past) → freeze on the last frame, autopause.
- Any scroll/wheel/pointer/keyboard interaction resets the idle timer so autoplay never fights the user.

`prefers-reduced-motion` disables the autoplay path and the scroll-hint animation; users still see their scroll-driven scrub (that's content, not motion decoration).

### Performance checklist

| Concern                       | Mitigation                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| DOM bloat from 300 `<img>`    | Decoded images live in JS memory; only 1 canvas in the DOM.                                |
| Decode hitches during scrub   | `img.decode()` is paid at load time; draws are GPU uploads.                               |
| Over-firing scroll listeners  | `{ passive: true }` scroll listener only sets a `dirty` flag; rAF does the work.           |
| Redrawing unchanged frames    | `drawFrame()` early-outs when `idx === currentFrame`.                                      |
| HiDPI memory blow-up          | `dpr` capped at 2.                                                                         |
| Network ::1 concurrency       | Loader uses a 12-slot pool; HTTP/1.1 dev servers stay responsive.                         |
| Layout thrash per scroll tick | `scrollY` (no reflow) + cached `sceneTop`/`runway`, recomputed only on resize.            |
| Canvas compositing            | `{ alpha: false, desynchronized: true }` context → opaque canvas, lazy commit.             |

### Sizing notes

- Source frames: **1280 × 720** (16:9). The canvas box is the viewport; we compute a `cover` destination rect so no black bars ever appear.
- Lossless WebP typically cuts the source set from ~90MB to ~25–30MB; per-frame is ~80–110KB. Decoded into the canvas this remains far inside any mobile memory budget.

---

## Customization

| Access point                                            | What it does                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `--hero-spacer-h` in `src/styles/hero.css`              | Scroll runway for the scrub. Increase for a slower, more cinematic scrub.    |
| `HeroController` options in `src/scripts/main.js`       | `autoplay`, `autoplayFps`, `idleMs`.                                          |
| `process-frames.js` `FRAME_LIMIT` env                   | `FRAME_LIMIT=12` to test with a small subset.                                 |
| `process-frames.js` `VERBOSE=1` env                     | Print every frame as it's encoded.                                            |
| `.webp({ lossless: true, effort: 6 })` in asset script  | Drop `lossless: false, quality: 80` for smaller lossy output (~5MB total).   |
| Brand palette in `src/styles/hero.css` `:root`          | Tokens for accent, scrim, panel; lift any color into a single variable.       |
| Overlay copy in `index.html`                            | Headline, subheadline, CTA hrefs.                                             |

---

## Re-building the asset pipeline

Re-run whenever the source frames change:

```bash
npm run process:frames
```

The script resets `public/frames-all/` before writing, so frame numbers remain aligned with `frames-manifest.json` even when the count changes. The script prints a before/after size report — useful to confirm the lossless WebP win or spot a malformed frame.

---

## Production notes

- Serve frames from a CDN with `Cache-Control: public, max-age=31536000, immutable` — the hashed filenames are deterministic so cache-busting is on manifest changes, not file-by-file.
- On production, you can also enable HTTP/2 or HTTP/3 so the 12-slot loader pool fully saturates the connection at start.
- For particularly weak devices, set `autoplay: false` in `main.js` and let users opt-in via scroll.
- If you switch to a much larger frame set (e.g. 1000+ frames), consider a downsampled "preview" sequence for the initial scrub and lazy-load the full set.
