import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useHost } from '../contexts/HostContext';
import { Network, Activity, Search, Server, ArrowRight, X, Clock, Shield, AlertTriangle, Settings, Zap, BellRing } from 'lucide-react';

const Connections = () => {
    const { selectedHost } = useHost();
    const navigate = useNavigate();
    const [summary, setSummary] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedPort, setSelectedPort] = useState(null);
    const [details, setDetails] = useState([]);
    const [detailsLoading, setDetailsLoading] = useState(false);
    const [refreshInterval, setRefreshInterval] = useState(5000); // 5 sec default
    const [threshold, setThreshold] = useState(() => {
        const saved = localStorage.getItem('connectionThreshold');
        return saved ? Number(saved) : 50;
    });
    const [showThresholdConfig, setShowThresholdConfig] = useState(false);
    const [tempThreshold, setTempThreshold] = useState(threshold);

    // Persist threshold
    useEffect(() => {
        localStorage.setItem('connectionThreshold', threshold.toString());
    }, [threshold]);

    // Fetch Summary (Cards)
    const fetchSummary = async () => {
        if (!selectedHost) return;
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const res = await fetch(`/api/v1/connections/summary?host=${selectedHost}`, { headers });
            if (res.ok) {
                const data = await res.json();
                setSummary(data || []);
            }
        } catch (err) {
            console.error("Failed to fetch connection summary", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLoading(true);
        fetchSummary();
        const interval = setInterval(fetchSummary, refreshInterval);
        return () => clearInterval(interval);
    }, [selectedHost, refreshInterval]);

    // Fetch Details (Modal)
    useEffect(() => {
        if (selectedPort) {
            const fetchDetails = async () => {
                setDetailsLoading(true);
                try {
                    const token = localStorage.getItem('token');
                    const headers = { Authorization: `Bearer ${token}` };
                    const res = await fetch(`/api/v1/connections/details?host=${selectedHost}&port=${selectedPort}`, { headers });
                    if (res.ok) {
                        const data = await res.json();
                        setDetails(data || []);
                    }
                } catch (err) {
                    console.error("Failed to fetch details", err);
                } finally {
                    setDetailsLoading(false);
                }
            };
            fetchDetails();
            const interval = setInterval(fetchDetails, refreshInterval);
            return () => clearInterval(interval);
        }
    }, [selectedPort, selectedHost, refreshInterval]);

    // Sort by highest connection count first
    const sortedSummary = useMemo(() => {
        return [...summary].sort((a, b) => b.count - a.count);
    }, [summary]);

    // Stats
    const stats = useMemo(() => {
        const totalPorts = summary.length;
        const totalConnections = summary.reduce((sum, item) => sum + item.count, 0);
        const overThreshold = summary.filter(item => item.count >= threshold).length;
        const warningCount = summary.filter(item => item.count >= threshold * 0.8 && item.count < threshold).length;
        return { totalPorts, totalConnections, overThreshold, warningCount };
    }, [summary, threshold]);

    const getStatusColor = (status) => {
        switch (status) {
            case 'ESTABLISHED': return 'text-green-400';
            case 'TIME_WAIT': return 'text-yellow-400';
            case 'CLOSE_WAIT': return 'text-orange-400';
            case 'SYN_SENT': return 'text-blue-400';
            default: return 'text-gray-400';
        }
    };

    const getCardAlarmState = (count) => {
        if (count >= threshold) return 'critical';
        if (count >= threshold * 0.8) return 'warning';
        return 'normal';
    };

    const getCardStyles = (count) => {
        const state = getCardAlarmState(count);
        switch (state) {
            case 'critical':
                return {
                    border: 'border-red-500/70',
                    bg: 'hover:bg-red-950/30',
                    glow: 'shadow-[0_0_20px_rgba(239,68,68,0.25)]',
                    countColor: 'text-red-400',
                    portBg: 'bg-red-900/30 text-red-400',
                    pulse: 'animate-pulse-subtle',
                };
            case 'warning':
                return {
                    border: 'border-amber-500/50',
                    bg: 'hover:bg-amber-950/20',
                    glow: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
                    countColor: 'text-amber-400',
                    portBg: 'bg-amber-900/20 text-amber-400',
                    pulse: '',
                };
            default:
                return {
                    border: 'border-cyber-gray/20 hover:border-cyan-500/50',
                    bg: 'hover:bg-cyber-gray/20',
                    glow: '',
                    countColor: 'text-cyber-text group-hover:text-cyan-400',
                    portBg: 'bg-cyan-900/20 text-cyan-400',
                    pulse: '',
                };
        }
    };

    const handleThresholdSave = () => {
        const val = Math.max(1, Math.min(10000, tempThreshold));
        setThreshold(val);
        setShowThresholdConfig(false);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold font-display text-cyber-text flex items-center gap-3">
                        <Network className="text-cyan-400" />
                        Connection Tracking
                    </h1>
                    <p className="text-cyber-muted text-sm mt-1">
                        Live monitoring of active ports and network connections on <span className="text-cyan-400 font-mono">{selectedHost || 'Select a Host'}</span>
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* Threshold Config */}
                    <div className="relative">
                        <button
                            onClick={() => { setTempThreshold(threshold); setShowThresholdConfig(!showThresholdConfig); }}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border ${stats.overThreshold > 0
                                ? 'bg-red-950/30 border-red-500/40 text-red-400 hover:bg-red-950/50'
                                : 'bg-cyber-gray/10 border-cyber-gray/20 text-cyber-muted hover:text-cyan-400 hover:border-cyan-500/30'
                                }`}
                            title="Configure connection threshold"
                        >
                            <AlertTriangle size={13} />
                            <span>THRESHOLD: {threshold}</span>
                            {stats.overThreshold > 0 && (
                                <span className="ml-1 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
                                    {stats.overThreshold}
                                </span>
                            )}
                        </button>

                        {showThresholdConfig && (
                            <div className="absolute right-0 top-full mt-2 z-50 glass-panel border border-cyber-gray/30 rounded-xl p-4 w-72 shadow-xl">
                                <div className="text-xs font-mono text-cyber-muted mb-3 uppercase tracking-wider">Connection Threshold</div>
                                <p className="text-xs text-cyber-muted mb-3">
                                    Cards will turn <span className="text-amber-400 font-semibold">amber</span> at 80% and <span className="text-red-400 font-semibold">red</span> when connections reach this limit.
                                </p>
                                <div className="flex items-center gap-2 mb-3">
                                    <input
                                        type="number"
                                        min="1"
                                        max="10000"
                                        value={tempThreshold}
                                        onChange={(e) => setTempThreshold(Number(e.target.value))}
                                        onKeyDown={(e) => e.key === 'Enter' && handleThresholdSave()}
                                        className="flex-1 bg-cyber-black/50 border border-cyber-gray/30 rounded-lg px-3 py-2 text-sm text-cyan-400 font-mono focus:outline-none focus:border-cyan-500/50"
                                        autoFocus
                                    />
                                </div>
                                <div className="flex gap-2 mb-3">
                                    {[10, 25, 50, 100, 500].map(preset => (
                                        <button
                                            key={preset}
                                            onClick={() => setTempThreshold(preset)}
                                            className={`flex-1 text-xs py-1.5 rounded-md font-mono transition-all ${tempThreshold === preset
                                                ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                                                : 'bg-cyber-gray/10 text-cyber-muted hover:text-cyan-400 border border-cyber-gray/20'
                                                }`}
                                        >
                                            {preset}
                                        </button>
                                    ))}
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setShowThresholdConfig(false)}
                                        className="flex-1 text-xs py-2 rounded-lg bg-cyber-gray/10 text-cyber-muted hover:text-cyber-text border border-cyber-gray/20 transition-all"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={handleThresholdSave}
                                        className="flex-1 text-xs py-2 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 border border-cyan-500/30 font-semibold transition-all"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Create Alert Button */}
                    <button
                        onClick={() => navigate(`/alerts?metric=connection_count&threshold=${threshold}&host=${selectedHost || '*'}`)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono bg-violet-500/10 border border-violet-500/30 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300 transition-all"
                        title="Create a server-side alert rule for connections"
                    >
                        <BellRing size={13} />
                        <span>CREATE ALERT</span>
                    </button>

                    {/* Refresh Rate */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-cyber-muted font-mono">UPDATE RATE:</span>
                        <select
                            value={refreshInterval}
                            onChange={(e) => setRefreshInterval(Number(e.target.value))}
                            className="bg-cyber-gray/10 border border-cyber-gray/20 rounded px-2 py-1 text-xs text-cyan-400 focus:outline-none"
                        >
                            <option value={1000}>1s (Realtime)</option>
                            <option value={5000}>5s</option>
                            <option value={10000}>10s</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* Stats Bar */}
            {summary.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                    <div className="flex items-center gap-1.5 bg-cyber-gray/10 px-3 py-1.5 rounded-lg border border-cyber-gray/20">
                        <Server size={12} className="text-cyan-400" />
                        <span className="text-cyber-muted">PORTS:</span>
                        <span className="text-cyber-text font-semibold">{stats.totalPorts}</span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-cyber-gray/10 px-3 py-1.5 rounded-lg border border-cyber-gray/20">
                        <Zap size={12} className="text-cyan-400" />
                        <span className="text-cyber-muted">CONNECTIONS:</span>
                        <span className="text-cyber-text font-semibold">{stats.totalConnections}</span>
                    </div>
                    {stats.overThreshold > 0 && (
                        <div className="flex items-center gap-1.5 bg-red-950/30 px-3 py-1.5 rounded-lg border border-red-500/30 animate-pulse-subtle">
                            <AlertTriangle size={12} className="text-red-400" />
                            <span className="text-red-400">OVER THRESHOLD:</span>
                            <span className="text-red-300 font-bold">{stats.overThreshold}</span>
                        </div>
                    )}
                    {stats.warningCount > 0 && (
                        <div className="flex items-center gap-1.5 bg-amber-950/20 px-3 py-1.5 rounded-lg border border-amber-500/20">
                            <AlertTriangle size={12} className="text-amber-400" />
                            <span className="text-amber-400">APPROACHING:</span>
                            <span className="text-amber-300 font-bold">{stats.warningCount}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Connection Cards */}
            {loading && summary.length === 0 ? (
                <div className="p-12 text-center text-cyber-muted animate-pulse font-mono">SCANNING NETWORK INTERFACES...</div>
            ) : summary.length === 0 ? (
                <div className="glass-panel p-8 text-center text-cyber-muted">
                    <Shield size={48} className="mx-auto mb-4 opacity-20" />
                    <p>No active connections detected or agent not reporting.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {sortedSummary.map((item) => {
                        const styles = getCardStyles(item.count);
                        const alarmState = getCardAlarmState(item.count);
                        return (
                            <div
                                key={item.local_port}
                                onClick={() => setSelectedPort(item.local_port)}
                                className={`glass-panel p-4 rounded-xl border ${styles.border} ${styles.bg} ${styles.glow} ${styles.pulse} transition-all cursor-pointer group relative overflow-hidden`}
                            >
                                <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity">
                                    {alarmState === 'critical' ? (
                                        <AlertTriangle size={64} className="text-red-500" />
                                    ) : (
                                        <Activity size={64} />
                                    )}
                                </div>

                                <div className="flex justify-between items-start mb-4 relative z-10">
                                    <div className={`p-2 rounded font-mono text-xl font-bold ${styles.portBg}`}>
                                        :{item.local_port}
                                    </div>
                                    <div className="text-xs font-mono bg-cyber-gray/30 px-2 py-1 rounded text-cyber-text">
                                        {item.process_name || 'unknown'}
                                    </div>
                                </div>

                                <div className="relative z-10">
                                    <div className={`text-4xl font-bold mb-1 transition-colors ${styles.countColor}`}>
                                        {item.count}
                                    </div>
                                    <div className="text-xs text-cyber-muted font-mono tracking-wider flex items-center gap-2">
                                        ACTIVE CONNECTIONS
                                        {alarmState === 'critical' && (
                                            <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">
                                                OVER LIMIT
                                            </span>
                                        )}
                                        {alarmState === 'warning' && (
                                            <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-bold">
                                                APPROACHING
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Threshold progress bar */}
                                <div className="mt-3 relative z-10">
                                    <div className="w-full h-1 bg-cyber-gray/20 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all duration-500 ${alarmState === 'critical' ? 'bg-red-500' :
                                                alarmState === 'warning' ? 'bg-amber-500' :
                                                    'bg-cyan-500/50'
                                                }`}
                                            style={{ width: `${Math.min(100, (item.count / threshold) * 100)}%` }}
                                        />
                                    </div>
                                </div>

                                <div className="mt-3 flex items-center gap-2 text-xs text-cyan-500/80 opacity-0 group-hover:opacity-100 transition-opacity">
                                    View Details <ArrowRight size={12} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Detail Modal */}
            {selectedPort && (
                <div className="fixed inset-0 bg-cyber-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="glass-panel w-full max-w-4xl max-h-[80vh] flex flex-col rounded-xl border border-cyber-cyan/30 shadow-[0_0_50px_rgba(var(--cyber-cyan),0.1)]">
                        <div className="flex justify-between items-center p-4 border-b border-cyber-gray/20">
                            <h2 className="text-xl font-bold font-display text-cyber-text flex items-center gap-3">
                                <Activity className="text-cyber-cyan" />
                                Port {selectedPort} Details
                            </h2>
                            <button
                                onClick={() => setSelectedPort(null)}
                                className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-full transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-auto custom-scrollbar p-0">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-cyber-gray/20 text-cyber-muted font-mono text-xs uppercase sticky top-0 backdrop-blur-md">
                                    <tr>
                                        <th className="p-4">Remote Address</th>
                                        <th className="p-4">State</th>
                                        <th className="p-4">Process</th>
                                        <th className="p-4">Last Seen</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-cyber-gray/10">
                                    {detailsLoading && details.length === 0 ? (
                                        <tr>
                                            <td colSpan="4" className="p-8 text-center text-cyber-cyan font-mono animate-pulse">
                                                Loading Connections...
                                            </td>
                                        </tr>
                                    ) : details.map((conn, idx) => (
                                        <tr key={idx} className="hover:bg-cyber-gray/10 transition-colors font-mono text-xs">
                                            <td className="p-4 text-cyber-text">
                                                {conn.remote_ip}:{conn.remote_port}
                                            </td>
                                            <td className={`p-4 font-bold ${getStatusColor(conn.status)}`}>
                                                {conn.status}
                                            </td>
                                            <td className="p-4 text-cyber-muted">
                                                {conn.process_name} <span className="opacity-50">({conn.pid})</span>
                                            </td>
                                            <td className="p-4 text-cyber-muted">
                                                {new Date(conn.timestamp).toLocaleTimeString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="p-3 border-t border-cyber-gray/20 text-xs text-cyber-muted font-mono flex justify-between">
                            <span>Total Active: {details.length}</span>
                            <span className="flex items-center gap-1"><Clock size={12} /> Auto-refreshing ({refreshInterval / 1000}s)</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Connections;
