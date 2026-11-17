import React from 'react';
import { Calendar } from 'lucide-react';

// Button „In Kalender übertragen“ – identisch in den Reitern „Mein Plan“ und „Journal“
export default function CalendarTransferButton({ onClick, count = 0, monthLabel = '' }) {
    const disabled = count === 0;
    const countText = `${count} ${count === 1 ? 'Dienst' : 'Dienste'}`;
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            style={{
                background: 'rgb(var(--rgb-warning) / 0.14)',
                color: 'var(--c-warning)',
                border: '1px solid rgb(var(--rgb-warning) / 0.38)',
                fontWeight: 800,
                padding: '8px 13px',
                borderRadius: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                fontSize: '12.5px',
                whiteSpace: 'nowrap',
                boxShadow: '0 3px 12px rgb(var(--rgb-warning) / 0.15)',
                transition: 'all 0.15s ease',
                flexShrink: 0
            }}
            title={disabled
                ? `Keine Dienste im ${monthLabel}`
                : `${countText} (${monthLabel}) in den Kalender übertragen`}
        >
            <Calendar size={15} />
            <span>In Kalender übertragen</span>
        </button>
    );
}
