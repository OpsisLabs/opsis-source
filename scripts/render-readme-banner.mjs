// Deterministic, silent README loop. Requires the project Playwright and ffmpeg.
import { chromium } from '@playwright/test';
import { mkdtempSync, rmSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const frames = mkdtempSync(join(tmpdir(), 'opsis-banner-'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 520 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(join(root, 'docs/assets/opsis-banner.html')).href);
  await page.waitForFunction(() => window.ready === true);
  for (let frame = 0; frame < 80; frame++) {
    await page.evaluate(t => window.renderFrame(t), frame / 10);
    await page.screenshot({ path: join(frames, `${String(frame).padStart(3, '0')}.png`) });
  }
  copyFileSync(join(frames, '000.png'), join(root, 'docs/assets/opsis-banner.png'));
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '10', '-i', join(frames, '%03d.png'), '-filter_complex', '[0:v]split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4', '-loop', '0', join(root, 'docs/assets/opsis-banner.gif')], { stdio: 'inherit' });
  console.log('Rendered 80 frames / 8 seconds; PNG fallback and looping GIF.');
} finally {
  await browser.close();
  rmSync(frames, { recursive: true, force: true });
}
