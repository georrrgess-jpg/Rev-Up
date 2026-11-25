// Minimal static server that mounts a build directory at a URL prefix, like GitHub Pages
// serves a project site at /<repo>/. Used by the smoke test; also handy for manual checks:
//   node scripts/serve.mjs dist /Rev-Up/ 4180
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.txt': 'text/plain',
};

export function serve(dirRef, prefix, port) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end('not found'); return; }
    let rel = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    if (rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(dirRef.dir, rel));
    if (!file.startsWith(normalize(dirRef.dir))) { res.writeHead(403); res.end(); return; }
    try {
      const st = await stat(file);
      if (!st.isFile()) throw new Error('dir');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      res.end(body);
    } catch {
      res.writeHead(404); res.end('not found');
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (process.argv[1]?.endsWith('serve.mjs')) {
  const [dir = 'dist', prefix = '/Rev-Up/', port = '4180'] = process.argv.slice(2);
  await serve({ dir }, prefix, Number(port));
  console.log(`Serving ${dir} at http://localhost:${port}${prefix}`);
}
