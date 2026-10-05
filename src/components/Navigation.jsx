import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Settings, PieChart, Users } from 'lucide-react';

import { APP_VERSION } from '../version';

export default function Navigation() {
    return (
        <nav className="nav-bar">
            {/* Version Indicator */}
            <div style={{ position: 'absolute', top: '-10px', left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
                <span style={{ fontSize: '9px', background: 'rgba(0,0,0,0.5)', padding: '2px 6px', borderRadius: '4px', color: '#fff' }}>
                    v{APP_VERSION}
                </span>
            </div>
            <NavItem to="/analysis" icon={PieChart} label="Daten" />
            <NavItem to="/journal" icon={LayoutDashboard} label="Journal" />
            <NavItem to="/team" icon={Users} label="Team" />
            <NavItem to="/add" icon={PlusCircle} label="Eintrag" />
            <NavItem to="/settings" icon={Settings} label="Optionen" />
        </nav>
    );
}

function NavItem({ to, icon: Icon, label }) {
    return (
        <NavLink to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Icon size={22} />
            <span>{label}</span>
        </NavLink>
    );
}
