/**
 * scripts/process-frames.js
 * ---------------------------------------------------------------------------
 * Asset pipeline for the Adversado hero animation.
 *
 * What it does
 *   1. Reads every PNG from ./herosection-images (the raw, ~90MB image dump).
 *   2. Renames them deterministically to `frame-001 ... frame-300` and writes
 *      them to ./public/frames-all/ as **lossless WebP** (typical 60-75% size
 *      drop vs. 8-bit PNG with zero visual loss).
 *   3. Emits ./public/frames-manifest.json — a small JSON list the browser can
 *      fetch so the preload engine knows nothing about filesystem layout.
 *   4. Prints a before/after byte report so you can see the win at a glance.
 *
 * Why lossless WebP
 *   - 300 identical-size frames decode fast in <img> and on a canvas backing
 *     because V8 ships a native WebP decoder; no JS decoder needed.
 *   - Lossless keeps the visual fidelity of the original Apple-style frames.
 *   - AVIF wins a touch more bytes but encodes ~4x slower and is outside the
 *     scope of this build. Swap `webp` for `avif` if you want to try it.
 *
 * Re-run safe: destination is wiped on every invocation so frame numbering
 * never drifts when the source set changes.
 * ---------------------------------------------------------------------------
 */

import { readdir, readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import sharp from 'sharp';

// __dirname isn't auto-injected in ESM, so derive it from import.meta.url.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Resolve paths relative to the project root (parent of /scripts).
const ROOT = join(__dirname, '..');
const SRC_DIR = join(ROOT, 'herosection-images');       // raw PNGs (source of truth)
const OUT_DIR = join(ROOT, 'public', 'frames-all');     // compressed WebP frames
const MANIFEST = join(ROOT, 'public', 'frames-manifest.json');

// ---------------------------------------------------------------------------
// Pull in enough frames so the script can be audited on a tiny subset.
// Use FRAME_LIMIT=0 to process the full set.
// ---------------------------------------------------------------------------
const FRAME_LIMIT = Number(process.env.FRAME_LIMIT) || 0;
const SHOW_PER_FRAME = process.env.VERBOSE === '1';     // verbose: print each frame as it's encoded

// ---------------------------------------------------------------------------
// tiny human-readable byte formatter (no deps).
// ---------------------------------------------------------------------------
function kb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ---------------------------------------------------------------------------
// walk: collect every supported source file, sorted by natural name so
// `ezgif-frame-002` lands before `ezgif-frame-010`. Node's default sort is
// lexicographic, which would put -010 before -002, hence the natural-sort
// fallback using a regex numeric capture.
// ---------------------------------------------------------------------------
function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function collectSources() {
  if (!existsSync(SRC_DIR)) {
    throw new Error(`Source directory not found: ${SRC_DIR}`);
  }
  const all = await readdir(SRC_DIR);
  const images = all.filter((f) => {
    const ext = extname(f).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(ext);
  });
  images.sort(naturalSort);

  // Honor FRAME_LIMIT for quick test runs.
  const subset = FRAME_LIMIT > 0 ? images.slice(0, FRAME_LIMIT) : images;
  if (subset.length === 0) {
    throw new Error(`No source images found in ${SRC_DIR}`);
  }
  return subset;
}

// ---------------------------------------------------------------------------
// Reset the output dir so re-runs are deterministic.
// ---------------------------------------------------------------------------
async function resetOutput() {
  if (existsSync(OUT_DIR)) {
    await rm(OUT_DIR, { recursive: true, force: true });
  }
  await mkdir(OUT_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Process a single frame. We return the input + output byte sizes so the
// caller can show a per-frame and aggregate size report.
//
// sharp notes:
//   - `.png()` and `.webp({ lossless: true })` are decoded and re-encoded
//     on the fly; source width/height (1280x720) is preserved.
//   - We never resize here. If you want a retina-ready oversize, do it in a
//     separate downscale pass so the canvas stays crisp at HiDPI.
//   - `effort: 6` (the default) gives the smallest lossless output; drop to
//     `effort: 4` to roughly halve encode time at a ~3% size cost.
// ---------------------------------------------------------------------------
async function compressAndRename(srcPath, index, total) {
  const srcBuffer = await readFile(srcPath);
  const num = String(index + 1).padStart(3, '0');      // 001, 002, ... 300
  const outName = `frame-${num}.webp`;
  const outPath = join(OUT_DIR, outName);

  // sharp can stream straight to file, but buffering lets us report the
  // output size without a second stat() round-trip.
  const outBuffer = await sharp(srcBuffer)
    .webp({ lossless: true, effort: 6 })               // lossless = no visual loss, ~biggest win
    .toBuffer();

  await writeFile(outPath, outBuffer);

  if (SHOW_PER_FRAME) {
    console.log(`  ${num}/${total}  ${basename(srcPath)} -> ${outName}  ${kb(srcBuffer.length)} -> ${kb(outBuffer.length)}`);
  }

  return { outName, srcSize: srcBuffer.length, outSize: outBuffer.length };
}

// ---------------------------------------------------------------------------
// Write the manifest the browser consumes. It is intentionally tiny:
// a flat array of relative URLs so the preload loop is filesystem-agnostic.
// ---------------------------------------------------------------------------
async function writeManifest(frameNames) {
  const manifest = {
    total: frameNames.length,
    // URL paths relative to site root; Vite serves /public at /.
    base: '/frames-all/',
    frames: frameNames,
  };
  await writeFile(MANIFEST, JSON.stringify(manifest, null, 2));
  return manifest;
}

// ---------------------------------------------------------------------------
// main(): the actual pipeline.
// ---------------------------------------------------------------------------
async function main() {
  // Skip processing if frames are already built
  if (existsSync(OUT_DIR) && existsSync(MANIFEST)) {
    try {
      const manifestData = JSON.parse(await readFile(MANIFEST, 'utf-8'));
      const webpFiles = (await readdir(OUT_DIR)).filter(f => f.endsWith('.webp'));
      if (webpFiles.length === manifestData.total) {
        console.log('→ Frames already processed. Skipping. (delete public/frames-all/ to re-run)');
        return;
      }
    } catch {
      // If manifest is corrupt, re-run the pipeline
    }
  }

  console.log('→ Adversado frame pipeline');
  console.log(`  source   : ${SRC_DIR}`);
  console.log(`  output   : ${OUT_DIR}`);
  if (FRAME_LIMIT > 0) console.log(`  FRAME_LIMIT=${FRAME_LIMIT} (test mode)`);
  console.log('');

  const sources = await collectSources();
  console.log(`  discovered ${sources.length} source frame(s)`);

  await resetOutput();

  const results = [];
  const total = sources.length;
  const startedAt = Date.now();

  for (let i = 0; i < total; i++) {
    results.push(await compressAndRename(join(SRC_DIR, sources[i]), i, total));

    // every 10% print a progress heartbeat so long runs don't look frozen.
    if (!SHOW_PER_FRAME && total >= 10 && (i + 1) % Math.ceil(total / 10) === 0) {
      const pct = Math.round(((i + 1) / total) * 100);
      console.log(`  … ${pct}% (${i + 1}/${total})`);
    }
  }

  const manifest = await writeManifest(results.map((r) => r.outName));

  // ----- size report -----
  let srcTotal = 0;
  let outTotal = 0;
  results.forEach((r) => { srcTotal += r.srcSize; outTotal += r.outSize; });
  const saved = 100 - (outTotal / srcTotal) * 100;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('');
  console.log(`  ✓ done in ${elapsed}s`);
  console.log(`    frames processed : ${results.length}`);
  console.log(`    source total     : ${(srcTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`    output total     : ${(outTotal / 1024 / 1024).toFixed(2)} MB  (saved ${saved.toFixed(1)}%)`);
  console.log(`    manifest written : ${MANIFEST}`);
  console.log(`                       baseDir: ${manifest.base}`);
  console.log(`    avg frame size   : ${kb(outTotal / results.length)} (from ${kb(srcTotal / results.length)})`);
}

main().catch((err) => {
  console.error('\n✘ frame pipeline failed:');
  console.error(err);
  process.exit(1);
});
