import React from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

interface LayoutProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ currentTab, onSelectTab, children }) => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 font-sans">
      <Sidebar currentTab={currentTab} onSelectTab={onSelectTab} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header currentTab={currentTab} />
        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <div className="mx-auto max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
