/* ==========================================================================
   frame-preloader.js
   --------------------------------------------------------------------------
   Loads + decodes all frames in the manifest into HTMLImageElement objects
   so the canvas can draw them with zero decode latency on the hot path.

   Why <img> and not ImageBitmap?
     - HTMLImageElement decoding is robust across browsers and reuses the
       native WebP codec; ImageBitmap is theoretically faster but has rough
       edges on iOS Safari and fails silently on some animated formats.
     - We prepay the decode cost here with `img.decode()` so the canvas
       draw later is a cheap GPU upload.

   Concurrency: 12 at a time. Pushing 300 simultaneous requests can stall
   the HTTP/1.1 dev server and saturate memory. 12 keeps the pipeline full
   without thrashing.
   ========================================================================== */

export class FramePreloader {
  /**
   * @param {object}   cfg
   * @param {string}   cfg.manifestUrl  URL to frames-manifest.json
   * @param {(p:number,total:number,loaded:number)=>void} [cfg.onProgress]
   *        Called after each frame decodes; p in [0,1].
   * @param {(e:Error)=>void} [cfg.onError]
   * @param {number}   [cfg.concurrency=12]
   */
  constructor({ manifestUrl, onProgress, onError, concurrency = 12 }) {
    this.manifestUrl = manifestUrl;
    this.onProgress = onProgress ?? (() => {});
    this.onError = onError ?? ((e) => console.error(e));
    this.concurrency = concurrency;

    /** @type {HTMLImageElement[]} Frames in manifest order. */
    this.images = [];
    /** @type {number} */
    this.total = 0;
    /** @type {boolean} */
    this.done = false;
  }

  // -------------------------------------------------------------------------
  // Fetch the manifest first; without it we know nothing.
  async _fetchManifest() {
    const res = await fetch(this.manifestUrl, { cache: 'force-cache' });
    if (!res.ok) throw new Error(`Manifest fetch failed: ${res.status} ${this.manifestUrl}`);
    return res.json();
  }

  // -------------------------------------------------------------------------
  // Load a single image and wait until it's fully decoded by the browser.
  // `img.decode()` returns a promise that resolves once the bitmap is ready
  // to draw onto a canvas without a lazy decode hitch.
  //
  // We set `decoding="async"` and `fetchpriority="high"` to encourage the
  // browser to prioritize these requests on the network queue.
  async _loadOne(url) {
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = 'high';
    // fetchPriority is a few-year-old attribute; support is wide enough
    // that older browsers silently ignore it.
    img.src = url;
    try {
      await img.decode();
    } catch (e) {
      // If a single frame fails to decode, throw — the user should know
      // rather than see a stuttering sequence.
      throw new Error(`Failed to decode ${url}: ${e.message}`);
    }
    return img;
  }

  // -------------------------------------------------------------------------
  // Worker pool: feed URLs into N waiters concurrently. We pull items off
  // the index queue so order is preserved in `this.images` regardless of
  // which slot finishes first.
  //
  // Given 300 frames × ~300KB each (~90MB after decode → still well under
  // the typical mobile memory budget for a few seconds), this completes in
  // roughly 2-4 seconds on broadband.
  async _runPool(urls) {
    let cursor = 0;          // next index to pull
    let loaded = 0;
    const total = urls.length;
    this.total = total;

    const worker = async () => {
      while (cursor < total) {
        const i = cursor++;
        try {
          this.images[i] = await this._loadOne(urls[i]);
          loaded++;
          this.onProgress(loaded / total, total, loaded);
        } catch (e) {
          this.onError(e);
          throw e;       // propagate so Promise.all rejects
        }
      }
    };

    // Spawn `concurrency` workers and wait for them all to drain.
    const pool = Array.from({ length: Math.min(this.concurrency, total) }, worker);
    await Promise.all(pool);
    this.done = true;
  }

  // -------------------------------------------------------------------------
  // Public entrypoint. Resolves to the array of decoded HTMLImageElements.
  async load() {
    const manifest = await this._fetchManifest();
    if (!manifest?.frames?.length) {
      throw new Error('Manifest did not contain any frames.');
    }

    // Manifest ships a `base` like "/frames-all/" and a list of filenames.
    // We join them here so the loader is free of any document.baseURI nuance.
    const base = manifest.base ?? '/frames-all/';
    const urls = manifest.frames.map((name) => `${base}${name}`);

    await this._runPool(urls);
    return this.images;
  }
}
