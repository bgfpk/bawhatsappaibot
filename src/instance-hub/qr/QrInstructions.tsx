import React from "react";
import { CheckCircle, QrCode, Smartphone } from "lucide-react";

export const QrInstructions: React.FC = () => {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-4 dark:border-blue-900/60 dark:bg-blue-950/40">
      <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-blue-900 dark:text-blue-200">
        <QrCode className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        <span>WhatsApp Pairing Instructions</span>
      </h4>
      <ol className="mt-3 space-y-2 text-xs font-medium text-blue-800 dark:text-blue-300">
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-black text-blue-900 dark:bg-blue-900 dark:text-blue-100">
            1
          </span>
          <span>Open WhatsApp on your phone</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-black text-blue-900 dark:bg-blue-900 dark:text-blue-100">
            2
          </span>
          <span>Tap Menu (⋮) or Settings &gt; Linked Devices</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-black text-blue-900 dark:bg-blue-900 dark:text-blue-100">
            3
          </span>
          <span>Tap Link a Device</span>
        </li>
        <li className="flex items-start gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-200 text-[10px] font-black text-blue-900 dark:bg-blue-900 dark:text-blue-100">
            4
          </span>
          <span>Point your camera at this QR code to scan</span>
        </li>
      </ol>
    </div>
  );
};
