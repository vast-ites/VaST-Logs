import React, { useState, useEffect } from 'react';
import { Shield, AlertTriangle, Lock, Unlock, Wifi, Zap, Filter, Ban, Check, Globe, Network } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

import { useHost } from '../contexts/HostContext';

const Security = () => {
    const { selectedHost } = useHost();
    const [history, setHistory] = useState([]);
    const [currentStatus, setCurrentStatus] = useState('SAFE');
    const [loading, setLoading] = useState(true);
    const [firewallData, setFirewallData] = useState([]);
    const [activeFilter, setActiveFilter] = useState('all');

    const parseFirewallRules = (rawRules) => {
        if (!rawRules || rawRules === '' || rawRules.includes('unavailable') || rawRules.includes('No firewall data')) {
            return [];
        }

        const rules = [];
        const lines = rawRules.split('\n');

        lines.forEach((line, idx) => {
            // Skip header lines, empty lines, and chain declarations
            if (!line.trim() ||
                line.includes('Chain ') ||
                line.includes('target ') ||
                line.includes('prot opt') ||
                line.startsWith('f2b-') ||
                line.startsWith('sip-')) {
                return;
            }

            // Parse UFW format: "[ 1] ALLOW IN    22"
            const ufwMatch = line.match(/^\[\s*\d+\]\s+(ALLOW|DENY|REJECT)\s+(IN|OUT)?\s+(.+)/);
            if (ufwMatch) {
                const [_, action, direction, details] = ufwMatch;
                const hasPort = /^\d+/.test(details.trim());
                const hasIP = /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(details);

                rules.push({
                    id: `ufw-${idx}`,
                    action: action,
                    direction: direction || 'ANY',
                    details: details.trim(),
                    type: action === 'ALLOW' ? 'allowed' : 'blocked',
                    resourceType: hasPort ? 'port' : (hasIP ? 'ip' : 'other')
                });
                return;
            }

            // Parse iptables format: "ACCEPT     tcp  --  0.0.0.0/0            0.0.0.0/0            tcp dpt:22"
            const iptablesMatch = line.match(/^(ACCEPT|DROP|REJECT)\s+/);
            if (iptablesMatch) {
                const action = iptablesMatch[1];

                // Extract source and destination (format: "action prot opt source dest ...")
                const sourceDestMatch = line.match(/^(?:ACCEPT|DROP|REJECT)\s+(\w+)\s+--\s+(\S+)\s+(\S+)/);
                const source = sourceDestMatch ? sourceDestMatch[2] : null;

                // Extract port if present (e.g., "tcp dpt:22", "udp dpts:5060:5091")
                const portMatch = line.match(/dpts?:(\d+(?::\d+)?)/);
                const port = portMatch ? portMatch[1] : null;

                // Extract protocol
                const protocolMatch = line.match(/^(ACCEPT|DROP|REJECT)\s+(\w+)/);
                const protocol = protocolMatch ? protocolMatch[2] : 'all';

                // Extract any descriptive text (DROP rules often have STRING match patterns)
                const stringMatch = line.match(/STRING match\s+"([^"]+)"/);
                const pattern = stringMatch ? ` (blocking: ${stringMatch[1]})` : '';

                // Check if it's a state rule (RELATED,ESTABLISHED)
                const stateMatch = line.match(/state\s+([\w,]+)/);
                const isStateRule = stateMatch !== null;

                // Check if source is a SPECIFIC IP (not 0.0.0.0/0 or anywhere)
                const hasSpecificSourceIP = source && source !== '0.0.0.0/0' && source !== 'anywhere' && /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/.test(source);

                let details;
                let resourceType;

                if (port) {
                    details = `${protocol.toUpperCase()} port ${port}${pattern}`;
                    resourceType = 'port';
                } else if (hasSpecificSourceIP) {
                    details = `IP ${source}`;
                    resourceType = 'ip';
                } else if (stringMatch) {
                    details = `${protocol.toUpperCase()} pattern: ${stringMatch[1]}`;
                    resourceType = 'other';
                } else if (isStateRule) {
                    details = `${protocol.toUpperCase()} (${stateMatch[1]})`;
                    resourceType = 'other';
                } else if (protocol === '1') {
                    // ICMP
                    const icmpMatch = line.match(/icmptype\s+(\d+)/);
                    details = icmpMatch ? `ICMP type ${icmpMatch[1]} (ping)` : `ICMP all`;
                    resourceType = 'other';
                } else {
                    // Skip generic Docker chain rules to avoid clutter
                    return;
                }

                rules.push({
                    id: `ipt-${idx}`,
                    action: action,
                    protocol,
                    details: details,
                    type: action === 'ACCEPT' ? 'allowed' : 'blocked',
                    resourceType: resourceType
                });
            }
        });

        return rules;
    };

    const fetchHistory = async () => {
        try {
            const token = localStorage.getItem('token');
            const headers = {
                'Content-Type': 'application/json',
                ...(token && { 'Authorization': `Bearer ${token}` })
            };

            const params = selectedHost ? `?host=${selectedHost}` : '';
            const res = await fetch(`/api/v1/metrics/history${params}&duration=30m`, { headers });
            if (res.status === 401) { window.location.href = '/login'; return; }

            if (res.ok) {
                const data = await res.json();

                const historyData = data.map(d => ({
                    time: new Date(d.timestamp).toLocaleTimeString(),
                    ddos_score: d.ddos_status === 'CRITICAL' ? 100 : (d.ddos_status === 'WARNING' ? 50 : 0),
                    traffic: (d.net_recv_rate || 0) + (d.net_sent_rate || 0)
                })).reverse();

                setHistory(historyData);

                if (historyData.length > 0) {
                    const last = historyData[historyData.length - 1];
                    if (last.ddos_score === 100) setCurrentStatus('CRITICAL');
                    else if (last.ddos_score === 50) setCurrentStatus('WARNING');
                    else setCurrentStatus('SAFE');
                }
            }

            // Fetch Firewall
            const resFw = await fetch(`/api/v1/firewall${params}`, { headers });
            if (resFw.status === 401) { window.location.href = '/login'; return; }

            if (resFw.ok) {
                const data = await resFw.json();
                const parsed = parseFirewallRules(data.rules || '');
                setFirewallData(parsed);
            }
        } catch (err) {
            console.error("Failed to fetch security history", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 5000);
        return () => clearInterval(interval);
    }, [selectedHost]);

    const filteredRules = firewallData.filter(rule => {
        if (activeFilter === 'all') return true;
        if (activeFilter === 'blocked-ip') return rule.type === 'blocked' && rule.resourceType === 'ip';
        if (activeFilter === 'allowed-ip') return rule.type === 'allowed' && rule.resourceType === 'ip';
        if (activeFilter === 'allowed-port') return rule.type === 'allowed' && rule.resourceType === 'port';
        if (activeFilter === 'blocked-port') return rule.type === 'blocked' && rule.resourceType === 'port';
        return true;
    });

    const isCritical = currentStatus === 'CRITICAL';
    const color = isCritical ? '#ef4444' : (currentStatus === 'WARNING' ? '#f3ff00' : '#0aff0a');

    const filterTabs = [
        { id: 'all', label: 'All Rules', icon: Filter, count: firewallData.length },
        { id: 'blocked-ip', label: 'Blocked IPs', icon: Ban, count: firewallData.filter(r => r.type === 'blocked' && r.resourceType === 'ip').length },
        { id: 'allowed-ip', label: 'Allowed IPs', icon: Check, count: firewallData.filter(r => r.type === 'allowed' && r.resourceType === 'ip').length },
        { id: 'allowed-port', label: 'Allowed Ports', icon: Network, count: firewallData.filter(r => r.type === 'allowed' && r.resourceType === 'port').length },
        { id: 'blocked-port', label: 'Blocked Ports', icon: Ban, count: firewallData.filter(r => r.type === 'blocked' && r.resourceType === 'port').length },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
                <h1 className="text-xl sm:text-2xl font-bold font-display text-cyber-text flex items-center gap-3">
                    <Shield className={isCritical ? "text-red-500 animate-pulse" : "text-cyber-green"} />
                    Security Operations Center
                </h1>
                <div className={`px-4 py-1 rounded border font-mono text-sm font-bold flex items-center gap-2 self-start sm:self-auto ${isCritical ? 'bg-red-500/20 text-red-500 border-red-500 animate-pulse' :
                    (currentStatus === 'WARNING' ? 'bg-yellow-500/20 text-yellow-500 border-yellow-500' : 'bg-green-500/20 text-green-500 border-green-500')
                    }`}>
                    {isCritical ? <Unlock size={14} /> : <Lock size={14} />}
                    STATUS: {currentStatus}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Status Panel */}
                <div className={`col-span-1 glass-panel p-8 rounded-xl border relative overflow-hidden flex flex-col items-center justify-center text-center ${isCritical ? 'border-red-500 shadow-[0_0_30px_rgba(239,68,68,0.3)]' : 'border-cyber-gray'
                    }`}>
                    <div className={`w-32 h-32 rounded-full border-4 flex items-center justify-center mb-6 ${isCritical ? 'border-red-500 bg-red-500/10 animate-ping' : 'border-cyber-green bg-cyber-green/10'
                        }`}>
                        <Shield size={64} className={isCritical ? 'text-red-500' : 'text-cyber-green'} />
                    </div>
                    <h2 className="text-3xl font-bold text-cyber-text mb-2 font-display">THREAT LEVEL</h2>
                    <p className={`text-xl font-mono ${isCritical ? 'text-red-500' : 'text-cyber-green'}`}>
                        {currentStatus === 'SAFE' ? 'NORMAL' : (isCritical ? 'EXTREME' : 'ELEVATED')}
                    </p>
                    {isCritical && <p className="text-red-400 mt-4 animate-bounce">DDoS MITIGATION PROTOCOLS RECOMMENDED</p>}
                </div>

                {/* Traffic Graph */}
                <div className="col-span-1 lg:col-span-2 glass-panel p-4 sm:p-6 rounded-xl border border-cyber-gray flex flex-col">
                    <h3 className="text-base sm:text-lg font-bold text-gray-300 mb-4 flex items-center gap-2">
                        <Zap size={18} className="text-cyber-yellow" /> Network Intensity (Attack Signature)
                    </h3>
                    <div className="flex-1 min-h-[200px] sm:min-h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <defs>
                                    <linearGradient id="colorSecurity" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                                        <stop offset="95%" stopColor={color} stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#aaa" strokeOpacity={0.2} />
                                <XAxis dataKey="time" hide />
                                <YAxis stroke="#888" fontSize={10} domain={[0, 'auto']} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: 'rgba(23, 23, 23, 0.9)', borderColor: color, borderRadius: '8px', color: '#fff' }}
                                    itemStyle={{ color: color }}
                                    formatter={(value) => [`${value.toFixed(2)} MB/s`, 'Traffic']}
                                />
                                <ReferenceLine y={50} label="CRITICAL THRESHOLD" stroke="red" strokeDasharray="3 3" />
                                <Area type="step" dataKey="rx" stroke={color} fill="url(#colorSecurity)" strokeWidth={2} />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Firewall Rules */}
            <div className="glass-panel p-6 rounded-xl border border-cyber-gray flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-cyber-cyan flex items-center gap-2">
                        <Lock size={18} /> Host Firewall Configuration
                    </h3>
                    {firewallData.length > 0 && (
                        <span className="text-xs text-gray-500">{filteredRules.length} of {firewallData.length} rules</span>
                    )}
                </div>

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-4 overflow-x-auto custom-scrollbar pb-2">
                    {filterTabs.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveFilter(tab.id)}
                                className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium text-xs whitespace-nowrap transition-all ${activeFilter === tab.id
                                    ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/20'
                                    : 'bg-cyber-gray/20 text-cyber-muted hover:bg-cyber-gray/30 hover:text-cyber-text'
                                    }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${activeFilter === tab.id ? 'bg-cyber-black/20' : 'bg-cyber-gray/30'}`}>
                                    {tab.count}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Rules Table */}
                {firewallData.length === 0 ? (
                    <div className="bg-cyber-gray/5 p-8 rounded text-center text-cyber-muted border border-cyber-gray/20">
                        <Lock size={48} className="mx-auto mb-3 opacity-20" />
                        <p className="font-mono text-sm">No firewall data available</p>
                        <p className="text-xs mt-2">Agents must run with sudo to collect firewall rules</p>
                    </div>
                ) : filteredRules.length === 0 ? (
                    <div className="bg-cyber-gray/5 p-6 rounded text-center text-cyber-muted border border-cyber-gray/20">
                        <p className="font-mono text-sm">No rules match selected filter</p>
                    </div>
                ) : (
                    <div className="bg-cyber-gray/5 rounded overflow-auto max-h-96 custom-scrollbar border border-cyber-gray/20">
                        <table className="w-full text-sm">
                            <thead className="bg-cyber-gray/20 sticky top-0">
                                <tr className="text-left text-cyber-muted text-xs font-mono">
                                    <th className="p-3">Action</th>
                                    <th className="p-3">Details</th>
                                    <th className="p-3">Type</th>
                                </tr>
                            </thead>
                            <tbody className="font-mono text-xs">
                                {filteredRules.map((rule, idx) => (
                                    <tr key={rule.id} className="border-t border-cyber-gray/10 hover:bg-cyber-gray/10 transition-colors">
                                        <td className="p-3">
                                            <span className={`px-2 py-1 rounded font-bold ${rule.type === 'allowed'
                                                ? 'bg-green-500/20 text-green-400'
                                                : 'bg-red-500/20 text-red-400'
                                                }`}>
                                                {rule.action}
                                            </span>
                                        </td>
                                        <td className="p-3 text-cyber-text">{rule.details}</td>
                                        <td className="p-3">
                                            <span className="text-cyber-muted uppercase text-[10px]">
                                                {rule.resourceType}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Security;
