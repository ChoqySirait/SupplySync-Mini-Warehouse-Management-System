import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  TrendingDown,
  AlertTriangle,
  ShoppingCart,
  Clock,
  Sparkles,
  CheckCircle,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';

export const ReplenishmentPage: React.FC = () => {
  const { activeFacilityId, isAdmin, isManager } = useAuth();
  const { success, error } = useToast();

  const [alerts, setAlerts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getReplenishmentAlerts(activeFacilityId);
      if (res.data) setAlerts(res.data);
    } catch (err: any) {
      error('Gagal Memuat Analitik', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId]);

  const handleGeneratePo = async (productId: string) => {
    setIsSubmitting(true);
    try {
      const res = await api.triggerReorderPo(productId, activeFacilityId);
      success(
        'PO Reorder Terbentuk',
        `Draft Purchase Order ${res.data?.po_number || ''} otomatis dibuat.`
      );
      loadData();
    } catch (err: any) {
      error('Gagal Buat PO Reorder', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<any>[] = [
    {
      header: 'SKU & Produk',
      accessor: (row) => (
        <div>
          <span className="font-mono text-xs font-bold text-slate-900">{row.product_id}</span>
          <span className="block text-xs text-slate-500">{row.product_name}</span>
        </div>
      ),
    },
    {
      header: 'Sisa Stok Saat Ini',
      accessor: (row) => (
        <span className="font-bold text-amber-600">
          {(row.current_stock || 0).toLocaleString('id-ID')} {row.unit}
        </span>
      ),
    },
    {
      header: 'Batas Minimum',
      accessor: (row) => (
        <span className="text-slate-600">
          {(row.min_stock || 0).toLocaleString('id-ID')} {row.unit}
        </span>
      ),
    },
    {
      header: 'Lead Time Vendor',
      accessor: (row) => (
        <span className="text-xs text-slate-600">{row.lead_time_days || 3} Hari</span>
      ),
    },
    {
      header: 'Prediksi Habis Stok',
      accessor: (row) => {
        const days = row.days_to_stockout;
        if (days === null || days === undefined) {
          return <span className="text-xs text-slate-400">Tidak ada mutasi keluar</span>;
        }
        return (
          <span className="text-xs font-bold text-rose-600 font-mono">
            {days} Hari Lagi
          </span>
        );
      },
    },
    {
      header: 'Saran Kuantitas Reorder',
      accessor: (row) => (
        <span className="font-bold text-indigo-600 font-mono">
          {(row.suggested_reorder_qty || row.min_stock * 2 || 20).toLocaleString('id-ID')} Unit
        </span>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div>
          {(isAdmin || isManager) && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleGeneratePo(row.product_id)}
              disabled={isSubmitting}
              icon={<ShoppingCart className="w-3.5 h-3.5" />}
            >
              Generate Draft PO
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            Prediksi Reorder & Otomatisasi Pengadaan
          </h2>
          <p className="text-xs text-slate-500">
            Analisis run-rate konsumsi stok dan perhitungan cerdas waktu pemesanan sebelum kehabisan
            barang
          </p>
        </div>
      </div>

      <Card
        title="Daftar SKU Berisiko Kehabisan Stok (Stockout Alert)"
        subtitle="Rekomendasi pemesanan ulang otomatis berdasarkan batas minimum dan rata-rata pengeluaran"
        padding={false}
      >
        <Table
          columns={columns}
          data={alerts}
          isLoading={isLoading}
          emptyMessage="Seluruh level stok dalam kondisi aman. Tidak ada peringatan reorder."
        />
      </Card>
    </div>
  );
};

export default ReplenishmentPage;
