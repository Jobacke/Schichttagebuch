import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

export default function Layout() {
    return (
        <div className="app-container">
            <main style={{ flex: 1, width: '100%', maxWidth: '600px', margin: '0 auto' }}>
                <Outlet />
            </main>
            <Navigation />
        </div>
    );
}
