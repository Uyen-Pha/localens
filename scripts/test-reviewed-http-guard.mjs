import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';
import { forwardReviewedHttp } from '../tests/e2e/helpers/reviewed-http-guard.mjs';

const origins = new Set(['http://127.0.0.1:45101']);
function fixture(status, url = 'http://127.0.0.1:45101/en/tours/') {
  const calls = [];
  const response = { status: () => status };
  const route = {
    request: () => ({ url: () => url, method: () => 'GET', headers: () => ({}) }),
    fetch: async options => { calls.push(['fetch', options]); return response; },
    abort: async () => { calls.push(['abort']); },
    fulfill: async options => { calls.push(['fulfill', options]); },
  };
  return { route, calls, response };
}
test('fetches without following redirects and fulfills the original 2xx response', async () => {
  const { route, calls, response } = fixture(200);
  const blocked = [];
  await forwardReviewedHttp(route, origins, blocked);
  assert.deepEqual(calls, [['fetch', { maxRedirects: 0, headers: {} }], ['fulfill', { response }]]);
  assert.deepEqual(blocked, []);
});

test('requests full resources instead of forwarding cache validators that produce 304', async () => {
  const { route, calls, response } = fixture(200);
  route.request = () => ({ url: () => 'http://127.0.0.1:45101/chunk.js', method: () => 'GET',
    headers: () => ({ 'if-none-match': 'cached-etag', 'if-modified-since': 'yesterday', accept: '*/*' }) });
  await forwardReviewedHttp(route, origins, []);
  assert.deepEqual(calls, [['fetch', { maxRedirects: 0, headers: { accept: '*/*' } }], ['fulfill', { response }]]);
});
test('aborts every 3xx before inspection or fulfillment with an explicit diagnostic', async () => {
  for (let status = 300; status < 400; status++) {
    const { route, calls } = fixture(status);
    const blocked = [];
    await forwardReviewedHttp(route, origins, blocked, () => assert.fail('redirect must not reach the consumer'));
    assert.deepEqual(calls, [['fetch', { maxRedirects: 0, headers: {} }], ['abort']]);
    assert.deepEqual(blocked, [`Blocked HTTP redirect ${status}: http://127.0.0.1:45101/en/tours/`]);
  }
});
test('aborts an unapproved origin before fetching', async () => {
  const { route, calls } = fixture(200, 'https://example.com/');
  const blocked = [];
  await forwardReviewedHttp(route, origins, blocked);
  assert.deepEqual(calls, [['abort']]);
  assert.deepEqual(blocked, ['Blocked HTTP origin: https://example.com']);
});

test('Chrome needs app-origin local-network permission for guarded WebSockets after document fulfillment', async () => {
  const sockets = new Set();
  const server = createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<h1>Loading</h1><script>const ws=new WebSocket(location.origin.replace("http:","ws:")+"/hmr");ws.onopen=()=>document.querySelector("h1").textContent="Connected";ws.onerror=()=>document.querySelector("h1").textContent="Blocked";</script>');
  });
  server.on('upgrade', (request, socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome' });
    for (const grant of [false, true]) {
      const context = await browser.newContext({ serviceWorkers: 'block' });
      try {
        if (grant) await context.grantPermissions(['local-network-access'], { origin });
        const blocked = [];
        await context.route('**/*', route => forwardReviewedHttp(route, new Set([origin]), blocked));
        await context.routeWebSocket('**/*', socket => {
          if (socket.url() === origin.replace('http:', 'ws:') + '/hmr') socket.connectToServer();
          else socket.close();
        });
        const page = await context.newPage();
        await page.goto(origin + '/');
        await page.waitForFunction(() => document.querySelector('h1').textContent !== 'Loading');
        assert.equal(await page.locator('h1').innerText(), grant ? 'Connected' : 'Blocked');
        assert.deepEqual(blocked, []);
      } finally { await context.close(); }
    }
  } finally {
    if (browser) await browser.close();
    for (const socket of sockets) socket.destroy();
    await new Promise(resolve => server.close(resolve));
  }
});
