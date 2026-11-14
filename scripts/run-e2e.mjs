import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium as playwrightChromium } from 'playwright';

// Prefer a normal Playwright browser. In restricted Linux environments, use the
// already-installed serverless Chromium package without downloading a browser.
if (!process.env.PLAYWRIGHT_CHROMIUM_PATH && process.platform === 'linux' && !existsSync(playwrightChromium.executablePath())) {
  const chromium = (await import('@sparticuz/chromium')).default;
  const libDir = join(tmpdir(), 'kd-al2023');
  if (!existsSync(join(libDir, 'lib/libnspr4.so'))) {
    mkdirSync(libDir, { recursive: true });
    const archive = join(tmpdir(), 'kd-al2023.tar');
    writeFileSync(archive, brotliDecompressSync(readFileSync('node_modules/@sparticuz/chromium/bin/al2023.tar.br')));
    execFileSync('tar', ['-xf', archive, '-C', libDir]);
  }
  process.env.PLAYWRIGHT_CHROMIUM_PATH = await chromium.executablePath();
  process.env.LD_LIBRARY_PATH = `${join(libDir, 'lib')}:${tmpdir()}:${process.env.LD_LIBRARY_PATH || ''}`;
}
const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
child.on('exit', (code, signal) => { if (signal) process.kill(process.pid, signal); else process.exit(code ?? 1); });
