import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import Button from './Button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary tertangkap:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex items-center justify-center bg-slate-100 p-6 font-sans">
          <div className="max-w-md w-full rounded-2xl bg-white p-8 text-center shadow-xl border border-slate-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
              <AlertTriangle className="h-7 w-7" />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900">
              Terjadi Kendala pada Antarmuka
            </h2>
            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Sistem mendeteksi galat visual sementara. Data operasional inventaris Anda tetap aman
              di basis data.
            </p>
            {this.state.error && (
              <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-left overflow-x-auto">
                <code className="text-[11px] font-mono text-rose-700 block">
                  {this.state.error.message}
                </code>
              </div>
            )}
            <div className="mt-6 flex justify-center">
              <Button
                variant="primary"
                size="md"
                onClick={this.handleReload}
                icon={<RotateCcw className="w-4 h-4" />}
              >
                Muat Ulang Aplikasi
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
