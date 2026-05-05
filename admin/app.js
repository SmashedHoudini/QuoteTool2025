/*
    Plain JavaScript admin editor for pricing.json.

    The page talks to server.js when it is available. That lets us save changes
    directly to the local pricing.json file while we are working in VSCode.
    Later, the loadPricing/savePricing functions can point to a hosted backend
    without rewriting the form rendering below.
*/
(function () {
    const DEFAULT_LINE_TYPES = [
        { name: 'Smartphone', planKey: 'smartphonePlans', planPricing: 'tiered', icon: 'Smartphone', hasHardware: true, protectionEligible: true, multiDeviceProtectionEligible: true, earnsConnectedDiscountSlots: true, connectedDiscountEligible: false, mobileHomeDiscountEligible: false, customType: false },
        { name: 'Tablet', planKey: 'tabletPlans', planPricing: 'flat', icon: 'Tablet', hasHardware: true, protectionEligible: true, multiDeviceProtectionEligible: true, earnsConnectedDiscountSlots: false, connectedDiscountEligible: true, mobileHomeDiscountEligible: false, customType: false },
        { name: 'Watch', planKey: 'watchPlans', planPricing: 'flat', icon: 'Watch', hasHardware: true, protectionEligible: true, multiDeviceProtectionEligible: true, earnsConnectedDiscountSlots: false, connectedDiscountEligible: true, mobileHomeDiscountEligible: false, customType: false },
        { name: 'Home Internet', planKey: 'homeInternetPlans', planPricing: 'flat', icon: 'Wifi', hasHardware: false, protectionEligible: false, multiDeviceProtectionEligible: false, earnsConnectedDiscountSlots: false, connectedDiscountEligible: false, mobileHomeDiscountEligible: true, customType: false },
        { name: 'Custom', planKey: '', planPricing: 'custom', icon: 'Smartphone', hasHardware: true, protectionEligible: true, multiDeviceProtectionEligible: true, earnsConnectedDiscountSlots: false, connectedDiscountEligible: false, mobileHomeDiscountEligible: false, customType: true }
    ];

    const PLAN_PRICING_OPTIONS = ['flat', 'tiered'];
    const ICON_OPTIONS = ['Smartphone', 'Tablet', 'Watch', 'Wifi', 'Phone', 'BriefcaseBusiness', 'MonitorSmartphone', 'Headphones', 'Router'];
    const EMPTY_PLANS = {
        smartphonePlans: { name: 'New Smartphone Plan', costs: [0, 0, 0, 0], autopay: 0, discountSlots: 0 },
        tabletPlans: { name: 'New Tablet Plan', price: 0 },
        watchPlans: { name: 'New Watch Plan', price: 0 },
        homeInternetPlans: { name: 'New Home Internet Plan', price: 0, mhDiscount: 0, autopay: 0 },
        flat: { name: 'New Plan', price: 0, autopay: 0, mhDiscount: 0 },
        tiered: { name: 'New Plan', costs: [0, 0, 0, 0], autopay: 0, discountSlots: 0 }
    };
    const EMPTY_PERK = { name: 'New Perk', cost: 0, savings: 0 };
    const EMPTY_DEVICE = { id: '', enabled: true, type: 'Smartphone', manufacturer: '', model: '', storage: '', price: 0 };

    let config = null;
    let activeProfileKey = 'consumer';
    let activeTab = 'plans';
    let planSection = 'smartphonePlans';
    let deviceTypeFilter = 'All';
    let deviceManufacturerFilter = 'All';
    let pendingDelete = null;
    let draggedItem = null;

    const editor = document.getElementById('editor');
    const statusText = document.getElementById('statusText');

    const clone = (value) => JSON.parse(JSON.stringify(value));
    const money = (value) => Number(value || 0).toFixed(2);
    const numberValue = (value) => {
        const cleaned = String(value).replace(/[^0-9.-]/g, '');
        const parsed = parseFloat(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    };
    const setStatus = (message) => {
        statusText.textContent = message;
    };

    const loadPricing = async () => {
        const response = await fetch('/api/pricing', { cache: 'no-store' });
        if (!response.ok) throw new Error(`Unable to load pricing.json (${response.status})`);
        const data = await response.json();
        config = { devices: [], profiles: {}, ...data };
        config.profiles.smb = config.profiles.smb || createEmptySmbProfile();
        ensureLineTypeConfig(config);
        Object.values(config.profiles || {}).forEach(profile => ensureLineTypeConfig(profile));
        setStatus('Loaded pricing.json');
        render();
    };

    const savePricing = async () => {
        const wasViewingDevices = activeTab === 'devices';
        config.devices = sortDevices(config.devices || []);
        const response = await fetch('/api/pricing', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        if (!response.ok) {
            const error = await response.text();
            throw new Error(error || `Unable to save pricing.json (${response.status})`);
        }
        setStatus('Saved pricing.json');
        if (wasViewingDevices) render();
    };

    const markDirty = () => setStatus('Unsaved changes');

    const slugPlanKey = (name) => `${String(name || 'new-line-type')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
        .replace(/[^a-zA-Z0-9]/g, '')}Plans`;

    const uniquePlanKey = (target, baseKey, currentIndex, oldPlanKey = '') => {
        const cleanBase = baseKey && baseKey !== 'Plans' ? baseKey : 'lineTypePlans';
        let key = cleanBase;
        let suffix = 2;
        while (
            key !== oldPlanKey
            && (
                target[key]
                || (target.lineTypes || []).some((type, index) => index !== currentIndex && type.planKey === key)
            )
        ) {
            key = `${cleanBase.replace(/Plans$/, '')}${suffix}Plans`;
            suffix += 1;
        }
        return key;
    };

    const migrateLineTypeName = (index, previousName, previousPlanKey) => {
        const target = currentConfig();
        const type = target.lineTypes[index];
        if (!type || type.customType) return;

        const nextPlanKey = uniquePlanKey(target, slugPlanKey(type.name), index, previousPlanKey);
        if (previousPlanKey && previousPlanKey !== nextPlanKey) {
            target[nextPlanKey] = target[previousPlanKey] || [clone(EMPTY_PLANS[type.planPricing] || EMPTY_PLANS.flat)];
            delete target[previousPlanKey];
            if (planSection === previousPlanKey) planSection = nextPlanKey;
        }
        type.planKey = nextPlanKey;

        if (previousName && previousName !== type.name) {
            const taxes = target.quoteSettings['taxes&surcharges'];
            const protection = target.quoteSettings.individualProtection;
            taxes[type.name] = taxes[previousName] ?? taxes[type.name] ?? 0;
            delete taxes[previousName];
            if (protection[previousName] !== undefined || type.protectionEligible) {
                protection[type.name] = protection[previousName] ?? protection[type.name] ?? 0;
                delete protection[previousName];
            }
            (config.devices || []).forEach(device => {
                if (device.type === previousName) device.type = type.name;
            });
        }
    };

    const ensureLineTypeConfig = (target = currentConfig()) => {
        target.lineTypes = Array.isArray(target.lineTypes) && target.lineTypes.length > 0
            ? target.lineTypes
            : clone(DEFAULT_LINE_TYPES);
        target.quoteSettings = target.quoteSettings || {};
        target.quoteSettings['taxes&surcharges'] = target.quoteSettings['taxes&surcharges'] || {};
        target.quoteSettings.individualProtection = target.quoteSettings.individualProtection || {};
        target.lineTypes.forEach(type => {
            if (!type.customType && !type.planKey) type.planKey = slugPlanKey(type.name);
            if (!type.planPricing) type.planPricing = type.customType ? 'custom' : 'flat';
            if (!type.icon) type.icon = 'Smartphone';
            if (!type.customType && !target[type.planKey]) {
                target[type.planKey] = [clone(EMPTY_PLANS[type.planPricing] || EMPTY_PLANS.flat)];
            }
            if (target.quoteSettings['taxes&surcharges'][type.name] === undefined) {
                target.quoteSettings['taxes&surcharges'][type.name] = 0;
            }
            if (type.protectionEligible && !type.customType && target.quoteSettings.individualProtection[type.name] === undefined) {
                target.quoteSettings.individualProtection[type.name] = 0;
            }
        });
        return target.lineTypes;
    };

    const getLineTypes = () => ensureLineTypeConfig();

    const getPlanSections = () => (
        getLineTypes()
            .filter(type => !type.customType)
            .map(type => [type.planKey, type.name])
    );

    const getLineTypeForPlanSection = () => (
        getLineTypes().find(type => type.planKey === planSection) || getLineTypes().find(type => !type.customType)
    );

    const deviceTypes = () => {
        const names = new Set();
        ensureLineTypeConfig(config).forEach(type => names.add(type.name));
        Object.values(config.profiles || {}).forEach(profile => {
            ensureLineTypeConfig(profile).forEach(type => names.add(type.name));
        });
        return Array.from(names);
    };

    const createEmptySmbProfile = () => ({
        label: 'SMB',
        addOnLabel: 'Add-ons',
        lineTypes: [
            ...clone(DEFAULT_LINE_TYPES),
            { name: 'One Talk', planKey: 'oneTalkPlans', planPricing: 'flat', icon: 'Phone', hasHardware: false, protectionEligible: false, multiDeviceProtectionEligible: false, earnsConnectedDiscountSlots: false, connectedDiscountEligible: false, mobileHomeDiscountEligible: false, customType: false }
        ],
        smartphonePlans: [{ ...clone(EMPTY_PLANS.smartphonePlans), costs: [0, 0, 0, 0, 0] }],
        tabletPlans: [clone(EMPTY_PLANS.tabletPlans)],
        watchPlans: [clone(EMPTY_PLANS.watchPlans)],
        homeInternetPlans: [clone(EMPTY_PLANS.homeInternetPlans)],
        oneTalkPlans: [clone(EMPTY_PLANS.flat)],
        perks: [clone(EMPTY_PERK)],
        quoteSettings: {
            financingMonths: 36,
            connectedDeviceDiscountRate: 0.5,
            'taxes&surcharges': { Smartphone: 0, Tablet: 0, Watch: 0, 'Home Internet': 0, Custom: 0 },
            individualProtection: { Smartphone: 0, Watch: 0, Tablet: 0 },
            multiDeviceProtection: { perLine: 0, monthlyCap: 0 }
        }
    });

    const currentConfig = () => (
        activeProfileKey === 'consumer' ? config : config.profiles[activeProfileKey]
    );

    const profileTitle = () => activeProfileKey === 'consumer' ? 'Consumer' : (currentConfig().label || 'SMB');

    const bundleDiscountLabel = () => activeProfileKey === 'smb' ? 'Bundle Discount' : 'M+H discount';

    const smartphoneCostCount = () => activeProfileKey === 'smb' ? 5 : 4;

    const smartphoneCostLabels = () => (
        Array.from({ length: smartphoneCostCount() }, (_, index) => {
            const lineNumber = index + 1;
            if (lineNumber === smartphoneCostCount()) return `${lineNumber}+ Lines`;
            return `${lineNumber} Line${lineNumber === 1 ? '' : 's'}`;
        })
    );

    const showDeleteConfirm = (onConfirm) => {
        pendingDelete = onConfirm;
        document.getElementById('confirmDialog').classList.remove('hidden');
    };

    const hideDeleteConfirm = () => {
        pendingDelete = null;
        document.getElementById('confirmDialog').classList.add('hidden');
    };

    const escapeHtml = (value) => String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');

    const slugDevice = (device) => (
        [device.manufacturer, device.model, device.storage]
            .filter(Boolean)
            .join('-')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '') || `device-${Date.now()}`
    );

    const storageRank = (storage) => {
        const match = String(storage || '').match(/[\d.]+/);
        if (!match) return Number.MAX_SAFE_INTEGER;
        const value = parseFloat(match[0]);
        return /tb/i.test(storage) ? value * 1024 : value;
    };

    const typeRank = (type) => {
        const index = deviceTypes().indexOf(type);
        return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };

    const sortDevices = (devices) => [...devices].sort((a, b) => (
        (typeRank(a.type) - typeRank(b.type))
        || String(a.manufacturer || '').localeCompare(String(b.manufacturer || ''))
        || String(a.model || '').localeCompare(String(b.model || ''))
        || (storageRank(a.storage) - storageRank(b.storage))
    ));

    const trashButton = (action, index) => `
        <button type="button" class="trash-button" data-action="${action}" data-index="${index}" aria-label="Remove">
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M3 6h18"></path>
                <path d="M8 6V4h8v2"></path>
                <path d="M6 6l1 15h10l1-15"></path>
                <path d="M10 11v6"></path>
                <path d="M14 11v6"></path>
            </svg>
        </button>
    `;

    const dragHandle = (type, index) => `
        <button type="button" class="drag-handle" draggable="true" data-drag-type="${type}" data-index="${index}" aria-label="Drag to reorder" title="Drag to reorder">
            <span></span><span></span><span></span>
        </button>
    `;

    const activeCheckbox = (path, checked) => `
        <label class="active-cell">
            <span>Active</span>
            <input type="checkbox" data-field="${path}" data-checkbox="true" ${checked === false ? '' : 'checked'}>
        </label>
    `;

    const checkboxField = (label, path, checked) => `
        <label class="active-cell">
            <span>${label}</span>
            <input type="checkbox" data-field="${path}" data-checkbox="true" ${checked === false ? '' : 'checked'}>
        </label>
    `;

    const textField = (label, path, value, placeholder = '') => `
        <label>
            <span>${label}</span>
            <input data-field="${path}" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}">
        </label>
    `;

    const numberField = (label, path, value) => `
        <label>
            <span>${label}</span>
            <input data-field="${path}" data-number="true" inputmode="decimal" value="${Number(value || 0)}">
        </label>
    `;

    const moneyField = (label, path, value) => `
        <label>
            <span>${label}</span>
            <div class="money-field">
                <b>$</b>
                <input data-field="${path}" data-money="true" inputmode="decimal" value="${Number(value || 0) === 0 ? '' : money(value)}" placeholder="0.00">
            </div>
        </label>
    `;

    const selectField = (label, path, value, options) => `
        <label>
            <span>${label}</span>
            <select data-field="${path}">
                ${options.map(option => `<option ${option === value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
            </select>
        </label>
    `;

    const readonlyField = (label, value) => `
        <label>
            <span>${label}</span>
            <input value="${escapeHtml(value)}" readonly>
        </label>
    `;

    const setByPath = (path, value) => {
        const parts = path.split('.');
        let target = path.startsWith('devices.') ? config : currentConfig();
        parts.slice(0, -1).forEach(part => {
            target = target[part];
        });
        target[parts.at(-1)] = value;
        markDirty();
    };

    const render = () => {
        document.querySelectorAll('.tabs button').forEach(button => {
            button.classList.toggle('active', button.dataset.tab === activeTab);
        });

        const profileSwitcher = `
            <div class="profile-switcher">
                <span>Editing</span>
                <button type="button" data-action="profile-section" data-profile="consumer" class="${activeProfileKey === 'consumer' ? 'primary' : ''}">Consumer</button>
                <button type="button" data-action="profile-section" data-profile="smb" class="${activeProfileKey === 'smb' ? 'primary' : ''}">SMB</button>
            </div>
        `;

        if (activeTab === 'plans') renderPlans();
        if (activeTab === 'line-types') renderLineTypes();
        if (activeTab === 'perks') renderPerks();
        if (activeTab === 'devices') renderDevices();
        if (activeTab === 'other') renderOther();
        if (activeTab !== 'devices') editor.insertAdjacentHTML('afterbegin', profileSwitcher);
    };

    const renderPlans = () => {
        const targetConfig = currentConfig();
        const planSections = getPlanSections();
        if (!planSections.some(([key]) => key === planSection)) {
            planSection = planSections[0]?.[0] || 'smartphonePlans';
        }
        const activeType = getLineTypeForPlanSection();
        const plans = targetConfig[planSection] || [];
        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>${profileTitle()} Plans</h2>
                    <p>Filter by device type and edit plan values inline.</p>
                </div>
                <div class="filters">
                    ${planSections.map(([key, label]) => `<button type="button" data-action="plan-section" data-section="${key}" class="${key === planSection ? 'primary' : ''}">${label}</button>`).join('')}
                </div>
            </div>
            <div class="list">
                ${plans.map((plan, index) => renderPlanRow(plan, index)).join('')}
            </div>
            <p style="margin-top:14px"><button type="button" data-action="add-plan" class="primary">Add ${activeType?.name || 'Line'} Plan</button></p>
        `;
    };

    const renderPlanRow = (plan, index) => {
        const base = `
            <div class="list-row reorder-row" data-drop-type="plan" data-index="${index}">
                ${dragHandle('plan', index)}
                ${textField('Plan name', `${planSection}.${index}.name`, plan.name)}
        `;

        const activeType = getLineTypeForPlanSection();
        if (activeType?.planPricing === 'tiered') {
            const costCount = smartphoneCostCount();
            const costs = [...(plan.costs || [])];
            while (costs.length < costCount) costs.push(0);
            const visibleCosts = costs.slice(0, costCount);
            const fieldClass = activeProfileKey === 'smb' ? 'smb-smartphone-fields' : 'smartphone-fields';
            return `${base}
                <div class="inline-fields ${fieldClass}">
                    ${visibleCosts.map((cost, costIndex) => moneyField(smartphoneCostLabels()[costIndex], `${planSection}.${index}.costs.${costIndex}`, cost)).join('')}
                    ${moneyField('Auto Pay discount', `${planSection}.${index}.autopay`, plan.autopay)}
                    ${numberField('Discount slots', `${planSection}.${index}.discountSlots`, plan.discountSlots)}
                </div>
                <div class="row-tools">${trashButton('remove-plan', index)}</div>
            </div>`;
        }

        return `${base}
            <div class="inline-fields">
                ${moneyField('Price', `${planSection}.${index}.price`, plan.price)}
                ${moneyField('Auto Pay discount', `${planSection}.${index}.autopay`, plan.autopay)}
                ${activeType?.mobileHomeDiscountEligible ? moneyField(bundleDiscountLabel(), `${planSection}.${index}.mhDiscount`, plan.mhDiscount) : ''}
            </div>
            <div class="row-tools">${trashButton('remove-plan', index)}</div>
        </div>`;
    };

    const renderLineTypes = () => {
        const types = getLineTypes();
        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>${profileTitle()} Line Types</h2>
                    <p>Add or edit line/device types used by plans, devices, taxes, protection, and the quote builder.</p>
                </div>
                <button type="button" data-action="add-line-type" class="primary">Add Line Type</button>
            </div>
            <div class="list">
                ${types.map((type, index) => `
                    <div class="list-row line-type-row ${type.customType ? 'disabled-row' : ''}" data-drop-type="line-type" data-index="${index}">
                        ${dragHandle('line-type', index)}
                        <div class="inline-fields line-type-fields">
                            ${textField('Name', `lineTypes.${index}.name`, type.name)}
                            ${readonlyField('Plan key', type.customType ? 'Custom' : slugPlanKey(type.name))}
                            ${selectField('Plan pricing', `lineTypes.${index}.planPricing`, type.planPricing || 'flat', type.customType ? ['custom'] : PLAN_PRICING_OPTIONS)}
                            ${selectField('Icon', `lineTypes.${index}.icon`, type.icon || 'Smartphone', ICON_OPTIONS)}
                            ${checkboxField('Hardware', `lineTypes.${index}.hasHardware`, type.hasHardware)}
                            ${checkboxField('Protection', `lineTypes.${index}.protectionEligible`, type.protectionEligible)}
                            ${checkboxField('Multi-device', `lineTypes.${index}.multiDeviceProtectionEligible`, type.multiDeviceProtectionEligible)}
                            ${checkboxField('Can receive slot', `lineTypes.${index}.connectedDiscountEligible`, type.connectedDiscountEligible)}
                            ${checkboxField('Grants slots', `lineTypes.${index}.earnsConnectedDiscountSlots`, type.earnsConnectedDiscountSlots)}
                            ${checkboxField(bundleDiscountLabel(), `lineTypes.${index}.mobileHomeDiscountEligible`, type.mobileHomeDiscountEligible)}
                        </div>
                        <div class="row-tools single">${type.customType ? '' : trashButton('remove-line-type', index)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const renderPerks = () => {
        const targetConfig = currentConfig();
        const addOnLabel = targetConfig.addOnLabel || 'Perks';
        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>${profileTitle()} ${addOnLabel}</h2>
                    <p>Edit order, cost, and savings inline.</p>
                </div>
                <button type="button" data-action="add-perk" class="primary">Add ${addOnLabel.slice(0, -1) || 'Item'}</button>
            </div>
            <div class="list">
                <div class="list-header perk-header">
                    <span></span>
                    <span>Perk Name</span>
                    <span>Cost</span>
                    <span>Savings</span>
                    <span></span>
                </div>
                ${(targetConfig.perks || []).map((perk, index) => `
                    <div class="list-row perk-row reorder-row" data-drop-type="perk" data-index="${index}">
                        ${dragHandle('perk', index)}
                        <div class="inline-fields perk-fields">
                            ${textField('Perk name', `perks.${index}.name`, perk.name)}
                            ${moneyField('Cost', `perks.${index}.cost`, perk.cost)}
                            ${moneyField('Savings', `perks.${index}.savings`, perk.savings)}
                        </div>
                        <div class="row-tools">${trashButton('remove-perk', index)}</div>
                    </div>
                `).join('')}
            </div>
        `;
    };

    const renderDevices = () => {
        const devices = config.devices || [];
        const manufacturers = ['All', ...Array.from(new Set(devices.map(device => device.manufacturer).filter(Boolean))).sort()];
        const visibleDevices = sortDevices(devices).filter(device => (
            (deviceTypeFilter === 'All' || device.type === deviceTypeFilter)
            && (deviceManufacturerFilter === 'All' || device.manufacturer === deviceManufacturerFilter)
        ));

        editor.innerHTML = `
            <div class="section-header">
                <div>
                    <h2>Devices</h2>
                    <p>Maintain future device presets by type, manufacturer, model, storage, and retail price.</p>
                </div>
                <div class="filters">
                    <label class="filter-field"><span>Device Type</span><select data-action="device-type-filter">
                        ${['All', ...deviceTypes()].map(type => `<option ${type === deviceTypeFilter ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
                    </select></label>
                    <label class="filter-field"><span>Manufacturer</span><select data-action="device-manufacturer-filter">
                        ${manufacturers.map(manufacturer => `<option ${manufacturer === deviceManufacturerFilter ? 'selected' : ''}>${escapeHtml(manufacturer)}</option>`).join('')}
                    </select></label>
                    <button type="button" data-action="clear-device-filters">Clear filters</button>
                    <button type="button" data-action="add-device" class="primary">Add Device</button>
                </div>
            </div>
            <div class="list">
                <div class="list-header device-header">
                    <span>Active</span>
                    <span>Device Type</span>
                    <span>Manufacturer</span>
                    <span>Model</span>
                    <span>Storage</span>
                    <span>Retail Price</span>
                    <span></span>
                </div>
                ${visibleDevices.map(device => renderDeviceRow(device, devices.indexOf(device))).join('')}
            </div>
        `;
    };

    const renderDeviceRow = (device, index) => `
        <div class="list-row device-row ${device.enabled === false ? 'disabled-row' : ''}">
            ${activeCheckbox(`devices.${index}.enabled`, device.enabled)}
            <div class="inline-fields device-fields">
                ${selectField('Device type', `devices.${index}.type`, device.type || deviceTypes()[0] || 'Smartphone', deviceTypes())}
                ${textField('Manufacturer', `devices.${index}.manufacturer`, device.manufacturer, 'Apple')}
                ${textField('Model', `devices.${index}.model`, device.model, 'iPhone 17 Pro Max')}
                ${textField('Storage', `devices.${index}.storage`, device.storage, '256GB')}
                ${moneyField('Retail price', `devices.${index}.price`, device.price)}
            </div>
            <div class="row-tools single">${trashButton('remove-device', index)}</div>
        </div>
    `;

    const renderOther = () => {
        const targetConfig = currentConfig();
        ensureLineTypeConfig(targetConfig);
        const settings = targetConfig.quoteSettings;
        const taxes = settings['taxes&surcharges'];
        const types = getLineTypes();
        editor.innerHTML = `
            <div class="settings-grid">
                <div class="settings-panel">
                    <h3>${profileTitle()} Profile</h3>
                    <div class="form-grid">
                        ${activeProfileKey !== 'consumer' ? textField('Profile label', 'label', targetConfig.label || 'SMB') : ''}
                        ${textField('Add-on label', 'addOnLabel', targetConfig.addOnLabel || (activeProfileKey === 'consumer' ? 'Perks' : 'Add-ons'))}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Quote Settings</h3>
                    <div class="form-grid">
                        ${numberField('Financing months', 'quoteSettings.financingMonths', settings.financingMonths)}
                        ${numberField('Connected discount rate', 'quoteSettings.connectedDeviceDiscountRate', settings.connectedDeviceDiscountRate)}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Taxes & Surcharges</h3>
                    <div class="form-grid">
                        ${types.map(type => moneyField(type.name, `quoteSettings.taxes&surcharges.${type.name}`, taxes[type.name])).join('')}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Individual Protection</h3>
                    <div class="form-grid">
                        ${types.filter(type => type.protectionEligible && !type.customType).map(type => moneyField(type.name, `quoteSettings.individualProtection.${type.name}`, settings.individualProtection[type.name])).join('')}
                    </div>
                </div>
                <div class="settings-panel">
                    <h3>Multi-Device Protection</h3>
                    <div class="form-grid">
                        ${moneyField('Per-line cost', 'quoteSettings.multiDeviceProtection.perLine', settings.multiDeviceProtection.perLine)}
                        ${moneyField('Monthly cap', 'quoteSettings.multiDeviceProtection.monthlyCap', settings.multiDeviceProtection.monthlyCap)}
                    </div>
                </div>
            </div>
        `;
    };

    editor.addEventListener('change', (event) => {
        const field = event.target.closest('[data-field]');
        if (field) {
            const isLineTypeField = field.dataset.field.startsWith('lineTypes.');
            let previousLineTypeName = '';
            let previousPlanKey = '';
            let lineTypeIndex = -1;
            let lineTypeProperty = '';
            if (isLineTypeField) {
                const [, indexText, property] = field.dataset.field.split('.');
                lineTypeIndex = parseInt(indexText, 10);
                lineTypeProperty = property;
                const type = currentConfig().lineTypes[lineTypeIndex];
                previousLineTypeName = type?.name || '';
                previousPlanKey = type?.planKey || '';
            }
            const value = field.dataset.checkbox === 'true'
                ? field.checked
                : field.dataset.money === 'true' || field.dataset.number === 'true'
                ? numberValue(field.value)
                : field.value;
            setByPath(field.dataset.field, value);
            if (field.dataset.field.startsWith('devices.')) {
                const index = parseInt(field.dataset.field.split('.')[1], 10);
                config.devices[index].id = slugDevice(config.devices[index]);
            }
            if (field.dataset.field.startsWith('lineTypes.')) {
                const type = currentConfig().lineTypes[lineTypeIndex];
                if (lineTypeProperty === 'name') {
                    migrateLineTypeName(lineTypeIndex, previousLineTypeName, previousPlanKey);
                }
                if (lineTypeProperty === 'planPricing' && type.planKey && !currentConfig()[type.planKey]?.length && !type.customType) {
                    currentConfig()[type.planKey] = [clone(EMPTY_PLANS[type.planPricing] || EMPTY_PLANS.flat)];
                }
                ensureLineTypeConfig();
                render();
                return;
            }
            if (field.dataset.money === 'true') field.value = Number(setValueForPath(field.dataset.field) || 0) === 0 ? '' : money(setValueForPath(field.dataset.field));
            return;
        }

        if (event.target.dataset.action === 'device-type-filter') {
            deviceTypeFilter = event.target.value;
            render();
        }

        if (event.target.dataset.action === 'device-manufacturer-filter') {
            deviceManufacturerFilter = event.target.value;
            render();
        }
    });

    editor.addEventListener('click', (event) => {
        const actionTarget = event.target.closest('[data-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.action;
        const index = parseInt(actionTarget.dataset.index, 10);

        if (action === 'profile-section') {
            activeProfileKey = actionTarget.dataset.profile;
            render();
        }
        if (action === 'plan-section') {
            planSection = actionTarget.dataset.section;
            render();
        }
        if (action === 'add-line-type') {
            const name = 'New Line Type';
            const planKey = uniquePlanKey(currentConfig(), slugPlanKey(name), currentConfig().lineTypes.length);
            currentConfig().lineTypes.push({
                name,
                planKey,
                planPricing: 'flat',
                icon: 'Smartphone',
                hasHardware: true,
                protectionEligible: false,
                multiDeviceProtectionEligible: false,
                earnsConnectedDiscountSlots: false,
                connectedDiscountEligible: false,
                mobileHomeDiscountEligible: false,
                customType: false
            });
            currentConfig()[planKey] = [clone(EMPTY_PLANS.flat)];
            ensureLineTypeConfig();
            markDirty();
            render();
        }
        if (action === 'remove-line-type') {
            showDeleteConfirm(() => {
                const [removed] = currentConfig().lineTypes.splice(index, 1);
                delete currentConfig().quoteSettings['taxes&surcharges'][removed.name];
                delete currentConfig().quoteSettings.individualProtection[removed.name];
                if (planSection === removed.planKey) {
                    planSection = getPlanSections()[0]?.[0] || 'smartphonePlans';
                }
                markDirty();
                render();
            });
        }
        if (action === 'add-plan') {
            const activeType = getLineTypeForPlanSection();
            const planToAdd = clone(EMPTY_PLANS[planSection] || EMPTY_PLANS[activeType?.planPricing] || EMPTY_PLANS.flat);
            if (activeType?.planPricing === 'tiered' && activeProfileKey === 'smb') planToAdd.costs = [0, 0, 0, 0, 0];
            currentConfig()[planSection].push(planToAdd);
            markDirty();
            render();
        }
        if (action === 'remove-plan') {
            showDeleteConfirm(() => {
                currentConfig()[planSection].splice(index, 1);
                markDirty();
                render();
            });
        }
        if (action === 'add-perk') {
            currentConfig().perks.push(clone(EMPTY_PERK));
            markDirty();
            render();
        }
        if (action === 'remove-perk') {
            showDeleteConfirm(() => {
                currentConfig().perks.splice(index, 1);
                markDirty();
                render();
            });
        }
        if (action === 'add-device') {
            config.devices = config.devices || [];
            config.devices.push({ ...clone(EMPTY_DEVICE), id: `device-${Date.now()}` });
            markDirty();
            render();
        }
        if (action === 'clear-device-filters') {
            deviceTypeFilter = 'All';
            deviceManufacturerFilter = 'All';
            render();
        }
        if (action === 'remove-device') {
            showDeleteConfirm(() => {
                config.devices.splice(index, 1);
                markDirty();
                render();
            });
        }
    });

    editor.addEventListener('dragstart', (event) => {
        const handle = event.target.closest('[data-drag-type]');
        if (!handle) return;
        draggedItem = {
            type: handle.dataset.dragType,
            index: parseInt(handle.dataset.index, 10)
        };
        event.dataTransfer.effectAllowed = 'move';
    });

    editor.addEventListener('dragover', (event) => {
        const row = event.target.closest('[data-drop-type]');
        if (!row || !draggedItem || row.dataset.dropType !== draggedItem.type) return;
        event.preventDefault();
        row.classList.add('drag-over');
    });

    editor.addEventListener('dragleave', (event) => {
        const row = event.target.closest('[data-drop-type]');
        if (row) row.classList.remove('drag-over');
    });

    editor.addEventListener('drop', (event) => {
        const row = event.target.closest('[data-drop-type]');
        if (!row || !draggedItem || row.dataset.dropType !== draggedItem.type) return;
        event.preventDefault();
        row.classList.remove('drag-over');

        const targetIndex = parseInt(row.dataset.index, 10);
        if (targetIndex === draggedItem.index) return;

        const items = draggedItem.type === 'plan'
            ? currentConfig()[planSection]
            : draggedItem.type === 'line-type' ? currentConfig().lineTypes : currentConfig().perks;
        const [item] = items.splice(draggedItem.index, 1);
        items.splice(targetIndex, 0, item);
        draggedItem = null;
        markDirty();
        render();
    });

    editor.addEventListener('dragend', () => {
        draggedItem = null;
        editor.querySelectorAll('.drag-over').forEach(row => row.classList.remove('drag-over'));
    });

    document.querySelectorAll('.tabs button').forEach(button => {
        button.addEventListener('click', () => {
            activeTab = button.dataset.tab;
            render();
        });
    });

    document.getElementById('reloadBtn').addEventListener('click', () => {
        loadPricing().catch(error => setStatus(error.message));
    });

    document.getElementById('saveBtn').addEventListener('click', () => {
        savePricing().catch(error => setStatus(error.message));
    });

    document.getElementById('confirmCancelBtn').addEventListener('click', hideDeleteConfirm);
    document.getElementById('confirmDialog').addEventListener('click', (event) => {
        if (event.target.id === 'confirmDialog') hideDeleteConfirm();
    });
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
        if (pendingDelete) pendingDelete();
        hideDeleteConfirm();
    });

    const setValueForPath = (path) => {
        const parts = path.split('.');
        let target = path.startsWith('devices.') ? config : currentConfig();
        parts.forEach(part => {
            target = target[part];
        });
        return target;
    };

    loadPricing().catch(error => setStatus(error.message));
})();
