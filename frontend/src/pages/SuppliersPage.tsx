import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { Building, Plus, Edit, Trash2, Mail, Phone, Clock } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { Supplier } from '../types';

export const SuppliersPage: React.FC = () => {
  const { isAdmin, isManager } = useAuth();
  const { success, error } = useToast();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals & Form
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [leadTimeDays, setLeadTimeDays] = useState(3);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getSuppliers();
      if (res.data) setSuppliers(res.data);
    } catch (err: any) {
      error('Gagal Memuat Pemasok', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openAdd = () => {
    setIsEditing(false);
    setCurrentId(null);
    setSupplierName('');
    setContactPerson('');
    setEmail('');
    setPhone('');
    setAddress('');
    setLeadTimeDays(3);
    setShowModal(true);
  };

  const openEdit = (s: Supplier) => {
    setIsEditing(true);
    setCurrentId(s.supplier_id);
    setSupplierName(s.supplier_name);
    setContactPerson(s.contact_person || '');
    setEmail(s.email || '');
    setPhone(s.phone || '');
    setAddress(s.address || '');
    setLeadTimeDays(s.lead_time_days || 3);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierName) {
      error('Validasi Gagal', 'Nama pemasok wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && currentId) {
        await api.updateSupplier(currentId, {
          supplier_name: supplierName,
          contact_person: contactPerson,
          email,
          phone,
          address,
          lead_time_days: leadTimeDays,
        });
        success('Pemasok Diperbarui', 'Data pemasok berhasil disimpan.');
      } else {
        await api.createSupplier({
          supplier_name: supplierName,
          contact_person: contactPerson,
          email,
          phone,
          address,
          lead_time_days: leadTimeDays,
        });
        success('Pemasok Ditambahkan', 'Pemasok baru berhasil didaftarkan.');
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Menyimpan', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<Supplier>[] = [
    {
      header: 'Nama Pemasok',
      accessor: (row) => (
        <div>
          <span className="font-bold text-slate-900 text-xs">{row.supplier_name}</span>
          <span className="block text-[11px] text-slate-400">
            Kontak: {row.contact_person || '-'}
          </span>
        </div>
      ),
    },
    {
      header: 'Kontak & Email',
      accessor: (row) => (
        <div className="text-xs space-y-0.5">
          {row.email && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Mail className="w-3 h-3 text-slate-400" />
              <span>{row.email}</span>
            </div>
          )}
          {row.phone && (
            <div className="flex items-center gap-1.5 text-slate-600">
              <Phone className="w-3 h-3 text-slate-400" />
              <span>{row.phone}</span>
            </div>
          )}
        </div>
      ),
    },
    {
      header: 'Lead Time Pengiriman',
      accessor: (row) => (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Clock className="w-3.5 h-3.5 text-slate-400" />
          <span>{row.lead_time_days} Hari Kerja</span>
        </div>
      ),
    },
    {
      header: 'Status',
      accessor: (row) => (
        <Badge variant={row.is_active ? 'success' : 'default'} size="sm">
          {row.is_active ? 'Aktif' : 'Nonaktif'}
        </Badge>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div>
          {(isAdmin || isManager) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEdit(row)}
              icon={<Edit className="w-3.5 h-3.5" />}
            >
              Ubah
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
          <h2 className="text-xl font-bold text-slate-900">Direktori Pemasok (Suppliers)</h2>
          <p className="text-xs text-slate-500">
            Daftar mitra vendor pengadaan bahan dan estimasi lead time pengiriman
          </p>
        </div>

        {(isAdmin || isManager) && (
          <Button
            variant="primary"
            size="md"
            onClick={openAdd}
            icon={<Plus className="w-4 h-4" />}
          >
            Tambah Pemasok
          </Button>
        )}
      </div>

      <Card
        title="Daftar Mitra Vendor"
        subtitle="Manajemen data rekanan bisnis"
        padding={false}
      >
        <Table
          columns={columns}
          data={suppliers}
          isLoading={isLoading}
          emptyMessage="Belum ada data pemasok terdaftar."
        />
      </Card>

      {/* Add / Edit Supplier Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? 'Ubah Informasi Pemasok' : 'Tambah Pemasok Baru'}
        subtitle="Informasi vendor untuk pengadaan Purchase Order"
        maxWidth="lg"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Nama Perusahaan Pemasok"
            placeholder="PT Sumber Rezeki Abadi"
            value={supplierName}
            onChange={(e) => setSupplierName(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Contact Person (PIC)"
              placeholder="Budi Santoso"
              value={contactPerson}
              onChange={(e) => setContactPerson(e.target.value)}
            />
            <Input
              label="Lead Time Pengiriman (Hari)"
              type="number"
              min={1}
              value={leadTimeDays}
              onChange={(e) => setLeadTimeDays(parseInt(e.target.value, 10) || 1)}
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Alamat Email"
              type="email"
              placeholder="sales@vendor.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="Nomor Telepon / WhatsApp"
              placeholder="081234567890"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Input
            label="Alamat Kantor / Pabrik"
            placeholder="Kawasan Industri Pulogadung Blok B, Jakarta"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Data Pemasok
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default SuppliersPage;
