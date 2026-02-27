import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Shield, ShieldAlert, Activity, Crosshair, Lock, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import StatCard from '../../components/service/StatCard';
import { useHost } from '../../contexts/HostContext';

const SecurityDetail = () => {
    const { serviceName } = useParams();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedHost } = useHost();

    const host = selectedHost || searchParams.get('host');

    useEffect(() => {
        if (selectedHost && searchParams.get('host') !== selectedHost) {
            setSearchParams({ host: selectedHost });
        }
    }, [selectedHost, setSearchParams]);

    const [timeRange, setTimeRange] = useState('24h');
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshRate, setRefreshRate] = useState(5);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage] = useState(10);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            let logUrl = `/api/v1/logs/search?service=security&limit=200`;

            if (timeRange === 'custom' && customRange.from && customRange.to) {
                logUrl += `&after=${encodeURIComponent(new Date(customRange.from).toISOString())}&before=${encodeURIComponent(new Date(customRange.to).toISOString())}`;
            } else if (timeRange !== 'custom') {
                let ms = 0;
                if (timeRange === 'realtime') ms = 15 * 60 * 1000; // 15m sliding window for live
                else if (timeRange.endsWith('m')) ms = parseInt(timeRange) * 60 * 1000;
                else if (timeRange.endsWith('h')) ms = parseInt(timeRange) * 60 * 60 * 1000;
                else if (timeRange.endsWith('d')) ms = parseInt(timeRange) * 24 * 60 * 60 * 1000;
                if (ms > 0) logUrl += `&after=${new Date(Date.now() - ms).toISOString()}`;
            }

            if (host) logUrl += `&host=${host}`;

            const res = await fetch(logUrl, { headers });
            if (res.ok) {
                const data = await res.json();
                setLogs(Array.isArray(data) ? data : (data?.logs || []));
            } else {
                setLogs([]);
            }
        } catch (err) {
            console.error('Failed to fetch security logs:', err);
            setLogs([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        setLogs([]);
        setLoading(true);
    }, [host]);

    useEffect(() => {
        fetchData();
    }, [timeRange, customRange, host]);

    useEffect(() => {
        if (refreshRate === 0 || timeRange === 'custom') return;
        const interval = setInterval(fetchData, refreshRate * 1000);
        return () => clearInterval(interval);
    }, [refreshRate, timeRange, host]);

    // Parse logs to extract IPs automatically blocked
    const extractMitiagtions = () => {
        const mitigations = [];
        logs.forEach(log => {
            if (!log.message) return;
            // Expected format from agent: "⚠️ [Threat Detected] ... from IP" or "🛡️ [Remediation Success] Auto-blocked malicious IP X.X.X.X..."
            const ipMatch = log.message.match(/IP\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (ipMatch) {
                mitigations.push({
                    timestamp: log.timestamp,
                    ip: ipMatch[1],
                    message: log.message,
                    level: log.level
                });
            } else {
                mitigations.push({
                    timestamp: log.timestamp,
                    ip: 'Unknown',
                    message: log.message,
                    level: log.level
                });
            }
        });
        return mitigations;
    };

    const mitigations = extractMitiagtions();
    const uniqueThreats = new Set(mitigations.map(m => m.ip).filter(ip => ip !== 'Unknown')).size;

    // Pagination Logic
    const indexOfLastItem = currentPage * itemsPerPage;
    const indexOfFirstItem = indexOfLastItem - itemsPerPage;
    const currentMitigations = mitigations.slice(indexOfFirstItem, indexOfLastItem);
    const totalPages = Math.ceil(mitigations.length / itemsPerPage);

    const paginate = (pageNumber) => setCurrentPage(pageNumber);

    return (
        <div className="p-6 space-y-6 max-w-[1600px] mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/services')}
                        className="p-2 rounded-lg bg-cyber-gray/50 hover:bg-cyber-gray/80 border border-cyber-dim transition-colors">
                        <ArrowLeft className="w-5 h-5 text-cyber-cyan" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold font-display text-cyber-text flex items-center gap-2 tracking-widest uppercase">
                            <ShieldAlert className="w-6 h-6 text-red-500" />
                            Security Operations
                        </h1>
                        <p className="text-cyber-muted mt-1 font-mono text-sm tracking-widest uppercase">
                            Automated Threat Mitigation {host && <span className="text-cyber-cyan ml-2">@{host}</span>}
                        </p>
                    </div>
                </div>
                <div className="flex gap-3">
                    <TimeRangeSelector
                        value={timeRange}
                        onChange={setTimeRange}
                        onCustomChange={(from, to) => {
                            setCustomRange({ from, to });
                            setTimeRange('custom');
                        }}
                    />
                    <RefreshRateSelector value={refreshRate} onChange={setRefreshRate} />
                </div>
            </div>

            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Threats Mitigated"
                    value={mitigations.filter(m => m.level === 'CRITICAL' || m.message.includes('block')).length}
                    icon={Shield}
                    color="text-red-400"
                />
                <StatCard
                    title="Unique Attacker IPs"
                    value={uniqueThreats}
                    icon={Crosshair}
                    color="text-orange-400"
                />
                <StatCard
                    title="Global Threat Level"
                    value={uniqueThreats > 10 ? 'ELEVATED' : 'SAFE'}
                    icon={Activity}
                    color={uniqueThreats > 10 ? 'text-orange-400' : 'text-emerald-400'}
                />
                <StatCard
                    title="Active Protocol"
                    value="SSH Brute-Force Proxy"
                    icon={Lock}
                    color="text-cyber-cyan"
                />
            </div>

            {/* Mitigations Log Panel */}
            <div className="glass-panel p-6 rounded-xl border border-cyber-gray/20">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="text-lg font-bold font-display text-cyber-cyan tracking-widest flex items-center gap-2">
                            <Lock className="w-5 h-5" /> RECENT MITIGATIONS
                        </h3>
                        <p className="text-[10px] text-cyber-muted font-mono uppercase tracking-widest mt-1">Intercepted threats & auto-bans</p>
                    </div>
                    <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1.5 rounded font-mono font-bold">
                        {mitigations.length} EVENTS RECORDED
                    </span>
                </div>

                <div className="overflow-x-auto rounded border border-cyber-gray/15">
                    <table className="w-full text-left border-collapse min-w-[800px]">
                        <thead className="bg-cyber-gray/10">
                            <tr className="border-b border-cyber-gray/20 text-cyber-muted text-xs font-mono tracking-widest uppercase">
                                <th className="p-3 w-48">Timestamp</th>
                                <th className="p-3 w-40">Attacker IP</th>
                                <th className="p-3 w-32">Status</th>
                                <th className="p-3">Remediation Action</th>
                                <th className="p-3 w-24 text-center">Analyze</th>
                            </tr>
                        </thead>
                        <tbody className="text-xs font-mono">
                            {loading && logs.length === 0 ? (
                                <tr><td colSpan="5" className="p-6 text-center text-cyber-muted">Scanning threat archives...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center">
                                        <Shield className="w-12 h-12 text-emerald-500/30 mx-auto mb-3" />
                                        <p className="text-cyber-muted tracking-wider uppercase">No security threats intercepted in this timeframe.</p>
                                    </td>
                                </tr>
                            ) : (
                                currentMitigations.map((m, i) => {
                                    const isCritical = m.level === 'CRITICAL' || m.message.toLowerCase().includes('block');
                                    return (
                                        <tr
                                            key={i}
                                            onClick={() => navigate(`/ip-intelligence?host=${host || ''}&search=${m.ip}`)}
                                            className="border-b border-cyber-gray/10 hover:bg-cyber-gray/15 transition-colors group cursor-pointer"
                                        >
                                            <td className="p-3 text-cyber-muted">{new Date(m.timestamp).toLocaleString()}</td>
                                            <td className="p-3">
                                                {m.ip !== 'Unknown' ? (
                                                    <span className="text-red-400 font-bold tracking-wider relative flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-red-500/80"></div>
                                                        {m.ip}
                                                    </span>
                                                ) : (
                                                    <span className="text-cyber-muted opacity-50">N/A</span>
                                                )}
                                            </td>
                                            <td className="p-3">
                                                <span className={`px-2 py-1 rounded text-[10px] uppercase font-bold tracking-wider ${isCritical ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'}`}>
                                                    {isCritical ? 'AUTO-BLOCKED' : 'DETECTED'}
                                                </span>
                                            </td>
                                            <td className="p-3 text-cyber-text/80 truncate max-w-lg" title={m.message}>
                                                {m.message}
                                            </td>
                                            <td className="p-3 text-center">
                                                {m.ip !== 'Unknown' && (
                                                    <button
                                                        className="p-1.5 bg-cyber-cyan/10 border border-cyber-cyan/30 text-cyber-cyan rounded group-hover:bg-cyber-cyan/20 transition-all opacity-40 group-hover:opacity-100"
                                                        title="Investigate IP in Threat Forensics"
                                                    >
                                                        <Search size={14} />
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Controls */}
                {mitigations.length > 0 && (
                    <div className="bg-cyber-gray/10 px-4 py-3 border border-t-0 border-cyber-gray/15 rounded-b flex justify-between items-center">
                        <span className="text-xs text-cyber-muted font-mono tracking-wider">
                            Showing {indexOfFirstItem + 1}-{Math.min(indexOfLastItem, mitigations.length)} of {mitigations.length}
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => paginate(currentPage - 1)}
                                disabled={currentPage === 1}
                                className="p-1 rounded bg-cyber-gray/20 border border-cyber-gray/30 text-cyber-cyan disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyber-gray/30"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <span className="px-3 py-1 text-sm font-mono text-cyber-text bg-cyber-gray/20 rounded">
                                {currentPage} / {totalPages || 1}
                            </span>
                            <button
                                onClick={() => paginate(currentPage + 1)}
                                disabled={currentPage === totalPages || totalPages === 0}
                                className="p-1 rounded bg-cyber-gray/20 border border-cyber-gray/30 text-cyber-cyan disabled:opacity-30 disabled:cursor-not-allowed hover:bg-cyber-gray/30"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SecurityDetail;
