import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Capture #careman=... hash or window.name payload synchronously BEFORE React Router mounts or redirects
if (typeof window !== 'undefined') {
  try {
    if (window.location.hash && window.location.hash.startsWith('#careman=')) {
      const rawEncoded = window.location.hash.slice('#careman='.length);
      const decoded = decodeURIComponent(rawEncoded);
      if (decoded && decoded.length > 20) {
        try { sessionStorage.setItem('pending_careman_import', decoded); } catch {}
        try { localStorage.setItem('pending_careman_import', decoded); } catch {}
        try { sessionStorage.setItem('pending_careman_redirect_journal', '1'); } catch {}
      }
    }
    if (window.name && window.name.startsWith('CAREMAN_SYNC:')) {
      const rawJson = window.name.slice('CAREMAN_SYNC:'.length);
      window.name = '';
      if (rawJson && rawJson.length > 20) {
        try { sessionStorage.setItem('pending_careman_import', rawJson); } catch {}
        try { localStorage.setItem('pending_careman_import', rawJson); } catch {}
        try { sessionStorage.setItem('pending_careman_redirect_journal', '1'); } catch {}
      }
    }
  } catch (e) {
    console.warn('Early #careman capture warning:', e);
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
