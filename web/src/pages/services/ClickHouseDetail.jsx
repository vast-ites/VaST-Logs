import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Database, Search, RefreshCw, Activity, HardDrive, Zap, Layers } from 'lucide-react';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import StatCard from '../../components/service/StatCard';
import ChartPanel from '../../components/service/ChartPanel';

import { useHost } from '../../contexts/HostContext';

const ClickHouseDetail = () => {
    const { serviceName } = useParams();
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedHost } = useHost();

    // Priority: Global Context > URL Param
    const host = selectedHost || searchParams.get('host');

    // Sync URL if needed
    useEffect(() => {
        if (selectedHost && searchParams.get('host') !== selectedHost) {
            setSearchParams({ host: selectedHost });
        }
    }, [selectedHost, setSearchParams]);

    const navigate = useNavigate();

    const [timeRange, setTimeRange] = useState('5m');
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [logs, setLogs] = useState([]);
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

            // 1. Fetch Logs
            const svcQuery = serviceName || 'clickhouse';
            let logUrl = `/api/v1/logs/search?service=${svcQuery}&limit=100`;
            if (timeRange === 'custom' && customRange.from && customRange.to) {
                logUrl += `&after=${encodeURIComponent(new Date(customRange.from).toISOString())}&before=${encodeURIComponent(new Date(customRange.to).toISOString())}`;
            } else if (timeRange !== 'realtime' && timeRange !== 'custom') {
                let ms = 0;
                if (timeRange.endsWith('m')) ms = parseInt(timeRange) * 60 * 1000;
                else if (timeRange.endsWith('h')) ms = parseInt(timeRange) * 60 * 60 * 1000;
                else if (timeRange.endsWith('d')) ms = parseInt(timeRange) * 24 * 60 * 60 * 1000;
                if (ms > 0) logUrl += `&after=${new Date(Date.now() - ms).toISOString()}`;
            }
            if (host) logUrl += `&host=${host}`;

            const resLogs = await fetch(logUrl, { headers });
            if (resLogs.ok) {
                const data = await resLogs.json();
                setLogs(data.logs || []);
            } else {
                setLogs([]);
            }

            // 2. Fetch System Metrics
            let statsUrl = `/api/v1/services/clickhouse/db-stats?${timeParams}`;
            if (host) statsUrl += `&host=${host}`;

            const resStats = await fetch(statsUrl, { headers });
            if (resStats.ok) {
                const data = await resStats.json();
                if (data.stats) {
                    setStats(data.stats);
                } else {
                    setStats(null);
                }
            } else {
                setStats(null);
            }

        } catch (err) {
            console.error('Failed to fetch ClickHouse data:', err);
            setLogs([]);
            setStats(null);
        } finally {
            setLoading(false);
        }
    };

    // Reset state immediately when host changes to prevent stale data
    useEffect(() => {
        setStats(null);
        setLogs([]);
        setLoading(true);
    }, [host]);

    useEffect(() => {
        fetchData();
        setLoading(true); // Reset loading on host change
    }, [timeRange, customRange, serviceName, host]);

    useEffect(() => {
        if (refreshRate === 0 || timeRange === 'custom') return;
        const interval = setInterval(fetchData, refreshRate * 1000);
        return () => clearInterval(interval);
    }, [refreshRate, timeRange, serviceName, host]);

    // Helpers
    const formatBytes = (bytes) => {
        if (!bytes) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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
                            <Database className="w-6 h-6 text-yellow-500" />
                            ClickHouse Analytics
                        </h1>
                        <p className="text-cyber-muted mt-1">
                            OLAP Database Monitoring {host && <span className="text-cyber-cyan ml-2 font-mono">@{host}</span>}
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

            {/* Metrics Dashboard */}
            {stats ? (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Total Rows"
                            value={(stats.total_rows || 0).toLocaleString()}
                            icon={Layers}
                            color="text-blue-400"
                        />
                        <StatCard
                            title="Storage Used"
                            value={formatBytes(stats.total_bytes)}
                            icon={HardDrive}
                            color="text-purple-400"
                        />
                        <StatCard
                            title="Active Parts"
                            value={(stats.active_parts || 0).toLocaleString()}
                            icon={Database}
                        />
                        <StatCard
                            title="Background Tasks"
                            value={stats.background_pool_task || 0}
                            icon={Activity}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            title="Select Queries"
                            value={(stats.select_query || 0).toLocaleString()}
                            icon={Search}
                            trend="up"
                        />
                        <StatCard
                            title="Insert Queries"
                            value={(stats.insert_query || 0).toLocaleString()}
                            icon={Zap}
                            trend="up"
                        />
                        <StatCard
                            title="Memory Tracking"
                            value={formatBytes(stats.memory_tracking)}
                            icon={Activity}
                            status={stats.memory_tracking > 1024 * 1024 * 1024 ? 'warning' : 'ok'}
                        />
                        <StatCard
                            title="Uptime"
                            value={`${Math.floor((stats.uptime || 0) / 3600)}h`}
                            icon={RefreshCw}
                        />
                    </div>
                </>
            ) : (
                <div className="bg-cyber-dark/30 p-6 rounded-lg border border-cyber-dim text-center">
                    <p className="text-cyber-muted">System metrics not available. Ensure the agent is running on this host.</p>
                </div>
            )}

            {/* Logs Panel */}
            <div className="glass-panel p-4">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-cyber-text flex items-center gap-2">
                        <Search className="w-5 h-5 text-cyber-cyan" />
                        Recent Logs
                    </h3>
                    <span className="text-sm text-cyber-muted">{logs.length} entries</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-cyber-dim text-cyber-muted text-sm">
                                <th className="p-2">Timestamp</th>
                                <th className="p-2">Level</th>
                                <th className="p-2">Message</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm">
                            {loading && logs.length === 0 ? (
                                <tr><td colSpan="3" className="p-4 text-center text-cyber-muted">Loading logs...</td></tr>
                            ) : logs.length === 0 ? (
                                <tr><td colSpan="3" className="p-4 text-center text-cyber-muted">No logs found for this service.</td></tr>
                            ) : (
                                logs.map((log, i) => (
                                    <tr key={i} className="border-b border-cyber-gray/30 hover:bg-cyber-gray/10">
                                        <td className="p-2 text-cyber-muted whitespace-nowrap">
                                            {new Date(log.timestamp).toLocaleTimeString()}
                                        </td>
                                        <td className="p-2">
                                            <span className={`px-2 py-0.5 rounded text-xs ${log.level === 'error' ? 'bg-red-500/20 text-red-300' :
                                                log.level === 'warn' ? 'bg-yellow-500/20 text-yellow-300' :
                                                    'bg-blue-500/10 text-blue-300'
                                                }`}>
                                                {log.level || 'INFO'}
                                            </span>
                                        </td>
                                        <td className="p-2 text-cyber-text font-mono text-xs break-all">
                                            {log.message}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default ClickHouseDetail;
