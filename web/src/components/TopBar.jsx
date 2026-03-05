import React, { useState } from 'react';
import { Search, HelpCircle, LogOut, User, Settings, Shield, Menu } from 'lucide-react';
import { useHost } from '../contexts/HostContext';
import { useNavigate } from 'react-router-dom';
import NotificationBell from './NotificationBell';

export const TopBar = ({ onAddSource, onMenuToggle }) => {
    const { selectedHost, setSelectedHost, hosts, refreshInterval, setRefreshInterval } = useHost();
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const navigate = useNavigate();

    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username') || 'Operator';
    const initials = username.substring(0, 2).toUpperCase();

    return (
        <header className="h-14 sm:h-16 border-b border-cyber-gray/20 flex items-center justify-between px-3 sm:px-6 glass-panel rounded-none border-t-0 border-l-0 border-r-0 z-[9999] relative">
            {/* Mobile Hamburger */}
            <button
                onClick={onMenuToggle}
                className="lg:hidden p-2 -ml-1 mr-2 rounded-lg text-cyber-muted hover:text-cyber-cyan hover:bg-cyber-gray/20 transition-colors"
            >
                <Menu size={22} />
            </button>

            {/* Search Bar — hidden on mobile */}
            <div className="flex-1 max-w-xl hidden sm:block">
                <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-cyber-muted group-focus-within:text-cyan-400 transition-colors" />
                    </div>
                    <input
                        type="text"
                        className="block w-full pl-10 pr-3 py-2 border border-cyber-gray/20 rounded-lg leading-5 bg-cyber-gray/10 text-cyber-text placeholder-cyber-muted focus:outline-none focus:bg-cyber-gray/20 focus:border-cyber-cyan/50 focus:ring-1 focus:ring-cyber-cyan/50 sm:text-sm transition-all shadow-[0_0_0_1px_rgba(var(--cyber-cyan),0.05)]"
                        placeholder="Search metrics, logs, or server events..."
                    />
                    <div className="absolute inset-y-0 right-0 pr-2 flex items-center">
                        <kbd className="inline-flex items-center border border-gray-700 rounded px-2 text-xs font-sans font-medium text-gray-500">⌘K</kbd>
                    </div>
                </div>
            </div>

            {/* Mobile Logo */}
            <div className="flex items-center gap-2 sm:hidden flex-1">
                <span className="text-sm font-bold text-cyber-text tracking-widest font-display">VaSTLogs</span>
            </div>

            <div className="flex items-center gap-3 sm:gap-6 ml-2 sm:ml-6">
                {/* Refresh Rate Selector — hidden on mobile */}
                <div className="hidden md:flex items-center gap-2">
                    <span className="text-[10px] text-cyber-muted font-mono uppercase tracking-wider">REFRESH:</span>
                    <select
                        value={refreshInterval}
                        onChange={(e) => setRefreshInterval(Number(e.target.value))}
                        className="bg-transparent text-xs font-mono text-cyan-400 focus:outline-none cursor-pointer border-b border-cyber-gray/20 pb-0.5 hover:border-cyan-500/50 transition-colors"
                    >
                        <option value={1000}>1s (Realtime)</option>
                        <option value={2000}>2s (Fast)</option>
                        <option value={5000}>5s (Normal)</option>
                        <option value={10000}>10s (Slow)</option>
                        <option value={30000}>30s (Eco)</option>
                    </select>
                </div>

                <div className="w-px h-6 bg-cyber-gray/20 hidden md:block"></div>

                {/* Host Selector */}
                <div className="flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-1.5 rounded-lg border border-cyber-gray/20 bg-cyber-gray/10">
                    <span className="text-[10px] text-cyber-muted font-mono uppercase tracking-wider hidden sm:inline">Source</span>
                    <select
                        value={selectedHost}
                        onChange={(e) => setSelectedHost(e.target.value)}
                        className="bg-transparent text-xs font-mono text-cyan-400 focus:outline-none cursor-pointer min-w-[80px] sm:min-w-[120px]"
                    >
                        <option value="">ALL SYSTEMS</option>
                        {hosts.map(h => {
                            const lastSeen = new Date(h.last_seen).getTime();
                            const isOffline = (Date.now() - lastSeen) > 60000;
                            return (
                                <option key={h.hostname} value={h.hostname} className={isOffline ? 'text-red-400' : 'text-cyan-400'}>
                                    {isOffline ? '🔴 ' : '🟢 '}
                                    {h.hostname} {h.ip && h.ip !== 'Unknown' ? `(${h.ip})` : ''}
                                    {isOffline ? ' [OFFLINE]' : ''}
                                </option>
                            );
                        })}
                    </select>
                </div>

                {/* Actions - Only visible to Admins, hidden on mobile */}
                {role === 'admin' && (
                    <button
                        onClick={onAddSource}
                        className="hidden sm:inline-flex px-3 py-1.5 bg-cyber-cyan/10 text-cyber-cyan border border-cyber-cyan/20 rounded text-xs font-bold tracking-wider hover:bg-cyber-cyan/20 hover:border-cyber-cyan/40 transition-all shadow-[0_0_10px_rgba(var(--cyber-cyan),0.1)]"
                    >
                        + ADD SOURCE
                    </button>
                )}

                <div className="w-px h-6 bg-cyber-gray/20 mx-1 sm:mx-2 hidden sm:block"></div>

                <div className="flex items-center gap-2 sm:gap-4 relative">
                    <NotificationBell />
                    <button className="text-cyber-muted hover:text-cyber-text transition-colors hidden sm:block">
                        <HelpCircle size={18} />
                    </button>

                    {/* User Profile Dropdown Trigger */}
                    <button
                        onClick={() => setShowProfileMenu(!showProfileMenu)}
                        className={`w-8 h-8 rounded-full bg-gradient-to-br from-cyber-gray to-cyber-black border border-cyber-gray/20 flex items-center justify-center text-xs font-bold text-cyber-muted hover:border-cyber-cyan hover:text-cyber-cyan hover:shadow-[0_0_10px_rgba(var(--cyber-cyan),0.3)] transition-all ${showProfileMenu ? 'border-cyber-cyan text-cyber-cyan shadow-[0_0_10px_rgba(var(--cyber-cyan),0.3)]' : ''}`}
                    >
                        {initials}
                    </button>

                    {/* Dropdown Menu */}
                    {showProfileMenu && (
                        <div className="absolute top-12 right-0 w-64 bg-cyber-black/95 backdrop-blur-xl border border-cyber-gray/30 rounded-lg shadow-[0_0_30px_rgba(0,0,0,0.8)] z-[99999] text-left pointer-events-auto isolate">
                            {/* User Header */}
                            <div className="p-4 border-b border-cyber-gray/20 bg-cyber-gray/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-cyber-gray/20 border border-cyber-cyan/30 flex items-center justify-center text-cyber-cyan font-bold text-sm shadow-[0_0_10px_rgba(var(--cyber-cyan),0.1)]">
                                        {initials}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-cyber-text truncate font-display tracking-wide">{username}</p>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {role === 'admin' ? <Shield size={10} className="text-red-400" /> : <User size={10} className="text-blue-400" />}
                                            <p className="text-[10px] text-cyber-muted font-mono uppercase tracking-wider">{role || 'Viewer'}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Menu Items */}
                            <div className="p-1">
                                {role === 'admin' && (
                                    <button
                                        onClick={() => {
                                            navigate('/settings');
                                            setShowProfileMenu(false);
                                        }}
                                        className="w-full text-left px-3 py-2.5 text-xs font-mono text-cyber-muted hover:text-cyber-cyan hover:bg-cyber-cyan/10 rounded-md transition-all flex items-center gap-3 group"
                                    >
                                        <Settings size={14} className="group-hover:rotate-90 transition-transform duration-500" />
                                        SETTINGS
                                    </button>
                                )}
                                <button
                                    onClick={() => {
                                        setShowProfileMenu(false);
                                        alert("Feature coming soon: Integration with detailed support documentation.");
                                    }}
                                    className="w-full text-left px-3 py-2.5 text-xs font-mono text-cyber-muted hover:text-cyber-cyan hover:bg-cyber-cyan/10 rounded-md transition-all flex items-center gap-3"
                                >
                                    <HelpCircle size={14} />
                                    SUPPORT
                                </button>
                            </div>

                            {/* Footer / Logout */}
                            <div className="p-1 border-t border-cyber-gray/20 bg-red-900/5">
                                <button
                                    onClick={() => {
                                        localStorage.clear();
                                        window.location.href = '/login';
                                    }}
                                    className="mt-4 w-full flex items-center justify-center gap-2 p-2 rounded bg-red-900/20 text-red-400 hover:bg-red-900/40 hover:text-red-300 transition-all text-xs font-bold border border-red-900/30"
                                >
                                    <LogOut size={14} /> LOGOUT
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </header>
    );
};
