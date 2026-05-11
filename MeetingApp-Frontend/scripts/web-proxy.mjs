import http from 'node:http';
import { spawn } from 'node:child_process';

const expoPort = Number(process.env.EXPO_PORT || 8081);
const proxyPort = Number(process.env.PROXY_PORT || 3000);
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:8080';

const expo = spawn('npx', ['expo', 'start', '--web', '--port', String(expoPort)], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: 'same-origin',
  },
});

const proxyRequest = (clientReq, clientRes, targetOrigin) => {
  const target = new URL(clientReq.url || '/', targetOrigin);
  const proxyReq = http.request({
    hostname: target.hostname,
    port: target.port,
    path: `${target.pathname}${target.search}`,
    method: clientReq.method,
    headers: {
      ...clientReq.headers,
      host: target.host,
    },
  }, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', () => {
    clientRes.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    clientRes.end(`Cannot reach ${targetOrigin}`);
  });

  clientReq.pipe(proxyReq);
};

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/api/')) {
    proxyRequest(req, res, backendOrigin);
    return;
  }
  proxyRequest(req, res, `http://localhost:${expoPort}`);
});

server.listen(proxyPort, () => {
  console.log(`\nFrontend proxy: http://localhost:${proxyPort}`);
  console.log(`Expo web:       http://localhost:${expoPort}`);
  console.log(`Backend:        ${backendOrigin}\n`);
});

const shutdown = () => {
  server.close();
  expo.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
