/**
 * Static file server for the built app. Zero dependencies — Railway runs
 * `node server.js` after `npm run build` and routes traffic to $PORT.
 */
import { createReadStream, promises as fs } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const ROOT = resolve('dist');
const PORT = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function resolveFile(urlPath) {
  // Strip the query string and refuse anything that climbs out of dist/.
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  const candidate = resolve(join(ROOT, normalize(clean)));
  if (!candidate.startsWith(ROOT)) return null;
  try {
    const stat = await fs.stat(candidate);
    if (stat.isFile()) return candidate;
    if (stat.isDirectory()) return resolveFile(join(clean, 'index.html'));
  } catch {
    /* falls through to the SPA fallback */
  }
  return null;
}

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end('Method not allowed');
    return;
  }

  // Unknown paths fall back to index.html so client-side routing works.
  const file = (await resolveFile(req.url ?? '/')) ?? join(ROOT, 'index.html');
  const ext = extname(file);

  try {
    const stat = await fs.stat(file);
    res.writeHead(200, {
      'content-type': TYPES[ext] ?? 'application/octet-stream',
      'content-length': stat.size,
      // Hashed asset filenames can be cached hard; index.html must not be.
      'cache-control': file.includes(`${ROOT}/assets/`)
        ? 'public, max-age=31536000, immutable'
        : 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'same-origin',
    });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Budget app serving ${ROOT} on port ${PORT}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
