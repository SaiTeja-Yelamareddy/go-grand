import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react';

export type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'loading';

export interface NotificationOptions {
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  dismissible?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}

interface Notification extends NotificationOptions {
  id: number;
}

interface NotificationContextValue {
  notify: (options: NotificationOptions) => number;
  dismiss: (id: number) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const styles: Record<NotificationType, { border: string; icon: React.ReactNode; title: string }> = {
  success: { border: 'border-l-emerald-400', icon: <CheckCircle2 size={19} />, title: 'text-emerald-300' },
  info: { border: 'border-l-blue-400', icon: <Info size={19} />, title: 'text-blue-300' },
  warning: { border: 'border-l-amber-400', icon: <AlertTriangle size={19} />, title: 'text-amber-300' },
  error: { border: 'border-l-red-400', icon: <AlertTriangle size={19} />, title: 'text-red-300' },
  loading: { border: 'border-l-neutral-400', icon: <LoaderCircle size={19} className="animate-spin" />, title: 'text-neutral-200' },
};

export const NotificationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const dismiss = useCallback((id: number) => {
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const notify = useCallback((options: NotificationOptions) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    const notification: Notification = {
      ...options,
      id,
      dismissible: options.dismissible ?? true,
    };
    setNotifications((current) => [...current, notification].slice(-4));
    if (options.duration !== 0) {
      window.setTimeout(() => dismiss(id), options.duration ?? (options.type === 'error' ? 0 : 4500));
    }
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({ notify, dismiss }), [dismiss, notify]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <div className="fixed top-16 sm:top-20 right-3 sm:right-5 z-[200] flex w-[calc(100vw-1.5rem)] max-w-[360px] flex-col gap-2 pointer-events-none" aria-live="polite">
        {notifications.map((notification) => {
          const style = styles[notification.type];
          return (
            <div
              key={notification.id}
              role={notification.type === 'error' ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border border-white/15 ${style.border} border-l-4 bg-[#111111] px-3.5 py-3 text-white shadow-lg animate-fade-in`}
            >
              <span className={`mt-0.5 shrink-0 ${style.title}`}>{style.icon}</span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-extrabold leading-tight ${style.title}`}>{notification.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-neutral-300 break-words">{notification.message}</p>
              </div>
              {notification.dismissible && (
                <button type="button" onClick={() => dismiss(notification.id)} className="shrink-0 rounded-md p-1 text-neutral-400 hover:bg-white/10 hover:text-white" aria-label="Dismiss notification">
                  <X size={15} />
                </button>
              )}
              {notification.actionLabel && notification.onAction && (
                <button type="button" onClick={() => { notification.onAction?.(); dismiss(notification.id); }} className="shrink-0 self-center rounded-md px-2 py-1 text-[11px] font-extrabold uppercase text-white hover:bg-white/10">
                  {notification.actionLabel}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotifications = (): NotificationContextValue => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotifications must be used inside NotificationProvider');
  return context;
};
