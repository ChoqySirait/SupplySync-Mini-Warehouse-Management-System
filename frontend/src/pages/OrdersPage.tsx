import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  ShoppingCart,
  Plus,
  CheckCircle,
  Truck,
  Eye,
  Printer,
  FileCheck,
  Building,
  User as UserIcon,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { PurchaseOrder, SalesOrder, Supplier, Product, Location } from '../types';

export const OrdersPage: React.FC = () => {
  const { activeFacilityId, isAdmin, isManager } = useAuth();
  const { success, error } = useToast();

  const [activeTab, setActiveTab] = useState<'PO' | 'SO'>('PO');
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showCreatePoModal, setShowCreatePoModal] = useState(false);
  const [showReceivePoModal, setShowReceivePoModal] = useState(false);
  const [showPoDetailModal, setShowPoDetailModal] = useState(false);
  const [selectedPo, setSelectedPo] = useState<PurchaseOrder | null>(null);

  const [showCreateSoModal, setShowCreateSoModal] = useState(false);
  const [showSoDetailModal, setShowSoDetailModal] = useState(false);
  const [selectedSo, setSelectedSo] = useState<SalesOrder | null>(null);

  // PO Form State
  const [poSupplierId, setPoSupplierId] = useState<number | undefined>();
  const [poDeliveryDate, setPoDeliveryDate] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poItems, setPoItems] = useState<
    Array<{ product_id: string; quantity: number; unit_price: number }>
  >([{ product_id: '', quantity: 1, unit_price: 0 }]);

  // Receive PO Form State
  const [receivePoInputs, setReceivePoInputs] = useState<
    Record<
      number,
      {
        qty: number;
        expired_date: string;
        batch_code?: string;
        location_id?: number;
      }
    >
  >({});

  // SO Form State
  const [soCustomerName, setSoCustomerName] = useState('');
  const [soNotes, setSoNotes] = useState('');
  const [soItems, setSoItems] = useState<
    Array<{ product_id: string; quantity: number; unit_price: number }>
  >([{ product_id: '', quantity: 1, unit_price: 0 }]);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [posRes, sosRes, supRes, prodRes, locRes] = await Promise.all([
        api.getPurchaseOrders(isAdmin || isManager ? undefined : activeFacilityId),
        api.getSalesOrders(isAdmin || isManager ? undefined : activeFacilityId),
        api.getSuppliers(),
        api.getProducts({ facility_id: activeFacilityId }),
        api.getLocations(activeFacilityId),
      ]);
      if (posRes.data) setPurchaseOrders(posRes.data);
      if (sosRes.data) setSalesOrders(sosRes.data);
      if (supRes.data) setSuppliers(supRes.data);
      if (prodRes.data) setProducts(prodRes.data);
      if (locRes.data) setLocations(locRes.data);
    } catch (err: any) {
      error('Gagal Memuat Pesanan', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId]);

  // Handle PO Creation
  const openCreatePo = () => {
    setPoSupplierId(suppliers[0]?.supplier_id);
    setPoDeliveryDate('');
    setPoNotes('');
    setPoItems([{ product_id: products[0]?.product_id || '', quantity: 1, unit_price: 0 }]);
    setShowCreatePoModal(true);
  };

  const handleCreatePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poSupplierId) {
      error('Validasi Gagal', 'Pilih pemasok.');
      return;
    }
    for (const itm of poItems) {
      if (!itm.product_id || itm.quantity <= 0) {
        error('Validasi Gagal', 'Harap isi SKU dan kuantitas valid pada setiap item.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await api.createPurchaseOrder({
        supplier_id: poSupplierId,
        facility_id: activeFacilityId,
        expected_delivery: poDeliveryDate || undefined,
        notes: poNotes,
        items: poItems,
      });
      success('PO Dibuat', 'Draft Purchase Order berhasil dibuat.');
      setShowCreatePoModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Buat PO', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApprovePo = async (poId: number) => {
    try {
      await api.approvePurchaseOrder(poId);
      success('PO Disetujui', 'Purchase Order telah disetujui untuk penerimaan barang.');
      loadData();
    } catch (err: any) {
      error('Gagal Menyetujui PO', err.message);
    }
  };

  const openReceivePo = (po: PurchaseOrder) => {
    setSelectedPo(po);
    const initialInputs: Record<number, any> = {};
    const defaultExp = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    po.items?.forEach((itm) => {
      const remaining = itm.quantity - (itm.quantity_received || 0);
      initialInputs[itm.po_item_id] = {
        qty: remaining > 0 ? remaining : 0,
        expired_date: defaultExp,
        batch_code: `BTC-PO-${itm.product_id}-${Date.now().toString().slice(-4)}`,
      };
    });
    setReceivePoInputs(initialInputs);
    setShowReceivePoModal(true);
  };

  const handleReceivePo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPo) return;

    const payloadItems = Object.entries(receivePoInputs).map(([poItemId, val]) => ({
      po_item_id: parseInt(poItemId, 10),
      quantity_received: val.qty,
      expired_date: val.expired_date,
      batch_code: val.batch_code,
      location_id: val.location_id,
    }));

    setIsSubmitting(true);
    try {
      await api.receivePurchaseOrder(selectedPo.po_id, { items: payloadItems });
      success('Penerimaan Sukses', 'Barang PO telah masuk dan batch inventaris terbentuk.');
      setShowReceivePoModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Menerima PO', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle SO Creation
  const openCreateSo = () => {
    setSoCustomerName('');
    setSoNotes('');
    setSoItems([{ product_id: products[0]?.product_id || '', quantity: 1, unit_price: 0 }]);
    setShowCreateSoModal(true);
  };

  const handleCreateSo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!soCustomerName) {
      error('Validasi Gagal', 'Masukkan nama pelanggan.');
      return;
    }
    for (const itm of soItems) {
      if (!itm.product_id || itm.quantity <= 0) {
        error('Validasi Gagal', 'Harap isi SKU dan kuantitas valid pada setiap item.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      await api.createSalesOrder({
        customer_name: soCustomerName,
        facility_id: activeFacilityId,
        notes: soNotes,
        items: soItems,
      });
      success('SO Dibuat', 'Sales Order berhasil dicatat dalam status DRAFT.');
      setShowCreateSoModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Buat SO', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmSo = async (soId: number) => {
    try {
      await api.confirmSalesOrder(soId);
      success('SO Dikonfirmasi', 'Sales Order telah dikonfirmasi dan siap dialokasikan.');
      loadData();
    } catch (err: any) {
      error('Gagal Konfirmasi SO', err.message);
    }
  };

  const handleShipSo = async (soId: number) => {
    try {
      await api.shipSalesOrder(soId);
      success('SO Dikirim', 'Barang telah dipotong dari stok via alokasi FEFO.');
      loadData();
    } catch (err: any) {
      error('Gagal Pengiriman SO', err.message);
    }
  };

  const poColumns: Column<PurchaseOrder>[] = [
    {
      header: 'No. PO',
      accessor: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">{row.po_number}</span>
      ),
    },
    {
      header: 'Pemasok (Supplier)',
      accessor: (row) => (
        <div>
          <span className="font-semibold text-slate-900 text-xs">{row.supplier_name}</span>
          <span className="block text-[11px] text-slate-400">{row.facility_name}</span>
        </div>
      ),
    },
    {
      header: 'Total Nilai (Rp)',
      accessor: (row) => (
        <span className="font-bold text-slate-900">
          Rp {(row.total_amount || 0).toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => {
        const variants: Record<string, any> = {
          DRAFT: 'default',
          APPROVED: 'primary',
          PARTIAL: 'warning',
          RECEIVED: 'success',
          CANCELLED: 'danger',
        };
        return <Badge variant={variants[row.status] || 'default'}>{row.status}</Badge>;
      },
    },
    {
      header: 'Tgl Pemesanan',
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {new Date(row.order_date).toLocaleDateString('id-ID')}
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
            onClick={() => {
              setSelectedPo(row);
              setShowPoDetailModal(true);
            }}
            icon={<Eye className="w-3.5 h-3.5" />}
          >
            Rincian
          </Button>

          {row.status === 'DRAFT' && (isAdmin || isManager) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleApprovePo(row.po_id)}
              icon={<CheckCircle className="w-3.5 h-3.5 text-indigo-600" />}
            >
              Setujui
            </Button>
          )}

          {(row.status === 'APPROVED' || row.status === 'PARTIAL') && (
            <Button
              variant="success"
              size="sm"
              onClick={() => openReceivePo(row)}
              icon={<Truck className="w-3.5 h-3.5" />}
            >
              Terima GRN
            </Button>
          )}
        </div>
      ),
    },
  ];

  const soColumns: Column<SalesOrder>[] = [
    {
      header: 'No. SO',
      accessor: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">{row.so_number}</span>
      ),
    },
    {
      header: 'Pelanggan / Klien',
      accessor: (row) => (
        <div>
          <span className="font-semibold text-slate-900 text-xs">{row.customer_name}</span>
          <span className="block text-[11px] text-slate-400">{row.facility_name}</span>
        </div>
      ),
    },
    {
      header: 'Total Nilai (Rp)',
      accessor: (row) => (
        <span className="font-bold text-slate-900">
          Rp {(row.total_amount || 0).toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => {
        const variants: Record<string, any> = {
          DRAFT: 'default',
          CONFIRMED: 'primary',
          ALLOCATED: 'warning',
          SHIPPED: 'success',
          CANCELLED: 'danger',
        };
        return <Badge variant={variants[row.status] || 'default'}>{row.status}</Badge>;
      },
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setSelectedSo(row);
              setShowSoDetailModal(true);
            }}
            icon={<Eye className="w-3.5 h-3.5" />}
          >
            Rincian
          </Button>

          {row.status === 'DRAFT' && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleConfirmSo(row.so_id)}
              icon={<CheckCircle className="w-3.5 h-3.5 text-indigo-600" />}
            >
              Konfirmasi
            </Button>
          )}

          {(row.status === 'CONFIRMED' || row.status === 'ALLOCATED') && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleShipSo(row.so_id)}
              icon={<Truck className="w-3.5 h-3.5" />}
            >
              Kirim FEFO
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header with Tab Switch */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pesanan Pengadaan & Penjualan</h2>
          <p className="text-xs text-slate-500">
            Siklus pengadaan (Purchase Order) dan penjualan produk (Sales Order)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'PO' ? (
            <Button
              variant="primary"
              size="md"
              onClick={openCreatePo}
              icon={<Plus className="w-4 h-4" />}
            >
              Buat Purchase Order
            </Button>
          ) : (
            <Button
              variant="primary"
              size="md"
              onClick={openCreateSo}
              icon={<Plus className="w-4 h-4" />}
            >
              Buat Sales Order
            </Button>
          )}
        </div>
      </div>

      {/* Tab Switch Buttons */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('PO')}
          className={`flex items-center gap-2 border-b-2 py-3 px-5 text-xs font-bold transition-colors ${
            activeTab === 'PO'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building className="w-4 h-4" />
          Purchase Orders (Pengadaan Masuk) ({purchaseOrders.length})
        </button>
        <button
          onClick={() => setActiveTab('SO')}
          className={`flex items-center gap-2 border-b-2 py-3 px-5 text-xs font-bold transition-colors ${
            activeTab === 'SO'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          Sales Orders (Pesanan Keluar) ({salesOrders.length})
        </button>
      </div>

      {/* Orders Table */}
      {activeTab === 'PO' ? (
        <Card padding={false}>
          <Table
            columns={poColumns}
            data={purchaseOrders}
            isLoading={isLoading}
            emptyMessage="Belum ada Purchase Order yang dibuat."
          />
        </Card>
      ) : (
        <Card padding={false}>
          <Table
            columns={soColumns}
            data={salesOrders}
            isLoading={isLoading}
            emptyMessage="Belum ada Sales Order yang dibuat."
          />
        </Card>
      )}

      {/* Create PO Modal */}
      <Modal
        isOpen={showCreatePoModal}
        onClose={() => setShowCreatePoModal(false)}
        title="Buat Draft Purchase Order (PO)"
        subtitle="Formulir pengadaan barang kepada pemasok rekanan"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreatePo} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Pemasok</label>
              <select
                value={poSupplierId || ''}
                onChange={(e) => setPoSupplierId(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm"
                required
              >
                {suppliers.map((s) => (
                  <option key={s.supplier_id} value={s.supplier_id}>
                    {s.supplier_name} (Lead Time: {s.lead_time_days} Hari)
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Ekspektasi Tanggal Tiba"
              type="date"
              value={poDeliveryDate}
              onChange={(e) => setPoDeliveryDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-700">Item Produk Dipesan</label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setPoItems([
                    ...poItems,
                    { product_id: products[0]?.product_id || '', quantity: 1, unit_price: 0 },
                  ])
                }
              >
                + Tambah Baris
              </Button>
            </div>

            {poItems.map((itm, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1">
                  <select
                    value={itm.product_id}
                    onChange={(e) => {
                      const updated = [...poItems];
                      const prod = products.find((p) => p.product_id === e.target.value);
                      updated[idx].product_id = e.target.value;
                      if (prod) updated[idx].unit_price = prod.cost_price || 0;
                      setPoItems(updated);
                    }}
                    className="w-full rounded-lg border border-slate-300 py-1.5 px-2 text-xs"
                    required
                  >
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_id} - {p.product_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    value={itm.quantity}
                    onChange={(e) => {
                      const updated = [...poItems];
                      updated[idx].quantity = parseInt(e.target.value, 10) || 1;
                      setPoItems(updated);
                    }}
                    placeholder="Qty"
                  />
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    value={itm.unit_price}
                    onChange={(e) => {
                      const updated = [...poItems];
                      updated[idx].unit_price = parseFloat(e.target.value) || 0;
                      setPoItems(updated);
                    }}
                    placeholder="Harga Satuan"
                  />
                </div>
                {poItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setPoItems(poItems.filter((_, i) => i !== idx))}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <Input
            label="Catatan Pemesanan"
            placeholder="Instruksi pengiriman / pengemasan..."
            value={poNotes}
            onChange={(e) => setPoNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowCreatePoModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Draft PO
            </Button>
          </div>
        </form>
      </Modal>

      {/* Receive PO Modal */}
      <Modal
        isOpen={showReceivePoModal}
        onClose={() => setShowReceivePoModal(false)}
        title="Penerimaan Barang PO (Goods Receipt Note)"
        subtitle={`Nomor PO: ${selectedPo?.po_number}`}
        maxWidth="4xl"
      >
        <form onSubmit={handleReceivePo} className="space-y-4">
          <p className="text-xs text-slate-600">
            Setiap penerimaan barang PO akan membuat batch baru di sistem secara otomatis. Masukkan
            tanggal kedaluwarsa dan lokasi simpan rak untuk masing-masing item.
          </p>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-3">SKU & Nama</th>
                  <th className="p-3 text-right">Dipesan</th>
                  <th className="p-3">Qty Diterima</th>
                  <th className="p-3">Tgl Expired</th>
                  <th className="p-3">Rak Bin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedPo?.items?.map((item) => (
                  <tr key={item.po_item_id}>
                    <td className="p-3">
                      <span className="font-mono font-bold text-slate-900">{item.product_id}</span>
                      <span className="block text-slate-500">{item.product_name}</span>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-700">{item.quantity}</td>
                    <td className="p-3 w-28">
                      <Input
                        type="number"
                        min={0}
                        max={item.quantity}
                        value={receivePoInputs[item.po_item_id]?.qty ?? item.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10) || 0;
                          setReceivePoInputs((prev) => ({
                            ...prev,
                            [item.po_item_id]: { ...prev[item.po_item_id], qty: val },
                          }));
                        }}
                      />
                    </td>
                    <td className="p-3 w-36">
                      <Input
                        type="date"
                        value={receivePoInputs[item.po_item_id]?.expired_date || ''}
                        onChange={(e) => {
                          setReceivePoInputs((prev) => ({
                            ...prev,
                            [item.po_item_id]: {
                              ...prev[item.po_item_id],
                              expired_date: e.target.value,
                            },
                          }));
                        }}
                        required
                      />
                    </td>
                    <td className="p-3 w-40">
                      <select
                        value={receivePoInputs[item.po_item_id]?.location_id || ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value, 10) : undefined;
                          setReceivePoInputs((prev) => ({
                            ...prev,
                            [item.po_item_id]: { ...prev[item.po_item_id], location_id: val },
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
            <Button type="button" variant="secondary" onClick={() => setShowReceivePoModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="success" isLoading={isSubmitting}>
              Konfirmasi Penerimaan GRN
            </Button>
          </div>
        </form>
      </Modal>

      {/* Create SO Modal */}
      <Modal
        isOpen={showCreateSoModal}
        onClose={() => setShowCreateSoModal(false)}
        title="Buat Sales Order Baru"
        subtitle="Formulir pesanan penjualan kepada pelanggan"
        maxWidth="2xl"
      >
        <form onSubmit={handleCreateSo} className="space-y-4">
          <Input
            label="Nama Pelanggan / Entitas Klien"
            placeholder="PT Maju Makmur Bersama"
            value={soCustomerName}
            onChange={(e) => setSoCustomerName(e.target.value)}
            required
          />

          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-slate-700">Item Produk Dipesan</label>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  setSoItems([
                    ...soItems,
                    { product_id: products[0]?.product_id || '', quantity: 1, unit_price: 0 },
                  ])
                }
              >
                + Tambah Baris
              </Button>
            </div>

            {soItems.map((itm, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <div className="flex-1">
                  <select
                    value={itm.product_id}
                    onChange={(e) => {
                      const updated = [...soItems];
                      const prod = products.find((p) => p.product_id === e.target.value);
                      updated[idx].product_id = e.target.value;
                      if (prod) updated[idx].unit_price = prod.sale_price || 0;
                      setSoItems(updated);
                    }}
                    className="w-full rounded-lg border border-slate-300 py-1.5 px-2 text-xs"
                    required
                  >
                    {products.map((p) => (
                      <option key={p.product_id} value={p.product_id}>
                        {p.product_id} - {p.product_name} (Stok: {p.facility_stock || p.total_stock})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min={1}
                    value={itm.quantity}
                    onChange={(e) => {
                      const updated = [...soItems];
                      updated[idx].quantity = parseInt(e.target.value, 10) || 1;
                      setSoItems(updated);
                    }}
                    placeholder="Qty"
                  />
                </div>
                <div className="w-32">
                  <Input
                    type="number"
                    value={itm.unit_price}
                    onChange={(e) => {
                      const updated = [...soItems];
                      updated[idx].unit_price = parseFloat(e.target.value) || 0;
                      setSoItems(updated);
                    }}
                    placeholder="Harga Satuan"
                  />
                </div>
                {soItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setSoItems(soItems.filter((_, i) => i !== idx))}
                    className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <Input
            label="Catatan Pengiriman"
            placeholder="Kirim ke cabang Tangerang..."
            value={soNotes}
            onChange={(e) => setSoNotes(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowCreateSoModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Draft SO
            </Button>
          </div>
        </form>
      </Modal>

      {/* Detail PO Modal */}
      <Modal
        isOpen={showPoDetailModal}
        onClose={() => setShowPoDetailModal(false)}
        title="Dokumen Purchase Order (PO)"
        subtitle={`Nomor: ${selectedPo?.po_number}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400">Pemasok:</span>
              <p className="font-bold text-slate-900">{selectedPo?.supplier_name}</p>
              <span className="text-slate-400 mt-2 block">Tgl Order:</span>
              <p className="font-semibold text-slate-700">
                {selectedPo?.order_date ? new Date(selectedPo.order_date).toLocaleDateString('id-ID') : '-'}
              </p>
            </div>
            <div>
              <span className="text-slate-400">Status:</span>
              <Badge>{selectedPo?.status}</Badge>
              <span className="text-slate-400 mt-2 block">Total Nilai:</span>
              <p className="text-sm font-bold text-indigo-600">
                Rp {(selectedPo?.total_amount || 0).toLocaleString('id-ID')}
              </p>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3 text-right">Dipesan</th>
                  <th className="p-3 text-right">Diterima</th>
                  <th className="p-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedPo?.items?.map((item) => (
                  <tr key={item.po_item_id}>
                    <td className="p-3 font-mono font-bold text-slate-900">{item.product_id}</td>
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3 text-right font-bold text-slate-900">{item.quantity}</td>
                    <td className="p-3 text-right font-bold text-emerald-600">
                      {item.quantity_received}
                    </td>
                    <td className="p-3 text-right font-semibold text-slate-800">
                      Rp {(item.subtotal || 0).toLocaleString('id-ID')}
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
              Cetak PO
            </Button>
            <Button variant="primary" onClick={() => setShowPoDetailModal(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* Detail SO Modal */}
      <Modal
        isOpen={showSoDetailModal}
        onClose={() => setShowSoDetailModal(false)}
        title="Dokumen Sales Order & Surat Jalan"
        subtitle={`Nomor: ${selectedSo?.so_number}`}
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-400">Pelanggan:</span>
              <p className="font-bold text-slate-900">{selectedSo?.customer_name}</p>
            </div>
            <div>
              <span className="text-slate-400">Status:</span>
              <Badge>{selectedSo?.status}</Badge>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 font-bold text-slate-700">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3 text-right">Jumlah</th>
                  <th className="p-3 text-right">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedSo?.items?.map((item) => (
                  <tr key={item.so_item_id}>
                    <td className="p-3 font-mono font-bold text-slate-900">{item.product_id}</td>
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3 text-right font-bold text-slate-900">{item.quantity}</td>
                    <td className="p-3 text-right font-semibold text-slate-800">
                      Rp {(item.subtotal || 0).toLocaleString('id-ID')}
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
            <Button variant="primary" onClick={() => setShowSoDetailModal(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default OrdersPage;
