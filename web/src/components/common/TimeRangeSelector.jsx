import React, { useState, useEffect } from 'react';
import { Clock, Calendar } from 'lucide-react';

const TimeRangeSelector = ({ value, onChange, options = ['realtime', '1h', '6h', '24h', '7d'], onCustomChange }) => {
    // value is string 'realtime', '1h' or 'custom'
    const [isCustom, setIsCustom] = useState(value === 'custom');
    const [showCustomPanel, setShowCustomPanel] = useState(false);
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');

    useEffect(() => {
        setIsCustom(value === 'custom');
    }, [value]);

    const handleSelect = (v) => {
        if (v === 'custom') {
            setShowCustomPanel(prev => !prev);
            if (value !== 'custom') {
                onChange(v);
            }
        } else {
            setShowCustomPanel(false);
            onChange(v);
        }
    };

    const handleApplyCustom = () => {
        if (customFrom && customTo && onCustomChange) {
            // Convert to ISO 8601 strings or pass directly
            const fromIso = new Date(customFrom).toISOString();
            const toIso = new Date(customTo).toISOString();
            onCustomChange(fromIso, toIso);
            setShowCustomPanel(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 relative">
            <div className="flex bg-cyber-gray/20 rounded-lg p-1 gap-1 items-center">
                <Clock className="w-4 h-4 text-cyber-cyan ml-2 mr-1" />
                {options.map((range) => (
                    <button
                        key={range}
                        onClick={() => handleSelect(range)}
                        className={`px-3 py-1 text-xs rounded transition-all ${!isCustom && value === range
                            ? 'bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/30'
                            : 'text-cyber-muted hover:text-cyber-text hover:bg-cyber-gray/20 border border-transparent'
                            }`}
                    >
                        {range === 'realtime' ? 'Live' : range}
                    </button>
                ))}

                <button
                    onClick={() => handleSelect('custom')}
                    className={`px-3 py-1 text-xs rounded transition-all flex items-center gap-1 ${isCustom
                        ? 'bg-cyber-cyan/20 text-cyber-cyan border border-cyber-cyan/30'
                        : 'text-cyber-muted hover:text-cyber-text hover:bg-cyber-gray/20 border border-transparent'
                        }`}
                >
                    <Calendar className="w-3 h-3" /> Custom
                </button>
            </div>

            {showCustomPanel && (
                <div className="absolute top-full right-0 mt-2 p-3 bg-[#0b1120] border border-cyber-cyan/30 rounded-lg shadow-2xl shadow-cyan-900/20 z-50 flex flex-col md:flex-row items-end gap-3 min-w-[320px]">
                    <div className="flex flex-col w-full">
                        <label className="text-[10px] text-cyber-muted uppercase tracking-wider mb-1">From Time</label>
                        <input
                            type="datetime-local"
                            className="bg-cyber-gray/30 text-cyber-text border border-cyber-dim rounded px-2 py-1.5 text-xs outline-none focus:border-cyan-400 w-full"
                            value={customFrom}
                            onChange={(e) => setCustomFrom(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col w-full">
                        <label className="text-[10px] text-cyber-muted uppercase tracking-wider mb-1">To Time</label>
                        <input
                            type="datetime-local"
                            className="bg-cyber-gray/30 text-cyber-text border border-cyber-dim rounded px-2 py-1.5 text-xs outline-none focus:border-cyan-400 w-full"
                            value={customTo}
                            onChange={(e) => setCustomTo(e.target.value)}
                        />
                    </div>
                    <button
                        onClick={handleApplyCustom}
                        disabled={!customFrom || !customTo}
                        className="bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/40 disabled:opacity-30 border border-cyan-500/50 rounded px-4 py-1.5 text-xs font-semibold"
                    >
                        Query
                    </button>
                </div>
            )}
        </div>
    );
};

export default TimeRangeSelector;
