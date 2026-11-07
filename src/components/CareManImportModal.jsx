import React, { useState } from 'react';
import {
  X, Bookmark, Copy, ExternalLink, KeyRound, CheckCircle2, Zap
} from 'lucide-react';
import {
  BOOKMARKLET_CODE,
  openCareManLiveWindow
} from '../utils/oneClickCareManSync';
import { APP_VERSION } from '../version';

export default function CareManImportModal({
  isOpen,
  onClose,
  initialYearMonth
}) {
  const [copiedBookmarklet, setCopiedBookmarklet] = useState(false);
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('careman_login_user') || 'johannes.backhaus@johanniter.de';
    } catch {
      return 'johannes.backhaus@johanniter.de';
    }
  });
  const [password, setPassword] = useState(() => {
    try {
      return localStorage.getItem('careman_login_pass') || '';
    } catch {
      return '';
    }
  });
  const [savedCredentials, setSavedCredentials] = useState(false);

  if (!isOpen) return null;

  const handleSaveCredentials = () => {
    try {
      localStorage.setItem('careman_login_user', username.trim() || 'johannes.backhaus@johanniter.de');
      localStorage.setItem('careman_login_pass', password);
      setSavedCredentials(true);
      setTimeout(() => setSavedCredentials(false), 3000);
    } catch {
      /* ignore */
    }
  };

  const handleCopyBookmarklet = () => {
    navigator.clipboard.writeText(BOOKMARKLET_CODE);
    setCopiedBookmarklet(true);
    setTimeout(() => setCopiedBookmarklet(false), 3000);
  };

  const handleLaunchAutoPilot = () => {
    handleSaveCredentials();
    openCareManLiveWindow(initialYearMonth);
  };

  return (
    <div className="modal-overlay" style={{ alignItems: 'center' }} onClick={onClose}>
      <div
        className="modal-content"
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: '520px',
          borderRadius: '24px',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '90vh',
          overflowY: 'auto'
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
              <Zap size={20} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 'bold', color: 'var(--color-text-main)', textTransform: 'none' }}>
                CareMan Auto-Pilot & 3-Wachen-Sync
              </h2>
              <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                Rettungswache München (61000), Obersendling (61010) & Hohenbrunn (61300)
              </span>
            </div>
          </div>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Direct Auto-Pilot Launch Box */}
          <div style={{
            background: 'rgba(15, 23, 42, 0.85)',
            border: '1px solid rgba(16, 185, 129, 0.45)',
            borderRadius: '16px',
            padding: '15px'
          }}>
            <div style={{ fontSize: '13.5px', fontWeight: 800, color: '#34d399', marginBottom: '8px' }}>
              ⚡ Vollautomatischer Ablauf ({initialYearMonth || 'Ausgewählter Monat'})
            </div>
            <ol style={{
              margin: '0 0 12px 0',
              paddingLeft: '18px',
              fontSize: '12px',
              color: 'var(--color-text-muted)',
              lineHeight: 1.5,
              display: 'flex',
              flexDirection: 'column',
              gap: '3px'
            }}>
              <li>Öffnet <strong style={{ color: '#f8fafc' }}>my.secure.johanniter.de</strong>, trägt Benutzername & Passwort automatisch ein und klickt auf <strong style={{ color: '#f8fafc' }}>Anmelden</strong>.</li>
              <li>Du bestätigst nur manuell in <strong style={{ color: '#38bdf8' }}>Airlock 2FA</strong> auf dem Smartphone.</li>
              <li>Öffnet automatisch <strong style={{ color: '#f8fafc' }}>Dienstplan Bayern</strong> für den gewählten Monat, liest alle 3 Wachen + Teampartner aus und kehrt direkt in die App zurück.</li>
            </ol>

            <button
              type="button"
              onClick={handleLaunchAutoPilot}
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
              <span>⚡ Neueste Dienstpläne (3 Wachen) jetzt laden</span>
            </button>
          </div>

          {/* Local Auto-Fill Credentials Box */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)' }}>
                <KeyRound size={15} style={{ color: '#38bdf8' }} />
                <span>Login-Daten für automatisches Ausfüllen (nur lokal)</span>
              </div>
              {savedCredentials && (
                <span style={{ fontSize: '11.5px', color: '#34d399', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <CheckCircle2 size={13} /> Gespeichert
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Benutzername
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="johannes.backhaus@johanniter.de"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '9px',
                    border: '1px solid var(--color-border)',
                    background: 'rgba(15, 23, 42, 0.65)',
                    color: 'var(--color-text-main)',
                    fontSize: '12px'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                  Passwort (optional, lokal im Gerät)
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: '9px',
                    border: '1px solid var(--color-border)',
                    background: 'rgba(15, 23, 42, 0.65)',
                    color: 'var(--color-text-main)',
                    fontSize: '12px'
                  }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleSaveCredentials}
              className="team-roster-station-chip"
              style={{ alignSelf: 'flex-start', fontSize: '11.5px', padding: '6px 12px' }}
            >
              <span>{savedCredentials ? 'Zugangsdaten lokal gespeichert ✅' : 'Zugangsdaten lokal speichern'}</span>
            </button>
          </div>

          {/* Userscript & Bookmarklet Setup Box */}
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '16px',
            padding: '14px 16px'
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-text-main)', marginBottom: '6px' }}>
              0-Klick Auto-Pilot Userscript & 1-Klick Lesezeichen (v{APP_VERSION})
            </div>
            <p style={{ fontSize: '11.5px', color: 'var(--color-text-muted)', margin: '0 0 10px 0', lineHeight: 1.45 }}>
              Für 100% Vollautomatik ohne Lesezeichen-Klick (via Safari Userscripts / Tampermonkey) oder als 1-Klick-Lesezeichen in der Browserleiste:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px' }}>
              <a
                href="/careman-autopilot.user.js"
                target="_blank"
                rel="noopener noreferrer"
                className="team-roster-station-chip"
                style={{
                  fontSize: '11.5px',
                  padding: '7px 11px',
                  textDecoration: 'none',
                  background: 'rgba(14, 165, 233, 0.18)',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.45)',
                  fontWeight: 700
                }}
              >
                <Zap size={13} />
                <span>Auto-Pilot Userscript installieren</span>
              </a>
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
                <span>{copiedBookmarklet ? 'Code kopiert! ✅' : 'Code kopieren'}</span>
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
