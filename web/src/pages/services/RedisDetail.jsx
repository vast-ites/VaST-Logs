import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Database, Activity, Zap, HardDrive, TrendingUp, Clock, AlertTriangle } from 'lucide-react';
import StatCard from '../../components/service/StatCard';
import ChartPanel from '../../components/service/ChartPanel';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import { LargestKeys, ExpensiveCommands } from '../../components/service/DiagnosticSections';

import { useHost } from '../../contexts/HostContext';

const RedisDetail = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { selectedHost } = useHost();

    // Priority: Global Context > URL Param
    // If global context changes, we should use it.
    // If URL param exists but differs from global context (and global is not empty), use global.

    const host = selectedHost || searchParams.get('host');

    // Sync URL if needed
    useEffect(() => {
        if (selectedHost && searchParams.get('host') !== selectedHost) {
            setSearchParams({ host: selectedHost });
        }
    }, [selectedHost, setSearchParams]);
    const [timeRange, setTimeRange] = useState('5m');
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [refreshRate, setRefreshRate] = useState(5);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = async () => {
        try {
            // Don't clear immediately to avoid flickering, but handle null response correctly
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            let timeParams = `duration=${timeRange}`;
            if (timeRange === 'custom' && customRange.from && customRange.to) {
                timeParams = `duration=custom&from=${encodeURIComponent(customRange.from)}&to=${encodeURIComponent(customRange.to)}`;
            }

            let url = `/api/v1/services/redis/db-stats?${timeParams}`;
            if (host) url += `&host=${host}`;
            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                if (data.stats) {
                    setStats(data.stats);
                    setLastUpdated(data.timestamp);
                } else {
                    setStats(null); // Clear stats if host return null (e.g. service not found)
                }
            } else {
                setStats(null);
            }
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch Redis data:', err);
            setStats(null);
            setLoading(false);
        }
    };

    // Reset stats when host changes to prevent ghost data
    useEffect(() => {
        setStats(null);
        setLoading(true);
    }, [host]);

    useEffect(() => { fetchData(); }, [timeRange, customRange, host]);
    useEffect(() => {
        if (refreshRate === 0 || timeRange === 'custom') return;
        const interval = setInterval(fetchData, refreshRate * 1000);
        return () => clearInterval(interval);
    }, [refreshRate, timeRange, host]);

    if (loading) return <div className="p-6 text-cyber-cyan">Loading Redis metrics...</div>;

    const s = stats || {};
    const memUsage = s.max_memory ? ((s.used_memory / s.max_memory) * 100).toFixed(1) : 0;
    const keyspace = s.keyspace || [];
    const slowLog = s.slow_log || [];

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate('/services')}
                        className="p-2 rounded-lg bg-cyber-gray/50 hover:bg-cyber-gray/80 border border-cyber-dim transition-colors">
                        <ArrowLeft className="w-5 h-5 text-cyber-cyan" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-cyber-text flex items-center gap-2">
                            <Database className="w-6 h-6 text-red-400" />
                            Redis Cache
                        </h1>
                        <p className="text-cyber-muted mt-1">
                            Memory & performance monitoring
                            {host && <span className="text-cyber-cyan ml-2 font-mono">@{host}</span>}
                            {s.role && (
                                <span className={`ml-2 px-2 py-0.5 text-xs rounded ${s.role === 'master' ? 'bg-green-500/20 text-green-300' : 'bg-yellow-500/20 text-yellow-300'}`}>
                                    ● {s.role}
                                </span>
                            )}
                            {s.version && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded bg-red-500/10 text-red-300">
                                    v{s.version}
                                </span>
                            )}
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

            {/* Main Content or Empty State */}
            {stats ? (
                <>
                    {/* Stats Row 1 */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard title="Connected Clients" value={s.connected_clients || 0} icon={Activity} />
                        <StatCard title="Ops/Sec" value={s.ops_per_sec || 0} icon={Zap} trend="up" />
                        <StatCard title="Hit Rate" value={(s.hit_rate || 0).toFixed(1)}
                            unit="%" icon={TrendingUp} status={s.hit_rate > 80 ? 'ok' : 'warning'} />
                        <StatCard title="Blocked Clients" value={s.blocked_clients || 0}
                            icon={AlertTriangle} status={s.blocked_clients > 0 ? 'warning' : 'ok'} />
                    </div>

                    {/* Stats Row 2 */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard title="Evicted Keys" value={(s.evicted_keys || 0).toLocaleString()}
                            icon={Activity} status={s.evicted_keys > 1000 ? 'warning' : 'ok'} />
                        <StatCard title="Expired Keys" value={(s.expired_keys || 0).toLocaleString()} icon={Clock} />
                        <StatCard title="Total Commands" value={(s.total_commands || 0).toLocaleString()} icon={Zap} />
                        <StatCard title="Replication Lag" value={s.replication_lag || 0}
                            unit="sec" icon={Database} status={s.replication_lag > 5 ? 'warning' : 'ok'} />
                    </div>

                    {/* Memory & Cluster Status */}
                    <div className="grid grid-cols-2 gap-4">
                        <ChartPanel title="Memory Usage" subtitle="Current vs Maximum">
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <div className="text-6xl font-bold text-red-400">{memUsage}%</div>
                                    <div className="text-cyber-muted mt-2">
                                        {(s.used_memory / 1024 / 1024 || 0).toFixed(2)} MB /
                                        {s.max_memory > 0 ? ` ${(s.max_memory / 1024 / 1024).toFixed(2)} MB` : ' No limit'}
                                    </div>
                                    <div className="text-cyber-muted mt-1 text-sm">
                                        Fragmentation: {(s.memory_fragmentation || 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        </ChartPanel>

                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4">Cluster & Server Info</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Role</span>
                                    <span className={`font-semibold ${s.role === 'master' ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {s.role || 'standalone'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Uptime</span>
                                    <span className="text-cyber-text">{Math.floor((s.uptime_seconds || 0) / 3600)}h {Math.floor(((s.uptime_seconds || 0) % 3600) / 60)}m</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Keyspace Hits</span>
                                    <span className="text-green-400 font-semibold">{(s.keyspace_hits || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Keyspace Misses</span>
                                    <span className="text-red-400 font-semibold">{(s.keyspace_misses || 0).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Memory Fragmentation</span>
                                    <span className={`font-semibold ${s.memory_fragmentation > 1.5 ? 'text-yellow-400' : 'text-green-400'}`}>
                                        {(s.memory_fragmentation || 0).toFixed(2)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Diagnostic Sections */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <LargestKeys keys={s.largest_keys} />
                        <ExpensiveCommands commands={s.expensive_commands} />
                    </div>

                    {s.eviction_rate_per_sec > 0 && (
                        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
                            <div className="flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 text-yellow-500" />
                                <div>
                                    <p className="text-yellow-500 font-semibold">High Eviction Rate Detected</p>
                                    <p className="text-cyber-gray-300 text-sm mt-1">
                                        Redis is evicting {s.eviction_rate_per_sec.toFixed(2)} keys/sec. Consider increasing maxmemory or reviewing key TTLs.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Keyspace Info */}
                    {keyspace.length > 0 && (
                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4">Keyspace</h3>
                            <div className="grid grid-cols-3 gap-4">
                                {keyspace.map((db, idx) => (
                                    <div key={idx} className="bg-cyber-dark/50 rounded-lg p-3 border border-cyber-dim">
                                        <div className="text-red-400 font-semibold">{db.database}</div>
                                        <div className="text-cyber-muted text-sm mt-1">
                                            Keys: {db.keys || 0} | Expires: {db.expires || 0}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Slow Log */}
                    {slowLog.length > 0 && (
                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4 flex items-center gap-2">
                                <Clock className="w-5 h-5 text-yellow-400" />
                                Slow Log
                                <span className="ml-auto text-sm font-normal text-cyber-muted">{slowLog.length} entries</span>
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-cyber-dim">
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">ID</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Duration (μs)</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Command</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {slowLog.map((entry, idx) => (
                                            <tr key={idx} className="border-b border-cyber-gray hover:bg-cyber-gray/30">
                                                <td className="py-2 px-3 text-cyber-text font-mono text-sm">{entry.id}</td>
                                                <td className="py-2 px-3 text-yellow-400 font-mono text-sm">{entry.duration}</td>
                                                <td className="py-2 px-3 text-cyber-text text-sm font-mono truncate max-w-lg">{JSON.stringify(entry.command)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                <div className="flex flex-col items-center justify-center p-12 text-center bg-cyber-dark/30 rounded-lg border border-cyber-dim">
                    <div className="bg-cyber-dark/50 p-4 rounded-full mb-4">
                        <Database className="w-12 h-12 text-cyber-gray" />
                    </div>
                    <h3 className="text-xl font-bold text-cyber-text">No Redis Data Found</h3>
                    <p className="text-cyber-muted mt-2 max-w-md">
                        Redis metrics are not available for <span className="text-cyber-cyan font-mono">@{host}</span>.
                    </p>
                    <p className="text-cyber-muted text-sm mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200/80">
                        Ensure the Datavast Agent is running on this host and has access to Redis on port 6379.
                    </p>
                </div>
            )}

            {lastUpdated && (
                <div className="text-right text-cyber-muted text-xs">
                    Last updated: {new Date(lastUpdated).toLocaleString()}
                </div>
            )}
        </div>
    );
};

export default RedisDetail;
