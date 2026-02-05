import React from 'react';
import { APP_VERSION } from '../version';

export default function Analysis() {
    return (
        <div style={{ padding: '20px', color: 'white', textAlign: 'center' }}>
            <h1>Auswertung v{APP_VERSION}</h1>
            <p>Wenn du das liest, ist die Seite NICHT abgestürzt.</p>
            <p>Wir bauen die Analyse jetzt Stück für Stück wieder auf.</p>
        </div>
    );
}
