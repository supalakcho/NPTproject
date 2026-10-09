// dev server เล็กๆ (ใช้เฉพาะตอนพัฒนา ไม่ได้ส่งไปกับระบบจริง)
//  - เสิร์ฟไฟล์ frontend ที่พอร์ต 5173
//  - ส่งต่อ /api และ /uploads ไปที่ backend (ค่าเริ่มต้น http://localhost:3000) เพื่อให้เป็น origin เดียวกัน ไม่ต้องใช้ CORS
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const BACKEND = new URL(process.env.BACKEND_URL ?? 'http://localhost:3000');

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml',
};

function proxy(req, res) {
  const upstream = http.request({
    host: BACKEND.hostname, port: BACKEND.port, method: req.method, path: req.url,
    headers: { ...req.headers, host: BACKEND.host },
  }, (up) => {
    res.writeHead(up.statusCode, up.headers);
    up.pipe(res);
  });
  upstream.on('error', () => {
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`เชื่อมต่อ backend (${BACKEND.origin}) ไม่ได้`);
  });
  req.pipe(upstream);
}

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/') || req.url.startsWith('/uploads/')) {
    proxy(req, res);
    return;
  }
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = resolve(join(root, pathname));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
}).listen(5173);
