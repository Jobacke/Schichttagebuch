import React, { useState } from 'react';
import {
  X, Bookmark, Copy, ExternalLink
} from 'lucide-react';
import {
  BOOKMARKLET_CODE,
  openCareManLiveWindow
} from '../utils/oneClickCareManSync';
import { APP_VERSION } from '../version';

export default function CareManImportModal({
  isOpen,
  onClose
}) {
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);

  if (!isOpen) return null;

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 3000);
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '500px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: '18px 22px', borderBottom: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              borderRadius: '12px',
              padding: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Bookmark size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 'bold', color: 'var(--color-text-main)', textTransform: 'none' }}>
                CareMan 1-Klick & Lesezeichen
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                3 Wachen (61000, 61010, 61300) & eigene Dienste inkl. PartnerIn
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Direct Launch Box */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            borderRadius: '16px',
            padding: '16px'
          }}>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#34d399', marginBottom: '8px' }}>
              ⚡ Ablauf: Aus der App direkt nach CareMan & zurück
            </div>
            <ol style={{
              margin: '0 0 14px 0',
              paddingLeft: '18px',
              fontSize: '12.5px',
              color: 'var(--color-text-muted)',
              lineHeight: 1.55,
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <li>Unten oder oben in der App auf <strong style={{ color: '#f8fafc' }}>„CareMan öffnen“</strong> klicken und im Johanniter-Portal anmelden.</li>
              <li>Im Dienstplan den gewünschten Monat wählen und oben in der Browser-Lesezeichenleiste auf <strong style={{ color: '#34d399' }}>„⚡ CareMan 1-Klick“</strong> klicken.</li>
              <li>Alle 3 Wachen sowie deine persönlichen Dienste inkl. PartnerIn werden vollautomatisch in die App übertragen.</li>
            </ol>

            <button
              type="button"
              onClick={() => openCareManLiveWindow()}
              style={{
                width: '100%',
                background: 'linear-gradient(135deg, #059669, #10b981)',
                color: '#ffffff',
                border: '1px solid rgba(52, 211, 153, 0.55)',
                borderRadius: '12px',
                padding: '11px 16px',
                fontSize: '13.5px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
              }}
            >
              <ExternalLink size={16} />
              <span>CareMan jetzt öffnen</span>
            </button>
          </div>

          {/* Bookmarklet Setup Box */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '14px 16px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '6px' }}>
              Browser-Lesezeichen einrichten / aktualisieren
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', margin: '0 0 12px 0', lineHeight: 1.45 }}>
              Ziehe diesen grünen Button mit gedrückter Maustaste in deine Browser-Lesezeichenleiste (oder kopiere den Code):
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <a
                ref={el => { if (el) el.setAttribute('href', BOOKMARKLET_CODE); }}
                className="team-roster-bookmarklet-link"
                title="Mit gedrückter Maustaste in die Lesezeichenleiste ziehen"
                onClick={e => {
                  e.preventDefault();
                  handleCopyBookmarklet();
                }}
              >
                <Bookmark size={14} />
                <span>{copiedBookmarklet ? 'Lesezeichen kopiert! ✅' : `⚡ CareMan 1-Klick (v${APP_VERSION})`}</span>
              </a>
              <button
                type="button"
                onClick={handleCopyBookmarklet}
                className="team-roster-station-chip"
                style={{ fontSize: '11.5px', padding: '7px 11px' }}
              >
                <Copy size={13} />
                <span>{copiedBookmarklet ? 'Code kopiert! ✅' : 'Lesezeichen-Code kopieren'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="modal-footer" style={{ padding: '14px 22px', background: 'var(--color-surface)', borderTop: '1px solid var(--color-border)' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ width: '100%' }}
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
