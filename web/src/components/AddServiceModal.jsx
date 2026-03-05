import React, { useState } from 'react';
import {
    X, Check, Copy, Server, FileText, Database,
    Terminal, Shield, Settings
} from 'lucide-react';
import { copyToClipboard } from '../utils/clipboard';

const SERVICE_TEMPLATES = {
    'nginx': {
        name: 'Nginx Web Server',
        icon: Globe,
        description: 'Monitor Nginx access and error logs.',
        config: {
            "collectors": { "nginx": true },
            "log_config": {
                "selected_logs": ["/var/log/nginx/access.log", "/var/log/nginx/error.log"]
            }
        }
    },
    'apache': {
        name: 'Apache HTTP Server',
        icon: Server,
        description: 'Monitor Apache/Httpd logs.',
        config: {
            "collectors": { "apache": true },
            "log_config": {
                "selected_logs": ["/var/log/apache2/access.log", "/var/log/apache2/error.log"]
            }
        }
    },
    'pm2': {
        name: 'PM2 Process Manager',
        icon: Terminal,
        description: 'Monitor Node.js applications managed by PM2.',
        config: {
            "collectors": { "pm2": true },
            "log_config": {
                "selected_logs": ["~/.pm2/logs/*.log"]
            }
        }
    },
    'custom': {
        name: 'Custom Log File',
        icon: FileText,
        description: 'Monitor any specific log file on the system.',
        config: {
            "log_config": {
                "selected_logs": ["/path/to/your/application.log"]
            }
        }
    }
};

// Icon component mapper because we can't store components in JSON effectively above without messy structure
import { Globe } from 'lucide-react';

const AddServiceModal = ({ isOpen, onClose }) => {
    const [selectedService, setSelectedService] = useState(null);
    const [copied, setCopied] = useState(false);

    if (!isOpen) return null;

    const handleCopy = () => {
        if (!selectedService) return;
        const snippet = JSON.stringify(SERVICE_TEMPLATES[selectedService].config, null, 2);
        copyToClipboard(snippet);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const currentTemplate = selectedService ? SERVICE_TEMPLATES[selectedService] : null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-cyber-black/80 backdrop-blur-sm">
            <div className="glass-panel rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl border border-cyber-gray">

                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-cyber-gray/50 bg-cyber-gray/10">
                    <div>
                        <h2 className="text-xl font-bold text-cyber-text">Add Service Integration</h2>
                        <p className="text-sm text-cyber-muted">Select a service to generate configuration.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-cyber-gray/20 rounded-lg transition-colors">
                        <X size={20} className="text-cyber-muted" />
                    </button>
                </div>

                <div className="flex h-[450px]">
                    {/* Sidebar List */}
                    <div className="w-1/3 border-r border-cyber-gray/20 bg-cyber-gray/5 overflow-y-auto">
                        {Object.entries(SERVICE_TEMPLATES).map(([key, template]) => {
                            const Icon = template.icon || Server;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setSelectedService(key)}
                                    className={`w-full text-left p-4 flex items-center gap-3 transition-colors border-l-2
                    ${selectedService === key
                                            ? 'bg-cyber-cyan/10 border-cyber-cyan text-cyber-text'
                                            : 'border-transparent text-cyber-muted hover:bg-cyber-gray/10 hover:text-cyber-text'}
                  `}
                                >
                                    <Icon size={18} />
                                    <span className="font-medium text-sm">{template.name}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Details Panel */}
                    <div className="w-2/3 bg-cyber-background/50 flex flex-col h-full">
                        {currentTemplate ? (
                            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                                <div className="mb-6">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="p-2 bg-cyber-cyan/10 rounded-lg">
                                            {React.createElement(currentTemplate.icon || Server, { size: 24, className: 'text-cyber-cyan' })}
                                        </div>
                                        <h3 className="text-lg font-bold text-cyber-text">{currentTemplate.name}</h3>
                                    </div>
                                    <p className="text-cyber-muted text-sm">{currentTemplate.description}</p>
                                </div>

                                <div className="bg-cyber-black/30 rounded-lg border border-cyber-gray/30 p-4 font-mono text-sm overflow-hidden flex flex-col mb-6">
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-xs text-cyber-muted uppercase tracking-wider">agent-config.json snippet</span>
                                        <button
                                            onClick={handleCopy}
                                            className="flex items-center gap-2 text-xs text-cyber-cyan hover:text-cyber-cyan/80 transition-colors"
                                        >
                                            {copied ? <Check size={14} /> : <Copy size={14} />}
                                            {copied ? 'Copied!' : 'Copy JSON'}
                                        </button>
                                    </div>
                                    <div className="overflow-x-auto custom-scrollbar">
                                        <pre className="text-cyber-text whitespace-pre-wrap">
                                            {JSON.stringify(currentTemplate.config, null, 2)}
                                        </pre>
                                    </div>
                                </div>

                                <div className="p-4 bg-cyber-yellow/10 border border-cyber-yellow/20 rounded-lg">
                                    <h4 className="flex items-center gap-2 text-cyber-yellow font-bold text-sm mb-1">
                                        <Terminal size={14} />
                                        Instructions
                                    </h4>
                                    <ol className="list-decimal list-inside text-xs text-cyber-muted space-y-1 ml-1">
                                        <li>SSH into your server.</li>
                                        <li>Open <code className="bg-cyber-gray/20 px-1 rounded text-cyber-text">agent-config.json</code></li>
                                        <li>Merge the snippet above into your config.</li>
                                        <li>Restart the agent: <code className="bg-cyber-gray/20 px-1 rounded text-cyber-text">systemctl restart vastlogs-agent</code></li>
                                    </ol>
                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-cyber-muted">
                                <Settings size={48} className="mb-4 opacity-20" />
                                <p>Select a service to view configuration.</p>
                            </div>
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default AddServiceModal;
