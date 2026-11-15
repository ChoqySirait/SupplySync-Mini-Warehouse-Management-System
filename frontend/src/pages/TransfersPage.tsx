import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  Truck,
  Plus,
  ArrowRight,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  Printer,
  AlertTriangle,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { StockTransfer, Facility, Product, Location } from '../types';

export const TransfersPage: React.FC = () => {
  const { activeFacilityId, facilities, isAdmin, isManager } = useAuth();
  const { success, error, warning } = useToast();

  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);

  // Create Form State
  const [sourceFacilityId, setSourceFacilityId] = useState<number>(activeFacilityId);
  const [destFacilityId, setDestFacilityId] = useState<number>(1);
  const [transferNotes, setTransferNotes] = useState('');
  const [transferItems, setTransferItems] = useState<
    Array<{ product_id: string; quantity: number }>
  >([{ product_id: '', quantity: 1 }]);

  // Receive Form State
  const [receiveInputs, setReceiveInputs] = useState<
    Record<number, { qty: number; location_id?: number }>
  >({});

  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [trfRes, prodRes, locRes] = await Promise.all([
        api.getTransfers(isAdmin || isManager ? undefined : activeFacilityId),
        api.getProducts({ facility_id: sourceFacilityId }),
        api.getLocations(activeFacilityId),
      ]);
      if (trfRes.data) setTransfers(trfRes.data);
      if (prodRes.data) setProducts(prodRes.data);
      if (locRes.data) setLocations(locRes.data);
    } catch (err: any) {
      error('Gagal Memuat Transfer', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId, sourceFacilityId]);

  const openCreateModal = () => {
    setSourceFacilityId(activeFacilityId);
    const otherFac = facilities.find((f) => f.facility_id !== activeFacilityId);
    setDestFacilityId(otherFac ? otherFac.facility_id : 2);
    setTransferNotes('');
    setTransferItems([
      { product_id: products[0]?.product_id || '', quantity: 1 },
    ]);
    setShowCreateModal(true);
  };

  const addItemRow = () => {
    setTransferItems([
      ...transferItems,
      { product_id: products[0]?.product_id || '', quantity: 1 },
    ]);
  };

  const removeItemRow = (idx: number) => {
    if (transferItems.length === 1) return;
    setTransferItems(transferItems.filter((_, i) => i !== idx));
  };

  const updateItemRow = (idx: number, field: string, val: any) => {
    const updated = [...transferItems];
    updated[idx] = { ...updated[idx], [field]: val };
    setTransferItems(updated);
  };

  const handleCreateTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sourceFacilityId === destFacilityId) {
      error('Validasi Gagal', 'Gudang asal dan gudang tujuan harus berbeda.');
      return;
    }

    for (const itm of transferItems) {
      if (!itm.product_id || itm.quantity <= 0) {
        error('Validasi Gagal', 'Harap isi SKU dan kuantitas valid pada setiap baris item.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await api.createTransfer({
        source_facility_id: sourceFacilityId,
        dest_facility_id: destFacilityId,
        notes: transferNotes,
        items: transferItems,
      });
      success('Transfer Dikirim', 'Surat transfer dibuat dan stok telah dialokasikan ke in-transit.');
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Membuat Transfer', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openReceiveModal = async (t: StockTransfer) => {
    setSelectedTransfer(t);
    try {
      const res = await api.getTransferById(t.transfer_id);
      if (res.data) {
        setSelectedTransfer(res.data);
        const initialInputs: Record<number, { qty: number; location_id?: number }> = {};
        res.data.items?.forEach((itm) => {
          initialInputs[itm.item_id] = {
            qty: itm.quantity_sent,
          };
        });
        setReceiveInputs(initialInputs);
      }
    } catch (err: any) {
      error('Gagal Memuat Detail Transfer', err.message);
    }
    setShowReceiveModal(true);
  };

  const handleReceiveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransfer) return;

    const payloadItems = Object.entries(receiveInputs).map(([itemId, val]) => ({
      item_id: parseInt(itemId, 10),
      quantity_received: val.qty,
      location_id: val.location_id,
    }));

    setIsSubmitting(true);
    try {
      await api.receiveTransfer(selectedTransfer.transfer_id, {
        received_items: payloadItems,
      });
      success('Penerimaan Sukses', 'Barang transfer telah diterima dan dicatat ke gudang tujuan.');
      setShowReceiveModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Menerima Transfer', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelTransfer = async (transferId: number) => {
    if (!confirm('Batalkan pengiriman transfer ini dan kembalikan stok ke gudang asal?')) return;
    try {
      await api.cancelTransfer(transferId, 'Dibatalkan oleh operator');
      success('Transfer Dibatalkan', 'Stok berhasil dikembalikan secara transaksional ke gudang asal.');
      loadData();
    } catch (err: any) {
      error('Gagal Membatalkan Transfer', err.message);
    }
  };

  const openDetailModal = async (t: StockTransfer) => {
    try {
      const res = await api.getTransferById(t.transfer_id);
      if (res.data) {
        setSelectedTransfer(res.data);
        setShowDetailModal(true);
      }
    } catch (err: any) {
      error('Gagal Memuat Detail', err.message);
    }
  };

  const columns: Column<StockTransfer>[] = [
    {
      header: 'No. Transfer',
      accessor: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">{row.transfer_number}</span>
      ),
    },
    {
      header: 'Rute Fasilitas',
      accessor: (row) => (
        <div className="flex items-center gap-2 text-xs">
          <span className="font-semibold text-slate-800">{row.source_facility_name}</span>
          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          <span className="font-semibold text-indigo-600">{row.dest_facility_name}</span>
        </div>
      ),
    },
    {
      header: 'Status Pengiriman',
      accessor: (row) => {
        const variants: Record<string, any> = {
          PENDING: 'warning',
          IN_TRANSIT: 'primary',
          COMPLETED: 'success',
          CANCELLED: 'danger',
        };
        return <Badge variant={variants[row.status] || 'default'}>{row.status}</Badge>;
      },
    },
    {
      header: 'Tanggal Dibuat',
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {new Date(row.created_at).toLocaleDateString('id-ID')}
        </span>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openDetailModal(row)}
            icon={<Eye className="w-3.5 h-3.5" />}
          >
            Rincian
          </Button>

          {row.status === 'IN_TRANSIT' &&
            (row.dest_facility_id === activeFacilityId || isAdmin || isManager) && (
              <Button
                variant="success"
                size="sm"
                onClick={() => openReceiveModal(row)}
                icon={<CheckCircle className="w-3.5 h-3.5" />}
              >
                Terima
              </Button>
            )}

          {row.status === 'IN_TRANSIT' && (isAdmin || isManager) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCancelTransfer(row.transfer_id)}
              icon={<XCircle className="w-3.5 h-3.5 text-rose-500" />}
            >
              Batal
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Transfer Antar-Gudang (Inter-Warehouse)</h2>
          <p className="text-xs text-slate-500">
            Pengiriman stok aman antar fasilitas dengan perlindungan pelacakan In-Transit
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={openCreateModal}
          icon={<Plus className="w-4 h-4" />}
        >
          Kirim Transfer Baru
        </Button>
      </div>

      {/* Transfer Table */}
      <Card
        title="Daftar Surat Transfer Barang"
        subtitle="Riwayat transfer barang antar cabang fasilitas pergudangan"
        padding={false}
      >
        <Table
          columns={columns}
          data={transfers}
          isLoading={isLoading}
          emptyMessage="Belum ada transaksi transfer antar-gudang."
        />
      </Card>

      {/* Create Transfer Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Formulir Pengiriman Transfer Antar-Gudang"
        subtitle="Stok akan dikurangi dari gudang asal menggunakan alokasi FEFO"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateTransfer} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Fasilitas Asal</label>
              <select
                value={sourceFacilityId}
                onChange={(e) => setSourceFacilityId(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                disabled={!isAdmin && !isManager}
              >
                {facilities.map((f) => (
                  <option key={f.facility_id} value={f.facility_id}>
                    {f.facility_name} ({f.facility_code})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Fasilitas Tujuan</label>
              <select
                value={destFacilityId}
                onChange={(e) => setDestFacilityId(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                required
              >
                {facilities
                  .filter((f) => f.facility_id !== sourceFacilityId)
                  .map((f) => (
                    <option key={f.facility_id} value={f.facility_id}>
                      {f.facility_name} ({f.facility_code})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700">Daftar Item Transfer</label>
              <Button type="button" variant="secondary" size="sm" onClick={addItemRow}>
                + Tambah Item
              </Button>
            </div>

            {transferItems.map((itm, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1">
                  <select
                    value={itm.product_id}
                    onChange={(e) => updateItemRow(idx, 'product_id', e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    required
                  >
                    <option value="">Pilih SKU Produk</option>
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_id} - {p.product_name} (Stok: {p.facility_stock || p.total_stock})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-28">
                  <Input
                    type="number"
                    min={1}
                    value={itm.quantity}
                    onChange={(e) =>
                      updateItemRow(idx, 'quantity', parseInt(e.target.value, 10) || 1)
                    }
                    placeholder="Qty"
                    required
                  />
                </div>
                {transferItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItemRow(idx)}
                    className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <Input
            label="Catatan Pengiriman / Ekspedisi"
            placeholder="No. Polisi Truk / Nama Kurir Driver..."
            value={transferNotes}
            onChange={(e) => setTransferNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Proses Kirim Transfer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Receive Transfer Modal */}
      <Modal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        title="Konfirmasi Penerimaan Transfer Masuk"
        subtitle={`Surat Transfer: ${selectedTransfer?.transfer_number}`}
        maxWidth="2xl"
      >
        <form onSubmit={handleReceiveTransfer} className="space-y-4">
          <p className="text-xs text-slate-600">
            Verifikasi kuantitas fisik barang yang diterima di gudang tujuan. Jika terdapat barang
            kurang atau rusak, masukkan jumlah fisik yang sebenarnya diterima.
          </p>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-3">SKU & Produk</th>
                  <th className="p-3 text-right">Qty Dikirim</th>
                  <th className="p-3">Qty Diterima</th>
                  <th className="p-3">Rak Tujuan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedTransfer?.items?.map((item) => (
                  <tr key={item.item_id}>
                    <td className="p-3">
                      <span className="font-mono font-bold text-slate-900">{item.product_id}</span>
                      <span className="block text-slate-500">{item.product_name}</span>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-700">
                      {item.quantity_sent}
                    </td>
                    <td className="p-3 w-32">
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity_sent}
                        value={receiveInputs[item.item_id]?.qty ?? item.quantity_sent}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setReceiveInputs((prev) => ({
                            ...prev,
                            [item.item_id]: { ...prev[item.item_id], qty: val },
                          }));
                        }}
                      />
                    </td>
                    <td className="p-3 w-40">
                      <select
                        value={receiveInputs[item.item_id]?.location_id || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          setReceiveInputs((prev) => ({
                            ...prev,
                            [item.item_id]: { ...prev[item.item_id], location_id: val },
                          }));
                        }}
                        className="w-full rounded-lg border border-slate-300 py-1.5 px-2 text-xs"
                      >
                        <option value="">Gudang Terbuka</option>
                        {locations.map((loc) => (
                          <option key={loc.location_id} value={loc.location_id}>
                            {loc.barcode}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowReceiveModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="success" isLoading={isSubmitting}>
              Konfirmasi Barang Diterima
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail / Delivery Note Modal */}
      <Modal
        isOpen={showDetailModal}
        onClose={() => setShowDetailModal(false)}
        title="Surat Jalan Transfer Antar-Gudang (Delivery Note)"
        subtitle={`No: ${selectedTransfer?.transfer_number}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400">Dari Fasilitas Asal:</span>
              <p className="font-bold text-slate-900">{selectedTransfer?.source_facility_name}</p>
              <span className="text-slate-400 mt-2 block">Dibuat Oleh:</span>
              <p className="font-semibold text-slate-700">{selectedTransfer?.sender_name || 'Admin'}</p>
            </div>
            <div>
              <span className="text-slate-400">Ke Fasilitas Tujuan:</span>
              <p className="font-bold text-indigo-600">{selectedTransfer?.dest_facility_name}</p>
              <span className="text-slate-400 mt-2 block">Status:</span>
              <Badge>{selectedTransfer?.status}</Badge>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3">Batch Asal</th>
                  <th className="p-3 text-right">Dikirim</th>
                  <th className="p-3 text-right">Diterima</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedTransfer?.items?.map((item) => (
                  <tr key={item.item_id}>
                    <td className="p-3 font-mono font-bold text-slate-900">{item.product_id}</td>
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3 font-mono text-slate-500">{item.batch_code || '-'}</td>
                    <td className="p-3 text-right font-bold text-slate-900">
                      {item.quantity_sent}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-600">
                      {item.quantity_received}
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
              Cetak Surat Jalan
            </Button>
            <Button variant="primary" onClick={() => setShowDetailModal(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TransfersPage;
