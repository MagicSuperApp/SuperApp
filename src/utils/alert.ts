import { AlertType, type AlertAction } from '../components/AlertPopup';

export type { AlertAction };

interface AlertConfig {
  type: AlertType;
  title: string;
  message: string;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  /** Danh sách nút đầy đủ — thay cho cặp `onConfirm`/`cancelText` khi cần >2 nút. */
  actions?: AlertAction[];
  /** Bấm ra ngoài / nút back có đóng được không. Mặc định có. */
  dismissable?: boolean;
}

/** Tuỳ chọn dùng chung cho `showAlert` và các hàm tiện lợi. */
export interface AlertOptions {
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  hideCancel?: boolean;
  actions?: AlertAction[];
  dismissable?: boolean;
}

class AlertManager {
  private alertQueue: AlertConfig[] = [];
  private currentAlert: AlertConfig | null = null;
  private listeners: ((alert: AlertConfig | null) => void)[] = [];

  show(config: AlertConfig) {
    this.alertQueue.push(config);
    this.processQueue();
  }

  private processQueue() {
    if (this.currentAlert || this.alertQueue.length === 0) return;

    this.currentAlert = this.alertQueue.shift()!;
    this.notifyListeners();
  }

  dismiss() {
    this.currentAlert = null;
    this.notifyListeners();
    // Process next alert after a short delay
    setTimeout(() => this.processQueue(), 300);
  }

  subscribe(listener: (alert: AlertConfig | null) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(listener => listener(this.currentAlert));
  }
}

const alertManager = new AlertManager();

export const showAlert = (
  type: AlertType,
  title: string,
  message: string,
  options?: AlertOptions
) => {
  alertManager.show({
    type,
    title,
    message,
    onConfirm: options?.onConfirm,
    confirmText: options?.confirmText,
    cancelText: options?.cancelText,
    hideCancel: options?.hideCancel,
    actions: options?.actions,
    dismissable: options?.dismissable,
  });
};

// Convenience methods
export const showError = (title: string, message?: string, options?: AlertOptions) => {
  showAlert('error', title, message || 'Đã xảy ra lỗi.', options);
};

export const showSuccess = (title: string, message?: string, options?: AlertOptions) => {
  showAlert('success', title, message || 'Thao tác thành công.', options);
};

export const showWarning = (title: string, message?: string, options?: AlertOptions) => {
  showAlert('warning', title, message || 'Cảnh báo.', options);
};

export const showInfo = (title: string, message?: string, options?: AlertOptions) => {
  showAlert('info', title, message || 'Thông tin.', options);
};

export const useAlert = () => {
  const [currentAlert, setCurrentAlert] = React.useState<AlertConfig | null>(null);

  React.useEffect(() => {
    const unsubscribe = alertManager.subscribe(setCurrentAlert);
    return unsubscribe;
  }, []);

  const dismissAlert = () => {
    alertManager.dismiss();
  };

  return {
    currentAlert,
    dismissAlert,
  };
};

// Import React for the hook
import React from 'react';