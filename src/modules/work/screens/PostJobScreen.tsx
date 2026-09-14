// modules/work/screens/PostJobScreen.tsx
//
// Form đăng tin tuyển thợ.
//
// ── Vì sao ô "loại việc" đọc từ máy chủ chứ không từ bảng trong mã ──────────
// Bản trước cho chọn trong `CATEGORIES` — mười id NGÀNH NGHỀ gõ cứng
// (`data/mockData.ts`) — rồi gửi thẳng id đó làm `templateKey`. Nhưng
// `templateKey` là khoá MẪU VIỆC do máy chủ cấp, không phải id ngành: đo
// `GET /templates` ngày 2026-09-14 trả 14 mẫu (`video_short`, `tutoring`,
// `farm_tending`…), trùng với bảng trong mã đúng MỘT id (`housekeeping`).
// Tức chín trên mười lần chọn sẽ bị máy chủ trả `404 NO_TEMPLATE`.
//
// Kiểu hỏng này tệ hơn hỏng hẳn: người dùng đăng được tin khi chọn "Giúp việc"
// và không đăng được ở chín ngành còn lại, nên họ không rút ra được quy luật
// nào — chỉ thấy app lúc chạy lúc không.
//
// Danh sách mẫu nay lấy từ chính máy chủ sẽ nhận tin, nên không có cách nào
// chọn ra một khoá mà máy chủ không biết.

import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { COLORS } from '../../../constants';
import { t } from '../../../i18n';
import { WORK_THEME } from '../theme/colors';
import { usePostJob } from '../hooks/usePostJob';
import { useTemplates } from '../hooks/useTemplates';
import { showError, showInfo, showSuccess } from '../../../utils/alert';

/**
 * Mỗi nguyên nhân một câu, và mỗi câu chỉ ra MỘT việc phải làm.
 *
 * Bản trước gộp tất cả vào "Kiểm tra kết nối, đăng nhập và loại việc rồi thử
 * lại" — một câu bảo người dùng kiểm ba thứ cùng lúc thì không bảo được gì, và
 * nó che mất chính lỗi khoá mẫu việc ở khối chú thích đầu tệp.
 */
const POST_FAIL_MESSAGE: Record<string, string> = {
  NO_TEMPLATE:
    'Loại việc này không còn trên hệ thống. Chọn lại ở ô Loại việc rồi gửi lần nữa — phần bạn đã nhập vẫn giữ nguyên.',
  UNAUTH:
    'Phiên đăng nhập đã hết hạn. Mở khoá lại bằng vân tay hoặc khuôn mặt rồi gửi lần nữa — phần bạn đã nhập vẫn giữ nguyên.',
  BAD_INPUT:
    'Máy chủ chưa nhận được nội dung này. Soát lại tiêu đề, mô tả và ngân sách rồi gửi lần nữa.',
  BACKEND_DISABLED:
    'Máy chủ việc làm chưa sẵn sàng trong phiên bản này, nên tin chưa gửi đi được. Thử lại sau.',
  NETWORK:
    'Máy chưa kết nối được mạng, nên tin chưa gửi đi. Kiểm tra sóng hoặc wifi rồi gửi lần nữa.',
};
const POST_FAIL_FALLBACK =
  'Máy chủ chưa nhận được tin. Tin chưa đăng, nội dung bạn nhập vẫn còn — gửi lại sau ít phút.';

const PostJobScreen: React.FC = () => {
  const navigation = useNavigation<any>();

  const [title, setTitle] = useState('');
  const [templateKey, setTemplateKey] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [budget, setBudget] = useState('');
  const [location, setLocation] = useState('');

  // Mẫu việc lấy từ chính máy chủ sẽ nhận tin — xem khối chú thích đầu tệp.
  const { templates, loading: loadingTemplates, errorKind: templateError, reload } = useTemplates();
  const { submitting, submit } = usePostJob();

  /**
   * Khoá đang chọn phải còn trong danh sách máy chủ vừa trả. Danh sách tải lại
   * mà mẫu cũ biến mất thì lựa chọn cũ hết hiệu lực — giữ nó lại là gửi đi một
   * khoá đã chết.
   */
  const selected = useMemo(
    () => templates.find(tpl => tpl.key === templateKey) ?? null,
    [templates, templateKey],
  );

  const canSubmit =
    title.length >= 10 && !!selected && description.length >= 20 && !!budget && !!location;

  const handleSubmit = async () => {
    if (!canSubmit || !selected) {
      showInfo('Thiếu thông tin', 'Vui lòng điền đầy đủ các ô bắt buộc.');
      return;
    }
    const priceVND = Number(String(budget).replace(/[^\d]/g, '')) || undefined;
    // Địa điểm đi kèm phần mô tả: `POST /jobs` chưa có trường địa điểm nào
    // (`workApi.ts` ▸ `PostJobBody`). Ô này bắt buộc, nên bỏ trắng nó là vứt
    // đúng thứ người dùng vừa gõ — thợ đọc tin sẽ không biết việc ở đâu.
    const desc = `${description}\n\nĐịa điểm: ${location}`;
    const outcome = await submit({ templateKey: selected.key, title, desc, priceVND });

    if (outcome.ok) {
      // `t()` TƯỜNG MINH: lớp bọc `<Text>` bỏ qua `t()` ở tiếng Việt
      // (`i18n/autoText.tsx`), nên `{brand}` viết trần sẽ ra màn nguyên dấu
      // ngoặc nhọn cho đúng nhóm người dùng đông nhất.
      //
      // KHÔNG nói "đã ký số": luồng này chỉ gửi `POST /jobs`, không có lần ký
      // nào. Cũng KHÔNG hứa "thợ liên hệ trong vài phút" — app chưa có cửa cho
      // thợ ứng tuyển, nên đó là một lời hứa không ai giữ được.
      showSuccess('Đã đăng tin', t('Tin của bạn đã đăng lên {brand} Work và thợ có thể xem được.'), {
          confirmText: 'OK',
          hideCancel: true,
          onConfirm: () => navigation.goBack(),
      });
    } else {
      showError(
        'Chưa đăng được tin',
        (outcome.code && POST_FAIL_MESSAGE[outcome.code]) || POST_FAIL_FALLBACK,
      );
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <StatusBar barStyle="light-content" backgroundColor={WORK_THEME.primaryDeep} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8}>
          <Icon name="close" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Đăng tin đặt thợ</Text>
          <Text style={styles.headerSub}>Mô tả công việc, hệ thống gợi ý thợ phù hợp</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.field}>
          <Label text="Tiêu đề công việc" required />
          <TextInput
            style={styles.input}
            placeholder="VD: Cần thợ điện sửa đường dây tầng 2"
            placeholderTextColor={COLORS.textMuted}
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Text style={styles.hint}>{title.length}/80 ký tự</Text>
        </View>

        <View style={styles.field}>
          <Label text="Loại việc" required />
          {/*
            Bốn trạng thái, không gộp. Danh sách rỗng vì chưa hỏi được máy chủ
            KHÁC danh sách rỗng vì máy chủ chưa có mẫu nào — gộp hai cái lại là
            nói với người dùng một điều mình chưa đo.
          */}
          {loadingTemplates ? (
            <Text style={styles.stateText}>Đang lấy danh sách loại việc…</Text>
          ) : templateError ? (
            <View>
              <Text style={styles.stateText}>
                Chưa lấy được danh sách loại việc từ máy chủ, nên chưa đăng tin được.
              </Text>
              <TouchableOpacity onPress={reload} style={styles.retryBtn} activeOpacity={0.85}>
                <Icon name="refresh" size={14} color={WORK_THEME.primary} />
                <Text style={styles.retryText}>Thử lại</Text>
              </TouchableOpacity>
            </View>
          ) : templates.length === 0 ? (
            <Text style={styles.stateText}>
              Máy chủ chưa mở loại việc nào. Chưa đăng tin được lúc này.
            </Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.catList}
            >
              {templates.map(tpl => (
                <TouchableOpacity
                  key={tpl.key}
                  onPress={() => setTemplateKey(tpl.key)}
                  style={[
                    styles.catItem,
                    templateKey === tpl.key && {
                      backgroundColor: WORK_THEME.primary,
                      borderColor: WORK_THEME.primary,
                    },
                  ]}
                >
                  {/* `icon` của mẫu việc là EMOJI trên dây (vd "🎬"), không phải
                      tên biểu tượng — đưa vào `<Icon name>` sẽ ra ô trống. */}
                  <Text style={styles.catItemEmoji}>{tpl.icon}</Text>
                  <Text style={[
                    styles.catItemText,
                    templateKey === tpl.key && { color: '#fff' },
                  ]}>{tpl.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.field}>
          <Label text="Mô tả chi tiết" required />
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="Mô tả công việc, dụng cụ cần, yêu cầu kỹ năng…"
            placeholderTextColor={COLORS.textMuted}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={5}
            maxLength={500}
            textAlignVertical="top"
          />
          <Text style={styles.hint}>{description.length}/500 — tối thiểu 20 ký tự</Text>
        </View>

        <View style={styles.row}>
          <View style={[styles.field, { flex: 1 }]}>
            <Label text="Ngân sách (VND)" required />
            <View style={styles.inputIconWrap}>
              <Icon name="cash" size={16} color={WORK_THEME.primary} />
              <TextInput
                style={styles.inputIcon}
                placeholder="500.000"
                placeholderTextColor={COLORS.textMuted}
                value={budget}
                onChangeText={setBudget}
                keyboardType="number-pad"
              />
            </View>
          </View>
          <View style={[styles.field, { flex: 1 }]}>
            <Label text="Địa điểm" required />
            <View style={styles.inputIconWrap}>
              <Icon name="map-marker-outline" size={16} color={WORK_THEME.primary} />
              <TextInput
                style={styles.inputIcon}
                placeholder="Quận 1, TP. HCM"
                placeholderTextColor={COLORS.textMuted}
                value={location}
                onChangeText={setLocation}
              />
            </View>
          </View>
        </View>

        {/*
          Công tắc "Đánh dấu Gấp · phí thêm 20.000đ" đã GỠ. Nó hứa một dịch vụ
          CÓ THU TIỀN, trong khi `PostJobBody` (`services/workApi.ts`) không có
          trường nào chở nó đi — bật hay tắt thì cùng một thân yêu cầu rời máy.
          Thu tiền cho một thứ không gửi đi là lời hứa nặng nhất trên màn này.
          Ngày máy chủ có trường tương ứng thì dựng lại, không sớm hơn.
        */}

        <View style={styles.contractBox}>
          <View style={styles.contractHeader}>
            <Icon name="file-sign" size={16} color={WORK_THEME.primary} />
            <Text style={styles.contractTitle}>Hợp đồng smart contract</Text>
          </View>
          {/*
            Bỏ câu "Bạn ký số bằng khoá trên máy ở bước cuối": bước đăng tin chỉ
            gửi `POST /jobs`, không gọi lần ký nào. Ở một sản phẩm có tiền, chữ
            "ký" là tín hiệu "tôi đang cam kết" — đặt nhầm chỗ thì người dùng vừa
            sợ ở chỗ không có gì, vừa mất cảnh giác ở chỗ có thật (màn hợp đồng).
          */}
          <Text style={styles.contractText}>
            Đăng tin chưa phát sinh hợp đồng và chưa khoá tiền. Khi bạn chọn được thợ, hợp đồng mới được tạo ở màn Hợp đồng — tiền cọc định giá bằng MAGIC nhưng khoá và hoàn thật bằng CARP, chỉ giải ngân khi hai bên xác nhận hoàn thành.
          </Text>
        </View>

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || submitting}
          activeOpacity={0.85}
          style={[
            styles.submitBtn,
            (!canSubmit || submitting) && styles.submitBtnDisabled,
          ]}
        >
          {submitting ? (
            <Text style={styles.submitBtnText}>Đang đăng…</Text>
          ) : (
            <>
              <Icon name="send" size={16} color="#fff" />
              <Text style={styles.submitBtnText}>Đăng tin</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const Label: React.FC<{ text: string; required?: boolean }> = ({ text, required }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8 }}>
    <Text style={styles.label}>{text}</Text>
    {required && <Text style={{ color: '#C0533A', fontWeight: '800' }}>*</Text>}
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WORK_THEME.primaryDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#fff' },
  headerSub: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },

  field: { paddingHorizontal: 16, paddingVertical: 10 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.text, letterSpacing: -0.2 },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 13,
    color: COLORS.text,
  },
  textArea: { minHeight: 110, paddingTop: 12 },

  inputIconWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputIcon: { flex: 1, fontSize: 13, color: COLORS.text, paddingVertical: 11 },

  hint: { fontSize: 10, color: COLORS.textMuted, marginTop: 4 },

  row: { flexDirection: 'row', gap: 6, paddingHorizontal: 0 },

  catList: { gap: 8, paddingBottom: 4 },
  catItem: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    backgroundColor: COLORS.card,
    borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  catItemText: { fontSize: 12, fontWeight: '600', color: COLORS.text },
  catItemEmoji: { fontSize: 14 },

  stateText: { fontSize: 12, color: COLORS.textSub, lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', marginTop: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
    backgroundColor: WORK_THEME.primaryGlow,
  },
  retryText: { fontSize: 12, fontWeight: '700', color: WORK_THEME.primary },

  contractBox: {
    marginHorizontal: 16, marginTop: 14, marginBottom: 16,
    padding: 12,
    backgroundColor: WORK_THEME.primaryGlow,
    borderRadius: 12,
    borderWidth: 1, borderColor: WORK_THEME.primaryLight,
  },
  contractHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 6,
  },
  contractTitle: {
    fontSize: 12, fontWeight: '800', color: WORK_THEME.primaryDeep,
  },
  contractText: {
    fontSize: 11, color: COLORS.textSub, lineHeight: 16,
  },

  submitBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginHorizontal: 16, marginBottom: 8,
    paddingVertical: 14,
    backgroundColor: WORK_THEME.primary,
    borderRadius: 12,
  },
  submitBtnDisabled: { backgroundColor: COLORS.divider },
  submitBtnText: {
    fontSize: 14, fontWeight: '800', color: '#fff', letterSpacing: -0.2,
  },
});

export default PostJobScreen;
