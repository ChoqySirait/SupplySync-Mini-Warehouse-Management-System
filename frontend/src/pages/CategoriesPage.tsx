import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { Tag, Plus, Edit, Trash2, Boxes } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { Category } from '../types';

export const CategoriesPage: React.FC = () => {
  const { isAdmin, isManager } = useAuth();
  const { success, error } = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal & Form State
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [categoryName, setCategoryName] = useState('');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getCategories();
      if (res.data) setCategories(res.data);
    } catch (err: any) {
      error('Gagal Memuat Kategori', err.message);
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
    setCategoryName('');
    setDescription('');
    setShowModal(true);
  };

  const openEdit = (c: Category) => {
    setIsEditing(true);
    setCurrentId(c.category_id);
    setCategoryName(c.category_name);
    setDescription(c.description || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName) {
      error('Validasi Gagal', 'Nama kategori wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing && currentId) {
        await api.updateCategory(currentId, {
          category_name: categoryName,
          description,
        });
        success('Kategori Diperbarui', 'Data kategori berhasil diubah.');
      } else {
        await api.createCategory({
          category_name: categoryName,
          description,
        });
        success('Kategori Ditambahkan', 'Kategori baru berhasil dibuat.');
      }
      setShowModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Menyimpan', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Hapus kategori ini? Kategori yang memiliki produk tidak dapat dihapus.')) return;
    try {
      await api.deleteCategory(id);
      success('Kategori Dihapus', 'Kategori berhasil dihapus.');
      loadData();
    } catch (err: any) {
      error('Gagal Hapus', err.message);
    }
  };

  const columns: Column<Category>[] = [
    {
      header: 'Nama Kategori',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <Tag className="w-4 h-4 text-indigo-500" />
          <span className="font-bold text-slate-900 text-xs">{row.category_name}</span>
        </div>
      ),
    },
    {
      header: 'Deskripsi',
      accessor: (row) => <span className="text-xs text-slate-500">{row.description || '-'}</span>,
    },
    {
      header: 'Jumlah SKU Terhubung',
      accessor: (row) => (
        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
          <Boxes className="w-3.5 h-3.5 text-slate-400" />
          <span>{(row.product_count || 0).toLocaleString('id-ID')} Produk</span>
        </div>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          {(isAdmin || isManager) && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => openEdit(row)}
                icon={<Edit className="w-3.5 h-3.5" />}
              >
                Ubah
              </Button>
              <button
                onClick={() => handleDelete(row.category_id)}
                className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
                title="Hapus Kategori"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Kategori Master Produk</h2>
          <p className="text-xs text-slate-500">
            Pengelompokan klasifikasi SKU barang untuk memudahkan manajemen inventaris
          </p>
        </div>

        {(isAdmin || isManager) && (
          <Button
            variant="primary"
            size="md"
            onClick={openAdd}
            icon={<Plus className="w-4 h-4" />}
          >
            Tambah Kategori
          </Button>
        )}
      </div>

      <Card
        title="Daftar Kategori Produk"
        subtitle="Struktur taksonomi barang"
        padding={false}
      >
        <Table
          columns={columns}
          data={categories}
          isLoading={isLoading}
          emptyMessage="Belum ada data kategori terdaftar."
        />
      </Card>

      {/* Add / Edit Category Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={isEditing ? 'Ubah Informasi Kategori' : 'Tambah Kategori Baru'}
        subtitle="Kategori dinormalisasi menggunakan ID dan relasi Foreign Key"
        maxWidth="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Nama Kategori"
            placeholder="Elektronik / Bahan Baku / Suku Cadang"
            value={categoryName}
            onChange={(e) => setCategoryName(e.target.value)}
            required
          />

          <Input
            label="Deskripsi Kategori"
            placeholder="Deskripsi singkat mengenai jenis barang dalam kategori ini..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Kategori
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default CategoriesPage;
