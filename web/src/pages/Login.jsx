import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, AlertTriangle, Key } from 'lucide-react';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [ssoProviders, setSsoProviders] = useState([]);
    const navigate = useNavigate();
    const location = useLocation();

    // Check for token in hash (from SSO callback redirect)
    useEffect(() => {
        const hash = window.location.hash;
        if (hash && hash.includes("token=")) {
            const token = new URLSearchParams(hash.substring(1)).get("token");
            if (token) {
                localStorage.setItem('token', token);
                // Clean hash
                window.history.replaceState(null, '', window.location.pathname + window.location.search);
                // We don't have role/username immediately here without decoding JWT, 
                // but the backend will validate the token on next request. 
                // The easiest way is to reload.
                window.location.href = '/';
            }
        }

        // Fetch active SSO Providers
        fetch('/api/v1/auth/sso/providers')
            .then(res => res.json())
            .then(data => {
                if (data && !data.error) {
                    setSsoProviders(data);
                }
            })
            .catch(err => console.error("Failed to load SSO providers:", err));
    }, []);

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            const res = await fetch('/api/v1/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                const data = await res.json();
                localStorage.setItem('token', data.token);
                localStorage.setItem('role', data.role);
                localStorage.setItem('username', data.username);
                // Force reload to ensure HostContext picks up the new token immediately
                window.location.href = '/';
            } else {
                setError('Access Denied: Invalid Credentials');
            }
        } catch (err) {
            setError('Connection Failure: Server Unreachable');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-cyber-background p-4 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyber-gray/20 via-cyber-background to-cyber-background" />
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyber-cyan to-transparent opacity-50 animate-scan" />

            <div className="max-w-md w-full glass-panel p-8 rounded-xl border border-cyber-gray relative z-10 shadow-[0_0_50px_rgba(var(--cyber-cyan),0.2)]">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 bg-cyber-black rounded-full border border-cyber-cyan flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(var(--cyber-cyan),0.2)]">
                        <Shield className="text-cyber-cyan w-8 h-8" />
                    </div>
                    <h1 className="text-2xl font-display font-bold text-cyber-text tracking-widest">SECURE LOGIN</h1>
                    <p className="text-cyber-muted text-xs font-mono mt-2">RESTRICTED ACCESS ONLY</p>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-2">
                        <label className="text-xs font-mono text-cyber-cyan flex items-center gap-2">
                            <Shield size={12} /> USERNAME
                        </label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-cyber-black/50 border border-cyber-gray rounded p-3 text-cyber-text focus:border-cyber-cyan focus:outline-none focus:ring-1 focus:ring-cyber-cyan font-mono transition-all"
                            placeholder="admin"
                            autoFocus
                        />
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-mono text-cyber-cyan flex items-center gap-2">
                            <Lock size={12} /> PASSWORD
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-cyber-black/50 border border-cyber-gray rounded p-3 text-cyber-text focus:border-cyber-cyan focus:outline-none focus:ring-1 focus:ring-cyber-cyan font-mono transition-all"
                            placeholder="••••••••••••"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-900/20 border border-red-500/50 rounded flex items-center gap-2 text-red-500 text-xs font-mono">
                            <AlertTriangle size={14} />
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className={`w-full py-3 px-4 rounded font-bold text-sm tracking-wider transition-all
                        ${loading
                                ? 'bg-cyber-gray/50 text-cyber-muted cursor-not-allowed'
                                : 'bg-cyber-cyan text-black hover:bg-white hover:shadow-[0_0_20px_rgba(0,243,255,0.4)]'
                            }`}
                    >
                        {loading ? 'AUTHENTICATING...' : 'AUTHENTICATE'}
                    </button>
                </form>

                {ssoProviders.length > 0 && (
                    <div className="mt-6 pt-6 border-t border-cyber-dim">
                        <p className="text-center text-xs text-cyber-muted font-mono mb-4">OR SIGN IN WITH</p>
                        <div className="space-y-3">
                            {ssoProviders.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => {
                                        window.location.href = `/api/v1/auth/sso/login/${p.id}`;
                                    }}
                                    className="w-full py-2.5 px-4 rounded border border-cyber-blue/50 text-cyber-blue hover:bg-cyber-blue/10 flex items-center justify-center gap-2 text-sm font-bold tracking-wide transition-all"
                                >
                                    <Key size={16} /> {p.name}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div className="mt-8 pt-6 border-t border-cyber-dim text-center">
                    <p className="text-[10px] text-cyber-muted font-mono">
                        SYSTEM ID: VASTLOGS-CORE-V1 <br />
                        IP: {window.location.hostname}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
