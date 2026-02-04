import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { StoreProvider } from './context/StoreContext';
import Layout from './components/Layout';
import Journal from './pages/Journal';
import Entry from './pages/Entry';
import Analysis from './pages/Analysis';
import Settings from './pages/Settings';

function App() {
  // Use HashRouter for GitHub Pages simplicity to avoid 404s on refresh 
  // without complex server config, although the KI mentions CNAME fix.
  // The KI suggests: <Router basename={import.meta.env.BASE_URL}> with BrowserRouter.
  // I will follow the KI instruction for BrowserRouter + basename.

  return (
    <StoreProvider>
      {/* 
         KI Recommendation: 
         <Router basename={import.meta.env.BASE_URL}>
         However, import { BrowserRouter as Router } ...
      */}
      <LayoutWrapper />
    </StoreProvider>
  );
}

import { BrowserRouter } from 'react-router-dom';

function LayoutWrapper() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Journal />} />
          <Route path="add" element={<Entry />} />
          <Route path="stats" element={<Analysis />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
