/**
 * Dev server: static files + API proxy
 * Usage: node serve.js [port]
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = parseInt(process.argv[2]) || 8080;
const ROOT = __dirname;

const PROXY_MAP = {
  '/api/gamma': 'https://gamma-api.polymarket.com',
  '/api/clob': 'https://clob.polymarket.com',
  '/api/bybit': 'https://api.bybit.com',
  '/api/binance': 'https://api.binance.com',
};

const MIME = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
};

function proxy(req, res, targetBase, stripPrefix) {
  const targetPath = req.url.replace(stripPrefix, '') || '/';
  const target = new URL(targetPath, targetBase);
  target.search = new URL(req.url, 'http://localhost').search;

  const opts = {
    hostname: target.hostname,
    path: target.pathname + target.search,
    method: req.method,
    headers: { ...req.headers, host: target.hostname },
  };
  delete opts.headers['origin'];
  delete opts.headers['referer'];

  const proxyReq = https.request(opts, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, {
      ...proxyRes.headers,
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    });
    proxyRes.pipe(res);
  });
  proxyReq.on('error', (e) => {
    res.writeHead(502);
    res.end(`Proxy error: ${e.message}`);
  });
  req.pipe(proxyReq);
}

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': '*',
    });
    return res.end();
  }

  // API proxy
  for (const [prefix, target] of Object.entries(PROXY_MAP)) {
    if (req.url.startsWith(prefix)) {
      return proxy(req, res, target, prefix);
    }
  }

  // Static files
  const parsed = url.parse(req.url);
  let filePath = path.join(ROOT, decodeURIComponent(parsed.pathname));

  // Directory → index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath)) {
    // SPA fallback for React app subfolders
    const spaFolders = ['app', 'backtester', 'builder', 'designer', 'auto-hedger'];
    const matchedFolder = spaFolders.find(dir => parsed.pathname.startsWith(`/${dir}/`));
    if (matchedFolder) {
      filePath = path.join(ROOT, matchedFolder, 'index.html');
    } else {
      res.writeHead(404);
      return res.end('Not found');
    }
  }

  const ext = path.extname(filePath);
  const mime = MIME[ext] || 'application/octet-stream';
  res.writeHead(200, { 'content-type': mime });
  fs.createReadStream(filePath).pipe(res);
});

server.listen(PORT, () => {
  console.log(`\n  Landing:      http://localhost:${PORT}/`);
  console.log(`  Backtester:   http://localhost:${PORT}/backtester/`);
  console.log(`  Designer:     http://localhost:${PORT}/designer/`);
  console.log(`  Auto-Hedger:  http://localhost:${PORT}/auto-hedger/`);
  console.log(`  (dev only) Hedger:  http://localhost:${PORT}/app/`);
  console.log(`  (dev only) Builder: http://localhost:${PORT}/builder/`);
  console.log(`  API proxy active for: ${Object.keys(PROXY_MAP).join(', ')}\n`);
});
