#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import { SIEDA_EXTRACTOR_SCRIPT } from '../src/utils/oneClickCareManSync.js';

const PORT = 3847;
const DEBUG_PORT = 9229;
const HOME_DIR = os.homedir();
const CREDENTIALS_PATH = path.join(HOME_DIR, '.careman-autopilot-credentials.json');
const CHROME_PROFILE_DIR = path.join(HOME_DIR, '.careman-autopilot-chrome-profile');
const CHROME_BIN = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadStoredCredentials() {
  try {
    if (fs.existsSync(CREDENTIALS_PATH)) {
      const raw = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      return {
        username: parsed.username || 'johannes.backhaus@johanniter.de',
        password: parsed.password || ''
      };
    }
  } catch {
    /* ignore */
  }
  return { username: 'johannes.backhaus@johanniter.de', password: '' };
}

function saveStoredCredentials(username, password) {
  try {
    const existing = loadStoredCredentials();
    const next = {
      username: (username && username.trim()) ? username.trim() : existing.username,
      password: password ? password : existing.password,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(next, null, 2), { mode: 0o600 });
    return next;
  } catch {
    return { username: username || 'johannes.backhaus@johanniter.de', password: password || '' };
  }
}

let currentJob = {
  id: 0,
  status: 'idle', // 'idle' | 'running' | 'done' | 'error'
  stepMessage: 'Bereit',
  ym: '2026-11',
  targetDate: '2026-11-7',
  returnOrigin: 'https://schicht.vjbackhaus.de',
  resultJson: null,
  error: null,
  chromeProc: null
};

function killHelperChrome() {
  if (currentJob.chromeProc) {
    try {
      currentJob.chromeProc.kill('SIGTERM');
    } catch {}
    currentJob.chromeProc = null;
  }
  try {
    execSync(`pkill -f "careman-autopilot-chrome-profile" || true`, { stdio: 'ignore' });
  } catch {}
}

class CdpSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      const timer = setTimeout(() => reject(new Error('CDP WebSocket timeout')), 6000);
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
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
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

async function runAutoPilotJob({ ym, targetDate, user, pass, returnOrigin, headless = false }) {
  const jobId = ++currentJob.id;
  const creds = saveStoredCredentials(user, pass);
  const targetCareManUrl = `https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=${targetDate}`;

  currentJob = {
    id: jobId,
    status: 'running',
    stepMessage: `🚀 Öffne Johanniter-Anmeldung für ${ym} (${targetDate})...`,
    ym,
    targetDate,
    returnOrigin: returnOrigin || 'https://schicht.vjbackhaus.de',
    resultJson: null,
    error: null,
    chromeProc: null
  };
  publishBridgeState(true).catch(() => {});

  killHelperChrome();
  await sleep(300);

  try {
    fs.mkdirSync(CHROME_PROFILE_DIR, { recursive: true });
  } catch {}

  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${CHROME_PROFILE_DIR}`,
    ...(headless ? ['--headless=new'] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-popup-blocking',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-domain-reliability',
    '--disable-sync',
    '--metrics-recording-only',
    '--simulate-outdated-no-au="Tue, 31 Dec 2099 23:59:59 GMT"',
    ...(headless
      ? ['--window-size=1440,900', targetCareManUrl]
      : ['--window-size=1240,860', '--window-position=100,50', `--app=${targetCareManUrl}`])
  ];

  const proc = spawn(CHROME_BIN, chromeArgs, {
    detached: false,
    stdio: 'ignore'
  });
  currentJob.chromeProc = proc;

  proc.on('exit', () => {
    if (currentJob.id === jobId && currentJob.status === 'running' && !currentJob.resultJson) {
      currentJob.status = 'error';
      currentJob.error = 'CareMan-Fenster wurde vorzeitig geschlossen.';
      currentJob.stepMessage = '⚠️ CareMan-Fenster wurde geschlossen.';
    }
  });

  // Wait up to 8s for Chrome DevTools Protocol port to come up
  let pageTarget = null;
  for (let i = 0; i < 32; i++) {
    await sleep(250);
    try {
      pageTarget = await getActivePageTarget();
      if (pageTarget) break;
    } catch {}
  }

  if (!pageTarget) {
    currentJob.status = 'error';
    currentJob.error = 'CareMan-Browserfenster konnte nicht gestartet werden.';
    return;
  }

  let cdp = null;
  let connectedUrl = '';
  let extractorInjected = false;
  let lastPasswordSubmitAt = 0;
  let last2faSelectAt = 0;

  try {
    for (let tick = 0; tick < 600; tick++) {
      if (currentJob.id !== jobId || currentJob.status !== 'running') break;

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
        await cdp.send('Page.bringToFront').catch(() => {});
        connectedUrl = latestTarget.webSocketDebuggerUrl;
      }

      const pageState = await cdp.evalInPage(`(() => {
        const href = window.location.href || '';
        const host = window.location.hostname || '';
        const readyState = document.readyState;
        const bodyText = (document.body ? (document.body.innerText || document.body.textContent || '') : '').trim();
        const passEl = document.querySelector('input[type="password"]');
        const hasPassInput = Boolean(passEl);
        let capturedPass = passEl?.value || '';
        try {
          if (!capturedPass) capturedPass = localStorage.getItem('careman_ap_pass') || '';
        } catch (e) {}
        const bannerText = document.querySelector('[data-careman-sync-banner]')?.textContent || '';
        const daemonResult = window.__CAREMAN_DAEMON_RESULT ||
          (window.name && window.name.startsWith('CAREMAN_SYNC:') ? window.name.slice('CAREMAN_SYNC:'.length) : null);
        return { href, host, readyState, bodyText: bodyText.slice(0, 1500), hasPassInput, capturedPass, bannerText, daemonResult };
      })()`).catch(() => null);

      if (!pageState) {
        await sleep(400);
        continue;
      }

      // 1. Check if extraction finished!
      if (pageState.daemonResult && pageState.daemonResult.length > 20) {
        currentJob.resultJson = pageState.daemonResult;
        currentJob.stepMessage = `✅ Alle 3 Wachen (${ym}) erfolgreich ausgelesen – übertrage in die App...`;
        currentJob.status = 'done';
        await publishBridgeState(true).catch(() => {});
        await cdp.send('Browser.close').catch(() => {});
        killHelperChrome();
        break;
      }

      // Persist password if user entered it once in the login window
      if (pageState.capturedPass && pageState.capturedPass !== creds.password) {
        creds.password = pageState.capturedPass;
        saveStoredCredentials(creds.username, creds.password);
      }

      // 2. Handle my.secure.johanniter.de (Login -> Auswahl Airlock 2FA -> Airlock 2FA Wait -> Portal)
      if (/my\.secure\.johanniter\.de/i.test(pageState.host)) {
        if (pageState.href.includes('/error_path/')) {
          await cdp.evalInPage(`window.location.href = ${JSON.stringify(targetCareManUrl)};`).catch(() => {});
          await sleep(800);
          continue;
        }

        // 2a. Self Service Portal reached -> jump to Dienstplan Bayern ?date=...
        if (
          !pageState.href.includes('/auth/ui/') &&
          /Dienstplan\s+BAYERN|Webanwendungen|Self\s*Service/i.test(pageState.bodyText)
        ) {
          currentJob.stepMessage = `🚀 Airlock 2FA bestätigt! Öffne Dienstplan Bayern (${targetDate})...`;
          await cdp.evalInPage(`window.location.href = ${JSON.stringify(targetCareManUrl)};`).catch(() => {});
          await sleep(600);
          continue;
        }

        // 2b. Airlock 2FA Push Waiting Screen
        if (/Anmeldung\s+mit\s+Airlock\s+2FA|Nachricht\s+auf\s+Ihrem\s+Smartphone|Offline-Modus/i.test(pageState.bodyText)) {
          currentJob.stepMessage = `📱 Bitte jetzt manuell in Airlock 2FA auf dem Smartphone bestätigen – Dienstplan Bayern (${ym}) öffnet sich danach automatisch!`;
          await cdp.evalInPage(`(() => {
            let b = document.querySelector('[data-careman-sync-banner]');
            if (!b && document.body) {
              b = document.createElement('div');
              b.setAttribute('data-careman-sync-banner', '1');
              b.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 22px;border-radius:14px;font-family:sans-serif;font-size:14px;font-weight:700;box-shadow:0 12px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.3);';
              document.body.appendChild(b);
            }
            if (b) b.textContent = '📱 Bitte jetzt in Airlock 2FA bestätigen – Dienstplan Bayern (${ym}) öffnet sich danach automatisch...';
          })()`).catch(() => {});
          await sleep(450);
          continue;
        }

        // 2c. 2FA Method Selection ("Auswahl": Airlock 2FA vs OATH)
        if (/Authentisierungsm[öo]glichkeiten|Airlock\s+2FA/i.test(pageState.bodyText) && !pageState.hasPassInput) {
          if (Date.now() - last2faSelectAt > 2000) {
            currentJob.stepMessage = '⚡ Wähle Airlock 2FA aus und klicke auf Auswählen...';
            last2faSelectAt = Date.now();
            await cdp.evalInPage(`(async () => {
              const sleep = ms => new Promise(r => setTimeout(r, ms));
              const labelsAndSpans = Array.from(document.querySelectorAll('label, span, div, [role="radio"]')).filter(el => {
                const t = (el.innerText || el.textContent || '').trim();
                return /^Airlock\\s*2FA$/i.test(t);
              });
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
                /^(Ausw[äa]hlen|Weiter|Best[äa]tigen|OK|Anmelden)$/i.test((b.innerText || b.value || b.textContent || '').trim())
              );
              if (btn) btn.click();
            })()`, true).catch(() => {});
          }
          await sleep(450);
          continue;
        }

        // 2d. Password Login Screen ("Secure Portal Anmeldung")
        if (pageState.hasPassInput) {
          if (creds.password && Date.now() - lastPasswordSubmitAt > 3000) {
            currentJob.stepMessage = `🔐 Trage Benutzername (${creds.username}) & Passwort automatisch ein und klicke auf Anmelden...`;
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

              if (userInput) fillField(userInput, ${JSON.stringify(creds.username)});
              await sleep(80);
              if (passInput) fillField(passInput, ${JSON.stringify(creds.password)});
              await sleep(220);

              const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find(b =>
                /^(Anmelden|Login|Weiter|OK)$/i.test((b.innerText || b.value || b.textContent || '').trim())
              ) || document.querySelector('button[type="submit"], input[type="submit"]');

              if (loginBtn) loginBtn.click();
            })()`, true).catch(() => {});
          } else if (!creds.password) {
            currentJob.stepMessage = `🔐 Benutzername (${creds.username}) eingetragen! Bitte einmalig im CareMan-Fenster dein Passwort eingeben & Anmelden klicken (wird für alle zukünftigen Läufe automatisch gespeichert)...`;
            await cdp.evalInPage(`(() => {
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
              const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])'));
              const userInput = allInputs.find(inp => /user|login|mail|name/i.test((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.placeholder || ''))) || allInputs[0];
              const passInput = document.querySelector('input[type="password"]');
              if (userInput && !userInput.value) {
                fillField(userInput, ${JSON.stringify(creds.username)});
                if (passInput) passInput.focus();
              }
              if (passInput && !passInput.hasAttribute('data-careman-capture')) {
                passInput.setAttribute('data-careman-capture', '1');
                const savePass = () => {
                  try {
                    if (passInput.value) localStorage.setItem('careman_ap_pass', passInput.value);
                  } catch (e) {}
                };
                passInput.addEventListener('input', savePass);
                passInput.addEventListener('change', savePass);
              }
              let b = document.querySelector('[data-careman-sync-banner]');
              if (!b && document.body) {
                b = document.createElement('div');
                b.setAttribute('data-careman-sync-banner', '1');
                b.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 22px;border-radius:14px;font-family:sans-serif;font-size:13.5px;font-weight:700;box-shadow:0 12px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.3);';
                document.body.appendChild(b);
              }
              if (b) b.textContent = '🔐 Benutzername eingetragen! Bitte einmalig Passwort eingeben & Anmelden klicken – ab sofort danach vollautomatisch!';
            })()`).catch(() => {});
          }
        }

        await sleep(250);
        continue;
      }

      // 3. Handle dienstplan-bayern.secure.johanniter.de (CareMan Bayern)
      if (/dienstplan-bayern\.secure\.johanniter\.de/i.test(pageState.host)) {
        if (pageState.bannerText) {
          currentJob.stepMessage = pageState.bannerText;
        } else {
          currentJob.stepMessage = `⚡ Dienstplan Bayern geöffnet (${ym}) – lese die 3 Wachen (München, Obersendling, Hohenbrunn) aus...`;
        }

        if (!extractorInjected && pageState.readyState === 'complete' && !pageState.href.includes('/identity/')) {
          const isCareManUiReady = await cdp.evalInPage(`(() => {
            const txt = (document.body?.innerText || '');
            return /\\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\\s+20\\d{2}\\b/i.test(txt) ||
              /Planungsgruppe|Abteilungs|Istplan/i.test(txt);
          })()`).catch(() => false);

          if (isCareManUiReady) {
            extractorInjected = true;
            await sleep(200);
            const apPayload = JSON.stringify({
              autoRun: true,
              targetYearMonth: ym,
              targetDate,
              targetCareManUrl,
              startedAt: Date.now()
            });
            await cdp.evalInPage(`
              window.__CAREMAN_DAEMON_MODE = true;
              window.__CAREMAN_DAEMON_RESULT = null;
              window.name = 'CAREMAN_AUTOPILOT:' + ${JSON.stringify(apPayload)};
            `).catch(() => {});
            cdp.evalInPage(SIEDA_EXTRACTOR_SCRIPT, false).catch(() => {});
          }
        }
      }

      await sleep(250);
    }
  } catch (err) {
    if (currentJob.id === jobId && currentJob.status === 'running') {
      currentJob.status = 'error';
      currentJob.error = err.message;
      currentJob.stepMessage = '⚠️ Fehler: ' + err.message;
    }
  } finally {
    if (cdp) cdp.close();
  }
}

function renderStatusHtml() {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Schichttagebuch – CareMan Auto-Pilot</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      background: #0f172a;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .card {
      max-width: 540px;
      width: 100%;
      background: rgba(30, 41, 59, 0.9);
      border: 1px solid rgba(52, 211, 153, 0.4);
      border-radius: 22px;
      padding: 28px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
      text-align: center;
    }
    .spinner {
      width: 44px;
      height: 44px;
      border: 4px solid rgba(52, 211, 153, 0.2);
      border-top-color: #10b981;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      margin: 0 auto 18px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h1 { font-size: 20px; margin: 0 0 8px 0; color: #34d399; }
    .sub { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
    .status-box {
      background: rgba(15, 23, 42, 0.85);
      border: 1px solid rgba(56, 189, 248, 0.35);
      border-radius: 14px;
      padding: 16px;
      font-size: 14.5px;
      font-weight: 700;
      color: #e2e8f0;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .btn {
      display: inline-block;
      background: rgba(239, 68, 68, 0.16);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.35);
      padding: 9px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 700;
      text-decoration: none;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner" id="sp"></div>
    <h1>⚡ CareMan 3-Wachen Auto-Pilot</h1>
    <div class="sub">Rettungswache München (61000) · Obersendling (61010) · Hohenbrunn (61300)</div>
    <div class="status-box" id="msg">Starte Auto-Pilot...</div>
    <a class="btn" href="/cancel">Abbrechen & zurück zum Schichttagebuch</a>
  </div>
  <script>
    async function poll() {
      try {
        const res = await fetch('/job-status?t=' + Date.now());
        const data = await res.json();
        const msgEl = document.getElementById('msg');
        if (data.stepMessage) msgEl.textContent = data.stepMessage;
        if (data.status === 'done' && data.resultJson) {
          msgEl.style.borderColor = '#10b981';
          msgEl.style.color = '#34d399';
          const targetUrl = (data.returnOrigin || 'https://schicht.vjbackhaus.de') +
            '/journal?month=' + encodeURIComponent(data.ym || '2026-11') +
            '&sync=' + Date.now() +
            '#careman=' + encodeURIComponent(data.resultJson);
          window.location.replace(targetUrl);
          return;
        }
        if (data.status === 'error') {
          document.getElementById('sp').style.display = 'none';
          msgEl.style.borderColor = '#ef4444';
          msgEl.style.color = '#f87171';
        }
      } catch (e) {}
      setTimeout(poll, 250);
    }
    poll();
  </script>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url || '/', `http://127.0.0.1:${PORT}`);
  const pathname = parsedUrl.pathname;

  if (pathname === '/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, version: '2.2.45' }));
    return;
  }

  if (pathname === '/job-status') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      id: currentJob.id,
      status: currentJob.status,
      stepMessage: currentJob.stepMessage,
      ym: currentJob.ym,
      targetDate: currentJob.targetDate,
      returnOrigin: currentJob.returnOrigin,
      resultJson: currentJob.resultJson,
      error: currentJob.error
    }));
    return;
  }

  if (pathname === '/api/cancel') {
    killHelperChrome();
    currentJob.status = 'idle';
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (pathname === '/cancel') {
    killHelperChrome();
    currentJob.status = 'idle';
    const backUrl = `${currentJob.returnOrigin || 'https://schicht.vjbackhaus.de'}/journal?month=${encodeURIComponent(currentJob.ym || '2026-11')}`;
    res.writeHead(302, { Location: backUrl });
    res.end();
    return;
  }

  if (pathname === '/api/start' || pathname === '/start') {
    const now = new Date();
    const defaultYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const ym = parsedUrl.searchParams.get('ym') || defaultYm;
    const targetDate = parsedUrl.searchParams.get('date') || `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
    const user = parsedUrl.searchParams.get('user') || 'johannes.backhaus@johanniter.de';
    const pass = parsedUrl.searchParams.get('pass') || '';
    const returnOrigin = parsedUrl.searchParams.get('returnOrigin') || 'https://schicht.vjbackhaus.de';

    runAutoPilotJob({ ym, targetDate, user, pass, returnOrigin });

    if (pathname === '/api/start') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: true, jobId: currentJob.id, ym, targetDate }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderStatusHtml());
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

// ============================================================================
// CLOUD BRIDGE (FIRESTORE) FÜR IPHONE / MOBILE AUTO-PILOT (OHNE SAFARI-BLOCKADE)
// ============================================================================
const FB_API_KEY = 'AIzaSyBntKv5YUjvoDDXsuBxQmzPFRqX99KMbxo';
const FB_BRIDGE_EMAIL = 'careman-autopilot-bridge@vjbackhaus.de';
const FB_BRIDGE_PASS = 'CareManBridge_2026!Secure';
const FB_PROJECT_ID = 'schichttagebuch-da2c3';

let fbBridgeAuth = { idToken: null, uid: null, expiresAt: 0 };
let activeBridgeRequestId = null;
let lastPublishedStep = '';
let lastPublishedStatus = '';

async function ensureBridgeAuth() {
  if (fbBridgeAuth.idToken && fbBridgeAuth.uid && Date.now() < fbBridgeAuth.expiresAt) {
    return fbBridgeAuth;
  }
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FB_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: FB_BRIDGE_EMAIL, password: FB_BRIDGE_PASS, returnSecureToken: true })
    });
    if (!res.ok) return null;
    const data = await res.json();
    fbBridgeAuth = {
      idToken: data.idToken,
      uid: data.localId,
      expiresAt: Date.now() + 45 * 60 * 1000
    };
    return fbBridgeAuth;
  } catch {
    return null;
  }
}

function getBridgeDocUrl(uid) {
  return `https://firestore.googleapis.com/v1/projects/${FB_PROJECT_ID}/databases/(default)/documents/users/${uid}/team_rosters/autopilot_bridge`;
}

async function publishBridgeState(force = false) {
  const auth = await ensureBridgeAuth();
  if (!auth) return;
  if (!force && currentJob.stepMessage === lastPublishedStep && currentJob.status === lastPublishedStatus) {
    return;
  }
  lastPublishedStep = currentJob.stepMessage;
  lastPublishedStatus = currentJob.status;

  const creds = loadStoredCredentials();
  const fields = {
    requestId: { stringValue: String(activeBridgeRequestId || '') },
    status: { stringValue: String(currentJob.status || 'idle') },
    stepMessage: { stringValue: String(currentJob.stepMessage || '') },
    ym: { stringValue: String(currentJob.ym || '2026-11') },
    targetDate: { stringValue: String(currentJob.targetDate || '2026-11-7') },
    resultJson: { stringValue: String(currentJob.resultJson || '') },
    error: { stringValue: String(currentJob.error || '') },
    credsUser: { stringValue: String(creds.username || 'johannes.backhaus@johanniter.de') },
    credsPass: { stringValue: String(creds.password || '') },
    daemonHeartbeat: { integerValue: String(Date.now()) },
    updatedAt: { integerValue: String(Date.now()) }
  };

  try {
    await fetch(getBridgeDocUrl(auth.uid), {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${auth.idToken}`
      },
      body: JSON.stringify({ fields })
    });
  } catch {}
}

async function pollCloudBridgeLoop() {
  // Initial sync of credentials + heartbeat
  await publishBridgeState(true);
  let lastHeartbeatSentAt = Date.now();

  while (true) {
    try {
      const auth = await ensureBridgeAuth();
      if (auth) {
        if (currentJob.status === 'running' || currentJob.status === 'done' || currentJob.status === 'error') {
          await publishBridgeState(false);
          lastHeartbeatSentAt = Date.now();
        } else if (Date.now() - lastHeartbeatSentAt > 12000) {
          await publishBridgeState(true);
          lastHeartbeatSentAt = Date.now();
        }
        const res = await fetch(getBridgeDocUrl(auth.uid), {
          headers: { 'Authorization': `Bearer ${auth.idToken}` }
        });
        if (res.ok) {
          const doc = await res.json();
          const f = doc.fields || {};
          const reqId = f.requestId?.stringValue || '';
          const reqStatus = f.status?.stringValue || '';
          const reqYm = f.ym?.stringValue || '2026-11';
          const reqDate = f.targetDate?.stringValue || '2026-11-7';
          const reqAt = Number(f.requestedAt?.integerValue || 0);

          if (
            reqStatus === 'requested' &&
            reqId &&
            reqId !== activeBridgeRequestId &&
            Date.now() - reqAt < 90000
          ) {
            activeBridgeRequestId = reqId;
            const creds = loadStoredCredentials();
            runAutoPilotJob({
              ym: reqYm,
              targetDate: reqDate,
              user: creds.username,
              pass: creds.password,
              returnOrigin: 'https://schicht.vjbackhaus.de',
              headless: true
            });
            await sleep(100);
            await publishBridgeState(true);
          } else if (reqStatus === 'cancelled' && currentJob.status === 'running') {
            killHelperChrome();
            currentJob.status = 'idle';
            currentJob.stepMessage = 'Abgebrochen';
            await publishBridgeState(true);
          }
        }
      }
    } catch {}
    await sleep(900);
  }
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`⚡ CareMan Auto-Pilot Daemon v2.2.45 listening on http://127.0.0.1:${PORT}`);
  pollCloudBridgeLoop();
});
