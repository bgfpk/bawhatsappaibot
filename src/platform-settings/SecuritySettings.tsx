import React, { useState } from "react";
import { ShieldCheck, Key, Lock, CheckCircle2, AlertTriangle, QrCode } from "lucide-react";
import { Dialog } from "../design-system/primitives/Overlays";
import type { SecurityConfig } from "./platform-model";

interface Props {
  security?: SecurityConfig;
  onToggle2FA?: (enable: boolean) => Promise<{ success: boolean; secret?: string; qrCodeUrl?: string }>;
  onVerify2FA?: (otp: string, enable: boolean) => Promise<{ success: boolean; message?: string }>;
  onChangePassword?: (oldPass: string, newPass: string) => Promise<{ success: boolean; message?: string }>;
  formatDate?: (ts: any) => string;
}

export const SecuritySettings: React.FC<Props> = ({
  security = {
    isTwoFaEnabled: undefined,
    lastPasswordChange: undefined,
  },
  onToggle2FA,
  onVerify2FA,
  onChangePassword,
  formatDate = (ts) => (ts ? String(ts) : ""),
}) => {
  const [is2FaOpen, setIs2FaOpen] = useState(false);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [isToggling2FA, setIsToggling2FA] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);

  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isChangingPass, setIsChangingPass] = useState(false);
  const [passResult, setPassResult] = useState<{ success: boolean; message?: string } | null>(null);

  const handleStart2FA = async () => {
    if (!onToggle2FA) return;
    setIsToggling2FA(true);
    setOtpError(null);
    try {
      const res = await onToggle2FA(!security.isTwoFaEnabled);
      if (res.secret) {
        setSetupSecret(res.secret);
        if (res.qrCodeUrl) setQrCodeUrl(res.qrCodeUrl);
        setIs2FaOpen(true);
      }
    } finally {
      setIsToggling2FA(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim() || !onVerify2FA) return;
    setIsVerifyingOtp(true);
    setOtpError(null);
    try {
      const res = await onVerify2FA(otpCode.trim(), true);
      if (res.success) {
        setIs2FaOpen(false);
        setSetupSecret(null);
        setQrCodeUrl(null);
        setOtpCode("");
      } else {
        setOtpError(res.message || "Invalid OTP code");
      }
    } catch (err: any) {
      setOtpError(err.message || "OTP verification failed");
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handlePassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPassword || !newPassword || newPassword !== confirmPassword || !onChangePassword) return;

    setIsChangingPass(true);
    setPassResult(null);
    try {
      const res = await onChangePassword(oldPassword, newPassword);
      setPassResult(res);
      if (res.success) {
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      }
    } catch (err: any) {
      setPassResult({ success: false, message: err.message || "Failed to update password." });
    } finally {
      setIsChangingPass(false);
    }
  };

  const isUnknown = security.isTwoFaEnabled === undefined;
  const isEnabled = security.isTwoFaEnabled === true;

  return (
    <div className="space-y-6">
      {/* 2FA Card */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Two-Factor Authentication (2FA)</h3>
                <span
                  className={`inline-block px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                    isUnknown
                      ? "bg-gray-500/10 text-gray-500"
                      : isEnabled
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-amber-500/10 text-amber-500"
                  }`}
                >
                  {isUnknown ? "Unknown" : isEnabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Add an extra layer of security using Google Authenticator or TOTP app.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStart2FA}
            disabled={isToggling2FA || !onToggle2FA}
            className="ca-button-primary text-xs shrink-0 disabled:opacity-50"
          >
            {isEnabled ? "Manage 2FA" : "Enable 2FA"}
          </button>
        </div>
      </div>

      {/* Password Management */}
      <div className="rounded-2xl border border-[var(--ca-border-subtle)] bg-[var(--ca-bg-surface)] p-6 shadow-sm max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
              <Key className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[var(--ca-text-primary)]">Account Password</h3>
              <p className="text-xs text-[var(--ca-text-secondary)] mt-0.5">
                Last changed: {security.lastPasswordChange ? formatDate(security.lastPasswordChange) : "Not recorded"}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsPasswordOpen(true)}
            disabled={!onChangePassword}
            className="ca-button-secondary text-xs shrink-0 disabled:opacity-50"
          >
            Change Password
          </button>
        </div>
      </div>

      {/* 2FA Setup Modal */}
      <Dialog
        isOpen={is2FaOpen}
        onClose={() => {
          setIs2FaOpen(false);
          setSetupSecret(null);
          setQrCodeUrl(null);
          setOtpCode("");
          setOtpError(null);
        }}
        title="Two-Factor Authentication Setup"
      >
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="p-4 rounded-xl bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] text-center space-y-3">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="2FA QR Code" className="w-32 h-32 mx-auto rounded-lg border border-[var(--ca-border-subtle)]" />
            ) : (
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-500">
                <QrCode className="w-10 h-10" />
              </div>
            )}
            <p className="text-xs text-[var(--ca-text-secondary)] font-medium">
              Scan this secret key in your Authenticator app (Google Authenticator, Authy, or 1Password):
            </p>
            {setupSecret ? (
              <div className="p-2 rounded-lg bg-[var(--ca-bg-surface)] border border-[var(--ca-border-subtle)] font-mono font-bold text-sm text-[var(--ca-text-primary)] tracking-widest inline-block select-all">
                {setupSecret}
              </div>
            ) : (
              <div className="p-2 text-xs text-[var(--ca-text-muted)] italic">
                Secret unavailable. Please try again.
              </div>
            )}
          </div>

          {setupSecret && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--ca-text-primary)] block">
                Enter 6-Digit Authenticator Code to Confirm *
              </label>
              <input
                type="text"
                maxLength={6}
                placeholder="123456"
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ""))}
                className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-sm font-mono text-center tracking-widest text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
              />
              {otpError && (
                <p className="text-xs font-medium text-red-500">{otpError}</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => {
                setIs2FaOpen(false);
                setSetupSecret(null);
                setQrCodeUrl(null);
                setOtpCode("");
                setOtpError(null);
              }}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isVerifyingOtp || !otpCode.trim() || otpCode.trim().length !== 6 || !onVerify2FA}
              className="ca-button-primary text-xs disabled:opacity-50"
            >
              {isVerifyingOtp ? "Verifying..." : "Verify & Enable 2FA"}
            </button>
          </div>
        </form>
      </Dialog>

      {/* Password Change Dialog */}
      <Dialog
        isOpen={isPasswordOpen}
        onClose={() => {
          setIsPasswordOpen(false);
          setPassResult(null);
        }}
        title="Change Account Password"
      >
        <form onSubmit={handlePassSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Current Password *
            </label>
            <input
              type="password"
              required
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              New Password *
            </label>
            <input
              type="password"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[var(--ca-text-primary)] block mb-1">
              Confirm New Password *
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-[var(--ca-bg-hover)] border border-[var(--ca-border-subtle)] rounded-xl px-3 py-2 text-xs font-mono text-[var(--ca-text-primary)] outline-none focus:border-[var(--ca-brand)]"
            />
          </div>

          {passResult && (
            <div className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              passResult.success ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500"
            }`}>
              {passResult.success ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
              {passResult.message}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsPasswordOpen(false)}
              className="ca-button-secondary text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isChangingPass || !oldPassword || !newPassword || newPassword !== confirmPassword}
              className="ca-button-primary text-xs"
            >
              {isChangingPass ? "Updating..." : "Update Password"}
            </button>
          </div>
        </form>
      </Dialog>
    </div>
  );
};
