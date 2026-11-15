import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  DollarSign,
  Boxes,
  Sparkles,
  AlertTriangle,
  Clock,
  ArrowRightLeft,
  TrendingUp,
  FileText,
  Activity,
  Layers,
} from 'lucide-react';
import Card from '../components/common/Card';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import api from '../services/api';
import { DashboardMetrics, StockTransaction } from '../types';

export const DashboardPage: React.FC = () => {
  const { activeFacilityId } = useAuth();
  const { error } = useToast();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getDashboard(activeFacilityId);
      if (res.data) {
        setMetrics(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Dashboard', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId]);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0,
    }).format(val || 0);
  };

  const transactionColumns: Column<StockTransaction>[] = [
    {
      header: 'No. Referensi',
      accessor: (row) => (
        <span className="font-mono text-xs font-bold text-slate-800">{row.reference_no}</span>
      ),
    },
    {
      header: 'SKU / Produk',
      accessor: (row) => (
        <div>
          <span className="font-mono text-xs font-semibold text-slate-900">{row.product_id}</span>
          {row.product_name && (
            <span className="block text-xs text-slate-500 truncate max-w-xs">{row.product_name}</span>
          )}
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
      header: 'Kuantitas',
      accessor: (row) => (
        <span className="font-bold text-slate-900">{row.quantity.toLocaleString('id-ID')}</span>
      ),
    },
    {
      header: 'Operator',
      accessor: (row) => row.username || 'System',
    },
    {
      header: 'Waktu',
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {new Date(row.created_at).toLocaleString('id-ID')}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Valuation Card */}
        <Card className="border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Total Valuasi Stok</p>
              <h4 className="mt-1 text-xl font-bold text-slate-900">
                {formatCurrency(metrics?.total_inventory_valuation || 0)}
              </h4>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <DollarSign className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Boxes className="w-3.5 h-3.5 text-slate-400" />
            <span>{metrics?.total_units?.toLocaleString('id-ID') || 0} Total Unit Tersedia</span>
          </div>
        </Card>

        {/* Freshness Score Card */}
        <Card className="border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Skor Kesegaran FEFO</p>
              <h4 className="mt-1 text-xl font-bold text-slate-900">
                {metrics?.freshness_score || 100}%
              </h4>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
              <Sparkles className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Kesehatan sisa masa simpan batch</span>
          </div>
        </Card>

        {/* Low Stock Alert */}
        <Card className="border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">SKU Stok Rendah</p>
              <h4 className="mt-1 text-xl font-bold text-slate-900">
                {metrics?.low_stock_count || 0} SKU
              </h4>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
            <span>Perlu pengadaan kembali (reorder)</span>
          </div>
        </Card>

        {/* Pending Operations */}
        <Card className="border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Operasi Tertunda</p>
              <h4 className="mt-1 text-xl font-bold text-slate-900">
                {(metrics?.pending_pos || 0) +
                  (metrics?.pending_sos || 0) +
                  (metrics?.pending_transfers || 0)}
              </h4>
            </div>
            <div className="rounded-xl bg-sky-50 p-3 text-sky-600">
              <Activity className="w-6 h-6" />
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span>{metrics?.pending_pos || 0} PO</span> • 
            <span>{metrics?.pending_sos || 0} SO</span> • 
            <span>{metrics?.pending_transfers || 0} Transfer</span>
          </div>
        </Card>
      </div>

      {/* Middle Row: Fast Moving & Aging */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Fast Moving Products */}
        <Card
          title="Produk Tercepat Keluar (Fast-Moving)"
          subtitle="Top volume pengeluaran stok periode operasional saat ini"
        >
          {metrics?.fast_moving_products && metrics.fast_moving_products.length > 0 ? (
            <div className="space-y-3">
              {metrics.fast_moving_products.map((item, idx) => (
                <div
                  key={item.product_id}
                  className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
                      {idx + 1}
                    </span>
                    <div>
                      <p className="font-semibold text-xs text-slate-900">{item.product_name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{item.product_id}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-indigo-600">
                      {item.total_out.toLocaleString('id-ID')} Unit
                    </span>
                    <span className="block text-[10px] text-slate-400">Total Outflow</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400 py-6 italic">
              Belum ada pergerakan transaksi keluar pada fasilitas ini.
            </p>
          )}
        </Card>

        {/* Batch Aging Summary */}
        <Card
          title="Klasifikasi Usia Batch Simpan (Aging Tiers)"
          subtitle="Pemantauan resiko kedaluwarsa sesuai standar FEFO"
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 text-center">
              <span className="text-[11px] font-bold uppercase text-emerald-800">Sehat (&gt;90h)</span>
              <p className="mt-1 text-2xl font-black text-emerald-700">
                {metrics?.aging_breakdown?.healthy ?? '-'}
              </p>
              <span className="text-[10px] text-emerald-600">Batch Segar</span>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-center">
              <span className="text-[11px] font-bold uppercase text-amber-800">Waspada (31-90h)</span>
              <p className="mt-1 text-2xl font-black text-amber-700">
                {metrics?.aging_breakdown?.warning ?? '-'}
              </p>
              <span className="text-[10px] text-amber-600">Perlu Dipantau</span>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 text-center">
              <span className="text-[11px] font-bold uppercase text-rose-800">Kritis (&le;30h)</span>
              <p className="mt-1 text-2xl font-black text-rose-700">
                {metrics?.near_expiry_count || 0}
              </p>
              <span className="text-[10px] text-rose-600">Prioritas FEFO</span>
            </div>

            <div className="rounded-xl border border-slate-300 bg-slate-100/70 p-4 text-center">
              <span className="text-[11px] font-bold uppercase text-slate-800">Kedaluwarsa</span>
              <p className="mt-1 text-2xl font-black text-rose-800">
                {metrics?.expired_batches_count || 0}
              </p>
              <span className="text-[10px] text-slate-500">Harus Dibuang</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Recent Activity Table */}
      <Card
        title="Jejak Audit Mutasi Stok Terkini"
        subtitle="Aktivitas pergerakan barang terakhir yang dicatat secara real-time"
        padding={false}
      >
        <Table
          columns={transactionColumns}
          data={metrics?.recent_transactions || []}
          isLoading={isLoading}
          emptyMessage="Belum ada riwayat mutasi stok."
        />
      </Card>
    </div>
  );
};

export default DashboardPage;
