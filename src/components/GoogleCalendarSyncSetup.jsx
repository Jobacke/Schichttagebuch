import React, { useEffect, useState } from 'react';
import { X, Copy, Check, ExternalLink, Cloud, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  generateSecret,
  getAppsScriptCode,
  isValidScriptUrl,
  saveSyncConfig,
  testSyncConnection
} from '../utils/googleCalendarSync';

/**
 * One-time setup of the direct Google Calendar sync (overlay inside the export dialog).
 */
export default function GoogleCalendarSyncSetup({ uid, config, onSaved, onClose }) {
  const [secret, setSecret] = useState(config?.secret || '');
  const [scriptUrl, setScriptUrl] = useState(config?.scriptUrl || '');
  const [copied, setCopied] = useState(false);
  const [testState, setTestState] = useState('idle'); // idle | testing | ok | error
  const [testError, setTestError] = useState('');
  const [calendars, setCalendars] = useState([]);
  const [calendarId, setCalendarId] = useState(config?.calendarId || '');
  const [saving, setSaving] = useState(false);

  // Secret is created once and stored in the account, so the copied code always matches
  useEffect(() => {
    if (secret) return;
    const s = generateSecret();
    setSecret(s);
    saveSyncConfig(uid, { secret: s }).catch(() => {});
  }, [secret, uid]);

  const handleCopy = async () => {
    const code = getAppsScriptCode(secret);
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = code;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleTest = async () => {
    setTestState('testing');
    setTestError('');
    try {
      const list = await testSyncConnection(scriptUrl, secret);
      setCalendars(list);
      const preferred =
        list.find(c => c.id === calendarId) ||
        list.find(c => (c.name || '').toLowerCase() === 'familie') ||
        list[0];
      setCalendarId(preferred?.id || '');
      setTestState('ok');
    } catch (err) {
      setTestError(err?.message || String(err));
      setTestState('error');
    }
  };

  const handleSave = async () => {
    const cal = calendars.find(c => c.id === calendarId);
    if (!cal) return;
    setSaving(true);
    try {
      const next = await saveSyncConfig(uid, {
        secret,
        scriptUrl: scriptUrl.trim(),
        calendarId: cal.id,
        calendarName: cal.name
      });
      onSaved?.(next);
    } catch (err) {
      setTestError(`Speichern fehlgeschlagen: ${err?.message || err}`);
      setTestState('error');
    } finally {
      setSaving(false);
    }
  };

  const stepStyle = {
    background: 'rgb(var(--rgb-bg) / 0.55)',
    border: '1px solid rgb(var(--rgb-muted) / 0.14)',
    borderRadius: '12px',
    padding: '11px 13px',
    fontSize: '12.5px',
    lineHeight: 1.5,
    color: 'var(--c-text-soft)'
  };
  const numStyle = { color: 'var(--c-warning)', fontWeight: 800, marginRight: '6px' };
  const btn = (primary) => ({
    border: primary ? 'none' : '1px solid rgb(var(--rgb-muted) / 0.22)',
    background: primary
      ? 'linear-gradient(135deg, var(--c-warning) 0%, var(--c-warning-strong) 100%)'
      : 'var(--c-surface)',
    color: primary ? 'var(--c-bg)' : 'var(--c-text)',
    borderRadius: '10px',
    padding: '8px 12px',
    fontSize: '12.5px',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px'
  });
  const urlValid = isValidScriptUrl(scriptUrl);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgb(var(--rgb-deep) / 0.78)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 60
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--c-surface)',
          border: '1px solid rgb(var(--rgb-warning) / 0.35)',
          borderRadius: '18px',
          padding: '18px 20px',
          maxWidth: '540px',
          width: '100%',
          maxHeight: '88vh',
          overflowY: 'auto',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.6)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15.5px', fontWeight: 700, color: 'var(--c-text)', textTransform: 'none' }}>
            Google-Kalender direkt verbinden (einmalig)
          </h3>
          <button type="button" onClick={onClose} style={{ ...btn(false), padding: '6px' }} title="Schließen">
            <X size={16} />
          </button>
        </div>

        <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', lineHeight: 1.5 }}>
          Danach trägt die App deine Dienste mit einem Tipp direkt in deinen Google-Kalender ein – inkl. Ändern und Löschen.
          Am besten am Mac/PC einrichten.
        </div>

        <div style={stepStyle}>
          <span style={numStyle}>1</span>Skript-Code kopieren:
          <div style={{ marginTop: '8px' }}>
            <button type="button" onClick={handleCopy} disabled={!secret} style={btn(true)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Kopiert' : 'Code kopieren'}
            </button>
          </div>
        </div>

        <div style={stepStyle}>
          <span style={numStyle}>2</span>
          <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" style={{ color: 'var(--c-info)', fontWeight: 700 }}>
            script.google.com <ExternalLink size={11} style={{ verticalAlign: '-1px' }} />
          </a>{' '}
          öffnen (mit dem Google-Konto des Kalenders) → neues Projekt → vorhandenen Code löschen, kopierten Code einfügen → Speichern.
        </div>

        <div style={stepStyle}>
          <span style={numStyle}>3</span>
          <strong>Bereitstellen → Neue Bereitstellung</strong> → Typ <strong>Web-App</strong> → Ausführen als <strong>„Ich“</strong>,
          Zugriff <strong>„Jeder“</strong> → Bereitstellen → Zugriff autorisieren (bei „Google hat diese App nicht überprüft“:
          Erweitert → „… öffnen (unsicher)“ – es ist dein eigenes Skript) → <strong>Web-App-URL</strong> kopieren.
        </div>

        <div style={stepStyle}>
          <span style={numStyle}>4</span>Web-App-URL einfügen und testen:
          <div style={{ display: 'flex', gap: '6px', marginTop: '8px', flexWrap: 'wrap' }}>
            <input
              type="url"
              value={scriptUrl}
              onChange={(e) => { setScriptUrl(e.target.value); setTestState('idle'); }}
              placeholder="https://script.google.com/macros/s/…/exec"
              style={{
                flex: '1 1 240px',
                minWidth: 0,
                height: '36px',
                borderRadius: '10px',
                border: '1px solid rgb(var(--rgb-muted) / 0.25)',
                background: 'var(--c-bg)',
                color: 'var(--c-text)',
                padding: '0 10px',
                fontSize: '12.5px'
              }}
            />
            <button type="button" onClick={handleTest} disabled={!urlValid || testState === 'testing'} style={{ ...btn(false), opacity: urlValid ? 1 : 0.5 }}>
              {testState === 'testing' ? <RefreshCw size={14} className="spin-animation" /> : <Cloud size={14} />}
              Verbindung testen
            </button>
          </div>
          {scriptUrl && !urlValid && (
            <div style={{ marginTop: '6px', color: 'var(--c-orange)', fontSize: '12px' }}>
              Die Adresse muss mit https://script.google.com/macros/s/ beginnen und auf /exec enden.
            </div>
          )}
          {testState === 'error' && (
            <div style={{ marginTop: '8px', color: 'var(--c-danger)', fontSize: '12px', display: 'flex', gap: '6px' }}>
              <AlertTriangle size={14} style={{ flexShrink: 0 }} /> {testError}
            </div>
          )}
        </div>

        {testState === 'ok' && (
          <div style={stepStyle}>
            <span style={numStyle}>5</span>
            <span style={{ color: 'var(--c-success)', fontWeight: 700 }}>
              <CheckCircle2 size={13} style={{ verticalAlign: '-2px' }} /> Verbunden.
            </span>{' '}
            Ziel-Kalender wählen:
            <select
              value={calendarId}
              onChange={(e) => setCalendarId(e.target.value)}
              style={{
                display: 'block',
                width: '100%',
                marginTop: '8px',
                height: '36px',
                borderRadius: '10px',
                border: '1px solid rgb(var(--rgb-muted) / 0.25)',
                background: 'var(--c-bg)',
                color: 'var(--c-text)',
                padding: '0 10px',
                fontSize: '12.5px'
              }}
            >
              {calendars.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div style={{ marginTop: '10px' }}>
              <button type="button" onClick={handleSave} disabled={!calendarId || saving} style={btn(true)}>
                {saving ? <RefreshCw size={14} className="spin-animation" /> : <Check size={14} />}
                Speichern
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
