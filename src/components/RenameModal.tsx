/**
 * Hộp thoại đổi tên — dùng chung cho cây và cho vật nuôi.
 *
 * Vì sao tách ra khỏi màn hình. Bản đầu nằm ngay trong `TreeManagementScreen`
 * với tiêu đề viết cứng "Đổi tên cây". Khi màn vật nuôi cần đúng hộp thoại này,
 * lối rẻ nhất là chép sang — và hai bản chép rời nhau là cách một bên được vá
 * còn bên kia thì không.
 *
 * Hộp thoại KHÔNG tự quyết định gì về kết quả: nó chỉ thu chữ rồi trả lên. Việc
 * máy chủ có nhận tên đó hay không là việc của tầng gọi, và tầng gọi phải đọc
 * câu trả lời THẬT của máy chủ — cả hai cửa `POST /api/rename` (cây) và
 * `POST /api/animal/rename` (vật nuôi) đều trả `200` kèm `ok:false` khi từ chối.
 *
 * ── Chữ trong hộp thoại đi qua `t()` ─────────────────────────────────────────
 * Bốn chuỗi ở đây ('Huỷ' · 'Lưu' · 'Nhập tên mới...' · tiêu đề) ĐÃ nằm sẵn trong
 * từ điển với đủ en/zh/ja, nhưng bản nằm trong màn hình trước đây in thẳng nên
 * không chuỗi nào từng được dùng — người chọn tiếng Anh mở hộp thoại vẫn thấy
 * tiếng Việt. Mục từ điển có sẵn mà không ai gọi thì không có bài kiểm nào đỏ:
 * độ phủ từ điển đo ở phía TỪ ĐIỂN, không đo ở phía chỗ gọi.
 *
 * `t()` đặt Ở TRONG hộp thoại chứ không ở chỗ gọi: gom về một chỗ thì màn thứ ba
 * dùng lại hộp thoại này không thể quên.
 */
import React, { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { NEUTRAL } from '../shared/theme';
import { t } from '../i18n';

export interface RenameModalProps {
  visible: boolean;
  /** Tên đang có — ô nhập mở sẵn với chữ này. */
  currentName: string;
  /**
   * Tiêu đề hộp thoại, vd "Đổi tên cây" / "Đổi tên cá thể".
   * Truyền chuỗi NGUỒN tiếng Việt — hộp thoại tự gọi `t()`, nên chỗ gọi không
   * phải nhớ. Một chỗ dịch thì không có chỗ nào quên.
   */
  title: string;
  placeholder?: string;
  /** Trần ký tự. Mặc định 80 — khớp trần của cả hai cửa máy chủ. */
  maxLength?: number;
  /** Màu nút xác nhận, để mỗi màn giữ được màu của mình. */
  confirmColor?: string;
  onConfirm: (newName: string) => void;
  onDismiss: () => void;
}

const RenameModal: React.FC<RenameModalProps> = ({
  visible,
  currentName,
  title,
  placeholder = 'Nhập tên mới...',
  maxLength = 80,
  confirmColor = NEUTRAL.text,
  onConfirm,
  onDismiss,
}) => {
  const [value, setValue] = useState(currentName);

  // Reset khi mở lại với tên khác.
  useEffect(() => {
    if (visible) setValue(currentName);
  }, [visible, currentName]);

  const submit = () => {
    if (value.trim()) onConfirm(value.trim());
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={s.overlay}>
        <View style={s.dialog}>
          <Text style={s.title}>{t(title)}</Text>
          <TextInput
            style={s.input}
            value={value}
            onChangeText={setValue}
            placeholder={t(placeholder)}
            placeholderTextColor={NEUTRAL.textMuted}
            autoFocus
            maxLength={maxLength}
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <View style={s.actions}>
            <TouchableOpacity
              style={[s.btn, s.btnCancel]}
              onPress={onDismiss}
              activeOpacity={0.8}
            >
              <Text style={s.btnCancelText}>{t('Huỷ')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                s.btn,
                { backgroundColor: confirmColor },
                !value.trim() && s.btnDisabled,
              ]}
              onPress={submit}
              disabled={!value.trim()}
              activeOpacity={0.8}
            >
              <Text style={s.btnConfirmText}>{t('Lưu')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: NEUTRAL.bg,
    borderRadius: 18,
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  title: { fontSize: 17, fontWeight: '700', color: NEUTRAL.text, textAlign: 'center' },
  input: {
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: NEUTRAL.text,
  },
  actions: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnCancel: {
    backgroundColor: NEUTRAL.bgSoft,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
  },
  btnCancelText: { fontSize: 15, fontWeight: '600', color: NEUTRAL.textSub },
  btnConfirmText: { fontSize: 15, fontWeight: '600', color: NEUTRAL.white },
  btnDisabled: { opacity: 0.45 },
});

export default RenameModal;
