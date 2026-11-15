import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Trash2,
  FileSpreadsheet,
  Printer,
  Search,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { Product, StockTransaction, Location, StockCardEntry, InventoryBatch } from '../types';

export const StockMovementsPage: React.FC = () => {
  const { activeFacilityId, isAdmin, isManager } = useAuth();
  const { success, error, warning } = useToast();

  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showInModal, setShowInModal] = useState(false);
  const [showOutModal, setShowOutModal] = useState(false);
  const [showDisposalModal, setShowDisposalModal] = useState(false);
  const [showCardModal, setShowCardModal] = useState(false);
  const [showPickingSlip, setShowPickingSlip] = useState(false);

  // Form States
  const [selectedProductId, setSelectedProductId] = useState('');
  const [inQuantity, setInQuantity] = useState(1);
  const [inLocationId, setInLocationId] = useState<number | undefined>();
  const [inExpiryDate, setInExpiryDate] = useState('');
  const [inBatchCode, setInBatchCode] = useState('');
  const [inNotes, setInNotes] = useState('');

  // Outbound Form
  const [outQuantity, setOutQuantity] = useState(1);
  const [outNotes, setOutNotes] = useState('');
  const [pickingSlipData, setPickingSlipData] = useState<{
    reference_no: string;
    product_name: string;
    product_id: string;
    total_qty: number;
    allocations: any[];
  } | null>(null);

  // Disposal Form
  const [disposalBatches, setDisposalBatches] = useState<InventoryBatch[]>([]);
  const [disposalBatchId, setDisposalBatchId] = useState<number | undefined>();
  const [disposalQty, setDisposalQty] = useState(1);
  const [disposalReason, setDisposalReason] = useState('');

  // Stock Card Data
  const [stockCardData, setStockCardData] = useState<{
    product: Product;
    beginning_balance: number;
    entries: StockCardEntry[];
    current_balance: number;
  } | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [trxRes, prodRes, locRes] = await Promise.all([
        api.getStockHistory({ facility_id: activeFacilityId, limit: 50 }),
        api.getProducts({ facility_id: activeFacilityId }),
        api.getLocations(activeFacilityId),
      ]);
      if (trxRes.data) setTransactions(trxRes.data);
      if (prodRes.data) setProducts(prodRes.data);
      if (locRes.data) setLocations(locRes.data);
    } catch (err: any) {
      error('Gagal Memuat Mutasi Stok', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId]);

  // Handle Stock In
  const handleStockIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || inQuantity <= 0 || !inExpiryDate) {
      error('Validasi Gagal', 'Harap isi SKU, kuantitas positif, dan tanggal kedaluwarsa.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.stockIn({
        product_id: selectedProductId,
        facility_id: activeFacilityId,
        location_id: inLocationId,
        quantity: inQuantity,
        expired_date: inExpiryDate,
        batch_code: inBatchCode || undefined,
        notes: inNotes || 'Penerimaan barang langsung',
      });
      success('Penerimaan Sukses', `Stok barang berhasil ditambahkan dan batch dicatat.`);
      setShowInModal(false);
      resetInForm();
      loadData();
    } catch (err: any) {
      error('Gagal Stock In', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Stock Out FEFO
  const handleStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || outQuantity <= 0) {
      error('Validasi Gagal', 'Harap isi SKU dan kuantitas positif.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.stockOutFefo({
        product_id: selectedProductId,
        facility_id: activeFacilityId,
        quantity: outQuantity,
        notes: outNotes || 'Pengeluaran barang FEFO',
      });

      const prod = products.find((p) => p.product_id === selectedProductId);
      setPickingSlipData({
        reference_no: res.data?.reference_no || 'OUT-REF',
        product_name: prod?.product_name || selectedProductId,
        product_id: selectedProductId,
        total_qty: outQuantity,
        allocations: res.data?.allocations || [],
      });

      success('Pengeluaran Berhasil', `FEFO otomatis mengalokasikan batch terdekat kadaluwarsa.`);
      setShowOutModal(false);
      setShowPickingSlip(true);
      resetOutForm();
      loadData();
    } catch (err: any) {
      error('Gagal Stock Out FEFO', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Load batches for disposal
  const handleProductSelectForDisposal = async (pId: string) => {
    setSelectedProductId(pId);
    try {
      const res = await api.getProductById(pId);
      if (res.data?.batches) {
        setDisposalBatches(res.data.batches.filter((b) => b.facility_id === activeFacilityId && b.quantity > 0));
        if (res.data.batches.length > 0) {
          setDisposalBatchId(res.data.batches[0].batch_id);
        }
      }
    } catch (err: any) {
      error('Gagal Memuat Batch', err.message);
    }
  };

  // Handle Disposal
  const handleDisposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !disposalBatchId || disposalQty <= 0 || !disposalReason) {
      error('Validasi Gagal', 'Harap isi seluruh formulir pemusnahan barang.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.stockDisposal({
        product_id: selectedProductId,
        batch_id: disposalBatchId,
        quantity: disposalQty,
        reason: disposalReason,
      });
      success('Pemusnahan Dicatat', 'Stok batch telah dikurangi dan berita acara disimpan.');
      setShowDisposalModal(false);
      setDisposalReason('');
      loadData();
    } catch (err: any) {
      error('Gagal Disposal', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Stock Card
  const openStockCard = async (productId: string) => {
    try {
      const res = await api.getStockCard(productId, activeFacilityId);
      if (res.data) {
        setStockCardData(res.data);
        setShowCardModal(true);
      }
    } catch (err: any) {
      error('Gagal Memuat Kartu Stok', err.message);
    }
  };

  const resetInForm = () => {
    setSelectedProductId('');
    setInQuantity(1);
    setInExpiryDate('');
    setInBatchCode('');
    setInNotes('');
  };

  const resetOutForm = () => {
    setSelectedProductId('');
    setOutQuantity(1);
    setOutNotes('');
  };

  const columns: Column<StockTransaction>[] = [
    {
      header: 'No. Referensi',
      accessor: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">{row.reference_no}</span>
      ),
    },
    {
      header: 'SKU & Produk',
      accessor: (row) => (
        <div>
          <button
            onClick={() => openStockCard(row.product_id)}
            className="font-mono text-xs font-bold text-indigo-600 hover:underline"
          >
            {row.product_id}
          </button>
          <span className="block text-xs text-slate-500">{row.product_name || '-'}</span>
        </div>
      ),
    },
    {
      header: 'Tipe Mutasi',
      accessor: (row) => {
        const variants: Record<string, any> = {
          IN: 'success',
          OUT: 'primary',
          ADJUSTMENT: 'purple',
          TRANSFER_IN: 'info',
          TRANSFER_OUT: 'warning',
          DISPOSAL: 'danger',
        };
        return <Badge variant={variants[row.transaction_type] || 'default'}>{row.transaction_type}</Badge>;
      },
    },
    {
      header: 'Jumlah',
      accessor: (row) => (
        <span className="font-bold text-slate-900">{row.quantity.toLocaleString('id-ID')}</span>
      ),
    },
    {
      header: 'Catatan / Alasan',
      accessor: (row) => <span className="text-xs text-slate-500 italic">{row.notes || '-'}</span>,
    },
    {
      header: 'Operator & Waktu',
      accessor: (row) => (
        <div className="text-xs">
          <span className="font-semibold text-slate-800">{row.username || 'System'}</span>
          <span className="block text-[11px] text-slate-400">
            {new Date(row.created_at).toLocaleString('id-ID')}
          </span>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header & Mutation Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Mutasi Stok & Alokasi FEFO</h2>
          <p className="text-xs text-slate-500">
            Pencatatan pergerakan barang, pengeluaran FEFO otomatis, dan pemusnahan
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="success"
            size="md"
            onClick={() => {
              resetInForm();
              if (products.length > 0) setSelectedProductId(products[0].product_id);
              setShowInModal(true);
            }}
            icon={<ArrowDownLeft className="w-4 h-4" />}
          >
            Penerimaan (Inbound)
          </Button>

          <Button
            variant="primary"
            size="md"
            onClick={() => {
              resetOutForm();
              if (products.length > 0) setSelectedProductId(products[0].product_id);
              setShowOutModal(true);
            }}
            icon={<ArrowUpRight className="w-4 h-4" />}
          >
            Pengeluaran FEFO (Outbound)
          </Button>

          {(isAdmin || isManager) && (
            <Button
              variant="danger"
              size="md"
              onClick={() => {
                if (products.length > 0) handleProductSelectForDisposal(products[0].product_id);
                setShowDisposalModal(true);
              }}
              icon={<Trash2 className="w-4 h-4" />}
            >
              Pemusnahan (Disposal)
            </Button>
          )}
        </div>
      </div>

      {/* Transaction Table */}
      <Card
        title="Riwayat Mutasi Transaksi Terakhir"
        subtitle="Log transaksi operasional gudang real-time"
        padding={false}
      >
        <Table
          columns={columns}
          data={transactions}
          isLoading={isLoading}
          emptyMessage="Belum ada transaksi mutasi yang tercatat."
        />
      </Card>

      {/* Stock In Modal */}
      <Modal
        isOpen={showInModal}
        onClose={() => setShowInModal(false)}
        title="Penerimaan Barang Baru (Stock In)"
        subtitle="Barang akan dicatat ke batch baru dengan tanggal kedaluwarsa spesifik"
        maxWidth="lg"
      >
        <form onSubmit={handleStockIn} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Pilih Produk SKU</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              required
            >
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_id} - {p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Jumlah Kuantitas"
              type="number"
              min={1}
              value={inQuantity}
              onChange={(e) => setInQuantity(parseInt(e.target.value, 10) || 1)}
              required
            />
            <Input
              label="Tanggal Kedaluwarsa (Expired)"
              type="date"
              value={inExpiryDate}
              onChange={(e) => setInExpiryDate(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Lokasi Rak Simpan</label>
              <select
                value={inLocationId || ''}
                onChange={(e) =>
                  setInLocationId(e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Gudang Terbuka / Tanpa Rak</option>
                {locations.map((loc) => (
                  <option key={loc.location_id} value={loc.location_id}>
                    {loc.barcode} (Zona {loc.zone} - Rak {loc.rack})
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="Kode Batch Kustom (Opsional)"
              placeholder="Otomatis jika dikosongkan"
              value={inBatchCode}
              onChange={(e) => setInBatchCode(e.target.value)}
            />
          </div>

          <Input
            label="Catatan Penerimaan"
            placeholder="Penerimaan reguler dari supplier..."
            value={inNotes}
            onChange={(e) => setInNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowInModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="success" isLoading={isSubmitting}>
              Konfirmasi Penerimaan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Out FEFO Modal */}
      <Modal
        isOpen={showOutModal}
        onClose={() => setShowOutModal(false)}
        title="Pengeluaran Barang FEFO (Stock Out)"
        subtitle="Sistem otomatis memotong stok dari batch dengan expired terdekat"
        maxWidth="lg"
      >
        <form onSubmit={handleStockOut} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Pilih Produk SKU</label>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              required
            >
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_id} - {p.product_name} (Sisa:{' '}
                  {p.facility_stock !== undefined ? p.facility_stock : p.total_stock} {p.unit})
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Jumlah Kuantitas Keluar"
            type="number"
            min={1}
            value={outQuantity}
            onChange={(e) => setOutQuantity(parseInt(e.target.value, 10) || 1)}
            required
          />

          <Input
            label="Catatan / Nomor Referensi Pengeluaran"
            placeholder="Kebutuhan produksi / Surat Jalan..."
            value={outNotes}
            onChange={(e) => setOutNotes(e.target.value)}
          />

          <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-indigo-900 leading-relaxed">
            💡 Sistem menjamin alokasi stok dipotong secara transaksional dengan perlindungan baris
            (Row-Level Lock) untuk mencegah stok ganda atau saldo minus saat permintaan konkuren.
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowOutModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Proses Pengeluaran FEFO
            </Button>
          </div>
        </form>
      </Modal>

      {/* Picking Slip Modal */}
      <Modal
        isOpen={showPickingSlip}
        onClose={() => setShowPickingSlip(false)}
        title="Lembar Pengambilan Barang (Picking Slip)"
        subtitle={`No. Referensi: ${pickingSlipData?.reference_no || '-'}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-slate-400">Nama Produk:</span>
                <p className="font-bold text-slate-900">{pickingSlipData?.product_name}</p>
                <p className="font-mono text-slate-500">{pickingSlipData?.product_id}</p>
              </div>
              <div className="text-right">
                <span className="text-slate-400">Total Kuantitas:</span>
                <p className="text-base font-bold text-indigo-600">
                  {pickingSlipData?.total_qty.toLocaleString('id-ID')} Unit
                </p>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">Batch Code</th>
                  <th className="p-3">Expired Date</th>
                  <th className="p-3 text-right">Qty Ambil</th>
                  <th className="p-3 text-right">Sisa Batch</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pickingSlipData?.allocations?.map((a, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-900">{a.batch_code}</td>
                    <td className="p-3 font-mono text-slate-600">
                      {a.expired_date ? a.expired_date.split('T')[0] : '-'}
                    </td>
                    <td className="p-3 text-right font-bold text-indigo-600">
                      {a.deducted.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right text-slate-500">
                      {a.remaining.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button
              variant="secondary"
              onClick={() => window.print()}
              icon={<Printer className="w-4 h-4" />}
            >
              Cetak Picking Slip
            </Button>
            <Button variant="primary" onClick={() => setShowPickingSlip(false)}>
              Selesai
            </Button>
          </div>
        </div>
      </Modal>

      {/* Stock Disposal Modal */}
      <Modal
        isOpen={showDisposalModal}
        onClose={() => setShowDisposalModal(false)}
        title="Pemusnahan Stok Rusak / Kedaluwarsa (Disposal)"
        subtitle="Pemusnahan akan mengurangi kuantitas batch dan mencatat Berita Acara Pemusnahan"
        maxWidth="lg"
      >
        <form onSubmit={handleDisposal} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Pilih Produk</label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductSelectForDisposal(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              required
            >
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_id} - {p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Pilih Batch Rusak / Expired</label>
            <select
              value={disposalBatchId || ''}
              onChange={(e) => setDisposalBatchId(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              required
            >
              {disposalBatches.length === 0 ? (
                <option value="">Tidak ada batch aktif untuk produk ini</option>
              ) : (
                disposalBatches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    {b.batch_code} (Stok: {b.quantity} | Exp: {b.expired_date?.split('T')[0]})
                  </option>
                ))
              )}
            </select>
          </div>

          <Input
            label="Kuantitas Pemusnahan"
            type="number"
            min={1}
            value={disposalQty}
            onChange={(e) => setDisposalQty(parseInt(e.target.value, 10) || 1)}
            required
          />

          <Input
            label="Alasan Pemusnahan (Berita Acara)"
            placeholder="Kemasan rusak terkena air / Telah melewati batas expired date..."
            value={disposalReason}
            onChange={(e) => setDisposalReason(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowDisposalModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="danger" isLoading={isSubmitting}>
              Eksekusi Pemusnahan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Card Modal */}
      <Modal
        isOpen={showCardModal}
        onClose={() => setShowCardModal(false)}
        title={`Buku Kartu Stok: ${stockCardData?.product.product_name || ''}`}
        subtitle={`SKU: ${stockCardData?.product.product_id} • Saldo Berjalan (Running Balance)`}
        maxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="flex justify-between items-center p-3 bg-slate-50 rounded-xl text-xs">
            <div>
              <span className="text-slate-500">Saldo Awal:</span>{' '}
              <span className="font-bold text-slate-900">
                {stockCardData?.beginning_balance.toLocaleString('id-ID')} Unit
              </span>
            </div>
            <div>
              <span className="text-slate-500">Saldo Akhir Saat Ini:</span>{' '}
              <span className="font-bold text-indigo-600 text-sm">
                {stockCardData?.current_balance.toLocaleString('id-ID')} Unit
              </span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden max-h-96 overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100 font-bold text-slate-700 sticky top-0">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">Referensi</th>
                  <th className="p-3">Tipe</th>
                  <th className="p-3 text-right">Masuk</th>
                  <th className="p-3 text-right">Keluar</th>
                  <th className="p-3 text-right font-bold text-slate-900">Saldo</th>
                  <th className="p-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockCardData?.entries && stockCardData.entries.length > 0 ? (
                  stockCardData.entries.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="p-3 text-slate-500">{entry.date?.split('T')[0]}</td>
                      <td className="p-3 font-mono font-bold text-slate-800">
                        {entry.reference_no}
                      </td>
                      <td className="p-3">
                        <Badge size="sm">{entry.transaction_type}</Badge>
                      </td>
                      <td className="p-3 text-right text-emerald-600 font-semibold">
                        {entry.in_qty > 0 ? `+${entry.in_qty}` : '-'}
                      </td>
                      <td className="p-3 text-right text-rose-600 font-semibold">
                        {entry.out_qty > 0 ? `-${entry.out_qty}` : '-'}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        {entry.running_balance.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3 text-slate-500 italic truncate max-w-xs">
                        {entry.notes || '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="p-6 text-center text-slate-400 italic">
                      Belum ada entri mutasi pada kartu stok ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowCardModal(false)}>
              Tutup Kartu Stok
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default StockMovementsPage;
