import { useState, useEffect } from 'react';
import { Server, Cpu, HardDrive, Activity, Plus, Terminal, Trash2 } from 'lucide-react';
import { StatCard } from '../components/widgets/StatCard';
import ConnectAgentModal from '../components/ConnectAgentModal';
import SpeedometerGauge from '../components/widgets/SpeedometerGauge';
import { useHost } from '../contexts/HostContext';

export const Servers = () => {
    const { refreshInterval } = useHost();
    const [agents, setAgents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const role = localStorage.getItem('role');

    const fetchAgents = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Authorization': `Bearer ${token}`
            };

            const res = await fetch('/api/v1/hosts', { headers });
            if (!res.ok) throw new Error("Failed to fetch hosts");

            const data = await res.json();

            // Handle case where API returns error object instead of array
            if (!Array.isArray(data)) {
                console.error("Expected array of hosts, got:", data);
                setAgents([]);
                return;
            }

            const detailedAgents = await Promise.all(data.map(async (hostObj) => {
                const hostname = hostObj.hostname;
                try {
                    const metricsRes = await fetch(`/api/v1/metrics/system?host=${hostname}`, { headers });
                    if (!metricsRes.ok) throw new Error("Failed to fetch metrics");

                    const metrics = await metricsRes.json();

                    // Determine online status (if metric is recent < 1 minute to match TopBar)
                    const lastSeen = new Date(metrics.timestamp);
                    const now = new Date();
                    const diff = now - lastSeen;
                    const isOnline = diff < 60000; // 1 minute in milliseconds

                    return {
                        hostname,
                        platform: metrics.host_info?.os || 'Linux',
                        arch: metrics.host_info?.arch || 'amd64',
                        cpu_percent: metrics.cpu_percent || 0,
                        mem_percent: metrics.memory_usage || 0,
                        disk_percent: metrics.disk_usage || 0,
                        last_seen: metrics.timestamp,
                        status: isOnline ? 'ONLINE' : 'OFFLINE'
                    };
                } catch (e) {
                    console.error('Error fetching metrics for', hostname, e);
                    return {
                        hostname,
                        platform: 'Unknown',
                        status: 'OFFLINE',
                        cpu_percent: 0,
                        mem_percent: 0,
                        disk_percent: 0,
                        last_seen: new Date().toISOString()
                    };
                }
            }));

            setAgents(detailedAgents);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAgents();
        const interval = setInterval(fetchAgents, refreshInterval);
        return () => clearInterval(interval);
    }, [refreshInterval]);

    const onlineCount = agents.filter(a => a.status === 'ONLINE').length;

    const deleteHost = async (hostname) => {
        if (!confirm(`Are you sure you want to remove ${hostname}? It will be hidden from the dashboard.`)) return;

        try {
            const res = await fetch(`/api/v1/hosts?host=${hostname}`, { method: 'DELETE' });
            if (res.ok) {
                setAgents(prev => prev.filter(a => a.hostname !== hostname));
            } else {
                alert("Failed to delete host");
            }
        } catch (err) {
            console.error(err);
            alert("Error deleting host");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-cyber-text tracking-tight flex items-center gap-2">
                        <Server size={24} className="text-blue-400" /> Server Infrastructure
                    </h1>
                    <p className="text-cyber-muted text-sm mt-1">
                        Monitor remote servers via Vast Agent
                    </p>
                </div>
                {role === 'admin' && (
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-lg shadow-blue-500/20"
                    >
                        <Plus size={18} /> Connect Server
                    </button>
                )}
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard
                    label="Active Agents"
                    value={onlineCount.toString()}
                    subValue={`Total: ${agents.length}`}
                    icon={Activity}
                    color="green"
                />
                <StatCard
                    label="Total CPU Load"
                    value={`${(agents.reduce((acc, curr) => acc + curr.cpu_percent, 0) / (agents.length || 1)).toFixed(1)}%`}
                    icon={Cpu}
                    color="cyan"
                />
                <StatCard
                    label="Avg Memory"
                    value={`${(agents.reduce((acc, curr) => acc + curr.mem_percent, 0) / (agents.length || 1)).toFixed(1)}%`}
                    icon={HardDrive}
                    color="violet"
                />
            </div>

            {/* Agent Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {agents.map((agent) => (
                    <div key={agent.hostname} className="glass-panel p-6 border border-cyber-gray/20 relative overflow-hidden group transition-all hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/10">
                        <div className={`absolute top-0 right-0 w-24 h-24 bg-${agent.status === 'ONLINE' ? 'green' : 'red'}-500/10 rounded-bl-full -mr-12 -mt-12 transition-all group-hover:scale-110`} />

                        <div className="flex justify-between items-start mb-6 relative z-10">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-lg bg-${agent.status === 'ONLINE' ? 'green' : 'red'}-500/20 text-${agent.status === 'ONLINE' ? 'green' : 'red'}-400`}>
                                    <Terminal size={24} />
                                </div>
                                <div className="group/title relative">
                                    <h3 className="text-lg font-bold text-cyber-text flex items-center gap-2">
                                        {agent.hostname}
                                        {role === 'admin' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); deleteHost(agent.hostname); }}
                                                className="opacity-0 group-hover/title:opacity-100 p-1 hover:bg-red-500/20 rounded text-red-500 transition-all"
                                                title="Remove Node"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </h3>
                                    <p className="text-xs text-cyber-muted font-mono">{agent.platform}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${agent.status === 'ONLINE' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                                }`}>
                                {agent.status}
                            </span>
                        </div>

                        <div className="grid grid-cols-3 gap-4">
                            <div className="flex flex-col items-center">
                                <SpeedometerGauge
                                    value={agent.cpu_percent}
                                    label="CPU"
                                    color="cyan"
                                    size={100}
                                />
                            </div>
                            <div className="flex flex-col items-center">
                                <SpeedometerGauge
                                    value={agent.mem_percent}
                                    label="RAM"
                                    color="violet"
                                    size={100}
                                />
                            </div>
                            <div className="flex flex-col items-center">
                                <SpeedometerGauge
                                    value={agent.disk_percent}
                                    label="DISK"
                                    color="amber"
                                    size={100}
                                />
                            </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-cyber-gray/20 flex justify-between items-center text-xs text-cyber-muted">
                            <span>{agent.platform} ({agent.arch})</span>
                            <span>Seen: {new Date(agent.last_seen).toLocaleTimeString()}</span>
                        </div>
                    </div>
                ))}

                {agents.length === 0 && !loading && (
                    <div className="col-span-full p-12 text-center text-cyber-muted border border-cyber-gray/20 border-dashed rounded-xl bg-cyber-gray/5">
                        <Server size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No agents connected.</p>
                        <p className="text-sm">Click "Connect Server" to deploy an agent.</p>
                    </div>
                )}
            </div>

            <ConnectAgentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
    );
};
