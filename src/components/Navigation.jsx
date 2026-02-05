import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Settings, PieChart } from 'lucide-react';

export default function Navigation() {
    return (
        <nav className="nav-bar">
            <NavItem to="/" icon={LayoutDashboard} label="Journal" />
            <NavItem to="/analysis" icon={PieChart} label="Daten" />
            <NavItem to="/add" icon={PlusCircle} label="Eintrag" isMain />
            <NavItem to="/settings" icon={Settings} label="Optionen" />
        </nav>
    );
}

function NavItem({ to, icon: Icon, label, isMain }) {
    if (isMain) {
        return (
            <NavLink
                to={to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                style={{ marginTop: '-20px' }} // Float effect
            >
                <div style={{
                    background: 'var(--color-primary)',
                    borderRadius: '50%',
                    width: '56px',
                    height: '56px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 15px rgba(249, 115, 22, 0.4)'
                }}>
                    <Icon size={28} color="white" />
                </div>
                <span style={{ fontSize: '11px', marginTop: '4px' }}>{label}</span>
            </NavLink>
        );
    }

    return (
        <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={24} />
            <span>{label}</span>
        </NavLink>
    );
}
