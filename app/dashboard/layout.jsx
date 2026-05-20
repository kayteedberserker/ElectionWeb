// app/dashboard/layout.jsx
import React from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '../../utils/supabase/server'; // Update this path to match your structure
import DashboardSidebar from '../../components/DashboardSidebar';
export const dynamic = 'force-dynamic';


export default async function DashboardRootLayout({ children }) {
    const supabase = await createClient();

    // Securely pull session information on the server layout container
    const { data: { user }, error } = await supabase.auth.getUser();

    // Instant server-side interception if unauthorized
    if (error || !user) {
        redirect('/auth/login');
    }

    const userMetadata = {
        full_name: user.user_metadata?.full_name || 'AUTHENTICATED AGENT',
        role: user.user_metadata?.role || 'candidate',
        assigned_state: user.user_metadata?.assigned_state || null
    };

    // Server Action to securely terminate session tokens on the backend
    const handleSystemLogout = async () => {
        'use server';
        const supabaseServer = await createClient();
        await supabaseServer.auth.signOut();
        redirect('/login');
    };

    return (
        <div className="min-h-screen bg-[#FAF6F0] relative">

            {/* Fixed Left-Hand Side Command Panel Component */}
            <DashboardSidebar
                userMetadata={userMetadata}
                onLogout={handleSystemLogout}
            />

            {/* Core Content Viewport: Offset left on desktop viewports to clear space for the sidebar layout */}
            <div className="pt-16 lg:pt-0 lg:pl-72 min-h-screen transition-all">
                {children}
            </div>
        </div>
    );
}