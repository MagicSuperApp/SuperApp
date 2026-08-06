// modules/trace/components/CommonPopup.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
// Icon: bộ Font Awesome Solid tải qua Iconify (assets/icons → icons.generated).
// Thêm icon mới: `node scripts/icons.js <tên-fa6-solid>`.
import Icon from '../../../components/Icon';
import { COLORS } from '../../../constants';

interface CommonPopupProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  inputType?: 'text' | 'number' | 'email';
  onOk: (value: string) => void;
  onCancel?: () => void;
  onClose?: () => void;
}

const CommonPopup: React.FC<CommonPopupProps> = ({
  visible,
  title,
  placeholder = '',
  initialValue = '',
  inputType = 'text',
  onOk,
  onCancel,
  onClose,
}) => {
  const [inputValue, setInputValue] = useState(initialValue);

  useEffect(() => {
    if (visible) {
      setInputValue(initialValue);
    }
  }, [visible, initialValue]);

  const handleOk = () => {
    onOk(inputValue.trim());
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    if (onClose) onClose();
  };

  const handleClose = () => {
    if (onClose) onClose();
  };

  const keyboardType = inputType === 'number' ? 'numeric' : inputType === 'email' ? 'email-address' : 'default';

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.overlayTouchable}
          activeOpacity={1}
          onPress={handleClose}
        >
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>{title}</Text>
              <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
                <Icon name="xmark" size={24} color={COLORS.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Input */}
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={COLORS.textMuted}
                value={inputValue}
                onChangeText={setInputValue}
                keyboardType={keyboardType}
                autoFocus={true}
                multiline={false}
                maxLength={100}
              />
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={handleCancel}
              >
                <Text style={styles.cancelBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.okBtn, !inputValue.trim() && styles.okBtnDisabled]}
                onPress={handleOk}
                disabled={!inputValue.trim()}
              >
                <Text style={styles.okBtnText}>Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </KeyboardAvoidingView>
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
  overlayTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 20,
    width: 250,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  closeBtn: {
    padding: 4,
  },
  inputContainer: {
    marginBottom: 24,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.text,
    backgroundColor: COLORS.bg,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
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
  okBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  okBtnDisabled: {
    opacity: 0.5,
  },
  okBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.white,
  },
});

export default CommonPopup;
