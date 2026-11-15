import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  ClipboardCheck,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { Product, StockOpname } from '../types';

export const StockOpnamePage: React.FC = () => {
  const { activeFacilityId, isAdmin, isManager } = useAuth();
  const { success, error, warning } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [opnameHistory, setOpnameHistory] = useState<StockOpname[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal & Form State
  const [showOpnameModal, setShowOpnameModal] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [physicalStock, setPhysicalStock] = useState(0);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedProduct = products.find((p) => p.product_id === selectedProductId);
  const currentSysStock =
    selectedProduct?.facility_stock !== undefined
      ? selectedProduct.facility_stock
      : selectedProduct?.total_stock || 0;
  const difference = physicalStock - currentSysStock;

  const loadData = async () => {
    setIsLoading(true);
    try {
      const prodRes = await api.getProducts({ facility_id: activeFacilityId });
      if (prodRes.data) {
        setProducts(prodRes.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Produk', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId]);

  const openOpnameModal = () => {
    if (products.length > 0) {
      setSelectedProductId(products[0].product_id);
      setPhysicalStock(
        products[0].facility_stock !== undefined
          ? products[0].facility_stock
          : products[0].total_stock || 0
      );
    }
    setReason('Rekonsiliasi fisik berkala');
    setShowOpnameModal(true);
  };

  const handleProductChange = (productId: string) => {
    setSelectedProductId(productId);
    const prod = products.find((p) => p.product_id === productId);
    if (prod) {
      setPhysicalStock(
        prod.facility_stock !== undefined ? prod.facility_stock : prod.total_stock || 0
      );
    }
  };

  const handleProcessOpname = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !reason) {
      error('Validasi Gagal', 'Harap lengkapi formulir opname.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.stockOpname({
        product_id: selectedProductId,
        physical_stock: physicalStock,
        facility_id: activeFacilityId,
        reason,
      });

      if (res.data) {
        setOpnameHistory((prev) => [res.data!, ...prev]);
      }

      success(
        'Opname Sukses',
        `Stok fisik (${physicalStock}) berhasil diselaraskan. Selisih: ${difference > 0 ? `+${difference}` : difference}`
      );
      setShowOpnameModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Stock Opname', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<StockOpname>[] = [
    {
      header: 'No. Opname',
      accessor: (row) => (
        <span className="font-mono text-xs font-bold text-slate-900">{row.opname_number}</span>
      ),
    },
    {
      header: 'SKU & Produk',
      accessor: (row) => (
        <div>
          <span className="font-mono text-xs font-bold text-slate-800">{row.product_id}</span>
          <span className="block text-xs text-slate-500">{row.product_name || '-'}</span>
        </div>
      ),
    },
    {
      header: 'Stok Sistem',
      accessor: (row) => (
        <span className="font-bold text-slate-700">{row.system_stock.toLocaleString('id-ID')}</span>
      ),
    },
    {
      header: 'Stok Fisik',
      accessor: (row) => (
        <span className="font-bold text-slate-900">{row.physical_stock.toLocaleString('id-ID')}</span>
      ),
    },
    {
      header: 'Selisih',
      accessor: (row) => {
        const diff = row.difference;
        if (diff === 0) {
          return <Badge variant="success">Sesuai (0)</Badge>;
        } else if (diff > 0) {
          return (
            <Badge variant="primary">
              <ArrowUpRight className="w-3 h-3" /> +{diff} (Surplus)
            </Badge>
          );
        } else {
          return (
            <Badge variant="danger">
              <ArrowDownLeft className="w-3 h-3" /> {diff} (Defisit)
            </Badge>
          );
        }
      },
    },
    {
      header: 'Alasan Penyesuaian',
      accessor: (row) => <span className="text-xs text-slate-600 italic">{row.reason}</span>,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Rekonsiliasi Stok Fisik (Stock Opname)</h2>
          <p className="text-xs text-slate-500">
            Penyesuaian kuantitas fisik gudang dengan sumber kebenaran stok sistem secara terisolasi
            per fasilitas
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={openOpnameModal}
          icon={<Plus className="w-4 h-4" />}
        >
          Mulai Sesi Opname
        </Button>
      </div>

      {/* Opname History Table */}
      <Card
        title="Riwayat Sesi Stock Opname Fasilitas"
        subtitle="Daftar audit rekonsiliasi yang telah dieksekusi"
        padding={false}
      >
        <Table
          columns={columns}
          data={opnameHistory}
          isLoading={isLoading}
          emptyMessage="Belum ada sesi stock opname yang dieksekusi pada sesi ini."
        />
      </Card>

      {/* Opname Execution Modal */}
      <Modal
        isOpen={showOpnameModal}
        onClose={() => setShowOpnameModal(false)}
        title="Eksekusi Rekonsiliasi Stock Opname"
        subtitle="Penyesuaian saldo fisik terhadap batch inventaris"
        maxWidth="lg"
      >
        <form onSubmit={handleProcessOpname} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Pilih Produk SKU</label>
            <select
              value={selectedProductId}
              onChange={(e) => handleProductChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm"
              required
            >
              {products.map((p) => (
                <option key={p.product_id} value={p.product_id}>
                  {p.product_id} - {p.product_name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500">Stok Sistem Saat Ini:</span>
              <p className="text-base font-bold text-slate-900">
                {currentSysStock.toLocaleString('id-ID')} {selectedProduct?.unit}
              </p>
            </div>
            <div>
              <span className="text-slate-500">Selisih Penyesuaian:</span>
              <p
                className={`text-base font-bold ${
                  difference === 0
                    ? 'text-slate-900'
                    : difference > 0
                    ? 'text-emerald-600'
                    : 'text-rose-600'
                }`}
              >
                {difference > 0 ? `+${difference}` : difference} {selectedProduct?.unit}
              </p>
            </div>
          </div>

          <Input
            label="Hasil Perhitungan Fisik (Physical Stock)"
            type="number"
            min={0}
            value={physicalStock}
            onChange={(e) => setPhysicalStock(parseInt(e.target.value, 10) || 0)}
            required
          />

          <Input
            label="Alasan Rekonsiliasi / Keterangan Temuan"
            placeholder="Audit fisik bulanan / Barang rusak tidak tercatat..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />

          <div className="rounded-xl border border-slate-200 bg-slate-100/60 p-3 text-xs text-slate-600 leading-relaxed">
            🔍 <strong>Mekanisme Penyesuaian:</strong> Jika terjadi surplus (+), sistem akan membentuk
            batch penyesuaian baru. Jika terjadi defisit (-), sistem akan memotong batch aktif secara
            otomatis menggunakan algoritma FEFO.
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowOpnameModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Terapkan Penyesuaian Stok
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default StockOpnamePage;
