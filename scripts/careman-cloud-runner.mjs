#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

// The extractor script (SIEDA_EXTRACTOR_SCRIPT) is loaded at runtime instead of importing the app
// sources – so the cloud run needs no `npm ci` (saves ~15 s). Order: live site (always matches the
// deployed app) → file of this exact commit on GitHub → local repo file → app sources.
let SIEDA_EXTRACTOR_SCRIPT = '';
const looksLikeExtractor = (txt) => typeof txt === 'string' && txt.length > 10000 && txt.includes('CAREMAN_DAEMON_RESULT');

// Optional API capture (CAPTURE_API=true): records the CareMan (SIEDA myPlan) XHR/fetch calls made by
// the web app, so the extraction can later call the API directly instead of clicking through the UI.
// Stored only as a blob in the PRIVATE bridge repository – never in the (public) job log.
const CAPTURE_SCRIPT = `
(() => {
  try {
    if (!/dienstplan-bayern\.secure\.johanniter\.de$/.test(location.hostname) || window.__CM_CAPTURE_INSTALLED) return;
    window.__CM_CAPTURE_INSTALLED = true;
    window.__CM_CAPTURE = window.__CM_CAPTURE || [];
    const MAX_BODY = 250000;
    const tokenInfo = (v) => {
      try {
        const t = localStorage.getItem('myPlanToken') || '';
        const s = String(v || '');
        if (t && s.includes(t)) return s.replace(t, '<myPlanToken>');
        return s.length > 40 ? s.slice(0, 12) + '…(' + s.length + ')' : s;
      } catch (e) { return '?'; }
    };
    const push = (e) => { try { if (window.__CM_CAPTURE.length < 400) window.__CM_CAPTURE.push(e); } catch (x) {} };
    const XO = XMLHttpRequest.prototype.open, XS = XMLHttpRequest.prototype.send, XH = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.open = function (m, u) { this.__cm = { kind: 'xhr', method: m, url: String(u), headers: {}, t0: Date.now() }; return XO.apply(this, arguments); };
    XMLHttpRequest.prototype.setRequestHeader = function (k, v) { try { if (this.__cm) this.__cm.headers[k] = tokenInfo(v); } catch (e) {} return XH.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function (body) {
      const rec = this.__cm;
      if (rec) {
        rec.body = typeof body === 'string' ? body.slice(0, 20000) : (body ? '[' + typeof body + ']' : null);
        this.addEventListener('loadend', () => {
          try {
            rec.status = this.status;
            rec.ms = Date.now() - rec.t0;
            rec.contentType = this.getResponseHeader('content-type');
            let txt = '';
            try { txt = (this.responseType === '' || this.responseType === 'text') ? this.responseText : (this.responseType === 'json' ? JSON.stringify(this.response) : '[' + this.responseType + ']'); } catch (e) {}
            rec.size = txt ? txt.length : 0;
            rec.response = txt ? txt.slice(0, MAX_BODY) : '';
            push(rec);
          } catch (e) {}
        });
      }
      return XS.apply(this, arguments);
    };
    const F = window.fetch;
    if (F) window.fetch = async function (input, init) {
      const t0 = Date.now();
      const url = typeof input === 'string' ? input : (input && input.url) || String(input);
      const headers = {};
      try { const h = new Headers((init && init.headers) || (input && input.headers) || {}); h.forEach((v, k) => { headers[k] = tokenInfo(v); }); } catch (e) {}
      const res = await F.apply(this, arguments);
      try {
        const clone = res.clone();
        clone.text().then(txt => push({ kind: 'fetch', method: (init && init.method) || 'GET', url, headers, body: init && typeof init.body === 'string' ? init.body.slice(0, 20000) : null, status: res.status, ms: Date.now() - t0, contentType: res.headers.get('content-type'), size: txt.length, response: txt.slice(0, MAX_BODY) })).catch(() => {});
      } catch (e) {}
      return res;
    };
  } catch (e) {}
})();
`;

async function loadExtractorScript() {
  const sources = [
    process.env.EXTRACTOR_URL || 'https://schicht.vjbackhaus.de/careman-sync.js',
    process.env.GITHUB_SHA
      ? `https://raw.githubusercontent.com/Jobacke/Schichttagebuch/${process.env.GITHUB_SHA}/public/careman-sync.js`
      : null
  ].filter(Boolean);
  for (const url of sources) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}t=${Date.now()}`, { signal: controller.signal, cache: 'no-store' });
      clearTimeout(timer);
      if (r.ok) {
        const txt = await r.text();
        if (looksLikeExtractor(txt)) {
          console.log(`   Auslese-Skript geladen: ${url.replace(/\?.*$/, '')} (${txt.length} Zeichen)`);
          return txt;
        }
      }
    } catch {}
  }
  try {
    const local = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'public', 'careman-sync.js');
    if (fs.existsSync(local)) {
      const txt = fs.readFileSync(local, 'utf8');
      if (looksLikeExtractor(txt)) {
        console.log('   Auslese-Skript aus lokaler Datei geladen.');
        return txt;
      }
    }
  } catch {}
  const mod = await import('../src/utils/oneClickCareManSync.js');
  console.log('   Auslese-Skript aus App-Quellcode geladen.');
  return mod.SIEDA_EXTRACTOR_SCRIPT;
}

let debugPort = 0; // set by launchCloudChrome (read from DevToolsActivePort)
// All credentials come from GitHub Actions secrets (see .github/workflows/careman-cloud.yml):
//   BRIDGE_GH_TOKEN  – fine-grained token for Jobacke/careman-autopilot-bridge (Issues + Contents read/write)
//   CAREMAN_USER / CAREMAN_PASS – Johanniter Secure Portal login

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Zero-dependency RFC-6455 WebSocket client fallback for Node 20 without --experimental-websocket
class MiniWebSocket {
  constructor(urlStr) {
    this.readyState = 0;
    this.listeners = { open: [], message: [], error: [], close: [] };
    this._buf = Buffer.alloc(0);
    this._frag = [];
    const u = new URL(urlStr);
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      hostname: u.hostname,
      port: u.port || 80,
      path: u.pathname + u.search,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': key
      }
    });
    req.on('upgrade', (res, socket, head) => {
      this.socket = socket;
      this.readyState = 1;
      if (head && head.length) this._onData(head);
      socket.on('data', chunk => this._onData(chunk));
      socket.on('close', () => {
        this.readyState = 3;
        this._emit('close', {});
      });
      socket.on('error', err => this._emit('error', err));
      this._emit('open', {});
    });
    req.on('error', err => this._emit('error', err));
    req.end();
  }

  addEventListener(type, fn) {
    if (this.listeners[type]) this.listeners[type].push(fn);
  }

  _emit(type, ev) {
    for (const fn of (this.listeners[type] || [])) {
      try { fn(ev); } catch {}
    }
  }

  _onData(chunk) {
    this._buf = Buffer.concat([this._buf, chunk]);
    while (this._buf.length >= 2) {
      const b0 = this._buf[0];
      const b1 = this._buf[1];
      const fin = (b0 & 0x80) !== 0;
      const opcode = b0 & 0x0f;
      const masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f;
      let offset = 2;
      if (len === 126) {
        if (this._buf.length < 4) return;
        len = this._buf.readUInt16BE(2);
        offset = 4;
      } else if (len === 127) {
        if (this._buf.length < 10) return;
        len = Number(this._buf.readBigUInt64BE(2));
        offset = 10;
      }
      let maskKey = null;
      if (masked) {
        if (this._buf.length < offset + 4) return;
        maskKey = this._buf.subarray(offset, offset + 4);
        offset += 4;
      }
      if (this._buf.length < offset + len) return;
      let payload = Buffer.from(this._buf.subarray(offset, offset + len));
      this._buf = this._buf.subarray(offset + len);
      if (masked && maskKey) {
        for (let i = 0; i < payload.length; i++) payload[i] ^= maskKey[i % 4];
      }

      if (opcode === 1 || opcode === 2) {
        this._frag = [payload];
        if (fin) {
          const full = Buffer.concat(this._frag).toString('utf8');
          this._frag = [];
          this._emit('message', { data: full });
        }
      } else if (opcode === 0) {
        this._frag.push(payload);
        if (fin) {
          const full = Buffer.concat(this._frag).toString('utf8');
          this._frag = [];
          this._emit('message', { data: full });
        }
      } else if (opcode === 8) {
        this.close();
      } else if (opcode === 9) {
        const mask = crypto.randomBytes(4);
        const h = Buffer.from([0x8a, 0x80 | payload.length]);
        const m = Buffer.alloc(payload.length);
        for (let i = 0; i < payload.length; i++) m[i] = payload[i] ^ mask[i % 4];
        try { this.socket?.write(Buffer.concat([h, mask, m])); } catch {}
      }
    }
  }

  send(str) {
    if (!this.socket || this.readyState !== 1) return;
    const data = Buffer.from(String(str), 'utf8');
    const mask = crypto.randomBytes(4);
    let header;
    if (data.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81;
      header[1] = 0x80 | data.length;
    } else if (data.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(data.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(data.length), 2);
    }
    const masked = Buffer.alloc(data.length);
    for (let i = 0; i < data.length; i++) masked[i] = data[i] ^ mask[i % 4];
    this.socket.write(Buffer.concat([header, mask, masked]));
  }

  close() {
    this.readyState = 3;
    try { this.socket?.end(); } catch {}
  }
}
MiniWebSocket.OPEN = 1;

const WsClass = MiniWebSocket;

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const ws = new WsClass(this.wsUrl);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('CDP WebSocket timeout')), 8000);
      ws.addEventListener('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.addEventListener('error', err => {
        clearTimeout(timer);
        reject(err);
      });
      ws.addEventListener('message', event => {
        try {
          const data = JSON.parse(String(event.data));
          if (data.id && this.pending.has(data.id)) {
            const { resolve: res, reject: rej } = this.pending.get(data.id);
            this.pending.delete(data.id);
            if (data.error) rej(new Error(data.error.message || 'CDP error'));
            else res(data.result);
          }
        } catch {}
      });
      ws.addEventListener('close', () => {
        for (const { reject: rej } of this.pending.values()) {
          rej(new Error('CDP connection closed'));
        }
        this.pending.clear();
      });
    });
  }

  send(method, params = {}) {
    if (!this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new Error('CDP WebSocket not open'));
    }
    const id = ++this.msgId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout calling ${method}`));
        }
      }, 10000);
      this.pending.set(id, {
        resolve: val => {
          clearTimeout(timer);
          resolve(val);
        },
        reject: err => {
          clearTimeout(timer);
          reject(err);
        }
      });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async evalInPage(expression, awaitPromise = false) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise
    });
    if (res?.exceptionDetails) {
      throw new Error(res.exceptionDetails.text || 'Eval exception');
    }
    return res?.result?.value;
  }

  close() {
    try {
      if (this.ws) this.ws.close();
    } catch {}
  }
}

async function getActivePageTarget() {
  if (!debugPort) return null;
  const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
  if (!res.ok) return null;
  const targets = await res.json();
  return targets.find(t =>
    t.type === 'page' &&
    t.webSocketDebuggerUrl &&
    !/devtools:\/\//i.test(t.url || '')
  ) || null;
}

function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c;
  }
  try {
    return execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
  } catch {
    return 'google-chrome';
  }
}

function listChromeBinaries() {
  const list = [
    process.env.CHROME_PATH,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(b => b && fs.existsSync(b));
  if (list.length === 0) list.push(findChromeBinary());
  return [...new Set(list)];
}

/**
 * Starts a headless Chrome robustly: several binaries / headless modes, free DevTools port
 * (read from DevToolsActivePort), up to 25 s per attempt, stderr is logged on failure.
 * Returns { proc, pageTarget, bin } or throws with the collected reasons.
 */
async function attachPrelaunchedChrome(startUrl) {
  const profileDir = process.env.PRELAUNCH_CHROME_PROFILE || '';
  const pid = parseInt(process.env.PRELAUNCH_CHROME_PID || '0', 10);
  if (!profileDir || !pid) return null;
  delete process.env.PRELAUNCH_CHROME_PROFILE; // only once
  const alive = () => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const kill = (sig) => { try { process.kill(pid, sig || 'SIGTERM'); } catch {} };
  const t0 = Date.now();
  let pageTarget = null;
  while (Date.now() - t0 < 30000 && alive()) {
    try {
      if (!debugPort) {
        const portFile = path.join(profileDir, 'DevToolsActivePort');
        if (fs.existsSync(portFile)) {
          const port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10);
          if (port > 0) debugPort = port;
        }
      }
      pageTarget = await getActivePageTarget();
      if (pageTarget) break;
    } catch {}
    await sleep(100);
  }
  if (!pageTarget) {
    console.log(`⚠️ Vorab gestartetes Chrome nicht erreichbar (${alive() ? 'keine DevTools-Verbindung' : 'beendet'}) – starte neu.`);
    try {
      const logFile = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'cm-chrome.log');
      const lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).slice(-12);
      if (lines.length) console.log('   Chrome-Ausgabe:\n   ' + lines.join('\n   '));
    } catch {}
    kill('SIGKILL');
    debugPort = 0;
    return null;
  }
  console.log(`✅ Chrome läuft (vorab gestartet, Port ${debugPort}, ${Date.now() - t0} ms Wartezeit im Runner).`);
  if (startUrl && (!pageTarget.url || /^about:blank/i.test(pageTarget.url))) {
    try {
      const nav = new CdpSession(pageTarget.webSocketDebuggerUrl);
      await nav.connect();
      await nav.send('Page.navigate', { url: startUrl });
      nav.close();
    } catch {}
  }
  return { proc: { kill }, pageTarget, bin: '/usr/bin/google-chrome' };
}

async function launchCloudChrome(startUrl) {
  const pre = await attachPrelaunchedChrome(startUrl).catch(() => null);
  if (pre) return pre;
  const binaries = listChromeBinaries();
  const modes = ['--headless=new', '--headless'];
  const reasons = [];
  let attempt = 0;

  for (const bin of binaries) {
    for (const mode of modes) {
      if (attempt >= 4) break;
      attempt++;
      const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'careman-cloud-profile-'));
      const stderrLines = [];
      let exitInfo = null;
      console.log(`🧭 Chrome-Start Versuch ${attempt}: ${bin} ${mode}`);
      let proc;
      try {
        proc = spawn(bin, [
          '--remote-debugging-port=0',
          '--remote-debugging-address=127.0.0.1',
          `--user-data-dir=${profileDir}`,
          mode,
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-extensions',
          '--disable-background-networking',
          '--password-store=basic',
          '--use-mock-keychain',
          '--disable-features=MediaRouter,OptimizationHints,Translate',
          '--lang=de-DE',
          '--accept-lang=de-DE,de',
          '--window-size=1440,900',
          startUrl
        ], {
          stdio: ['ignore', 'ignore', 'pipe'],
          env: { ...process.env, LANG: 'de_DE.UTF-8', LC_ALL: 'de_DE.UTF-8', TZ: 'Europe/Berlin' }
        });
      } catch (err) {
        reasons.push(`Versuch ${attempt}: Start nicht möglich (${err.message})`);
        continue;
      }
      proc.on('error', err => { exitInfo = `Startfehler ${err.message}`; });
      proc.on('exit', (code, signal) => { if (exitInfo === null) exitInfo = `beendet (Code ${code}, Signal ${signal})`; });
      proc.stderr.on('data', d => {
        String(d).split('\n').filter(Boolean).forEach(line => {
          stderrLines.push(line);
          if (stderrLines.length > 25) stderrLines.shift();
        });
      });

      let pageTarget = null;
      for (let i = 0; i < 100 && exitInfo === null; i++) { // up to 25 s
        await sleep(250);
        try {
          if (!debugPort) {
            const portFile = path.join(profileDir, 'DevToolsActivePort');
            if (fs.existsSync(portFile)) {
              const port = parseInt(fs.readFileSync(portFile, 'utf8').split('\n')[0], 10);
              if (port > 0) debugPort = port;
            }
          }
          pageTarget = await getActivePageTarget();
          if (pageTarget) break;
        } catch {}
      }

      if (pageTarget) {
        console.log(`✅ Chrome läuft (Port ${debugPort}, Versuch ${attempt}).`);
        return { proc, pageTarget, bin };
      }

      const why = exitInfo || 'keine DevTools-Verbindung nach 25 s';
      reasons.push(`Versuch ${attempt} (${path.basename(bin)} ${mode}): ${why}`);
      console.log(`⚠️ Chrome-Start Versuch ${attempt} fehlgeschlagen: ${why}`);
      if (stderrLines.length) console.log('   Chrome-Ausgabe:\n   ' + stderrLines.slice(-12).join('\n   '));
      try { proc.kill('SIGKILL'); } catch {}
      debugPort = 0;
      await sleep(500);
    }
  }
  const msg = 'Cloud-Browser konnte nicht gestartet werden – ' + reasons.join(' | ');
  if (process.env.CHROME_FALLBACK_AVAILABLE === 'true') {
    // tells the workflow to install its own Chrome and run again
    try { fs.writeFileSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'chrome_failed'), msg); } catch {}
  }
  throw new Error(msg);
}

/**
 * Self-test (workflow input "selftest" or daily schedule): starts Chrome, opens the
 * Johanniter login and checks that the page renders. Exit code 1 on failure so the
 * GitHub run turns red and GitHub sends a notification e-mail.
 */
async function runSelfTest() {
  const url = 'https://dienstplan-bayern.secure.johanniter.de/';
  console.log('🩺 Selbsttest Cloud-Autopilot: starte Chrome und öffne ' + url);
  let launched = null;
  try {
    launched = await launchCloudChrome(url);
    try {
      console.log('   Chrome-Version: ' + execSync(`"${launched.bin}" --version`, { encoding: 'utf8' }).trim());
    } catch {}
    const cdp = new CdpSession(launched.pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Runtime.enable').catch(() => {});
    let info = null;
    for (let i = 0; i < 60; i++) {
      await sleep(1000);
      info = await cdp.evalInPage(`(() => ({ href: location.href, title: document.title, ready: document.readyState,
        hasPassword: Boolean(document.querySelector('input[type="password"]')),
        text: (document.body ? document.body.innerText : '').slice(0, 200) }))()`).catch(() => null);
      if (info && info.ready === 'complete' && /johanniter/i.test(info.href) && (info.hasPassword || info.text.length > 20)) break;
    }
    cdp.close();
    console.log('   Seite: ' + JSON.stringify(info));
    if (!info || !/johanniter/i.test(info.href || '')) throw new Error('Johanniter-Seite wurde nicht geladen');
    const extractor = await loadExtractorScript();
    if (!looksLikeExtractor(extractor)) throw new Error('Auslese-Skript nicht ladbar');
    console.log('✅ Selbsttest erfolgreich – Cloud-Browser, Johanniter-Anmeldung und Auslese-Skript verfügbar.');
  } finally {
    if (launched) try { launched.proc.kill('SIGKILL'); } catch {}
  }
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' && process.env.FORCE_CLOUD_RUNNER !== '1') {
    return;
  }

  if (process.env.CLOUD_SELFTEST === 'true' || process.env.CLOUD_SELFTEST === '1') {
    await runSelfTest();
    return;
  }

  const ghToken = String(process.env.BRIDGE_GH_TOKEN || '').trim();
  if (!ghToken) {
    console.log('ℹ️ Secret BRIDGE_GH_TOKEN fehlt – Cloud-Auto-Pilot übersprungen.');
    return;
  }

  const issueUrl = 'https://api.github.com/repos/Jobacke/careman-autopilot-bridge/issues/1';
  const blobsUrl = 'https://api.github.com/repos/Jobacke/careman-autopilot-bridge/git/blobs';
  const ghHeaders = {
    'Authorization': `Bearer ${ghToken}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'User-Agent': 'Schichttagebuch-CloudRunner'
  };

  let bridgeState = {};
  const getBridgeState = async () => {
    const r = await fetch(`${issueUrl}?t=${Date.now()}`, { headers: ghHeaders });
    if (!r.ok) return null;
    const iss = await r.json();
    try {
      bridgeState = JSON.parse(iss.body || '{}');
      return bridgeState;
    } catch {
      return null;
    }
  };

  // Updates run one after another in the background (keeps their order) – the login loop never waits for GitHub.
  // "await patchBridge(...)" still waits until this and all earlier updates are written.
  let patchChain = Promise.resolve();
  const patchBridge = (partialObj) => {
    bridgeState = { ...bridgeState, ...partialObj };
    delete bridgeState.credsPass; // never store credentials in the issue
    delete bridgeState.credsUser;
    const body = JSON.stringify({ body: JSON.stringify(bridgeState, null, 2) });
    patchChain = patchChain.then(() => fetch(issueUrl, { method: 'PATCH', headers: ghHeaders, body })).catch(() => {});
    return patchChain;
  };

  const createResultBlob = async (jsonStr) => {
    const r = await fetch(blobsUrl, {
      method: 'POST',
      headers: ghHeaders,
      body: JSON.stringify({
        content: Buffer.from(String(jsonStr), 'utf8').toString('base64'),
        encoding: 'base64'
      })
    });
    if (!r.ok) return '';
    const d = await r.json();
    return d.sha || '';
  };

  const f = (await getBridgeState()) || {};
  const reqStatus = f.status || '';
  const reqId = f.requestId || '';
  const reqAt = Number(f.requestedAt || 0);
  const ym = f.ym || '2026-11';
  const targetDate = f.targetDate || '2026-11-7';
  const credsUser = String(process.env.CAREMAN_USER || '').trim() || 'johannes.backhaus@johanniter.de';
  const credsPass = String(process.env.CAREMAN_PASS || '');
  const myPlanToken = f.myPlanToken || '';
  // CareMan's own login (opta data / SIEDA) – separate secrets if it differs from the Johanniter login
  const siedaUser = String(process.env.CAREMAN_SIEDA_USER || '').trim() || credsUser;
  const siedaPass = String(process.env.CAREMAN_SIEDA_PASS || '') || credsPass;

  const seedMyPlanScript = `
    try {
      if (${JSON.stringify(Boolean(myPlanToken))} && location.hostname === 'dienstplan-bayern.secure.johanniter.de' && !localStorage.getItem('myPlanToken')) {
        localStorage.setItem('myPlanToken', ${JSON.stringify(myPlanToken)});
        localStorage.setItem('myPlanLogin', JSON.stringify({ userId: 5692, kennwortAenderungNotwendig: false, warningMessage: '' }));
        localStorage.setItem('myPlanTenant', '-');
        localStorage.setItem('stayLoggedIn', 'true');
        localStorage.setItem('#5692-selectedEmployeeId', '11948');
      }
    } catch (e) {}
  `;

  // GitHub can queue a job for a few minutes – accept requests up to 10 minutes old
  if (reqStatus !== 'requested' || !reqId || (Date.now() - reqAt > 600000)) {
    console.log('ℹ️ No pending CareMan Cloud Auto-Pilot job – skipping cloud browser run.');
    return;
  }

  console.log(`☁️ Starting CareMan Cloud Auto-Pilot for ${ym} (${targetDate}), requestId=${reqId}...`);
  patchBridge({
    resultJson: '',
    resultBlobSha: '',
    status: 'running',
    stepMessage: `☁️ Cloud-Auto-Pilot verbunden – öffne Johanniter-Anmeldung für ${ym}...`,
    updatedAt: Date.now()
  });

  const targetCareManUrl = `https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=${targetDate}`;

  // Load the extractor in parallel to the Chrome start (needed only after the login)
  const extractorPromise = loadExtractorScript().catch(err => {
    console.error('⚠️ Auslese-Skript konnte nicht geladen werden: ' + (err.message || err));
    return '';
  });

  let proc;
  try {
    const launched = await launchCloudChrome(targetCareManUrl);
    proc = launched.proc;
  } catch (err) {
    console.error('❌ ' + err.message);
    if (process.env.CHROME_FALLBACK_AVAILABLE === 'true') {
      // The workflow installs its own Chrome and starts the runner again – keep the job "requested"
      await patchBridge({ status: 'requested', stepMessage: '🔧 Cloud-Browser wird neu eingerichtet – einen Moment …', updatedAt: Date.now() });
      process.exitCode = 3;
      return;
    }
    await patchBridge({
      status: 'error',
      stepMessage: '⚠️ Cloud-Browser konnte nicht gestartet werden (Server-Problem bei GitHub). Bitte gleich noch einmal versuchen.',
      error: String(err.message || err).slice(0, 900),
      updatedAt: Date.now()
    });
    process.exitCode = 1;
    return;
  }

  let cdp = null;
  let connectedUrl = '';
  let lastExtractorInjectAt = 0;
  let lastPasswordSubmitAt = 0;
  // Protection against account lockouts: each login form is submitted at most a few times
  let johanniterSubmits = 0;
  let siedaSubmits = 0;
  let aborted = false;
  const siedaConfigured = Boolean(String(process.env.CAREMAN_SIEDA_PASS || ''));
  const abortRun = async (msg) => {
    console.error('⛔ ' + msg);
    await patchBridge({ status: 'error', noRetry: true, stepMessage: msg, updatedAt: Date.now() });
    process.exitCode = 1;
    aborted = true;
  };
  let last2faSelectAt = 0;
  let lastStepMsg = '';
  let seedAttempts = 0;
  let monthFixed = false;

  const updateStep = async (msg) => {
    if (!msg || msg === lastStepMsg) return;
    lastStepMsg = msg;
    console.log('[Cloud Auto-Pilot]', msg);
    patchBridge({
      status: 'running',
      stepMessage: msg,
      updatedAt: Date.now()
    });
  };

  let finished = false;
  try {
    for (let tick = 0; tick < 550; tick++) {
      const latestTarget = await getActivePageTarget().catch(() => null);
      if (!latestTarget) {
        await sleep(300);
        continue;
      }

      if (!cdp || latestTarget.webSocketDebuggerUrl !== connectedUrl) {
        if (cdp) cdp.close();
        cdp = new CdpSession(latestTarget.webSocketDebuggerUrl);
        try {
          await cdp.connect();
        } catch (err) {
          // page is navigating – just try again on the next tick
          console.log('   CDP-Verbindung wird neu aufgebaut: ' + (err.message || err));
          cdp = null;
          connectedUrl = '';
          await sleep(500);
          continue;
        }
        await cdp.send('Page.enable').catch(() => {});
        await cdp.send('Runtime.enable').catch(() => {});
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seedMyPlanScript }).catch(() => {});
        if (process.env.CAPTURE_API === 'true') {
          await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: CAPTURE_SCRIPT }).catch(() => {});
        }
        connectedUrl = latestTarget.webSocketDebuggerUrl;
      }

      const pageState = await cdp.evalInPage(`(() => {
        const href = window.location.href || '';
        const host = window.location.hostname || '';
        const readyState = document.readyState;
        const bodyText = (document.body ? (document.body.innerText || document.body.textContent || '') : '').trim();
        const passEl = document.querySelector('input[type="password"]');
        const hasPassInput = Boolean(passEl);
        let freshMyPlanToken = '';
        try {
          if (host === 'dienstplan-bayern.secure.johanniter.de') {
            freshMyPlanToken = localStorage.getItem('myPlanToken') || '';
          }
        } catch (e) {}
        const extractorRunning = Boolean(window.__CAREMAN_EXTRACTOR_RUNNING);
        const bannerText = document.querySelector('[data-careman-sync-banner]')?.textContent || '';
        const daemonResult = window.__CAREMAN_DAEMON_RESULT ||
          (window.name && window.name.startsWith('CAREMAN_SYNC:') ? window.name.slice('CAREMAN_SYNC:'.length) : null);
        return { href, host, readyState, bodyText: bodyText.slice(0, 1500), hasPassInput, freshMyPlanToken, extractorRunning, bannerText, daemonResult };
      })()`).catch(() => null);

      if (!pageState) {
        await sleep(400);
        continue;
      }

      if (pageState.daemonResult && pageState.daemonResult.length > 20) {
        let captureBlobSha = '';
        if (process.env.CAPTURE_API === 'true') {
          try {
            const cap = await cdp.evalInPage(`JSON.stringify({ capturedAt: Date.now(), href: location.href, calls: window.__CM_CAPTURE || [] })`);
            if (cap) {
              captureBlobSha = await createResultBlob(cap).catch(() => '');
              const n = (() => { try { return JSON.parse(cap).calls.length; } catch { return 0; } })();
              console.log(`   API-Mitschnitt: ${n} Aufrufe gespeichert (privat in der Bridge).`);
            }
          } catch (err) {
            console.log('   API-Mitschnitt nicht möglich: ' + (err.message || err));
          }
        }
        const doneFields = {
          status: 'done',
          stepMessage: `✅ Alle 3 Wachen (${ym}) über Cloud geladen – übertrage ins Journal...`,
          ...(captureBlobSha ? { captureBlobSha, captureAt: Date.now() } : {}),
          ...(pageState.freshMyPlanToken ? { myPlanToken: pageState.freshMyPlanToken } : {}),
          updatedAt: Date.now()
        };
        // Schnell: Ergebnis direkt in die (private) Bridge schreiben – die App braucht dann keinen zweiten Abruf.
        let blobSha = '';
        let inlineOk = false;
        await patchChain; // laufende Statusmeldungen zuerst abschließen
        const inlineState = { ...bridgeState, ...doneFields, resultJson: pageState.daemonResult, resultBlobSha: '' };
        delete inlineState.credsPass;
        delete inlineState.credsUser;
        const inlineBody = JSON.stringify({ body: JSON.stringify(inlineState) });
        if (inlineBody.length < 60000) {
          for (let tryNo = 0; tryNo < 2 && !inlineOk; tryNo++) {
            const r = await fetch(issueUrl, { method: 'PATCH', headers: ghHeaders, body: inlineBody }).catch(() => null);
            inlineOk = Boolean(r && r.ok);
            if (!inlineOk) await sleep(800);
          }
          if (inlineOk) bridgeState = inlineState;
        }
        if (!inlineOk) {
          for (let tryNo = 0; tryNo < 3 && !blobSha; tryNo++) {
            blobSha = await createResultBlob(pageState.daemonResult).catch(() => '');
            if (!blobSha) await sleep(1500);
          }
          await patchBridge({ ...doneFields, resultJson: '', resultBlobSha: blobSha });
        }
        console.log('✅ Cloud Auto-Pilot finished successfully! ' + (inlineOk ? 'Ergebnis direkt in der Bridge' : 'blobSha=' + blobSha));
        finished = true;
        break;
      }

      if (/my\.secure\.johanniter\.de/i.test(pageState.host)) {
        if (pageState.href.includes('/error_path/')) {
          await cdp.evalInPage(`window.location.href = ${JSON.stringify(targetCareManUrl)};`).catch(() => {});
          await sleep(800);
          continue;
        }

        if (!pageState.href.includes('/auth/ui/') && /Dienstplan\s+BAYERN|Webanwendungen|Self\s*Service/i.test(pageState.bodyText)) {
          await updateStep(`🚀 Airlock 2FA bestätigt! Öffne Dienstplan Bayern (${targetDate})...`);
          await cdp.evalInPage(`window.location.href = ${JSON.stringify(targetCareManUrl)};`).catch(() => {});
          await sleep(600);
          continue;
        }

        if (/Anmeldung\s+mit\s+Airlock\s+2FA|Login\s+with\s+Airlock\s+2FA|Nachricht\s+auf\s+Ihrem\s+Smartphone|message\s+on\s+your\s+smartphone|Offline-Modus|Offline\s+mode/i.test(pageState.bodyText)) {
          await updateStep(`📱 Bitte jetzt in Airlock 2FA auf deinem iPhone bestätigen – Dienstplan (${ym}) lädt danach automatisch!`);
          await sleep(500);
          continue;
        }

        if (/Authentisierungsm[öo]glichkeiten|Authentication\s+options|Airlock\s+2FA/i.test(pageState.bodyText) && !pageState.hasPassInput) {
          if (Date.now() - last2faSelectAt > 2000) {
            await updateStep('⚡ Wähle Airlock 2FA aus...');
            last2faSelectAt = Date.now();
            await cdp.evalInPage(`(async () => {
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const labelsAndSpans = Array.from(document.querySelectorAll('label, span, div, [role="radio"]')).filter(el =>
                /^Airlock\\s*2FA$/i.test((el.innerText || el.textContent || '').trim())
              );
              const rInp = document.querySelector('input[type="radio"]');
              if (rInp) {
                rInp.click();
                rInp.checked = true;
                rInp.dispatchEvent(new Event('input', { bubbles: true }));
                rInp.dispatchEvent(new Event('change', { bubbles: true }));
              }
              labelsAndSpans.forEach(el => { try { el.click(); } catch (e) {} });
              await sleep(250);
              const btn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find(b =>
                /^(Ausw[äa]hlen|Weiter|Best[äa]tigen|OK|Anmelden|Select|Continue|Next|Confirm|Submit)$/i.test((b.innerText || b.value || b.textContent || '').trim())
              );
              if (btn) btn.click();
            })()`, true).catch(() => {});
          }
          await sleep(450);
          continue;
        }

        if (pageState.hasPassInput && johanniterSubmits >= 2 && Date.now() - lastPasswordSubmitAt > 20000) {
          await abortRun('⛔ Johanniter-Anmeldung wurde abgelehnt. Bitte das Passwort im GitHub-Secret CAREMAN_PASS prüfen – zum Schutz vor einer Kontosperre wird nicht weiter probiert.');
          break;
        }

        if (pageState.hasPassInput && credsPass && johanniterSubmits < 2 && Date.now() - lastPasswordSubmitAt > 8000) {
          await updateStep(`🔐 Trage Benutzername & Passwort in der Cloud ein und klicke auf Anmelden...`);
          lastPasswordSubmitAt = Date.now();
          johanniterSubmits++;
          await cdp.evalInPage(`(async () => {
            const sleep = ms => new Promise(r => setTimeout(r, ms));
            const fillField = (el, val) => {
              if (!el) return;
              el.focus();
              try {
                el.select();
                document.execCommand('insertText', false, val);
              } catch (e) {}
              if (el.value !== val) {
                const proto = Object.getPrototypeOf(el);
                const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
                  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                if (setter) setter.call(el, val);
                else el.value = val;
              }
              ['input', 'change', 'blur'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true })));
            };
            const passInput = document.querySelector('input[type="password"]');
            const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])'));
            const userInput = allInputs.find(inp => /user|login|mail|name/i.test((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.placeholder || ''))) || allInputs[0];
            if (userInput) fillField(userInput, ${JSON.stringify(credsUser)});
            await sleep(80);
            if (passInput) fillField(passInput, ${JSON.stringify(credsPass)});
            await sleep(220);
            const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find(b =>
              /^(Anmelden|Login|Sign\\s*in|Weiter|Next|OK|Submit)$/i.test((b.innerText || b.value || b.textContent || '').trim())
            ) || document.querySelector('button[type="submit"], input[type="submit"]');
            if (loginBtn) loginBtn.click();
          })()`, true).catch(() => {});
        }
        await sleep(300);
        continue;
      }

      if (/dienstplan-bayern\.secure\.johanniter\.de/i.test(pageState.host)) {
        if (!pageState.freshMyPlanToken || pageState.href.includes('/identity/')) {
          if (seedAttempts < 2) {
            seedAttempts++;
            await cdp.evalInPage(`(() => {
              ${seedMyPlanScript}
              window.location.href = ${JSON.stringify(targetCareManUrl)};
            })()`).catch(() => {});
            await sleep(800);
            continue;
          } else if (pageState.hasPassInput && !siedaConfigured) {
            await abortRun('⛔ CareMan verlangt eine eigene Anmeldung (opta data), aber die Secrets CAREMAN_SIEDA_USER / CAREMAN_SIEDA_PASS fehlen. Bitte bei GitHub hinterlegen.');
            break;
          } else if (pageState.hasPassInput && siedaSubmits >= 1 && Date.now() - lastPasswordSubmitAt > 20000) {
            await abortRun('⛔ CareMan-Anmeldung (opta data) wurde abgelehnt. Bitte CAREMAN_SIEDA_USER / CAREMAN_SIEDA_PASS prüfen – zum Schutz vor einer Kontosperre wird nicht weiter probiert.');
            break;
          } else if (pageState.hasPassInput && siedaPass && siedaSubmits < 1) {
            lastPasswordSubmitAt = Date.now();
            siedaSubmits++;
            await updateStep('🔐 CareMan-Anmeldung (opta data) – trage Anmeldename & Passwort ein …');
            await cdp.evalInPage(`(async () => {
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const fillField = (el, val) => {
                if (!el) return;
                el.focus();
                try { el.select(); document.execCommand('insertText', false, val); } catch (e) {}
                if (el.value !== val) {
                  const proto = Object.getPrototypeOf(el);
                  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set ||
                    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
                  if (setter) setter.call(el, val);
                  else el.value = val;
                }
                ['input', 'change', 'blur'].forEach(ev => el.dispatchEvent(new Event(ev, { bubbles: true })));
              };
              const passInput = document.querySelector('input[type="password"]');
              const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])'));
              const userInput = allInputs[0];
              if (userInput) fillField(userInput, ${JSON.stringify(siedaUser)});
              await sleep(80);
              if (passInput) fillField(passInput, ${JSON.stringify(siedaPass)});
              await sleep(220);
              const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find(b =>
                /^(Anmelden|Login|Sign\\s*in|Weiter|Next|OK|Submit)$/i.test((b.innerText || b.value || b.textContent || '').trim())
              ) || document.querySelector('button[type="submit"], input[type="submit"]');
              if (loginBtn) loginBtn.click();
            })()`, true).catch(() => {});
            await sleep(800);
            continue;
          }
        }

        // Chrome wurde vorab mit dem heutigen Datum geöffnet: steht ein anderer Monat an, einmal auf den Zielmonat wechseln
        if (!monthFixed && !pageState.extractorRunning) {
          const dm = String(pageState.href || '').match(/[?&]date=(20\d{2})-(\d{1,2})-\d{1,2}/);
          const urlYm = dm ? `${dm[1]}-${String(parseInt(dm[2], 10)).padStart(2, '0')}` : '';
          if (urlYm && urlYm !== ym) {
            monthFixed = true;
            await cdp.evalInPage(`window.location.href = ${JSON.stringify(targetCareManUrl)};`).catch(() => {});
            await sleep(600);
            continue;
          }
          if (urlYm) monthFixed = true;
        }

        if (pageState.bannerText) {
          await updateStep(pageState.bannerText);
        } else {
          await updateStep(`⚡ Dienstplan Bayern geöffnet (${ym}) – lese die 3 Wachen aus...`);
        }

        if (!pageState.extractorRunning && pageState.readyState === 'complete' && Date.now() - lastExtractorInjectAt > 4000) {
          const isCareManUiReady = await cdp.evalInPage(`(() => {
            // Schnellweg: angemeldet bei Dienstplan Bayern reicht – das Skript liest direkt über die Schnittstelle
            try {
              if (/dienstplan-bayern\\.secure\\.johanniter\\.de$/i.test(location.hostname) && localStorage.getItem('myPlanToken')) return true;
            } catch (e) {}
            const txt = (document.body?.innerText || '');
            return /\\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|January|February|March|April|May|June|July|August|September|October|November|December)\\s+20\\d{2}\\b/i.test(txt) ||
              /Planungsgruppe|Abteilungs|Istplan/i.test(txt) ||
              Boolean(document.querySelector('myplan-calendar-day, myplan-calendar-day-phone, myplan-duty-list-item'));
          })()`).catch(() => false);

          if (isCareManUiReady) {
            lastExtractorInjectAt = Date.now();
            await sleep(200);
            const apPayload = JSON.stringify({
              autoRun: true,
              targetYearMonth: ym,
              targetDate,
              targetCareManUrl,
              startedAt: Date.now()
            });
            await cdp.evalInPage(`
              window.__CAREMAN_EXTRACTOR_RUNNING = Date.now();
              window.__CAREMAN_DAEMON_MODE = true;
              window.__CAREMAN_DAEMON_RESULT = null;
              window.name = 'CAREMAN_AUTOPILOT:' + ${JSON.stringify(apPayload)};
            `).catch(() => {});
            if (!SIEDA_EXTRACTOR_SCRIPT) SIEDA_EXTRACTOR_SCRIPT = await extractorPromise;
            if (!SIEDA_EXTRACTOR_SCRIPT) {
              await patchBridge({ status: 'error', stepMessage: '⚠️ Auslese-Skript nicht verfügbar – neuer Versuch …', updatedAt: Date.now() });
              process.exitCode = 1;
              aborted = true;
              break;
            }
            cdp.evalInPage(SIEDA_EXTRACTOR_SCRIPT, false).catch(() => {});
          }
        }
      }

      await sleep(300);
    }
    if (!finished && !aborted) {
      console.error('❌ Zeitüberschreitung – Dienstplan wurde nicht ausgelesen. Letzter Schritt: ' + lastStepMsg);
      await patchBridge({
        status: 'error',
        stepMessage: '⚠️ Zeitüberschreitung beim CareMan-Abruf (letzter Schritt: ' + (lastStepMsg || 'unbekannt') + '). Bitte erneut versuchen.',
        updatedAt: Date.now()
      });
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('Cloud runner loop error:', err);
    await patchBridge({
      status: 'error',
      stepMessage: '⚠️ Cloud-Fehler: ' + (err.message || String(err)),
      updatedAt: Date.now()
    });
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    try { proc.kill('SIGTERM'); } catch {}
  }
}

main().catch(err => {
  console.error('Cloud runner error:', err);
  process.exitCode = 1;
});
