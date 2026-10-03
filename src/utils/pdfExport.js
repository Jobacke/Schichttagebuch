import jsPDF from 'jspdf';
import { SHIFT_PRESETS } from './shiftPresets';
import { getShiftColorRGB, STATION_THEMES } from './shiftColors';

// Helper to calculate duration (in hours)
function calculateDuration(start, end) {
    if (!start || !end) return 0;
    try {
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);
        let startMinutes = startH * 60 + startM;
        let endMinutes = endH * 60 + endM;
        if (endMinutes < startMinutes) endMinutes += 24 * 60;
        return (endMinutes - startMinutes) / 60;
    } catch { return 0; }
}

const resolveShiftDetails = (s, storeSettings, shiftCodes = [], shiftTypes = []) => {
    if (!s) return { code: '', rawCode: '', typeName: 'Dienst' };

    const codes = storeSettings?.shiftCodes || shiftCodes || [];
    const types = storeSettings?.shiftTypes || shiftTypes || [];

    const codeObj = codes.find(c => c.id === s.codeId || (s.code && c.code === s.code));
    const typeObj = types.find(t => t.id === s.typeId);

    let rawCode = s.code || codeObj?.code || '';
    if (!rawCode && s.codeId && typeof s.codeId === 'string' && s.codeId.startsWith('preset_')) {
        rawCode = s.codeId.replace('preset_', '');
    }

    const preset = rawCode ? (SHIFT_PRESETS[rawCode] || {}) : {};
    const rawType = s.shiftTypeName || typeObj?.name || codeObj?.shiftTypeName || preset.shiftTypeName || '';
    const station = s.station || preset.station || '';
    const vehicle = s.vehicle || preset.vehicle || '';

    let displayCode = rawCode;
    if (!displayCode) {
        if (rawType.toLowerCase().includes('spät')) displayCode = 'Spät';
        else if (rawType.toLowerCase().includes('früh')) displayCode = 'Früh';
        else if (rawType.toLowerCase().includes('nacht')) displayCode = 'Nacht';
        else if (rawType.toLowerCase().includes('tag')) displayCode = 'Tag';
        else displayCode = rawType ? rawType.slice(0, 4) : 'Schicht';
    }

    const colRGB = getShiftColorRGB(rawType, rawCode, station, vehicle);

    return {
        code: displayCode,
        rawCode,
        typeName: rawType || 'Dienst',
        station: station || colRGB.stationName,
        stationShort: colRGB.stationShort,
        colRGB
    };
};

export function exportToPDF(data) {
    const {
        label,
        stats,
        delta,
        target,
        filteredData = [],
        filterMode = 'month',
        baseDate = new Date(),
        storeSettings = {},
        shiftTypes = [],
        shiftCodes = []
    } = data;

    // Use landscape orientation for clean 1-page European monthly duty roster view
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();   // 297 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
    const margin = 14;                                    // Printable width = 269 mm

    // Group shifts by date string YYYY-MM-DD
    const shiftsByDate = {};
    filteredData.forEach(s => {
        if (!s.date) return;
        if (!shiftsByDate[s.date]) shiftsByDate[s.date] = [];
        shiftsByDate[s.date].push(s);
    });

    // --- Header Section ---
    const yTop = 13;
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Schichttagebuch - Monatsdienstplan', margin, yTop);

    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(249, 115, 22); // brand orange
    doc.text(label, margin, yTop + 6);

    const shiftCount = filteredData.length;
    const dateObj = baseDate ? new Date(baseDate) : new Date();
    const year = dateObj.getFullYear();
    const month = dateObj.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const shiftDaysCount = Object.keys(shiftsByDate).length;
    const freeDaysCount = Math.max(0, daysInMonth - shiftDaysCount);

    doc.setFontSize(8.5);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(`${shiftCount} Schichten   •   ${freeDaysCount} Tage frei   •   ${stats.actual.toFixed(1)} h geleistet`, margin, yTop + 11.5);

    // KPI Badges on the Top Right
    const kpiBoxW = 132;
    const kpiBoxH = 13.5;
    const kpiBoxX = pageWidth - margin - kpiBoxW;
    const kpiBoxY = yTop - 3.5;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(kpiBoxX, kpiBoxY, kpiBoxW, kpiBoxH, 2, 2, 'FD');

    const colW = kpiBoxW / 4;
    const isPositive = delta >= 0;
    const kpis = [
        { label: 'Geleistet', val: `${stats.actual.toFixed(1)} h`, color: [15, 23, 42] },
        { label: 'Soll', val: `${target.toFixed(1)} h`, color: [100, 116, 139] },
        { label: 'Saldo', val: `${delta > 0 ? '+' : ''}${delta.toFixed(1)} h`, color: isPositive ? [22, 163, 74] : [220, 38, 38] },
        { label: 'Schichten', val: `${stats.count}`, color: [15, 23, 42] }
    ];

    kpis.forEach((kpi, idx) => {
        const itemX = kpiBoxX + idx * colW + colW / 2;
        doc.setFontSize(7.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(kpi.label, itemX, kpiBoxY + 4.5, { align: 'center' });

        doc.setFontSize(9.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
        doc.text(kpi.val, itemX, kpiBoxY + 10.2, { align: 'center' });
    });

    // --- European Monthly Calendar Grid (Mo - So) ---
    const gridY = 28;
    const gridW = pageWidth - 2 * margin; // 269 mm
    const dayColW = gridW / 7;            // 38.43 mm

    // European weekday start: Monday = 0 ... Sunday = 6
    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const totalCells = firstDay + daysInMonth;
    const totalWeeks = Math.ceil(totalCells / 7);

    // Weekday Header Row
    const headerRowH = 6.5;
    const weekdays = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

    weekdays.forEach((wd, i) => {
        const hX = margin + i * dayColW;
        const isWknd = i >= 5;
        if (isWknd) {
            doc.setFillColor(255, 237, 213); // soft orange
            doc.setDrawColor(254, 215, 170);
        } else {
            doc.setFillColor(241, 245, 249); // slate-100
            doc.setDrawColor(226, 232, 240);
        }
        doc.rect(hX, gridY, dayColW, headerRowH, 'FD');

        doc.setFontSize(8.5);
        doc.setFont(undefined, 'bold');
        if (isWknd) {
            doc.setTextColor(234, 88, 12); // orange-600
        } else {
            doc.setTextColor(51, 65, 85); // slate-700
        }
        doc.text(wd, hX + dayColW / 2, gridY + 4.5, { align: 'center' });
    });

    // Calendar Day Cells
    const calendarBottomLimit = 196;
    const availableGridH = calendarBottomLimit - (gridY + headerRowH);
    const dayRowH = availableGridH / totalWeeks; // ~31.2 mm for 5 weeks, ~26.0 mm for 6 weeks

    for (let w = 0; w < totalWeeks; w++) {
        for (let col = 0; col < 7; col++) {
            const cellIndex = w * 7 + col;
            const dayNum = cellIndex - firstDay + 1;
            const cellX = margin + col * dayColW;
            const cellY = gridY + headerRowH + w * dayRowH;
            const isWeekend = col >= 5;

            // Outside Month
            if (dayNum < 1 || dayNum > daysInMonth) {
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.2);
                doc.rect(cellX, cellY, dayColW, dayRowH, 'FD');
                continue;
            }

            // Valid Day in Month
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
            const dayShifts = shiftsByDate[dateStr] || [];
            const hasShift = dayShifts.length > 0;

            if (!hasShift) {
                // Free Day
                if (isWeekend) {
                    doc.setFillColor(250, 250, 252);
                } else {
                    doc.setFillColor(255, 255, 255);
                }
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.25);
                doc.rect(cellX, cellY, dayColW, dayRowH, 'FD');

                // Day number
                doc.setFontSize(9.5);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(isWeekend ? 148 : 100, isWeekend ? 163 : 116, isWeekend ? 184 : 139);
                doc.text(String(dayNum), cellX + dayColW - 2.5, cellY + 5.2, { align: 'right' });

                // Subtle "Frei"
                doc.setFontSize(7);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(203, 213, 225);
                doc.text('Frei', cellX + 2.5, cellY + 5.2);
            } else {
                // Shift Day
                const s = dayShifts[0];
                const resolved = resolveShiftDetails(s, storeSettings, shiftCodes, shiftTypes);
                const colRGB = resolved.colRGB;

                // Background tint & border
                doc.setFillColor(colRGB.bgR, colRGB.bgG, colRGB.bgB);
                doc.setDrawColor(colRGB.borderR, colRGB.borderG, colRGB.borderB);
                doc.setLineWidth(0.35);
                doc.rect(cellX, cellY, dayColW, dayRowH, 'FD');

                // Top Accent Stripe
                doc.setFillColor(colRGB.r, colRGB.g, colRGB.b);
                doc.rect(cellX, cellY, dayColW, 2.0, 'F');

                // Day Number (Top Right)
                doc.setFontSize(10);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(15, 23, 42);
                doc.text(String(dayNum), cellX + dayColW - 2.5, cellY + 6.5, { align: 'right' });

                // Shift Badge (Top Left)
                doc.setFillColor(colRGB.r, colRGB.g, colRGB.b);
                doc.roundedRect(cellX + 2.2, cellY + 3.2, 17, 4.8, 1, 1, 'F');
                doc.setFontSize(8.5);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text(resolved.code, cellX + 10.7, cellY + 6.6, { align: 'center' });

                // Shift Type Name
                doc.setFontSize(7.5);
                doc.setFont(undefined, 'bold');
                doc.setTextColor(colRGB.r, colRGB.g, colRGB.b);
                doc.text(resolved.typeName, cellX + 2.5, cellY + 11.5);

                // Exact Shift Times & Duration
                const dur = calculateDuration(s.startTime, s.endTime);
                doc.setFontSize(7.5);
                doc.setFont(undefined, 'normal');
                doc.setTextColor(51, 65, 85);
                doc.text(`${s.startTime || '07:00'} - ${s.endTime || '19:00'} (${dur.toFixed(1)}h)`, cellX + 2.5, cellY + 15.5);

                // Station / Vehicle in station color
                const stText = s.station || s.vehicle || '';
                if (stText) {
                    doc.setFontSize(6.2);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(colRGB.r, colRGB.g, colRGB.b);
                    const truncSt = doc.splitTextToSize(stText, dayColW - 4.5)[0] || '';
                    doc.text(truncSt, cellX + 2.2, cellY + 18.5);
                }

                // Partner (Complete display, multi-line support)
                if (s.partner) {
                    const partnerClean = s.partner.trim().startsWith('mit ') ? s.partner.trim() : `mit ${s.partner.trim()}`;
                    doc.setFontSize(6.2);
                    doc.setFont(undefined, 'bold');
                    doc.setTextColor(51, 65, 85); // slate-700
                    const partnerLines = doc.splitTextToSize(partnerClean, dayColW - 4.5);
                    const pY = stText ? cellY + 21.8 : cellY + 19.2;
                    partnerLines.slice(0, 2).forEach((line, pIdx) => {
                        doc.text(line, cellX + 2.2, pY + pIdx * 2.8);
                    });
                }
            }
        }
    }

    // --- Footer: Legend on Left, Date & App on Right ---
    const footerY = 202;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, footerY - 4.5, pageWidth - margin, footerY - 4.5);

    // Legend items representing the independent station color structures
    const legendItems = [
        { label: 'Wache Sendling (Blau)', rgb: STATION_THEMES.Sendling.primaryRGB },
        { label: 'Wache Hohenbrunn (Grün)', rgb: STATION_THEMES.Hohenbrunn.primaryRGB },
        { label: 'Wache Obersendling (Orange)', rgb: STATION_THEMES.Obersendling.primaryRGB },
        { label: 'Dienstfrei', rgb: [148, 163, 184] }
    ];

    let legX = margin;
    doc.setFontSize(7.5);
    legendItems.forEach(item => {
        doc.setFillColor(item.rgb[0], item.rgb[1], item.rgb[2]);
        doc.rect(legX, footerY - 2.5, 3, 3, 'F');
        doc.setFont(undefined, 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(item.label, legX + 4.5, footerY);
        legX += doc.getTextWidth(item.label) + 12;
    });

    // Right-aligned footer info
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    const footerInfo = `Erstellt am ${new Date().toLocaleDateString('de-DE')} • Schichttagebuch`;
    doc.text(footerInfo, pageWidth - margin, footerY, { align: 'right' });

    // Download PDF
    const fileName = `Dienstplan_${label.replace(/\s+/g, '_')}.pdf`;
    doc.save(fileName);
}
