import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const proxyPort = Number(process.env.PROXY_PORT || 8081);
const expoPort = Number(process.env.EXPO_PORT || 8082);
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:8080';

// Keep the browser on 8081 so API calls stay same-origin without backend CORS changes.
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

server.on('upgrade', (req, socket, head) => {
  const target = new URL(req.url || '/', `http://localhost:${expoPort}`);
  const proxySocket = net.connect(Number(target.port) || 80, target.hostname, () => {
    proxySocket.write(`${req.method} ${target.pathname}${target.search} HTTP/${req.httpVersion}\r\n`);
    proxySocket.write(
      Object.entries({ ...req.headers, host: target.host })
        .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
        .join('\r\n'),
    );
    proxySocket.write('\r\n\r\n');
    if (head.length) proxySocket.write(head);
    socket.pipe(proxySocket);
    proxySocket.pipe(socket);
  });

  proxySocket.on('error', () => socket.destroy());
  socket.on('error', () => proxySocket.destroy());
});

const shutdown = () => {
  server.close();
  expo.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
