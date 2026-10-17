import React from 'react';
import Auth from '../components/Auth';

interface Props {
  onLoginSuccess?: (userId: string) => void;
  appError?: string | null;
  appSuccess?: string | null;
}

export const PublicAuthApplication: React.FC<Props> = ({
  onLoginSuccess,
  appError,
  appSuccess,
}) => {
  return (
    <div className="min-h-screen bg-[#0B0F19] text-white">
      {appError && (
        <div
          role="alert"
          className="fixed top-4 right-4 z-50 p-4 bg-rose-500/10 border border-rose-500/20 text-rose-300 rounded-xl text-sm font-medium shadow-xl"
        >
          {appError}
        </div>
      )}
      {appSuccess && (
        <div
          role="status"
          className="fixed top-4 right-4 z-50 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 rounded-xl text-sm font-medium shadow-xl"
        >
          {appSuccess}
        </div>
      )}
      <Auth onLogin={onLoginSuccess} />

    </div>
  );
};
