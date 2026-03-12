import React, { useState, useEffect } from 'react';
import { Activity, Plus, Trash2, Pencil, RefreshCw, CheckCircle, XCircle, Clock, Server } from 'lucide-react';

const Monitoring = () => {
    const [monitors, setMonitors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const role = localStorage.getItem('role');

    // Form State
    const [formData, setFormData] = useState({
        name: '',
        type: 'http',
        target: '',
        port: 80,
        interval: 60,
        timeout: 10,
        expected_dns: '',
        ignore_ssl: false,
        keyword: '',
        threshold_failures: 3,
        threshold_res_time: 0,
        enabled: true
    });

    useEffect(() => {
        fetchMonitors();
        const t = setInterval(fetchMonitors, 10000); // Auto refresh every 10s
        return () => clearInterval(t);
    }, []);

    const fetchMonitors = async () => {
        const token = localStorage.getItem('token');
        try {
            const res = await fetch('/api/v1/monitors', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setMonitors(data || []);
            }
        } catch (e) { console.error('Failed to fetch monitors', e); }
        setLoading(false);
    };

    const handleSave = async () => {
        const token = localStorage.getItem('token');
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `/api/v1/monitors/${editingId}` : '/api/v1/monitors';

        const payload = { ...formData, id: editingId };
        // Ensure numeric fields
        payload.port = parseInt(payload.port, 10) || 0;
        payload.interval = parseInt(payload.interval, 10) || 60;
        payload.timeout = parseInt(payload.timeout, 10) || 10;
        payload.threshold_failures = parseInt(payload.threshold_failures, 10) || 3;
        payload.threshold_res_time = parseInt(payload.threshold_res_time, 10) || 0;

        await fetch(url, {
            method,
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        setShowModal(false);
        setEditingId(null);
        resetForm();
        fetchMonitors();
    };

    const handleDelete = async (id) => {
        if (!window.confirm("Delete this monitor?")) return;
        const token = localStorage.getItem('token');
        await fetch(`/api/v1/monitors/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        fetchMonitors();
    };

    const openEdit = (m) => {
        setFormData({ ...m });
        setEditingId(m.id);
        setShowModal(true);
    };

    const resetForm = () => {
        setFormData({
            name: '', type: 'http', target: '', port: 80, interval: 60, timeout: 10,
            expected_dns: '', ignore_ssl: false, keyword: '', threshold_failures: 3,
            threshold_res_time: 0, enabled: true
        });
    };

    const renderStatusBadge = (status) => {
        if (status === 'UP') return <span className="flex items-center gap-1 text-green-500 bg-green-500/10 px-2 py-1 rounded text-xs font-bold uppercase"><CheckCircle size={14} /> UP</span>;
        if (status === 'DOWN') return <span className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded text-xs font-bold uppercase"><XCircle size={14} /> DOWN</span>;
        return <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-1 rounded text-xs font-bold uppercase"><Clock size={14} /> PENDING</span>;
    };

    return (
        <div className="space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-cyber-text flex items-center gap-2">
                    <Activity className="text-cyan-400" /> Infrastructure Monitoring
                </h1>
                {role === 'admin' && (
                    <button
                        onClick={() => { resetForm(); setEditingId(null); setShowModal(true); }}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold transition-colors"
                    >
                        <Plus size={16} /> Add Monitor
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading && <div className="text-cyber-muted col-span-full text-center py-10">Loading monitors...</div>}
                {!loading && monitors.length === 0 && (
                    <div className="col-span-full text-center py-12 glass-panel border border-cyber-gray/20 rounded-xl">
                        <Activity size={48} className="mx-auto text-cyber-gray/40 mb-4" />
                        <h3 className="text-lg font-bold text-cyber-text">No Monitors Configured</h3>
                        <p className="text-cyber-muted mt-2">Create a monitor to track website uptime, ping endpoints, or check SSL certificates.</p>
                    </div>
                )}
                {monitors.map(m => (
                    <div key={m.id} className="glass-panel border border-cyber-gray/20 rounded-xl p-5 hover:border-cyan-500/30 transition-all flex flex-col justify-between h-48">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="font-bold text-lg text-cyber-text truncate pr-2">{m.name}</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs font-mono uppercase bg-cyber-gray/20 px-1.5 py-0.5 rounded text-cyan-400">{m.type}</span>
                                        {!m.enabled && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded uppercase">Disabled</span>}
                                    </div>
                                </div>
                                {renderStatusBadge(m.status)}
                            </div>
                            <div className="text-sm font-mono text-cyber-muted truncate mt-4">
                                {m.type === 'tcp' ? `${m.target}:${m.port}` : m.target}
                            </div>
                            {m.type === 'heartbeat' && (
                                <div className="text-[10px] text-cyber-dim mt-2 font-mono break-all cursor-pointer hover:text-cyan-400" title="Click to copy Webhook URL" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/api/v1/monitors/heartbeat/${m.id}`)}>
                                    Webhook: /api/v1/monitors/heartbeat/{m.id}
                                </div>
                            )}
                        </div>
                        <div className="flex justify-between items-end mt-4 pt-4 border-t border-cyber-gray/10">
                            <div className="text-xs text-cyber-dim">
                                Last check: {m.last_check !== "0001-01-01T00:00:00Z" ? new Date(m.last_check).toLocaleTimeString() : 'Never'}
                                <br />Interval: {m.interval}s
                            </div>
                            {role === 'admin' && (
                                <div className="flex gap-2">
                                    <button onClick={() => openEdit(m)} className="p-1.5 text-cyber-muted hover:text-cyan-400 bg-cyber-gray/10 rounded"><Pencil size={14} /></button>
                                    <button onClick={() => handleDelete(m.id)} className="p-1.5 text-cyber-muted hover:text-red-400 bg-cyber-gray/10 rounded"><Trash2 size={14} /></button>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-cyber-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
                    <div className="glass-panel border border-cyber-gray/30 rounded-xl p-6 w-full max-w-2xl shadow-2xl my-8">
                        <h2 className="text-xl font-bold text-cyber-text mb-6">{editingId ? 'Edit Monitor' : 'Create Monitor'}</h2>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2">
                                <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Monitor Name</label>
                                <input className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" placeholder="e.g. Production API" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                            </div>

                            <div>
                                <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Monitor Type</label>
                                <select className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
                                    <option value="http" className="bg-cyber-background">HTTP(s) - Website Check</option>
                                    <option value="ping" className="bg-cyber-background">Ping</option>
                                    <option value="tcp" className="bg-cyber-background">TCP Port</option>
                                    <option value="api" className="bg-cyber-background">API Endpoint</option>
                                    <option value="ssl" className="bg-cyber-background">SSL Expiry Check</option>
                                    <option value="dns" className="bg-cyber-background">DNS Check</option>
                                    <option value="heartbeat" className="bg-cyber-background">Passive Heartbeat (Cron/Cronjob)</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Target / Hostname</label>
                                {formData.type === 'heartbeat' ? (
                                    <input className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-muted cursor-not-allowed" value="Auto-generated URL endpoint" disabled />
                                ) : (
                                    <input className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" placeholder={formData.type === 'http' || formData.type === 'api' ? 'https://google.com' : '8.8.8.8'} value={formData.target} onChange={e => setFormData({ ...formData, target: e.target.value })} />
                                )}
                            </div>

                            {formData.type === 'tcp' && (
                                <div>
                                    <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Port</label>
                                    <input type="number" className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" value={formData.port} onChange={e => setFormData({ ...formData, port: e.target.value })} />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Interval (Seconds)</label>
                                <input type="number" min="5" className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" value={formData.interval} onChange={e => setFormData({ ...formData, interval: e.target.value })} />
                            </div>

                            {formData.type !== 'heartbeat' && (
                                <div>
                                    <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Timeout (Seconds)</label>
                                    <input type="number" min="1" className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" value={formData.timeout} onChange={e => setFormData({ ...formData, timeout: e.target.value })} />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Retries before DOWN status</label>
                                <input type="number" min="1" className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" value={formData.threshold_failures} onChange={e => setFormData({ ...formData, threshold_failures: e.target.value })} />
                            </div>

                        </div>

                        {/* Advanced Section */}
                        {(formData.type === 'http' || formData.type === 'api' || formData.type === 'ssl' || formData.type === 'dns') && (
                            <div className="mt-6 pt-4 border-t border-cyber-gray/20">
                                <h3 className="text-sm font-bold text-cyber-muted uppercase mb-3">Advanced Settings</h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {(formData.type === 'http' || formData.type === 'api') && (
                                        <>
                                            <div>
                                                <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Keyword Match</label>
                                                <input className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" placeholder="e.g. 'OK' or 'Welcome'" value={formData.keyword} onChange={e => setFormData({ ...formData, keyword: e.target.value })} />
                                            </div>
                                            <label className="flex items-center gap-2 text-cyber-text cursor-pointer mt-5">
                                                <input type="checkbox" checked={formData.ignore_ssl} onChange={e => setFormData({ ...formData, ignore_ssl: e.target.checked })} className="rounded bg-cyber-gray/20 border-cyber-gray/50 text-cyan-500 focus:ring-cyan-500/20" />
                                                <span className="text-sm">Ignore SSL Errors</span>
                                            </label>
                                        </>
                                    )}

                                    {formData.type === 'ssl' && (
                                        <label className="flex items-center gap-2 text-cyber-text cursor-pointer mt-5">
                                            <input type="checkbox" checked={formData.ignore_ssl} onChange={e => setFormData({ ...formData, ignore_ssl: e.target.checked })} className="rounded bg-cyber-gray/20 border-cyber-gray/50 text-cyan-500 focus:ring-cyan-500/20" />
                                            <span className="text-sm">Skip Certificate Verification</span>
                                        </label>
                                    )}

                                    {formData.type === 'dns' && (
                                        <div className="md:col-span-2">
                                            <label className="block text-xs uppercase text-cyber-muted font-bold mb-1">Expected DNS IP</label>
                                            <input className="w-full bg-cyber-gray/10 border border-cyber-gray/30 rounded p-2 text-cyber-text" placeholder="1.1.1.1" value={formData.expected_dns} onChange={e => setFormData({ ...formData, expected_dns: e.target.value })} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center mt-8">
                            <label className="flex items-center gap-2 text-cyber-text cursor-pointer">
                                <input type="checkbox" checked={formData.enabled} onChange={e => setFormData({ ...formData, enabled: e.target.checked })} className="rounded bg-cyber-gray/20 border-cyber-gray/50 text-cyan-500 focus:ring-cyan-500/20" />
                                <span className="text-sm font-bold">Monitor Enabled</span>
                            </label>

                            <div className="flex gap-3">
                                <button onClick={() => setShowModal(false)} className="px-4 py-2 text-cyber-muted hover:text-cyber-text">Cancel</button>
                                <button onClick={handleSave} className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded font-bold transition-colors">Save Monitor</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Monitoring;
