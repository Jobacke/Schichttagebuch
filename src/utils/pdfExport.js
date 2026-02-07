import jsPDF from 'jspdf';

// Helper to calculate duration
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
    const { label, stats, delta, target, filteredData, shiftTypes } = data;

    // Use landscape orientation for better table display
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPos = 20;
    const lineHeight = 7;
    const margin = 20;

    // Helper to add new page if needed
    const checkPageBreak = (requiredSpace = 10) => {
        if (yPos + requiredSpace > pageHeight - 20) {
            doc.addPage();
            yPos = 20;
            return true;
        }
        return false;
    };

    // Title
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.text('Schichttagebuch - Auswertung', margin, yPos);
    yPos += 10;

    // Period
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(label, margin, yPos);
    yPos += 10;

    // Divider
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, yPos, pageWidth - margin, yPos);
    yPos += 10;

    // Statistics Section
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Zusammenfassung', margin, yPos);
    yPos += 8;

    doc.setFontSize(11);
    doc.setFont(undefined, 'normal');

    // Stats box
    const statsBoxY = yPos;
    doc.setFillColor(245, 245, 245);
    doc.roundedRect(margin, statsBoxY, pageWidth - 2 * margin, 30, 3, 3, 'F');

    yPos += 8;
    doc.text(`Geleistete Stunden: ${stats.actual.toFixed(1)} h`, margin + 5, yPos);
    yPos += 7;
    doc.text(`Anzahl Schichten: ${stats.count}`, margin + 5, yPos);
    yPos += 7;
    doc.text(`Soll-Stunden: ${target.toFixed(1)} h`, margin + 5, yPos);
    yPos += 7;

    // Saldo with color
    const isPositive = delta >= 0;
    doc.setTextColor(isPositive ? 34 : 239, isPositive ? 197 : 68, isPositive ? 94 : 68);
    doc.setFont(undefined, 'bold');
    doc.text(`Saldo: ${delta > 0 ? '+' : ''}${delta.toFixed(1)} h`, margin + 5, yPos);
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');
    yPos += 12;

    // Distribution
    if (stats.distributionData && stats.distributionData.length > 0) {
        checkPageBreak(15 + stats.distributionData.length * 7);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Verteilung nach Schichtart', margin, yPos);
        yPos += 8;

        doc.setFontSize(11);
        doc.setFont(undefined, 'normal');

        stats.distributionData.forEach(item => {
            checkPageBreak();
            const percentage = ((item.value / stats.count) * 100).toFixed(1);
            doc.text(`${item.name}: ${item.value} (${percentage}%)`, margin + 5, yPos);
            yPos += 6;
        });
        yPos += 5;
    }

    // Detailed Shift List
    if (filteredData && filteredData.length > 0) {
        checkPageBreak(20);

        doc.setFontSize(14);
        doc.setFont(undefined, 'bold');
        doc.text('Schichten im Detail', margin, yPos);
        yPos += 10;

        // Table header - optimized for landscape with station column
        // Column positions for landscape (297mm width)
        const colDatum = margin + 3;
        const colSchichtart = margin + 35;
        const colZeit = margin + 80;
        const colWache = margin + 125;
        const colFahrzeug = margin + 175;
        const colStunden = margin + 235;

        doc.setFontSize(10);
        doc.setFont(undefined, 'bold');
        doc.setFillColor(249, 115, 22); // Orange
        doc.setTextColor(255, 255, 255);
        doc.roundedRect(margin, yPos - 5, pageWidth - 2 * margin, 8, 2, 2, 'F');

        doc.text('Datum', colDatum, yPos);
        doc.text('Schichtart', colSchichtart, yPos);
        doc.text('Zeit', colZeit, yPos);
        doc.text('Wache', colWache, yPos);
        doc.text('Fahrzeug', colFahrzeug, yPos);
        doc.text('Stunden', colStunden, yPos);
        yPos += 8;

        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, 'normal');

        // Sort by date
        const sortedShifts = [...filteredData].sort((a, b) => a.date.localeCompare(b.date));

        sortedShifts.forEach((shift, index) => {
            checkPageBreak(8);

            // Alternating row colors
            if (index % 2 === 0) {
                doc.setFillColor(250, 250, 250);
                doc.rect(margin, yPos - 5, pageWidth - 2 * margin, 7, 'F');
            }

            const shiftType = shiftTypes?.find(t => t.id === shift.typeId);
            const typeName = shiftType?.name || 'Unbekannt';
            const duration = calculateDuration(shift.startTime, shift.endTime);

            // Process vehicle name - extract only "71/X" format
            let vehicleName = shift.vehicle || '-';

            // Extract vehicle ID in format "71/1" or "71/2"
            // Match pattern: 71 followed by / and a single digit
            const vehicleMatch = vehicleName.match(/71\/(\d)/);
            if (vehicleMatch) {
                vehicleName = `71/${vehicleMatch[1]}`;
            } else {
                // Fallback: remove "RTW Akkon" and station name, keep what's left
                vehicleName = vehicleName.replace(/^RTW Akkon\s*/i, '');
                vehicleName = vehicleName.replace(/^(HBN|Sendling|Hauptwache|Nordwache|Südwache)\s*/i, '');
                vehicleName = vehicleName.trim();
                if (vehicleName.length > 25) {
                    vehicleName = vehicleName.substring(0, 22) + '...';
                }
            }

            // Station name
            const stationName = shift.station || '-';

            doc.text(formatDate(shift.date), colDatum, yPos);
            doc.text(typeName, colSchichtart, yPos);
            doc.text(`${shift.startTime} - ${shift.endTime}`, colZeit, yPos);
            doc.text(stationName, colWache, yPos);
            doc.text(vehicleName, colFahrzeug, yPos);
            doc.text(`${duration.toFixed(1)} h`, colStunden, yPos);

            yPos += 7;
        });
    }

    // Footer on last page
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    const footerText = `Erstellt am ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}`;
    doc.text(footerText, pageWidth / 2, pageHeight - 10, { align: 'center' });

    // Save PDF
    const fileName = `Schichttagebuch_${label.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(fileName);
}
