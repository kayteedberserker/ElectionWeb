// components/LoadingOverlay.jsx
import React from 'react';

export default function LoadingOverlay({ message = "Processing secure request..." }) {
    return (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-in">
            <div className="relative flex items-center justify-center">
                {/* Elegant Luxury Rotating Rings */}
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-textMuted/20 border-t-primary"></div>
                <div className="absolute h-10 w-10 animate-ping rounded-full bg-primary/10"></div>
            </div>
            <p className="mt-6 font-semibold text-textMain tracking-wide text-sm animate-pulse">
                {message.toUpperCase()}
            </p>
            <p className="mt-1 text-xs text-textMuted tracking-wider font-medium">
                SECURE ELECTORAL ENVELOPE HANDSHAKE
            </p>
        </div>
    );
}