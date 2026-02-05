import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, BarChart2, FileText, Settings, Users, LogOut } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const Sidebar = () => {
    const { logout } = useAuth();
    const navItems = [
        { name: 'Dashboard', path: '/', icon: Home },
        { name: 'Analyze', path: '/analyze', icon: BarChart2 },
        { name: 'Reports', path: '/reports', icon: FileText },
        { name: 'Settings', path: '/settings', icon: Settings },
    ];

    return (
        <aside className="w-64 bg-primary text-white flex flex-col h-screen fixed left-0 top-0 shadow-xl z-50">
            <div className="p-6 border-b border-white/10">
                <h1 className="text-2xl font-bold flex items-center gap-2">
                    <Users className="w-8 h-8 text-blue-300" />
                    System
                </h1>
                <p className="text-xs text-blue-200 mt-1 uppercase tracking-wider">Audit & Security</p>
            </div>

            <nav className="flex-1 py-6 px-3 space-y-2">
                {navItems.map((item) => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={({ isActive }) =>
                            clsx(
                                "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                                isActive
                                    ? "bg-white/10 text-white font-medium shadow-sm border-l-4 border-blue-400"
                                    : "text-blue-100 hover:bg-white/5 hover:text-white"
                            )
                        }
                    >
                        <item.icon className="w-5 h-5" />
                        <span>{item.name}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t border-white/10">
                <button
                    onClick={logout}
                    className="flex items-center gap-3 px-4 py-3 w-full text-blue-100 hover:text-red-300 hover:bg-white/5 rounded-lg transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
