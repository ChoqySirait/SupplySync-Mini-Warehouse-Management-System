import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../common/Toast';
import { Building2, LogOut, KeyRound, User as UserIcon, Shield } from 'lucide-react';
import Modal from '../common/Modal';
import Input from '../common/Input';
import Button from '../common/Button';
import Badge from '../common/Badge';
import api from '../../services/api';

interface HeaderProps {
  currentTab: string;
}

export const Header: React.FC<HeaderProps> = ({ currentTab }) => {
  const { user, facilities, activeFacilityId, setActiveFacilityId, logout, isAdmin, isManager } = useAuth();
  const { success, error } = useToast();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isChanging, setIsChanging] = useState(false);

  const activeFacility = facilities.find((f) => f.facility_id === activeFacilityId);

  const getPageTitle = (tab: string) => {
    switch (tab) {
      case 'dashboard':
        return 'Ringkasan & Analitik Gudang';
      case 'products':
        return 'Katalog Produk & Stok Inventaris';
      case 'movements':
        return 'Mutasi Stok & Alokasi FEFO';
      case 'transfers':
        return 'Transfer Antar-Gudang (Inter-Warehouse)';
      case 'orders':
        return 'Pengadaan (PO) & Penjualan (SO)';
      case 'replenishment':
        return 'Prediksi Reorder & Kesegaran Batch';
      case 'locations':
        return 'Manajemen Lokasi & Denah Rak Bin';
      case 'suppliers':
        return 'Direktori Pemasok (Suppliers)';
      case 'categories':
        return 'Kategori Master Produk';
      case 'users':
        return 'Manajemen Akun & Otoritas RBAC';
      case 'reports':
        return 'Pusat Laporan & Ekspor Data';
      case 'backups':
        return 'Pencadangan Database & Integritas';
      default:
        return 'SupplySync Enterprise WMS';
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      error('Validasi Gagal', 'Kata sandi baru minimal 6 karakter.');
      return;
    }
    if (newPassword !== confirmPassword) {
      error('Validasi Gagal', 'Konfirmasi kata sandi tidak cocok.');
      return;
    }

    setIsChanging(true);
    try {
      await api.changePassword({ currentPassword, newPassword });
      success('Berhasil', 'Kata sandi Anda berhasil diperbarui.');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      error('Gagal Ubah Sandi', err.message);
    } finally {
      setIsChanging(false);
    }
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex h-16 w-full items-center justify-between border-b border-slate-200 bg-white/95 px-6 backdrop-blur-md">
        <div>
          <h1 className="text-lg font-bold text-slate-900">{getPageTitle(currentTab)}</h1>
          <p className="text-xs text-slate-500">
            Fasilitas Aktif:{' '}
            <span className="font-semibold text-slate-700">
              {activeFacility ? `${activeFacility.facility_name} (${activeFacility.facility_code})` : 'Pusat / Semua Cabang'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Facility Switcher */}
          {(isAdmin || isManager) ? (
            <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 shadow-2xs">
              <Building2 className="w-4 h-4 text-slate-500" />
              <select
                value={activeFacilityId}
                onChange={(e) => setActiveFacilityId(parseInt(e.target.value, 10))}
                className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none cursor-pointer"
              >
                {facilities.map((fac) => (
                  <option key={fac.facility_id} value={fac.facility_id}>
                    {fac.facility_code} - {fac.facility_name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span>{activeFacility?.facility_name || 'Gudang Utama'}</span>
            </div>
          )}

          {/* User Info & Actions */}
          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="flex flex-col text-right">
              <span className="text-xs font-bold text-slate-900">{user?.username}</span>
              <div className="flex items-center justify-end gap-1">
                <Badge
                  variant={
                    user?.role === 'ADMIN'
                      ? 'danger'
                      : user?.role === 'MANAGER'
                      ? 'primary'
                      : 'default'
                  }
                  size="sm"
                >
                  <Shield className="w-3 h-3" />
                  {user?.role}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowPasswordModal(true)}
                title="Ganti Kata Sandi"
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition"
              >
                <KeyRound className="w-4 h-4" />
              </button>

              <button
                onClick={() => logout()}
                title="Keluar (Logout)"
                className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 hover:text-rose-700 transition"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Change Password Modal */}
      <Modal
        isOpen={showPasswordModal}
        onClose={() => setShowPasswordModal(false)}
        title="Ganti Kata Sandi Akun"
        subtitle="Perbarui kata sandi Anda secara berkala untuk menjaga keamanan sistem"
        maxWidth="md"
      >
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            label="Kata Sandi Saat Ini"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            placeholder="Masukkan kata sandi lama"
          />
          <Input
            label="Kata Sandi Baru"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            helperText="Minimal 6 karakter"
            placeholder="Minimal 6 karakter"
          />
          <Input
            label="Konfirmasi Kata Sandi Baru"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            placeholder="Ulangi kata sandi baru"
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowPasswordModal(false)}
            >
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isChanging}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
};

export default Header;
