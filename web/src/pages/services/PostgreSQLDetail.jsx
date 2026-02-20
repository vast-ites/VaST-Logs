import { useHost } from '../../contexts/HostContext';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Database, Activity, Lock, AlertCircle, HardDrive, Clock, AlertTriangle } from 'lucide-react';
import StatCard from '../../components/service/StatCard';
import ChartPanel from '../../components/service/ChartPanel';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import SetupInstructionBanner from '../../components/service/SetupInstructionBanner';
import { TablesWithoutIndexes, HighIOTables, SlowQueries } from '../../components/service/DiagnosticSections';

const PostgreSQLDetail = () => {
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

            const res = await fetch(`/api/v1/services/postgresql/db-stats?${timeParams}&host=${selectedHost || ''}`, { headers });
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
            console.error('Failed to fetch PostgreSQL data:', err);
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

    if (loading) return <div className="p-6 text-cyber-cyan">Loading PostgreSQL metrics...</div>;

    const isStale = lastUpdated && timeRange !== 'custom' && (new Date().getTime() - new Date(lastUpdated).getTime() > 600000);
    const hasData = stats && (stats.active_connections > 0 || stats.transactions_per_sec > 0);
    const s = stats || {};
    const connUsage = s.max_connections ? ((s.total_connections / s.max_connections) * 100).toFixed(1) : 0;
    const activity = s.activity || [];
    const locks = s.locks || [];
    const tableStats = s.table_stats || [];

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
                            <Database className="w-6 h-6 text-cyan-400" />
                            PostgreSQL Database
                        </h1>
                        <p className="text-cyber-muted mt-1">
                            Connection & query monitoring
                            {s.replication_lag > 0 && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded bg-yellow-500/20 text-yellow-300">
                                    Standby — Lag: {s.replication_lag}s
                                </span>
                            )}
                            {s.replication_lag === 0 && (
                                <span className="ml-2 px-2 py-0.5 text-xs rounded bg-green-500/20 text-green-300">
                                    ● Primary
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
                        <StatCard title="Active Connections" value={s.active_connections || 0} icon={Activity} status="ok" />
                        <StatCard title="Idle Connections" value={s.idle_connections || 0} icon={Database} />
                        <StatCard title="Cache Hit Ratio" value={(s.cache_hit_ratio || 0).toFixed(1)}
                            unit="%" icon={Activity} status={s.cache_hit_ratio > 90 ? 'ok' : 'warning'} />
                        <StatCard title="TPS" value={(s.transactions_per_sec || 0).toFixed(2)} icon={Activity} trend="up" />
                    </div>

                    {/* Stats Row 2 */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard title="Database Size" value={((s.database_size || 0) / 1024 / 1024 / 1024).toFixed(2)}
                            unit="GB" icon={HardDrive} />
                        <StatCard title="Dead Tuples" value={(s.dead_tuples || 0).toLocaleString()}
                            icon={AlertCircle} status={s.dead_tuples > 10000 ? 'warning' : 'ok'} />
                        <StatCard title="Locks" value={s.locks_count || 0}
                            icon={Lock} status={s.locks_count > 50 ? 'warning' : 'ok'} />
                        <StatCard title="Long Queries (>5s)" value={s.long_running_queries || 0}
                            icon={Clock} status={s.long_running_queries > 0 ? 'warning' : 'ok'} />
                    </div>

                    {/* Connection Usage & Cluster */}
                    <div className="grid grid-cols-2 gap-4">
                        <ChartPanel title="Connection Usage" subtitle="Current vs Maximum">
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center">
                                    <div className="text-6xl font-bold text-cyber-cyan">{connUsage}%</div>
                                    <div className="text-cyber-muted mt-2">
                                        {s.total_connections || 0} / {s.max_connections || 0} connections
                                    </div>
                                </div>
                            </div>
                        </ChartPanel>

                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4">Cluster Status</h3>
                            <div className="space-y-3">
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Role</span>
                                    <span className={`font-semibold ${s.replication_lag === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                                        {s.replication_lag > 0 ? 'Standby' : 'Primary'}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Replication Lag</span>
                                    <span className={`font-semibold ${s.replication_lag > 5 ? 'text-red-400' : 'text-green-400'}`}>
                                        {s.replication_lag || 0} seconds
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Active / Idle</span>
                                    <span className="text-cyber-text font-semibold">{s.active_connections || 0} / {s.idle_connections || 0}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-cyber-muted">Dead Tuples</span>
                                    <span className="text-cyber-text">{(s.dead_tuples || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Performance Diagnostics */}
                    <SetupInstructionBanner
                        database="PostgreSQL"
                        prerequisite="pg_stat_statements"
                        enabled={s.pg_stat_statements?.enabled}
                        setupInstructions={`1. Edit postgresql.conf:
   shared_preload_libraries = 'pg_stat_statements'
   pg_stat_statements.track = all

2. Restart PostgreSQL:
   sudo systemctl restart postgresql

3. Create extension:
   CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

4. Verify:
   SELECT count(*) FROM pg_stat_statements;`}
                    />

                    {/* Diagnostic Sections */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                        <TablesWithoutIndexes tables={s.tables_without_indexes || []} />
                        <HighIOTables tables={s.high_io_tables || []} />
                    </div>

                    <div className="mb-6">
                        <SlowQueries queries={s.slow_queries || []} />
                    </div>

                    {/* Active Queries */}
                    <div className="glass-panel p-4">
                        <h3 className="text-lg font-semibold text-cyber-text mb-4 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-cyan-400" />
                            Active Queries
                            <span className="ml-auto text-sm font-normal text-cyber-muted">{activity.length} queries</span>
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-cyber-dim">
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">PID</th>
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">User</th>
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">Database</th>
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">Client</th>
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">Duration</th>
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">State</th>
                                        <th className="text-left py-2 px-3 text-cyber-muted font-medium">Query</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {activity.length === 0 ? (
                                        <tr><td colSpan="7" className="text-center py-8 text-cyber-muted">No active queries</td></tr>
                                    ) : (
                                        activity.slice(0, 25).map((a, idx) => (
                                            <tr key={idx} className={`border-b border-cyber-gray hover:bg-cyber-gray/30 ${(a.Duration || a.duration || 0) > 5 ? 'bg-yellow-500/5' : ''}`}>
                                                <td className="py-2 px-3 text-cyber-text font-mono text-sm">{a.PID || a.pid}</td>
                                                <td className="py-2 px-3 text-cyber-cyan text-sm">{a.User || a.user}</td>
                                                <td className="py-2 px-3 text-cyber-text text-sm">{a.Database || a.database}</td>
                                                <td className="py-2 px-3 text-cyber-muted text-sm font-mono">{a.ClientAddr || a.client_addr || '-'}</td>
                                                <td className={`py-2 px-3 text-sm font-mono ${(a.Duration || a.duration || 0) > 5 ? 'text-yellow-400 font-bold' : 'text-cyber-text'}`}>
                                                    {(a.Duration || a.duration || 0).toFixed(1)}s
                                                    {(a.Duration || a.duration || 0) > 5 && ' ⚠'}
                                                </td>
                                                <td className="py-2 px-3 text-cyber-muted text-sm">{a.State || a.state}</td>
                                                <td className="py-2 px-3 text-cyber-text text-sm font-mono truncate max-w-sm">{a.Query || a.query}</td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Table Stats */}
                    {tableStats.length > 0 && (
                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4 flex items-center gap-2">
                                <HardDrive className="w-5 h-5 text-cyan-400" />
                                Top Tables by Size
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-cyber-dim">
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Table</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Size</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Live Tuples</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Dead Tuples</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Seq Scans</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Idx Scans</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tableStats.map((t, idx) => (
                                            <tr key={idx} className="border-b border-cyber-gray hover:bg-cyber-gray/30">
                                                <td className="py-2 px-3 text-cyber-cyan text-sm font-mono">{t.table_name}</td>
                                                <td className="py-2 px-3 text-cyber-text text-sm">{t.size}</td>
                                                <td className="py-2 px-3 text-green-400 text-sm">{(t.live_tuples || 0).toLocaleString()}</td>
                                                <td className={`py-2 px-3 text-sm ${(t.dead_tuples || 0) > 1000 ? 'text-yellow-400' : 'text-cyber-text'}`}>
                                                    {(t.dead_tuples || 0).toLocaleString()}
                                                </td>
                                                <td className="py-2 px-3 text-cyber-muted text-sm">{(t.seq_scans || 0).toLocaleString()}</td>
                                                <td className="py-2 px-3 text-cyber-muted text-sm">{(t.index_scans || 0).toLocaleString()}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Locks */}
                    {locks.length > 0 && (
                        <div className="glass-panel p-4">
                            <h3 className="text-lg font-semibold text-cyber-text mb-4 flex items-center gap-2">
                                <Lock className="w-5 h-5 text-yellow-400" />
                                Waiting Locks
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-cyber-dim">
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Type</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Mode</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">Relation</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">PID</th>
                                            <th className="text-left py-2 px-3 text-cyber-muted font-medium">User</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {locks.map((l, idx) => (
                                            <tr key={idx} className="border-b border-cyber-gray hover:bg-cyber-gray/30">
                                                <td className="py-2 px-3 text-cyber-text text-sm">{l.lock_type}</td>
                                                <td className="py-2 px-3 text-yellow-400 text-sm">{l.mode}</td>
                                                <td className="py-2 px-3 text-cyber-cyan text-sm font-mono">{l.relation || '-'}</td>
                                                <td className="py-2 px-3 text-cyber-text text-sm">{l.pid}</td>
                                                <td className="py-2 px-3 text-cyber-muted text-sm">{l.user}</td>
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
                    <h3 className="text-xl font-bold text-cyber-text">No PostgreSQL Data Found</h3>
                    <p className="text-cyber-muted mt-2 max-w-md">
                        PostgreSQL metrics are not available for this host.
                    </p>
                    <p className="text-cyber-muted text-sm mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200/80">
                        Ensure the Datavast Agent is running on this host and has access to PostgreSQL on port 5432.
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

export default PostgreSQLDetail;
