import React from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  Boxes,
  ArrowLeftRight,
  Truck,
  ShoppingCart,
  TrendingDown,
  MapPin,
  Users,
  FileSpreadsheet,
  Database,
  Building,
  Tag,
  Warehouse,
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const { user, isAdmin, isManager } = useAuth();

  const mainNav = [
    { id: 'dashboard', label: 'Ringkasan Dashboard', icon: LayoutDashboard },
    { id: 'products', label: 'Produk & Batch Stok', icon: Boxes },
    { id: 'movements', label: 'Mutasi & FEFO Out', icon: ArrowLeftRight },
    { id: 'transfers', label: 'Transfer Gudang', icon: Truck },
    { id: 'orders', label: 'Pesanan PO & SO', icon: ShoppingCart },
    { id: 'replenishment', label: 'Prediksi Reorder', icon: TrendingDown },
  ];

  const masterNav = [
    { id: 'locations', label: 'Lokasi & Rak Bin', icon: MapPin },
    { id: 'suppliers', label: 'Pemasok (Suppliers)', icon: Building },
    { id: 'categories', label: 'Kategori Produk', icon: Tag },
  ];

  const adminNav = [
    ...(isAdmin ? [{ id: 'users', label: 'Manajemen Pengguna', icon: Users }] : []),
    ...(isAdmin || isManager
      ? [{ id: 'reports', label: 'Laporan & Ekspor CSV', icon: FileSpreadsheet }]
      : []),
    ...(isAdmin ? [{ id: 'backups', label: 'Pencadangan & DB', icon: Database }] : []),
  ];

  return (
    <aside className="flex h-screen w-64 flex-col border-r border-slate-800 bg-navy-900 text-slate-300">
      {/* Brand Logo */}
      <div className="flex h-16 items-center gap-3 border-b border-slate-800/80 px-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-600 text-white shadow-md">
          <Warehouse className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <span className="font-extrabold tracking-tight text-white text-base">Supply</span>
            <span className="font-extrabold tracking-tight text-brand-500 text-base">Sync</span>
          </div>
          <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
            Enterprise WMS
          </span>
        </div>
      </div>

      {/* Nav Menu */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* Main Section */}
        <div>
          <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Operasional Pergudangan
          </span>
          <nav className="mt-2 space-y-1">
            {mainNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-xs border border-slate-700/60'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-brand-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Master Data Section */}
        <div>
          <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Master Data
          </span>
          <nav className="mt-2 space-y-1">
            {masterNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
                    isActive
                      ? 'bg-slate-800 text-white shadow-xs border border-slate-700/60'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-brand-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Administration Section */}
        {adminNav.length > 0 && (
          <div>
            <span className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Pengawasan & Administrasi
            </span>
            <nav className="mt-2 space-y-1">
              {adminNav.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectTab(item.id)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-semibold transition-all duration-150 ${
                      isActive
                        ? 'bg-slate-800 text-white shadow-xs border border-slate-700/60'
                        : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 transition-colors ${
                        isActive ? 'text-brand-500' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="border-t border-slate-800/80 p-4 bg-navy-950/60 text-xs">
        <div className="flex items-center justify-between text-slate-400">
          <span>Versi Sistem</span>
          <span className="font-mono text-brand-400 font-semibold">v1.1.0 (Enterprise)</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
