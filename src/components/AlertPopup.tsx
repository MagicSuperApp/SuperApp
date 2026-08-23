import React from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TouchableWithoutFeedback,
  StyleSheet,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { COLORS } from '../constants';

export type AlertType = 'error' | 'info' | 'warning' | 'success';

interface AlertPopupProps {
  visible: boolean;
  type: AlertType;
  title: string;
  message: string;
  onClose?: () => void;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
  /**
   * Ẩn nút Huỷ dù có `onConfirm`.
   *
   * Hộp thoại native cho phép MỘT nút mà nút đó vẫn chạy việc. Ở đây `onConfirm`
   * vừa nghĩa là "có việc để chạy" vừa nghĩa là "có hai lựa chọn" — hai việc khác
   * nhau bị buộc vào một cờ. Chuyển một hộp thoại một-nút-có-việc sang đây mà
   * không có cờ này thì tự dưng mọc thêm nút Huỷ, và người dùng phải chọn giữa hai
   * thứ mà bản gốc không cho họ chọn.
   */
  hideCancel?: boolean;
}

const AlertPopup: React.FC<AlertPopupProps> = ({
  visible,
  type,
  title,
  message,
  onClose,
  onConfirm,
  confirmText = 'OK',
  cancelText = 'Hủy',
  hideCancel = false,
}) => {
  const getAlertConfig = (alertType: AlertType) => {
    switch (alertType) {
      case 'error':
        return {
          icon: 'alert-circle',
          color: COLORS.error || '#FF4444',
          bgColor: 'rgba(255, 68, 68, 0.1)',
        };
      case 'warning':
        return {
          icon: 'alert',
          color: COLORS.warning || '#FF8800',
          bgColor: 'rgba(255, 136, 0, 0.1)',
        };
      case 'info':
        return {
          icon: 'information',
          color: COLORS.info || COLORS.accent,
          bgColor: COLORS.accentGlow,
        };
      case 'success':
        return {
          icon: 'check-circle',
          color: COLORS.success || '#4CAF50',
          bgColor: 'rgba(76, 175, 80, 0.1)',
        };
      default:
        return {
          icon: 'information',
          color: COLORS.accent,
          bgColor: COLORS.accentGlow,
        };
    }
  };

  const config = getAlertConfig(type);

  const handleClose = () => {
    if (onClose) onClose();
  };

  const handleConfirm = () => {
    if (onConfirm) {
      onConfirm();
    }
    handleClose();
  };

  const handleCancel = () => {
    handleClose();
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <TouchableWithoutFeedback onPress={handleClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContent}>
              {/* Icon */}
              <View style={[styles.iconContainer, { backgroundColor: config.bgColor }]}>
                <Icon name={config.icon} size={32} color={config.color} />
              </View>

              {/* Content */}
          <View style={styles.content}>
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.message}>{message}</Text>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {onConfirm && !hideCancel && (
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
              >
                <Text style={styles.cancelBtnText}>{cancelText}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: COLORS.accent }]}
              onPress={handleConfirm}
            >
              <Text style={styles.confirmBtnText}>{confirmText}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </TouchableWithoutFeedback>
    </View>
  </TouchableWithoutFeedback>
</Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    margin: 20,
    maxWidth: 320,
    width: '100%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  content: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: COLORS.bgWarm,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default AlertPopup;