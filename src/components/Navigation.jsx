import React from 'react';
import { NavLink } from 'react-router-dom';
import { BookOpen, Plus, BarChart2, Settings } from 'lucide-react';

export default function Navigation() {
    const navItems = [
        { to: '/', icon: BookOpen, label: 'Journal' },
        { to: '/add', icon: Plus, label: 'Neu', isFab: true }, // Special visuals for Add
        { to: '/stats', icon: BarChart2, label: 'Ausw.' },
        { to: '/settings', icon: Settings, label: 'Einstellungen' }
    ];

    return (
        <nav className="bottom-nav">
            {navItems.map(({ to, icon: Icon, label, isFab }) => (
                <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) =>
                        `nav-item ${isActive ? 'active' : ''}`
                    }
                >
                    {isFab ? (
                        <div style={{
                            backgroundColor: 'var(--primary)',
                            color: 'white',
                            borderRadius: '50%',
                            width: '48px',
                            height: '48px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 4px 10px rgba(249, 115, 22, 0.4)',
                            transform: 'translateY(-10px)'
                        }}>
                            <Icon size={24} strokeWidth={3} />
                        </div>
                    ) : (
                        <>
                            <Icon size={22} strokeWidth={2} />
                            <span className="nav-label">{label}</span>
                        </>
                    )}
                </NavLink>
            ))}
        </nav>
    );
}
