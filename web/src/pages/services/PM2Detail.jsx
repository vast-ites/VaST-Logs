import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Monitor, Search, Activity, HardDrive, Cpu, RefreshCw, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import StatCard from '../../components/service/StatCard';

import { useHost } from '../../contexts/HostContext';

const PM2Detail = () => {
    const { serviceName } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedHost } = useHost();

    const host = selectedHost || searchParams.get('host');

    useEffect(() => {
        if (selectedHost && searchParams.get('host') !== selectedHost) {
            setSearchParams({ host: selectedHost });
        }
    }, [selectedHost, setSearchParams]);

    const navigate = useNavigate();

    const [timeRange, setTimeRange] = useState('5m');
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [refreshRate, setRefreshRate] = useState(5);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            let timeParams = `duration=${timeRange}`;
            if (timeRange === 'custom' && customRange.from && customRange.to) {
                timeParams = `duration=custom&from=${encodeURIComponent(customRange.from)}&to=${encodeURIComponent(customRange.to)}`;
            }

            let statsUrl = `/api/v1/services/pm2/db-stats?${timeParams}`;
            if (host) statsUrl += `&host=${host}`;

            const res = await fetch(statsUrl, { headers });
            if (res.ok) {
                const data = await res.json();
                if (data.stats) {
                    setStats(data.stats);
                } else {
                    setStats(null);
                }
            } else {
                setStats(null);
            }
        } catch (err) {
            console.error('Failed to fetch PM2 data:', err);
            setStats(null);
        } finally {
            setLoading(false);
        }
    };

    // Reset state immediately when host changes to prevent stale data
    useEffect(() => {
        setStats(null);
        setLoading(true);
    }, [host]);

    useEffect(() => {
        fetchData();
        setLoading(true);
    }, [timeRange, customRange, serviceName, host]);

    useEffect(() => {
        if (refreshRate === 0 || timeRange === 'custom') return;
        const interval = setInterval(fetchData, refreshRate * 1000);
        return () => clearInterval(interval);
    }, [refreshRate, timeRange, serviceName, host]);

    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const formatUptime = (seconds) => {
        if (!seconds) return '0s';
        const d = Math.floor(seconds / 86400);
        const h = Math.floor((seconds % 86400) / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (d > 0) return `${d}d ${h}h`;
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    const StatusBadge = ({ status }) => {
        const colors = {
            online: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
            errored: 'bg-red-500/20 text-red-300 border-red-500/30',
            stopped: 'bg-gray-500/20 text-gray-300 border-gray-500/30',
        };
        const icons = {
            online: <CheckCircle className="w-3 h-3" />,
            errored: <XCircle className="w-3 h-3" />,
            stopped: <AlertTriangle className="w-3 h-3" />,
        };
        return (
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs border ${colors[status] || colors.stopped}`}>
                {icons[status] || icons.stopped}
                {status}
            </span>
        );
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/services')}
                        className="p-2 rounded-lg bg-cyber-gray/50 hover:bg-cyber-gray/80 border border-cyber-dim transition-colors">
                        <ArrowLeft className="w-5 h-5 text-cyber-cyan" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-cyber-text flex items-center gap-2">
                            <Monitor className="w-6 h-6 text-green-500" />
                            PM2 Process Manager
                        </h1>
                        <p className="text-cyber-muted mt-1">
                            Application Process Monitoring {host && <span className="text-cyber-cyan ml-2 font-mono">@{host}</span>}
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

            {loading && !stats ? (
                <div className="flex items-center justify-center p-12">
                    <RefreshCw className="w-8 h-8 text-cyber-cyan animate-spin" />
                </div>
            ) : stats ? (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Total Processes"
                            value={stats.total_processes || 0}
                            icon={Monitor}
                            color="text-blue-400"
                        />
                        <StatCard
                            title="Online"
                            value={stats.online_count || 0}
                            icon={CheckCircle}
                            color="text-emerald-400"
                            status={stats.error_count > 0 ? 'warning' : 'ok'}
                        />
                        <StatCard
                            title="Total Memory"
                            value={formatBytes(stats.total_memory)}
                            icon={HardDrive}
                            color="text-purple-400"
                        />
                        <StatCard
                            title="Total CPU"
                            value={`${(stats.total_cpu || 0).toFixed(1)}%`}
                            icon={Cpu}
                        />
                    </div>

                    {/* Restart Alerting Box */}
                    {stats.processes && stats.processes.some(p => p.restarts > 10) && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                            <AlertTriangle className="w-6 h-6 text-red-400 shrink-0 mt-0.5" />
                            <div>
                                <h4 className="text-red-400 font-semibold mb-1">Process Restart Alert</h4>
                                <p className="text-sm text-red-300/80 mb-2">
                                    One or more processes on this Node.js host are experiencing high restart rates. This indicates continuous crashing or failure during live testing/production.
                                </p>
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {stats.processes.filter(p => p.restarts > 10).map((p, idx) => (
                                        <span key={idx} className="bg-red-500/20 text-red-200 px-2 py-1 rounded text-xs font-mono border border-red-500/20">
                                            {p.name} ({p.restarts} restarts)
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Process Table */}
                    <div className="glass-panel p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-cyber-text flex items-center gap-2">
                                <Activity className="w-5 h-5 text-cyber-cyan" />
                                Process List
                            </h3>
                            <span className="text-sm text-cyber-muted">
                                {stats.error_count > 0 && (
                                    <span className="text-red-400 mr-3">
                                        <AlertTriangle className="w-4 h-4 inline mr-1" />
                                        {stats.error_count} errored
                                    </span>
                                )}
                                {stats.total_restarts > 0 && (
                                    <span className="text-yellow-400">
                                        {stats.total_restarts} total restarts
                                    </span>
                                )}
                            </span>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-cyber-dim text-cyber-muted text-sm">
                                        <th className="p-2">ID</th>
                                        <th className="p-2">Name</th>
                                        <th className="p-2">Status</th>
                                        <th className="p-2 text-right">CPU</th>
                                        <th className="p-2 text-right">Memory</th>
                                        <th className="p-2 text-right">Restarts</th>
                                        <th className="p-2 text-right">Uptime</th>
                                        <th className="p-2">Mode</th>
                                        <th className="p-2">Node v</th>
                                    </tr>
                                </thead>
                                <tbody className="text-sm">
                                    {(stats.processes || []).length === 0 ? (
                                        <tr>
                                            <td colSpan="8" className="p-4 text-center text-cyber-muted">
                                                No PM2 processes running.
                                            </td>
                                        </tr>
                                    ) : (
                                        stats.processes.map((proc, i) => (
                                            <tr key={i} className="border-b border-cyber-gray/30 hover:bg-cyber-gray/10 transition-colors">
                                                <td className="p-2 text-cyber-muted font-mono">{proc.pm_id}</td>
                                                <td className="p-2 text-cyber-text font-semibold">{proc.name}</td>
                                                <td className="p-2"><StatusBadge status={proc.status} /></td>
                                                <td className="p-2 text-right font-mono">
                                                    <span className={proc.cpu > 80 ? 'text-red-400' : proc.cpu > 50 ? 'text-yellow-400' : 'text-cyber-text'}>
                                                        {(proc.cpu || 0).toFixed(1)}%
                                                    </span>
                                                </td>
                                                <td className="p-2 text-right font-mono text-cyber-text">
                                                    {formatBytes(proc.memory)}
                                                </td>
                                                <td className="p-2 text-right font-mono">
                                                    <span className={proc.restarts > 10 ? 'text-red-400' : proc.restarts > 0 ? 'text-yellow-400' : 'text-cyber-muted'}>
                                                        {proc.restarts}
                                                    </span>
                                                </td>
                                                <td className="p-2 text-right text-cyber-muted">
                                                    {formatUptime(proc.uptime)}
                                                </td>
                                                <td className="p-2">
                                                    <span className="px-2 py-0.5 rounded text-xs bg-cyber-gray/30 text-cyber-muted border border-cyber-dim">
                                                        {proc.exec_mode || 'fork'}
                                                    </span>
                                                </td>
                                                <td className="p-2 text-green-400 font-mono text-xs">
                                                    {proc.node_version || 'N/A'}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-cyber-dark/30 rounded-lg border border-cyber-dim">
                    <Monitor className="w-16 h-16 text-cyber-muted/30 mb-4" />
                    <h2 className="text-xl font-bold text-cyber-text mb-2">No PM2 Data Found</h2>
                    <p className="text-cyber-muted max-w-md">
                        PM2 is not detected or no data has been collected for this host.
                        Ensure the DataVast agent is running with PM2 collection enabled.
                    </p>
                </div>
            )}
        </div>
    );
};

export default PM2Detail;
