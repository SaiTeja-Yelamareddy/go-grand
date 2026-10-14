import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, LoaderCircle, WifiOff, X } from 'lucide-react';

export type NotificationType =
  | 'success'
  | 'info'
  | 'warning'
  | 'error'
  | 'loading'
  | 'whatsapp-sending'
  | 'whatsapp-sent'
  | 'whatsapp-failed'
  | 'whatsapp-unconfirmed'
  | 'whatsapp-disconnected';

export type WhatsAppNotificationState =
  | 'sending'
  | 'sent'
  | 'failed'
  | 'unconfirmed'
  | 'disconnected';

export interface NotificationOptions {
  id?: string;
  type: NotificationType;
  title: string;
  message: string;
  duration?: number;
  dismissible?: boolean;
  actionLabel?: string;
  onAction?: () => void;
  timestamp?: number;
}

interface Notification extends NotificationOptions {
  id: string;
  timestamp: number;
}

export interface WhatsAppNotificationOverrides {
  title?: string;
  description?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

interface NotificationContextValue {
  notify: (options: NotificationOptions) => string;
  update: (id: string, options: Partial<NotificationOptions>) => void;
  dismiss: (id: string) => void;
  notifyWhatsAppState: (
    state: WhatsAppNotificationState,
    existingId?: string,
    customOverrides?: WhatsAppNotificationOverrides
  ) => string;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

const NOTIFICATION_CONFIGS: Record<
  NotificationType,
  {
    border: string;
    iconBg: string;
    icon: React.ReactNode;
    titleColor: string;
  }
> = {
  success: {
    border: 'border-l-emerald-500 dark:border-l-emerald-400',
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400',
    icon: <CheckCircle2 size={18} />,
    titleColor: 'text-emerald-900 dark:text-emerald-300',
  },
  info: {
    border: 'border-l-blue-500 dark:border-l-blue-400',
    iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400',
    icon: <Info size={18} />,
    titleColor: 'text-blue-900 dark:text-blue-300',
  },
  warning: {
    border: 'border-l-amber-500 dark:border-l-amber-400',
    iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400',
    icon: <AlertTriangle size={18} />,
    titleColor: 'text-amber-900 dark:text-amber-300',
  },
  error: {
    border: 'border-l-rose-500 dark:border-l-rose-400',
    iconBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400',
    icon: <AlertCircle size={18} />,
    titleColor: 'text-rose-900 dark:text-rose-300',
  },
  loading: {
    border: 'border-l-blue-500 dark:border-l-blue-400',
    iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400',
    icon: <LoaderCircle size={18} className="animate-spin" />,
    titleColor: 'text-slate-900 dark:text-slate-200',
  },
  'whatsapp-sending': {
    border: 'border-l-blue-500 dark:border-l-blue-400',
    iconBg: 'bg-blue-100 text-blue-600 dark:bg-blue-950/70 dark:text-blue-400',
    icon: <LoaderCircle size={18} className="animate-spin" />,
    titleColor: 'text-slate-900 dark:text-slate-100',
  },
  'whatsapp-sent': {
    border: 'border-l-emerald-500 dark:border-l-emerald-400',
    iconBg: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/70 dark:text-emerald-400',
    icon: <CheckCircle2 size={18} />,
    titleColor: 'text-emerald-900 dark:text-emerald-300',
  },
  'whatsapp-failed': {
    border: 'border-l-rose-500 dark:border-l-rose-400',
    iconBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400',
    icon: <AlertCircle size={18} />,
    titleColor: 'text-rose-900 dark:text-rose-300',
  },
  'whatsapp-unconfirmed': {
    border: 'border-l-amber-500 dark:border-l-amber-400',
    iconBg: 'bg-amber-100 text-amber-600 dark:bg-amber-950/70 dark:text-amber-400',
    icon: <AlertTriangle size={18} />,
    titleColor: 'text-amber-900 dark:text-amber-300',
  },
  'whatsapp-disconnected': {
    border: 'border-l-rose-600 dark:border-l-rose-500',
    iconBg: 'bg-rose-100 text-rose-600 dark:bg-rose-950/70 dark:text-rose-400',
    icon: <WifiOff size={18} />,
    titleColor: 'text-rose-900 dark:text-rose-300',
  },
};

export const NotificationProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const timersRef = useRef<Map<string, number>>(new Map());

  const dismiss = useCallback((id: string) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }
    setNotifications((current) => current.filter((notification) => notification.id !== id));
  }, []);

  const update = useCallback((id: string, options: Partial<NotificationOptions>) => {
    // Clear previous timer for this notification if duration is being changed or specified
    const existingTimer = timersRef.current.get(id);
    if (existingTimer) {
      window.clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }

    setNotifications((current) =>
      current.map((n) => {
        if (n.id !== id) return n;
        const updated: Notification = {
          ...n,
          ...options,
          id,
          timestamp: Date.now(),
        };
        return updated;
      })
    );

    const targetDuration =
      options.duration !== undefined
        ? options.duration
        : options.type === 'error' ||
          options.type === 'whatsapp-failed' ||
          options.type === 'whatsapp-disconnected'
        ? 6500
        : options.type === 'whatsapp-unconfirmed' || options.type === 'warning'
        ? 7500
        : options.type === 'loading' || options.type === 'whatsapp-sending'
        ? 0
        : 4500;

    if (targetDuration > 0) {
      const timer = window.setTimeout(() => dismiss(id), targetDuration);
      timersRef.current.set(id, timer);
    }
  }, [dismiss]);

  const notify = useCallback(
    (options: NotificationOptions): string => {
      // 1. Prevent duplicate identical notifications within short timeframe
      const existingDuplicate = notifications.find(
        (n) => n.title === options.title && n.message === options.message
      );
      if (existingDuplicate && !options.id) {
        // Refresh timestamp of existing notification rather than stacking duplicate
        update(existingDuplicate.id, { timestamp: Date.now() });
        return existingDuplicate.id;
      }

      const id = options.id || `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

      // If notification already exists with this ID, update in-place
      const exists = notifications.some((n) => n.id === id);
      if (exists) {
        update(id, options);
        return id;
      }

      const notification: Notification = {
        ...options,
        id,
        dismissible: options.dismissible ?? true,
        timestamp: options.timestamp ?? Date.now(),
      };

      setNotifications((current) => [...current, notification].slice(-4));

      const defaultDuration =
        options.type === 'error' ||
        options.type === 'whatsapp-failed' ||
        options.type === 'whatsapp-disconnected'
          ? 6500
          : options.type === 'warning' || options.type === 'whatsapp-unconfirmed'
          ? 7500
          : options.type === 'loading' || options.type === 'whatsapp-sending'
          ? 0
          : 4500;

      const duration = options.duration !== undefined ? options.duration : defaultDuration;
      if (duration > 0) {
        const timer = window.setTimeout(() => dismiss(id), duration);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    [dismiss, notifications, update]
  );

  /**
   * Helper that produces the exact required titles and descriptions for WhatsApp send lifecycle
   */
  const notifyWhatsAppState = useCallback(
    (
      state: WhatsAppNotificationState,
      existingId?: string,
      customOverrides?: WhatsAppNotificationOverrides
    ): string => {
      const id = existingId || `wa_notif_${Date.now()}`;
      const customMessage = customOverrides?.description || customOverrides?.message;

      switch (state) {
        case 'sending':
          notify({
            id,
            type: 'whatsapp-sending',
            title: customOverrides?.title || 'Sending WhatsApp Message',
            message: customMessage || 'Sending your message. Please wait...',
            duration: customOverrides?.duration !== undefined ? customOverrides.duration : 0,
            dismissible: false,
            actionLabel: customOverrides?.actionLabel,
            onAction: customOverrides?.onAction,
          });
          break;
        case 'sent':
          update(id, {
            type: 'whatsapp-sent',
            title: customOverrides?.title || 'Message Sent',
            message: customMessage || 'WhatsApp accepted the message for sending.',
            duration: customOverrides?.duration !== undefined ? customOverrides.duration : 4500,
            dismissible: true,
            actionLabel: customOverrides?.actionLabel,
            onAction: customOverrides?.onAction,
          });
          break;
        case 'failed':
          update(id, {
            type: 'whatsapp-failed',
            title: customOverrides?.title || 'Message Not Sent',
            message: customMessage || 'Your WhatsApp message could not be sent. Please try again.',
            duration: customOverrides?.duration !== undefined ? customOverrides.duration : 6500,
            dismissible: true,
            actionLabel: customOverrides?.actionLabel,
            onAction: customOverrides?.onAction,
          });
          break;
        case 'unconfirmed':
          update(id, {
            type: 'whatsapp-unconfirmed',
            title: customOverrides?.title || 'Delivery Not Confirmed',
            message: customMessage || 'WhatsApp has not confirmed delivery. Check the message status before retrying.',
            duration: customOverrides?.duration !== undefined ? customOverrides.duration : 7500,
            dismissible: true,
            actionLabel: customOverrides?.actionLabel,
            onAction: customOverrides?.onAction,
          });
          break;
        case 'disconnected':
          update(id, {
            type: 'whatsapp-disconnected',
            title: customOverrides?.title || 'WhatsApp Disconnected',
            message: customMessage || 'Your message was not sent because WhatsApp is disconnected. Reconnect and try again.',
            duration: customOverrides?.duration !== undefined ? customOverrides.duration : 7500,
            dismissible: true,
            actionLabel: customOverrides?.actionLabel,
            onAction: customOverrides?.onAction,
          });
          break;
      }

      return id;
    },
    [notify, update]
  );

  const value = useMemo(
    () => ({ notify, update, dismiss, notifyWhatsAppState }),
    [dismiss, notify, update, notifyWhatsAppState]
  );

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {/* Non-blocking container anchored cleanly for mobile & desktop */}
      <div
        className="fixed top-4 sm:top-6 right-3 sm:right-6 z-[250] flex w-[calc(100vw-1.5rem)] max-w-[370px] flex-col gap-2.5 pointer-events-none"
        aria-live="polite"
        aria-atomic="true"
      >
        {notifications.map((notification) => {
          const config = NOTIFICATION_CONFIGS[notification.type] || NOTIFICATION_CONFIGS.info;
          const isErrorLike =
            notification.type === 'error' ||
            notification.type === 'whatsapp-failed' ||
            notification.type === 'whatsapp-disconnected';

          return (
            <div
              key={notification.id}
              role={isErrorLike ? 'alert' : 'status'}
              className={`pointer-events-auto flex items-start gap-3 rounded-2xl border ${config.border} border-l-4 bg-white/95 dark:bg-[#121212]/95 backdrop-blur-md px-4 py-3.5 text-slate-900 dark:text-white shadow-xl shadow-slate-900/10 dark:shadow-black/50 border-slate-200/90 dark:border-white/10 transition-all duration-200 animate-in fade-in slide-in-from-top-2`}
            >
              <div
                className={`mt-0.5 shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${config.iconBg}`}
              >
                {config.icon}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-xs sm:text-sm font-bold leading-tight ${config.titleColor}`}>
                    {notification.title}
                  </p>
                  <span className="text-[10px] text-slate-400 dark:text-neutral-500 font-medium shrink-0">
                    Just now
                  </span>
                </div>
                <p className="mt-1 text-[11px] sm:text-xs leading-relaxed text-slate-600 dark:text-neutral-300 break-words font-normal">
                  {notification.message}
                </p>
                {notification.actionLabel && notification.onAction && (
                  <button
                    type="button"
                    onClick={() => {
                      notification.onAction?.();
                      dismiss(notification.id);
                    }}
                    className="mt-2 inline-flex items-center rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/10 dark:hover:bg-white/20 px-2.5 py-1 text-[11px] font-bold text-slate-800 dark:text-white transition-colors cursor-pointer"
                  >
                    {notification.actionLabel}
                  </button>
                )}
              </div>
              {notification.dismissible && (
                <button
                  type="button"
                  onClick={() => dismiss(notification.id)}
                  className="shrink-0 -mr-1 -mt-1 rounded-lg p-1 text-slate-400 hover:text-slate-700 dark:text-neutral-500 dark:hover:text-neutral-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  aria-label="Dismiss notification"
                >
                  <X size={15} />
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
