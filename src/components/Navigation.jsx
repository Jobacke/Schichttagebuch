import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, PlusCircle, Settings, PieChart, Users } from 'lucide-react';


export default function Navigation() {
    return (
        <nav className="nav-bar" aria-label="Hauptnavigation">
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
            {({ isActive }) => (
                <>
                    <Icon size={22} strokeWidth={isActive ? 2.4 : 2} />
                    <span>{label}</span>
                </>
            )}
        </NavLink>
    );
}
