const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function calculateLedgerMovements(beginningBalance, transactions) {
    let runningBalance = beginningBalance;
    let totalIn = 0;
    let totalOut = 0;
    let totalDisposal = 0;
    let totalAdjustment = 0;

    const rows = transactions.map(trx => {
        let inQty = 0;
        let outQty = 0;
        const qty = trx.quantity;

        if (trx.transaction_type === 'IN') {
            inQty = qty;
            runningBalance += inQty;
            totalIn += inQty;
        } else if (trx.transaction_type === 'OUT') {
            outQty = qty;
            runningBalance -= outQty;
            totalOut += outQty;
        } else if (trx.transaction_type === 'DISPOSAL') {
            outQty = qty;
            runningBalance -= outQty;
            totalDisposal += outQty;
        } else if (trx.transaction_type === 'ADJUSTMENT') {
            const isSurplus = trx.notes && (trx.notes.includes('SURPLUS') || trx.notes.includes('+'));
            if (isSurplus) {
                inQty = qty;
                runningBalance += inQty;
                totalAdjustment += inQty;
            } else {
                outQty = qty;
                runningBalance -= outQty;
                totalAdjustment -= outQty;
            }
        }

        return {
            ...trx,
            in_quantity: inQty,
            out_quantity: outQty,
            balance_after: runningBalance
        };
    });

    return {
        beginningBalance,
        endingBalance: runningBalance,
        summary: {
            totalIn,
            totalOut,
            totalDisposal,
            netAdjustment: totalAdjustment,
            netChange: runningBalance - beginningBalance
        },
        movements: rows
    };
}

describe('WMS Stock Card Ledger & Running Balance Tests', () => {
    test('1. Perhitungan saldo berjalan dengan urutan transaksi IN dan OUT', () => {
        const transactions = [
            { transaction_id: 1, transaction_type: 'IN', quantity: 100, notes: 'Inbound PO-01' },
            { transaction_id: 2, transaction_type: 'OUT', quantity: 30, notes: 'Delivery DO-01' },
            { transaction_id: 3, transaction_type: 'OUT', quantity: 20, notes: 'Delivery DO-02' }
        ];

        const result = calculateLedgerMovements(0, transactions);
        assert.strictEqual(result.beginningBalance, 0);
        assert.strictEqual(result.movements[0].balance_after, 100);
        assert.strictEqual(result.movements[1].balance_after, 70);
        assert.strictEqual(result.movements[2].balance_after, 50);
        assert.strictEqual(result.endingBalance, 50);
        assert.strictEqual(result.summary.totalIn, 100);
        assert.strictEqual(result.summary.totalOut, 50);
    });

    test('2. Penanganan saldo awal (Beginning Balance) dari periode sebelumnya', () => {
        const transactions = [
            { transaction_id: 4, transaction_type: 'IN', quantity: 40, notes: 'Inbound' },
            { transaction_id: 5, transaction_type: 'DISPOSAL', quantity: 5, notes: 'Kemasan rusak' }
        ];

        const result = calculateLedgerMovements(50, transactions);
        assert.strictEqual(result.beginningBalance, 50);
        assert.strictEqual(result.movements[0].balance_after, 90);
        assert.strictEqual(result.movements[1].balance_after, 85);
        assert.strictEqual(result.endingBalance, 85);
        assert.strictEqual(result.summary.totalDisposal, 5);
        assert.strictEqual(result.summary.netChange, 35);
    });

    test('3. Penanganan penyesuaian Stock Opname Surplus dan Defisit', () => {
        const transactions = [
            { transaction_id: 6, transaction_type: 'ADJUSTMENT', quantity: 10, notes: '[OPNAME SURPLUS +10] Audit rak B1' },
            { transaction_id: 7, transaction_type: 'ADJUSTMENT', quantity: 4, notes: '[OPNAME DEFISIT -4] Barang hilang' }
        ];

        const result = calculateLedgerMovements(20, transactions);
        assert.strictEqual(result.movements[0].in_quantity, 10);
        assert.strictEqual(result.movements[0].balance_after, 30);
        assert.strictEqual(result.movements[1].out_quantity, 4);
        assert.strictEqual(result.movements[1].balance_after, 26);
        assert.strictEqual(result.endingBalance, 26);
        assert.strictEqual(result.summary.netAdjustment, 6);
    });

    test('4. Perhitungan periode kosong tanpa mutasi transaksi', () => {
        const result = calculateLedgerMovements(75, []);
        assert.strictEqual(result.beginningBalance, 75);
        assert.strictEqual(result.endingBalance, 75);
        assert.strictEqual(result.movements.length, 0);
        assert.strictEqual(result.summary.netChange, 0);
    });
});
