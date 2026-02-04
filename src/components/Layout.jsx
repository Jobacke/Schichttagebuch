import React from 'react';
import { Outlet } from 'react-router-dom';
import Navigation from './Navigation';

export default function Layout() {
    return (
        <>
            <main className="page-content animate-in">
                <Outlet />
            </main>
            <Navigation />
        </>
    );
}
