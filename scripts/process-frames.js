/**
 * scripts/process-frames.js
 * ---------------------------------------------------------------------------
 * Asset pipeline for the Adversado hero animation.
 *
 * What it does
 *   1. Reads every PNG from ./herosection-images (desktop 16:9) and optionally
 *      ./herosection-images-mobile (mobile 9:16).
 *   2. Renames them deterministically to `frame-001 ... frame-N` and writes
 *      them as **lossless WebP** (typical 60-75% size drop vs. 8-bit PNG with
 *      zero visual loss).
 *   3. Emits manifests the browser can fetch so the preload engine knows
 *      nothing about filesystem layout:
 *        - ./public/frames-manifest.json       (desktop 16:9)
 *        - ./public/frames-mobile-manifest.json (mobile 9:16, if source exists)
 *   4. Prints a before/after byte report so you can see the win at a glance.
 *
 * Why lossless WebP
 *   - Identical-size frames decode fast in <img> and on a canvas backing
 *     because V8 ships a native WebP decoder; no JS decoder needed.
 *   - Lossless keeps the visual fidelity of the original Apple-style frames.
 *   - AVIF wins a touch more bytes but encodes ~4x slower and is outside the
 *     scope of this build. Swap `webp` for `avif` if you want to try it.
 *
 * Re-run safe: destination is wiped on every invocation so frame numbering
 * never drifts when the source set changes.
 *
 * Mobile support
 *   - Place 9:16 PNGs in ./herosection-images-mobile/ (same naming convention).
 *   - The script detects the directory and processes it automatically.
 *   - Output goes to ./public/frames-mobile/ with its own manifest.
 *   - If the mobile directory doesn't exist, only desktop frames are built.
 * ---------------------------------------------------------------------------
 */

import { readdir, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
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

// Desktop frame set (16:9)
const DESKTOP_SRC = join(ROOT, 'herosection-images');
const DESKTOP_OUT = join(ROOT, 'public', 'frames-all');
const DESKTOP_MANIFEST = join(ROOT, 'public', 'frames-manifest.json');
const DESKTOP_BASE = '/frames-all/';

// Mobile frame set (9:16)
const MOBILE_SRC = join(ROOT, 'herosection-images-mobile');
const MOBILE_OUT = join(ROOT, 'public', 'frames-mobile');
const MOBILE_MANIFEST = join(ROOT, 'public', 'frames-mobile-manifest.json');
const MOBILE_BASE = '/frames-mobile/';

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
// naturalSort: collect every supported source file, sorted by natural name so
// `ezgif-frame-002` lands before `ezgif-frame-010`. Node's default sort is
// lexicographic, which would put -010 before -002, hence the natural-sort
// fallback using a regex numeric capture.
// ---------------------------------------------------------------------------
function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

// ---------------------------------------------------------------------------
// collectSources: read image files from a directory, sorted naturally.
// ---------------------------------------------------------------------------
async function collectSources(srcDir) {
  if (!existsSync(srcDir)) {
    return null;  // directory doesn't exist — not an error, just skip
  }
  const all = await readdir(srcDir);
  const images = all.filter((f) => {
    const ext = extname(f).toLowerCase();
    return ['.png', '.jpg', '.jpeg', '.webp', '.avif'].includes(ext);
  });
  images.sort(naturalSort);

  // Honor FRAME_LIMIT for quick test runs.
  const subset = FRAME_LIMIT > 0 ? images.slice(0, FRAME_LIMIT) : images;
  if (subset.length === 0) {
    return null;  // no images found — skip silently
  }
  return subset;
}

// ---------------------------------------------------------------------------
// resetOutput: wipe the output dir so re-runs are deterministic.
// ---------------------------------------------------------------------------
async function resetOutput(outDir) {
  if (existsSync(outDir)) {
    await rm(outDir, { recursive: true, force: true });
  }
  await mkdir(outDir, { recursive: true });
}

// ---------------------------------------------------------------------------
// compressAndRename: process a single frame. Returns input + output byte sizes
// for the aggregate size report.
//
// sharp notes:
//   - `.png()` and `.webp({ lossless: true })` are decoded and re-encoded
//     on the fly; source dimensions are preserved (no resize).
//   - `effort: 6` (the default) gives the smallest lossless output; drop to
//     `effort: 4` to roughly halve encode time at a ~3% size cost.
// ---------------------------------------------------------------------------
async function compressAndRename(srcPath, index, total, outDir) {
  const srcBuffer = await readFile(srcPath);
  const num = String(index + 1).padStart(3, '0');      // 001, 002, ... 300
  const outName = `frame-${num}.webp`;
  const outPath = join(outDir, outName);

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
// writeManifest: write the JSON manifest the browser consumes. Intentionally
// tiny: a flat array of relative URLs so the preload loop is filesystem-
// agnostic.
// ---------------------------------------------------------------------------
async function writeManifest(frameNames, manifestPath, baseDir) {
  const manifest = {
    total: frameNames.length,
    // URL paths relative to site root; Vite serves /public at /.
    base: baseDir,
    frames: frameNames,
  };
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

// ---------------------------------------------------------------------------
// processSet: run the full pipeline for one frame set (desktop or mobile).
// Returns null if the source directory doesn't exist or has no images.
// ---------------------------------------------------------------------------
async function processSet(label, srcDir, outDir, manifestPath, baseDir) {
  const sources = await collectSources(srcDir);
  if (!sources) {
    console.log(`→ ${label}: no source images found in ${srcDir} — skipping.`);
    return null;
  }

  // Skip processing if frames are already built
  if (existsSync(outDir) && existsSync(manifestPath)) {
    try {
      const manifestData = JSON.parse(await readFile(manifestPath, 'utf-8'));
      const webpFiles = (await readdir(outDir)).filter(f => f.endsWith('.webp'));
      if (webpFiles.length === manifestData.total) {
        console.log(`→ ${label}: frames already processed. Skipping. (delete ${outDir} to re-run)`);
        return manifestData;
      }
    } catch {
      // If manifest is corrupt, re-run the pipeline
    }
  }

  console.log(`→ ${label} frame pipeline`);
  console.log(`  source   : ${srcDir}`);
  console.log(`  output   : ${outDir}`);
  if (FRAME_LIMIT > 0) console.log(`  FRAME_LIMIT=${FRAME_LIMIT} (test mode)`);
  console.log('');

  await resetOutput(outDir);

  const results = [];
  const total = sources.length;
  const startedAt = Date.now();

  for (let i = 0; i < total; i++) {
    results.push(await compressAndRename(join(srcDir, sources[i]), i, total, outDir));

    // every 10% print a progress heartbeat so long runs don't look frozen.
    if (!SHOW_PER_FRAME && total >= 10 && (i + 1) % Math.ceil(total / 10) === 0) {
      const pct = Math.round(((i + 1) / total) * 100);
      console.log(`  … ${pct}% (${i + 1}/${total})`);
    }
  }

  const manifest = await writeManifest(results.map((r) => r.outName), manifestPath, baseDir);

  // ----- size report -----
  let srcTotal = 0;
  let outTotal = 0;
  results.forEach((r) => { srcTotal += r.srcSize; outTotal += r.outSize; });
  const saved = 100 - (outTotal / srcTotal) * 100;
  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log('');
  console.log(`  ✓ ${label} done in ${elapsed}s`);
  console.log(`    frames processed : ${results.length}`);
  console.log(`    source total     : ${(srcTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log(`    output total     : ${(outTotal / 1024 / 1024).toFixed(2)} MB  (saved ${saved.toFixed(1)}%)`);
  console.log(`    manifest written : ${manifestPath}`);
  console.log(`                       baseDir: ${manifest.base}`);
  console.log(`    avg frame size   : ${kb(outTotal / results.length)} (from ${kb(srcTotal / results.length)})`);
  console.log('');

  return manifest;
}

// ---------------------------------------------------------------------------
// main(): run both desktop and mobile pipelines.
// ---------------------------------------------------------------------------
async function main() {
  // Process desktop frames (16:9) — always run.
  await processSet('Desktop (16:9)', DESKTOP_SRC, DESKTOP_OUT, DESKTOP_MANIFEST, DESKTOP_BASE);

  // Process mobile frames (9:16) — only if source directory exists.
  if (existsSync(MOBILE_SRC)) {
    await processSet('Mobile (9:16)', MOBILE_SRC, MOBILE_OUT, MOBILE_MANIFEST, MOBILE_BASE);
  } else {
    console.log(`→ Mobile (9:16): ${MOBILE_SRC} not found — skipping mobile frame set.`);
    console.log(`  To add mobile frames, place 9:16 PNGs in ${MOBILE_SRC}`);
    console.log('');
  }
}

main().catch((err) => {
  console.error('\n✘ frame pipeline failed:');
  console.error(err);
  process.exit(1);
});
