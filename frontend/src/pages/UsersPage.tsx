import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  Users,
  Plus,
  Edit,
  KeyRound,
  ShieldCheck,
  Building,
  UserCheck,
  UserX,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { User, Facility, UserRole } from '../types';

export const UsersPage: React.FC = () => {
  const { facilities, isAdmin } = useAuth();
  const { success, error } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Forms
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  // Form State
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('STAFF');
  const [facilityId, setFacilityId] = useState<number>(1);
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getUsers();
      if (res.data) setUsers(res.data);
    } catch (err: any) {
      error('Gagal Memuat Pengguna', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setUsername('');
    setEmail('');
    setPassword('');
    setRole('STAFF');
    setFacilityId(facilities[0]?.facility_id || 1);
    setShowAddModal(true);
  };

  const openEdit = (u: User) => {
    setSelectedUser(u);
    setRole(u.role);
    setFacilityId(u.facility_id || 1);
    setShowEditModal(true);
  };

  const openReset = (u: User) => {
    setSelectedUser(u);
    setNewPassword('');
    setShowResetModal(true);
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !email || !password) {
      error('Validasi Gagal', 'Harap isi seluruh bidang pengguna.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createUser({
        username,
        email,
        password,
        role,
        facility_id: facilityId,
      });
      success('Pengguna Dibuat', `Akun ${username} (${role}) berhasil didaftarkan.`);
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Tambah Pengguna', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setIsSubmitting(true);
    try {
      await api.updateUser(selectedUser.user_id, {
        role,
        facility_id: facilityId,
      });
      success('Pengguna Diperbarui', `Otoritas akun ${selectedUser.username} berhasil diubah.`);
      setShowEditModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Ubah Pengguna', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    try {
      await api.toggleUserStatus(user.user_id);
      success(
        'Status Berubah',
        `Akun ${user.username} sekarang ${user.is_active ? 'dinonaktifkan' : 'diaktifkan'}.`
      );
      loadData();
    } catch (err: any) {
      error('Gagal Ubah Status', err.message);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !newPassword || newPassword.length < 6) {
      error('Validasi Gagal', 'Kata sandi baru minimal 6 karakter.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.resetUserPassword(selectedUser.user_id, newPassword);
      success('Sandi Di-reset', `Kata sandi akun ${selectedUser.username} berhasil diperbarui.`);
      setShowResetModal(false);
    } catch (err: any) {
      error('Gagal Reset Sandi', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<User>[] = [
    {
      header: 'Nama Pengguna',
      accessor: (row) => (
        <div>
          <span className="font-bold text-slate-900 text-xs">{row.username}</span>
          <span className="block text-[11px] text-slate-400">{row.email}</span>
        </div>
      ),
    },
    {
      header: 'Peran (Role)',
      accessor: (row) => {
        const variants: Record<UserRole, any> = {
          ADMIN: 'danger',
          MANAGER: 'primary',
          STAFF: 'default',
        };
        return <Badge variant={variants[row.role]}>{row.role}</Badge>;
      },
    },
    {
      header: 'Fasilitas Cabang',
      accessor: (row) => (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <Building className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.facility_name || 'Gudang Pusat'}</span>
        </div>
      ),
    },
    {
      header: 'Status Akun',
      accessor: (row) => (
        <Badge variant={row.is_active ? 'success' : 'danger'} size="sm">
          {row.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openEdit(row)}
            icon={<Edit className="w-3.5 h-3.5" />}
          >
            Ubah
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => openReset(row)}
            icon={<KeyRound className="w-3.5 h-3.5" />}
          >
            Reset Sandi
          </Button>

          <button
            onClick={() => handleToggleStatus(row)}
            className={`p-1.5 rounded transition ${
              row.is_active
                ? 'text-rose-500 hover:bg-rose-50'
                : 'text-emerald-600 hover:bg-emerald-50'
            }`}
            title={row.is_active ? 'Nonaktifkan Akun' : 'Aktifkan Akun'}
          >
            {row.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manajemen Pengguna & Otoritas RBAC</h2>
          <p className="text-xs text-slate-500">
            Pengelolaan staf gudang, penetapan hak akses role, serta penugasan fasilitas kerja
          </p>
        </div>

        <Button
          variant="primary"
          size="md"
          onClick={openAdd}
          icon={<Plus className="w-4 h-4" />}
        >
          Tambah Pengguna Baru
        </Button>
      </div>

      <Card
        title="Daftar Pengguna Sistem"
        subtitle="Manajemen akun dan penugasan cabang"
        padding={false}
      >
        <Table
          columns={columns}
          data={users}
          isLoading={isLoading}
          emptyMessage="Belum ada data pengguna."
        />
      </Card>

      {/* Add User Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Tambah Pengguna Baru"
        subtitle="Daftarkan akun staf atau manajer pergudangan"
        maxWidth="lg"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Nama Pengguna (Username)"
              placeholder="budi_ops"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <Input
              label="Alamat Email"
              type="email"
              placeholder="budi@supplysync.local"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <Input
            label="Kata Sandi Awal"
            type="password"
            placeholder="Minimal 6 karakter"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Peran Hak Akses (Role)</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm"
              >
                <option value="STAFF">STAFF (Hanya Fasilitas Sendiri)</option>
                <option value="MANAGER">MANAGER (Seluruh Fasilitas)</option>
                <option value="ADMIN">ADMIN (Hak Akses Penuh Sistem)</option>
              </select>
            </div>

            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Penugasan Fasilitas Cabang</label>
              <select
                value={facilityId}
                onChange={(e) => setFacilityId(parseInt(e.target.value, 10))}
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm"
              >
                {facilities.map((f) => (
                  <option key={f.facility_id} value={f.facility_id}>
                    {f.facility_name} ({f.facility_code})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Pengguna
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit User Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Ubah Otoritas Akun: ${selectedUser?.username}`}
        subtitle="Ubah peran dan penugasan fasilitas gudang"
        maxWidth="md"
      >
        <form onSubmit={handleUpdateUser} className="space-y-4">
          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Peran Hak Akses (Role)</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm"
            >
              <option value="STAFF">STAFF (Hanya Fasilitas Sendiri)</option>
              <option value="MANAGER">MANAGER (Seluruh Fasilitas)</option>
              <option value="ADMIN">ADMIN (Hak Akses Penuh Sistem)</option>
            </select>
          </div>

          <div className="space-y-1.5 text-left">
            <label className="block text-xs font-semibold text-slate-700">Penugasan Fasilitas Cabang</label>
            <select
              value={facilityId}
              onChange={(e) => setFacilityId(parseInt(e.target.value, 10))}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm"
            >
              {facilities.map((f) => (
                <option key={f.facility_id} value={f.facility_id}>
                  {f.facility_name} ({f.facility_code})
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowEditModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Perubahan
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reset Password Modal */}
      <Modal
        isOpen={showResetModal}
        onClose={() => setShowResetModal(false)}
        title={`Reset Kata Sandi Akun: ${selectedUser?.username}`}
        subtitle="Masukkan kata sandi baru untuk pengguna ini"
        maxWidth="sm"
      >
        <form onSubmit={handleResetPassword} className="space-y-4">
          <Input
            label="Kata Sandi Baru"
            type="password"
            placeholder="Minimal 6 karakter"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowResetModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="danger" isLoading={isSubmitting}>
              Terapkan Sandi Baru
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default UsersPage;
