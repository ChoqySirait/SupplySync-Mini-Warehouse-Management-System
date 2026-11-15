import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  DollarSign,
  AlertTriangle,
  ArrowRightLeft,
  BookOpen,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import api from '../services/api';
import { Product } from '../types';

export const ReportsPage: React.FC = () => {
  const { activeFacilityId } = useAuth();
  const { error, success } = useToast();

  const [activeReportTab, setActiveReportTab] = useState<'VALUATION' | 'MUTATIONS' | 'EXPIRY' | 'STOCK_CARD'>('VALUATION');
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Valuation state
  const [valuationData, setValuationData] = useState<any>(null);

  // Mutations state
  const [mutationsData, setMutationsData] = useState<any[]>([]);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Expiry state
  const [expiryData, setExpiryData] = useState<any>(null);

  // Stock Card state
  const [selectedProductId, setSelectedProductId] = useState('');
  const [stockCardData, setStockCardData] = useState<any>(null);

  useEffect(() => {
    api.getProducts({ facility_id: activeFacilityId }).then((res) => {
      if (res.data) {
        setProducts(res.data);
        if (res.data.length > 0) setSelectedProductId(res.data[0].product_id);
      }
    });
  }, [activeFacilityId]);

  const loadReport = async () => {
    setIsLoading(true);
    try {
      if (activeReportTab === 'VALUATION') {
        const res = await api.getInventoryValuation(activeFacilityId);
        if (res.data) setValuationData(res.data);
      } else if (activeReportTab === 'MUTATIONS') {
        const res = await api.getMutationsReport({
          startDate,
          endDate,
          facility_id: activeFacilityId,
        });
        if (res.data) setMutationsData(res.data.transactions || []);
      } else if (activeReportTab === 'EXPIRY') {
        const res = await api.getExpiryReport(activeFacilityId);
        if (res.data) setExpiryData(res.data);
      } else if (activeReportTab === 'STOCK_CARD' && selectedProductId) {
        const res = await api.getStockCard(selectedProductId, activeFacilityId);
        if (res.data) setStockCardData(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Laporan', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
  }, [activeReportTab, activeFacilityId, selectedProductId]);

  const downloadCsv = (endpoint: string) => {
    const token = localStorage.getItem('ss_token');
    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `/api${endpoint}${separator}export=csv${activeFacilityId ? `&facility_id=${activeFacilityId}` : ''}`;

    fetch(url, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    })
      .then((res) => res.blob())
      .then((blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `WMS_Export_${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        success('Unduhan Berhasil', 'File CSV berstandar RFC-4180 siap dibuka di Microsoft Excel.');
      })
      .catch((err) => error('Gagal Mengunduh', err.message));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Pusat Laporan & Ekspor Data WMS</h2>
          <p className="text-xs text-slate-500">
            Laporan analitis operasional dan pengunduhan berkas CSV terstandardisasi untuk akuntansi
            dan audit
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveReportTab('VALUATION')}
          className={`flex items-center gap-2 border-b-2 py-3 px-5 text-xs font-bold transition-colors ${
            activeReportTab === 'VALUATION'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Valuasi Aset Inventaris
        </button>
        <button
          onClick={() => setActiveReportTab('MUTATIONS')}
          className={`flex items-center gap-2 border-b-2 py-3 px-5 text-xs font-bold transition-colors ${
            activeReportTab === 'MUTATIONS'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <ArrowRightLeft className="w-4 h-4" />
          Mutasi Inbound & Outbound
        </button>
        <button
          onClick={() => setActiveReportTab('EXPIRY')}
          className={`flex items-center gap-2 border-b-2 py-3 px-5 text-xs font-bold transition-colors ${
            activeReportTab === 'EXPIRY'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          Kedaluwarsa Batch & Risiko
        </button>
        <button
          onClick={() => setActiveReportTab('STOCK_CARD')}
          className={`flex items-center gap-2 border-b-2 py-3 px-5 text-xs font-bold transition-colors ${
            activeReportTab === 'STOCK_CARD'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          Buku Kartu Stok Ledger
        </button>
      </div>

      {/* Report 1: Valuation */}
      {activeReportTab === 'VALUATION' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200">
            <div>
              <span className="text-xs text-slate-500">Total Akumulasi Valuasi Aset:</span>
              <p className="text-xl font-bold text-slate-900">
                Rp {(valuationData?.total_valuation || 0).toLocaleString('id-ID')}
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => downloadCsv('/reports/valuation')}
              icon={<Download className="w-4 h-4" />}
            >
              Unduh CSV Excel
            </Button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3">Kategori</th>
                  <th className="p-3 text-right">Kuantitas Stok</th>
                  <th className="p-3 text-right">Harga Pokok</th>
                  <th className="p-3 text-right font-bold text-slate-900">Total Valuasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {valuationData?.items?.map((item: any) => (
                  <tr key={item.product_id} className="hover:bg-slate-50">
                    <td className="p-3 font-mono font-bold text-slate-900">{item.product_id}</td>
                    <td className="p-3">{item.product_name}</td>
                    <td className="p-3 text-slate-500">{item.category_name || '-'}</td>
                    <td className="p-3 text-right font-bold text-slate-800">
                      {(item.total_quantity || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right text-slate-600">
                      Rp {(item.cost_price || 0).toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-600">
                      Rp {(item.total_value || 0).toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 2: Mutations */}
      {activeReportTab === 'MUTATIONS' && (
        <div className="space-y-4">
          <Card padding={false} className="p-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
              <div className="flex items-center gap-2">
                <Input
                  label="Dari Tanggal"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Input
                  label="Sampai Tanggal"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <div className="pt-5">
                  <Button variant="secondary" size="md" onClick={loadReport}>
                    Filter
                  </Button>
                </div>
              </div>

              <Button
                variant="primary"
                size="md"
                onClick={() =>
                  downloadCsv(`/reports/mutations?startDate=${startDate}&endDate=${endDate}`)
                }
                icon={<Download className="w-4 h-4" />}
              >
                Unduh CSV Excel
              </Button>
            </div>
          </Card>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">No. Referensi</th>
                  <th className="p-3">SKU</th>
                  <th className="p-3">Nama Produk</th>
                  <th className="p-3">Tipe Mutasi</th>
                  <th className="p-3 text-right">Kuantitas</th>
                  <th className="p-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {mutationsData.map((trx) => (
                  <tr key={trx.transaction_id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{trx.created_at?.split('T')[0]}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">{trx.reference_no}</td>
                    <td className="p-3 font-mono">{trx.product_id}</td>
                    <td className="p-3">{trx.product_name}</td>
                    <td className="p-3">
                      <Badge size="sm">{trx.transaction_type}</Badge>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900">
                      {trx.quantity?.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-slate-500 italic truncate max-w-xs">{trx.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 3: Expiry */}
      {activeReportTab === 'EXPIRY' && (
        <div className="space-y-4">
          <div className="flex justify-between items-center p-4 bg-white rounded-xl border border-slate-200">
            <div>
              <span className="text-xs text-slate-500">Skor Kesegaran Batch (Freshness Score):</span>
              <p className="text-xl font-bold text-indigo-600">
                {expiryData?.freshness_score || 100}%
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              onClick={() => downloadCsv('/reports/expiry')}
              icon={<Download className="w-4 h-4" />}
            >
              Unduh CSV Excel
            </Button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">Kode Batch</th>
                  <th className="p-3">SKU & Nama Produk</th>
                  <th className="p-3 text-right">Stok Sisa</th>
                  <th className="p-3">Tgl Kedaluwarsa</th>
                  <th className="p-3">Sisa Hari</th>
                  <th className="p-3">Status Risiko</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {expiryData?.batches?.map((b: any) => {
                  const days = b.days_to_expiry;
                  return (
                    <tr key={b.batch_id} className="hover:bg-slate-50">
                      <td className="p-3 font-mono font-bold text-slate-900">{b.batch_code}</td>
                      <td className="p-3">
                        <span className="font-mono text-slate-700">{b.product_id}</span> •{' '}
                        {b.product_name}
                      </td>
                      <td className="p-3 text-right font-bold text-slate-900">
                        {b.quantity?.toLocaleString('id-ID')}
                      </td>
                      <td className="p-3">{b.expired_date?.split('T')[0]}</td>
                      <td className="p-3 font-mono">{days ?? '-'} Hari</td>
                      <td className="p-3">
                        {days <= 0 ? (
                          <Badge variant="danger" size="sm">
                            EXPIRED
                          </Badge>
                        ) : days <= 30 ? (
                          <Badge variant="warning" size="sm">
                            KRITIS (&le;30h)
                          </Badge>
                        ) : days <= 90 ? (
                          <Badge variant="warning" size="sm">
                            WASPADA (31-90h)
                          </Badge>
                        ) : (
                          <Badge variant="success" size="sm">
                            SEHAT (&gt;90h)
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Report 4: Stock Card */}
      {activeReportTab === 'STOCK_CARD' && (
        <div className="space-y-4">
          <Card padding={false} className="p-4">
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
              <div className="w-full sm:w-80">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs font-semibold text-slate-700"
                >
                  {products.map((p) => (
                    <option key={p.product_id} value={p.product_id}>
                      {p.product_id} - {p.product_name}
                    </option>
                  ))}
                </select>
              </div>

              {selectedProductId && (
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => downloadCsv(`/reports/stock-card/${selectedProductId}`)}
                  icon={<Download className="w-4 h-4" />}
                >
                  Unduh Kartu Stok CSV
                </Button>
              )}
            </div>
          </Card>

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 font-bold text-slate-700 border-b border-slate-200">
                <tr>
                  <th className="p-3">Tanggal</th>
                  <th className="p-3">No. Referensi</th>
                  <th className="p-3">Tipe</th>
                  <th className="p-3 text-right">Masuk</th>
                  <th className="p-3 text-right">Keluar</th>
                  <th className="p-3 text-right font-bold text-slate-900">Saldo Berjalan</th>
                  <th className="p-3">Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockCardData?.entries?.map((entry: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{entry.date?.split('T')[0]}</td>
                    <td className="p-3 font-mono font-bold text-slate-900">{entry.reference_no}</td>
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
                      {entry.running_balance?.toLocaleString('id-ID')}
                    </td>
                    <td className="p-3 text-slate-500 italic truncate max-w-xs">{entry.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;
