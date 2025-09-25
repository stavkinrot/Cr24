import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const srcSvg = path.resolve(projectRoot, 'src', 'assets', 'logo.svg');
const outDir = path.resolve(projectRoot, 'src', 'icons');

const sizes = [16, 32, 48, 128, 256];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  if (!(await exists(srcSvg))) {
    console.error(`[build-icons] Missing ${srcSvg}`);
    process.exit(1);
  }
  await ensureDir(outDir);
  for (const size of sizes) {
    const out = path.join(outDir, `${size}.png`);
    await sharp(srcSvg).resize(size, size, { fit: 'contain' }).png().toFile(out);
    console.log(`[build-icons] Wrote ${out}`);
  }
}

main().catch((err) => {
  console.error('[build-icons] Error:', err);
  process.exit(1);
});