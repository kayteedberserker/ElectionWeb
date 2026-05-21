import React from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '../../utils/supabase/server';
import DashboardSidebar from '../../components/DashboardSidebar';

export const dynamic = 'force-dynamic';

export default async function DashboardRootLayout({ children }) {
    const supabase = await createClient();

    // Securely pull session information on the server layout container
    const { data: { user }, error } = await supabase.auth.getUser();

    // Instant server-side interception if unauthorized
    if (error || !user) {
        redirect('/login');
    }

    const userMetadata = {
        full_name: user.user_metadata?.full_name || 'AUTHENTICATED AGENT',
        role: user.user_metadata?.role || 'candidate',
        assigned_state: user.user_metadata?.assigned_state || null
    };

    // Server Action to securely terminate session tokens on the backend
    // Marking only this function as a Server Action
    async function handleSystemLogout() {
        'use server';
        const supabaseServer = await createClient();
        await supabaseServer.auth.signOut();
        redirect('/login');
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] relative font-sans text-[#111827] selection:bg-[#1E3A8A]/20">

            {/* Fixed Left-Hand Side Command Panel Component */}
            <DashboardSidebar
                userMetadata={userMetadata}
                onLogout={handleSystemLogout}
            />

            {/* Core Content Viewport */}
            <main className="pt-16 lg:pt-8 px-6 lg:pl-80 min-h-screen transition-all">
                {children}
            </main>
        </div>
    );
}