import { useHost } from '../../contexts/HostContext';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Activity, HardDrive, FileText, AlertTriangle, Zap, Clock } from 'lucide-react';
import StatCard from '../../components/service/StatCard';
import ChartPanel from '../../components/service/ChartPanel';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import SetupInstructionBanner from '../../components/service/SetupInstructionBanner';
import { TablesWithoutIndexes, SlowQueries } from '../../components/service/DiagnosticSections';

const MongoDBDetail = () => {
    const { selectedHost } = useHost();
    const navigate = useNavigate();
    const [timeRange, setTimeRange] = useState('5m');
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [refreshRate, setRefreshRate] = useState(5);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            let timeParams = `duration=${timeRange}`;
            if (timeRange === 'custom' && customRange.from && customRange.to) {
                timeParams = `duration=custom&from=${encodeURIComponent(customRange.from)}&to=${encodeURIComponent(customRange.to)}`;
            }

            const res = await fetch(`/api/v1/services/mongodb/db-stats?${timeParams}&host=${selectedHost || ''}`, { headers });
            if (res.ok) {
                const data = await res.json();
                if (data.stats) {
                    setStats(data.stats);
                    setLastUpdated(data.timestamp);
                } else {
                    setStats(null);
                }
            } else {
                setStats(null);
            }
            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch MongoDB data:', err);
            setLoading(false);
        }
    };

    // Reset state immediately when host changes to prevent stale data
    useEffect(() => {
        setStats(null);
        setLoading(true);
    }, [selectedHost]);

    useEffect(() => { fetchData(); }, [timeRange, customRange, selectedHost]);
    useEffect(() => {
        if (refreshRate === 0 || timeRange === 'custom') return;
        const interval = setInterval(fetchData, refreshRate * 1000);
        return () => clearInterval(interval);
    }, [refreshRate, timeRange, selectedHost]);

    if (loading) return <div className="p-6 text-cyber-cyan">Loading MongoDB metrics...</div>;

    const isStale = lastUpdated && timeRange !== 'custom' && (new Date().getTime() - new Date(lastUpdated).getTime() > 600000);
    const hasData = stats && (stats.connections > 0 || (stats.op_counters && Object.values(stats.op_counters).reduce((a, b) => a + b, 0) > 0));
    const s = stats || {};
    const opCounters = s.op_counters || {};
    const totalOps = Object.values(opCounters).reduce((sum, v) => sum + (v || 0), 0);
    const currentOps = s.current_ops || [];

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
                            <Database className="w-6 h-6 text-green-400" />
                            MongoDB
                        </h1>
                        <p className="text-cyber-muted mt-1">
                            Document database monitoring
                            {s.replica_set_name && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-300">
                                    {s.replica_set_name} — {s.role || 'standalone'}
                                </span>
                            )}
                            {!s.replica_set_name && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded bg-gray-500/20 text-gray-300">
                                    Standalone
                                </span>
                            )}
                            {s.version && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded bg-green-500/10 text-green-300">
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

            {/* Dashboard or Empty State */}
            {hasData ? (
                <>
                    {/* Stats Row 1 */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard title="Connections" value={s.connections || 0}
                            max={s.max_connections} icon={Activity} />
                        <StatCard title="Total Operations" value={totalOps.toLocaleString()} icon={Zap} />
                        <StatCard title="Documents" value={(s.doc_count || 0).toLocaleString()} icon={FileText} />
                        <StatCard title="Memory Used" value={((s.memory_used || 0) / 1024 / 1024).toFixed(0)}
                            unit="MB" icon={HardDrive} />
                    </div>

                    {/* Stats Row 2 */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard title="Data Size" value={((s.data_size || 0) / 1024 / 1024 / 1024).toFixed(2)}
                            unit="GB" icon={HardDrive} />
                        <StatCard title="Storage Size" value={((s.storage_size || 0) / 1024 / 1024 / 1024).toFixed(2)}
                            unit="GB" icon={HardDrive} />
                        <StatCard title="Index Size" value={((s.index_size || 0) / 1024 / 1024).toFixed(2)}
                            unit="MB" icon={HardDrive} />
                        <StatCard title="Replication Lag" value={s.replication_lag || 0}
                            unit="sec" icon={Clock} status={s.replication_lag > 10 ? 'warning' : 'ok'} />
                    </div>

                    {/* Op Counters & Server Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4">Operation Counters</h3>
                            <div className="space-y-3">
                                {['query', 'insert', 'update', 'delete', 'command', 'getmore'].map(op => (
                                    <div key={op} className="flex justify-between items-center">
                                        <span className="text-cyber-muted capitalize">{op}</span>
                                        <div className="flex items-center gap-3">
                                            <div className="w-32 h-2 bg-cyber-gray/50 rounded-full overflow-hidden">
                                                <div className="h-full bg-green-400 rounded-full"
                                                    style={{ width: `${totalOps > 0 ? ((opCounters[op] || 0) / totalOps * 100) : 0}%` }} />
                                            </div>
                                            <span className="text-cyber-text font-semibold font-mono w-24 text-right">
                                                {(opCounters[op] || 0).toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4">Server & Replication Info</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Version</span>
                                    <span className="text-cyber-text font-mono">{s.version || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Uptime</span>
                                    <span className="text-cyber-text">{Math.floor((s.uptime || 0) / 3600)}h {Math.floor(((s.uptime || 0) % 3600) / 60)}m</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Role</span>
                                    <span className={`font-semibold ${s.role === 'primary' ? 'text-green-400' : s.role === 'secondary' ? 'text-yellow-400' : 'text-cyber-text'}`}>
                                        {s.role || 'standalone'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Replica Set</span>
                                    <span className="text-cyber-text">{s.replica_set_name || 'None'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Replication Lag</span>
                                    <span className={`font-semibold ${s.replication_lag > 5 ? 'text-red-400' : 'text-green-400'}`}>
                                        {s.replication_lag || 0}s
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Memory</span>
                                    <span className="text-cyber-text">{((s.memory_used || 0) / 1024 / 1024).toFixed(0)} MB</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Performance Diagnostics */}
                    <SetupInstructionBanner
                        database="MongoDB"
                        prerequisite="Database Profiler"
                        enabled={s.profiling_enabled}
                        setupInstructions={`1. Enable profiling for slow operations (>100ms):
    db.setProfilingLevel(1, { slowms: 100 })

2. Enable full profiling (all operations):
    db.setProfilingLevel(2)

3. Check profiling status:
    db.getProfilingStatus()

4. View profiled operations:
    db.system.profile.find().limit(10).sort({ ts: -1 })`}
                    />

                    {/* Diagnostic Sections */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <TablesWithoutIndexes tables={s.collections_without_indexes || []} />
                        <SlowQueries queries={s.slow_operations || []} />
                    </div>

                    {/* Current Operations */}
                    {currentOps.length > 0 && (
                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4 flex items-center gap-2">
                                <Activity className="w-5 h-5 text-green-400" />
                                Current Operations
                                <span className="ml-auto text-sm font-normal text-cyber-muted">{currentOps.length} ops</span>
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-cyber-dim">
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Op ID</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Operation</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Namespace</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Running (s)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {currentOps.slice(0, 20).map((op, idx) => (
                                            <tr key={idx} className={`border-b border-cyber-gray hover:bg-cyber-gray/30 ${(op.secs_running || 0) > 5 ? 'bg-yellow-500/5' : ''}`}>
                                                <td className="py-2 px-3 text-cyber-text font-mono text-sm">{op.opid || '-'}</td>
                                                <td className="py-2 px-3 text-green-400 text-sm">{op.op || '-'}</td>
                                                <td className="py-2 px-3 text-cyber-cyan text-sm font-mono">{op.ns || '-'}</td>
                                                <td className={`py-2 px-3 text-sm font-mono ${(op.secs_running || 0) > 5 ? 'text-yellow-400 font-bold' : 'text-cyber-text'}`}>
                                                    {op.secs_running || 0}s
                                                </td>
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
                    <h3 className="text-xl font-bold text-cyber-text">No MongoDB Data Found</h3>
                    <p className="text-cyber-muted mt-2 max-w-md">
                        MongoDB metrics are not available for this host.
                    </p>
                    <p className="text-cyber-muted text-sm mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200/80">
                        Ensure the Datavast Agent is running on this host and has access to MongoDB on port 27017.
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

export default MongoDBDetail;
