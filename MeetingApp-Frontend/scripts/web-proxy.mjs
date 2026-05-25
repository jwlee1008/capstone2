import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';

const readPort = (value, fallback) => {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
};

const preferredProxyPort = readPort(process.env.PROXY_PORT, 8081);
const preferredExpoPort = readPort(process.env.EXPO_PORT, 8082);
const backendOrigin = process.env.BACKEND_ORIGIN || 'http://localhost:8080';

const isPortAvailable = (port) => new Promise((resolve) => {
  const tester = net.createServer();
  tester.once('error', () => resolve(false));
  tester.once('listening', () => tester.close(() => resolve(true)));
  tester.listen(port);
});

const findAvailablePort = async (startPort, blockedPorts = []) => {
  for (let port = startPort; port < startPort + 20 && port < 65536; port += 1) {
    if (!blockedPorts.includes(port) && await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found from ${startPort} to ${Math.min(startPort + 19, 65535)}`);
};

const proxyPort = await findAvailablePort(preferredProxyPort);
const expoPort = await findAvailablePort(preferredExpoPort, [proxyPort]);
const configuredClientApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const clientApiBaseUrl = configuredClientApiBaseUrl && configuredClientApiBaseUrl !== 'same-origin'
  ? configuredClientApiBaseUrl
  : `http://localhost:${proxyPort}`;
const apiCorsOrigins = new Set([
  `http://localhost:${proxyPort}`,
  `http://127.0.0.1:${proxyPort}`,
  `http://localhost:${expoPort}`,
  `http://127.0.0.1:${expoPort}`,
]);

const withApiCorsHeaders = (req, headers = {}) => {
  const origin = req.headers.origin;
  const corsOrigin = origin && apiCorsOrigins.has(origin) ? origin : '*';
  return {
    ...headers,
    'access-control-allow-origin': corsOrigin,
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || 'Content-Type, Authorization',
    vary: headers.vary ? `${headers.vary}, Origin` : 'Origin',
  };
};

const proxyRequest = (clientReq, clientRes, targetOrigin, options = {}) => {
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
    const headers = options.apiCors ? withApiCorsHeaders(clientReq, proxyRes.headers) : proxyRes.headers;
    clientRes.writeHead(proxyRes.statusCode || 500, headers);
    proxyRes.pipe(clientRes);
  });

  proxyReq.on('error', () => {
    const headers = options.apiCors
      ? withApiCorsHeaders(clientReq, { 'Content-Type': 'text/plain; charset=utf-8' })
      : { 'Content-Type': 'text/plain; charset=utf-8' };
    clientRes.writeHead(502, headers);
    clientRes.end(`Cannot reach ${targetOrigin}`);
  });

  clientReq.pipe(proxyReq);
};

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  if (url.startsWith('/api/')) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, withApiCorsHeaders(req));
      res.end();
      return;
    }
    proxyRequest(req, res, backendOrigin, { apiCors: true });
    return;
  }
  proxyRequest(req, res, `http://localhost:${expoPort}`);
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

let expoProcess = null;
let shuttingDown = false;
let serverOpen = false;

const closeServer = (onClosed = () => {}) => {
  if (!serverOpen) {
    onClosed();
    return;
  }
  serverOpen = false;
  server.close(onClosed);
};

const shutdown = (exitCode = 0) => {
  if (shuttingDown) return;
  shuttingDown = true;
  if (expoProcess && !expoProcess.killed) expoProcess.kill('SIGTERM');
  closeServer(() => {
    if (!expoProcess) process.exit(exitCode);
  });
};

const startExpo = () => {
  try {
    expoProcess = spawn('npx', ['expo', 'start', '--web', '--port', String(expoPort)], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        EXPO_PUBLIC_API_BASE_URL: clientApiBaseUrl,
      },
    });
  } catch (error) {
    console.error(`Failed to start Expo: ${error.message}`);
    shutdown(1);
    return;
  }

  expoProcess.on('error', (error) => {
    console.error(`Failed to start Expo: ${error.message}`);
    shutdown(1);
  });

  expoProcess.on('exit', (code) => closeServer(() => process.exit(shuttingDown ? 0 : code ?? 0)));
};

server.on('error', (error) => {
  console.error(`Proxy server failed: ${error.message}`);
  if (expoProcess && !expoProcess.killed) expoProcess.kill('SIGTERM');
  process.exit(1);
});

server.listen(proxyPort, () => {
  serverOpen = true;
  if (proxyPort !== preferredProxyPort) console.log(`Port ${preferredProxyPort} is busy. Using ${proxyPort} for the frontend proxy.`);
  if (expoPort !== preferredExpoPort) console.log(`Port ${preferredExpoPort} is busy. Using ${expoPort} for Expo web.`);
  console.log(`\nFrontend proxy: http://localhost:${proxyPort}`);
  console.log(`Expo web:       http://localhost:${expoPort}`);
  console.log(`API base:       ${clientApiBaseUrl}`);
  console.log(`Backend:        ${backendOrigin}\n`);
  startExpo();
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
