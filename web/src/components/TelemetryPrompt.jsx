import React, { useState, useEffect } from 'react';
import { Activity } from 'lucide-react';

export default function TelemetryPrompt() {
    const [show, setShow] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token) return;

        fetch('/api/v1/settings', {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (data && data.telemetry_enabled === null) {
                    setShow(true);
                }
            });
    }, []);

    const handleSave = (agreed) => {
        const token = localStorage.getItem('token');

        // Fetch full config to save back
        fetch('/api/v1/settings', { headers: { 'Authorization': `Bearer ${token}` } })
            .then(res => res.json())
            .then(current => {
                current.telemetry_enabled = agreed;
                return fetch('/api/v1/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(current)
                });
            })
            .then(() => setShow(false));
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 bg-black/80 z-[100] flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-cyber-black border border-cyber-dim p-8 rounded-xl max-w-md w-full relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-cyber-cyan/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2" />

                <div className="flex items-center gap-3 mb-6 relative z-10">
                    <Activity className="text-cyber-cyan" size={28} />
                    <h2 className="text-xl font-bold font-display text-cyber-text">Improve VaST-Logs</h2>
                </div>

                <p className="text-cyber-muted text-sm mb-6 leading-relaxed relative z-10">
                    Would you like to share anonymous usage data? This helps us understand feature usage, catch errors, and improve the software over time.
                    <br /><br />
                    <strong className="text-cyber-text font-medium">No sensitive data, logs, or IPs are ever collected.</strong> You can change this anytime in Settings.
                </p>

                <div className="flex gap-4 mt-8 relative z-10">
                    <button onClick={() => handleSave(false)} className="flex-1 py-2.5 border border-cyber-dim text-cyber-muted hover:text-cyber-text rounded hover:bg-white/5 transition-colors text-sm font-medium">
                        NO THANKS
                    </button>
                    <button onClick={() => handleSave(true)} className="flex-1 py-2.5 bg-cyber-cyan/10 border border-cyber-cyan text-cyber-cyan hover:bg-cyber-cyan/20 hover:shadow-[0_0_15px_rgba(0,243,255,0.3)] rounded transition-all text-sm font-bold tracking-wide">
                        OPT IN
                    </button>
                </div>
            </div>
        </div>
    );
}
