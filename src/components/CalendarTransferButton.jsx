import React from 'react';
import { Calendar } from 'lucide-react';

// Button „Kalenderübertrag“ – identisch in den Reitern „Mein Plan“ und „Journal“
export default function CalendarTransferButton({ onClick, count = 0, monthLabel = '' }) {
    const disabled = count === 0;
    const countText = `${count} ${count === 1 ? 'Dienst' : 'Dienste'}`;
    return (
        <button
            type="button"
            className="action-btn-compact action-btn-calendar"
            onClick={onClick}
            disabled={disabled}
            style={{
                background: 'rgb(var(--rgb-warning) / 0.14)',
                color: 'var(--c-warning)',
                border: '1px solid rgb(var(--rgb-warning) / 0.38)',
                fontWeight: 800,
                padding: '8px 12px',
                borderRadius: '11px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                fontSize: '12.5px',
                lineHeight: 1.15,
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 10px rgb(var(--rgb-warning) / 0.14)',
                transition: 'all 0.15s ease',
                flexShrink: 0
            }}
            title={disabled
                ? `Keine Dienste im ${monthLabel}`
                : `${countText} (${monthLabel}) in den Kalender übertragen`}
        >
            <Calendar size={14} style={{ flexShrink: 0 }} />
            <span>Kalenderübertrag</span>
        </button>
    );
}
