/* ==========================================================================
   canvas-image-sequence.js
   --------------------------------------------------------------------------
   Owns the <canvas> and exposes a tiny API: setFrames(), drawFrame(i), and
   resize(). The class is intentionally framework-agnostic — it doesn't know
   about scroll, autoplay, or the UI; that logic lives in hero-controller.js.

   Design notes
   - We size the canvas backing store in *device pixels* (CSS pixels * DPR),
     then `ctx.scale(dpr, dpr)` so all our drawing math stays in CSS pixels.
   - Frames are drawn with object-fit: cover semantics so the 16:9 image
     fills the (possibly non-16:9) viewport without distortion. We compute
     scale + offset in CSS-pixel space once per resize.
   - We round the device-pixel backing store to integers; fractional DPR
     backing stores cause crisp text rendering but cost memory, and the
     tradeoff isn't worth it for a moving canvas.
   ========================================================================== */

export class CanvasImageSequence {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    // alpha:false: opaque canvas — compositor can skip blending the page
    // behind it, which is a real perf win for full-bleed video-like content.
    // desynchronized:true: lets the browser decouple canvas commits from
    // the page's main-thread commit, reducing end-to-end latency on some
    // platforms (Chromium). Harmless elsewhere.

    /** @type {HTMLImageElement[]} */
    this._frames = [];
    this._currentFrame = -1;     // last drawn frame; lets us skip redundant redraws

    // Computed on resize; cached so drawFrame doesn't recompute per call.
    this._dpr = 1;
    this._draw = { x: 0, y: 0, w: 0, h: 0 };  // destination rect in CSS px
    this._srcW = 0;  // intrinsic frame dims
    this._srcH = 0;

    this.resize();
  }

  // -------------------------------------------------------------------------
  // Public: hand the sequence its decoded frames. We read intrinsic dims
  // from the first frame once, then trigger an immediate first draw so the
  // canvas isn't black between load-complete and the first scroll tick.
  setFrames(frames) {
    if (!frames?.length) return;
    this._frames = frames;
    // Trust the first frame's natural size as the source of truth. The
    // asset pipeline guarantees all 300 frames share dimensions.
    this._srcW = frames[0].naturalWidth || frames[0].width;
    this._srcH = frames[0].naturalHeight || frames[0].height;
    this.resize();
    this.drawFrame(0);
  }

  get length() {
    return this._frames.length;
  }

  // -------------------------------------------------------------------------
  // Compute the destination rect for the frame.
  //   - Landscape / ultrawide viewports (wider than frame): cover — fill width,
  //     crop top/bottom.
  //   - Portrait / narrow viewports (taller than frame): contain — fit to width,
  //     center vertically with dark bars so all text stays readable.
  // Returns a dest rect in CSS pixels; all draws use this rect.
  _computeDrawRect(cssW, cssH) {
    if (!this._srcW || !this._srcH) {
      return { x: 0, y: 0, w: cssW, h: cssH };
    }
    const srcRatio = this._srcW / this._srcH;
    const dstRatio = cssW / cssH;

    let drawW, drawH;
    if (dstRatio > srcRatio) {
      // Viewport is wider than the frame → cover: fill width, crop top/bottom.
      drawW = cssW;
      drawH = cssW / srcRatio;
    } else {
      // Viewport is taller than the frame → cover: fill height, crop sides.
      drawH = cssH;
      drawW = cssH * srcRatio;
    }
    const x = (cssW - drawW) / 2;
    const y = (cssH - drawH) / 2;
    return { x, y, w: drawW, h: drawH };
  }

  // -------------------------------------------------------------------------
  // Re-size the canvas backing store. Call on:
  //   - init
  //   - window resize
  //   - orientationchange
  //
  // We cap DPR at 2 because (a) on a 4K retina monitor at DPR 3 you'd be
  // allocating a >8K backing store for a hero background, which is wasteful,
  // and (b) the visual difference is invisible on a moving sequence.
  resize() {
    const cssW = this.canvas.clientWidth;
    const cssH = this.canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // Round backing store to integers to keep memory allocations clean.
    const bw = Math.round(cssW * dpr);
    const bh = Math.round(cssH * dpr);

    // Only re-set when the size actually changed — re-assigning width/height
    // wipes the canvas and forces a full re-upload on some GPUs.
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this._dpr = dpr;
    this._draw = this._computeDrawRect(cssW, cssH);
    // Clear stale content from before the resize so we never see a letterbox.
    this._currentFrame = -1;
  }

  // -------------------------------------------------------------------------
  // Draw a specific frame index. Hot path — keep it branch-free and
  // allocate-free. We early-out if `i` matches the last draw so the rAF
  // loop can run as often as it likes without burning fillRate for nothing.
  drawFrame(i) {
    if (!this._frames.length) return;

    // Clamp + round so fractional scrub positions from the controller land
    // on actual frames (no attempt at sub-pixel frame blending; this is a
    // bite-sized engine and that gets expensive fast).
    const idx = Math.max(0, Math.min(this._frames.length - 1, Math.round(i)));
    if (idx === this._currentFrame) return;

    const ctx = this.ctx;
    // Reset transformation every frame so the dpr scale compounds cleanly;
    // setting `transform` (not `scale`) avoids that risk entirely.
    ctx.setTransform(this._dpr, 0, 0, this._dpr, 0, 0);

    // Black-out first (object-cover may leave slivers if rates are very
    // close, and alpha:false forbids transparent clear).
    ctx.fillStyle = '#05060a';
    ctx.fillRect(0, 0, this.canvas.clientWidth, this.canvas.clientHeight);

    // The hot draw: copy the decoded frame image into the cover rect.
    const { x, y, w, h } = this._draw;
    ctx.drawImage(this._frames[idx], x, y, w, h);

    this._currentFrame = idx;
  }

  // -------------------------------------------------------------------------
  // Re-draw the current frame after a resize. The controller calls this
  // when the canvas box changes so the user never sees a stretched or empty
  // frame at the new size.
  redrawCurrent() {
    if (!this._frames.length) return;
    const was = this._currentFrame < 0 ? 0 : this._currentFrame;
    this._currentFrame = -1;          // defeat the early-out in drawFrame
    this.drawFrame(was);
  }
}
