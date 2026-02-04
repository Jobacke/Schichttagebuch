import React from 'react';
import { NavLink } from 'react-router-dom';
import { List, PlusCircle, BarChart2, Settings } from 'lucide-react';

export default function Navigation() {
    const navItems = [
        { to: '/', icon: List, label: 'Journal' },
        { to: '/add', icon: PlusCircle, label: 'Eintrag', highlight: true },
        { to: '/stats', icon: BarChart2, label: 'Auswertung' },
        { to: '/settings', icon: Settings, label: 'Einstellungen' }
    ];

    return (
        <nav className="fixed bottom-0 left-0 right-0 h-[80px] glass-panel m-4 mb-2 flex justify-around items-center z-50">
            {navItems.map(({ to, icon: Icon, label, highlight }) => (
                <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `
            flex flex-col items-center justify-center p-2 rounded-xl transition-all
            ${isActive ? 'text-[var(--primary)]' : 'text-[var(--text-muted)]'}
            ${highlight && isActive ? 'scale-110' : ''}
          `}
                    style={{ textDecoration: 'none' }}
                >
                    {({ isActive }) => (
                        <>
                            <div className={`p-2 rounded-full ${highlight ? 'bg-[rgba(255,255,255,0.05)]' : ''} ${isActive && highlight ? 'bg-[var(--primary-glow)]' : ''}`}>
                                <Icon size={highlight ? 28 : 24} strokeWidth={isActive ? 2.5 : 2} />
                            </div>
                            <span className="text-xs mt-1 font-medium">{label}</span>
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    );
}
