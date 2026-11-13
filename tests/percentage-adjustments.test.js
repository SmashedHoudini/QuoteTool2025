const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const context = vm.createContext({ window: {} });
for (const file of ['calculations.js', 'state.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
}
const { calculateQuote, createLine, getPricingProfile, copyLine, createAdjustment } = context.window.QuoteTool;
const config = JSON.parse(fs.readFileSync(path.join(root, 'pricing.json'), 'utf8'));
const consumer = getPricingProfile(config, 'consumer');
const adjustment = (amount, type = 'credit', amountMode = 'percentage') => ({
    ...createAdjustment(), amount, type, amountMode
});
const line = (price = 80, autopay = 10, profile = consumer) => ({
    ...createLine('Smartphone', 1, profile),
    planName: 'Custom', customPlanPrice: price, customAutopayDiscount: autopay
});
const quote = (lines, accountAdjustments = [], options = {}, profile = consumer) => calculateQuote({
    lines, accountAdjustments, multiDeviceProtection: false, oneTimeCredits: [],
    includeEstimatedTaxes: false, ...options
}, profile);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('15% of $80 becomes $10.50 after $10 Auto Pay; no Auto Pay reprices to $12', () => {
    const result = quote([{ ...line(), adjustments: [adjustment(15)] }]);
    near(result.processedLines[0].adjSum, -10.5);
    near(result.total, 59.5);
    near(result.totalWithoutAutopay, 68);
    near(result.totalAdjustmentCredits, 10.5);
    near(result.totalMonthlySavings, 20.5);
});

test('Auto Pay override, including explicit zero, drives the percentage base', () => {
    for (const [override, credit, total] of [['5', 11.25, 63.75], ['0', 12, 68]]) {
        const result = quote([{ ...line(), autoPayOverride: override, adjustments: [adjustment(15)] }]);
        near(result.processedLines[0].adjustments[0].calculatedAmount, credit);
        near(result.total, total);
        near(result.totalWithoutAutopay, 68);
    }
});

test('account percentages follow line adjustments but exclude all extras', () => {
    const first = { ...line(), devicePrice: 720, financingMonths: 36, individualProtection: true,
        perks: [consumer.perks[0].name], adjustments: [adjustment(15), adjustment(5, 'charge', 'amount')] };
    const second = line(40, 5);
    const result = quote([first, second], [adjustment(15)], { multiDeviceProtection: true, includeEstimatedTaxes: true });
    near(result.processedAccountAdjustments[0].calculatedAmount, 14.81);
    const withoutExtras = quote([{ ...line(), adjustments: first.adjustments }, second], [adjustment(15)]);
    near(withoutExtras.accAdjSum, result.accAdjSum);
    const plain = quote([line(), second], [adjustment(15)]);
    near(plain.total, 89.25);
    near(plain.totalWithoutAutopay, 102);
});

test('line percentages share a base, then account percentages apply to the result', () => {
    const result = quote([{ ...line(), adjustments: [adjustment(15), adjustment(10), adjustment(5, 'charge')] }], [adjustment(10)]);
    near(result.processedLines[0].adjSum, -14);
    near(result.accAdjSum, -5.6);
    near(result.total, 50.4);
});

test('dollar line adjustments apply before percentages regardless of row order', () => {
    for (const adjustments of [
        [adjustment(15), adjustment(20, 'charge', 'amount')],
        [adjustment(20, 'charge', 'amount'), adjustment(15)]
    ]) {
        const result = quote([{ ...line(), adjustments }]);
        const percentage = result.processedLines[0].adjustments.find(adj => adj.amountMode === 'percentage');
        near(percentage.calculatedAmount, 13.5); // (80 - 10 + 20) * 15%
        near(result.total, 76.5);
        near(result.totalWithoutAutopay, 85);
    }
});

test('dollar credits reduce the percentage base and Auto Pay overrides are respected', () => {
    const result = quote([{ ...line(), autoPayOverride: '5',
        adjustments: [adjustment(10, 'credit', 'amount'), adjustment(15)] }]);
    near(result.processedLines[0].adjustments[1].calculatedAmount, 9.75);
    near(result.total, 55.25);
    near(result.totalWithoutAutopay, 59.5);
});

test('Mobile + Home discount is deducted before calculating percentages', () => {
    const homePlan = consumer.homeInternetPlans.find(plan => plan.mhDiscount > 0);
    const home = { ...createLine('Home Internet', 2, consumer), planName: homePlan.name,
        adjustments: [adjustment(15)] };
    const result = quote([line(), home]);
    const processed = result.processedLines[1];
    near(processed.adjustments[0].calculatedAmount,
        Math.round((homePlan.price - (homePlan.autopay || 0) - homePlan.mhDiscount) * 15) / 100);
});

test('connected-device discount is deducted before calculating percentages', () => {
    const phone = { ...line(), customDiscountSlots: 1 };
    const tablet = { ...createLine('Tablet', 2, consumer), planName: 'Custom', customPlanPrice: 40,
        adjustments: [adjustment(15)] };
    const result = quote([phone, tablet]);
    near(result.processedLines[1].adjustments[0].calculatedAmount, 3);
    near(result.processedLines[1].totalLineCost, 17);
});

test('connected-device lines honor Auto Pay overrides as well as plan discounts', () => {
    const phone = { ...line(), customDiscountSlots: 1 };
    const tablet = { ...createLine('Tablet', 2, consumer), planName: 'Custom', customPlanPrice: 40,
        autoPayOverride: '5', adjustments: [adjustment(15)] };
    const result = quote([phone, tablet]);
    near(result.processedLines[1].actualPlanCost, 15);
    near(result.processedLines[1].adjustments[0].calculatedAmount, 2.25);
    near(result.total, 82.75);
    near(result.totalWithoutAutopay, 97);
});

test('percentage charges also recalculate for estimates without Auto Pay', () => {
    const result = quote([{ ...line(), adjustments: [adjustment(15, 'charge')] }], [adjustment(10, 'charge')]);
    near(result.total, 88.55);
    near(result.totalWithoutAutopay, 101.2);
});

test('legacy adjustments without amountMode remain fixed dollars', () => {
    const legacy = { id: 'old', type: 'credit', label: 'Existing', amount: '15' };
    const result = quote([{ ...line(), adjustments: [legacy] }], [legacy]);
    near(result.total, 40);
    near(result.totalWithoutAutopay, 50);
});

test('percentages round to cents and zero-priced plans produce no percentage charge', () => {
    near(quote([{ ...line(33.33, 0), adjustments: [adjustment(12.5)] }]).processedLines[0].adjSum, -4.17);
    near(quote([{ ...line(0, 0), adjustments: [adjustment(15, 'charge')] }], [adjustment(10)]).total, 0);
});

test('percentage mode survives line copying, share serialization, and quote duplication', () => {
    const original = { ...line(), adjustments: [adjustment(15)] };
    for (const copied of [copyLine(original, 2), JSON.parse(JSON.stringify(original)), structuredClone(original)]) {
        assert.equal(copied.adjustments[0].amountMode, 'percentage');
        near(quote([copied]).total, 59.5);
    }
    assert.equal(original.adjustments[0].calculatedAmount, undefined);
});

test('SMB uses the same percentage and Auto Pay override rules', () => {
    const smb = getPricingProfile(config, 'smb');
    const result = quote([{ ...line(80, 10, smb), autoPayOverride: '5', adjustments: [adjustment(15)] }], [], {}, smb);
    near(result.total, 63.75);
    near(result.totalWithoutAutopay, 68);
});
