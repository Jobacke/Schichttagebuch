#!/usr/bin/env node
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { SIEDA_EXTRACTOR_SCRIPT } from '../src/utils/oneClickCareManSync.js';

const DEBUG_PORT = 9229;
const FB_API_KEY = 'AIzaSyBntKv5YUjvoDDXsuBxQmzPFRqX99KMbxo';
const FB_BRIDGE_EMAIL = 'careman-autopilot-bridge@vjbackhaus.de';
const FB_BRIDGE_PASS = 'CareManBridge_2026!Secure';
const FB_PROJECT_ID = 'schichttagebuch-da2c3';

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
  const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`);
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
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  try {
    return execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
  } catch {
    return 'google-chrome';
  }
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' && process.env.FORCE_CLOUD_RUNNER !== '1') {
    return;
  }

  const authRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FB_BRIDGE_EMAIL, password: FB_BRIDGE_PASS, returnSecureToken: true })
  });
  if (!authRes.ok) return;
  const auth = await authRes.json();
  const ghToken = (auth.displayName || '').trim();
  if (!ghToken) return;

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

  const patchBridge = async (partialObj) => {
    bridgeState = { ...bridgeState, ...partialObj };
    await fetch(issueUrl, {
      method: 'PATCH',
      headers: ghHeaders,
      body: JSON.stringify({ body: JSON.stringify(bridgeState, null, 2) })
    }).catch(() => {});
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
  const credsUser = f.credsUser || 'johannes.backhaus@johanniter.de';
  const credsPass = f.credsPass || '';
  const myPlanToken = f.myPlanToken ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIjNTY5MiIsImlzcyI6Imh0dHBzOi8vd3d3LnNpZWRhLmNvbS9hdXRob3JpemUiLCJhdWQiOiJteXBsYW4iLCJpYXQiOiIxNzk0MTc4MDM3IiwiZXhwIjoiMTc5NDIwNjgzNyJ9.i3ONReX48RFmLhSbjHwd1_quZ4ua1npCj732aiJZiH4';

  const seedMyPlanScript = `
    try {
      if (location.hostname === 'dienstplan-bayern.secure.johanniter.de' && !localStorage.getItem('myPlanToken')) {
        localStorage.setItem('myPlanToken', ${JSON.stringify(myPlanToken)});
        localStorage.setItem('myPlanLogin', JSON.stringify({ userId: 5692, kennwortAenderungNotwendig: false, warningMessage: '' }));
        localStorage.setItem('myPlanTenant', '-');
        localStorage.setItem('stayLoggedIn', 'true');
        localStorage.setItem('#5692-selectedEmployeeId', '11948');
      }
    } catch (e) {}
  `;

  if (reqStatus !== 'requested' || !reqId || (Date.now() - reqAt > 180000)) {
    console.log('ℹ️ No pending CareMan Cloud Auto-Pilot job – skipping cloud browser run.');
    return;
  }

  console.log(`☁️ Starting CareMan Cloud Auto-Pilot for ${ym} (${targetDate}), requestId=${reqId}...`);
  await patchBridge({
    status: 'running',
    stepMessage: `☁️ Cloud-Auto-Pilot verbunden – öffne Johanniter-Anmeldung für ${ym}...`,
    updatedAt: Date.now()
  });

  const targetCareManUrl = `https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=${targetDate}`;
  const profileDir = path.join(os.tmpdir(), `careman-cloud-profile-${Date.now()}`);
  fs.mkdirSync(profileDir, { recursive: true });

  const chromeBin = findChromeBinary();
  const proc = spawn(chromeBin, [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profileDir}`,
    '--headless=new',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--lang=de-DE',
    '--accept-lang=de-DE,de',
    '--window-size=1440,900',
    targetCareManUrl
  ], {
    stdio: 'ignore',
    env: {
      ...process.env,
      LANG: 'de_DE.UTF-8',
      LC_ALL: 'de_DE.UTF-8',
      TZ: 'Europe/Berlin'
    }
  });

  let pageTarget = null;
  for (let i = 0; i < 40; i++) {
    await sleep(250);
    try {
      pageTarget = await getActivePageTarget();
      if (pageTarget) break;
    } catch {}
  }

  if (!pageTarget) {
    await patchBridge({
      status: 'error',
      stepMessage: '⚠️ Cloud-Browser konnte nicht gestartet werden.',
      updatedAt: Date.now()
    });
    proc.kill('SIGTERM');
    return;
  }

  let cdp = null;
  let connectedUrl = '';
  let lastExtractorInjectAt = 0;
  let lastPasswordSubmitAt = 0;
  let last2faSelectAt = 0;
  let lastStepMsg = '';
  let seedAttempts = 0;

  const updateStep = async (msg) => {
    if (!msg || msg === lastStepMsg) return;
    lastStepMsg = msg;
    console.log('[Cloud Auto-Pilot]', msg);
    await patchBridge({
      status: 'running',
      stepMessage: msg,
      updatedAt: Date.now()
    });
  };

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
        await cdp.connect();
        await cdp.send('Page.enable').catch(() => {});
        await cdp.send('Runtime.enable').catch(() => {});
        await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: seedMyPlanScript }).catch(() => {});
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
        const blobSha = await createResultBlob(pageState.daemonResult);
        await patchBridge({
          status: 'done',
          stepMessage: `✅ Alle 3 Wachen (${ym}) über Cloud geladen – übertrage ins Journal...`,
          resultBlobSha: blobSha,
          ...(pageState.freshMyPlanToken ? { myPlanToken: pageState.freshMyPlanToken } : {}),
          updatedAt: Date.now()
        });
        console.log('✅ Cloud Auto-Pilot finished successfully! blobSha=' + blobSha);
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

        if (pageState.hasPassInput && credsPass && Date.now() - lastPasswordSubmitAt > 3000) {
          await updateStep(`🔐 Trage Benutzername & Passwort in der Cloud ein und klicke auf Anmelden...`);
          lastPasswordSubmitAt = Date.now();
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
          } else if (pageState.hasPassInput && credsPass && Date.now() - lastPasswordSubmitAt > 3000) {
            lastPasswordSubmitAt = Date.now();
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
              if (userInput) fillField(userInput, ${JSON.stringify(credsUser)});
              await sleep(80);
              if (passInput) fillField(passInput, ${JSON.stringify(credsPass)});
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

        if (pageState.bannerText) {
          await updateStep(pageState.bannerText);
        } else {
          await updateStep(`⚡ Dienstplan Bayern geöffnet (${ym}) – lese die 3 Wachen aus...`);
        }

        if (!pageState.extractorRunning && pageState.readyState === 'complete' && Date.now() - lastExtractorInjectAt > 4000) {
          const isCareManUiReady = await cdp.evalInPage(`(() => {
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
            cdp.evalInPage(SIEDA_EXTRACTOR_SCRIPT, false).catch(() => {});
          }
        }
      }

      await sleep(300);
    }
  } catch (err) {
    console.error('Cloud runner loop error:', err);
    await patchBridge({
      status: 'error',
      stepMessage: '⚠️ Cloud-Fehler: ' + (err.message || String(err)),
      updatedAt: Date.now()
    });
  } finally {
    if (cdp) cdp.close();
    try { proc.kill('SIGTERM'); } catch {}
  }
}

main().catch(err => {
  console.error('Cloud runner error:', err);
});
