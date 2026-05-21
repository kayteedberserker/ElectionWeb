'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    LayoutDashboard,
    BarChart3,
    Users,
    Map,
    Settings,
    LogOut,
    Menu,
    X,
    UserCircle
} from 'lucide-react';

export default function DashboardSidebar({ userMetadata, onLogout }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const pathname = usePathname();

    const userRole = userMetadata?.role;
    const userName = userMetadata?.full_name;

    // Professional navigation mapping
    const navigationLinks = {
        candidate: [
            { label: 'Dashboard', path: '/dashboard/candidate', icon: LayoutDashboard },
            { label: 'Result Analysis', path: '/dashboard/candidate/results', icon: BarChart3 },
            { label: 'LGA Management', path: '/dashboard/candidate/supervisors', icon: Users },
            { label: 'Real-Time Map', path: '/dashboard/candidate/live-map', icon: Map },
            { label: 'Account Settings', path: '/dashboard/candidate/profile', icon: Settings },
        ],
        lga_supervisor: [
            { label: 'LGA Overview', path: '/dashboard/lga', icon: LayoutDashboard },
            { label: 'Ward Coordination', path: '/dashboard/lga/coordinators', icon: Users },
            { label: 'Real-Time Map', path: '/dashboard/lga/live-map', icon: Map },
            { label: 'Account Settings', path: '/dashboard/lga/profile', icon: Settings },
        ],
        ward_supervisor: [
            { label: 'Ward Overview', path: '/dashboard/ward', icon: LayoutDashboard },
            { label: 'Agent Registry', path: '/dashboard/ward/coordinators', icon: Users },
            { label: 'Real-Time Map', path: '/dashboard/ward/live-map', icon: Map },
            { label: 'Account Settings', path: '/dashboard/ward/profile', icon: Settings },
        ]
    };

    const normalizedRole = userRole?.toLowerCase();
    const activeLinks = navigationLinks[normalizedRole] || navigationLinks[userRole] || [];

    const toggleSidebar = () => setIsOpen(!isOpen);

    const handleDisconnect = () => {
        setIsOpen(false);
        if (onLogout) {
            startTransition(async () => {
                await onLogout();
            });
        }
    };

    return (
        <>
            {/* Mobile Header */}
            <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-primary/10 px-4 flex items-center justify-between z-40">
                <div className="font-bold text-primary tracking-tight">NookPoll</div>
                <button onClick={toggleSidebar} className="p-2 text-primary">
                    {isOpen ? <X size={24} /> : <Menu size={24} />}
                </button>
            </header>

            {/* Backdrop */}
            {isOpen && (
                <div className="lg:hidden fixed inset-0 bg-textMain/20 backdrop-blur-sm z-40" onClick={toggleSidebar} />
            )}

            {/* Sidebar */}
            <aside className={`
                fixed top-0 left-0 h-full w-72 bg-white border-r border-primary/10 p-6 z-50 shadow-2xl
                transform transition-transform duration-300 ease-in-out flex flex-col justify-between
                lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                pt-24 lg:pt-8
            `}>
                <div>
                    {/* Brand Logo */}
                    <div className="mb-10 px-2">
                        <h1 className="text-2xl font-extrabold text-primary tracking-tighter">NookPoll</h1>
                        <p className="text-[10px] font-bold text-accent uppercase tracking-widest mt-1">Command System</p>
                    </div>

                    {/* Profile Section */}
                    <div className="mb-8 p-4 rounded-xl bg-background border border-primary/5">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-full text-primary">
                                <UserCircle size={24} />
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-xs font-bold text-textMuted uppercase">Active User</p>
                                <h4 className="text-sm font-bold text-textMain truncate">{userName || 'Loading...'}</h4>
                            </div>
                        </div>
                    </div>

                    {/* Navigation */}
                    <nav className="space-y-1">
                        <p className="text-[10px] font-bold text-textMuted uppercase tracking-widest px-4 mb-2">Modules</p>
                        {activeLinks.map((node, index) => {
                            const Icon = node.icon;
                            const isCurrentPath = pathname === node.path;
                            return (
                                <Link
                                    key={index}
                                    href={node.path}
                                    onClick={() => setIsOpen(false)}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${isCurrentPath
                                        ? 'bg-primary text-white shadow-lg'
                                        : 'text-textMuted hover:bg-background hover:text-primary'
                                        }`}
                                >
                                    <Icon size={18} />
                                    {node.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Sign Out */}
                <button
                    onClick={handleDisconnect}
                    disabled={isPending}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border border-danger/20 text-danger hover:bg-danger/5 transition-all text-sm font-bold"
                >
                    {isPending ? 'Signing Out...' : <> <LogOut size={16} /> Sign Out</>}
                </button>
            </aside>
        </>
    );
}