/*
    Standalone Verizon Mobile Protect calculator.

    This file registers an optional tool that the main quote app can link to
    from the hamburger menu. Toggle `enabled` below to show or hide it without
    changing the quote builder.
*/
(function () {
    const { useState } = React;

    const enabled = true;
    const VMP_MONTHLY = 19;
    const INSTALLMENT_TERMS = 36;
    const DEDUCTIBLES = { replacement: 99, screen: 0, lost: 200 };
    const INCIDENT_TYPES = [
        { id: 'replacement', label: 'Broken (Replacement)', price: '$99' },
        { id: 'screen', label: 'Cracked screen', price: 'Free' },
        { id: 'lost', label: 'Lost or stolen', price: '$200' }
    ];

    const Icon = ({ name, size = 18, className = '' }) => {
        const iconData = lucide.icons[name] || lucide[name];
        if (!iconData) return null;
        return (
            <svg
                width={size} height={size} viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={className}
            >
                {iconData.map(([tag, attrs], i) => React.createElement(tag, { ...attrs, key: i }))}
            </svg>
        );
    };

    const VMPCalculator = ({ onBack }) => {
        const [devicePrice, setDevicePrice] = useState('1000');
        const [monthlyPromo, setMonthlyPromo] = useState('22.22');
        const [incidentMonth, setIncidentMonth] = useState(15);
        const [incidentType, setIncidentType] = useState('replacement');

        const numPrice = parseFloat(devicePrice) || 0;
        const numPromo = parseFloat(monthlyPromo) || 0;
        const monthlyStandardPayment = numPrice / INSTALLMENT_TERMS;
        const actualMonthlyPayment = Math.max(0, monthlyStandardPayment - numPromo);
        const monthsRemaining = INSTALLMENT_TERMS - incidentMonth;
        const remainingBalance = monthlyStandardPayment * monthsRemaining;
        const remainingPromoValue = numPromo * monthsRemaining;
        const costWithoutVMP = (actualMonthlyPayment * incidentMonth) + remainingBalance + numPrice;
        const costWithVMP = (actualMonthlyPayment * incidentMonth) + (VMP_MONTHLY * incidentMonth) + DEDUCTIBLES[incidentType];
        const totalSavings = costWithoutVMP - costWithVMP;
        const visualVmpPercent = costWithoutVMP > 0 ? Math.min(100, Math.max(0, (costWithVMP / costWithoutVMP) * 100)) : 0;
        const benefitPercent = costWithoutVMP > 0 ? Math.round((totalSavings / costWithoutVMP) * 100) : 0;

        return (
            <div className="space-y-8">
                <style>{`
                    .vmp-range {
                        appearance: none;
                        -webkit-appearance: none;
                        background: transparent;
                        width: 100%;
                    }
                    .vmp-range:focus {
                        outline: none;
                    }
                    .vmp-range::-webkit-slider-runnable-track {
                        width: 100%;
                        height: 4px;
                        cursor: pointer;
                        background: #000000;
                        border-radius: 0;
                    }
                    .vmp-range::-webkit-slider-thumb {
                        height: 20px;
                        width: 20px;
                        border-radius: 0;
                        background: #f50a23;
                        cursor: pointer;
                        -webkit-appearance: none;
                        margin-top: -8px;
                    }
                    .vmp-range::-moz-range-track {
                        width: 100%;
                        height: 4px;
                        cursor: pointer;
                        background: #000000;
                        border-radius: 0;
                    }
                    .vmp-range::-moz-range-thumb {
                        height: 20px;
                        width: 20px;
                        border: 0;
                        border-radius: 0;
                        background: #f50a23;
                        cursor: pointer;
                    }
                `}</style>

                <button onClick={onBack} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-black/10 rounded-full text-xs font-black uppercase tracking-widest text-black/60 hover:text-black hover:border-black/20 transition-colors">
                    <Icon name="ArrowLeft" size={14} /> Back to Quote
                </button>

                <header className="border-b-2 border-black pb-8">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#f50a23] leading-tight mb-2">Verizon Mobile Protect</h1>
                    <p className="text-lg md:text-xl font-medium text-black">The mathematical case for protecting your tech and your promotion.</p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-1">
                    <div className="lg:col-span-4 bg-white p-6 md:p-8 border border-black space-y-8">
                        <section>
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Icon name="Smartphone" /> Device details</h2>
                            <div className="space-y-8">
                                <div className="space-y-4">
                                    <label className="block text-sm font-bold uppercase tracking-wider">Retail price</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-xl">$</span>
                                        <input type="number" value={devicePrice} onWheel={e => e.currentTarget.blur()} onChange={e => setDevicePrice(e.target.value)} className="w-full border-2 border-black p-4 pl-8 text-2xl font-black focus:bg-green-50 outline-none" placeholder="0" />
                                    </div>
                                    <input type="range" min="0" max="2500" step="50" value={Math.min(numPrice, 2500)} onChange={e => setDevicePrice(e.target.value)} className="vmp-range" />
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-gray-400"><span>$0</span><span>$2,500</span></div>
                                </div>

                                <div className="space-y-4 pt-4 border-t border-gray-100">
                                    <label className="block text-sm font-bold uppercase tracking-wider">Monthly promotion credit</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 font-bold text-xl">$</span>
                                        <input type="number" value={monthlyPromo} onWheel={e => e.currentTarget.blur()} onChange={e => setMonthlyPromo(e.target.value)} className="w-full border-2 border-black p-4 pl-8 text-2xl font-black focus:bg-green-50 outline-none" placeholder="0.00" />
                                    </div>
                                    <input type="range" min="0" max="40" step="1" value={Math.min(numPromo, 40)} onChange={e => setMonthlyPromo(e.target.value)} className="vmp-range" />
                                    <div className="flex justify-between text-[10px] font-bold uppercase text-gray-400"><span>$0</span><span>$40</span></div>
                                    <p className="text-xs font-medium text-gray-500 italic">VMP protects the ${Math.round(remainingPromoValue).toLocaleString()} in credits remaining on your account.</p>
                                </div>
                            </div>
                        </section>

                        <section className="pt-8 border-t border-gray-200">
                            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2"><Icon name="AlertTriangle" /> The incident</h2>
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-bold uppercase tracking-wider mb-2">Month of incident: {incidentMonth}</label>
                                    <input type="range" min="1" max="36" value={incidentMonth} onChange={e => setIncidentMonth(Number(e.target.value))} className="vmp-range" />
                                </div>
                                <div className="space-y-2">
                                    {INCIDENT_TYPES.map(type => (
                                        <button key={type.id} onClick={() => setIncidentType(type.id)} className={`w-full flex items-center justify-between p-4 border-2 transition-all font-bold text-left ${incidentType === type.id ? 'bg-[#f50a23] text-white border-[#f50a23]' : 'bg-white border-black hover:bg-gray-50'}`}>
                                            <span>{type.label}</span>
                                            <span>{type.price}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </section>
                    </div>

                    <div className="lg:col-span-8 space-y-1">
                        <section className="bg-white p-6 md:p-8 border border-black">
                            <h2 className="text-2xl md:text-3xl font-black mb-10 md:mb-12 text-center uppercase tracking-tight">Total out-of-pocket cost comparison</h2>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12 mb-12 relative">
                                <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-px bg-gray-200"></div>
                                <div className="space-y-6">
                                    <div className="bg-black text-white p-2 inline-block font-bold px-4 mb-2 uppercase text-xs">No protection</div>
                                    <div className="text-4xl md:text-5xl font-black">${Math.round(costWithoutVMP).toLocaleString()}</div>
                                    <p className="text-sm font-medium leading-relaxed">Without VMP, a broken device often results in losing your promotion. You owe the balance of <span className="font-bold">${Math.round(remainingBalance).toLocaleString()}</span> plus a new phone.</p>
                                    <div className="h-4 w-full bg-[#f3ede0] overflow-hidden"><div className="h-full bg-black w-full"></div></div>
                                </div>
                                <div className="space-y-6">
                                    <div className="bg-[#f50a23] text-white p-2 inline-block font-bold px-4 mb-2 uppercase text-xs">With VMP</div>
                                    <div className="text-4xl md:text-5xl font-black text-[#f50a23]">${Math.round(costWithVMP).toLocaleString()}</div>
                                    <p className="text-sm font-medium leading-relaxed">VMP keeps your promo active. You pay the deductible and protection fee, preserving <span className="font-bold">${Math.round(remainingPromoValue).toLocaleString()}</span> in credits.</p>
                                    <div className="h-4 w-full bg-[#f3ede0] overflow-hidden"><div className="h-full bg-[#f50a23]" style={{ width: `${visualVmpPercent}%` }}></div></div>
                                </div>
                            </div>

                            <div className="bg-[#e6f4ea] p-6 md:p-8 border-2 border-[#1e8e3e] flex flex-col md:flex-row items-center justify-between gap-6">
                                <div>
                                    <h3 className="text-3xl md:text-4xl font-black tracking-tight uppercase text-[#1e8e3e]">Total savings: ${Math.round(totalSavings).toLocaleString()}</h3>
                                    <p className="font-bold text-base md:text-lg text-[#1e8e3e]">VMP provides a net financial benefit of {benefitPercent}%.</p>
                                </div>
                                <div className="bg-[#1e8e3e] p-4 rounded-full text-white"><Icon name="TrendingDown" size={32} /></div>
                            </div>
                        </section>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-1 text-black">
                            <div className="bg-white p-6 border border-black"><div className="mb-4 text-[#f50a23]"><Icon name="CheckCircle" /></div><h4 className="font-black text-lg mb-2">Unlimited repairs</h4><p className="text-sm font-medium text-gray-600 leading-snug">$0 cracked screen repairs for eligible devices.</p></div>
                            <div className="bg-white p-6 border border-black"><div className="mb-4 text-[#f50a23]"><Icon name="Zap" /></div><h4 className="font-black text-lg mb-2">Speed of service</h4><p className="text-sm font-medium text-gray-600 leading-snug">Replacements delivered as soon as the next day.</p></div>
                            <div className="bg-white p-6 border border-black"><div className="mb-4 text-[#f50a23]"><Icon name="Shield" /></div><h4 className="font-black text-lg mb-2">Full protection</h4><p className="text-sm font-medium text-gray-600 leading-snug">Covers loss, theft, damage, and post-warranty defects.</p></div>
                            <div className="bg-white p-6 border border-black"><div className="mb-4 text-[#f50a23]"><Icon name="PhoneOff" /></div><h4 className="font-black text-lg mb-2">Call Filter Plus</h4><p className="text-sm font-medium text-gray-600 leading-snug">Identify unknown callers and prevent spam risk.</p></div>
                            <div className="bg-white p-6 border border-black"><div className="mb-4 text-[#f50a23]"><Icon name="ShieldAlert" /></div><h4 className="font-black text-lg mb-2">Verizon Digital Security</h4><p className="text-sm font-medium text-gray-600 leading-snug">Antivirus, Safe Browsing, Wifi Security, Dark Web Monitoring, and Indentity Restoration Services.</p></div>
                            <div className="bg-white p-6 border border-black"><div className="mb-4 text-[#f50a23]"><Icon name="Headset" /></div><h4 className="font-black text-lg mb-2">24/7 Tech Coach</h4><p className="text-sm font-medium text-gray-600 leading-snug">On-demand expert help for all your tech.</p></div>
                            
                        </div>
                    </div>
                </div>

                <footer className="border-t border-black pt-8 text-xs font-bold uppercase tracking-widest text-gray-400">
                    <div className="max-w-3xl lowercase">*Deductibles and savings are estimates. Costs for "No Protection" assume a retail purchase of a replacement device and requirement to settle agreements. VMP is $19/month per line.</div>
                </footer>
            </div>
        );
    };

    window.QuoteTool = {
        ...(window.QuoteTool || {}),
        tools: {
            ...(window.QuoteTool?.tools || {}),
            vmpCalculator: {
                enabled,
                label: 'VMP Calculator',
                Component: VMPCalculator
            }
        }
    };
})();
