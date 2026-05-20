// components/DashboardSidebar.jsx
'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function DashboardSidebar({ userMetadata, onLogout }) {
    const [isOpen, setIsOpen] = useState(false);
    const [isPending, startTransition] = useTransition();
    const pathname = usePathname();

    const userRole = userMetadata?.role;
    const userName = userMetadata?.full_name;

    const navigationLinks = {
        candidate: [
            { label: 'CAMPAIGN OVERVIEW', path: '/dashboard/candidate' },
            { label: 'RESULT COLLATION', path: '/dashboard/candidate/results' },
            { label: 'SUPERVISOR MANAGEMENT', path: '/dashboard/candidate/supervisors' },
            { label: 'LIVE OBSERVATION', path: '/dashboard/candidate/live-map' },
            { label: 'EDIT PROFILE', path: '/dashboard/candidate/profile' },
        ],
        lga_supervisor: [
            { label: 'LGA OVERVIEW', path: '/dashboard/lga' },
            { label: 'WARD COORDINATORS', path: '/dashboard/lga/coordinators' },
            { label: 'LIVE OBSERVATION', path: '/dashboard/lga/live-map' },
            { label: 'EDIT PROFILE', path: '/dashboard/lga/profile' },
        ],
        ward_supervisor: [
            { label: 'WARD STANDINGS', path: '/dashboard/ward' },
            { label: 'PU AGENTS', path: '/dashboard/ward/coordinators' },
            { label: 'LIVE OBSERVATION', path: '/dashboard/ward/live-map' },
            { label: 'EDIT PROFILE', path: '/dashboard/ward/profile' },
        ]
    };

    const activeLinks = navigationLinks[userRole] || [];

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
            {/* Mobile Trigger Header Bar (Hidden on Desktop) */}
            <header className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b-2 border-[#8A7968]/20 px-4 flex items-center justify-between z-40 shadow-sm">
                <div className="flex flex-col">
                    <span className="text-xs font-black tracking-tight text-[#291C14]">INEC PORTAL</span>
                    {userRole && (
                        <span className="text-[9px] font-bold text-[#9A6749] tracking-wider uppercase">
                            {userRole.replace('_', ' ')} PANEL
                        </span>
                    )}
                </div>
                <button
                    onClick={toggleSidebar}
                    className="p-2 border-2 border-[#8A7968]/30 rounded-xl bg-[#FAF6F0] text-[#291C14] font-bold text-xs uppercase tracking-wide"
                >
                    {isOpen ? 'Close Menu' : 'Open Menu'}
                </button>
            </header>

            {/* Backdrop Overlay for mobile slide-in tracking */}
            {isOpen && (
                <div
                    className="lg:hidden fixed inset-0 bg-[#291C14]/40 backdrop-blur-sm z-40 transition-opacity"
                    onClick={toggleSidebar}
                />
            )}

            {/* Main Navigation Sidebar Shell (Locked to the Left Side) */}
            <aside className={`
                fixed top-0 left-0 h-full w-72 bg-white border-r-2 border-[#8A7968]/20 p-6 z-50 shadow-xl
                transform transition-transform duration-300 ease-in-out flex flex-col justify-between
                lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}
                pt-24 lg:pt-8
            `}>
                <div>
                    {/* User Identity Section */}
                    <div className="mb-8 p-4 rounded-xl bg-[#FAF6F0] border-2 border-[#8A7968]/20">
                        <span className="text-[9px] font-mono font-bold tracking-widest text-[#8A7968] block uppercase">Active User</span>
                        <h4 className="text-sm font-black text-[#291C14] truncate uppercase">{userName || 'LOADING PROFILE...'}</h4>
                        {userRole && (
                            <span className="inline-block text-[10px] font-mono font-bold mt-1 text-[#9A6749] bg-[#9A6749]/10 px-2 py-0.5 rounded border border-[#9A6749]/20 uppercase">
                                {userRole.replace('_', ' ')}
                            </span>
                        )}
                    </div>

                    {/* Navigation Items Link List */}
                    <nav className="space-y-2">
                        <span className="text-[10px] font-bold tracking-widest text-[#8A7968] block mb-3 uppercase">Menu Options</span>
                        {activeLinks.map((node, index) => {
                            const isCurrentPath = pathname === node.path;
                            return (
                                <Link
                                    key={index}
                                    href={node.path}
                                    onClick={() => setIsOpen(false)}
                                    className={`block w-full text-left px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wider border-2 transition-all ${isCurrentPath
                                        ? 'bg-[#9A6749] text-white border-[#9A6749] shadow-sm'
                                        : 'bg-white text-[#291C14] border-[#8A7968]/10 hover:border-[#8A7968]/40 hover:bg-[#FAF6F0]'
                                        }`}
                                >
                                    {node.label}
                                </Link>
                            );
                        })}
                    </nav>
                </div>

                {/* Account Sign Out Section */}
                <div className="border-t-2 border-[#FAF6F0] pt-4">
                    <button
                        onClick={handleDisconnect}
                        disabled={isPending}
                        className="w-full bg-[#dc2626]/5 border-2 border-[#dc2626]/20 hover:border-[#dc2626]/50 text-[#dc2626] text-xs font-bold uppercase tracking-wider py-3 rounded-xl transition-all text-center disabled:opacity-50"
                    >
                        {isPending ? 'Logging out...' : 'Log Out Account'}
                    </button>
                </div>
            </aside>
        </>
    );
}