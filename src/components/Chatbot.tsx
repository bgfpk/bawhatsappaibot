import React, { useState, useEffect } from 'react';
import { Lightbulb } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function Chatbot({ compact = false }: { compact?: boolean }) {
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    // Show tooltip after a small delay
    const timer = setTimeout(() => setShowTooltip(true), 2000);
    // Hide it again after a while to not be annoying
    const hideTimer = setTimeout(() => setShowTooltip(false), 10000);
    return () => { clearTimeout(timer); clearTimeout(hideTimer); };
  }, []);

  return (
    <div className={`fixed z-[9999] flex flex-col items-end pointer-events-none ${compact ? "bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))]" : "bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.5rem,env(safe-area-inset-right))]"}`}>
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.9 }}
            className="mb-3 bg-white dark:bg-neutral-900 text-gray-800 dark:text-neutral-200 p-3 rounded-2xl rounded-br-none shadow-xl border border-gray-100 dark:border-neutral-800/50 flex items-start gap-3 max-w-[250px] pointer-events-auto relative"
          >
            <div className="bg-amber-100 dark:bg-amber-900/60 p-1.5 rounded-full text-amber-600 shrink-0 mt-0.5">
               <Lightbulb className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-bold m-0 leading-tight">Need help?</p>
              <p className="text-xs text-gray-500 dark:text-neutral-500 mt-0.5 leading-snug">Tap here to chat with us directly on WhatsApp!</p>
            </div>
            <button onClick={() => setShowTooltip(false)} className="absolute top-1 right-1 text-gray-400 dark:text-neutral-600 hover:text-gray-600 dark:text-neutral-400 p-1">
               <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <a
        href="https://wa.me/923136923129"
        target="_blank"
        rel="noopener noreferrer"
        onMouseEnter={() => setShowTooltip(true)}
        aria-label="Chat with BlackArrow support on WhatsApp"
        className={`pointer-events-auto bg-[#148f4d] hover:bg-[#0f7f43] text-white rounded-full transition-colors active:scale-95 flex flex-col items-center justify-center relative overflow-hidden group ${compact ? "h-11 w-11" : "h-14 w-14"}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width={compact ? 22 : 28} height={compact ? 22 : 28} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.888-.788-1.487-1.761-1.663-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
        </svg>
      </a>
    </div>
  );
}
