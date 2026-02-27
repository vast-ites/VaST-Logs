import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const NotificationContext = createContext();

export const useNotifications = () => useContext(NotificationContext);

/**
 * Browser Notification Provider
 * 
 * Manages browser push notifications for alert events.
 * - Requests notification permission from the user
 * - Polls the alerts fired endpoint for new alerts
 * - Shows browser notifications for critical events
 * - Maintains an in-app notification feed
 */
export const NotificationProvider = ({ children }) => {
    const [permission, setPermission] = useState('default');
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isEnabled, setIsEnabled] = useState(() => {
        return localStorage.getItem('browser_notifications') !== 'false';
    });
    const lastAlertIdRef = useRef(null);
    const pollIntervalRef = useRef(null);
    const navigate = useNavigate();

    // Check permission state on mount
    useEffect(() => {
        if ('Notification' in window) {
            setPermission(Notification.permission);
        }
    }, []);

    // Request notification permission
    const requestPermission = useCallback(async () => {
        if (!('Notification' in window)) {
            console.warn('Browser does not support notifications');
            return 'denied';
        }
        const result = await Notification.requestPermission();
        setPermission(result);
        return result;
    }, []);

    // Toggle notifications on/off
    const toggleNotifications = useCallback((enabled) => {
        setIsEnabled(enabled);
        localStorage.setItem('browser_notifications', enabled ? 'true' : 'false');
    }, []);

    // Show a browser notification
    const showBrowserNotification = useCallback((title, body, opts = {}) => {
        if (permission !== 'granted' || !isEnabled) return;

        try {
            const notification = new Notification(title, {
                body,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: opts.tag || `datavast-${Date.now()}`,
                requireInteraction: opts.critical || false,
                silent: false,
                ...opts,
            });

            notification.onclick = () => {
                window.focus();
                notification.close();
                if (opts.onClick) opts.onClick();
            };

            // Auto-close after 8 seconds for non-critical
            if (!opts.critical) {
                setTimeout(() => notification.close(), 8000);
            }
        } catch (err) {
            console.error('Failed to show notification:', err);
        }
    }, [permission, isEnabled]);

    // Add an in-app notification
    const addNotification = useCallback((notification) => {
        const newNotif = {
            id: Date.now() + Math.random(),
            timestamp: new Date().toISOString(),
            read: false,
            ...notification,
        };
        setNotifications(prev => [newNotif, ...prev].slice(0, 50)); // Keep last 50
        setUnreadCount(prev => prev + 1);
        return newNotif;
    }, []);

    // Mark notification as read
    const markAsRead = useCallback((id) => {
        setNotifications(prev => prev.map(n =>
            n.id === id ? { ...n, read: true } : n
        ));
        setUnreadCount(prev => Math.max(0, prev - 1));
    }, []);

    // Mark all as read
    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        setUnreadCount(0);
    }, []);

    // Clear all notifications
    const clearAll = useCallback(() => {
        setNotifications([]);
        setUnreadCount(0);
    }, []);

    // Poll for new alert firings
    useEffect(() => {
        if (!isEnabled) return;

        const checkAlerts = async () => {
            try {
                const token = localStorage.getItem('token');
                if (!token) return;

                const res = await fetch('/api/v1/alerts/fired?limit=5', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!res.ok) return;
                const fired = await res.json();
                if (!Array.isArray(fired) || fired.length === 0) return;

                // Check for new alerts since last check
                const latestId = fired[0]?.id;
                if (lastAlertIdRef.current && latestId !== lastAlertIdRef.current) {
                    // New alert(s) detected
                    const newAlerts = [];
                    for (const alert of fired) {
                        if (alert.id === lastAlertIdRef.current) break;
                        newAlerts.push(alert);
                    }

                    for (const alert of newAlerts) {
                        const severity = alert.severity === 'CRITICAL' ? 'critical' : 'warning';
                        const title = severity === 'critical' ? '🚨 CRITICAL ALERT' : '⚠️ Alert Triggered';
                        const body = `${alert.rule_name}: ${alert.host || 'unknown'}`;

                        // Route mapping heuristics
                        let route = '/alerts';
                        const ruleLower = alert.rule_name.toLowerCase();
                        if (ruleLower.includes('ssh') || ruleLower.includes('brute') || ruleLower.includes('fail2ban') || ruleLower.includes('security')) {
                            route = `/services/security?host=${alert.host}`;
                        } else if (ruleLower.includes('cpu')) {
                            route = `/infrastructure/cpu?host=${alert.host}`;
                        } else if (ruleLower.includes('memory') || ruleLower.includes('ram')) {
                            route = `/infrastructure/memory?host=${alert.host}`;
                        } else if (ruleLower.includes('disk') || ruleLower.includes('storage')) {
                            route = `/infrastructure/storage?host=${alert.host}`;
                        }

                        // Browser notification (only works on HTTPS)
                        showBrowserNotification(title, body, {
                            tag: `alert-${alert.id}`,
                            critical: severity === 'critical',
                            onClick: () => navigate(route)
                        });

                        // In-app notification (always works)
                        addNotification({
                            title: alert.rule_name,
                            message: alert.message || body,
                            severity,
                            host: alert.host,
                        });
                    }
                }

                lastAlertIdRef.current = latestId;
            } catch (err) {
                // Silently fail on network errors
            }
        };

        // Initial check
        checkAlerts();

        // Poll every 15 seconds
        pollIntervalRef.current = setInterval(checkAlerts, 15000);

        return () => {
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
        };
    }, [isEnabled, showBrowserNotification, addNotification, navigate]);

    const value = {
        permission,
        isEnabled,
        notifications,
        unreadCount,
        requestPermission,
        toggleNotifications,
        showBrowserNotification,
        addNotification,
        markAsRead,
        markAllAsRead,
        clearAll,
    };

    return (
        <NotificationContext.Provider value={value}>
            {children}
        </NotificationContext.Provider>
    );
};
