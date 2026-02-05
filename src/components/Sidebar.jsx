import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, BarChart2, FileText, Settings, Users, LogOut, X } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../context/AuthContext';

const Sidebar = ({ isOpen, onClose }) => {
    const { logout } = useAuth();
    const navItems = [
        { name: 'Dashboard', path: '/', icon: Home },
        { name: 'Analyze', path: '/analyze', icon: BarChart2 },
        { name: 'Reports', path: '/reports', icon: FileText },
        { name: 'Settings', path: '/settings', icon: Settings },
    ];

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden"
                    onClick={onClose}
                />
            )}

            {/* Sidebar */}
            <aside className={clsx(
                "w-64 bg-primary text-white flex flex-col h-screen fixed left-0 top-0 shadow-xl z-50 transition-transform duration-300 ease-in-out md:translate-x-0",
                isOpen ? "translate-x-0" : "-translate-x-full"
            )}>
                <div className="p-6 border-b border-white/10 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold flex items-center gap-2">
                            <Users className="w-8 h-8 text-blue-300" />
                            System
                        </h1>
                        <p className="text-xs text-blue-200 mt-1 uppercase tracking-wider">Audit & Security</p>
                    </div>
                    {/* Close button for mobile */}
                    <button onClick={onClose} className="md:hidden text-white/70 hover:text-white">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <nav className="flex-1 py-6 px-3 space-y-2">
                    {navItems.map((item) => (
                        <NavLink
                            key={item.path}
                            to={item.path}
                            onClick={() => onClose && onClose()} // Close sidebar on navigate (mobile)
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
        </>
    );
};

export default Sidebar;
