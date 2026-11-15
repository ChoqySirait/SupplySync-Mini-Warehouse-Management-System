import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/common/Toast';
import { Warehouse, ShieldCheck, Lock, User as UserIcon } from 'lucide-react';
import Input from '../components/common/Input';
import Button from '../components/common/Button';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { error, success } = useToast();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier || !password) {
      error('Validasi Gagal', 'Harap isi nama pengguna / email dan kata sandi.');
      return;
    }

    setIsLoading(true);
    try {
      const isEmail = identifier.includes('@');
      await login({
        [isEmail ? 'email' : 'username']: identifier,
        password,
      });
      success('Selamat Datang', 'Autentikasi berhasil. Mengarahkan ke dashboard...');
    } catch (err: any) {
      error('Autentikasi Gagal', err.message || 'Nama pengguna atau kata sandi tidak valid.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-screen items-center justify-center bg-slate-100 p-4 font-sans">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl border border-slate-200">
        {/* Brand Header */}
        <div className="bg-navy-900 px-8 py-8 text-center text-white">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-600 shadow-lg">
            <Warehouse className="h-7 w-7 text-white" />
          </div>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight">
            Supply<span className="text-brand-500">Sync</span>
          </h2>
          <p className="mt-1 text-xs text-slate-400 font-medium tracking-wide uppercase">
            Enterprise Warehouse Management System
          </p>
        </div>

        {/* Form Body */}
        <div className="p-8">
          <div className="mb-6">
            <h3 className="text-base font-bold text-slate-900">Masuk ke Sistem</h3>
            <p className="text-xs text-slate-500 mt-1">
              Gunakan kredensial resmi pergudangan yang telah terdaftar.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Nama Pengguna atau Email"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="admin atau admin@supplysync.local"
              leftIcon={<UserIcon className="w-4 h-4" />}
              required
            />

            <Input
              label="Kata Sandi"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-4 h-4" />}
              required
            />

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full mt-2"
              isLoading={isLoading}
            >
              Masuk ke Aplikasi
            </Button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-3.5 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Sistem ini dilindungi dengan enkripsi kata sandi berbasis NIST scrypt dan otentikasi
              JWT anti-tampering. Seluruh aktivitas audit mutasi dicatat secara real-time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
