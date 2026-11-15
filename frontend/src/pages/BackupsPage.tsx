import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  Database,
  ShieldCheck,
  Download,
  RotateCcw,
  AlertTriangle,
  HardDrive,
  CheckCircle2,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { DatabaseBackup } from '../types';

export const BackupsPage: React.FC = () => {
  const { isAdmin } = useAuth();
  const { success, error, warning } = useToast();

  const [backups, setBackups] = useState<DatabaseBackup[]>([]);
  const [integrity, setIntegrity] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);

  // Restore Modal State
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<DatabaseBackup | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [bRes, iRes] = await Promise.all([api.getBackups(), api.getIntegrity()]);
      if (bRes.data) setBackups(bRes.data);
      if (iRes.data) setIntegrity(iRes.data);
    } catch (err: any) {
      error('Gagal Memuat Status Database', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateBackup = async () => {
    setIsCreating(true);
    try {
      const res = await api.createBackup();
      success('Pencadangan Berhasil', `File cadangan ${res.data?.filename || ''} tersimpan.`);
      loadData();
    } catch (err: any) {
      error('Gagal Membuat Cadangan', err.message);
    } finally {
      setIsCreating(false);
    }
  };

  const openRestoreModal = (b: DatabaseBackup) => {
    setSelectedBackup(b);
    setShowRestoreModal(true);
  };

  const handleExecuteRestore = async () => {
    if (!selectedBackup) return;

    setIsRestoring(true);
    try {
      await api.restoreBackup(selectedBackup.filename);
      success('Pemulihan Selesai', 'Database berhasil dipulihkan dari cadangan.');
      setShowRestoreModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Memulihkan Database', err.message);
    } finally {
      setIsRestoring(false);
    }
  };

  const columns: Column<DatabaseBackup>[] = [
    {
      header: 'Nama Berkas Snapshot',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <HardDrive className="w-4 h-4 text-slate-400" />
          <span className="font-mono text-xs font-bold text-slate-900">{row.filename}</span>
        </div>
      ),
    },
    {
      header: 'Ukuran Berkas',
      accessor: (row) => (
        <span className="text-xs font-mono text-slate-600 font-semibold">
          {row.size_kb ? `${row.size_kb.toFixed(1)} KB` : '< 1 KB'}
        </span>
      ),
    },
    {
      header: 'Waktu Pencadangan',
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {new Date(row.created_at).toLocaleString('id-ID')}
        </span>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div>
          {isAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openRestoreModal(row)}
              icon={<RotateCcw className="w-3.5 h-3.5 text-amber-600" />}
            >
              Pulihkan (Restore)
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
            Pencadangan Database & Integritas Sistem
          </h2>
          <p className="text-xs text-slate-500">
            Pemantauan kesehatan relasi skema MySQL, verifikasi anomali, dan snapshot recovery
          </p>
        </div>

        {isAdmin && (
          <Button
            variant="primary"
            size="md"
            onClick={handleCreateBackup}
            isLoading={isCreating}
            icon={<Database className="w-4 h-4" />}
          >
            Buat Cadangan Baru (SQL Dump)
          </Button>
        )}
      </div>

      {/* Integrity Health Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Skor Integritas Database</p>
              <h4 className="mt-1 text-2xl font-bold text-emerald-600">
                {integrity?.integrityScore || 100}%
              </h4>
            </div>
            <div className="rounded-xl bg-emerald-50 p-3 text-emerald-600">
              <ShieldCheck className="w-6 h-6" />
            </div>
          </div>
          <span className="mt-2 block text-xs text-slate-500">
            Kondisi:{' '}
            <strong className="text-slate-800">{integrity?.overallStatus || 'SEHAT (HEALTHY)'}</strong>
          </span>
        </Card>

        <Card className="border-l-4 border-l-indigo-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Jumlah File Cadangan</p>
              <h4 className="mt-1 text-2xl font-bold text-indigo-600">{backups.length}</h4>
            </div>
            <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
              <HardDrive className="w-6 h-6" />
            </div>
          </div>
          <span className="mt-2 block text-xs text-slate-500">Tersimpan di direktori /backups</span>
        </Card>

        <Card className="border-l-4 border-l-sky-500">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500">Tabel Tercakup Snapshot</p>
              <h4 className="mt-1 text-2xl font-bold text-sky-600">16 Tabel</h4>
            </div>
            <div className="rounded-xl bg-sky-50 p-3 text-sky-600">
              <Database className="w-6 h-6" />
            </div>
          </div>
          <span className="mt-2 block text-xs text-slate-500">
            Termasuk PO, SO, Mutasi, dan Batch
          </span>
        </Card>
      </div>

      {/* Backups Table */}
      <Card
        title="Riwayat Berkas Snapshot Cadangan (SQL Dump)"
        subtitle="Snapshot basis data untuk Disaster Recovery"
        padding={false}
      >
        <Table
          columns={columns}
          data={backups}
          isLoading={isLoading}
          emptyMessage="Belum ada berkas cadangan database."
        />
      </Card>

      {/* Restore Confirmation Modal */}
      <Modal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        title="Konfirmasi Pemulihan Database (Restore)"
        subtitle={`Berkas target: ${selectedBackup?.filename}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-900 leading-relaxed flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
            <div>
              <strong className="block font-bold">PERINGATAN KRITIS:</strong>
              Operasi pemulihan akan menggantikan seluruh tabel basis data dengan kondisi pada saat
              berkas snapshot ini dibuat. Seluruh mutasi transaksi sesudah tanggal cadangan ini akan
              tertimpa.
            </div>
          </div>

          <p className="text-xs text-slate-600">
            Apakah Anda yakin ingin melanjutkan prosedur pemulihan ini?
          </p>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowRestoreModal(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="danger"
              isLoading={isRestoring}
              onClick={handleExecuteRestore}
            >
              Ya, Pulihkan Sekarang
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default BackupsPage;
