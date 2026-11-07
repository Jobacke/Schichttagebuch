// Schichttagebuch CareMan Live Auto-Pilot (v2.2.14)
// Automatisiert:
// 1. Secure Portal Login ("Anmelden" sobald Autofill ausgefüllt hat)
// 2. Auswahl "Airlock 2FA" + Klick auf "Auswählen"
// 3. Nach Smartphone-Freigabe: Klick auf Kachel "Dienstplan BAYERN"
// 4. In CareMan: Klick auf "Abteilungsdienstplan" -> automatischer Durchlauf 61000, 61010, 61300 -> Rückübertragung an schicht.vjbackhaus.de

(function () {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const host = window.location.hostname;

  // --- TEIL 1: Johanniter Secure Portal (my.secure.johanniter.de) ---
  if (host === 'my.secure.johanniter.de') {
    const checkPortalStep = () => {
      const bodyText = document.body ? document.body.innerText : '';

      // Schritt 1: Passwort-Seite (mit Browser-Autofill)
      if (window.location.pathname.includes('/password')) {
        const userInp = document.querySelector('input[type="text"], input[type="email"], input[name*="user" i]');
        const passInp = document.querySelector('input[type="password"]');
        const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(
          b => /Anmelden/i.test(b.innerText || b.value || '')
        );
        if (userInp && passInp && userInp.value && passInp.value && loginBtn && !loginBtn.dataset.autopilotClicked) {
          loginBtn.dataset.autopilotClicked = '1';
          setTimeout(() => loginBtn.click(), 400);
        }
      }

      // Schritt 2: 2FA-Auswahl ("Airlock 2FA" auswählen & "Auswählen" klicken)
      if (bodyText.includes('Authentisierungsmöglichkeiten') && bodyText.includes('Airlock 2FA')) {
        const labels = Array.from(document.querySelectorAll('label, span, div'));
        const airlockLabel = labels.find(el => (el.innerText || '').trim() === 'Airlock 2FA');
        if (airlockLabel) airlockLabel.click();
        const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
        if (radios[0] && !radios[0].checked) radios[0].click();

        const selectBtn = Array.from(document.querySelectorAll('button, input[type="submit"]')).find(
          b => /Auswählen/i.test(b.innerText || b.value || '')
        );
        if (selectBtn && !selectBtn.dataset.autopilotClicked) {
          selectBtn.dataset.autopilotClicked = '1';
          setTimeout(() => selectBtn.click(), 350);
        }
      }

      // Schritt 4: Portal-Startseite -> Kachel "Dienstplan BAYERN"
      if (bodyText.includes('Dienstplan BAYERN')) {
        const tiles = Array.from(document.querySelectorAll('a, button, div, span')).filter(el => {
          const t = (el.innerText || '').trim();
          return t === 'Dienstplan BAYERN';
        });
        const tile = tiles[0];
        if (tile && ! sessionStorage.getItem('schichten_portal_tile_clicked')) {
          sessionStorage.setItem('schichten_portal_tile_clicked', '1');
          const clickable = tile.closest('a, button, [role="button"]') || tile;
          setTimeout(() => clickable.click(), 500);
        }
      }
    };

    setInterval(checkPortalStep, 700);
    return;
  }

  // --- TEIL 2: CareMan Dienstplan BAYERN (dienstplan-bayern.secure.johanniter.de) ---
  if (host === 'dienstplan-bayern.secure.johanniter.de') {
    // Floating Button oben rechts in CareMan einblenden, plus Auto-Run wenn von Schichttagebuch geöffnet
    const triggerBtn = document.createElement('button');
    triggerBtn.textContent = '⚡ Alle 3 Wachen ans Schichttagebuch senden';
    triggerBtn.style.cssText =
      'position:fixed;bottom:20px;right:20px;z-index:999999;background:linear-gradient(135deg,#059669,#10b981);color:#fff;border:1px solid rgba(255,255,255,0.35);padding:11px 18px;border-radius:14px;font-family:sans-serif;font-size:13px;font-weight:800;cursor:pointer;box-shadow:0 10px 28px rgba(0,0,0,0.35);';
    document.body.appendChild(triggerBtn);

    const runMultiStationExtraction = async () => {
      triggerBtn.textContent = '⏳ Lese 61000, 61010 & 61300 live aus...';
      triggerBtn.disabled = true;

      try {
        if (!document.querySelector('table.mat-table')) {
          const abtBtn = Array.from(document.querySelectorAll('a, button, div, span')).find(el => {
            const t = (el.innerText || el.textContent || '').replace(/\s+/g, '');
            return t === 'Abteilungsdienstplan' || t === 'Abteilungs-dienstplan';
          });
          if (abtBtn) {
            abtBtn.click();
            for (let i = 0; i < 25; i++) {
              await sleep(250);
              if (document.querySelector('table.mat-table') || document.querySelector('mat-select')) break;
            }
            await sleep(500);
          }
        }

        const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
        let year = new Date().getFullYear();
        let month = new Date().getMonth() + 1;
        const pageText = document.body ? document.body.innerText : '';
        const textMatch = pageText.match(/(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i);
        if (textMatch) {
          const idx = monthNames.findIndex(m => m.toLowerCase() === textMatch[1].toLowerCase());
          if (idx !== -1) {
            month = idx + 1;
            year = parseInt(textMatch[2], 10);
          }
        }
        const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
        const monthLabel = `${monthNames[month - 1]} ${year}`;

        const extractVisibleTable = (forcedStation) => {
          const table = document.querySelector('table.mat-table') || document.querySelector('table');
          const headerRow = table?.querySelector('thead tr') || table?.querySelector('tr');
          const headers = Array.from(headerRow?.children || []).map(c => c.textContent.trim());

          const colToDay = new Map();
          headers.forEach((h, idx) => {
            const m = h.match(/(\d+)/);
            if (m) {
              const d = parseInt(m[1], 10);
              if (d >= 1 && d <= 31) colToDay.set(idx, d);
            }
          });

          const rows = Array.from(document.querySelectorAll('tr')).filter(r => {
            const nameEl = r.querySelector('.employee-cell') || r.children[0];
            const txt = nameEl ? nameEl.textContent.trim() : '';
            if (!txt.includes(',') || txt.match(/\d{2,}/)) return false;
            if (/^M-J/i.test(txt) || /\b(KTW|RTW|NEF|Ak\.)\b/i.test(txt)) return false;
            return true;
          });

          const colleagues = [];
          rows.forEach(r => {
            const nameEl = r.querySelector('.employee-cell') || r.children[0];
            const name = nameEl.textContent.trim().replace(/\s+/g, ' ');
            const cells = Array.from(r.children);
            const shifts = {};

            colToDay.forEach((dayNum, colIdx) => {
              if (colIdx < cells.length) {
                const cell = cells[colIdx];
                const rawText = (cell.innerText || cell.textContent || '').trim();
                if (!rawText) return;
                const cellHasAsterisk = rawText.includes('*') ||
                  Boolean(cell.innerHTML && cell.innerHTML.includes('*')) ||
                  Boolean(cell.getAttribute('title') && cell.getAttribute('title').includes('*')) ||
                  Boolean(cell.getAttribute('aria-label') && cell.getAttribute('aria-label').includes('*')) ||
                  Boolean(cell.querySelector('[matbadge], .mat-badge, .mat-badge-content, [class*="star"], [class*="asterisk"]'));

                const parts = rawText.toUpperCase().split(/[,/;\n\r\t]+/).map(p => p.trim()).filter(Boolean);
                const validCodes = [];
                parts.forEach(part => {
                  const hasAsterisk = part.includes('*') || cellHasAsterisk;
                  let baseCode = part.replace(/[^A-ZÄÖÜ0-9\-]/g, '');
                  if (!baseCode || baseCode.length < 2 || baseCode === 'FREI' || baseCode === '00' || baseCode === 'WKS') return;

                  const stdPat = '(?:RF[MHO]|RS[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MH]|RH[MH]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';
                  const pm = baseCode.match(new RegExp('^(RD|RDÜ|ÜB)(' + stdPat + ')(\\*?)$'));
                  if (pm) {
                    const sub1 = pm[1] === 'RD' ? 'RDÜ' : pm[1];
                    const sub2 = pm[2] + (pm[3] || (hasAsterisk ? '*' : ''));
                    validCodes.push(sub1, sub2);
                    return;
                  }
                  if (baseCode === 'RD') baseCode = 'RDÜ';
                  validCodes.push(hasAsterisk ? (baseCode + '*') : baseCode);
                });

                if (validCodes.length > 0) {
                  const dateStr = yearMonth + '-' + String(dayNum).padStart(2, '0');
                  shifts[dateStr] = validCodes.join(', ');
                }
              }
            });

            if (Object.keys(shifts).length > 0) {
              colleagues.push({ name, shifts });
            }
          });

          return { yearMonth, monthLabel, station: forcedStation || 'Sendling', colleagues };
        };

        const fields = Array.from(document.querySelectorAll('mat-form-field, .mat-form-field'));
        const pgField = fields.find(f => /Planungsgruppe/i.test(f.innerText || f.textContent || ''));
        const pgSelect = (pgField && pgField.querySelector('mat-select, .mat-select')) || document.querySelectorAll('mat-select, .mat-select')[0];

        const TARGET_STATIONS = [
          { pattern: /61000.*Rettungswache\s+M[üu]nchen/i, station: 'Sendling', label: '61000 München' },
          { pattern: /61010.*Obersendling/i, station: 'Obersendling', label: '61010 Obersendling' },
          { pattern: /61300.*Hohenbrunn/i, station: 'Hohenbrunn', label: '61300 Hohenbrunn' }
        ];

        const rosters = [];
        if (pgSelect) {
          for (let i = 0; i < TARGET_STATIONS.length; i++) {
            const target = TARGET_STATIONS[i];
            triggerBtn.textContent = `⏳ Lese ${i + 1}/3: ${target.label}...`;
            const clickTarget = pgSelect.querySelector('.mat-select-trigger, .mat-mdc-select-trigger') || pgSelect;
            clickTarget.click();

            let options = [];
            for (let w = 0; w < 15; w++) {
              await sleep(120);
              options = Array.from(document.querySelectorAll('mat-option, .mat-option, [role="option"]'));
              if (options.length > 0) break;
            }

            const matchOpt = options.find(o => target.pattern.test((o.innerText || o.textContent || '').trim()));
            if (matchOpt) {
              const prevSig = Array.from(document.querySelectorAll('tr')).slice(1, 5).map(r => (r.children[0]?.textContent || '').trim()).join('|');
              matchOpt.scrollIntoView({ block: 'nearest' });
              matchOpt.click();
              for (let w = 0; w < 25; w++) {
                await sleep(160);
                const newSig = Array.from(document.querySelectorAll('tr')).slice(1, 5).map(r => (r.children[0]?.textContent || '').trim()).join('|');
                if (newSig && newSig !== prevSig && !/^M-J\s*\d/i.test(newSig)) break;
              }
              await sleep(250);
            } else {
              document.body.click();
              await sleep(150);
            }

            const extracted = extractVisibleTable(target.station);
            if (extracted.colleagues.length > 0) rosters.push(extracted);
          }
        }

        const payload = { multiStation: true, yearMonth, monthLabel, rosters };
        const json = JSON.stringify(payload);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try { await navigator.clipboard.writeText(json); } catch (e) {}
        }
        if (window.opener && !window.opener.closed) {
          try { window.opener.postMessage({ type: 'CAREMAN_LIVE_SYNC_RESULT', payload }, '*'); } catch (e) {}
        }
        window.open('https://schicht.vjbackhaus.de/team#careman=' + encodeURIComponent(json), 'schichttagebuch_app');
        triggerBtn.textContent = `✅ Alle ${rosters.length} Wachen übertragen!`;
      } catch (e) {
        triggerBtn.textContent = '⚠️ Fehler: ' + e.message;
      } finally {
        triggerBtn.disabled = false;
      }
    };

    triggerBtn.addEventListener('click', runMultiStationExtraction);
  }
})();
