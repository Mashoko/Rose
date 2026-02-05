import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { Bell, User, Menu } from 'lucide-react';

const Layout = ({ children }) => {
    const [isSidebarOpen, setSidebarOpen] = useState(false);

    return (
        <div className="min-h-screen bg-background font-sans">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="md:ml-64 flex flex-col min-h-screen transition-all duration-300">
                {/* Top Header */}
                <header className="bg-white border-b border-gray-200 h-16 flex items-center justify-between px-4 md:px-8 sticky top-0 z-40 shadow-sm">
                    <div className="flex items-center gap-4">
                        <button
                            className="md:hidden p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <h2 className="text-xl font-semibold text-gray-800">
                            Overview
                        </h2>
                    </div>

                    <div className="flex items-center gap-4 md:gap-6">
                        <button className="relative p-2 text-gray-400 hover:text-primary transition-colors">
                            <Bell className="w-6 h-6" />
                            <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-secondary rounded-full border-2 border-white"></span>
                        </button>

                        <div className="flex items-center gap-3 pl-6 border-l border-gray-200">
                            <div className="text-right hidden md:block">
                                <p className="text-sm font-medium text-gray-900">Admin User</p>
                                <p className="text-xs text-gray-500">System Auditor</p>
                            </div>
                            <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center border border-gray-200 text-gray-600">
                                <User className="w-6 h-6" />
                            </div>
                        </div>
                    </div>
                </header>

                {/* Main Content */}
                <main className="flex-1 p-4 md:p-8 overflow-y-auto w-full">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default Layout;
