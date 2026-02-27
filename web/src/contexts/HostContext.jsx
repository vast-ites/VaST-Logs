import React, { createContext, useContext, useState, useEffect } from 'react';

const HostContext = createContext();

export const HostProvider = ({ children }) => {
    // Initialize from URL first, then localStorage, or default to empty
    const [selectedHost, setSelectedHost] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        const urlHost = params.get('host');
        if (urlHost) {
            localStorage.setItem('datavast_selected_host', urlHost);
            return urlHost;
        }
        return localStorage.getItem('datavast_selected_host') || '';
    });
    // Initialize Refresh Rate from localStorage or default to 2000ms
    const [refreshInterval, setRefreshInterval] = useState(() => {
        const saved = localStorage.getItem('datavast_refresh_rate');
        return saved ? Number(saved) : 2000;
    });

    const [hosts, setHosts] = useState([]);
    const [loading, setLoading] = useState(false);

    // Update localStorage when state changes
    useEffect(() => {
        if (selectedHost) {
            localStorage.setItem('datavast_selected_host', selectedHost);
        }
    }, [selectedHost]);

    useEffect(() => {
        localStorage.setItem('datavast_refresh_rate', refreshInterval);
    }, [refreshInterval]);

    const fetchHosts = async () => {
        // PERF: Don't fetch if no token (avoid 401 loop on login page)
        const token = localStorage.getItem('token');
        if (!token) {
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const headers = {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            };
            const res = await fetch('/api/v1/hosts', { headers });

            if (res.status === 401) {
                // Only redirect if NOT already on login page to prevent loops
                if (window.location.pathname !== '/login') {
                    localStorage.removeItem('token');
                    window.location.href = '/login';
                }
                return;
            }

            if (res.ok) {
                const data = await res.json();
                setHosts(data);
            }
        } catch (err) {
            console.error("Failed to fetch hosts", err);
        } finally {
            setLoading(false);
        }
    };

    // Initial Auto-Select Logic
    useEffect(() => {
        if (hosts.length > 0 && !selectedHost) {
            const hostNames = hosts.map(h => h.hostname);
            const defaultHost = hostNames.includes('fusionpbx') ? 'fusionpbx' : (hosts[0]?.hostname || '');
            setSelectedHost(defaultHost);
        }
    }, [hosts, selectedHost]);

    useEffect(() => {
        fetchHosts();
        const interval = setInterval(fetchHosts, 30000);
        return () => clearInterval(interval);
    }, []);

    return (
        <HostContext.Provider value={{ selectedHost, setSelectedHost, hosts, loading, refreshHosts: fetchHosts, refreshInterval, setRefreshInterval }}>
            {children}
        </HostContext.Provider>
    );
};

export const useHost = () => useContext(HostContext);
