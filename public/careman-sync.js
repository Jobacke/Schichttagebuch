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

          if (r.width < 22 || r.width > 280 || r.height < 8 || r.height > 75) continue;
          if (r.top < 8 || r.top > 360 || r.left < 15 || r.left > 580) continue;

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
        if (r.width < 22 || r.width > 280 || r.height < 8 || r.height > 75) return;
        if (r.top < 8 || r.top > 360 || r.left < 15 || r.left > 580) return;
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
        if (r.width < 22 || r.width > 280 || r.height < 8 || r.height > 75) return;
        if (r.top < 8 || r.top > 360 || r.left < 15 || r.left > 580) return;
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
        if (a.onPgRow !== b.onPgRow) return a.onPgRow ? -1 : 1;
        if (a.lcaDepth !== b.lcaDepth) return b.lcaDepth - a.lcaDepth;
        if (a.isTopmost !== b.isTopmost) return a.isTopmost ? -1 : 1;
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

              const stdPat = '(?:RF[MHO]|RS\d?[MHO]|RN[MHO]|RT[1-4]?[MHO]|RC[MHO]|RH[MHO]|FFO|NFO|DDM|T[1-4][MHO]|LGI|BDR)';
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

    const PG_ITEM_REGEX = /(\b61\s+Fahrzeugplanung|\b61\s+SKo|\b61\s+WL|\b61\d{3}\b)/i;

    const isElementVisible = (el, checkScrollClip = false) => {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width < 45 || rect.height < 12 || rect.height > 95) return false;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return false;
      const cy = rect.top + rect.height / 2;
      let cur = el;
      while (cur && cur !== document.body && cur !== document.documentElement) {
        const style = window.getComputedStyle(cur);
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1 || style.pointerEvents === 'none') {
          return false;
        }
        if (checkScrollClip && cur !== el && !(cur.closest && cur.closest('table'))) {
          const isScrollBox =
            cur.scrollHeight > cur.clientHeight + 4 ||
            /(auto|scroll|hidden)/i.test(style.overflowY) ||
            (cur.matches && cur.matches('.mat-select-panel, .mat-mdc-select-panel, md-content, .md-select-menu-container, .cdk-virtual-scroll-viewport, [role="listbox"]'));
          if (isScrollBox && cur.getBoundingClientRect) {
            const cr = cur.getBoundingClientRect();
            if (cr.height >= 60 && cr.height <= 680) {
              if (cy < cr.top + 2 || cy > cr.bottom - 2) return false;
            }
          }
        }
        cur = cur.parentElement;
      }
      return true;
    };

    const getVisiblePgElements = (checkScrollClip = false) => {
      return Array.from(document.querySelectorAll('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li, div, span')).filter(el => {
        if (el.closest('[data-careman-sync-banner], table')) return false;
        if (!isElementVisible(el, checkScrollClip)) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!txt || txt.length > 110) return false;
        return PG_ITEM_REGEX.test(txt);
      });
    };

    // Das Popup ist genau dann offen, wenn mindestens 3 verschiedene Zeilen (unterschiedliche Y-Positionen)
    // mit Planungsgruppen ("61 Fahrzeugplanung", "61 SKo", "61 WL", "61000...", etc.) gleichzeitig im sichtbaren Popup-Bereich liegen!
    const isPopupOpen = () => {
      const vis = getVisiblePgElements(true);
      const distinctY = new Set(vis.map(el => Math.round(el.getBoundingClientRect().top / 16)));
      if (distinctY.size < 3) return false;
      let hitCount = 0;
      for (const el of vis) {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + Math.min(40, r.width / 2), r.top + r.height / 2);
        if (!hit || !(hit.closest && hit.closest('table'))) hitCount++;
      }
      return hitCount >= 2;
    };

    // Universeller Finder für das geschlossene Dropdown "Filter Planungsgruppe"
    const findPlanungsgruppeTrigger = () => {
      const visPg = getVisiblePgElements()
        .filter(el => el.getBoundingClientRect().top < 340)
        .sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length);
      if (visPg.length > 0) {
        const inner = visPg[0];
        return inner.closest('mat-select, md-select, ng-select, select, .mat-select-trigger, .mat-mdc-select-trigger, [role="combobox"], [role="listbox"]') || inner;
      }

      const allSelects = Array.from(document.querySelectorAll(
        'mat-select, md-select, ng-select, select, [role="combobox"], [role="listbox"], .mat-select, .md-select, .ng-select'
      )).filter(isElementVisible);
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
        if (r.top < 15 || r.top > 340 || r.width < 30 || r.width > 240 || r.height < 6 || r.height > 40) return false;
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

    const personalTimes = {};
    const istplanShifts = {};
    const initialMonthInfo = detectMonthYear();
    const wasOnIstplan = !findPlanungsgruppeTrigger();

    // Falls wir auf dem persönlichen Istplan starten: Istplan-Schichten & Uhrzeiten (z.B. 19:14 - 23:06) vorab sichern
    if (wasOnIstplan) {
      try {
        const { yearMonth: istYm } = initialMonthInfo;
        const rawCells = Array.from(document.querySelectorAll('td, mat-grid-tile, div')).filter(c => {
          if (c.closest('[data-careman-sync-banner]')) return false;
          if (!c.getBoundingClientRect) return false;
          const r = c.getBoundingClientRect();
          if (r.width < 55 || r.width > 320 || r.height < 50 || r.height > 250) return false;
          const t = (c.innerText || '').trim();
          if (!/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/.test(t)) return false;
          // Wichtig: Uhrzeit vorher entfernen, damit NIEMALS die Startstunde (06, 14, 15, 22) im inneren grauen Kasten als Kalendertag erkannt wird!
          const withoutTime = t.replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g, '').trim();
          return /^([0-3]?\d)\b/.test(withoutTime);
        });
        const istCells = rawCells
          .filter(c => !rawCells.some(other => other !== c && c.contains(other)))
          .sort((a, b) => {
            const ra = a.getBoundingClientRect();
            const rb = b.getBoundingClientRect();
            return Math.round(ra.top / 30) - Math.round(rb.top / 30) || ra.left - rb.left;
          });

        istCells.forEach((cell, idx) => {
          const txt = (cell.innerText || '').trim();
          const withoutTime = txt.replace(/\d{2}:\d{2}\s*-\s*\d{2}:\d{2}/g, '').trim();
          const dayM = withoutTime.match(/^([0-3]?\d)\b/);
          const timeM = txt.match(/(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})/);
          if (!dayM || !timeM) return;
          const dNum = parseInt(dayM[1], 10);
          if (dNum < 1 || dNum > 31) return;
          // In den ersten 7 Zellen gehören Tage > 20 zum Vormonat; in den letzten 7 Zellen gehören Tage < 15 zum Folgemonat
          if (idx < 7 && dNum > 20) return;
          if (istCells.length >= 28 && idx >= istCells.length - 7 && dNum < 15) return;

          if (timeM[1] === '00:00' && timeM[2] === '00:00') return;

          const dStr = `${istYm}-${String(dNum).padStart(2, '0')}`;
          personalTimes[dStr] = { startTime: timeM[1], endTime: timeM[2] };
          const validShiftRegex = /^(RF[MHO]|RS\d?[MHO]|RN[MHO]|RT\d?[MHO]|RC[MHO]|RH[MHO]|FFO|NFO|DDM|T[1-4][MHO]|RDÜ?|BDR|LGI|ACLS|PALS|SMT|RAJ|SW\d?|RZF|R-SAN)\*?$/i;
          const lines = withoutTime.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean);
          const matchedIstCodes = [];
          for (let li = 1; li < lines.length; li++) {
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

      // Automatisch rechts im Menü auf den orangenen Button "Abteilungs-dienstplan" klicken
      const findAbtTile = (requireVisible = true) => {
        const candidates = Array.from(document.querySelectorAll('a, button, div, span, p, li')).filter(el => {
          if (el.closest('[data-careman-sync-banner]')) return false;
          const norm = (el.innerText || el.textContent || '').replace(/[\s\-\u00AD\u2010-\u2015]+/g, '').toLowerCase();
          if (norm !== 'abteilungsdienstplan' && !(norm.includes('abteilungs') && norm.includes('dienstplan') && norm.length < 55)) return false;
          if (!requireVisible) return true;
          if (!el.getBoundingClientRect) return false;
          const r = el.getBoundingClientRect();
          if (r.width < 16 || r.width > 240 || r.height < 10 || r.height > 220) return false;
          if (r.right <= 0 || r.left >= window.innerWidth) return false;
          const st = window.getComputedStyle(el);
          return st.display !== 'none' && st.visibility !== 'hidden' && parseFloat(st.opacity) >= 0.1;
        });
        return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
      };

      let abtEl = findAbtTile(true);
      if (!abtEl) {
        // Falls das rechte "⠿ Menü" noch eingeklappt ist: Menü-Button oben rechts in der CareMan-Leiste öffnen!
        const menuTriggerCandidates = Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, div, span')).filter(el => {
          if (el.closest('[data-careman-sync-banner]')) return false;
          const txt = (el.innerText || el.textContent || '').trim();
          const aria = ((el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('mattooltip'))) || '').trim();
          if (/^(Men[üu]|Menu|apps|grid_view|view_module|more_vert)$/i.test(txt) || /(Men[üu]|Menu|Apps)/i.test(aria)) return true;
          return false;
        });
        // Zusätzlich den ganz rechten Icon-Button in der oberen CareMan-Kopfleiste (rechts neben Kalender & Profil-Icon) prüfen
        const topRightProbe = document.elementFromPoint(window.innerWidth - 28, 32);
        if (topRightProbe && !topRightProbe.closest('[data-careman-sync-banner]')) {
          const topBtn = topRightProbe.closest('button, a, [role="button"], div') || topRightProbe;
          menuTriggerCandidates.push(topBtn);
        }
        for (const mBtn of menuTriggerCandidates) {
          try {
            const host = (mBtn.closest && mBtn.closest('button, a, [role="button"]')) || mBtn;
            if (host && typeof host.click === 'function') host.click();
          } catch (e) {}
          await sleep(320);
          abtEl = findAbtTile(true);
          if (abtEl) break;
        }
      }
      if (!abtEl) {
        abtEl = findAbtTile(false);
      }

      if (abtEl) {
        setStatus('⚡ Öffne Abteilungsdienstplan...');
        const r = abtEl.getBoundingClientRect ? abtEl.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
        const cx = r.left + r.width / 2;
        const iconAbove = (r.width > 0 && r.top > 20) ? document.elementFromPoint(cx, Math.max(10, r.top - 32)) : null;
        const tileContainer = abtEl.closest('button, a, [role="button"], li, mat-list-item, .mat-ripple') || abtEl.parentElement || abtEl;
        try {
          if (typeof tileContainer.click === 'function') tileContainer.click();
          if (typeof abtEl.click === 'function') abtEl.click();
          const innerBtn = tileContainer.querySelector && tileContainer.querySelector('button, a, [role="button"], .mat-icon, mat-icon, svg');
          if (innerBtn && typeof innerBtn.click === 'function') innerBtn.click();
        } catch (e) {}
        await sleep(550);
        if (!findPlanungsgruppeTrigger() && !window.location.href.includes('team-duty')) {
          try {
            const iconHost = iconAbove ? (iconAbove.closest('button, a, [role="button"], div, span') || iconAbove) : abtEl;
            if (iconHost && typeof iconHost.click === 'function') iconHost.click();
          } catch (e) {}
        }

        // Bis zu 4 Sekunden warten, ob der Abteilungsdienstplan lädt
        for (let w = 0; w < 16; w++) {
          await sleep(250);
          if (window.location.href.includes('team-duty') || findPlanungsgruppeTrigger()) break;
        }
      }
    }

    // Warte bis zu 5 Sekunden, bis das Dropdown "Filter Planungsgruppe" UND die Tabelle geladen sind
    for (let w = 0; w < 20; w++) {
      if (findPlanungsgruppeTrigger() && findAbteilungTable()) break;
      await sleep(250);
    }
    await sleep(350);

    const resolveClickableHost = (node) => {
      if (!node || (node.closest && node.closest('[data-careman-sync-banner]'))) return null;
      const svgRoot = node.closest ? node.closest('svg') : null;
      const base = (svgRoot && svgRoot.parentElement) ? svgRoot.parentElement : node;
      return (base.closest && base.closest('button, a, [role="button"], mat-icon, .mat-icon')) || base;
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

    // Falls wir vom Istplan kamen und CareMan im Abteilungsdienstplan einen anderen Monat geöffnet hat: Monat angleichen
    let didStepMonth = false;
    const sigBeforeMonthStep = getAbtTableSig();
    if (wasOnIstplan && findPlanungsgruppeTrigger()) {
      const [wantY, wantM] = initialMonthInfo.yearMonth.split('-').map(Number);
      for (let step = 0; step < 12; step++) {
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
        const coordX = diff < 0 ? Math.max(14, mr.left - 44) : Math.max(28, mr.left - 14);

        // Kombiniere DOM-Suche + horizontalen elementFromPoint-Scan links von mr.left
        const clusters = [];
        const addClusterCandidate = (rawEl) => {
          const host = resolveClickableHost(rawEl);
          if (!host || !host.getBoundingClientRect) return;
          if (curHeader?.el && (host === curHeader.el || host.contains(curHeader.el) || curHeader.el.contains(host))) return;
          const r = host.getBoundingClientRect();
          if (r.width < 6 || r.width > 64 || r.height < 6 || r.height > 64) return;
          const cy = r.top + r.height / 2;
          const cx = r.left + r.width / 2;
          if (Math.abs(cy - arrowY) > 26) return;
          if (cx < Math.max(6, mr.left - 105) || cx > mr.left - 2) return;
          const existing = clusters.find(c => Math.abs(c.cx - cx) < 12);
          if (!existing) {
            clusters.push({ host, cx, cy });
          } else if (host.matches && host.matches('button, a, [role="button"]')) {
            existing.host = host;
          }
        };

        Array.from(document.querySelectorAll('button, a, [role="button"], mat-icon, .mat-icon, i, svg, span, div')).forEach(addClusterCandidate);
        for (let probeX = Math.max(8, Math.round(mr.left - 96)); probeX <= Math.round(mr.left - 4); probeX += 4) {
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

        // Fallback mit exakter CareMan-Koordinate, falls der erste Klick noch nicht ausgelöst hat
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

        if (monthChanged) {
          didStepMonth = true;
        }
        await sleep(240);
      }

      if (didStepMonth) {
        // Warte nach dem Monatswechsel kurz, bis CareMan die Tabelle / Planungsgruppen für den Zielmonat geladen hat
        for (let w = 0; w < 18; w++) {
          await sleep(160);
          const curSig = getAbtTableSig();
          if (curSig && curSig !== sigBeforeMonthStep) break;
        }
        await sleep(300);
      }
    }

    const detectedAfterNav = getVisibleMonthHeaderInfo() || detectMonthYear();
    const abtReachedTargetMonth = !wasOnIstplan || detectedAfterNav.yearMonth === initialMonthInfo.yearMonth;
    // WICHTIG: Wenn auf dem Istplan gestartet wurde (z.B. Juli 2026), bleibt der Zielmonat IMMER fest auf dem Istplan-Monat!
    const yearMonth = wasOnIstplan ? initialMonthInfo.yearMonth : detectedAfterNav.yearMonth;
    const monthLabel = wasOnIstplan ? initialMonthInfo.monthLabel : detectedAfterNav.monthLabel;

    const getPopupScrollContainers = () => {
      const containers = new Set();
      const vis = getVisiblePgElements(false);
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
      Array.from(document.querySelectorAll('.mat-select-panel, .mat-mdc-select-panel, md-content, .md-select-menu-container, .cdk-virtual-scroll-viewport, [role="listbox"]')).forEach(p => {
        if (!p.closest('table') && p.getBoundingClientRect && p.getBoundingClientRect().height >= 40) {
          containers.add(p);
        }
      });
      return Array.from(containers);
    };

    const findOptionInPopup = (pattern, pgTrigger, requireInScrollView = false, fallbackPattern = null) => {
      const triggerRect = pgTrigger ? pgTrigger.getBoundingClientRect() : null;
      const filterFn = (pat) => getVisiblePgElements(requireInScrollView).filter(el => {
        if (pgTrigger && (el === pgTrigger || pgTrigger.contains(el) || el.contains(pgTrigger))) return false;
        const txt = (el.innerText || el.textContent || '').trim();
        if (!pat.test(txt)) return false;
        // Falls das geschlossene Trigger-Element an exakt derselben Y-Koordinate liegt und kein mat-option ist
        if (triggerRect && Math.abs(el.getBoundingClientRect().top - triggerRect.top) < 6 && !el.closest('mat-option, md-option, [role="option"], .cdk-overlay-container, .md-select-menu-container')) {
          return false;
        }
        return true;
      });

      let candidates = filterFn(pattern);
      if (candidates.length === 0 && fallbackPattern) {
        candidates = filterFn(fallbackPattern);
      }

      const explicitOpt = candidates.find(el => el.matches('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li'));
      if (explicitOpt) return explicitOpt;
      return candidates.sort((a, b) => a.querySelectorAll('*').length - b.querySelectorAll('*').length)[0] || null;
    };

    const centerOptionInPopup = async (optEl) => {
      if (!optEl) return;
      const scrollBoxes = getPopupScrollContainers();
      scrollBoxes.forEach(sb => {
        try {
          if (sb.contains(optEl) && sb.getBoundingClientRect && optEl.getBoundingClientRect) {
            const sbRect = sb.getBoundingClientRect();
            const optRect = optEl.getBoundingClientRect();
            const offset = (optRect.top - sbRect.top) - (sbRect.height / 2) + (optRect.height / 2);
            if (Math.abs(offset) > 8) {
              sb.scrollTop += offset;
              sb.dispatchEvent(new Event('scroll'));
            }
          }
        } catch (e) {}
      });
      try { optEl.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch (e) {}
      await sleep(160);
    };

    const clickPopupOption = async (matchOpt) => {
      if (!matchOpt) return;
      await centerOptionInPopup(matchOpt);
      const optHost = matchOpt.closest('mat-option, md-option, [role="option"], .mat-option, .md-option, .mat-mdc-option, .ng-option, li') || matchOpt;
      const r = (optHost.getBoundingClientRect ? optHost.getBoundingClientRect() : matchOpt.getBoundingClientRect());
      const cx = r.left + Math.min(Math.max(r.width * 0.4, 24), 120);
      const cy = r.top + r.height / 2;
      const hitEl = document.elementFromPoint(cx, cy);

      const fireOn = (el) => {
        if (!el || (el.closest && el.closest('table'))) return;
        try { if (typeof el.click === 'function') el.click(); } catch (e) {}
        if (el.dispatchEvent) {
          ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
            try {
              el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
            } catch (e) {}
          });
        }
      };

      fireOn(matchOpt);
      await sleep(120);
      if (isPopupOpen() && optHost && optHost !== matchOpt) {
        fireOn(optHost);
        await sleep(120);
      }
      if (isPopupOpen() && hitEl && hitEl !== matchOpt && hitEl !== optHost) {
        fireOn(hitEl);
        await sleep(120);
      }
    };

    const openDropdown = async (pgTrigger) => {
      if (isPopupOpen()) return true;
      const rect = pgTrigger.getBoundingClientRect();
      const cx = rect.left + Math.min(Math.max(rect.width * 0.35, 24), 110);
      const cy = rect.top + rect.height / 2;
      const hitEl = document.elementFromPoint(cx, cy) || pgTrigger;

      // Versuch 1: Nativer Einzel-Klick auf den sichtbaren Punkt im Dropdown
      if (hitEl && typeof hitEl.click === 'function') hitEl.click();
      await sleep(260);
      if (isPopupOpen()) return true;

      // Versuch 2: Klick auf das umschließende mat-select / trigger Element
      const selectBox = (hitEl && hitEl.closest && hitEl.closest('.mat-select-trigger, .mat-mdc-select-trigger, .md-select-value, mat-select, md-select, [role="combobox"], [role="listbox"]')) || pgTrigger;
      if (selectBox && typeof selectBox.click === 'function') {
        selectBox.click();
        await sleep(260);
        if (isPopupOpen()) return true;
      }

      // Versuch 3: Vollständige MouseEvent-Sequenz (mousedown -> mouseup -> click)
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
        try {
          (selectBox || hitEl).dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window, clientX: cx, clientY: cy }));
        } catch (e) {}
      });
      await sleep(260);
      if (isPopupOpen()) return true;

      // Versuch 4: Tastatur-Event (ArrowDown) auf dem fokussierten Dropdown
      const focusTarget = (hitEl && hitEl.closest && hitEl.closest('mat-select, md-select, [tabindex], [role="combobox"], [role="listbox"]')) || selectBox;
      if (focusTarget && focusTarget.focus) focusTarget.focus();
      if (focusTarget && focusTarget.dispatchEvent) {
        focusTarget.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40, which: 40, bubbles: true }));
      }
      await sleep(260);
      return isPopupOpen();
    };

    const TARGET_STATIONS = [
      { key: '61000', pattern: /61000.*Rettungswache\s+M[üu]nchen/i, fallbackPattern: /61000.*M[üu]nchen/i, station: 'Sendling', label: '61000 Rettungswache München' },
      { key: '61010', pattern: /61010.*Obersendling/i, fallbackPattern: /\b61010\b/i, station: 'Obersendling', label: '61010 Rettungswache Obersendling' },
      { key: '61300', pattern: /61300.*Hohenbrunn/i, fallbackPattern: /\b61300\b/i, station: 'Hohenbrunn', label: '61300 Rettungswache Hohenbrunn' }
    ];

    const rosters = [];

    for (let i = 0; i < TARGET_STATIONS.length && abtReachedTargetMonth; i++) {
      const target = TARGET_STATIONS[i];
      setStatus(`⚡ Lese Wache ${i + 1}/3: ${target.label}...`);

      const pgTriggerInitial = findPlanungsgruppeTrigger();
      const triggerTextInitial = pgTriggerInitial ? (pgTriggerInitial.innerText || pgTriggerInitial.textContent || '').trim() : '';
      const currentSnap = extractVisibleTable(target.station, yearMonth, monthLabel);
      const tableUpdatedForMonth = !didStepMonth || getAbtTableSig() !== sigBeforeMonthStep;

      // Nur überspringen, wenn im geschlossenen Dropdown-Trigger bereits exakt diese Planungsgruppe steht (oder bei Wache 1/3 Sendling bereits geladen ist)
      const isTriggerAlreadyTarget = target.pattern.test(triggerTextInitial) || (i === 0 && !/61\d{3}|61\s+/i.test(triggerTextInitial) && currentSnap.detectedStation === 'Sendling');
      if (tableUpdatedForMonth && currentSnap.colleagues.length > 0 && isTriggerAlreadyTarget) {
        rosters.push({ ...currentSnap, station: target.station });
        continue;
      }

      let stationSwitched = false;
      for (let attempt = 0; attempt < 2 && !stationSwitched; attempt++) {
        const pgTrigger = findPlanungsgruppeTrigger();
        if (!pgTrigger) break;

        const prevSig = getAbtTableSig();
        const opened = await openDropdown(pgTrigger);
        if (!opened) {
          await sleep(200);
          continue;
        }

        // Suche zuerst nach einer Option, die bereits im sichtbaren Scroll-Fenster des Popups liegt
        let matchOpt = findOptionInPopup(target.pattern, pgTrigger, true, target.fallbackPattern);

        // Falls im DOM vorhanden, aber noch unterhalb/oberhalb des sichtbaren Popup-Fensters (wie 61010 & 61300): gezielt in die Mitte scrollen!
        if (!matchOpt) {
          const domOpt = findOptionInPopup(target.pattern, pgTrigger, false, target.fallbackPattern);
          if (domOpt) {
            await centerOptionInPopup(domOpt);
            matchOpt = findOptionInPopup(target.pattern, pgTrigger, true, target.fallbackPattern) || domOpt;
          }
        }

        // Falls Option noch nicht im DOM oder noch nicht im sichtbaren Bereich: Popup von oben nach unten durchscrollen!
        if (!matchOpt) {
          const scrollBoxes = getPopupScrollContainers();
          scrollBoxes.forEach(s => {
            s.scrollTop = 0;
            s.dispatchEvent(new Event('scroll'));
          });
          await sleep(160);
          matchOpt = findOptionInPopup(target.pattern, pgTrigger, true, target.fallbackPattern) || findOptionInPopup(target.pattern, pgTrigger, false, target.fallbackPattern);

          for (let step = 0; step < 14 && !matchOpt; step++) {
            const boxes = getPopupScrollContainers();
            boxes.forEach(s => {
              s.scrollTop += 140;
              s.dispatchEvent(new Event('scroll'));
            });
            await sleep(150);
            matchOpt = findOptionInPopup(target.pattern, pgTrigger, true, target.fallbackPattern) || findOptionInPopup(target.pattern, pgTrigger, false, target.fallbackPattern);
          }
        }

        if (matchOpt) {
          await clickPopupOption(matchOpt);

          for (let w = 0; w < 32; w++) {
            await sleep(160);
            const newSig = getAbtTableSig();
            const curTrigger = findPlanungsgruppeTrigger();
            const curTriggerTxt = curTrigger ? (curTrigger.innerText || curTrigger.textContent || '').trim() : '';
            const triggerHasTarget = !isPopupOpen() && (target.pattern.test(curTriggerTxt) || (target.fallbackPattern && target.fallbackPattern.test(curTriggerTxt)));
            const checkSnap = extractVisibleTable(target.station, yearMonth, monthLabel);
            const sigChanged = Boolean(newSig && newSig !== prevSig);
            const validForMonth = !didStepMonth || Boolean(newSig && newSig !== sigBeforeMonthStep);
            if (checkSnap.colleagues.length > 0 && (sigChanged || triggerHasTarget || (validForMonth && checkSnap.detectedStation === target.station))) {
              stationSwitched = true;
              break;
            }
          }
          await sleep(300);
        } else {
          document.body.click();
          await sleep(150);
        }
      }

      const finalTrigger = findPlanungsgruppeTrigger();
      const finalTriggerTxt = finalTrigger ? (finalTrigger.innerText || finalTrigger.textContent || '').trim() : '';
      const triggerMatchesTarget = target.pattern.test(finalTriggerTxt) || (target.fallbackPattern && target.fallbackPattern.test(finalTriggerTxt));
      const extracted = extractVisibleTable(target.station, yearMonth, monthLabel);
      if (extracted.colleagues.length > 0 && (stationSwitched || triggerMatchesTarget || extracted.detectedStation === target.station)) {
        rosters.push({ ...extracted, station: target.station });
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
      const fallbackSingle = abtReachedTargetMonth ? extractVisibleTable(null, yearMonth, monthLabel) : { colleagues: [] };
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

    const json = JSON.stringify(payload);
    try { window.name = 'CAREMAN_SYNC:' + json; } catch (e) {}
    copySync(json);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try { await navigator.clipboard.writeText(json); } catch (e) {}
    }

    // WICHTIG: #careman= IMMER an die Ziel-URL anhängen (URL-Fragmente nach # werden nie an den HTTP-Server gesendet
    // und überleben den Cross-Origin-Wechsel von johanniter.de zu schicht.vjbackhaus.de auch bei großen 3-Wachen-Plänen zu 100%)!
    const encodedHash = encodeURIComponent(json);
    const targetUrl = 'https://schicht.vjbackhaus.de/?sync=' + Date.now() + '#careman=' + encodedHash;

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
  } catch (err) {
    banner.style.background = '#dc2626';
    setStatus('⚠️ Fehler: ' + err.message);
    setTimeout(() => banner.remove(), 6000);
  }
})();