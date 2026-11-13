// Temporärer Messlauf: Chrome-Start direkt beim Jobstart (kalte Festplatte)
import { spawn, execSync } from 'child_process';
import fs from 'fs'; import os from 'os'; import path from 'path';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const T0 = Date.now();
const ts = () => ((Date.now() - T0) / 1000).toFixed(2).padStart(6);
async function launch(label, url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-'));
  const t = Date.now();
  const p = spawn('/usr/bin/google-chrome', ['--remote-debugging-port=0', `--user-data-dir=${dir}`, '--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--password-store=basic',
    '--use-mock-keychain', '--disable-features=MediaRouter,OptimizationHints,Translate', url], { stdio: 'ignore' });
  let port = 0, tPort = 0, tPage = 0;
  for (let i = 0; i < 1600 && !tPage; i++) {
    await sleep(25);
    if (!port) {
      try { const v = parseInt(fs.readFileSync(path.join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0], 10); if (v > 0) { port = v; tPort = Date.now() - t; } } catch {}
      continue;
    }
    try { const r = await fetch(`http://127.0.0.1:${port}/json/list`); const j = await r.json(); if (j.some(x => x.type === 'page')) tPage = Date.now() - t; } catch {}
  }
  console.log(`[${ts()}] ${label}: Port nach ${tPort} ms, Seite nach ${tPage} ms`);
  p.kill('SIGKILL'); await sleep(300);
}
const mode = process.argv[2] || 'base';
console.log(`[${ts()}] Modus ${mode}, Node-Start bis hier: ${Date.now() - Number(process.env.T_STEP || Date.now())} ms`);
const prefetch = () => new Promise(res => {
  const t = Date.now();
  const p = spawn('bash', ['-c', 'cd /opt/google/chrome && S=$(stat -c %s chrome); C=$(( (S + 15) / 16 )); for i in $(seq 0 15); do dd if=chrome of=/dev/null bs=1M iflag=skip_bytes,count_bytes skip=$((i*C)) count=$C status=none & done; find . -type f ! -name chrome -print0 | xargs -0 -P 8 -n 8 cat > /dev/null; wait'], { stdio: 'ignore' });
  p.on('exit', () => { console.log(`[${ts()}] paralleles Vorlesen fertig nach ${Date.now() - t} ms`); res(); });
});
if (mode === 'base') {
  await launch('kalt', 'about:blank');
} else if (mode === 'parallel') {
  const pf = prefetch();
  await launch('kalt + gleichzeitiges Vorlesen', 'about:blank');
  await pf;
} else if (mode === 'prefetchfirst') {
  await prefetch();
  await launch('nach Vorlesen', 'about:blank');
}
await launch('warm', 'about:blank');
