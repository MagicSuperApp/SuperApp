/**
 * TreePublicSheet — tấm trượt "CÔNG KHAI & MÃ TRUY XUẤT" của một cây.
 *
 * Đây là NƠI DUY NHẤT dựng giao diện cho việc bật công khai + lấy mã. Trước bản
 * này nó là một thẻ nằm khuất trong tab "Thông tin" (`TreePublicCard`) — mà bật
 * công khai là ĐIỀU KIỆN để quả của cây lọt vào tầm tra cứu của người mua, tức
 * là mắt xích đầu của cả chuỗi truy xuất, không phải một dòng cấu hình.
 *
 * Đo trên kho sản xuất 08/2026: **139 cây — 54 riêng tư, 85 chưa đặt, 0 công
 * khai.** Không phải nông dân không muốn; là không ai tìm ra chỗ bấm.
 *
 * ── Đọc trạng thái bằng cách nào, và giới hạn của phép đọc đó ────────────────
 * Không có cửa "get_visibility". Ta suy từ `GET /api/provenance/{tree_id}`: máy
 * chủ CỐ Ý gộp *cây riêng tư* với *cây không có* thành cùng một 404 (rọc-phách
 * §18) ⟹ có thân trả về = đang công khai; 404 = chưa.
 *
 * Phép suy này KHÔNG phân biệt được `public_readonly` với `public_contributable`.
 * Nên tấm này chỉ khẳng định "đang công khai / chưa", và khi người dùng vừa chọn
 * một mức thì hiện đúng mức họ vừa chọn — không bịa ra một mức ta không đọc được.
 *
 * ── Vì sao có cả một đoạn cảnh báo trước khi bật ────────────────────────────
 * Bật công khai KHÔNG chỉ là "có trang web để xem". Từ 08/2026 nó còn nghĩa là
 * mọi NGƯỜI LẠ đem ảnh tới so được với quả của cây này (`server.py:4066`). Nông
 * dân phải biết điều đó TRƯỚC khi bấm — đây là quyết định của họ, không phải mặc
 * định của hệ.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../../components/Icon';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { getProvenance } from '../../../services/provenanceService';
import { setTreeVisibility, type TreeVisibility } from '../../../services/treeVisibilityService';
import { publicTraceUrl } from '../../../services/treeQrService';
import TreeQrCode, { type TreeQrCodeHandle } from '../../../features/treeQr/TreeQrCode';
import { shareQrImage } from '../../../features/treeQr/saveQrImage';
import {
  ELEVATION, NATURE, RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
} from '../theme/depth';

/**
 * Cạnh tấm QR khi vẽ. 260 dp là cỡ nhìn rõ trên màn, VÀ là cỡ ảnh xuất ra —
 * `toDataURL` chụp đúng cạnh đang vẽ. In tem cỡ 3×3 cm ở 300 dpi cần ~354 px,
 * nên 260 là hơi thiếu cho bản in nét; đây là chỗ nâng khi nào có nhu cầu in
 * thật, và nâng bằng cách dựng component to hơn chứ không phóng lúc xuất.
 */
const QR_SIZE = 300;

const OPTIONS: { value: TreeVisibility; label: string; hint: string; icon: string }[] = [
  {
    value: 'private', icon: 'lock',
    label: 'Riêng tư',
    hint: 'Chỉ mình bạn thấy. Quả không vào tầm tra cứu của ai.',
  },
  {
    value: 'public_readonly', icon: 'eye',
    label: 'Công khai',
    hint: 'Người mua tra được xuất xứ. Không ai sửa được gì.',
  },
  {
    value: 'public_contributable', icon: 'share-nodes',
    label: 'Công khai + góp',
    hint: 'Người khác còn gửi đóng góp cho cây này.',
  },
];

export interface TreePublicSheetProps {
  visible: boolean;
  onClose: () => void;
  /** `tree_id` phía máy chủ — KHÔNG phải id hàng cục bộ. */
  treeId: string;
}

const TreePublicSheet: React.FC<TreePublicSheetProps> = ({ visible, onClose, treeId }) => {
  const insets = useSafeAreaInsets();
  const qrRef = useRef<TreeQrCodeHandle>(null);

  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [chosen, setChosen] = useState<TreeVisibility | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await getProvenance(ORILIFE_BASE, treeId);
    if (!alive.current) return;
    // `not_public` là CÂU TRẢ LỜI (riêng tư hoặc chưa đặt), `error` mới là hỏng.
    // Gộp hai thứ thì mất mạng cũng hiện thành "chưa công khai", rồi nông dân đi
    // bật lại một cây vốn đã bật.
    setIsPublic(r.kind === 'ok');
    setCode(r.kind === 'ok' ? (r.provenance.code ?? null) : null);
    setLoading(false);
  }, [treeId]);

  useEffect(() => { if (visible) refresh(); }, [visible, refresh]);

  const apply = useCallback(async (v: TreeVisibility) => {
    setSaving(true);
    const r = await setTreeVisibility(ORILIFE_BASE, treeId, v);
    if (!alive.current) return;
    setSaving(false);
    if (!r.ok) {
      // Câu của tầng dịch vụ đã phân biệt "hết suất 24 giờ" với "máy chủ bận" —
      // hiện nguyên câu đó, đừng thay bằng câu chung của app.
      Alert.alert('Chưa đổi được', r.error.message);
      return;
    }
    setChosen(v);
    await refresh();
  }, [treeId, refresh]);

  const choose = useCallback((v: TreeVisibility) => {
    if (v === 'private') { apply(v); return; }
    Alert.alert(
      'Bật công khai cây này?',
      'Người mua sẽ tra được xuất xứ cây, và ẢNH QUẢ của cây này lọt vào tầm so khớp '
      + 'của mọi người lạ dùng chức năng tra cứu. Bạn tắt lại được bất cứ lúc nào.',
      [
        { text: 'Thôi', style: 'cancel' },
        { text: 'Bật công khai', onPress: () => apply(v) },
      ],
    );
  }, [apply]);

  const copyCode = useCallback(() => {
    if (!code) return;
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => { if (alive.current) setCopied(false); }, 2000);
  }, [code]);

  const saveImage = useCallback(async () => {
    if (!code) return;
    setSharing(true);
    const b64 = await qrRef.current?.toPngBase64();
    const r = await shareQrImage(b64 ?? null, code);
    if (!alive.current) return;
    setSharing(false);
    // Người dùng bấm huỷ ở bảng chia sẻ KHÔNG phải lỗi — im lặng.
    if (r.ok || r.reason === 'dismissed') return;
    // Ba nguyên nhân, hai cách xử khác nhau — gộp lại thì người dùng bấm lại mãi
    // một nút không bao giờ chạy được trên bản app họ đang cầm.
    Alert.alert(
      'Chưa xuất được ảnh',
      r.reason === 'unavailable'
        ? 'Bản ứng dụng này chưa xuất được ảnh. Hãy cập nhật ứng dụng, hoặc tạm thời chụp màn hình tấm mã.'
        : 'Thử lại giúp, hoặc chụp màn hình tấm mã.',
    );
  }, [code]);

  const traceUrl = code ? publicTraceUrl(ORILIFE_BASE, code) : null;
  const activeValue: TreeVisibility | null =
    chosen ?? (isPublic ? 'public_readonly' : 'private');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Đóng" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.lg) }]}>
        <View style={s.grabber} />

        <View style={s.head}>
          <View style={s.headIcon}>
            <Icon name="qrcode" size={17} color={TONE.primaryDeep} />
          </View>
          <View style={s.headText}>
            <Text style={TYPE.section}>Công khai &amp; mã truy xuất</Text>
            <Text style={s.headHint} numberOfLines={2}>
              Quả chỉ tra cứu được khi cây mẹ đã bật công khai.
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn} accessibilityRole="button">
            <Icon name="xmark" size={15} color={NATURE.barkSoft} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
          {loading ? (
            <View style={s.center}><ActivityIndicator color={TONE.primary} /></View>
          ) : (
            <>
              <View style={[s.statusPill, isPublic && s.statusPillOn]}>
                <View style={[s.statusDot, { backgroundColor: isPublic ? TONE.primary : NATURE.barkSoft }]} />
                <Text style={[s.statusTxt, isPublic && s.statusTxtOn]}>
                  {isPublic ? 'Đang công khai' : 'Chưa công khai'}
                </Text>
              </View>

              <View style={s.opts}>
                {OPTIONS.map((o) => {
                  const active = activeValue === o.value;
                  return (
                    <Pressable
                      key={o.value}
                      disabled={saving}
                      onPress={() => choose(o.value)}
                      style={({ pressed }) => [s.opt, active && s.optOn, pressed && s.pressed]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active, disabled: saving }}
                    >
                      <View style={[s.optIcon, active && s.optIconOn]}>
                        <Icon name={o.icon} size={14} color={active ? NATURE.paper : NATURE.barkSoft} />
                      </View>
                      <View style={s.optText}>
                        <Text style={[s.optLabel, active && s.optLabelOn]}>{o.label}</Text>
                        <Text style={s.optHint}>{o.hint}</Text>
                      </View>
                      {active && <Icon name="circle-check" size={16} color={TONE.primary} />}
                    </Pressable>
                  );
                })}
              </View>

              {saving && <View style={s.center}><ActivityIndicator color={TONE.primary} /></View>}

              {code ? (
                <View style={s.qrBlock}>
                  <View style={s.qrCard}>
                    <TreeQrCode
                      ref={qrRef}
                      value={traceUrl ?? code}
                      size={QR_SIZE}
                      color={"#255938"}
                      background={NATURE.paper}
                    />
                  </View>

                  <Pressable onPress={copyCode} style={s.codeRow} accessibilityRole="button">
                    <View style={s.codeText}>
                      <Text style={s.codeLabel}>MÃ CÔNG KHAI</Text>
                      <Text style={s.code} selectable>{code}</Text>
                    </View>
                    <Icon name={copied ? 'check' : 'copy'} size={17} color={TONE.primary} />
                  </Pressable>

                  {!!traceUrl && <Text style={s.url} numberOfLines={1} selectable>{traceUrl}</Text>}

                  <Pressable
                    onPress={saveImage}
                    disabled={sharing}
                    style={({ pressed }) => [s.saveBtn, pressed && s.pressed, sharing && s.saveBtnOff]}
                    accessibilityRole="button"
                  >
                    {sharing
                      ? <ActivityIndicator color={NATURE.paper} />
                      : <Icon name="cloud-arrow-down" size={17} color={NATURE.paper} />}
                    <Text style={s.saveBtnTxt}>Tải ảnh mã QR</Text>
                  </Pressable>

                  {/* Nói thẳng chỗ nút này dẫn tới: bảng chia sẻ của hệ điều
                      hành, không phải một nút lưu thẳng vào thư viện ảnh. Xem
                      `features/treeQr/saveQrImage.ts` để biết vì sao. */}
                  <Text style={s.saveNote}>
                    Mở bảng chia sẻ của máy — chọn “Lưu ảnh”, hoặc gửi thẳng cho thợ in.
                  </Text>
                </View>
              ) : (
                isPublic && (
                  <Text style={s.note}>
                    Cây đang công khai nhưng máy chủ chưa cấp mã. Mã được cấp SAU khi cây
                    đã định danh bằng ảnh.
                  </Text>
                )
              )}
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

export default TreePublicSheet;

const s = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: SURFACE.scrim },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    maxHeight: '90%',
    backgroundColor: SURFACE.raised,
    borderTopLeftRadius: RADIUS.sheet, borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: SPACE.page, paddingTop: SPACE.md,
    ...ELEVATION.sheet,
  },
  grabber: {
    alignSelf: 'center', width: 44, height: 5, borderRadius: 3,
    backgroundColor: TONE.border, marginBottom: SPACE.md,
  },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  headIcon: {
    width: 36, height: 36, borderRadius: RADIUS.field,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: TONE.primarySoft,
  },
  headText: { flex: 1, minWidth: 0 },
  headHint: { ...TYPE.caption, fontSize: 13, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.sunken,
  },

  body: { paddingTop: SPACE.lg, paddingBottom: SPACE.md, gap: SPACE.md },
  center: { paddingVertical: SPACE.xl, alignItems: 'center' },
  pressed: { opacity: 0.9 },

  statusPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: SPACE.md, paddingVertical: 6,
    borderRadius: RADIUS.chip, backgroundColor: SURFACE.sunken,
  },
  statusPillOn: { backgroundColor: TONE.primarySoft },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusTxt: { fontSize: 13, fontWeight: '700', color: NATURE.barkSoft },
  statusTxtOn: { color: TONE.primaryDeep },

  opts: { gap: SPACE.sm },
  opt: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    minHeight: TOUCH_MIN,
    borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: TONE.border,
    backgroundColor: SURFACE.raised,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  optOn: { borderColor: TONE.primary, backgroundColor: TONE.primarySoft },
  optIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.sunken,
  },
  optIconOn: { backgroundColor: TONE.primary },
  optText: { flex: 1, minWidth: 0 },
  optLabel: { fontSize: 15.5, fontWeight: '700', color: NATURE.bark },
  optLabelOn: { color: TONE.primaryDeep },
  optHint: { ...TYPE.caption, fontSize: 12.5, marginTop: 1 },

  qrBlock: { gap: SPACE.md, marginTop: SPACE.xs },
  qrCard: {
    alignSelf: 'center',
    padding: SPACE.md,
    borderRadius: RADIUS.card,
    backgroundColor: NATURE.paper,
    borderWidth: 1, borderColor: TONE.border,
  },
  codeRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    borderRadius: RADIUS.field, backgroundColor: SURFACE.sunken,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.md,
  },
  codeText: { flex: 1, minWidth: 0 },
  codeLabel: { fontSize: 10.5, letterSpacing: 0.8, fontWeight: '800', color: NATURE.barkSoft },
  code: { fontSize: 17, fontWeight: '800', color: NATURE.bark, letterSpacing: 0.5, marginTop: 2 },
  url: { ...TYPE.caption, fontSize: 12 },

  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    minHeight: TOUCH_MIN, borderRadius: RADIUS.chip, backgroundColor: TONE.primary,
  },
  saveBtnOff: { opacity: 0.6 },
  saveBtnTxt: { fontSize: 16, fontWeight: '700', color: NATURE.paper },
  saveNote: { ...TYPE.caption, fontSize: 12, textAlign: 'center' },

  note: { ...TYPE.caption, fontSize: 13 },
});
