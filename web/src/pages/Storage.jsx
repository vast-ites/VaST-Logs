import React, { useState, useEffect } from 'react';
import { HardDrive, FileText, ArrowUp, ArrowDown } from 'lucide-react';
import { StatCard } from '../components/widgets/StatCard';
import { useHost } from '../contexts/HostContext';
import SpeedometerGauge from '../components/widgets/SpeedometerGauge';
import TimeRangeSelector from '../components/common/TimeRangeSelector';

export const Storage = () => {
    const { selectedHost } = useHost();
    const [metrics, setMetrics] = useState(null);

    const [history, setHistory] = useState([]);
    const [timeRange, setTimeRange] = useState('realtime');
    const [customRange, setCustomRange] = useState({ from: null, to: null });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const params = selectedHost ? `?host=${selectedHost}` : '';
                const token = localStorage.getItem('token');
                const headers = { 'Authorization': `Bearer ${token}` };

                // Fetch Latest
                const res = await fetch(`/api/v1/metrics/system${params}`, { headers });
                if (res.ok) setMetrics(await res.json());

                // Determine history parameters
                let durationParam = 'duration=15m';
                if (timeRange !== 'realtime') {
                    if (timeRange === 'custom' && customRange.from && customRange.to) {
                        durationParam = `duration=custom&from=${encodeURIComponent(customRange.from)}&to=${encodeURIComponent(customRange.to)}`;
                    } else {
                        durationParam = `duration=${timeRange}`;
                    }
                }
                const hostQuery = selectedHost ? `&host=${selectedHost}` : '';

                // Fetch History
                const resHist = await fetch(`/api/v1/metrics/history?${durationParam}${hostQuery}`, { headers });
                if (resHist.ok) setHistory(await resHist.json());

            } catch (err) {
                console.error(err);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, timeRange === 'realtime' ? 5000 : 60000);
        return () => clearInterval(interval);
    }, [selectedHost, timeRange, customRange]);

    if (!metrics) return <div className="p-10 text-center text-amber-400 animate-pulse">Mounting File Systems...</div>;

    // Use data from Agent if available, otherwise fallback
    // Dynamic Unit Scaling
    const totalBytes = metrics.disk_total || 0;
    const usedBytes = metrics.disk_total ? (metrics.disk_usage / 100) * metrics.disk_total : 0;

    // Choose unit based on total size
    const isTB = totalBytes > 1024 * 1024 * 1024 * 1024;
    const unitDivisor = isTB ? (1024 * 1024 * 1024 * 1024) : (1024 * 1024 * 1024);
    const unitLabel = isTB ? "TB" : "GB";

    const totalSizeDisplay = (totalBytes / unitDivisor).toFixed(1);
    const usedSizeDisplay = (usedBytes / unitDivisor).toFixed(1);

    const usedPercent = metrics.disk_usage || 0;

    return (
        <div className="space-y-6">
            <h1 className="text-2xl font-bold text-cyber-text tracking-tight flex items-center gap-2">
                <HardDrive size={24} className="text-amber-400" /> Disk & Storage
            </h1>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                <div className="glass-panel p-4 flex items-center justify-center rounded-xl">
                    <SpeedometerGauge
                        value={usedPercent}
                        label="DISK"
                        color="amber"
                        size={180}
                    />
                </div>
                <StatCard label="Total Storage" value={`${totalSizeDisplay} ${unitLabel}`} icon={HardDrive} color="amber" />
                <StatCard label="Used Space" value={`${usedSizeDisplay} ${unitLabel}`} subValue={`${usedPercent.toFixed(1)}%`} icon={FileText} trend="neutral" color="cyan" />
                <StatCard label="Read IOPS" value={(metrics.disk_read_iops || 0).toFixed(0)} icon={ArrowDown} trend="neutral" color="green" />
                <StatCard label="Write IOPS" value={(metrics.disk_write_iops || 0).toFixed(0)} icon={ArrowUp} trend="neutral" color="red" />
            </div>

            <div className="glass-panel p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-cyber-text font-semibold">Disk I/O Throughput History (MB/s)</h3>
                    <div className="z-10">
                        <TimeRangeSelector
                            value={timeRange}
                            onChange={setTimeRange}
                            onCustomChange={(from, to) => {
                                setCustomRange({ from, to });
                                setTimeRange('custom');
                            }}
                        />
                    </div>
                </div>
                <div className="h-64 flex items-end justify-between gap-1">
                    {(() => {
                        // Prepare data
                        // History from API is Ascending (Old -> New).
                        // We want the LATEST 60 points.
                        const viewData = history.slice(-60);

                        // Find Max for scaling
                        const maxVal = Math.max(...viewData.map(d => (d.disk_read_rate || 0) + (d.disk_write_rate || 0)), 1); // Avoid div/0

                        return viewData.map((d, i) => {
                            const read = d.disk_read_rate || 0;
                            const write = d.disk_write_rate || 0;
                            const total = read + write;
                            const h = Math.min((total / maxVal) * 100, 100);

                            // Tooltip content
                            const tooltip = `R: ${read.toFixed(1)} MB/s | W: ${write.toFixed(1)} MB/s`;

                            return (
                                <div key={i} className="w-full bg-cyber-gray/10 rounded-t overflow-hidden relative group" style={{ height: `${h}%` }} title={tooltip}>
                                    <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/50 to-amber-500/50 opacity-80"></div>
                                </div>
                            )
                        });
                    })()}
                    {history.length === 0 && (
                        <div className="absolute inset-0 flex items-center justify-center text-cyber-muted">
                            Waiting for telemetry data...
                        </div>
                    )}
                </div>
            </div>

            <div className="glass-panel p-6">
                <h3 className="text-cyber-text font-semibold mb-4">Partition Usage</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-cyber-muted">
                        <thead className="text-xs uppercase bg-cyber-gray/10 text-cyber-muted">
                            <tr>
                                <th className="p-3">Mount Point</th>
                                <th className="p-3">Type</th>
                                <th className="p-3">Size</th>
                                <th className="p-3">Used</th>
                                <th className="p-3">Availability</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-cyber-dim">
                            {(metrics.partitions || []).map((disk, idx) => {
                                const sizeGB = disk.total / (1024 * 1024 * 1024);
                                const usedGB = disk.used / (1024 * 1024 * 1024);
                                const usage = disk.total > 0 ? ((disk.used / disk.total) * 100) : 0;

                                return (
                                    <tr key={idx} className="hover:bg-cyber-gray/10 transition-colors">
                                        <td className="p-3 font-mono text-cyber-text">{disk.mount_point}</td>
                                        <td className="p-3">{disk.fstype}</td>
                                        <td className="p-3">{sizeGB.toFixed(0)} GB</td>
                                        <td className="p-3">{usedGB.toFixed(0)} GB</td>
                                        <td className="p-3 w-1/3">
                                            <div className="flex items-center gap-3">
                                                <div className="flex-1 h-2 bg-cyber-black/40 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${usage > 80 ? 'bg-red-500' : 'bg-cyan-400'}`}
                                                        style={{ width: `${Math.min(usage, 100)}%` }}
                                                    ></div>
                                                </div>
                                                <span className="w-12 text-right">{usage.toFixed(0)}%</span>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
