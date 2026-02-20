import React, { useState, useEffect } from 'react';
import { Network, ArrowDown, ArrowUp, Shield } from 'lucide-react';
import { StatCard } from '../components/widgets/StatCard';
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useHost } from '../contexts/HostContext';
import SpeedometerGauge from '../components/widgets/SpeedometerGauge';
import TimeRangeSelector from '../components/common/TimeRangeSelector';

export const NetworkPage = () => {
    const { selectedHost } = useHost();
    const [metrics, setMetrics] = useState(null);
    const [history, setHistory] = useState([]);
    const [timeRange, setTimeRange] = useState('realtime'); // realtime, 1h, 6h, 24h, 7d, custom
    const [customRange, setCustomRange] = useState({ from: null, to: null });

    // Realtime Polling
    useEffect(() => {
        if (timeRange !== 'realtime') return;

        const fetchMetrics = async () => {
            try {
                const params = selectedHost ? `?host=${selectedHost}` : '';
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/v1/metrics/system${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMetrics(data);

                    const time = new Date().toISOString();
                    setHistory(prev => [...prev.slice(-60), {
                        time,
                        rx: (data.net_recv_rate || 0) * 1024, // KB/s
                        tx: (data.net_sent_rate || 0) * 1024  // KB/s
                    }]);
                }
            } catch (err) {
                console.error(err);
            }
        };

        fetchMetrics();
        const interval = setInterval(fetchMetrics, 2000); // 2s polling
        return () => clearInterval(interval);
    }, [selectedHost, timeRange]);

    // Historical Fetching
    useEffect(() => {
        if (timeRange === 'realtime') return;

        const fetchHistory = async () => {
            try {
                const token = localStorage.getItem('token');
                const hostParam = selectedHost ? `&host=${selectedHost}` : '';

                let timeParams = `duration=${timeRange}`;
                if (timeRange === 'custom' && customRange.from && customRange.to) {
                    timeParams = `duration=custom&from=${encodeURIComponent(customRange.from)}&to=${encodeURIComponent(customRange.to)}`;
                }

                const res = await fetch(`/api/v1/metrics/interfaces/history?${timeParams}${hostParam}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();

                    // Aggregate RX/TX across interfaces for the main chart?
                    // The backend returns InterfaceMetricData array: [{interface, bytes_recv, bytes_sent, time}]
                    // We need to group by time and sum.

                    const aggregated = {};
                    data.forEach(d => {
                        const t = new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        if (!aggregated[t]) aggregated[t] = { time: t, rx: 0, tx: 0 };
                        // Backend returns B/s rate
                        aggregated[t].rx += (d.bytes_recv || 0) / 1024; // KB/s
                        aggregated[t].tx += (d.bytes_sent || 0) / 1024; // KB/s
                    });

                    // Convert to array and sort
                    const histArray = Object.values(aggregated).sort((a, b) =>
                        new Date('1970/01/01 ' + a.time) - new Date('1970/01/01 ' + b.time)
                    );
                    // Note: Sorting by time string might break across midnight for 24h view... 
                    // Better to key by ISO timestamp

                    const timeMap = new Map();
                    data.forEach(d => {
                        const ts = d.time; // Keep ISO string for sorting
                        if (!timeMap.has(ts)) timeMap.set(ts, { time: ts, formatted: new Date(ts).toLocaleString(), rx: 0, tx: 0 });
                        const entry = timeMap.get(ts);
                        entry.rx += (d.bytes_recv || 0) / 1024;
                        entry.tx += (d.bytes_sent || 0) / 1024;
                    });

                    const sorted = Array.from(timeMap.values()).sort((a, b) => new Date(a.time) - new Date(b.time));
                    setHistory(sorted);
                }
            } catch (err) {
                console.error(err);
            }
        };

        fetchHistory();
        const interval = setInterval(fetchHistory, 60000); // 1m polling for history
        return () => clearInterval(interval);
    }, [selectedHost, timeRange, customRange]);

    // Independent Metric Fetch for Stat Cards (Always run regardless of chart mode)
    useEffect(() => {
        const fetchCurrent = async () => {
            try {
                const params = selectedHost ? `?host=${selectedHost}` : '';
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/v1/metrics/system${params}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    setMetrics(data);
                }
            } catch (e) { }
        }
        if (timeRange !== 'realtime') {
            fetchCurrent();
            const msgInt = setInterval(fetchCurrent, 5000);
            return () => clearInterval(msgInt);
        }
    }, [selectedHost, timeRange]);


    if (!metrics) return <div className="p-10 text-center text-cyan-400 animate-pulse">Scanning Network Topology...</div>;

    const formatSpeed = (bytesPerSec) => {
        if (!bytesPerSec) return '0 B/s';
        if (bytesPerSec > 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
        if (bytesPerSec > 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
        return `${bytesPerSec.toFixed(0)} B/s`;
    };

    const handleCustomChange = (from, to) => {
        setCustomRange({ from, to });
        setTimeRange('custom');
    };

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-cyber-text tracking-tight flex items-center gap-2">
                <Network size={24} className="text-cyan-400" /> Network Traffic
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="glass-panel p-4 flex items-center justify-center rounded-xl">
                    <SpeedometerGauge
                        value={Math.min(100, (((metrics.net_recv_rate || 0) + (metrics.net_sent_rate || 0)) * 1024 * 1024 / (100 * 1024 * 1024 / 8)) * 100)}
                        label="NET"
                        color="cyan"
                        size={180}
                    />
                </div>
                <StatCard label="Active Interfaces" value={(metrics.interfaces || []).filter(i => i.is_up).length} icon={Network} color="cyan" />
                <StatCard label="Total Download" value={formatSpeed((metrics.net_recv_rate || 0) * 1024 * 1024)} icon={ArrowDown} trend="neutral" color="green" />
                <StatCard label="Total Upload" value={formatSpeed((metrics.net_sent_rate || 0) * 1024 * 1024)} icon={ArrowUp} trend="neutral" color="amber" />
                <StatCard label="Public Access" value="Secured" icon={Shield} trend="neutral" color="violet" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-96">
                {/* Main Traffic Chart */}
                <div className="lg:col-span-2 glass-panel p-4 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-cyber-muted font-semibold text-sm">Bandwidth History (KB/s)</h3>
                        <div className="z-10">
                            <TimeRangeSelector
                                value={timeRange}
                                onChange={setTimeRange}
                                onCustomChange={handleCustomChange}
                            />
                        </div>
                    </div>
                    <div className="flex-1 min-h-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <defs>
                                    <linearGradient id="splitRx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="splitTx" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis
                                    dataKey="time"
                                    tick={{ fill: '#94a3b8', fontSize: 10 }}
                                    tickFormatter={(str) => {
                                        const d = new Date(str);
                                        return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                                    }}
                                    interval="preserveEnd"
                                    minTickGap={60}
                                />
                                <YAxis hide />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(var(--cyber-dark), 0.9)', borderColor: 'rgba(var(--cyber-gray), 0.5)', color: 'rgb(var(--text-main))' }}
                                    formatter={(value) => [Number(value).toFixed(2), undefined]}
                                    itemStyle={{ color: 'rgb(var(--text-main))' }}
                                />
                                <Area type="monotone" dataKey="rx" stroke="#22c55e" fill="url(#splitRx)" strokeWidth={2} isAnimationActive={false} name="Download" />
                                <Area type="monotone" dataKey="tx" stroke="#f59e0b" fill="url(#splitTx)" strokeWidth={2} isAnimationActive={false} name="Upload" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Interface List */}
                <div className="glass-panel p-4 flex flex-col min-h-0">
                    <h3 className="text-cyber-muted font-semibold text-sm mb-4">Interface Status</h3>
                    <div className="space-y-3 flex-1 overflow-y-auto min-h-0 scrollbar-thin">
                        {(metrics.interfaces || []).slice(0, 5).map((iface, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded bg-cyber-gray/20 border border-cyber-dim">
                                <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${iface.is_up ? 'bg-green-500 shadow-[0_0_5px_#22c55e]' : 'bg-red-500'}`}></div>
                                    <div className="overflow-hidden">
                                        <div className="text-xs font-bold text-cyber-text truncate w-20">{iface.name}</div>
                                        <div className="text-[10px] text-cyber-muted font-mono truncate w-20">{iface.ip || "No IP"}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-[10px] text-green-400">{iface.is_up ? "UP" : "DOWN"}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detailed Table */}
            <div className="glass-panel overflow-hidden">
                <table className="w-full text-left text-sm text-cyber-muted">
                    <thead className="bg-cyber-gray/10 text-cyber-muted font-semibold border-b border-cyber-dim">
                        <tr>
                            <th className="p-4 w-32">Interface</th>
                            <th className="p-4 w-24">Type</th>
                            <th className="p-4">IP Address (v4)</th>
                            <th className="p-4">MAC Address</th>
                            <th className="p-4 w-24">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-cyber-dim">
                        {(metrics.interfaces || []).map((iface, idx) => (
                            <tr key={idx} className="hover:bg-cyber-gray/10 transition-colors">
                                <td className="p-4 font-mono text-cyan-400">{iface.name}</td>
                                <td className="p-4">{iface.name === "lo" ? "virtual" : "physical"}</td>
                                <td className="p-4 font-mono text-cyber-text">{iface.ip || "-"}</td>
                                <td className="p-4 font-mono text-cyber-muted">{iface.mac || "-"}</td>
                                <td className="p-4">
                                    <span className={`px-2 py-0.5 rounded text-[10px] border ${iface.is_up ? 'bg-green-500/20 text-green-400 border-green-500/20' : 'bg-red-500/20 text-red-400 border-red-500/20'}`}>
                                        {iface.is_up ? "UP" : "DOWN"}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
