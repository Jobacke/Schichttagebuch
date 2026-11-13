// Temporärer Messlauf: Wie lange braucht Chrome auf dem GitHub-Server bis zur DevTools-Verbindung?
import { spawn, execSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();
const ts = () => ((Date.now() - T0) / 1000).toFixed(2).padStart(6);
async function launch(label, bin, extra, url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  const t = Date.now();
  const args = ['--remote-debugging-port=0', `--user-data-dir=${dir}`, ...extra, '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--password-store=basic',
    '--use-mock-keychain', '--disable-features=MediaRouter,OptimizationHints,Translate', url];
  const p = spawn(bin, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const err = [];
  p.stderr.on('data', d => String(d).split('\n').filter(Boolean).forEach(l => err.push(((Date.now() - t) / 1000).toFixed(2) + 's ' + l.slice(0, 160))));
  let port = 0, tPort = 0, tPage = 0;
  for (let i = 0; i < 1200 && !tPage; i++) {
    await sleep(25);
    if (!port) {
      try { const v = parseInt(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10); if (v > 0) { port = v; tPort = Date.now() - t; } } catch {}
      continue;
    }
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const j = await r.json(); if (j.some(x => x.type === 'page')) tPage = Date.now() - t; } catch {}
  }
  console.log(`[${ts()}] ${label}: Port nach ${tPort} ms, Seite nach ${tPage} ms`);
  err.slice(0, 15).forEach(l => console.log('     ' + l));
  p.kill('SIGKILL'); await sleep(300);
}
const sh = c => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch (e) { return 'ERR ' + (e.stderr || e.message).toString().slice(0, 200); } };
const mode = process.argv[2] || 'cold';
console.log('Modus', mode, '| CPUs', os.cpus().length, '| RAM', Math.round(os.totalmem() / 1e9), 'GB');
console.log('wrapper:', sh('readlink -f /usr/bin/google-chrome'), '|', sh('google-chrome --version'));
console.log('headless-shell:', sh("ls -d /opt/hostedtoolcache/*/ 2>/dev/null | tr '\\n' ' '; find / -xdev -name 'chrome-headless-shell' -type f 2>/dev/null | head -3"));
if (mode === 'prewarm') {
  const t = Date.now(); sh('cat /opt/google/chrome/chrome /opt/google/chrome/*.so* /opt/google/chrome/*.pak /opt/google/chrome/icudtl.dat > /dev/null');
  console.log(`[${ts()}] Vorlesen der Chrome-Dateien: ${Date.now() - t} ms`);
}
const real = 'https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=2026-11-13';
if (mode === 'direct') {
  await launch('1 direkt /opt/google/chrome/chrome, about:blank', '/opt/google/chrome/chrome', ['--headless=new'], 'about:blank');
} else {
  await launch('1 google-chrome, ' + (mode === 'realurl' ? 'echte URL' : 'about:blank'), '/usr/bin/google-chrome', ['--headless=new'], mode === 'realurl' ? real : 'about:blank');
}
await launch('2 google-chrome erneut (warm), about:blank', '/usr/bin/google-chrome', ['--headless=new'], 'about:blank');
await launch('3 google-chrome warm, echte URL', '/usr/bin/google-chrome', ['--headless=new'], real);
await launch('4 direkt chrome-Binary warm', '/opt/google/chrome/chrome', ['--headless=new'], 'about:blank');
