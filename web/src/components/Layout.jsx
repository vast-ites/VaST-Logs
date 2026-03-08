import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { MobileNav } from './MobileNav';
import ConnectAgentModal from './ConnectAgentModal';
import TelemetryPrompt from './TelemetryPrompt';

const Layout = () => {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const location = useLocation();

    // Close sidebar on route change (mobile)
    useEffect(() => {
        setSidebarOpen(false);
    }, [location.pathname]);

    // Close sidebar on ESC
    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape') setSidebarOpen(false); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, []);

    return (
        <div className="flex h-screen font-sans selection:bg-cyan-500/30">
            {/* Mobile Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Sidebar — hidden on mobile, slide-in drawer */}
            <div className={`
                fixed lg:static inset-y-0 left-0 z-50
                transform transition-transform duration-300 ease-in-out
                ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
                lg:translate-x-0
            `}>
                <Sidebar onClose={() => setSidebarOpen(false)} />
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative w-full">
                {/* Background Grid */}
                <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                        backgroundImage: `linear-gradient(rgb(var(--cyber-muted) / 0.1) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--cyber-muted) / 0.1) 1px, transparent 1px)`,
                        backgroundSize: '40px 40px'
                    }}
                ></div>

                {/* Ambient Glows */}
                <div className="absolute top-0 right-0 w-[600px] h-[600px] pointer-events-none hidden sm:block"
                    style={{ background: 'radial-gradient(circle, rgba(0,243,255,0.06) 0%, transparent 70%)' }}
                ></div>
                <div className="absolute bottom-0 left-0 w-[600px] h-[600px] pointer-events-none hidden sm:block"
                    style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.06) 0%, transparent 70%)' }}
                ></div>

                <TelemetryPrompt />

                <TopBar
                    onAddSource={() => setIsModalOpen(true)}
                    onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
                />

                {/* Content Area — padding-bottom for mobile nav */}
                <div className="flex-1 overflow-auto p-3 sm:p-6 pb-20 lg:pb-6 z-10 custom-scrollbar relative">
                    <Outlet />
                </div>
            </main>

            {/* Mobile Bottom Navigation */}
            <MobileNav />

            <ConnectAgentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
        </div>
    );
};

export default Layout;
