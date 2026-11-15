import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import {
  Boxes,
  Plus,
  Upload,
  Search,
  Filter,
  Eye,
  Edit,
  AlertTriangle,
  Barcode as BarcodeIcon,
} from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import api from '../services/api';
import { Product, Category, InventoryBatch } from '../types';

export const ProductsPage: React.FC = () => {
  const { activeFacilityId, isAdmin, isManager } = useAuth();
  const { success, error } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Form State
  const [productId, setProductId] = useState('');
  const [productName, setProductName] = useState('');
  const [categoryId, setCategoryId] = useState<number | undefined>();
  const [unit, setUnit] = useState('PCS');
  const [minStock, setMinStock] = useState(10);
  const [costPrice, setCostPrice] = useState(0);
  const [salePrice, setSalePrice] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [csvContent, setCsvContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [prodRes, catRes] = await Promise.all([
        api.getProducts({
          search: searchTerm || undefined,
          category_id: selectedCategory || undefined,
          facility_id: activeFacilityId,
        }),
        api.getCategories(),
      ]);
      if (prodRes.data) setProducts(prodRes.data);
      if (catRes.data) setCategories(catRes.data);
    } catch (err: any) {
      error('Gagal Memuat Produk', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId, selectedCategory]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    loadData();
  };

  const openAddModal = () => {
    setIsEditing(false);
    setProductId('');
    setProductName('');
    setCategoryId(categories[0]?.category_id);
    setUnit('PCS');
    setMinStock(10);
    setCostPrice(0);
    setSalePrice(0);
    setShowAddModal(true);
  };

  const openEditModal = (p: Product) => {
    setIsEditing(true);
    setProductId(p.product_id);
    setProductName(p.product_name);
    setCategoryId(p.category_id);
    setUnit(p.unit || 'PCS');
    setMinStock(p.min_stock || 0);
    setCostPrice(p.cost_price || 0);
    setSalePrice(p.sale_price || 0);
    setShowAddModal(true);
  };

  const openBatchModal = async (p: Product) => {
    setSelectedProduct(p);
    try {
      const res = await api.getProductById(p.product_id);
      if (res.data) {
        setSelectedProduct(res.data);
      }
    } catch (err: any) {
      error('Gagal Memuat Detail Batch', err.message);
    }
    setShowBatchModal(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!productId || !productName) {
      error('Validasi Gagal', 'SKU dan Nama Produk wajib diisi.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        await api.updateProduct(productId, {
          product_name: productName,
          category_id: categoryId,
          unit,
          min_stock: minStock,
          cost_price: costPrice,
          sale_price: salePrice,
        });
        success('Berhasil', 'Data produk berhasil diperbarui.');
      } else {
        await api.createProduct({
          product_id: productId,
          product_name: productName,
          category_id: categoryId,
          unit,
          min_stock: minStock,
          cost_price: costPrice,
          sale_price: salePrice,
        });
        success('Berhasil', 'Produk baru berhasil ditambahkan.');
      }
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Menyimpan Produk', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleImportCsv = async () => {
    if (!csvContent.trim()) {
      error('Validasi Gagal', 'Data CSV tidak boleh kosong.');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await api.importProductsCsv(csvContent);
      success('Impor Selesai', res.message || 'Data produk berhasil diimpor.');
      setShowImportModal(false);
      setCsvContent('');
      loadData();
    } catch (err: any) {
      error('Gagal Impor CSV', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const columns: Column<Product>[] = [
    {
      header: 'SKU / Barcode',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <BarcodeIcon className="w-4 h-4 text-slate-400" />
          <span className="font-mono text-xs font-bold text-slate-900">{row.product_id}</span>
        </div>
      ),
    },
    {
      header: 'Nama Produk',
      accessor: (row) => (
        <div>
          <span className="font-bold text-slate-900 text-xs">{row.product_name}</span>
          <span className="block text-[11px] text-slate-400">
            {row.category_name || 'Tanpa Kategori'}
          </span>
        </div>
      ),
    },
    {
      header: 'Stok Tersedia',
      accessor: (row) => {
        const stock = row.facility_stock !== undefined ? row.facility_stock : row.total_stock;
        const isLow = stock <= (row.min_stock || 0);
        return (
          <div className="flex items-center gap-2">
            <span
              className={`font-mono text-xs font-bold ${
                isLow ? 'text-amber-600' : 'text-slate-900'
              }`}
            >
              {stock.toLocaleString('id-ID')} {row.unit}
            </span>
            {isLow && (
              <Badge variant="warning" size="sm">
                <AlertTriangle className="w-3 h-3" /> Rendah
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      header: 'Batas Min',
      accessor: (row) => (
        <span className="text-xs text-slate-500">
          {(row.min_stock || 0).toLocaleString('id-ID')} {row.unit}
        </span>
      ),
    },
    {
      header: 'Harga Pokok / Jual',
      accessor: (row) => (
        <div className="text-xs">
          <span className="text-slate-500">
            Beli: Rp {(row.cost_price || 0).toLocaleString('id-ID')}
          </span>
          <span className="block font-semibold text-slate-800">
            Jual: Rp {(row.sale_price || 0).toLocaleString('id-ID')}
          </span>
        </div>
      ),
    },
    {
      header: 'Aksi',
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => openBatchModal(row)}
            icon={<Eye className="w-3.5 h-3.5" />}
          >
            Batch
          </Button>
          {(isAdmin || isManager) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openEditModal(row)}
              icon={<Edit className="w-3.5 h-3.5" />}
            >
              Edit
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Katalog Produk & Inventaris</h2>
          <p className="text-xs text-slate-500">
            Total {products.length} SKU terdaftar dalam sistem
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(isAdmin || isManager) && (
            <>
              <Button
                variant="secondary"
                size="md"
                onClick={() => setShowImportModal(true)}
                icon={<Upload className="w-4 h-4" />}
              >
                Impor CSV
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={openAddModal}
                icon={<Plus className="w-4 h-4" />}
              >
                Tambah Produk
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <Card padding={false} className="p-4">
        <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1">
            <Input
              placeholder="Cari berdasarkan SKU atau Nama Produk..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              leftIcon={<Search className="w-4 h-4" />}
            />
          </div>

          <div className="w-full sm:w-56">
            <select
              value={selectedCategory || ''}
              onChange={(e) =>
                setSelectedCategory(e.target.value ? parseInt(e.target.value, 10) : undefined)
              }
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c.category_id} value={c.category_id}>
                  {c.category_name}
                </option>
              ))}
            </select>
          </div>

          <Button type="submit" variant="secondary" size="md">
            Filter
          </Button>
        </form>
      </Card>

      {/* Product Table */}
      <Table
        columns={columns}
        data={products}
        isLoading={isLoading}
        emptyMessage="Tidak ada produk ditemukan sesuai filter."
      />

      {/* Add / Edit Product Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={isEditing ? 'Ubah Informasi Produk' : 'Tambah Produk Baru'}
        subtitle="Masukkan parameter spesifikasi SKU produk secara akurat"
        maxWidth="lg"
      >
        <form onSubmit={handleSaveProduct} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Kode SKU Produk"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              placeholder="PRD-ELEC-001"
              disabled={isEditing}
              required
            />
            <div className="space-y-1.5 text-left">
              <label className="block text-xs font-semibold text-slate-700">Kategori</label>
              <select
                value={categoryId || ''}
                onChange={(e) =>
                  setCategoryId(e.target.value ? parseInt(e.target.value, 10) : undefined)
                }
                className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
              >
                <option value="">Pilih Kategori</option>
                {categories.map((c) => (
                  <option key={c.category_id} value={c.category_id}>
                    {c.category_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Nama Lengkap Produk"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            placeholder="Contoh: Monitor LED 24 Inch IPS"
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Satuan (Unit)"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="PCS, BOX, KG"
              required
            />
            <Input
              label="Batas Minimum Stok"
              type="number"
              value={minStock}
              onChange={(e) => setMinStock(parseInt(e.target.value, 10) || 0)}
              required
            />
            <Input
              label="Harga Pokok (Rp)"
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(parseFloat(e.target.value) || 0)}
            />
          </div>

          <Input
            label="Harga Jual Rekomendasi (Rp)"
            type="number"
            value={salePrice}
            onChange={(e) => setSalePrice(parseFloat(e.target.value) || 0)}
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Produk
            </Button>
          </div>
        </form>
      </Modal>

      {/* Batch Details Modal */}
      <Modal
        isOpen={showBatchModal}
        onClose={() => setShowBatchModal(false)}
        title={`Rincian Batch Stok: ${selectedProduct?.product_name || ''}`}
        subtitle={`SKU: ${selectedProduct?.product_id} • Sumber kebenaran stok berbasis batch FEFO`}
        maxWidth="4xl"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 p-3 bg-slate-50 rounded-xl text-center">
            <div>
              <span className="text-[11px] text-slate-500">Total Unit Aktif</span>
              <p className="font-bold text-sm text-slate-900">
                {selectedProduct?.batches
                  ?.reduce((acc, b) => acc + (b.quantity || 0), 0)
                  .toLocaleString('id-ID') || 0}{' '}
                {selectedProduct?.unit}
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Jumlah Batch</span>
              <p className="font-bold text-sm text-indigo-600">
                {selectedProduct?.batches?.length || 0} Batch
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate-500">Status Stok</span>
              <p className="font-bold text-sm text-emerald-600">Tersedia</p>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100/80 font-bold text-slate-600 border-b border-slate-200">
                  <th className="p-3">Kode Batch</th>
                  <th className="p-3">Lokasi Rak</th>
                  <th className="p-3 text-right">Stok Sisa</th>
                  <th className="p-3">Tgl Penerimaan</th>
                  <th className="p-3">Tgl Kedaluwarsa</th>
                  <th className="p-3">Sisa Hari</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {selectedProduct?.batches && selectedProduct.batches.length > 0 ? (
                  selectedProduct.batches.map((b) => {
                    const isExp =
                      b.days_to_expiry !== undefined && b.days_to_expiry <= 0;
                    const isNear =
                      b.days_to_expiry !== undefined &&
                      b.days_to_expiry > 0 &&
                      b.days_to_expiry <= 30;

                    return (
                      <tr key={b.batch_id} className="hover:bg-slate-50">
                        <td className="p-3 font-mono font-bold text-slate-900">{b.batch_code}</td>
                        <td className="p-3 font-mono">{b.location_code || 'Gudang Terbuka'}</td>
                        <td className="p-3 text-right font-bold text-slate-900">
                          {b.quantity.toLocaleString('id-ID')}
                        </td>
                        <td className="p-3">
                          {b.received_date ? b.received_date.split('T')[0] : '-'}
                        </td>
                        <td className="p-3 font-semibold text-slate-800">
                          {b.expired_date ? b.expired_date.split('T')[0] : '-'}
                        </td>
                        <td className="p-3">
                          {isExp ? (
                            <Badge variant="danger" size="sm">
                              Expired
                            </Badge>
                          ) : isNear ? (
                            <Badge variant="warning" size="sm">
                              {b.days_to_expiry} Hari
                            </Badge>
                          ) : (
                            <Badge variant="success" size="sm">
                              {b.days_to_expiry ?? '-'} Hari
                            </Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="p-6 text-center text-slate-400 italic">
                      Tidak ada batch stok aktif untuk produk ini di fasilitas saat ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={() => setShowBatchModal(false)}>
              Tutup Rincian
            </Button>
          </div>
        </div>
      </Modal>

      {/* CSV Import Modal */}
      <Modal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        title="Impor Master Produk via CSV"
        subtitle="Format header: product_id,product_name,category_name,unit,min_stock,cost_price,sale_price"
        maxWidth="2xl"
      >
        <div className="space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            Tempelkan konten file CSV atau ketik langsung daftar produk Anda. Baris pertama harus
            berisi nama header yang sesuai standar SupplySync.
          </p>

          <textarea
            rows={8}
            className="w-full font-mono text-xs p-3 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-400"
            placeholder={`product_id,product_name,category_name,unit,min_stock,cost_price,sale_price\nPRD-001,Kopi Arabika 250g,Minuman,PCS,10,45000,65000\nPRD-002,Teh Melati Premium,Minuman,PCS,20,15000,25000`}
            value={csvContent}
            onChange={(e) => setCsvContent(e.target.value)}
          />

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <Button variant="secondary" onClick={() => setShowImportModal(false)}>
              Batal
            </Button>
            <Button
              variant="primary"
              onClick={handleImportCsv}
              isLoading={isSubmitting}
              icon={<Upload className="w-4 h-4" />}
            >
              Proses Impor
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ProductsPage;
