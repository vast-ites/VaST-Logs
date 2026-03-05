import React, { useState, useEffect } from 'react';
import { Server, Box, Cpu, HardDrive, Activity } from 'lucide-react';

const Infrastructure = () => {
    const [containers, setContainers] = useState([]);
    const [loading, setLoading] = useState(true);

    const fetchContainers = async () => {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/v1/metrics/containers', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setContainers(data || []);
            }
        } catch (err) {
            console.error("Failed to fetch containers", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchContainers();
        const interval = setInterval(fetchContainers, 2000);
        return () => clearInterval(interval);
    }, []);

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold font-display text-cyber-text flex items-center gap-3">
                    <Server className="text-cyber-magenta" />
                    Infrastructure Monitor
                </h1>
                <div className="flex gap-2">
                    <span className="px-3 py-1 bg-cyber-green/20 text-cyber-green rounded font-mono text-xs border border-cyber-green/30">
                        {containers.length} RUNNING
                    </span>
                    <span className="px-3 py-1 bg-cyber-gray/20 text-cyber-muted rounded font-mono text-xs border border-cyber-gray/30">
                        HOST: LOCAL
                    </span>
                </div>
            </div>

            {/* Container Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {containers.map((c) => (
                    <div key={c.id} className="glass-panel p-5 rounded-xl border border-cyber-gray relative group overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-50 group-hover:opacity-100 transition-opacity">
                            <Box className="text-cyber-magenta/20 group-hover:text-cyber-magenta/40" size={60} />
                        </div>

                        <div className="relative z-10">
                            <h3 className="text-lg font-bold text-cyber-text mb-1 truncate pr-8" title={c.name}>{c.name}</h3>
                            <p className="text-sm text-cyber-muted font-mono mb-4 truncate" title={c.image}>{c.image}</p>

                            <div className="space-y-3">
                                <div className="flex justify-between items-center text-xs font-mono">
                                    <span className="text-cyber-muted">STATE</span>
                                    <span className={`px-2 py-0.5 rounded ${c.state === 'running' ? 'bg-cyber-green/10 text-cyber-green' : 'bg-red-500/10 text-red-500'}`}>
                                        {c.state.toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-mono">
                                    <span className="text-cyber-muted">UPTIME</span>
                                    <span className="text-cyber-text">{c.status}</span>
                                </div>

                                <div className="h-px bg-cyber-gray/50 my-2" />

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-cyber-black/30 p-2 rounded">
                                        <div className="flex items-center gap-1 text-cyber-cyan mb-1">
                                            <Cpu size={12} /> <span className="text-[10px]">CPU</span>
                                        </div>
                                        <span className="text-lg font-bold font-mono text-cyber-text">{c.cpu.toFixed(1)}%</span>
                                    </div>
                                    <div className="bg-cyber-black/30 p-2 rounded">
                                        <div className="flex items-center gap-1 text-cyber-magenta mb-1">
                                            <Activity size={12} /> <span className="text-[10px]">MEM</span>
                                        </div>
                                        <span className="text-lg font-bold font-mono text-cyber-text">{Math.round(c.mem / 1024 / 1024)} MB</span>
                                    </div>
                                </div>

                                <div className="bg-cyber-black/30 p-2 rounded">
                                    <div className="flex items-center justify-between text-cyber-yellow mb-1">
                                        <span className="text-[10px] flex items-center gap-1"><Activity size={12} /> NET I/O</span>
                                        <span className="text-[10px] text-cyber-muted">RX / TX</span>
                                    </div>
                                    <div className="flex justify-between font-mono text-sm text-cyber-text">
                                        <span>{formatBytes(c.net_rx)}</span>
                                        <span>{formatBytes(c.net_tx)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}

                {containers.length === 0 && !loading && (
                    <div className="col-span-full py-12 text-center text-cyber-muted italic">
                        No active containers detected via Docker Socket.
                    </div>
                )}
            </div>
        </div>
    );
};

export default Infrastructure;
