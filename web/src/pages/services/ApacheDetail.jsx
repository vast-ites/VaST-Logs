import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe, Activity, HardDrive, Users, TrendingUp, AlertCircle } from 'lucide-react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import StatCard from '../../components/service/StatCard';
import ChartPanel from '../../components/service/ChartPanel';
import TimeRangeSelector from '../../components/common/TimeRangeSelector';
import RefreshRateSelector from '../../components/service/RefreshRateSelector';
import { useHost } from '../../contexts/HostContext';
import { useSearchParams } from 'react-router-dom';

const ApacheDetail = () => {
    const { serviceName } = useParams();
    const { selectedHost } = useHost();
    const navigate = useNavigate();

    const [timeRange, setTimeRange] = useState('5m');
    const [customRange, setCustomRange] = useState({ from: null, to: null });
    const [refreshRate, setRefreshRate] = useState(1);
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [accessLogs, setAccessLogs] = useState([]);
    const [geoStats, setGeoStats] = useState(null);
    const [topIPs, setTopIPs] = useState([]);

    // Fetch data
    const fetchData = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            const baseUrl = `/api/v1/services/${serviceName}`;

            let timeParams = `duration=${timeRange}`;
            if (timeRange === 'custom' && customRange.from && customRange.to) {
                timeParams = `duration=custom&from=${encodeURIComponent(customRange.from)}&to=${encodeURIComponent(customRange.to)}`;
            }

            // Fetch all data in parallel
            const [statsRes, logsRes, geoRes, ipsRes] = await Promise.all([
                fetch(`${baseUrl}/stats?${timeParams}&host=${selectedHost || ''}`, { headers }),
                fetch(`${baseUrl}/access-logs?${timeParams}&limit=1000&host=${selectedHost || ''}`, { headers }),
                fetch(`${baseUrl}/geo?${timeParams}&host=${selectedHost || ''}`, { headers }),
                fetch(`${baseUrl}/top-ips?${timeParams}&limit=10&host=${selectedHost || ''}`, { headers }),
            ]);

            if (statsRes.ok) setStats(await statsRes.json());
            if (logsRes.ok) setAccessLogs((await logsRes.json()).logs || []);
            if (geoRes.ok) setGeoStats(await geoRes.json());
            if (ipsRes.ok) setTopIPs((await ipsRes.json()).by_requests || []);

            setLoading(false);
        } catch (err) {
            console.error('Failed to fetch service data:', err);
            setLoading(false);
        }
    };

    // Reset state immediately when host changes to prevent stale data flash
    useEffect(() => {
        setStats(null);
        setAccessLogs([]);
        setGeoStats(null);
        setTopIPs([]);
        setLoading(true);
    }, [selectedHost]);

    useEffect(() => {
        fetchData();
    }, [timeRange, customRange, serviceName, selectedHost]);

    // Auto-refresh — must include selectedHost so the interval uses the correct closure
    useEffect(() => {
        if (refreshRate === 0 || timeRange === 'custom') return;

        const interval = setInterval(fetchData, refreshRate * 1000);
        return () => clearInterval(interval);
    }, [refreshRate, timeRange, selectedHost]);

    // Process status code data for pie chart
    const hasData = stats && (stats.total_requests > 0 || stats.total_bytes > 0);
    const statusCodeData = hasData ? [
        { name: '2xx Success', value: stats.status_2xx || 0, color: '#10b981' },
        { name: '3xx Redirect', value: stats.status_3xx || 0, color: '#3b82f6' },
        { name: '4xx Client Error', value: stats.status_4xx || 0, color: '#f59e0b' },
        { name: '5xx Server Error', value: stats.status_5xx || 0, color: '#ef4444' },
    ].filter(d => d.value > 0) : [];

    if (loading) {
        return (
            <div className="p-6">
                <div className="text-cyber-cyan">Loading {serviceName} metrics...</div>
            </div>
        );
    }

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => navigate('/services')}
                        className="p-2 rounded-lg hover:bg-cyber-gray/50 border border-cyber-dim transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-cyber-cyan" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-cyber-text capitalize flex items-center gap-2">
                            <Globe className="w-6 h-6 text-cyber-cyan" />
                            {serviceName} Web Server
                        </h1>
                        <p className="text-cyber-muted mt-1">Real-time traffic analysis & monitoring</p>
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
                    {/* Stats Cards */}
                    <div className="grid grid-cols-4 gap-4">
                        <StatCard
                            title="Total Requests"
                            value={stats?.total_requests || 0}
                            icon={Activity}
                            trend="up"
                            subtitle={`${timeRange} period`}
                        />
                        <StatCard
                            title="Success Rate"
                            value={stats?.total_requests ? ((stats.status_2xx / stats.total_requests) * 100).toFixed(1) : 0}
                            unit="%"
                            icon={TrendingUp}
                            status={stats?.status_2xx / stats?.total_requests > 0.9 ? 'ok' : 'warning'}
                        />
                        <StatCard
                            title="Bandwidth"
                            value={(stats?.total_bytes / 1024 / 1024 || 0).toFixed(2)}
                            unit="MB"
                            icon={HardDrive}
                        />
                        <StatCard
                            title="Errors (4xx/5xx)"
                            value={(stats?.status_4xx || 0) + (stats?.status_5xx || 0)}
                            icon={AlertCircle}
                            status={(stats?.status_4xx + stats?.status_5xx) > 100 ? 'warning' : 'ok'}
                        />
                    </div>

                    {/* Charts Row 1 */}
                    <div className="grid grid-cols-2 gap-4">
                        <ChartPanel title="HTTP Status Codes" subtitle="Request distribution by status">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={statusCodeData}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                        outerRadius={80}
                                        fill="#8884d8"
                                        dataKey="value"
                                    >
                                        {statusCodeData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgb(var(--cyber-dark))', borderColor: 'rgba(var(--cyber-cyan), 0.3)', color: 'rgb(var(--text-main))' }}
                                        itemStyle={{ color: 'rgb(var(--text-main))' }}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        </ChartPanel>

                        <ChartPanel title="Top Countries" subtitle="Requests by geographic location">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={geoStats?.top_countries || []}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(156, 163, 175, 0.2)" />
                                    <XAxis dataKey="country" stroke="rgb(var(--text-muted))" />
                                    <YAxis stroke="rgb(var(--text-muted))" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: 'rgb(var(--cyber-dark))', border: '1px solid rgba(var(--cyber-cyan), 0.3)' }}
                                        labelStyle={{ color: 'rgb(var(--text-main))' }}
                                        itemStyle={{ color: 'rgb(var(--text-main))' }}
                                    />
                                    <Bar dataKey="count" fill="rgb(var(--cyber-cyan))" />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartPanel>
                    </div>

                    {/* Top IPs Table */}
                    <div className="glass-panel rounded-lg p-4">
                        <h3 className="text-lg font-semibold text-cyber-text mb-4 flex items-center gap-2">
                            <Users className="w-5 h-5 text-cyber-cyan" />
                            Top Client IPs
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-cyber-gray/50 text-cyber-muted text-xs uppercase">
                                    <tr>
                                        <th className="py-3 px-4 text-left">IP Address</th>
                                        <th className="py-3 px-4 text-left">Latest URL</th>
                                        <th className="py-3 px-4 text-left">Country</th>
                                        <th className="py-3 px-4 text-left">City</th>
                                        <th className="py-3 px-4 text-left">State</th>
                                        <th className="py-3 px-4 text-left">Requests</th>
                                        <th className="py-3 px-4 text-left">Bandwidth</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-cyber-gray text-sm">
                                    {topIPs.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="py-4 text-center text-cyber-muted">
                                                No recent activity
                                            </td>
                                        </tr>
                                    ) : (
                                        topIPs.map((ip, i) => (
                                            <tr key={i} className="hover:bg-cyber-gray/10 transition-colors">
                                                <td className="py-3 px-4 font-mono text-cyber-cyan">{ip.ip}</td>
                                                <td className="py-3 px-4 text-cyber-muted">
                                                    {ip.domain && ip.domain !== 'default' && ip.domain !== 'unknown' ? (
                                                        <a
                                                            href={`http://${ip.domain}${ip.path || ''}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-cyber-cyan hover:text-cyan-300 hover:underline truncate block max-w-[200px]"
                                                            title={`http://${ip.domain}${ip.path || ''}`}
                                                        >
                                                            {ip.domain}{ip.path}
                                                        </a>
                                                    ) : (
                                                        <span className="text-cyber-muted/70">{ip.domain || '-'}</span>
                                                    )}
                                                </td>
                                                <td className="py-3 px-4 text-cyber-muted">{ip.country || 'Unknown'}</td>
                                                <td className="py-3 px-4 text-cyber-muted">{ip.city || '-'}</td>
                                                <td className="py-3 px-4 text-cyber-muted">{ip.region || '-'}</td>
                                                <td className="py-3 px-4 text-cyber-text">{ip.requests?.toLocaleString()}</td>
                                                <td className="py-3 px-4 text-cyber-text">
                                                    {(ip.bytes / 1024 / 1024).toFixed(2)} MB
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
                    <div className="bg-cyber-dark/50 p-4 rounded-full mb-4">
                        <AlertCircle className="w-12 h-12 text-cyber-gray" />
                    </div>
                    <h3 className="text-xl font-bold text-cyber-text">No Apache Data Found</h3>
                    <p className="text-cyber-muted mt-2 max-w-md">
                        Apache metrics are not available for this host.
                    </p>
                    <p className="text-cyber-muted text-sm mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-yellow-200/80">
                        Ensure the Datavast Agent has read access to the Apache log files and that the service is running.
                    </p>
                </div>
            )}
        </div>
    );
};

export default ApacheDetail;
