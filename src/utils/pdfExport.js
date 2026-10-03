import jsPDF from 'jspdf';

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

// Helper to format date
const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-').map(Number);
    if (!y || !m || !d) return '';
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export function exportToPDF(data) {
    const { label, stats, delta, target, filteredData, shiftTypes = [], shiftCodes = [] } = data;

    // Use landscape orientation for clean 1-page monthly duty roster view
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();   // 297 mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 210 mm
    const margin = 16;                                    // Printable width = 265 mm

    let yPos = 16;

    // Dynamic row height so monthly rosters fit on a single page
    const shiftCount = filteredData?.length || 0;
    const rowHeight = shiftCount > 24 ? 5.2 : shiftCount > 18 ? 5.6 : 6.0;

    // Helper to add new page if content exceeds available space
    const checkPageBreak = (requiredSpace = 8) => {
        if (yPos + requiredSpace > pageHeight - 14) {
            doc.addPage();
            yPos = 16;
            return true;
        }
        return false;
    };

    // --- Compact Executive Header ---
    // Title & Subtitle on Left
    doc.setFontSize(17);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Schichttagebuch - Auswertung', margin, yPos);

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 116, 139); // slate-500
    doc.text(label, margin, yPos + 6);

    // Compact KPI Badges on Right (Single-line cards)
    const kpiBoxX = pageWidth - margin - 140;
    const kpiBoxY = yPos - 3;
    const kpiBoxW = 140;
    const kpiBoxH = 13;

    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240); // slate-200
    doc.roundedRect(kpiBoxX, kpiBoxY, kpiBoxW, kpiBoxH, 2.5, 2.5, 'FD');

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
        doc.text(kpi.val, itemX, kpiBoxY + 10, { align: 'center' });
    });

    yPos = 33;

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 5;

    // Compact Distribution Line (Optional)
    if (stats.distributionData && stats.distributionData.length > 0) {
        const distParts = stats.distributionData.map(
            d => `${d.name}: ${d.value} (${((d.value / stats.count) * 100).toFixed(0)}%)`
        );
        doc.setFontSize(8.5);
        doc.setFont(undefined, 'normal');
        doc.setTextColor(100, 116, 139);
        doc.text(`Verteilung: ${distParts.join('   •   ')}`, margin, yPos);
        yPos += 6;
    }

    // --- Table "Schichten im Detail" ---
    if (filteredData && filteredData.length > 0) {
        doc.setFontSize(11);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(`Schichten im Detail (${shiftCount})`, margin, yPos);
        yPos += 8.5; // Generous breathing room between title and table header bar

        // Table Column Positions (with consecutive numbering and generous PartnerIn space)
        // Total available table width: 265 mm
        const colNr = margin + 2;          // ~11 mm width
        const colDatum = margin + 14;      // ~26 mm width (30 mm)
        const colKuerzel = margin + 41;    // ~24 mm width (57 mm)
        const colSchichtart = margin + 66; // ~40 mm width (82 mm)
        const colZeit = margin + 108;      // ~36 mm width (124 mm)
        const colPartner = margin + 146;   // ~118 mm width (162 mm -> plenty of room!)

        // Table Header Bar (Primary Brand Orange)
        doc.setFillColor(249, 115, 22);
        doc.roundedRect(margin, yPos - 4.5, pageWidth - 2 * margin, 7.5, 2, 2, 'F');

        doc.setFontSize(9.5);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Nr.', colNr, yPos);
        doc.text('Datum', colDatum, yPos);
        doc.text('Schichtkürzel', colKuerzel, yPos);
        doc.text('Schichtart', colSchichtart, yPos);
        doc.text('Zeit', colZeit, yPos);
        doc.text('PartnerIn', colPartner, yPos);
        yPos += 7.5;

        doc.setTextColor(15, 23, 42);
        doc.setFont(undefined, 'normal');

        // Sort shifts chronologically by date
        const sortedShifts = [...filteredData].sort((a, b) => a.date.localeCompare(b.date));

        sortedShifts.forEach((shift, index) => {
            checkPageBreak(rowHeight);

            // Alternating row background
            if (index % 2 === 0) {
                doc.setFillColor(248, 250, 252);
                doc.rect(margin, yPos - 4.2, pageWidth - 2 * margin, rowHeight, 'F');
            }

            // Derive shift details
            const shiftCodeObj = shiftCodes.find(c => c.id === shift.codeId || c.code === shift.code);
            const displayCode = shift.code || shiftCodeObj?.code || '-';

            const shiftTypeObj = shiftTypes.find(t => t.id === shift.typeId);
            const displayType = shift.shiftTypeName || shiftTypeObj?.name || 'Dienst';

            const partnerName = shift.partner ? String(shift.partner).trim() : '-';

            doc.setFontSize(9);
            // Consecutive numbering: 1, 2, 3...
            doc.setTextColor(100, 116, 139);
            doc.text(String(index + 1), colNr, yPos);

            doc.setTextColor(15, 23, 42);
            doc.text(formatDate(shift.date), colDatum, yPos);
            doc.setFont(undefined, 'bold');
            doc.text(displayCode, colKuerzel, yPos);
            doc.setFont(undefined, 'normal');
            doc.text(displayType, colSchichtart, yPos);
            doc.text(`${shift.startTime || '07:00'} - ${shift.endTime || '19:00'}`, colZeit, yPos);

            // PartnerIn: generous space (no truncating for regular partner names)
            doc.text(partnerName, colPartner, yPos);

            yPos += rowHeight;
        });
    }

    // --- Footer ---
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184); // slate-400
    const footerText = `Erstellt am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')} • Schichttagebuch`;
    doc.text(footerText, pageWidth / 2, pageHeight - 7, { align: 'center' });

    // Download PDF
    const fileName = `Schichttagebuch_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
}
