import os from 'node:os';
import net from 'node:net';
import { spawn } from 'node:child_process';

const DEFAULT_BACKEND_PORT = '8080';
const DEFAULT_EXPO_PORT = 8081;

const readPort = (value, fallback) => {
  const port = Number(value || fallback);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
};

const isPortAvailable = (port) => new Promise((resolve) => {
  const tester = net.createServer();
  tester.once('error', () => resolve(false));
  tester.once('listening', () => tester.close(() => resolve(true)));
  tester.listen(port);
});

const findAvailablePort = async (startPort) => {
  for (let port = startPort; port < startPort + 20 && port < 65536; port += 1) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available Expo port found from ${startPort} to ${Math.min(startPort + 19, 65535)}`);
};

function getLanAddress() {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) return entry.address;
    }
  }
  return null;
}

const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const backendHost = process.env.BACKEND_HOST || process.env.LAN_IP || getLanAddress() || 'localhost';
const backendPort = process.env.BACKEND_PORT || DEFAULT_BACKEND_PORT;
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || `http://${backendHost}:${backendPort}`;
const expoHost = process.env.EXPO_HOST || 'lan';
const expoPort = await findAvailablePort(readPort(process.env.EXPO_PORT, DEFAULT_EXPO_PORT));
const expoLinkBase = `exp://${backendHost}:${expoPort}/--`;

const args = ['expo', 'start', '--clear', '--host', expoHost, '--port', String(expoPort)];

console.log(`Expo host: ${expoHost}`);
console.log(`Expo port: ${expoPort}`);
console.log(`Expo Go API base URL: ${apiBaseUrl}`);
console.log('Expo Go OAuth deep links for the backend:');
console.log(`  NOTION_LINK_DEEP_LINK=${expoLinkBase}/notion/link`);
console.log(`  APP_NOTION_LINK_DEEP_LINK=${expoLinkBase}/notion/link`);
console.log(`  APP_OAUTH_MOBILE_NOTION_LOGIN_DEEP_LINK=${expoLinkBase}/oauth/notion`);
console.log(`  APP_OAUTH_MOBILE_GOOGLE_DEEP_LINK=${expoLinkBase}/oauth/google`);
console.log('OAuth also needs OAUTH_BASE_URL to be an HTTPS URL that forwards to this backend.');
console.log('If the phone cannot connect, make sure it can open the API base URL on the same network.\n');

const child = spawn(npxCommand, args, {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    EXPO_PUBLIC_API_BASE_URL: apiBaseUrl,
  },
});

child.on('error', (error) => {
  console.error(`Failed to start Expo: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
