import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { MapPin, Plus, Trash2, Edit, Barcode as BarcodeIcon, Layers, Printer } from 'lucide-react';
import Card from '../components/common/Card';
import Button from '../components/common/Button';
import Input from '../components/common/Input';
import Badge from '../components/common/Badge';
import Table, { Column } from '../components/common/Table';
import Modal from '../components/common/Modal';
import ThermalLabel from '../components/common/ThermalLabel';
import api from '../services/api';
import { Location } from '../types';

export const LocationsPage: React.FC = () => {
  const { activeFacilityId, isAdmin, isManager } = useAuth();
  const { success, error } = useToast();

  const [locations, setLocations] = useState<Location[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modal & Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [selectedLabelLoc, setSelectedLabelLoc] = useState<Location | null>(null);
  const [zone, setZone] = useState('A');
  const [rack, setRack] = useState('01');
  const [tier, setTier] = useState('01');
  const [bin, setBin] = useState('01');
  const [capacity, setCapacity] = useState(100);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await api.getLocations(activeFacilityId);
      if (res.data) setLocations(res.data);
    } catch (err: any) {
      error('Gagal Memuat Lokasi', err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeFacilityId]);

  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createLocation({
        facility_id: activeFacilityId,
        zone,
        rack,
        tier,
        bin,
        capacity,
      });
      success('Lokasi Ditambahkan', `Rak bin ${zone}-${rack}-${tier}-${bin} berhasil didaftarkan.`);
      setShowAddModal(false);
      loadData();
    } catch (err: any) {
      error('Gagal Tambah Lokasi', err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLocation = async (id: number) => {
    if (!confirm('Hapus lokasi rak ini?')) return;
    try {
      await api.deleteLocation(id);
      success('Lokasi Dihapus', 'Lokasi rak berhasil dihapus.');
      loadData();
    } catch (err: any) {
      error('Gagal Hapus', err.message);
    }
  };

  const columns: Column<Location>[] = [
    {
      header: 'Barcode Lokasi',
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <BarcodeIcon className="w-4 h-4 text-slate-400" />
          <span className="font-mono text-xs font-bold text-slate-900">{row.barcode}</span>
        </div>
      ),
    },
    {
      header: 'Denah Rak',
      accessor: (row) => (
        <span className="text-xs font-semibold text-slate-800">
          Zona {row.zone} • Rak {row.rack} • Tingkat {row.tier} • Bin {row.bin}
        </span>
      ),
    },
    {
      header: 'Kapasitas Unit',
      accessor: (row) => (
        <span className="font-bold text-slate-700">
          {(row.capacity || 0).toLocaleString('id-ID')} Unit
        </span>
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
        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedLabelLoc(row);
              setShowLabelModal(true);
            }}
            icon={<Printer className="w-3.5 h-3.5" />}
            title="Cetak Label Rak"
          >
            Label
          </Button>
          {(isAdmin || isManager) && (
            <button
              onClick={() => handleDeleteLocation(row.location_id)}
              className="p-1.5 text-rose-500 hover:bg-rose-50 rounded"
              title="Hapus Lokasi"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Manajemen Lokasi & Denah Rak Bin</h2>
          <p className="text-xs text-slate-500">
            Penataan layout lorong, rak simpan, dan bin barang per fasilitas gudang
          </p>
        </div>

        {(isAdmin || isManager) && (
          <Button
            variant="primary"
            size="md"
            onClick={() => setShowAddModal(true)}
            icon={<Plus className="w-4 h-4" />}
          >
            Tambah Lokasi Rak
          </Button>
        )}
      </div>

      <Card
        title="Daftar Bin Lokasi Terdaftar"
        subtitle="Struktur denah penyimpanan barang"
        padding={false}
      >
        <Table
          columns={columns}
          data={locations}
          isLoading={isLoading}
          emptyMessage="Belum ada lokasi rak yang terdaftar pada fasilitas ini."
        />
      </Card>

      {/* Add Location Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Tambah Lokasi Rak Bin Baru"
        subtitle="Format barcode otomatis digenerate dari kombinasi zona, rak, tingkat, dan bin"
        maxWidth="md"
      >
        <form onSubmit={handleSaveLocation} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Zona Gudang"
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="A / B / C"
              required
            />
            <Input
              label="Nomor Rak"
              value={rack}
              onChange={(e) => setRack(e.target.value)}
              placeholder="01"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Tingkat / Tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              placeholder="01"
              required
            />
            <Input
              label="Nomor Bin"
              value={bin}
              onChange={(e) => setBin(e.target.value)}
              placeholder="01"
              required
            />
          </div>

          <Input
            label="Kapasitas Maksimal (Unit)"
            type="number"
            min={1}
            value={capacity}
            onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 100)}
            required
          />

          <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600">
            Preview Barcode:{' '}
            <strong className="font-mono text-indigo-600">
              LOC-{zone}-{rack}-{tier}-{bin}
            </strong>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
              Batal
            </Button>
            <Button type="submit" variant="primary" isLoading={isSubmitting}>
              Simpan Lokasi
            </Button>
          </div>
        </form>
      </Modal>

      {/* Location Barcode Thermal Label Modal */}
      <Modal
        isOpen={showLabelModal}
        onClose={() => {
          setShowLabelModal(false);
          setSelectedLabelLoc(null);
        }}
        title="Cetak Label Barcode Rak Bin"
        subtitle="Stiker barcode rak bin 50x30mm siap tempel di rak gudang"
        maxWidth="md"
      >
        {selectedLabelLoc && (
          <div className="py-2">
            <ThermalLabel
              title={`Rak Bin: ${selectedLabelLoc.zone}-${selectedLabelLoc.rack}-${selectedLabelLoc.tier}-${selectedLabelLoc.bin}`}
              barcode={selectedLabelLoc.barcode}
              subText={`Zona ${selectedLabelLoc.zone} • Kapasitas: ${(selectedLabelLoc.capacity || 0).toLocaleString('id-ID')} Unit`}
              extraInfo={[
                { label: 'Zona', value: selectedLabelLoc.zone },
                { label: 'Rak', value: selectedLabelLoc.rack },
                { label: 'Tingkat', value: selectedLabelLoc.tier },
                { label: 'Bin', value: selectedLabelLoc.bin },
              ]}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default LocationsPage;
