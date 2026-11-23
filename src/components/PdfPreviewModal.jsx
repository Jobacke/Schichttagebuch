import React, { useEffect, useState, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
import {
    X, Share2, Download, ExternalLink, ZoomIn, ZoomOut,
    RotateCcw, FileText, Loader2, AlertCircle, Printer
} from 'lucide-react';
import { isIOSDevice, isStandalonePWA, canSharePdfFile } from '../utils/pdfExport';

// Configure local bundled PDF.js worker (no external CDN dependency, works offline & on iOS PWA)
if (typeof window !== 'undefined') {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

function formatFileSize(bytes) {
    if (!bytes || bytes < 1024) return `${bytes || 0} B`;
    return `${Math.round(bytes / 1024)} KB`;
}

export default function PdfPreviewModal({ pdfData, onClose }) {
    const [pages, setPages] = useState([]);
    const [rendering, setRendering] = useState(true);
    const [renderError, setRenderError] = useState(null);
    const [zoom, setZoom] = useState(1);
    const [statusMessage, setStatusMessage] = useState(null);
    const lastTapRef = useRef(0);

    const isIOS = isIOSDevice();
    const isStandalone = isStandalonePWA();
    const canShare = canSharePdfFile(pdfData?.file);

    // Lock background scroll & handle Escape key
    useEffect(() => {
        if (!pdfData) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.body.style.overflow = prevOverflow;
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [pdfData, onClose]);

    // Render generated PDF pages into high-DPI images via pdfjs-dist
    useEffect(() => {
        if (!pdfData?.arrayBuffer) return;

        let cancelled = false;
        let loadingTask = null;
        let pdfDoc = null;

        async function renderPdfPages() {
            setRendering(true);
            setRenderError(null);
            setPages([]);
            setZoom(1);

            try {
                // Ensure local bundled worker is active before loading document
                if (typeof window !== 'undefined') {
                    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
                }
                // Copy bytes so PDF.js worker transfer never detaches the original ArrayBuffer
                const bytes = new Uint8Array(pdfData.arrayBuffer.slice(0));
                loadingTask = pdfjsLib.getDocument({ data: bytes });
                pdfDoc = await loadingTask.promise;

                const renderedPages = [];
                // Scale 2.5 yields ~2105x1488 px for A4 landscape: razor-sharp on iPhone Retina & Desktop
                const renderScale = 2.5;

                for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
                    if (cancelled) return;
                    const page = await pdfDoc.getPage(pageNum);
                    const viewport = page.getViewport({ scale: renderScale });

                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d', { alpha: false });
                    canvas.width = Math.floor(viewport.width);
                    canvas.height = Math.floor(viewport.height);

                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);

                    await page.render({
                        canvasContext: ctx,
                        viewport
                    }).promise;

                    if (cancelled) return;
                    renderedPages.push({
                        pageNum,
                        dataUrl: canvas.toDataURL('image/png'),
                        width: viewport.width,
                        height: viewport.height
                    });
                }

                if (!cancelled) {
                    setPages(renderedPages);
                    setRendering(false);
                }
            } catch (err) {
                console.error('PDF preview render error:', err);
                if (!cancelled) {
                    setRenderError('Die Vorschau konnte nicht gerendert werden. Du kannst das PDF trotzdem direkt teilen oder öffnen.');
                    setRendering(false);
                }
            }
        }

        renderPdfPages();

        return () => {
            cancelled = true;
            if (loadingTask) {
                try { loadingTask.destroy(); } catch { /* ignore */ }
            }
            if (pdfDoc) {
                try { pdfDoc.destroy(); } catch { /* ignore */ }
            }
        };
    }, [pdfData]);

    if (!pdfData) return null;

    const showToast = (msg) => {
        setStatusMessage(msg);
        setTimeout(() => setStatusMessage(null), 3500);
    };

    const handleShare = async () => {
        if (!canShare || !pdfData.file) return;
        try {
            await navigator.share({
                files: [pdfData.file],
                title: pdfData.fileName
            });
        } catch (err) {
            if (err?.name !== 'AbortError') {
                console.warn('Share failed:', err);
                showToast('Teilen nicht verfügbar – bitte Herunterladen nutzen.');
            }
        }
    };

    const handleOpenInTab = () => {
        if (!pdfData.blobUrl) return;
        const win = window.open(pdfData.blobUrl, '_blank', 'noopener');
        if (!win) {
            showToast('Popup blockiert – bitte „Herunterladen“ oder „Teilen“ nutzen.');
        }
    };

    const handleDownload = () => {
        if (!pdfData.blobUrl) return;
        const link = document.createElement('a');
        link.href = pdfData.blobUrl;
        link.download = pdfData.fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast(`${pdfData.fileName} wird gespeichert…`);
    };

    const handlePrint = () => {
        if (!pdfData.blobUrl) return;
        // On iOS, native AirPrint is built into the Share Sheet
        if (isIOS && canShare) {
            handleShare();
            return;
        }
        const iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        iframe.src = pdfData.blobUrl;
        iframe.onload = () => {
            try {
                iframe.contentWindow?.focus();
                iframe.contentWindow?.print();
            } catch {
                window.open(pdfData.blobUrl, '_blank', 'noopener');
            }
            setTimeout(() => {
                if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
            }, 60000);
        };
        document.body.appendChild(iframe);
    };

    const handleImageTap = () => {
        const now = Date.now();
        if (now - lastTapRef.current < 300) {
            setZoom(prev => (prev > 1.05 ? 1 : 2));
        }
        lastTapRef.current = now;
    };

    const zoomIn = () => setZoom(prev => Math.min(3, Math.round((prev + 0.5) * 100) / 100));
    const zoomOut = () => setZoom(prev => Math.max(1, Math.round((prev - 0.5) * 100) / 100));
    const resetZoom = () => setZoom(1);

    // On iOS Standalone PWA, raw blob download/window.open triggers the broken "In <App> öffnen" sheet.
    // So in iOS Standalone PWA, we prioritize the in-app viewer + native iOS Share Sheet ("In Dateien sichern", "Drucken", "Bücher", etc.).
    const showBrowserActions = !(isIOS && isStandalone);

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 3000,
                background: 'rgba(2, 6, 23, 0.94)',
                backdropFilter: 'blur(8px)',
                display: 'flex',
                flexDirection: 'column',
                paddingTop: 'env(safe-area-inset-top)',
                paddingBottom: 'env(safe-area-inset-bottom)',
                animation: 'fadeIn 0.2s ease-out'
            }}
            role="dialog"
            aria-modal="true"
            aria-label={`PDF Vorschau ${pdfData.fileName}`}
        >
            {/* Header Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '12px 16px',
                background: '#0f172a',
                borderBottom: '1px solid #1e293b',
                flexShrink: 0
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'rgba(56, 189, 248, 0.14)',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        color: '#38bdf8',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}>
                        <FileText size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 700,
                            color: '#f8fafc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                        }}>
                            {pdfData.fileName}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                            PDF-Dokument • {formatFileSize(pdfData.sizeBytes)}
                        </div>
                    </div>
                </div>

                {/* Zoom Controls + Close */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '9px',
                        padding: '2px'
                    }}>
                        <button
                            type="button"
                            onClick={zoomOut}
                            disabled={zoom <= 1}
                            title="Verkleinern"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: zoom <= 1 ? '#475569' : '#e2e8f0',
                                padding: '6px',
                                cursor: zoom <= 1 ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ZoomOut size={16} />
                        </button>
                        <button
                            type="button"
                            onClick={resetZoom}
                            title="Zoom zurücksetzen"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#cbd5e1',
                                fontSize: '11px',
                                fontWeight: 700,
                                padding: '4px 6px',
                                cursor: 'pointer',
                                minWidth: '42px',
                                textAlign: 'center'
                            }}
                        >
                            {Math.round(zoom * 100)}%
                        </button>
                        <button
                            type="button"
                            onClick={zoomIn}
                            disabled={zoom >= 3}
                            title="Vergrößern"
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: zoom >= 3 ? '#475569' : '#e2e8f0',
                                padding: '6px',
                                cursor: zoom >= 3 ? 'default' : 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ZoomIn size={16} />
                        </button>
                    </div>

                    {zoom > 1 && (
                        <button
                            type="button"
                            onClick={resetZoom}
                            title="Ansicht einpassen"
                            style={{
                                background: '#1e293b',
                                border: '1px solid #334155',
                                color: '#94a3b8',
                                borderRadius: '9px',
                                padding: '8px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <RotateCcw size={15} />
                        </button>
                    )}

                    <button
                        type="button"
                        onClick={onClose}
                        title="Schließen"
                        aria-label="PDF Vorschau schließen"
                        style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#f8fafc',
                            borderRadius: '10px',
                            width: '36px',
                            height: '36px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer'
                        }}
                    >
                        <X size={20} />
                    </button>
                </div>
            </div>

            {/* Scrollable PDF Document Canvas Area */}
            <div style={{
                flex: 1,
                overflow: 'auto',
                WebkitOverflowScrolling: 'touch',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: zoom > 1 ? 'flex-start' : 'center',
                justifyContent: rendering || renderError ? 'center' : 'flex-start',
                gap: '16px',
                background: '#0b1120'
            }}>
                {rendering && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px',
                        color: '#94a3b8',
                        padding: '32px'
                    }}>
                        <Loader2 size={32} color="#38bdf8" style={{ animation: 'spin 1s linear infinite' }} />
                        <span style={{ fontSize: '14px', fontWeight: 600 }}>Dienstplan-PDF wird geladen…</span>
                    </div>
                )}

                {!rendering && renderError && (
                    <div style={{
                        maxWidth: '420px',
                        background: '#1e293b',
                        border: '1px solid #334155',
                        borderRadius: '16px',
                        padding: '20px',
                        textAlign: 'center',
                        color: '#cbd5e1'
                    }}>
                        <AlertCircle size={32} color="#f97316" style={{ marginBottom: '10px' }} />
                        <div style={{ fontSize: '14px', lineHeight: 1.5 }}>{renderError}</div>
                    </div>
                )}

                {!rendering && !renderError && pages.map(page => (
                    <div
                        key={page.pageNum}
                        onClick={handleImageTap}
                        style={{
                            width: `${zoom * 100}%`,
                            maxWidth: zoom === 1 ? '1150px' : 'none',
                            background: '#ffffff',
                            borderRadius: '8px',
                            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.55)',
                            overflow: 'hidden',
                            flexShrink: 0,
                            cursor: zoom > 1 ? 'zoom-out' : 'zoom-in',
                            transition: 'width 0.15s ease'
                        }}
                    >
                        <img
                            src={page.dataUrl}
                            alt={`${pdfData.fileName} – Seite ${page.pageNum}`}
                            style={{
                                display: 'block',
                                width: '100%',
                                height: 'auto',
                                userSelect: 'none',
                                WebkitTouchCallout: 'default'
                            }}
                        />
                    </div>
                ))}

                {!rendering && !renderError && isIOS && (
                    <div style={{
                        fontSize: '12px',
                        color: '#64748b',
                        textAlign: 'center',
                        paddingBottom: '4px',
                        width: '100%'
                    }}>
                        Doppeltippen zum Zoomen • Querformat für Vollbild
                    </div>
                )}
            </div>

            {/* Optional Toast */}
            {statusMessage && (
                <div style={{
                    position: 'fixed',
                    bottom: '86px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1e293b',
                    border: '1px solid #38bdf8',
                    color: '#f8fafc',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 600,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
                    zIndex: 3100,
                    whiteSpace: 'nowrap'
                }}>
                    {statusMessage}
                </div>
            )}

            {/* Footer Action Bar */}
            <div style={{
                padding: '12px 16px',
                background: '#0f172a',
                borderTop: '1px solid #1e293b',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                flexShrink: 0
            }}>
                {canShare && (
                    <button
                        type="button"
                        onClick={handleShare}
                        style={{
                            flex: isIOS ? '1 1 220px' : '0 1 auto',
                            maxWidth: isIOS ? '360px' : 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: 'linear-gradient(135deg, #0284c7, #38bdf8)',
                            color: '#ffffff',
                            border: 'none',
                            borderRadius: '12px',
                            padding: '12px 18px',
                            fontSize: '14px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(56, 189, 248, 0.3)'
                        }}
                    >
                        <Share2 size={18} />
                        <span>{isIOS ? 'Teilen / In Dateien sichern' : 'PDF teilen'}</span>
                    </button>
                )}

                {showBrowserActions && (
                    <button
                        type="button"
                        onClick={handleOpenInTab}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: canShare ? '#1e293b' : 'linear-gradient(135deg, #0284c7, #38bdf8)',
                            color: '#f8fafc',
                            border: canShare ? '1px solid #334155' : 'none',
                            borderRadius: '12px',
                            padding: '11px 16px',
                            fontSize: '13.5px',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        <ExternalLink size={17} />
                        <span>Im Browser öffnen</span>
                    </button>
                )}

                {(!isIOS || !canShare) && (
                    <button
                        type="button"
                        onClick={handleDownload}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            padding: '11px 16px',
                            fontSize: '13.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <Download size={17} />
                        <span>Herunterladen</span>
                    </button>
                )}

                {!isIOS && (
                    <button
                        type="button"
                        onClick={handlePrint}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            background: '#1e293b',
                            color: '#f8fafc',
                            border: '1px solid #334155',
                            borderRadius: '12px',
                            padding: '11px 16px',
                            fontSize: '13.5px',
                            fontWeight: 600,
                            cursor: 'pointer'
                        }}
                    >
                        <Printer size={17} />
                        <span>Drucken</span>
                    </button>
                )}
            </div>
        </div>
    );
}
