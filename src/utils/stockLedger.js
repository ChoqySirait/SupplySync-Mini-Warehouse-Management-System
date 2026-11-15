/**
 * Utility Perhitungan Buku Kartu Stok Ledger (Running Balance)
 */
function calculateStockCardLedger({ beginningBalance = 0, transactions = [] }) {
    let runningBalance = beginningBalance;
    let totalIn = 0;
    let totalOut = 0;

    const entries = transactions.map(trx => {
        let inQty = 0;
        let outQty = 0;
        const qty = parseInt(trx.quantity, 10) || 0;

        if (trx.transaction_type === 'IN' || trx.transaction_type === 'TRANSFER_IN') {
            inQty = qty;
            runningBalance += inQty;
            totalIn += inQty;
        } else if (trx.transaction_type === 'OUT' || trx.transaction_type === 'DISPOSAL' || trx.transaction_type === 'TRANSFER_OUT') {
            outQty = qty;
            runningBalance -= outQty;
            totalOut += outQty;
        } else if (trx.transaction_type === 'ADJUSTMENT') {
            const isSurplus = trx.notes && (trx.notes.includes('SURPLUS') || trx.notes.includes('+'));
            if (isSurplus) {
                inQty = qty;
                runningBalance += inQty;
                totalIn += inQty;
            } else {
                outQty = qty;
                runningBalance -= outQty;
                totalOut += outQty;
            }
        }

        return {
            transaction_id: trx.transaction_id,
            reference_no: trx.reference_no,
            date: trx.created_at,
            transaction_type: trx.transaction_type,
            facility_code: trx.facility_code,
            facility_name: trx.facility_name,
            operator: trx.operator,
            notes: trx.notes,
            in_qty: inQty,
            out_qty: outQty,
            in_quantity: inQty,
            out_quantity: outQty,
            running_balance: runningBalance,
            current_balance: runningBalance
        };
    });

    return {
        beginningBalance,
        currentBalance: runningBalance,
        totalIn,
        totalOut,
        entries
    };
}

module.exports = {
    calculateStockCardLedger
};
