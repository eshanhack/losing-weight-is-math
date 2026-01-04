"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

export type ToastType = "success" | "error" | "info" | "warning" | "food" | "exercise" | "edit" | "delete" | "weight";

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType>({
  showToast: () => {},
});

export const useToast = () => useContext(ToastContext);

const TOAST_ICONS: Record<ToastType, string> = {
  success: "✅",
  error: "❌",
  info: "ℹ️",
  warning: "⚠️",
  food: "🍽️",
  exercise: "🏃",
  edit: "📝",
  delete: "🗑️",
  weight: "⚖️",
};

const TOAST_COLORS: Record<ToastType, string> = {
  success: "border-success/30 bg-success/10",
  error: "border-danger/30 bg-danger/10",
  info: "border-primary/30 bg-primary/10",
  warning: "border-gold/30 bg-gold/10",
  food: "border-primary/30 bg-primary/10",
  exercise: "border-success/30 bg-success/10",
  edit: "border-gold/30 bg-gold/10",
  delete: "border-danger/30 bg-danger/10",
  weight: "border-primary/30 bg-primary/10",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info", duration: number = 3000) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type, duration }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      
      {/* Toast Container - Bottom left on desktop, bottom center on mobile */}
      <div className="fixed bottom-4 left-4 right-4 lg:right-auto lg:w-80 z-[100] flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 50, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className={`pointer-events-auto flex items-center gap-3 p-4 rounded-xl border backdrop-blur-sm shadow-lg ${TOAST_COLORS[toast.type]}`}
              onClick={() => removeToast(toast.id)}
            >
              <span className="text-xl shrink-0">{TOAST_ICONS[toast.type]}</span>
              <p className="text-sm text-foreground flex-1">{toast.message}</p>
              <button 
                className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                onClick={(e) => { e.stopPropagation(); removeToast(toast.id); }}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}



