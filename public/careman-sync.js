(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const banner = document.createElement('div');
  banner.setAttribute('data-careman-sync-banner', '1');
  banner.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:999999;pointer-events:none;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;padding:12px 22px;border-radius:14px;font-family:sans-serif;font-size:14px;font-weight:700;box-shadow:0 12px 32px rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.3);display:flex;align-items:center;gap:12px;';
  const setStatus = txt => { banner.textContent = txt; };
  document.body.appendChild(banner);

  const copySync = (str) => {
    try {
      const ta = document.createElement('textarea');
      ta.value = str;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e) {
      return false;
    }
  };

  try {
    const monthNames = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
    const monthRegexSubstr = /\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(20\d{2})\b/i;

    // ============================================================================
    // AUTO-PILOT STATE AUS WINDOW.NAME & URL (?date=YYYY-M-D)
    // ============================================================================
    let autoPilot = null;
    try {
      if (window.name && window.name.startsWith('CAREMAN_AUTOPILOT:')) {
        autoPilot = JSON.parse(window.name.slice('CAREMAN_AUTOPILOT:'.length));
      }
    } catch (e) {}

    const isFreshAutoPilot = Boolean(
      autoPilot &&
      autoPilot.targetYearMonth &&
      /^\d{4}-\d{2}$/.test(autoPilot.targetYearMonth) &&
      (!autoPilot.startedAt || (Date.now() - autoPilot.startedAt < 25 * 60 * 1000))
    );

    const decodedHref = (() => {
      try { return decodeURIComponent(window.location.href || ''); } catch (e) { return window.location.href || ''; }
    })();
    const urlDateMatch = decodedHref.match(/[?&]date=(20\d{2})-(\d{1,2})-(\d{1,2})/);
    const urlYearMonth = urlDateMatch
      ? `${urlDateMatch[1]}-${String(parseInt(urlDateMatch[2], 10)).padStart(2, '0')}`
      : null;
    const urlTargetDate = urlDateMatch
      ? `${urlDateMatch[1]}-${parseInt(urlDateMatch[2], 10)}-${parseInt(urlDateMatch[3], 10)}`
      : null;

    const setNativeInputValue = (el, val) => {
      if (!el || val === undefined || val === null) return;
      try {
        const proto = Object.getPrototypeOf(el);
        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value') ||
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
        if (descriptor && descriptor.set) {
          descriptor.set.call(el, val);
        } else {
          el.value = val;
        }
      } catch (e) {
        el.value = val;
      }
      ['input', 'change', 'blur'].forEach(evtName => {
        try { el.dispatchEvent(new Event(evtName, { bubbles: true })); } catch (e) {}
      });
    };

    // ============================================================================
    // STUFE 1: JOHANNITER SECURE PORTAL (LOGIN -> AIRLOCK 2FA -> DIENSTPLAN BAYERN)
    // ============================================================================
    if (/my\.secure\.johanniter\.de/i.test(window.location.hostname || '')) {
      const now = new Date();
      const fallbackDate = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
      let targetDate = (autoPilot && autoPilot.targetDate) || urlTargetDate || fallbackDate;
      let targetYm = (autoPilot && autoPilot.targetYearMonth) || urlYearMonth ||
        `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      let apUser = (autoPilot && autoPilot.username) || '';
      let apPass = (autoPilot && autoPilot.password) || '';
      try {
        if (apUser) localStorage.setItem('careman_ap_user', apUser);
        else apUser = localStorage.getItem('careman_ap_user') || 'johannes.backhaus@johanniter.de';
        if (apPass) localStorage.setItem('careman_ap_pass', apPass);
        else apPass = localStorage.getItem('careman_ap_pass') || '';
      } catch (e) {
        if (!apUser) apUser = 'johannes.backhaus@johanniter.de';
      }

      const targetCareManUrl = (autoPilot && autoPilot.targetCareManUrl) ||
        `https://dienstplan-bayern.secure.johanniter.de/app/home/(calendar//panel:entries)?date=${targetDate}`;

      try {
        window.name = 'CAREMAN_AUTOPILOT:' + JSON.stringify({
          autoRun: true,
          targetYearMonth: targetYm,
          targetDate,
          targetCareManUrl,
          username: apUser,
          password: apPass,
          startedAt: (autoPilot && autoPilot.startedAt) || Date.now()
        });
      } catch (e) {}

      let lastPasswordSubmitAt = 0;
      let last2faSelectAt = 0;

      // Warte bis zu 180 Sekunden auf Login + manuelle Bestätigung in Airlock 2FA
      for (let tick = 0; tick < 450; tick++) {
        const href = window.location.href || '';
        const bodyText = (document.body?.innerText || document.body?.textContent || '').trim();

        // 1. Prüfen, ob wir nach Airlock 2FA im Self Service Portal angekommen sind
        const dienstplanTile = Array.from(document.querySelectorAll('a, button, div, span, p')).find(el => {
          if (el.closest && el.closest('[data-careman-sync-banner]')) return false;
          const t = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          return /^Dienstplan\s+BAYERN$/i.test(t) || (el.tagName === 'A' && /dienstplan-bayern\.secure\.johanniter\.de/i.test((el.getAttribute && el.getAttribute('href')) || ''));
        });
        const isPortalLoaded = Boolean(dienstplanTile) ||
          (!href.includes('/auth/ui/') && (/Webanwendungen|Self\s*Service|Dienstplan\s*BAYERN/i.test(bodyText)));

        if (isPortalLoaded) {
          banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
          setStatus(`🚀 Airlock 2FA bestätigt! Öffne Dienstplan Bayern (${targetDate})...`);
          await sleep(250);
          window.location.href = targetCareManUrl;
          return;
        }

        // 2. Prüfen auf "Anmeldung mit Airlock 2FA" (manuelle Smartphone-Bestätigung)
        if (/Anmeldung\s+mit\s+Airlock\s+2FA|Nachricht\s+auf\s+Ihrem\s+Smartphone|Offline-Modus/i.test(bodyText)) {
          banner.style.background = 'linear-gradient(135deg,#0284c7,#0369a1)';
          setStatus(`📱 Bitte jetzt in Airlock 2FA bestätigen – öffne danach automatisch Dienstplan Bayern (${targetYm})...`);
          await sleep(400);
          continue;
        }

        // 3. Prüfen auf "Auswahl" (Authentisierungsmöglichkeit: Airlock 2FA vs. OATH)
        if (/Authentisierungsm[öo]glichkeiten|Airlock\s+2FA/i.test(bodyText) && !document.querySelector('input[type="password"]')) {
          if (Date.now() - last2faSelectAt > 2500) {
            setStatus('⚡ Wähle Airlock 2FA aus...');
            const radios = Array.from(document.querySelectorAll('input[type="radio"], [role="radio"], label, span, div')).filter(el => {
              if (el.closest && el.closest('[data-careman-sync-banner]')) return false;
              const t = (el.innerText || el.textContent || '').trim();
              return /^Airlock\s*2FA$/i.test(t) || (el.tagName === 'INPUT' && /airlock/i.test((el.value || '') + ' ' + (el.id || '') + ' ' + (el.name || '')));
            });
            const radioInput = document.querySelector('input[type="radio"]') || radios[0];
            if (radioInput) {
              try {
                radioInput.click();
                if (radioInput.tagName === 'INPUT') {
                  radioInput.checked = true;
                  radioInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
              } catch (e) {}
            }
            if (radios[0] && radios[0] !== radioInput) {
              try { radios[0].click(); } catch (e) {}
            }
            await sleep(200);
            const selectBtn = Array.from(document.querySelectorAll('button, input[type="submit"], a, [role="button"]')).find(b => {
              const t = (b.innerText || b.value || b.textContent || '').trim();
              return /^(Ausw[äa]hlen|Weiter|Best[äa]tigen|OK|Anmelden)$/i.test(t);
            });
            if (selectBtn) {
              last2faSelectAt = Date.now();
              try { selectBtn.click(); } catch (e) {}
            }
          }
          await sleep(400);
          continue;
        }

        // 4. Prüfen auf Login-Formular (Benutzername & Passwort)
        const passInput = document.querySelector('input[type="password"]');
        if (passInput) {
          const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="password"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"])'));
          const userInput = allInputs.find(inp => /user|login|mail|name/i.test((inp.name || '') + ' ' + (inp.id || '') + ' ' + (inp.placeholder || '') + ' ' + (inp.getAttribute('autocomplete') || ''))) || allInputs[0];

          if (userInput && !userInput.value && apUser) {
            setNativeInputValue(userInput, apUser);
          }
          if (!passInput.value && apPass) {
            setNativeInputValue(passInput, apPass);
          }

          if (passInput && !passInput.hasAttribute('data-careman-listener')) {
            passInput.setAttribute('data-careman-listener', '1');
            passInput.addEventListener('change', () => {
              try {
                if (passInput.value) localStorage.setItem('careman_ap_pass', passInput.value);
                if (userInput && userInput.value) localStorage.setItem('careman_ap_user', userInput.value);
              } catch (e) {}
            });
          }

          const currentUserVal = userInput ? userInput.value.trim() : apUser;
          const currentPassVal = passInput.value;

          if (currentUserVal && currentPassVal && Date.now() - lastPasswordSubmitAt > 3000) {
            setStatus('🔐 Benutzername & Passwort eingetragen – klicke auf Anmelden...');
            try {
              localStorage.setItem('careman_ap_user', currentUserVal);
              localStorage.setItem('careman_ap_pass', currentPassVal);
            } catch (e) {}
            if (userInput) setNativeInputValue(userInput, currentUserVal);
            setNativeInputValue(passInput, currentPassVal);
            await sleep(150);

            const loginBtn = Array.from(document.querySelectorAll('button, input[type="submit"], [role="button"]')).find(b => {
              const t = (b.innerText || b.value || b.textContent || '').trim();
              return /^(Anmelden|Login|Weiter|OK|Submit)$/i.test(t);
            }) || document.querySelector('button[type="submit"], input[type="submit"]');

            if (loginBtn) {
              lastPasswordSubmitAt = Date.now();
              try { loginBtn.click(); } catch (e) {}
              try {
                const form = passInput.closest('form');
                if (form && typeof form.requestSubmit === 'function') form.requestSubmit();
              } catch (e) {}
            }
          } else if (!currentPassVal) {
            setStatus('🔐 Bitte Passwort bestätigen (oder im Schichttagebuch speichern) – klicke danach automatisch auf Anmelden...');
          }
        }

        await sleep(400);
      }
      return;
    }

    const getCommonAncestorDepth = (a, b) => {
      if (!a || !b) return 0;
      const ancestorsA = new Set();
      let cur = a;
      while (cur) {
        ancestorsA.add(cur);
        cur = cur.parentElement;
      }
      let lca = b;
      while (lca && !ancestorsA.has(lca)) {
        lca = lca.parentElement;
      }
      let depth = 0;
      while (lca) {
        depth++;
        lca = lca.parentElement;
      }
      return depth;
    };

    // Findet den exakt sichtbaren Monats-Textknoten in der CareMan-Kopfzeile (z.B. "Juli 2026" oder "November 2026")
    // und misst per Range.getBoundingClientRect() die millimetergenaue Text-Box (ohne umschließende < / > Buttons).
    // WICHTIG: Ignoriert unser eigenes Banner ([data-careman-sync-banner]) sowie Datumsbereiche ("01.11.2026 - 30.11.2026")!
    const getVisibleMonthHeaderInfo = () => {
      const rawCandidates = [];
      let domCounter = 0;
      let pgEl = null;
      let pgCy = null;
      try {
        pgEl = typeof findPlanungsgruppeTrigger === 'function' ? findPlanungsgruppeTrigger() : null;
        if (pgEl && pgEl.getBoundingClientRect) {
          const pgr = pgEl.getBoundingClientRect();
          if (pgr.width > 0 && pgr.top > 0) {
            pgCy = pgr.top + pgr.height / 2;
          }
        }
      } catch (e) {}

      const isIstplanToolbarRow = (el) => {
        if (!pgEl || !el) return false;
        let p = el;
        for (let d = 0; d < 4 && p && p !== document.body; d++) {
          const pr = p.getBoundingClientRect ? p.getBoundingClientRect() : null;
          if (pr && pr.height > 150) break;
          const t = (p.innerText || p.textContent || '');
          if (/Planungsgruppe/i.test(t)) return false;
          if (/\b(Istplan|Sollplan|Erfassung)\b/i.test(t)) return true;
          p = p.parentElement;
        }
        return false;
      };

      if (document.body && document.createTreeWalker) {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = walker.nextNode())) {
          const parent = node.parentElement;
          if (!parent || !parent.getBoundingClientRect) continue;
          if (parent.closest('[data-careman-sync-banner], table, mat-option, md-option, [role="option"], script, style, noscript')) continue;
          const raw = node.nodeValue || '';
          if (!raw || raw.length > 120) continue;
          if (/\d{2}\.\d{2}\.20\d{2}/.test(raw)) continue;
          const m = raw.match(monthRegexSubstr);
          if (!m) continue;
          if (isIstplanToolbarRow(parent)) continue;
          const st = window.getComputedStyle(parent);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) continue;

          let r = parent.getBoundingClientRect();
          try {
            const range = document.createRange();
            range.setStart(node, m.index);
            range.setEnd(node, m.index + m[0].length);
            const rr = range.getBoundingClientRect();
            if (rr && rr.width >= 20 && rr.height >= 6) {
              r = rr;
            }
          } catch (e) {}

          if (r.width < 18 || r.width > 360 || r.height < 8 || r.height > 85) continue;
          if (r.top < 4 || r.top > 450 || r.left < 0 || r.left > 620) continue;

          rawCandidates.push({
            el: parent,
            rect: r,
            monthName: m[1],
            yearStr: m[2],
            domIdx: ++domCounter
          });
        }
      }

      // Unterstützung falls Monat & Jahr auf zwei Kind-Spans verteilt sind (z.B. <span>Juli</span> <span>2026</span>)
      Array.from(document.querySelectorAll('span, div, button, a, strong, b, label')).forEach(el => {
        if (el.closest('[data-careman-sync-banner], table, mat-option, md-option, [role="option"], script, style, noscript')) return;
        if (el.children && el.children.length > 4) return;
        const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
        if (!txt || txt.length > 40 || /\d{2}\.\d{2}\.20\d{2}/.test(txt)) return;
        const m = txt.match(/^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(20\d{2})$/i);
        if (!m || !el.getBoundingClientRect) return;
        if (isIstplanToolbarRow(el)) return;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return;
        const r = el.getBoundingClientRect();
        if (r.width < 18 || r.width > 360 || r.height < 8 || r.height > 85) return;
        if (r.top < 4 || r.top > 450 || r.left < 0 || r.left > 620) return;
        if (rawCandidates.some(c => c.el === el || c.el.contains(el))) return;
        rawCandidates.push({
          el,
          rect: r,
          monthName: m[1],
          yearStr: m[2],
          domIdx: ++domCounter
        });
      });

      Array.from(document.querySelectorAll('input')).forEach(inp => {
        if (inp.closest('[data-careman-sync-banner]')) return;
        const val = (inp.value || '').trim();
        if (!val || /\d{2}\.\d{2}\.20\d{2}/.test(val)) return;
        const m = val.match(monthRegexSubstr);
        if (!m || !inp.getBoundingClientRect) return;
        if (isIstplanToolbarRow(inp)) return;
        const r = inp.getBoundingClientRect();
        if (r.width < 18 || r.width > 360 || r.height < 8 || r.height > 85) return;
        if (r.top < 4 || r.top > 450 || r.left < 0 || r.left > 620) return;
        rawCandidates.push({
          el: inp,
          rect: r,
          monthName: m[1],
          yearStr: m[2],
          domIdx: ++domCounter
        });
      });

      if (rawCandidates.length === 0) return null;

      const scored = rawCandidates.map(c => {
        const r = c.rect;
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const topHit = document.elementFromPoint(cx, cy);
        const isTopmost = Boolean(topHit && (c.el === topHit || c.el.contains(topHit) || topHit.contains(c.el)));
        const onPgRow = pgCy !== null && Math.abs(cy - pgCy) <= 48;
        const lcaDepth = pgEl ? getCommonAncestorDepth(c.el, pgEl) : 0;
        return { ...c, isTopmost, onPgRow, lcaDepth };
      });

      scored.sort((a, b) => {
        if (a.isTopmost !== b.isTopmost) return a.isTopmost ? -1 : 1;
        if (a.onPgRow !== b.onPgRow) return a.onPgRow ? -1 : 1;
        if (a.lcaDepth !== b.lcaDepth) return b.lcaDepth - a.lcaDepth;
        return b.domIdx - a.domIdx;
      });

      const best = scored[0];
      const idx = monthNames.findIndex(name => name.toLowerCase() === best.monthName.toLowerCase());
      const month = idx + 1;
      const year = parseInt(best.yearStr, 10);
      return {
        el: best.el,
        rect: best.rect,
        year,
        month,
        yearMonth: `${year}-${String(month).padStart(2, '0')}`,
        monthLabel: `${monthNames[month - 1]} ${year}`
      };
    };

    const detectMonthYear = () => {
      const headerInfo = getVisibleMonthHeaderInfo();
      if (headerInfo) {
        return { yearMonth: headerInfo.yearMonth, monthLabel: headerInfo.monthLabel };
      }
      let year = new Date().getFullYear();
      let month = new Date().getMonth() + 1;
      const pageText = Array.from(document.body ? document.body.children : [])
        .filter(el => !el.hasAttribute('data-careman-sync-banner'))
        .map(el => el.innerText || el.textContent || '')
        .join('\n');
      const textMatches = Array.from(pageText.matchAll(/\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(20\d{2})\b/gi));
      if (textMatches.length > 0) {
        const lastText = textMatches[textMatches.length - 1];
        const idx = monthNames.findIndex(m => m.toLowerCase() === lastText[1].toLowerCase());
        if (idx !== -1) {
          month = idx + 1;
          year = parseInt(lastText[2], 10);
        }
      }
      return {
        yearMonth: `${year}-${String(month).padStart(2, '0')}`,
        monthLabel: `${monthNames[month - 1]} ${year}`
      };
    };

    const findAbteilungTable = () => {
      const allTables = Array.from(document.querySelectorAll('table'));
      return allTables.slice().reverse().find(t => {
        const hr = t.querySelector('thead tr') || t.querySelector('tr');
        const hs = Array.from(hr?.children || []).map(c => c.textContent.trim());
        return hs.filter(h => /\b([1-9]|[12]\d|3[01])\b/.test(h)).length >= 20;
      }) || document.querySelector('table.mat-table') || document.querySelector('table');
    };

    const getAbtTableSig = () => {
      const tbl = findAbteilungTable();
      if (!tbl) return '';
      const allTrs = Array.from(tbl.querySelectorAll('tr'));
      const empTrs = allTrs.filter(r => {
        const first = (r.querySelector('.employee-cell') || r.children[0])?.textContent?.trim() || '';
        return first.includes(',') && !/^M-J/i.test(first);
      });
      const headerSig = (allTrs[0]?.innerText || allTrs[0]?.textContent || '').trim().replace(/\s+/g, ' ');
      const bodyRows = empTrs.length > 0 ? empTrs.slice(0, 8) : allTrs.slice(1, 9);
      const bodySig = bodyRows.map(r => (r.innerText || r.textContent || '').trim().replace(/\s+/g, ' ')).join('||');
      return headerSig + '##' + bodySig;
    };

    const extractVisibleTable = (forcedStation, ymOverride, labelOverride) => {
      const { yearMonth: ym, monthLabel: ml } = ymOverride ? { yearMonth: ymOverride, monthLabel: labelOverride } : detectMonthYear();
      const table = findAbteilungTable();
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

      const rows = Array.from((table || document).querySelectorAll('tr')).filter(r => {
        const nameEl = r.querySelector('.employee-cell') || r.children[0];
        const txt = nameEl ? nameEl.textContent.trim() : '';
        if (!txt.includes(',') || txt.match(/\d{2,}/)) return false;
        if (/^M-J/i.test(txt) || /\b(KTW|RTW|NEF|Ak\.)\b/i.test(txt)) return false;
        return true;
      });

      const colleagues = [];
      let mCount = 0, oCount = 0, hCount = 0;

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
              if (!baseCode || baseCode.length < 2 || baseCode.length > 10 || !/[A-ZÄÖÜ]/i.test(baseCode) || /^KW\d*$/i.test(baseCode) || baseCode === 'FREI' || baseCode === '00' || baseCode === 'WKS') return;

              const stdPat = '(?:RF[MHO]|RS\d?[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MHO]|RH[MHO]|KS\d?[MHO]|KF\d?[MHO]|KT\d?[MHO]|KN\d?[MHO]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';
              const pm = baseCode.match(new RegExp('^(RD|RDÜ|ÜB)(' + stdPat + ')(\\*?)$'));
              if (pm) {
                const sub1 = pm[1] === 'RD' ? 'RDÜ' : pm[1];
                const sub2 = pm[2] + (pm[3] || (hasAsterisk ? '*' : ''));
                validCodes.push(sub1, sub2);
                return;
              }
              const sm = baseCode.match(new RegExp('^(' + stdPat + ')(RD|RDÜ|ÜB)(\\*?)$'));
              if (sm) {
                const sub1 = sm[1] + (hasAsterisk ? '*' : '');
                const sub2 = sm[2] === 'RD' ? 'RDÜ' : sm[2];
                validCodes.push(sub1, sub2);
                return;
              }

              if (baseCode.length > 6) return;
              if (baseCode === 'RD') baseCode = 'RDÜ';
              const finalCode = hasAsterisk ? (baseCode + '*') : baseCode;
              validCodes.push(finalCode);
              if (baseCode.endsWith('M') || baseCode.includes('-M') || ['RFM', 'RSM', 'RNM', 'RT1M', 'RT2M', 'RT3M', 'RT4M', 'RS2M', 'RCM', 'RHM', 'DDM'].includes(baseCode)) mCount++;
              else if (baseCode.endsWith('O') || baseCode === 'RFO' || baseCode === 'RSO' || baseCode.startsWith('NFO') || baseCode.startsWith('FFO')) oCount++;
              else if (baseCode.endsWith('H') || baseCode.includes('HBN') || ['RFH', 'RTH', 'RT1H', 'RT2H', 'RSH', 'RNH', 'RHH'].includes(baseCode)) hCount++;
            });

            if (validCodes.length > 0) {
              shifts[String(dayNum)] = validCodes.join(',');
            }
          }
        });

        if (Object.keys(shifts).length > 0) {
          colleagues.push({ name, shifts });
        }
      });

      let detectedStation = null;
      if (oCount > mCount && oCount > hCount) detectedStation = 'Obersendling';
      else if (hCount > mCount && hCount > oCount) detectedStation = 'Hohenbrunn';
      else if (mCount > 0) detectedStation = 'Sendling';

      const station = forcedStation || detectedStation || 'Sendling';
      return { extractedAt: Date.now(), yearMonth: ym, monthLabel: ml, station, detectedStation, colleagues };
    };

    const PG_ITEM_REGEX = /(61\s+Fahrzeugplanung|61\s+SKo|61\s+WL|61000|61010|61300)/i;

    const isElementVisible = (el) => {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 26 || rect.height < 10 || rect.height > 165) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
      return true;
    };

    const getVisiblePgElements = () => {
      return Array.from(document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, mat-select, md-select, ng-select, [role="combobox"], [role="listbox"], li, div, span')).filter(el => {
        if (el.closest('[data-careman-sync-banner], table')) return false;
        if (!isElementVisible(el)) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 125) return false;
        return PG_ITEM_REGEX.test(txt);
      });
    };

    // Das Popup ist genau dann offen, wenn mindestens 2 sichtbare mat-option/[role="option"] Zeilen existieren
    // ODER mindestens 3 nicht-ineinander-verschachtelte Zeilen mit unterschiedlichen Planungsgruppen sichtbar sind!
    const isPopupOpen = () => {
      const visOpts = Array.from(document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option')).filter(
        el => !el.closest('[data-careman-sync-banner], table') && isElementVisible(el)
      );
      const optY = new Set(visOpts.map(el => Math.round(el.getBoundingClientRect().top / 18)));
      if (optY.size >= 2) return true;
      const rawVis = getVisiblePgElements();
      const leafVis = rawVis.filter(el => !rawVis.some(other => other !== el && el.contains(other)));
      const distinctY = new Set(leafVis.map(el => Math.round(el.getBoundingClientRect().top / 28)));
      return distinctY.size >= 3;
    };

    const dismissBlockingDialogs = () => {
      try {
        const dlgBtns = Array.from(document.querySelectorAll('mat-dialog-container button, .mat-dialog-container button, [role="dialog"] button'));
        const okBtn = dlgBtns.find(b => /^(OK|Schlie[ßs]en|Verstanden|Ja)$/i.test((b.innerText || b.textContent || '').trim())) || dlgBtns[0];
        if (okBtn && typeof okBtn.click === 'function') {
          okBtn.click();
          return true;
        }
      } catch (e) {}
      return false;
    };

    // Universeller Finder für das geschlossene Dropdown "Filter Planungsgruppe"
    const findPlanungsgruppeTrigger = () => {
      const visPg = getVisiblePgElements()
        .filter(el => el.getBoundingClientRect().top < 450)
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      if (visPg.length > 0) {
        const inner = visPg[0];
        return inner.closest('mat-select, md-select, ng-select, select, .mat-select-trigger, .mat-mdc-select-trigger, [role="combobox"], [role="listbox"]') || inner;
      }

      const allSelects = Array.from(document.querySelectorAll(
        'mat-select, md-select, ng-select, select, [role="combobox"], [role="listbox"], .mat-select, .md-select, .ng-select'
      )).filter(el => isElementVisible(el));
      const byParentLabel = allSelects.find(el => {
        let p = el.parentElement;
        for (let d = 0; d < 5 && p && p !== document.body; d++) {
          if (/Planungsgruppe/i.test(p.innerText || p.textContent || '')) return true;
          p = p.parentElement;
        }
        return false;
      });
      if (byParentLabel) return byParentLabel;

      // Fallback über das sichtbare Label "Filter Planungsgruppe" (auch wenn nach Monatswechsel noch keine Gruppe gewählt ist)
      const labelEl = Array.from(document.querySelectorAll('label, span, div')).find(el => {
        if (el.closest('[data-careman-sync-banner]')) return false;
        if (!el.getBoundingClientRect) return false;
        const r = el.getBoundingClientRect();
        if (r.top < 10 || r.top > 450 || r.width < 25 || r.width > 360 || r.height < 6 || r.height > 48) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        return /^(Filter\s+)?Planungsgruppe$/i.test(txt);
      });
      if (labelEl) {
        const r = labelEl.getBoundingClientRect();
        const belowEl = document.elementFromPoint(r.left + 45, r.bottom + 14);
        if (belowEl && belowEl !== document.body) {
          return belowEl.closest('mat-select, md-select, ng-select, select, .mat-select-trigger, .mat-mdc-select-trigger, .mat-form-field-infix, [role="combobox"], [role="listbox"]') || belowEl;
        }
      }
      return null;
    };

    const resolveClickableHost = (node) => {
      if (!node || (node.closest && node.closest('[data-careman-sync-banner]'))) return null;
      const svgRoot = node.closest ? node.closest('svg') : null;
      const base = (svgRoot && svgRoot.parentElement) ? svgRoot.parentElement : node;
      return (base.closest && base.closest('button, a, [role="button"]')) ||
        (base.closest && base.closest('mat-icon, .mat-icon')) ||
        base;
    };

    const clickChevronAt = (elOrNull, cx, cy) => {
      const rawHit = document.elementFromPoint(cx, cy) || elOrNull;
      const btn = resolveClickableHost(elOrNull) || resolveClickableHost(rawHit);
      try {
        if (btn && typeof btn.click === 'function') {
          btn.click();
        }
      } catch (e) {}
      const evtTarget = btn || rawHit;
      if (evtTarget && evtTarget.dispatchEvent) {
        ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
          try {
            evtTarget.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
          } catch (e) {}
        });
      }
    };

    const stepVisibleHeaderToMonth = async (wantYm, wantLabel, contextName) => {
      const [wantY, wantM] = wantYm.split('-').map(Number);
      let stepped = false;
      for (let step = 0; step < 48; step++) {
        const curHeader = getVisibleMonthHeaderInfo();
        const curInfo = curHeader || detectMonthYear();
        const [curY, curM] = curInfo.yearMonth.split('-').map(Number);
        const diff = (wantY - curY) * 12 + (wantM - curM);
        if (diff === 0) break;

        setStatus(`⚡ Wechsle im ${contextName} auf ${wantLabel} (${curInfo.monthLabel})...`);
        const mr = curHeader?.rect || (curHeader?.el ? curHeader.el.getBoundingClientRect() : null);
        if (!mr) break;

        const arrowY = mr.top + mr.height / 2;
        const coordX = diff < 0 ? Math.max(8, mr.left - 44) : Math.max(22, mr.left - 14);

        const clusters = [];
        const addClusterCandidate = (rawEl) => {
          const host = resolveClickableHost(rawEl);
          if (!host || !host.getBoundingClientRect) return;
          if (curHeader?.el && (host === curHeader.el || host.contains(curHeader.el))) return;
          const r = host.getBoundingClientRect();
          if (r.width < 6 || r.width > 64 || r.height < 6 || r.height > 64) return;
          const cy = r.top + r.height / 2;
          const cx = r.left + r.width / 2;
          if (Math.abs(cy - arrowY) > 28) return;
          if (cx < Math.max(2, mr.left - 115) || cx > mr.left - 2) return;
          const existing = clusters.find(c => Math.abs(c.cx - cx) < 12);
          if (!existing) {
            clusters.push({ host, cx, cy });
          } else if (host.matches && host.matches('button, a, [role="button"]')) {
            existing.host = host;
          }
        };

        Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, i, svg')).forEach(addClusterCandidate);
        for (let probeX = Math.max(4, Math.round(mr.left - 100)); probeX <= Math.round(mr.left - 4); probeX += 4) {
          const hit = document.elementFromPoint(probeX, arrowY);
          if (hit) addClusterCandidate(hit);
        }
        clusters.sort((a, b) => a.cx - b.cx);

        const chosen = clusters.length >= 2 ? (diff < 0 ? clusters[0] : clusters[1]) : (clusters.length === 1 ? clusters[0] : null);
        const clickX = chosen ? chosen.cx : coordX;
        const clickY = chosen ? chosen.cy : arrowY;

        clickChevronAt(chosen ? chosen.host : null, clickX, clickY);

        let monthChanged = false;
        for (let w = 0; w < 8; w++) {
          await sleep(130);
          if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
            monthChanged = true;
            break;
          }
        }

        if (!monthChanged) {
          const fallbackEl = document.elementFromPoint(coordX, arrowY);
          clickChevronAt(fallbackEl, coordX, arrowY);
          for (let w = 0; w < 12; w++) {
            await sleep(140);
            if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
              monthChanged = true;
              break;
            }
          }
        }

        if (!monthChanged) break;
        stepped = true;
      }
      return stepped;
    };

    // Ergebnis an das Schichttagebuch übergeben (gemeinsam für Schnellweg und Klick-Weg)
    const deliverPayload = async (payload, rosters, yearMonth, monthLabel) => {
      const json = JSON.stringify(payload);
      try { window.name = 'CAREMAN_SYNC:' + json; } catch (e) {}
      if (window.__CAREMAN_DAEMON_MODE) {
        window.__CAREMAN_DAEMON_RESULT = json;
        banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
        setStatus(`✅ ${Math.max(1, rosters.length)} ${rosters.length === 1 ? 'Wache' : 'Wachen'} (${monthLabel}) übertragen – kehre zum Schichttagebuch zurück...`);
        return;
      }
      copySync(json);
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try { await navigator.clipboard.writeText(json); } catch (e) {}
      }

      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage({ type: 'CAREMAN_LIVE_SYNC_RESULT', payload }, '*');
        } catch (e) {}
      }

      // WICHTIG: #careman= IMMER an die Ziel-URL anhängen und direkt /journal?month=YYYY-MM öffnen
      // (verhindert auf dem iPhone jeden Redirect-Verlust durch <Navigate to="/analysis" replace />)!
      const encodedHash = encodeURIComponent(json);
      const targetUrl = 'https://schicht.vjbackhaus.de/journal?month=' + encodeURIComponent(yearMonth) + '&sync=' + Date.now() + '#careman=' + encodedHash;

      banner.style.background = 'linear-gradient(135deg,#059669,#10b981)';
      setStatus(`✅ ${Math.max(1, rosters.length)} ${rosters.length === 1 ? 'Wache' : 'Wachen'} (${monthLabel}) übertragen – öffne Schichttagebuch...`);

      const navLink = document.createElement('a');
      navLink.href = targetUrl;
      navLink.target = '_top';
      navLink.style.display = 'none';
      document.body.appendChild(navLink);
      navLink.click();
      await sleep(150);
      window.top.location.href = targetUrl;
      window.location.href = targetUrl;
    };

    // ============================================================================
    // SCHNELLWEG: Dienstpläne direkt über die CareMan-Schnittstelle laden (alle 3 Wachen gleichzeitig).
    // Ergebnis identisch mit dem Auslesen über die Oberfläche. Bei jedem Problem -> klassischer Klick-Weg.
    // ============================================================================
    const tryFastApiExtract = async () => {
      if (!/dienstplan-bayern\.secure\.johanniter\.de$/i.test(location.hostname)) return null;
      let token = '';
      try { token = localStorage.getItem('myPlanToken') || ''; } catch (e) {}
      if (!token) return null;

      // Zielmonat: Auftrag aus der App, sonst Monat aus der Adresse, sonst der sichtbar angezeigte Monat
      let fastYm = (isFreshAutoPilot && autoPilot.targetYearMonth) || urlYearMonth || '';
      if (!fastYm) {
        const vis = getVisibleMonthHeaderInfo();
        fastYm = (vis && vis.yearMonth) || '';
      }
      if (!/^20\d{2}-\d{2}$/.test(fastYm)) return null;
      const fy = parseInt(fastYm.slice(0, 4), 10);
      const fm = parseInt(fastYm.slice(5, 7), 10);
      const fastLabel = monthNames[fm - 1] + ' ' + fy;
      setStatus('⚡ Lade Dienstplan ' + fastLabel + ' direkt aus CareMan (3 Wachen gleichzeitig)...');

      const apiBase = location.origin + '/api/-';
      const callApi = async (method, path, body, timeoutMs) => {
        const doCall = async () => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), timeoutMs || 25000);
          try {
            return await fetch(apiBase + path, {
              method,
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json, text/plain, */*',
                'Authorization': 'Bearer ' + token
              },
              body: body === undefined ? undefined : JSON.stringify(body),
              signal: ctrl.signal
            });
          } finally {
            clearTimeout(timer);
          }
        };
        let res = await doCall();
        if (res.status === 401) {
          // Sitzung auffrischen (wie die CareMan-App selbst) und einmal wiederholen
          try {
            const rr = await fetch(apiBase + '/auth/refreshToken', { headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/json' } });
            if (rr.ok) {
              const rj = await rr.json();
              if (rj && rj.isSuccess && rj.data) {
                token = rj.data;
                try { localStorage.setItem('myPlanToken', token); } catch (e) {}
                res = await doCall();
              }
            }
          } catch (e) {}
        }
        if (!res.ok) throw new Error('CareMan-API ' + path + ' HTTP ' + res.status);
        return res.json();
      };

      // Mitarbeiter-ID (eigener Vertrag laut CareMan; gespeicherte Auswahl nur als Rückfall)
      let employeeId = 0;
      try {
        const pre = await callApi('POST', '/app/initial-preload', undefined, 15000);
        const ct = pre && pre.contracts && pre.contracts.data;
        if (Array.isArray(ct) && ct[0] && ct[0].dbId) employeeId = ct[0].dbId;
      } catch (e) {}
      if (!employeeId) {
        try {
          Object.keys(localStorage).forEach(k => {
            if (/selectedEmployeeId$/.test(k)) {
              const v = parseInt(localStorage.getItem(k), 10);
              if (v > 0) employeeId = v;
            }
          });
        } catch (e) {}
      }
      if (!employeeId) return null;

      // Datumsumrechnung (CareMan liefert UTC, Tage gelten in deutscher Zeit)
      const berlinFmt = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      });
      const berlinParts = (iso) => {
        const parts = berlinFmt.formatToParts(new Date(iso));
        const g = t => (parts.find(p => p.type === t) || {}).value || '';
        return { y: parseInt(g('year'), 10), m: parseInt(g('month'), 10), d: parseInt(g('day'), 10), hm: g('hour') + ':' + g('minute') };
      };
      const berlinMidnightIso = (y, m, d) => {
        for (const off of [1, 2]) {
          const iso = new Date(Date.UTC(y, m - 1, d) - off * 3600000).toISOString();
          const p = berlinParts(iso);
          if (p.y === y && p.m === m && p.d === d && p.hm === '00:00') return iso;
        }
        return new Date(Date.UTC(y, m - 1, d) - 3600000).toISOString();
      };
      const lastDay = new Date(fy, fm, 0).getDate();
      const fromIso = berlinMidnightIso(fy, fm, 1);
      const toIso = berlinMidnightIso(fy, fm, lastDay);
      const pad2 = n => String(n).padStart(2, '0');

      const FAST_STATIONS = [
        { id: 149, name: '61000 Rettungswache München', pattern: /61000.*Rettungswache\s+M[üu]nchen/i, station: 'Sendling' },
        { id: 1669, name: '61010 Rettungswache Obersendling', pattern: /61010.*Obersendling/i, station: 'Obersendling' },
        { id: 151, name: '61300 Rettungswache Hohenbrunn', pattern: /61300.*Hohenbrunn/i, station: 'Hohenbrunn' }
      ];

      // Dienst-Kürzel genauso aufbereiten wie beim Auslesen der Tabelle
      const stdPatFast = '(?:RF[MHO]|RS\\d?[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MHO]|RH[MHO]|KS\\d?[MHO]|KF\\d?[MHO]|KT\\d?[MHO]|KN\\d?[MHO]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';
      const preRx = new RegExp('^(RD|RDÜ|ÜB)(' + stdPatFast + ')(\\*?)$');
      const postRx = new RegExp('^(' + stdPatFast + ')(RD|RDÜ|ÜB)(\\*?)$');
      const normCodes = (rawText) => {
        const raw = String(rawText || '').trim();
        if (!raw) return [];
        const cellHasAsterisk = raw.includes('*');
        const parts = raw.toUpperCase().split(/[,/;\n\r\t]+/).map(p => p.trim()).filter(Boolean);
        const out = [];
        parts.forEach(part => {
          const hasAsterisk = part.includes('*') || cellHasAsterisk;
          let baseCode = part.replace(/[^A-ZÄÖÜ0-9\-]/g, '');
          if (!baseCode || baseCode.length < 2 || baseCode.length > 10 || !/[A-ZÄÖÜ]/i.test(baseCode) || /^KW\d*$/i.test(baseCode) || baseCode === 'FREI' || baseCode === '00' || baseCode === 'WKS') return;
          const pm = baseCode.match(preRx);
          if (pm) {
            out.push(pm[1] === 'RD' ? 'RDÜ' : pm[1], pm[2] + (pm[3] || (hasAsterisk ? '*' : '')));
            return;
          }
          const sm = baseCode.match(postRx);
          if (sm) {
            out.push(sm[1] + (hasAsterisk ? '*' : ''), sm[2] === 'RD' ? 'RDÜ' : sm[2]);
            return;
          }
          if (baseCode.length > 6) return;
          if (baseCode === 'RD') baseCode = 'RDÜ';
          out.push(hasAsterisk ? (baseCode + '*') : baseCode);
        });
        return out;
      };

      const toColleagues = (resp) => {
        const d = resp && resp.data;
        if (!resp || resp.isSuccess === false || !d || !Array.isArray(d.data)) throw new Error('Unerwartete Antwort');
        const colleagues = [];
        d.data.forEach(row => {
          const name = String((row.item1 && row.item1.name) || '').trim().replace(/\s+/g, ' ');
          if (!name.includes(',') || /\d{2,}/.test(name)) return;
          if (/^M-J/i.test(name) || /\b(KTW|RTW|NEF|Ak\.)\b/i.test(name)) return;
          const byDay = {};
          ((row.item2 && row.item2.data) || []).forEach(e => {
            if (!e || !e.day || !e.day.date) return;
            const p = berlinParts(e.day.date);
            if (p.y !== fy || p.m !== fm) return;
            (byDay[p.d] = byDay[p.d] || []).push(e.shortName || '');
          });
          const shifts = {};
          Object.keys(byDay).map(Number).sort((a, b) => a - b).forEach(day => {
            const codes = normCodes(byDay[day].join(','));
            if (codes.length > 0) shifts[String(day)] = codes.join(',');
          });
          if (Object.keys(shifts).length > 0) colleagues.push({ name, shifts });
        });
        return colleagues;
      };

      const loadStation = async (st) => {
        const resp = await callApi('POST', '/team-duty/roster/' + employeeId, {
          teamDuty: { idPlanninggroup: st.id, namePlanninggroup: st.name, from: fromIso, to: toIso },
          filterEmployee: 0
        }, 30000);
        return toColleagues(resp);
      };

      // Falls sich die Planungsgruppen-IDs bei CareMan ändern: einmal neu ermitteln
      let groupsRefreshed = null;
      const refreshGroups = async () => {
        if (!groupsRefreshed) {
          groupsRefreshed = callApi('POST', '/team-duty/preload', { employeeId, planningGroup: null, filterEmployee: 0, month: fromIso }, 30000)
            .then(pre => {
              const list = (pre && pre.teamDuties && pre.teamDuties.data && pre.teamDuties.data.data) || [];
              FAST_STATIONS.forEach(st => {
                const hit = list.find(t => st.pattern.test(t.namePlanninggroup || ''));
                if (hit) { st.id = hit.idPlanninggroup; st.name = hit.namePlanninggroup; }
              });
            });
        }
        return groupsRefreshed;
      };
      const loadStationRobust = async (st) => {
        try {
          return await loadStation(st);
        } catch (e) {
          await refreshGroups();
          return loadStation(st);
        }
      };

      const lastDayIso = fy + '-' + pad2(fm) + '-' + pad2(lastDay) + 'T00:00:00.000Z';
      const personalPromise = callApi('POST', '/rosters/preload', [
        { employeeId, begin: fy + '-' + pad2(fm) + '-01T00:00:00.000Z', end: lastDayIso, rosterViewMode: 4 }
      ], 30000).catch(() => null);

      const t0 = Date.now();
      const stationResults = await Promise.all(FAST_STATIONS.map(st => loadStationRobust(st)));
      const personalResp = await personalPromise;

      const rosters = FAST_STATIONS.map((st, idx) => ({
        extractedAt: Date.now(),
        yearMonth: fastYm,
        monthLabel: fastLabel,
        station: st.station,
        detectedStation: st.station,
        colleagues: stationResults[idx]
      }));
      if (!rosters.some(r => r.colleagues.length > 0)) return null;

      // Eigene Dienstzeiten (wie im Istplan) und reine Istplan-Einträge (z.B. Lehrgänge)
      const fastPersonalTimes = {};
      const fastIstShifts = {};
      let selfName = '';
      try {
        const monthEntry = Array.isArray(personalResp)
          ? (personalResp.find(x => x && x.key && String(x.key.begin || '').startsWith(fastYm)) || personalResp[0])
          : null;
        const ru = monthEntry && monthEntry.rosterUrlaubEinsatzwunsch && monthEntry.rosterUrlaubEinsatzwunsch.data;
        if (ru && Array.isArray(ru.data) && ru.data[0] && ru.data[0].item1) selfName = ru.data[0].item1.name || '';
        const istValid = /^(RF[MHO]|RS\d?[MHO]|RN[MHO]|RT\d?[MHO]|RC[MHO]|RH[MHO]|KS\d?[MHO]|KF\d?[MHO]|KT\d?[MHO]|KN\d?[MHO]|FFO|NFO|DDM|T[1-4][MHO]|RDÜ?|BDR|LGI|ACLS|PALS|SMT|RAJ|SW\d?|RZF|R-SAN)\*?$/i;
        ((monthEntry && monthEntry.rosterDetails) || []).forEach(rdw => {
          const rd = rdw && rdw.data && rdw.data.rosterDetails;
          const key = rdw && rdw.data && rdw.data.key;
          if (!rd || !key || !key.day) return;
          const kp = berlinParts(key.day);
          if (kp.y !== fy || kp.m !== fm) return;
          const entries = (rd.entries || []).filter(en => en && en.shortName && !['-', '--', '/'].includes(en.shortName) && en.nameShiftType !== 'Fehlzeit Tag');
          if (entries.length === 0) return;
          const fp = berlinParts(entries[0].from);
          const tp = berlinParts(entries[entries.length - 1].to);
          const dStr = fastYm + '-' + pad2(kp.d);
          if (!(fp.hm === '00:00' && tp.hm === '00:00')) {
            fastPersonalTimes[dStr] = { startTime: fp.hm, endTime: tp.hm };
          }
          const codes = entries
            .map(en => String(en.shortName).toUpperCase().replace(/[^A-ZÄÖÜ0-9\-*]/g, ''))
            .filter(c => istValid.test(c))
            .map(c => c.replace(/^RD(\*?)$/, 'RDÜ$1'));
          if (codes.length > 0) fastIstShifts[String(kp.d)] = codes.join(',');
        });
      } catch (e) {}

      // Reine Istplan-Einträge beim eigenen Namen ergänzen (gleiches Verhalten wie der Klick-Weg)
      if (Object.keys(fastIstShifts).length > 0) {
        const selfRx = selfName ? null : /backhaus/i;
        const isSelf = c => c && c.name && (selfRx ? selfRx.test(c.name) : c.name === selfName);
        let selfEntry = null;
        for (const r of rosters) {
          const found = r.colleagues.find(isSelf);
          if (found) { selfEntry = found; break; }
        }
        if (!selfEntry) {
          selfEntry = { name: selfName || 'Backhaus, Johannes', shifts: {} };
          rosters[0].colleagues.unshift(selfEntry);
        }
        Object.keys(fastIstShifts).forEach(dayKey => {
          const already = rosters.some(r => r.colleagues.some(c => isSelf(c) && c.shifts && c.shifts[dayKey]));
          if (!already) selfEntry.shifts[dayKey] = fastIstShifts[dayKey];
        });
      }

      const total = rosters.reduce((n, r) => n + r.colleagues.length, 0);
      setStatus('⚡ ' + total + ' Einträge aus 3 Wachen in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s geladen...');
      return {
        payload: { multiStation: true, extractedAt: Date.now(), yearMonth: fastYm, monthLabel: fastLabel, rosters, personalTimes: fastPersonalTimes },
        rosters,
        yearMonth: fastYm,
        monthLabel: fastLabel
      };
    };

    let fastResult = null;
    try {
      fastResult = await tryFastApiExtract();
    } catch (e) {
      fastResult = null;
      setStatus('⚡ Direktabruf nicht möglich (' + (e && e.message ? e.message : e) + ') – lese über die Oberfläche...');
    }
    if (fastResult) {
      await deliverPayload(fastResult.payload, fastResult.rosters, fastResult.yearMonth, fastResult.monthLabel);
      return;
    }

    // Falls CareMan direkt nach dem Login/Redirect noch lädt, warte kurz bis Kalender oder Planungsgruppe sichtbar sind
    for (let w = 0; w < 36; w++) {
      if (getVisibleMonthHeaderInfo() || findPlanungsgruppeTrigger() || document.querySelectorAll('table tr').length > 2) break;
      setStatus('⚡ Warte auf Dienstplan Bayern...');
      await sleep(250);
    }

    const personalTimes = {};
    const istplanShifts = {};
    let initialMonthInfo = detectMonthYear();
    const desiredAutoYm = (isFreshAutoPilot && autoPilot.targetYearMonth) || urlYearMonth;
    if (desiredAutoYm && /^20\d{2}-\d{2}$/.test(desiredAutoYm)) {
      const [dy, dm] = desiredAutoYm.split('-').map(Number);
      if (dm >= 1 && dm <= 12) {
        initialMonthInfo = {
          yearMonth: desiredAutoYm,
          monthLabel: `${monthNames[dm - 1]} ${dy}`
        };
      }
    }
    const wasOnIstplan = !findPlanungsgruppeTrigger();

    // Falls wir auf dem persönlichen Istplan starten: Istplan-Schichten & Uhrzeiten (z.B. 19:14 - 23:06) vorab sichern
    // (Auch auf dem iPhone, wo 7 Kalender-Spalten ~44px-53px breit sind!)
    if (wasOnIstplan) {
      if (desiredAutoYm && !urlYearMonth && detectMonthYear().yearMonth !== initialMonthInfo.yearMonth) {
        const dpToggleBtn = document.querySelector('myplan-date-selector mat-datepicker-toggle button, mat-datepicker-toggle button');
        if (dpToggleBtn && !getVisibleMonthHeaderInfo()) {
          try {
            dismissBlockingDialogs();
            dpToggleBtn.click();
            await sleep(220);
            const periodBtn = document.querySelector('.mat-calendar-period-button');
            if (periodBtn) {
              periodBtn.click();
              await sleep(220);
              const [wantY, wantM] = initialMonthInfo.yearMonth.split('-').map(Number);
              const yrCell = Array.from(document.querySelectorAll('.mat-calendar-body-cell')).find(c => (c.innerText || '').trim() === String(wantY));
              if (yrCell) {
                yrCell.click();
                await sleep(220);
                const mCells = Array.from(document.querySelectorAll('.mat-calendar-body-cell'));
                if (mCells[wantM - 1]) {
                  mCells[wantM - 1].click();
                  await sleep(220);
                  const dCell = Array.from(document.querySelectorAll('.mat-calendar-body-cell')).find(c => (c.innerText || '').trim() === '1');
                  if (dCell) {
                    dCell.click();
                    await sleep(900);
                  }
                }
              }
            }
          } catch (e) {}
        } else {
          const didStepIst = await stepVisibleHeaderToMonth(initialMonthInfo.yearMonth, initialMonthInfo.monthLabel, 'Istplan');
          if (didStepIst) await sleep(200);
        }
      }

      const istDayPrefixRegex = /^(?:(?:Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag|Mo|Di|Mi|Do|Fr|Sa|So)\.?\s+)?([0-3]?\d)\b/i;
      const validShiftRegex = /^(RF[MHO]|RS\d?[MHO]|RN[MHO]|RT\d?[MHO]|RC[MHO]|RH[MHO]|KS\d?[MHO]|KF\d?[MHO]|KT\d?[MHO]|KN\d?[MHO]|FFO|NFO|DDM|T[1-4][MHO]|RDÜ?|BDR|LGI|ACLS|PALS|SMT|RAJ|SW\d?|RZF|R-SAN)\*?$/i;
      const getIstplanRawCells = () => {
        let cells = Array.from(document.querySelectorAll('myplan-calendar-day-phone, myplan-calendar-cell, td, mat-grid-tile, div')).filter(c => {
          if (c.closest('[data-careman-sync-banner]')) return false;
          if (!c.getBoundingClientRect) return false;
          const r = c.getBoundingClientRect();
          if (r.width < 28 || r.width > 480 || r.height < 20 || r.height > 260) return false;
          const t = (c.innerText || c.textContent || '').trim();
          if (!/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(t)) return false;
          // Wichtig: Uhrzeit vorher entfernen, damit NIEMALS die Startstunde (06, 14, 15, 22) im inneren grauen Kasten als Kalendertag erkannt wird!
          const withoutTime = t.replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g, '').trim();
          return istDayPrefixRegex.test(withoutTime);
        });
        if (cells.length === 0) {
          cells = Array.from(document.querySelectorAll('myplan-calendar-day-phone, myplan-calendar-cell, td, mat-grid-tile, div')).filter(c => {
            if (c.closest('[data-careman-sync-banner], thead, th')) return false;
            if (!c.getBoundingClientRect) return false;
            const r = c.getBoundingClientRect();
            if (r.width < 28 || r.width > 480 || r.height < 20 || r.height > 260) return false;
            const t = (c.innerText || c.textContent || '').trim();
            if (!istDayPrefixRegex.test(t)) return false;
            const withoutPrefix = t.replace(istDayPrefixRegex, '').trim();
            const tokens = withoutPrefix.split(/[\s,;/+|\n\r]+/).map(x => x.trim()).filter(Boolean);
            return tokens.length >= 1 && tokens.length <= 12 && tokens.some(tok => validShiftRegex.test(tok.replace(/[^A-ZÄÖÜ0-9\-*]/gi, '')));
          });
        }
        return cells;
      };

      // WICHTIG: CareMan rendert die Überschrift (z.B. "Dezember 2024") sofort bei 0ms, lädt die Kalenderzellen (getSmartMyPlanRoster)
      // aber asynchron nach. Warte bis zu 4.5s, bis die Kalenderzellen (00:00 - 00:00 / 06:54 - 15:06) geladen sind!
      for (let w = 0; w < 30; w++) {
        dismissBlockingDialogs();
        if (getIstplanRawCells().length > 0) break;
        setStatus(`⚡ Lade Istplan (${initialMonthInfo.monthLabel})...`);
        await sleep(140);
      }

      const curUrlMatch = (window.location.href || '').match(/[?&]date=(20\d{2})-(\d{1,2})-(\d{1,2})/);
      const curUrlYm = curUrlMatch ? `${curUrlMatch[1]}-${String(parseInt(curUrlMatch[2], 10)).padStart(2, '0')}` : urlYearMonth;
      const istVisibleMatchesTarget =
        !desiredAutoYm ||
        Boolean(curUrlYm && curUrlYm === initialMonthInfo.yearMonth) ||
        detectMonthYear().yearMonth === initialMonthInfo.yearMonth;
      if (istVisibleMatchesTarget) {
      try {
        const { yearMonth: istYm } = initialMonthInfo;
        const rawCells = getIstplanRawCells();

        const istCells = rawCells
          .filter(c => !rawCells.some(other => other !== c && c.contains(other)))
          .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.round(ra.top / 24) - Math.round(rb.top / 24) || ra.left - rb.left;
          });

        istCells.forEach((cell, idx) => {
          const txt = (cell.innerText || cell.textContent || '').trim();
          const withoutTime = txt.replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g, '').trim();
          const dayM = withoutTime.match(istDayPrefixRegex);
          const timeM = txt.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
          if (!dayM) return;
          const dNum = parseInt(dayM[1], 10);
          if (dNum < 1 || dNum > 31) return;
          // In den ersten 7 Zellen (bei vollem Desktop-Kalendergitter mit >31 Zellen inkl. Vor-/Folgemonat) gehören Tage > 20 zum Vormonat
          const isDesktopGridWithPadding = istCells.length > 31;
          if (isDesktopGridWithPadding && idx < 7 && dNum > 20) return;
          if (isDesktopGridWithPadding && idx >= istCells.length - 7 && dNum < 15) return;

          if (timeM && timeM[1] === '00:00' && timeM[2] === '00:00') return;

          const dStr = `${istYm}-${String(dNum).padStart(2, '0')}`;
          if (timeM) {
            personalTimes[dStr] = { startTime: timeM[1], endTime: timeM[2] };
          }
          const withoutDayPrefix = withoutTime.replace(istDayPrefixRegex, '').trim();
          const lines = withoutDayPrefix.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
          const matchedIstCodes = [];
          for (let li = 0; li < lines.length; li++) {
            const line = lines[li];
            const tokens = line.split(/[,;/+|\s]+/).map(t => t.trim()).filter(Boolean);
            tokens.forEach(tok => {
              const codeCandidate = tok.replace(/[^A-ZÄÖÜ0-9\-*]/gi, '').toUpperCase();
              if (validShiftRegex.test(codeCandidate)) {
                matchedIstCodes.push(codeCandidate.replace(/^RD(\*?)$/, 'RDÜ$1'));
              }
            });
          }
          if (matchedIstCodes.length > 0) {
            istplanShifts[String(dNum)] = matchedIstCodes.join(',');
          }
        });
      } catch (e) {}
      }

      // Automatisch rechts im Menü auf den orangenen Button "Abteilungs-dienstplan" klicken
      const findAbtTile = (requireVisible = true) => {
        const candidates = Array.from(document.querySelectorAll('a, button, div, span, p, li')).filter(el => {
          if (el.closest('[data-careman-sync-banner]')) return false;
          const norm = (el.innerText || el.textContent || '').replace(/[\s\-\u00AD\u2010-\u2015]+/g, '').toLowerCase();
          const isMatch = norm === 'abteilungsdienstplan' || (norm.includes('abteilungs') && norm.includes('dienstplan') && norm.length < 55);
          if (!isMatch) return false;
          if (!requireVisible) return true;
          if (!el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 18 || r.width > 260 || r.height < 10 || r.height > 220) return false;
          if (r.left < -10 || r.left >= window.innerWidth || r.bottom < 0 || r.top >= window.innerHeight) return false;
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return false;
          return true;
        });
        return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
      };

      const isMenuPanelVisible = () => {
        return Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p, a, button')).some(el => {
          if (el.closest && el.closest('[data-careman-sync-banner], table')) return false;
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          if (!r || r.width < 18 || r.height < 10 || r.left < 0 || r.left >= window.innerWidth) return false;
          const st = window.getComputedStyle(el);
          if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return false;
          const norm = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
          return /^(Nacherfassung|Urlaub\s*&\s*Fehlzeiten|Vakante\s*Dienste|Men[üu])$/i.test(norm);
        });
      };

      const isCloseButton = (el) => {
        if (!el) return false;
        const host = (el.closest && el.closest('button, a, [role="button"]')) || el;
        const txt = ((el.innerText || el.textContent || '') + ' ' + (host.innerText || host.textContent || '')).trim();
        const aria = ((host.getAttribute && (host.getAttribute('aria-label') || host.getAttribute('title'))) || '').trim();
        return /close|clear|✕|✖|×/i.test(txt) || /close|schlie/i.test(aria);
      };

      // WICHTIG: In CareMan wird die Kachel "Abteilungs-dienstplan" (*ngIf="showTeamDutyCalendarEntry") erst sichtbar,
      // nachdem CareMan im Hintergrund fillAllRight() (Berechtigungs-Check) geladen hat.
      // Außerdem darf NIEMALS der Schließen-Button (close_circle_blank / ✕) des bereits offenen Menüs geklickt werden!
      let abtEl = findAbtTile(true);
      let triedOpeningMenuDrawer = false;
      for (let w = 0; w < 38 && !abtEl; w++) {
        dismissBlockingDialogs();
        if (!triedOpeningMenuDrawer && !isMenuPanelVisible()) {
          triedOpeningMenuDrawer = true;
          let menuBtn = Array.from(document.querySelectorAll('button, a, [role="button"], div, span')).find(el => {
            if (el.closest && el.closest('[data-careman-sync-banner]')) return false;
            if (isCloseButton(el)) return false;
            const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            if (!r || r.width < 16 || r.height < 12 || r.left >= window.innerWidth) return false;
            const txt = (el.innerText || '').trim();
            const aria = ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title'))) || '').trim();
            return /^(Men[üu]|Menu|apps|grid_on|view_module)$/i.test(txt) || /Men[üu]|Menu/i.test(aria);
          });
          if (!menuBtn) {
            const topRightBtns = Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon')).filter(el => {
              if (el.closest && el.closest('[data-careman-sync-banner], table')) return false;
              if (isCloseButton(el)) return false;
              if (!el.getBoundingClientRect) return false;
              const r = el.getBoundingClientRect();
              return r.top >= 0 && r.top <= 85 && r.left >= Math.max(120, window.innerWidth - 110) && r.width >= 16 && r.width <= 90 && r.height >= 16 && r.height <= 85;
            }).sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left);
            menuBtn = topRightBtns[0] ? ((topRightBtns[0].closest && topRightBtns[0].closest('button, a, [role="button"]')) || topRightBtns[0]) : null;
          }
          if (menuBtn) {
            try {
              if (typeof menuBtn.click === 'function') menuBtn.click();
              else menuBtn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            } catch (e) {}
          }
        }
        await sleep(140);
        abtEl = findAbtTile(true);
      }
      if (!abtEl) {
        abtEl = findAbtTile(false);
      }

      const clickAbtTileCleanly = (tileEl) => {
        if (!tileEl) return;
        const routerTarget = (tileEl.closest && tileEl.closest('[routerlink], [ng-reflect-router-link], .square, button, a, [role="button"], li, mat-list-item, .mat-ripple')) || tileEl.parentElement || tileEl;
        const targets = routerTarget && routerTarget !== tileEl ? [routerTarget, tileEl] : [tileEl];
        targets.forEach(t => {
          try {
            if (typeof t.click === 'function') t.click();
            else t.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
          } catch (e) {}
        });
      };

      if (abtEl) {
        setStatus('⚡ Öffne Abteilungsdienstplan...');
        clickAbtTileCleanly(abtEl);

        // Bis zu 5 Sekunden warten, ob der Abteilungsdienstplan lädt
        for (let w = 0; w < 42; w++) {
          await sleep(110);
          if ((window.location.href || '').includes('team-duty') || findPlanungsgruppeTrigger()) break;
          if (w === 16) {
            const freshAbt = findAbtTile(true) || abtEl;
            clickAbtTileCleanly(freshAbt);
          }
        }
      }

      // Fallback falls CareMan trotz Klick noch auf /app/home steht: direkt per Angular Router (pushState + popstate) auf /app/team-duty wechseln
      if (!(window.location.href || '').includes('team-duty') && !findPlanungsgruppeTrigger()) {
        try {
          const isMobileRoute = (window.location.pathname || '').includes('/app/sm/');
          const dateSearch = window.location.search || (urlDateMatch ? `?date=${urlDateMatch[0].split('=')[1]}` : '');
          const abtPath = (isMobileRoute ? '/app/sm/team-duty' : '/app/team-duty') + dateSearch;
          if (window.history && typeof window.history.pushState === 'function') {
            window.history.pushState({}, '', abtPath);
            window.dispatchEvent(new Event('popstate'));
          }
          for (let w = 0; w < 30; w++) {
            await sleep(120);
            if (findPlanungsgruppeTrigger()) break;
          }
        } catch (e) {}
      }
    }

    // Warte bis zu 7.5 Sekunden, bis das Dropdown "Filter Planungsgruppe" (*ngIf="!isLoading") UND die Tabelle geladen sind
    for (let w = 0; w < 65; w++) {
      dismissBlockingDialogs();
      if (findPlanungsgruppeTrigger() && document.querySelectorAll('table tr').length > 2) break;
      setStatus(`⚡ Lade Abteilungsdienstplan (${initialMonthInfo.monthLabel})...`);
      await sleep(115);
    }
    await sleep(120);

    // WICHTIG FÜR IPHONE / SCHMALE BILDSCHIRME:
    // Falls das rechte "Menü"-Drawer (mit "Nacherfassung" / "Urlaub & Fehlzeiten") auf einem schmalen Bildschirm (< 950px)
    // noch offen über dem Abteilungsdienstplan liegt, überdeckt es "< > Monat" und "Filter Planungsgruppe".
    // Schließe in diesem Fall gezielt NUR das "Menü"-Drawer über dessen "✕"-Button in der "Menü"-Kopfzeile!
    if (window.innerWidth < 950) {
      const isMenuDrawerCovering = Array.from(document.querySelectorAll('a, button, div, span, p')).some(el => {
        if (el.closest('[data-careman-sync-banner], table')) return false;
        const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
        if (!r || r.width < 20 || r.height < 10 || r.left < 0 || r.left >= window.innerWidth) return false;
        const st = window.getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) < 0.1) return false;
        const norm = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim();
        return /^(Nacherfassung|Urlaub\s*&\s*Fehlzeiten|Vakante\s*Dienste)$/i.test(norm);
      });
      if (isMenuDrawerCovering) {
        const menuHeaderEl = Array.from(document.querySelectorAll('div, span, h1, h2, h3, h4, p')).find(el => {
          if (el.closest('[data-careman-sync-banner], table')) return false;
          const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
          if (!r || r.width < 20 || r.width > 200 || r.height < 10 || r.height > 60 || r.top > 180) return false;
          return /^(Men[üu]|Menu)$/i.test((el.innerText || el.textContent || '').trim());
        });
        if (menuHeaderEl) {
          const mr = menuHeaderEl.getBoundingClientRect();
          const menuCy = mr.top + mr.height / 2;
          const closeBtn = Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, span, i')).find(el => {
            if (el.closest('[data-careman-sync-banner], table')) return false;
            if (el === menuHeaderEl || menuHeaderEl.contains(el)) return false;
            const r = el.getBoundingClientRect ? el.getBoundingClientRect() : null;
            if (!r || r.width < 8 || r.width > 64 || r.height < 8 || r.height > 64) return false;
            const cy = r.top + r.height / 2;
            if (Math.abs(cy - menuCy) > 26 || r.left <= mr.right) return false;
            const rowParent = el.parentElement?.parentElement || el.parentElement;
            if (rowParent && /Abteilungsdienstplan/i.test(rowParent.innerText || '')) return false;
            return true;
          });
          if (closeBtn) {
            const host = closeBtn.closest('button, a, [role="button"]') || closeBtn;
            try { host.click(); } catch (e) {}
            await sleep(300);
          }
        }
      }
    }

    // Falls wir vom Istplan kamen (oder per Auto-Pilot einen Zielmonat angefordert haben) und CareMan im Abteilungsdienstplan einen anderen Monat geöffnet hat:
    // Bis zu 48 Monate (4 Jahre, z.B. von 2026 bis Januar 2025) rückwärts oder vorwärts blättern!
    let didStepMonth = false;
    const sigBeforeMonthStep = getAbtTableSig();
    if ((wasOnIstplan || Boolean(desiredAutoYm)) && findPlanungsgruppeTrigger()) {
      const [wantY, wantM] = initialMonthInfo.yearMonth.split('-').map(Number);
      for (let step = 0; step < 48; step++) {
        const curHeader = getVisibleMonthHeaderInfo();
        const curInfo = curHeader || detectMonthYear();
        const [curY, curM] = curInfo.yearMonth.split('-').map(Number);
        const diff = (wantY - curY) * 12 + (wantM - curM);
        if (diff === 0) break;

        setStatus(`⚡ Wechsle im Abteilungsdienstplan auf ${initialMonthInfo.monthLabel} (${curInfo.monthLabel})...`);
        const mr = curHeader?.rect || (curHeader?.el ? curHeader.el.getBoundingClientRect() : null);
        if (!mr) break;

        const arrowY = mr.top + mr.height / 2;
        // Exakt gemessene CareMan-Koordinaten links vom Monatsnamen ("<  >  Monat Jahr"):
        // "<" (Monat zurück) liegt bei mr.left - 44px, ">" (Monat vor) liegt bei mr.left - 14px
        const coordX = diff < 0 ? Math.max(8, mr.left - 44) : Math.max(22, mr.left - 14);

        // Kombiniere DOM-Suche + horizontalen elementFromPoint-Scan links von mr.left
        const clusters = [];
        const addClusterCandidate = (rawEl) => {
          const host = resolveClickableHost(rawEl);
          if (!host || !host.getBoundingClientRect) return;
          if (curHeader?.el && (host === curHeader.el || host.contains(curHeader.el))) return;
          const r = host.getBoundingClientRect();
          if (r.width < 6 || r.width > 64 || r.height < 6 || r.height > 64) return;
          const cy = r.top + r.height / 2;
          const cx = r.left + r.width / 2;
          if (Math.abs(cy - arrowY) > 28) return;
          if (cx < Math.max(2, mr.left - 115) || cx > mr.left - 2) return;
          const existing = clusters.find(c => Math.abs(c.cx - cx) < 12);
          if (!existing) {
            clusters.push({ host, cx, cy });
          } else if (host.matches && host.matches('button, a, [role="button"]')) {
            existing.host = host;
          }
        };

        Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, i, svg')).forEach(addClusterCandidate);
        for (let probeX = Math.max(4, Math.round(mr.left - 100)); probeX <= Math.round(mr.left - 4); probeX += 4) {
          const hit = document.elementFromPoint(probeX, arrowY);
          if (hit) addClusterCandidate(hit);
        }
        clusters.sort((a, b) => a.cx - b.cx);

        const chosen = clusters.length >= 2 ? (diff < 0 ? clusters[0] : clusters[1]) : (clusters.length === 1 ? clusters[0] : null);
        const clickX = chosen ? chosen.cx : coordX;
        const clickY = chosen ? chosen.cy : arrowY;

        clickChevronAt(chosen ? chosen.host : null, clickX, clickY);

        let monthChanged = false;
        for (let w = 0; w < 14; w++) {
          await sleep(50);
          if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
            monthChanged = true;
            break;
          }
        }

        // Fallback mit exakter CareMan-Koordinate, falls der erste Klick noch nicht ausgelöst hat
        if (!monthChanged) {
          const fallbackEl = document.elementFromPoint(coordX, arrowY);
          clickChevronAt(fallbackEl, coordX, arrowY);
          for (let w = 0; w < 16; w++) {
            await sleep(60);
            if ((getVisibleMonthHeaderInfo() || detectMonthYear()).yearMonth !== curInfo.yearMonth) {
              monthChanged = true;
              break;
            }
          }
        }

        if (monthChanged) {
          didStepMonth = true;
        }
        await sleep(45);
      }

      if (didStepMonth) {
        // Warte nach dem Monatswechsel, bis CareMan den Ladebalken (mat-progress-bar) beendet hat und die Planungsgruppen bereit sind
        await sleep(120);
        for (let w = 0; w < 90; w++) {
          await sleep(80);
          const isBusy = Boolean(document.querySelector('mat-progress-bar, .mat-progress-bar, [role="progressbar"]'));
          const curSig = getAbtTableSig();
          if (!isBusy && findPlanungsgruppeTrigger() && curSig && curSig !== sigBeforeMonthStep) break;
          if (!isBusy && w >= 15 && findPlanungsgruppeTrigger()) break;
        }
        await sleep(100);
      }
    }

    const detectedAfterNav = getVisibleMonthHeaderInfo() || detectMonthYear();
    // WICHTIG: Wenn auf dem Istplan gestartet wurde (oder per Auto-Pilot ein Zielmonat gewählt wurde), bleibt der Zielmonat IMMER fest auf dem Zielmonat!
    const yearMonth = (wasOnIstplan || Boolean(desiredAutoYm)) ? initialMonthInfo.yearMonth : detectedAfterNav.yearMonth;
    const monthLabel = (wasOnIstplan || Boolean(desiredAutoYm)) ? initialMonthInfo.monthLabel : detectedAfterNav.monthLabel;

    const getPopupScrollContainers = () => {
      const containers = new Set();
      const vis = getVisiblePgElements();
      vis.forEach(el => {
        let p = el.parentElement;
        while (p && p !== document.body && p !== document.documentElement) {
          if (!p.closest('table')) {
            const st = window.getComputedStyle(p);
            if (
              p.scrollHeight > p.clientHeight + 4 ||
              /(auto|scroll)/i.test(st.overflowY) ||
              (p.matches && p.matches('.mat-select-panel, .mat-mdc-select-panel, md-content, .md-select-menu-container, .cdk-virtual-scroll-viewport, [role="listbox"]'))
            ) {
              containers.add(p);
            }
          }
          p = p.parentElement;
        }
      });
      return Array.from(containers);
    };

    const findOptionInPopup = (pattern, pgTrigger) => {
      const triggerRect = pgTrigger ? pgTrigger.getBoundingClientRect() : null;
      const candidates = getVisiblePgElements().filter(el => {
        if (pgTrigger && (el === pgTrigger || pgTrigger.contains(el) || el.contains(pgTrigger))) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!pattern.test(txt)) return false;
        // Falls das geschlossene Trigger-Element an exakt derselben Y-Koordinate liegt und kein mat-option ist
        if (triggerRect && Math.abs(el.getBoundingClientRect().top - triggerRect.top) < 6 && !el.closest('mat-option, md-option, [role="option"], .cdk-overlay-container, .md-select-menu-container')) {
          return false;
        }
        return true;
      });

      const explicitOpt = candidates.find(el => el.matches('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li'));
      if (explicitOpt) return explicitOpt;
      return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
    };

    const openDropdown = async (pgTrigger) => {
      dismissBlockingDialogs();
      if (isPopupOpen()) return true;
      try { pgTrigger.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
      const rect = pgTrigger.getBoundingClientRect();
      const cx = rect.left + Math.min(Math.max(rect.width * 0.35, 24), 110);
      const cy = rect.top + rect.height / 2;
      const rawHit = document.elementFromPoint(cx, cy);
      const hitEl = (rawHit && (pgTrigger === rawHit || pgTrigger.contains(rawHit) || rawHit.contains(pgTrigger)))
        ? rawHit
        : (pgTrigger.querySelector('.mat-select-trigger, .mat-mdc-select-trigger, .mat-select-value') || pgTrigger);

      // Versuch 1: Nativer Einzel-Klick auf den sichtbaren Punkt im Dropdown
      if (hitEl && typeof hitEl.click === 'function') hitEl.click();
      await sleep(120);
      if (isPopupOpen()) return true;

      // Versuch 2: Klick auf das umschließende mat-select / trigger Element
      const selectBox = (hitEl && hitEl.closest && hitEl.closest('.mat-select-trigger, .mat-mdc-select-trigger, .md-select-value, mat-select, md-select, [role="combobox"], [role="listbox"]')) || pgTrigger;
      if (selectBox && selectBox !== hitEl && typeof selectBox.click === 'function') {
        selectBox.click();
        await sleep(140);
        if (isPopupOpen()) return true;
      }

      // Versuch 3: Vollständige MouseEvent-Sequenz (mousedown -> mouseup -> click)
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        try {
          hitEl.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
        } catch (e) {}
      });
      await sleep(140);
      if (isPopupOpen()) return true;

      // Versuch 4: Tastatur-Event (ArrowDown) auf dem fokussierten Dropdown
      const focusTarget = (hitEl && hitEl.closest && hitEl.closest('mat-select, md-select, [tabindex], [role="combobox"], [role="listbox"]')) || selectBox;
      if (focusTarget && focusTarget.focus) focusTarget.focus();
      if (focusTarget && focusTarget.dispatchEvent) {
        focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
      }
      await sleep(140);
      return isPopupOpen();
    };

    const TARGET_STATIONS = [
      { key: '61000', pattern: /61000.*Rettungswache\s+M[üu]nchen/i, station: 'Sendling', label: '61000 Rettungswache München' },
      { key: '61010', pattern: /61010.*Obersendling/i, station: 'Obersendling', label: '61010 Rettungswache Obersendling' },
      { key: '61300', pattern: /61300.*Hohenbrunn/i, station: 'Hohenbrunn', label: '61300 Rettungswache Hohenbrunn' }
    ];

    const rosters = [];

    for (let i = 0; i < TARGET_STATIONS.length; i++) {
      const target = TARGET_STATIONS[i];
      setStatus(`⚡ Lese Wache ${i + 1}/3: ${target.label}...`);

      // Prüfe bei Wache 1/3 (Sendling), ob diese Wache für den Zielmonat bereits geladen ist
      const currentSnap = extractVisibleTable(target.station, yearMonth, monthLabel);
      const tableUpdatedForMonth = !didStepMonth || getAbtTableSig() !== sigBeforeMonthStep;
      if (i === 0 && tableUpdatedForMonth && currentSnap.colleagues.length > 0 && currentSnap.detectedStation === 'Sendling') {
        rosters.push({ ...currentSnap, station: target.station });
        continue;
      }

      let stationExtracted = false;
      for (let attempt = 0; attempt < 2 && !stationExtracted; attempt++) {
        let pgTrigger = findPlanungsgruppeTrigger();
        for (let w = 0; w < 25 && !pgTrigger; w++) {
          await sleep(110);
          pgTrigger = findPlanungsgruppeTrigger();
        }
        if (!pgTrigger) break;

        let opened = await openDropdown(pgTrigger);
        if (!opened) {
          await sleep(200);
          pgTrigger = findPlanungsgruppeTrigger() || pgTrigger;
          opened = await openDropdown(pgTrigger);
        }
        if (!opened) continue;

        let matchOpt = findOptionInPopup(target.pattern, pgTrigger);

        // Falls Option noch nicht sichtbar: erst im Popup ganz nach oben scrollen, dann schrittweise nach unten!
        if (!matchOpt) {
          const scrollBoxes = getPopupScrollContainers();
          scrollBoxes.forEach(s => {
            s.scrollTop = 0;
            s.dispatchEvent(new Event('scroll'));
          });
          await sleep(90);
          matchOpt = findOptionInPopup(target.pattern, pgTrigger);

          for (let step = 0; step < 12 && !matchOpt; step++) {
            const boxes = getPopupScrollContainers();
            boxes.forEach(s => {
              s.scrollTop += 150;
              s.dispatchEvent(new Event('scroll'));
            });
            await sleep(80);
            matchOpt = findOptionInPopup(target.pattern, pgTrigger);
          }
        }

        if (matchOpt) {
          const prevSig = getAbtTableSig();
          try {
            const scrollBoxes = getPopupScrollContainers();
            scrollBoxes.forEach(sb => {
              if (sb.contains(matchOpt) && sb.getBoundingClientRect && matchOpt.getBoundingClientRect) {
                const sbRect = sb.getBoundingClientRect();
                const optRect = matchOpt.getBoundingClientRect();
                if (optRect.bottom > sbRect.bottom || optRect.top < sbRect.top) {
                  sb.scrollTop += (optRect.top - sbRect.top) - (sbRect.height / 2) + (optRect.height / 2);
                  sb.dispatchEvent(new Event('scroll'));
                }
              }
            });
            matchOpt.scrollIntoView({ block: 'nearest' });
          } catch (e) {}
          await sleep(40);
          matchOpt.click();
          await sleep(85);

          // Falls das Popup nach Klick auf den inneren Text noch offen ist, auf das mat-option Element klicken
          if (isPopupOpen()) {
            const optHost = matchOpt.closest('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, li') || matchOpt.parentElement;
            if (optHost && optHost !== matchOpt) {
              optHost.click();
              await sleep(85);
            }
          }

          // Warte bis CareMan den Ladebalken (mat-progress-bar) beendet hat (61000 hat ~120 Mitarbeiter und braucht ca. 5-8s Server-Ladezeit)
          await sleep(120);
          for (let w = 0; w < 240; w++) {
            await sleep(80);
            const isBusy = Boolean(document.querySelector('mat-progress-bar, .mat-progress-bar, [role="progressbar"]'));
            if (isBusy) continue;
            const newSig = getAbtTableSig();
            const checkSnap = extractVisibleTable(target.station, yearMonth, monthLabel);
            const sigChanged = Boolean(newSig && newSig !== prevSig);
            const validForMonth = !didStepMonth || Boolean(newSig && newSig !== sigBeforeMonthStep);
            if (checkSnap.colleagues.length > 0 && (checkSnap.detectedStation === target.station || sigChanged || (i === 0 && validForMonth && checkSnap.detectedStation === 'Sendling'))) {
              break;
            }
            if (w === 60 && !sigChanged && checkSnap.detectedStation !== target.station) {
              break;
            }
          }
          await sleep(90);

          const extracted = extractVisibleTable(target.station, yearMonth, monthLabel);
          if (extracted.colleagues.length > 0 && (extracted.detectedStation === target.station || getAbtTableSig() !== prevSig || attempt === 1)) {
            rosters.push({ ...extracted, station: target.station });
            stationExtracted = true;
          }
        } else {
          document.body.click();
          await sleep(150);
        }
      }
    }

    // Falls wir vom Istplan kamen und sowohl den 3-Wachen-Abteilungsdienstplan als auch Istplan-Schichten haben:
    // Ergänze eventuelle reine Istplan-Einträge (z.B. Lehrgänge wie LGI oder Wachen-übergreifende Dienste), ohne die Abteilungsdienstplan-Wachen zu überschreiben
    if (rosters.length > 0 && Object.keys(istplanShifts).length > 0) {
      let selfEntry = null;
      for (const r of rosters) {
        const found = (r.colleagues || []).find(c => c && c.name && /backhaus/i.test(c.name));
        if (found) {
          selfEntry = found;
          break;
        }
      }
      if (!selfEntry && rosters[0] && Array.isArray(rosters[0].colleagues)) {
        selfEntry = { name: 'Backhaus, Johannes', shifts: {} };
        rosters[0].colleagues.unshift(selfEntry);
      }
      if (selfEntry && selfEntry.shifts) {
        Object.entries(istplanShifts).forEach(([dayKey, codeVal]) => {
          const alreadyHasDay = rosters.some(r =>
            (r.colleagues || []).some(c => c && c.name && /backhaus/i.test(c.name) && c.shifts && c.shifts[dayKey])
          );
          if (!alreadyHasDay) {
            selfEntry.shifts[dayKey] = codeVal;
          }
        });
      }
    }

    if (rosters.length === 0) {
      const fallbackSingle = extractVisibleTable(null, yearMonth, monthLabel);
      if (fallbackSingle.colleagues.length > 0) {
        rosters.push(fallbackSingle);
      } else if (Object.keys(istplanShifts).length > 0) {
        rosters.push({
          extractedAt: Date.now(),
          yearMonth: initialMonthInfo.yearMonth,
          monthLabel: initialMonthInfo.monthLabel,
          station: 'Sendling',
          colleagues: [{ name: 'Backhaus, Johannes', shifts: istplanShifts }]
        });
      }
    }

    const payload = rosters.length > 1
      ? { multiStation: true, extractedAt: Date.now(), yearMonth, monthLabel, rosters, personalTimes }
      : { ...(rosters[0] || { yearMonth, monthLabel, station: 'Sendling', colleagues: [] }), personalTimes, extractedAt: Date.now() };

    await deliverPayload(payload, rosters, yearMonth, monthLabel);
  } catch (err) {
    banner.style.background = '#dc2626';
    setStatus('⚠️ Fehler: ' + err.message);
    setTimeout(() => banner.remove(), 6000);
  }
})();