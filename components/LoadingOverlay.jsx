// components/LoadingOverlay.jsx
import React from 'react';

export default function LoadingOverlay({ message = "Processing..." }) {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm animate-fade-in">
            <div className="relative flex items-center justify-center">
                {/* Processing Indicator */}
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-primary/20 border-t-primary"></div>
                <div className="absolute h-8 w-8 animate-pulse rounded-full bg-primary/10"></div>
            </div>
            <p className="mt-8 font-semibold text-textMain tracking-wide text-sm">
                {message}
            </p>
            <p className="mt-2 text-xs text-textMuted tracking-widest font-medium uppercase">
                Secure Connection
            </p>
        </div>
    );
}