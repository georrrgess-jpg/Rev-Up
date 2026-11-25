/// <reference types="vitest/config" />
import { defineConfig, Plugin, ResolvedConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

// Production base path for GitHub Pages project site https://georrrgess-jpg.github.io/Rev-Up/
// Override with REVUP_BASE=/ for a root site or REVUP_BASE=/some/nested/path/ for testing.
const PROD_BASE = process.env.REVUP_BASE ?? '/Rev-Up/';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** Emits manifest.webmanifest and a revisioned, scoped service worker listing every built file. */
function pwa(): Plugin {
  let cfg: ResolvedConfig;
  return {
    name: 'revup-pwa',
    configResolved(c) { cfg = c; },
    generateBundle() {
      const base = cfg.base;
      const manifest = {
        name: 'Rev Up',
        short_name: 'Rev Up',
        id: base,
        start_url: `${base}#garage`,
        scope: base,
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#1d1712',
        theme_color: '#1d1712',
        description: 'Merge parts, race for cash and reputation, and fill a showroom one earned car at a time.',
        categories: ['games'],
        icons: [
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      };
      this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: JSON.stringify(manifest, null, 2) });
    },
    closeBundle() {
      if (cfg.command !== 'build') return;
      const out = cfg.build.outDir;
      const files = walk(out)
        .map((f) => relative(out, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && f !== '.nojekyll' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(out, f)));
      const version = hash.digest('hex').slice(0, 12);
      const sw = readFileSync('src/sw/sw-template.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__SCOPE__', cfg.base)
        .replace('"__ASSETS__"', JSON.stringify(['./', ...files.filter((f) => f !== 'index.html'), 'index.html']));
      writeFileSync(join(out, 'sw.js'), sw);
      writeFileSync(join(out, '.nojekyll'), '');
      writeFileSync(join(out, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }));
    },
  };
}

export default defineConfig(({ command }) => ({
  base: command === 'build' ? PROD_BASE : '/',
  plugins: [pwa()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 600,
  },
  server: { host: true },
  preview: { host: true },
  test: { include: ['tests/**/*.test.ts'] },
}));
