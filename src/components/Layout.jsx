import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

export default function Layout() {
    return (
        <div className="bg-[var(--bg-dark)] min-h-screen pb-24">
            <main className="page-container pt-6">
                <Outlet />
            </main>
            <Navigation />
        </div>
    );
}
