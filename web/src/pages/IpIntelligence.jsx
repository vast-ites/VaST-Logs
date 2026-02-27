import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Shield, Search, Globe, AlertTriangle, CheckCircle, Activity, MapPin, ExternalLink, Lock, Unlock, Crosshair, Wifi, ShieldAlert, ShieldCheck, ShieldX, Clock, ChevronDown, Eye, Ban, Server, Trash2, Plus, RefreshCw, List } from 'lucide-react';
import { useHost } from '../contexts/HostContext';

// --- Threat Level Calculation ---
const getThreatLevel = (sshAttempts, authFailures, blocked) => {
    if (blocked) return { level: 'BLOCKED', color: 'red', bg: 'from-red-500/20 to-red-900/10', border: 'border-red-500/50', text: 'text-red-400', icon: ShieldX, glow: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]' };
    const total = (sshAttempts || 0) + (authFailures || 0);
    if (total > 500) return { level: 'CRITICAL', color: 'red', bg: 'from-red-500/20 to-red-900/10', border: 'border-red-500/60', text: 'text-red-400', icon: ShieldX, glow: 'shadow-[0_0_20px_rgba(239,68,68,0.3)]' };
    if (total > 100) return { level: 'HIGH', color: 'orange', bg: 'from-orange-500/20 to-orange-900/10', border: 'border-orange-500/50', text: 'text-orange-400', icon: ShieldAlert, glow: 'shadow-[0_0_20px_rgba(249,115,22,0.3)]' };
    if (total > 20) return { level: 'MEDIUM', color: 'amber', bg: 'from-amber-500/20 to-amber-900/10', border: 'border-amber-500/40', text: 'text-amber-400', icon: ShieldAlert, glow: 'shadow-[0_0_15px_rgba(245,158,11,0.2)]' };
    if (total > 0) return { level: 'LOW', color: 'cyan', bg: 'from-cyber-cyan/10 to-cyan-900/5', border: 'border-cyber-cyan/30', text: 'text-cyber-cyan', icon: Shield, glow: 'shadow-[0_0_10px_rgba(0,243,255,0.15)]' };
    return { level: 'CLEAN', color: 'emerald', bg: 'from-emerald-500/15 to-emerald-900/5', border: 'border-emerald-500/40', text: 'text-emerald-400', icon: ShieldCheck, glow: 'shadow-[0_0_15px_rgba(16,185,129,0.2)]' };
};

// --- Relative Time ---
const getRelativeTime = (timestamp) => {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now - then;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
};

// --- Stat Card Component ---
const StatCard = ({ icon: Icon, label, value, color, delay = 0 }) => {
    const colorMap = {
        amber: { border: 'border-amber-500/40', bg: 'from-amber-500/15 to-amber-900/5', text: 'text-amber-400', iconBg: 'bg-amber-500/10', glow: 'hover:shadow-[0_0_20px_rgba(245,158,11,0.15)]' },
        red: { border: 'border-red-500/40', bg: 'from-red-500/15 to-red-900/5', text: 'text-red-400', iconBg: 'bg-red-500/10', glow: 'hover:shadow-[0_0_20px_rgba(239,68,68,0.15)]' },
        violet: { border: 'border-violet-500/40', bg: 'from-violet-500/15 to-violet-900/5', text: 'text-violet-400', iconBg: 'bg-violet-500/10', glow: 'hover:shadow-[0_0_20px_rgba(139,92,246,0.15)]' },
        cyan: { border: 'border-cyber-cyan/30', bg: 'from-cyber-cyan/10 to-cyan-900/5', text: 'text-cyber-cyan', iconBg: 'bg-cyber-cyan/10', glow: 'hover:shadow-[0_0_20px_rgba(0,243,255,0.15)]' },
        emerald: { border: 'border-emerald-500/40', bg: 'from-emerald-500/15 to-emerald-900/5', text: 'text-emerald-400', iconBg: 'bg-emerald-500/10', glow: 'hover:shadow-[0_0_20px_rgba(16,185,129,0.15)]' },
    };
    const c = colorMap[color] || colorMap.cyan;
    return (
        <div
            className={`glass-panel p-5 rounded-xl border ${c.border} bg-gradient-to-br ${c.bg} ${c.glow} transition-all duration-300 animate-fade-in-up`}
            style={{ animationDelay: `${delay}ms` }}
        >
            <div className="flex items-center gap-3 mb-3">
                <div className={`p-2 rounded-lg ${c.iconBg}`}>
                    <Icon size={18} className={c.text} />
                </div>
                <span className="text-xs font-mono text-cyber-muted uppercase tracking-wider">{label}</span>
            </div>
            <div className={`text-3xl font-bold ${c.text} font-mono`}>
                {typeof value === 'number' ? value.toLocaleString() : value}
            </div>
        </div>
    );
};

// --- Level Badge ---
const LevelBadge = ({ level }) => {
    const config = {
        ERROR: 'bg-red-500/15 text-red-400 border-red-500/30',
        FATAL: 'bg-red-500/20 text-red-300 border-red-500/40',
        WARN: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
        INFO: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        DEBUG: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border tracking-wide ${config[level] || config.INFO}`}>
            {level}
        </span>
    );
};

// --- Service Tag ---
const ServiceTag = ({ service }) => {
    const lower = (service || '').toLowerCase();
    let style = 'border-cyber-gray/30 bg-cyber-gray/10 text-cyber-muted';
    if (lower.includes('ssh')) style = 'border-amber-500/30 bg-amber-500/10 text-amber-400';
    else if (lower.includes('apache') || lower.includes('nginx') || lower.includes('web')) style = 'border-violet-500/30 bg-violet-500/10 text-violet-400';
    else if (lower.includes('system') || lower.includes('core')) style = 'border-sky-500/30 bg-sky-500/10 text-sky-400';
    else if (lower.includes('manual') || lower.includes('auth')) style = 'border-orange-500/30 bg-orange-500/10 text-orange-400';

    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border tracking-wide whitespace-nowrap ${style}`}>
            {(service || 'UNKNOWN').toUpperCase()}
        </span>
    );
};


const IpIntelligence = () => {
    const { selectedHost } = useHost();
    const [searchParams, setSearchParams] = useSearchParams();
    const [searchIp, setSearchIp] = useState('');
    const [ipData, setIpData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [logPage, setLogPage] = useState(1);
    const [expandedLogs, setExpandedLogs] = useState({});
    const [inputFocused, setInputFocused] = useState(false);
    const [commandStatus, setCommandStatus] = useState(null);
    const [blockedIPs, setBlockedIPs] = useState([]);
    const [blockedLoading, setBlockedLoading] = useState(false);
    const [quickBlockIp, setQuickBlockIp] = useState('');
    const [quickBlockStatus, setQuickBlockStatus] = useState(null);
    const inputRef = useRef(null);

    // Fetch currently blocked IPs for selected host
    const fetchBlockedIPs = useCallback(async () => {
        if (!selectedHost) return;
        setBlockedLoading(true);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/v1/blocked-ips?agent_id=${selectedHost}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setBlockedIPs(data.blocked_ips || []);
            }
        } catch (err) {
            console.error('Failed to fetch blocked IPs:', err);
        } finally {
            setBlockedLoading(false);
        }
    }, [selectedHost]);

    // Auto-load blocked IPs when host changes
    useEffect(() => {
        fetchBlockedIPs();
    }, [fetchBlockedIPs]);

    // Reset analysis results and re-fetch when source/host changes
    useEffect(() => {
        // Clear stale analysis data from previous source
        setIpData(null);
        setError(null);
        setLogPage(1);
        setExpandedLogs({});
        setCommandStatus(null);
    }, [selectedHost]);

    // Handle auto-search from URL params
    useEffect(() => {
        const queryIp = searchParams.get('search');
        if (queryIp && queryIp !== searchIp) {
            setSearchIp(queryIp);
            handleSearch(null, 1, queryIp);
        }
    }, [searchParams.get('search')]);

    // Quick block/unblock handler (no search required)
    const handleQuickBlock = async (ip, action) => {
        if (!ip || !selectedHost) return;
        try {
            const token = localStorage.getItem('token');
            const endpoint = action === 'block' ? '/api/v1/ip/block' : '/api/v1/ip/unblock';
            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ ip, agent_id: selectedHost, reason: 'Manual action via UI' })
            });
            if (res.ok) {
                const data = await res.json();
                setQuickBlockStatus({ type: 'success', message: data.message || 'Command queued.' });
                setQuickBlockIp('');
                // Refresh blocked list after delay + immediately
                fetchBlockedIPs();
                setTimeout(() => { fetchBlockedIPs(); setQuickBlockStatus(null); }, 30000);
            } else {
                setQuickBlockStatus({ type: 'error', message: 'Action failed.' });
                setTimeout(() => setQuickBlockStatus(null), 5000);
            }
        } catch (err) {
            console.error(err);
            setQuickBlockStatus({ type: 'error', message: 'Network error.' });
            setTimeout(() => setQuickBlockStatus(null), 5000);
        }
    };

    const handleSearch = async (e, page = 1, ipOverride = null) => {
        if (e) e.preventDefault();
        const targetIp = ipOverride || searchIp;
        if (!targetIp) return;

        setLoading(true);
        setError(null);
        if (page === 1) {
            setIpData(null);
            setExpandedLogs({});
        }

        try {
            const token = localStorage.getItem('token');
            const agentQuery = selectedHost ? `&agent_id=${selectedHost}` : '';
            const res = await fetch(`/api/v1/ip/${targetIp}?page=${page}${agentQuery}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) throw new Error('Failed to fetch IP details');
            const data = await res.json();

            if (page > 1 && ipData) {
                setIpData(prev => ({
                    ...prev,
                    recent_logs: [...prev.recent_logs, ...data.recent_logs]
                }));
            } else {
                setIpData(data);
            }
            setLogPage(page);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleBlockAction = async (action) => {
        if (!ipData || !selectedHost) return;

        try {
            const token = localStorage.getItem('token');
            const endpoint = action === 'block' ? '/api/v1/ip/block' : '/api/v1/ip/unblock';
            const body = {
                ip: ipData.ip,
                agent_id: selectedHost,
                reason: 'Manual action via UI'
            };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (res.ok) {
                const data = await res.json();
                setCommandStatus({
                    type: 'success',
                    message: data.message || `${action === 'block' ? 'Block' : 'Unblock'} command queued.`,
                    action: action
                });
                // Auto-refresh after 30 seconds to reflect firewall sync
                setTimeout(() => {
                    handleSearch({ preventDefault: () => { } });
                    fetchBlockedIPs();
                    setCommandStatus(null);
                }, 30000);
                // Also do an immediate refresh for the DB state
                handleSearch({ preventDefault: () => { } });
                fetchBlockedIPs();
            } else {
                setCommandStatus({ type: 'error', message: 'Action failed. Please try again.' });
                setTimeout(() => setCommandStatus(null), 5000);
            }
        } catch (err) {
            console.error(err);
            setCommandStatus({ type: 'error', message: 'Network error. Could not reach the server.' });
            setTimeout(() => setCommandStatus(null), 5000);
        }
    };

    const highlightIp = (message) => {
        if (!searchIp || !message) return message;
        const regex = new RegExp(`(${searchIp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'g');
        return message.split(regex).map((part, i) =>
            regex.test(part) ? <span key={i} className="bg-cyber-cyan/30 text-cyber-cyan font-bold px-0.5 rounded">{part}</span> : part
        );
    };

    const toggleLogExpansion = (index) => {
        setExpandedLogs(prev => ({ ...prev, [index]: !prev[index] }));
    };

    const threat = ipData ? getThreatLevel(ipData.ssh_attempts, ipData.auth_failures, ipData.blocked) : null;
    const ThreatIcon = threat?.icon || Shield;

    // --- Blocked IPs Panel (shared between empty state and results view) ---
    const BlockedIPsPanel = () => (
        <div className="glass-panel rounded-xl p-5 border border-cyber-gray/20">
            {/* Quick Block Input */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
                        <Ban className="text-red-400" size={16} />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-cyber-text tracking-wider">FIREWALL CONTROL</h3>
                        <p className="text-[10px] text-cyber-muted font-mono">Quick Block / Currently Blocked IPs</p>
                    </div>
                </div>
                <button
                    onClick={fetchBlockedIPs}
                    disabled={blockedLoading}
                    className="p-2 rounded-lg bg-cyber-gray/10 border border-cyber-gray/20 text-cyber-muted hover:text-cyber-cyan hover:border-cyber-cyan/30 transition-all"
                    title="Refresh blocked IPs list"
                >
                    <RefreshCw size={14} className={blockedLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Quick Block Input Row */}
            <div className="flex gap-2 mb-4">
                <div className="relative flex-1">
                    <Plus className="absolute left-3 top-1/2 -translate-y-1/2 text-cyber-muted/40" size={14} />
                    <input
                        type="text"
                        value={quickBlockIp}
                        onChange={(e) => setQuickBlockIp(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleQuickBlock(quickBlockIp, 'block')}
                        placeholder="Enter IP to block..."
                        className="w-full bg-cyber-black/40 border border-cyber-gray/30 text-cyber-text py-2.5 pl-9 pr-3 rounded-lg font-mono text-sm focus:border-red-500/50 outline-none transition-all placeholder:text-cyber-muted/25"
                    />
                </div>
                <button
                    onClick={() => handleQuickBlock(quickBlockIp, 'block')}
                    disabled={!quickBlockIp}
                    className="px-4 py-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold tracking-wider hover:bg-red-500/20 hover:border-red-500/50 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                    <Lock size={12} /> BLOCK
                </button>
            </div>

            {/* Quick Block Status Toast */}
            {quickBlockStatus && (
                <div className={`rounded-lg p-3 mb-4 flex items-center gap-2 text-xs animate-fade-in-up ${quickBlockStatus.type === 'success'
                    ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                    : 'bg-red-500/10 border border-red-500/20 text-red-400'
                    }`}>
                    {quickBlockStatus.type === 'success' ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
                    <span>{quickBlockStatus.message}</span>
                    <span className="ml-auto text-[10px] opacity-60">Auto-refreshes in ~30s</span>
                </div>
            )}

            {/* Blocked IPs Table */}
            <div className="border border-cyber-gray/15 rounded-lg overflow-hidden">
                <div className="bg-cyber-black/40 px-4 py-2.5 flex items-center justify-between border-b border-cyber-gray/15">
                    <div className="flex items-center gap-2">
                        <List size={12} className="text-cyber-muted" />
                        <span className="text-[10px] font-mono text-cyber-muted tracking-wider">CURRENTLY BLOCKED</span>
                    </div>
                    <span className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full ${blockedIPs.length > 0 ? 'bg-red-500/15 text-red-400 border border-red-500/30' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                        {blockedIPs.length} {blockedIPs.length === 1 ? 'IP' : 'IPs'}
                    </span>
                </div>

                {blockedLoading ? (
                    <div className="p-6 text-center text-cyber-muted text-xs font-mono">Loading...</div>
                ) : blockedIPs.length === 0 ? (
                    <div className="p-6 text-center">
                        <ShieldCheck size={24} className="text-emerald-500/40 mx-auto mb-2" />
                        <p className="text-xs text-cyber-muted font-mono">No IPs currently blocked on this agent</p>
                    </div>
                ) : (
                    <div className="max-h-[300px] overflow-y-auto">
                        {blockedIPs.map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-cyber-gray/10 hover:bg-cyber-gray/5 transition-all group">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-2 h-2 rounded-full bg-red-500/60 flex-shrink-0"></div>
                                    <span className="font-mono text-sm text-cyber-text">{item.ip}</span>
                                    <span className="text-[10px] text-cyber-muted font-mono hidden md:inline">
                                        {item.blocked_by === 'firewall_sync' ? '🔥 iptables' : `👤 ${item.blocked_by}`}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-cyber-muted/50 font-mono hidden sm:inline">
                                        {item.blocked_at ? getRelativeTime(item.blocked_at) : ''}
                                    </span>
                                    <button
                                        onClick={() => handleQuickBlock(item.ip, 'unblock')}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20 transition-all"
                                        title={`Unblock ${item.ip}`}
                                    >
                                        <Unlock size={12} />
                                    </button>
                                    <button
                                        onClick={() => { setSearchIp(item.ip); handleSearch(null, 1); }}
                                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md bg-cyber-cyan/10 border border-cyber-cyan/20 text-cyber-cyan hover:bg-cyber-cyan/20 transition-all"
                                        title={`Analyze ${item.ip}`}
                                    >
                                        <Search size={12} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // --- HERO EMPTY STATE ---
    if (!ipData && !loading && !error) {
        return (
            <div className="space-y-6 max-w-[1600px] mx-auto pb-10">
                {/* Header */}
                <div className="flex items-center gap-4 border-b border-cyber-gray/20 pb-4">
                    <div className="p-2 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/20">
                        <Shield className="text-cyber-cyan" size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-cyber-text tracking-widest">IP INTELLIGENCE</h1>
                        <p className="text-xs text-cyber-muted font-mono mt-0.5">Threat Analysis & Forensics</p>
                    </div>
                </div>

                {/* Search Bar */}
                <div className={`glass-panel p-6 rounded-xl transition-all duration-500 ${inputFocused ? 'border-cyber-cyan/60 shadow-[0_0_30px_rgba(0,243,255,0.15)]' : 'border-cyber-gray/30'}`}>
                    <label className="block text-xs font-mono text-cyber-muted mb-3 tracking-wider">TARGET IP ADDRESS</label>
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1 group">
                            <Crosshair className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${inputFocused ? 'text-cyber-cyan' : 'text-cyber-muted/50'}`} size={20} />
                            <input
                                ref={inputRef}
                                type="text"
                                value={searchIp}
                                onChange={(e) => setSearchIp(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                onFocus={() => setInputFocused(true)}
                                onBlur={() => setInputFocused(false)}
                                placeholder="e.g. 192.168.1.1 or 178.185.136.57"
                                className="w-full bg-cyber-black/60 border border-cyber-gray/40 text-cyber-text p-4 pl-12 rounded-xl font-mono focus:border-cyber-cyan/60 outline-none transition-all text-lg placeholder:text-cyber-muted/30"
                            />
                        </div>
                        <button
                            onClick={() => handleSearch(null, 1)}
                            disabled={!searchIp}
                            className="w-full md:w-auto bg-gradient-to-r from-cyber-cyan/15 to-cyan-500/10 border border-cyber-cyan/50 text-cyber-cyan px-10 py-4 rounded-xl hover:from-cyber-cyan/25 hover:to-cyan-500/20 hover:shadow-[0_0_25px_rgba(0,243,255,0.2)] transition-all font-bold tracking-wider disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 min-h-[60px]"
                        >
                            <Search size={20} /> ANALYZE TARGET
                        </button>
                    </div>
                </div>

                {/* Blocked IPs Panel (always visible) */}
                <BlockedIPsPanel />
            </div>
        );
    }

    // --- MAIN RESULTS VIEW ---
    return (
        <div className="space-y-5 max-w-[1600px] mx-auto pb-10">
            {/* Header */}
            <div className="flex items-center gap-4 border-b border-cyber-gray/20 pb-4">
                <div className="p-2 rounded-xl bg-cyber-cyan/10 border border-cyber-cyan/20">
                    <Shield className="text-cyber-cyan" size={28} />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-cyber-text tracking-widest">IP INTELLIGENCE</h1>
                    <p className="text-xs text-cyber-muted font-mono mt-0.5">Threat Analysis & Forensics</p>
                </div>
            </div>

            {/* Search Bar */}
            <div className={`glass-panel p-5 rounded-xl transition-all duration-500 ${inputFocused ? 'border-cyber-cyan/60 shadow-[0_0_30px_rgba(0,243,255,0.15)]' : 'border-cyber-gray/30'}`}>
                <div className="flex flex-col md:flex-row gap-3">
                    <div className="relative flex-1">
                        <Crosshair className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-300 ${inputFocused ? 'text-cyber-cyan' : 'text-cyber-muted/50'}`} size={18} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchIp}
                            onChange={(e) => setSearchIp(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                            onFocus={() => setInputFocused(true)}
                            onBlur={() => setInputFocused(false)}
                            placeholder="e.g. 192.168.1.1"
                            className="w-full bg-cyber-black/60 border border-cyber-gray/40 text-cyber-text p-3.5 pl-11 rounded-lg font-mono focus:border-cyber-cyan/60 outline-none transition-all text-base placeholder:text-cyber-muted/30"
                        />
                    </div>
                    <button
                        onClick={() => handleSearch(null, 1)}
                        disabled={loading || !searchIp}
                        className="w-full md:w-auto bg-gradient-to-r from-cyber-cyan/15 to-cyan-500/10 border border-cyber-cyan/50 text-cyber-cyan px-8 py-3.5 rounded-lg hover:from-cyber-cyan/25 hover:to-cyan-500/20 hover:shadow-[0_0_25px_rgba(0,243,255,0.2)] transition-all font-bold tracking-wider disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 min-h-[52px]"
                    >
                        {loading && logPage === 1 ? (
                            <><Activity className="animate-spin" size={18} /> SCANNING...</>
                        ) : (
                            <><Search size={18} /> ANALYZE TARGET</>
                        )}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 border border-red-500/40 bg-red-500/10 text-red-400 rounded-xl flex items-center gap-3 animate-fade-in-up">
                    <AlertTriangle size={20} />
                    <span className="font-mono text-sm">{error}</span>
                </div>
            )}

            {ipData && (
                <div className="space-y-5 animate-fade-in-up">

                    {/* === COMMAND STATUS TOAST === */}
                    {commandStatus && (
                        <div className={`rounded-xl p-4 border flex items-center justify-between gap-3 animate-fade-in-up ${commandStatus.type === 'success'
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                            <div className="flex items-center gap-3 min-w-0">
                                {commandStatus.type === 'success' ? (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                                        <CheckCircle size={16} />
                                    </div>
                                ) : (
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <AlertTriangle size={16} />
                                    </div>
                                )}
                                <div className="min-w-0">
                                    <p className="text-sm font-medium">{commandStatus.message}</p>
                                    {commandStatus.type === 'success' && (
                                        <p className="text-xs opacity-70 mt-0.5">This page will auto-refresh in ~30 seconds to reflect the updated firewall state.</p>
                                    )}
                                </div>
                            </div>
                            <button onClick={() => setCommandStatus(null)} className="text-xs opacity-60 hover:opacity-100 flex-shrink-0 px-2 py-1 rounded hover:bg-white/5 transition-all">
                                Dismiss
                            </button>
                        </div>
                    )}
                    {/* === THREAT OVERVIEW BAR === */}
                    <div className={`glass-panel rounded-xl p-5 border ${threat.border} bg-gradient-to-r ${threat.bg} ${threat.glow} transition-all duration-500`}>
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-xl ${threat.text} bg-cyber-black/40 border ${threat.border}`}>
                                    <ThreatIcon size={28} />
                                </div>
                                <div>
                                    <div className="flex items-center gap-3 mb-1">
                                        <span className="text-xl font-mono font-bold text-cyber-text">{ipData.ip}</span>
                                        <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wider border ${threat.level === 'BLOCKED' ? 'bg-red-500/20 border-red-500/50 text-red-400' :
                                            threat.level === 'CRITICAL' ? 'bg-red-500/20 border-red-500/50 text-red-400 animate-pulse' :
                                                threat.level === 'HIGH' ? 'bg-orange-500/20 border-orange-500/50 text-orange-400' :
                                                    threat.level === 'MEDIUM' ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' :
                                                        threat.level === 'LOW' ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400' :
                                                            'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                                            }`}>
                                            {threat.level}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-4 text-xs text-cyber-muted font-mono">
                                        {ipData.geo?.country && (
                                            <span className="flex items-center gap-1.5">
                                                <Globe size={12} /> {ipData.geo.country}
                                                {ipData.geo.region && ipData.geo.region !== 'N/A' ? `, ${ipData.geo.region}` : ''}
                                            </span>
                                        )}
                                        {ipData.geo?.city && ipData.geo.city !== 'N/A' && (
                                            <span className="flex items-center gap-1.5">
                                                <MapPin size={12} /> {ipData.geo.city}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                                <a href={`https://www.virustotal.com/gui/ip-address/${ipData.ip}`} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2 bg-cyber-gray/15 hover:bg-cyber-gray/25 rounded-lg border border-cyber-gray/20 hover:border-cyber-cyan/30 text-cyber-muted hover:text-cyber-cyan transition-all text-xs font-bold tracking-wide">
                                    <ExternalLink size={14} /> VirusTotal
                                </a>
                                {selectedHost && (
                                    ipData.blocked ? (
                                        <button onClick={() => handleBlockAction('unblock')}
                                            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/40 text-emerald-400 rounded-lg hover:bg-emerald-500/20 hover:shadow-[0_0_10px_rgba(16,185,129,0.2)] transition-all text-xs font-bold tracking-wide">
                                            <Unlock size={14} /> UNBLOCK
                                        </button>
                                    ) : (
                                        <button onClick={() => handleBlockAction('block')}
                                            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border border-red-500/40 text-red-400 rounded-lg hover:bg-red-500/20 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)] transition-all text-xs font-bold tracking-wide">
                                            <Lock size={14} /> BLOCK IP
                                        </button>
                                    )
                                )}
                            </div>
                        </div>
                    </div>

                    {/* === STAT CARDS ROW === */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard icon={Wifi} label="SSH Attempts" value={ipData.ssh_attempts || 0} color="amber" delay={0} />
                        <StatCard icon={ShieldX} label="Auth Failures" value={ipData.auth_failures || 0} color="red" delay={100} />
                        <StatCard icon={Globe} label="Country" value={ipData.geo?.country || 'Unknown'} color="violet" delay={200} />
                        <StatCard icon={ThreatIcon} label="Threat Level" value={threat.level} color={
                            threat.level === 'CRITICAL' || threat.level === 'BLOCKED' ? 'red' :
                                threat.level === 'HIGH' ? 'amber' :
                                    threat.level === 'MEDIUM' ? 'amber' :
                                        threat.level === 'LOW' ? 'cyan' : 'emerald'
                        } delay={300} />
                    </div>

                    {/* === ACTIVITY LOG TABLE === */}
                    <div className="glass-panel rounded-xl border-cyber-gray/20 animate-fade-in-up" style={{ animationDelay: '400ms' }}>
                        {/* Log Header */}
                        <div className="flex items-center justify-between p-5 border-b border-cyber-gray/15">
                            <div className="flex items-center gap-3">
                                <div className="p-2 rounded-lg bg-cyber-cyan/10">
                                    <Activity size={18} className="text-cyber-cyan" />
                                </div>
                                <div>
                                    <h3 className="text-base font-bold text-cyber-text tracking-wider">ACTIVITY LOG</h3>
                                    <p className="text-[10px] text-cyber-muted font-mono mt-0.5">System & Web Events</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-cyber-muted font-mono bg-cyber-black/40 px-3 py-1.5 rounded-lg border border-cyber-gray/20">
                                    {ipData.recent_logs?.length || 0} events
                                </span>
                            </div>
                        </div>

                        {ipData.recent_logs && ipData.recent_logs.length > 0 ? (
                            <div className="flex flex-col">
                                <div className="overflow-auto custom-scrollbar" style={{ maxHeight: '600px' }}>
                                    <table className="w-full text-left text-xs border-collapse min-w-[900px]">
                                        <thead className="sticky top-0 z-10">
                                            <tr className="text-cyber-muted font-mono uppercase text-[10px] tracking-wider">
                                                <th className="py-3 px-4 bg-cyber-dark/95 backdrop-blur-sm border-b border-cyber-gray/20 w-44">
                                                    <div className="flex items-center gap-1.5">
                                                        <Clock size={11} /> Timestamp
                                                    </div>
                                                </th>
                                                <th className="py-3 px-4 bg-cyber-dark/95 backdrop-blur-sm border-b border-cyber-gray/20 w-36">
                                                    <div className="flex items-center gap-1.5">
                                                        <Server size={11} /> Service
                                                    </div>
                                                </th>
                                                <th className="py-3 px-4 bg-cyber-dark/95 backdrop-blur-sm border-b border-cyber-gray/20 w-24">Level</th>
                                                <th className="py-3 px-4 bg-cyber-dark/95 backdrop-blur-sm border-b border-cyber-gray/20">Message</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {ipData.recent_logs.map((log, i) => {
                                                const isExpanded = expandedLogs[i];
                                                const isLong = log.message && log.message.length > 140;
                                                const displayMsg = isExpanded ? log.message : `${(log.message || '').substring(0, 140)}${isLong ? '...' : ''}`;

                                                return (
                                                    <tr key={i} className="group hover:bg-cyber-cyan/5 border-b border-cyber-gray/8 transition-colors duration-150 relative">
                                                        {/* Left accent bar on hover */}
                                                        <td className="py-3 px-4 font-mono text-cyber-muted/70 whitespace-nowrap">
                                                            <div className="flex flex-col">
                                                                <span className="text-cyber-text/80">{new Date(log.timestamp).toLocaleString()}</span>
                                                                <span className="text-[10px] text-cyber-muted/50 mt-0.5">{getRelativeTime(log.timestamp)}</span>
                                                            </div>
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <ServiceTag service={log.service} />
                                                        </td>
                                                        <td className="py-3 px-4">
                                                            <LevelBadge level={log.level} />
                                                        </td>
                                                        <td className="py-3 px-4 font-mono text-cyber-text/80 text-[11px] leading-relaxed" title={log.message}>
                                                            {highlightIp(displayMsg)}
                                                            {isLong && (
                                                                <button onClick={() => toggleLogExpansion(i)} className="text-cyber-cyan/60 hover:text-cyber-cyan text-[10px] ml-2 font-bold transition-colors">
                                                                    {isExpanded ? '▲ less' : '▼ more'}
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>

                                {/* Load More Footer */}
                                <div className="p-4 flex justify-center border-t border-cyber-gray/15">
                                    {ipData.has_more_logs ? (
                                        <button
                                            onClick={() => handleSearch(null, logPage + 1)}
                                            disabled={loading}
                                            className="flex items-center gap-2 bg-cyber-gray/15 border border-cyber-gray/30 hover:bg-cyber-cyan/10 hover:border-cyber-cyan/40 text-cyber-text px-6 py-2.5 rounded-full transition-all text-xs font-bold tracking-wider disabled:opacity-50"
                                        >
                                            {loading ? <Activity className="animate-spin" size={14} /> : <ChevronDown size={14} />}
                                            LOAD MORE EVENTS
                                        </button>
                                    ) : (
                                        <span className="text-cyber-muted/50 text-xs font-mono">— End of activity log —</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                                <div className="w-16 h-16 rounded-2xl bg-cyber-gray/10 border border-cyber-gray/15 flex items-center justify-center mb-4">
                                    <Search size={28} className="text-cyber-gray/30" />
                                </div>
                                <p className="text-base text-cyber-muted font-light mb-1">No activity detected</p>
                                <p className="text-xs text-cyber-muted/40 max-w-sm">
                                    No log entries found for this IP address. Try selecting a different source or checking another IP.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default IpIntelligence;
