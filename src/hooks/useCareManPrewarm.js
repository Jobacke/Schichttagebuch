import { useEffect } from 'react';
import { prewarmCareManCloud } from '../utils/oneClickCareManSync';

/**
 * Startet den Cloud-Autopilot vorab, sobald eine Seite mit „Dienstplan abrufen“ geöffnet
 * oder die App wieder in den Vordergrund geholt wird (Drosselung in prewarmCareManCloud).
 */
export default function useCareManPrewarm() {
  useEffect(() => {
    prewarmCareManCloud();
    const onVisible = () => {
      if (document.visibilityState === 'visible') prewarmCareManCloud();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
}
