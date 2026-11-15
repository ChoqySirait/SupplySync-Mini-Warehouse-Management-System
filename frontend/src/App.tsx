import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/common/Toast';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import StockMovementsPage from './pages/StockMovementsPage';
import TransfersPage from './pages/TransfersPage';
import OrdersPage from './pages/OrdersPage';
import StockOpnamePage from './pages/StockOpnamePage';
import LocationsPage from './pages/LocationsPage';
import SuppliersPage from './pages/SuppliersPage';
import CategoriesPage from './pages/CategoriesPage';
import UsersPage from './pages/UsersPage';
import ReportsPage from './pages/ReportsPage';
import ReplenishmentPage from './pages/ReplenishmentPage';
import BackupsPage from './pages/BackupsPage';
import { Warehouse } from 'lucide-react';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, isAdmin, isManager } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');

  if (isLoading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-slate-900 text-white font-sans">
        <div className="flex h-14 w-14 animate-bounce items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 shadow-xl">
          <Warehouse className="h-7 w-7 text-white" />
        </div>
        <p className="mt-4 text-sm font-semibold tracking-wide text-slate-300">
          Memuat Sistem SupplySync...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const renderActivePage = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardPage />;
      case 'products':
        return <ProductsPage />;
      case 'movements':
        return <StockMovementsPage />;
      case 'transfers':
        return <TransfersPage />;
      case 'orders':
        return <OrdersPage />;
      case 'replenishment':
        return <ReplenishmentPage />;
      case 'locations':
        return <LocationsPage />;
      case 'suppliers':
        return <SuppliersPage />;
      case 'categories':
        return <CategoriesPage />;
      case 'users':
        return isAdmin ? <UsersPage /> : <DashboardPage />;
      case 'reports':
        return isAdmin || isManager ? <ReportsPage /> : <DashboardPage />;
      case 'backups':
        return isAdmin ? <BackupsPage /> : <DashboardPage />;
      default:
        return <DashboardPage />;
    }
  };

  return (
    <Layout currentTab={currentTab} onSelectTab={setCurrentTab}>
      {renderActivePage()}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;
