/**
 * CandidateDetailSheet — HỒ SƠ của một quả ứng viên, sau khi người mua chọn.
 *
 * ══ VÌ SAO CÓ MÀN NÀY ════════════════════════════════════════════════════
 * Bản trước: chạm vào một ứng viên thì app `navigation.replace` thẳng sang trang
 * xuất xứ bằng `tree.code`. Hai chỗ hỏng:
 *
 *   1. `tree.code` có thể VẮNG. Máy chủ chỉ hứa `tree: { name, code, gps,
 *      created_at, public_url, provenance }` — không hứa `code` luôn có giá trị.
 *      Vắng thì nhánh cũ rơi xuống `Linking`, rồi rơi xuống một câu lỗi. Người
 *      dùng chạm vào một hàng và **không có gì xảy ra**.
 *   2. Cả những trường máy chủ ĐÃ trả (tên cây, ngày đăng ký, số ảnh, trạng thái
 *      neo) cũng không được hiện ở đâu — app xin về rồi vứt đi.
 *
 * Nay: chạm vào ứng viên thì mở hồ sơ này, bày HẾT những gì máy chủ đã trả. Đi
 * tiếp sang trang xuất xứ là một NÚT trong đó, không phải hệ quả của cú chạm.
 * Không có `code` thì thiếu đúng cái nút ấy, phần còn lại vẫn đọc được.
 *
 * ══ KHÔNG CÓ DẤU TÍCH XANH, KỂ CẢ Ở ĐÂY ══════════════════════════════════
 * Đo trên máy chủ (`server.py:8321`): ở ngưỡng 0,72 có **73% (412/564)** cặp quả
 * KHÁC NHAU trên cùng một cây bị nhận nhầm là cùng quả. Nên màn này gọi thứ đang
 * bày là "quả ứng viên", và câu nhắc nằm NGAY dưới ảnh chứ không nằm cuối trang:
 * người ta quyết định lúc nhìn ảnh, không phải lúc cuộn tới cuối.
 *
 * ══ GPS Ở ĐÂY LÀ VÙNG, KHÔNG PHẢI VỊ TRÍ CÂY ═════════════════════════════
 * `tree.gps` của lane khách đã bị máy chủ làm thô. Nên chữ nói "khu vực", và
 * KHÔNG có nút mở bản đồ — một cái ghim nhọn trên toạ độ đã làm tròn là nói dối
 * bằng đồ hoạ.
 */

import React from 'react';
import {
  Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../components/Icon';
import {
  isAnchored, provenanceOf, safeExplorerUrl, safeHttpUrl,
  type LookupCandidate,
} from '../../services/fruitLookupService';
import {
  ELEVATION, NATURE, RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
} from '../../modules/trace/theme/depth';

/** `2026-07-01T…` → `01/07/2026`. Chuỗi hỏng → `null` (màn bỏ dòng đó). */
function fmtDate(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

const STATUS_VI: Record<string, string> = {
  on_tree: 'Còn trên cây',
  harvested: 'Đã hái',
  lost: 'Đã mất',
};

/** Một dòng "nhãn — giá trị". Thiếu giá trị thì KHÔNG vẽ dòng, không vẽ "—". */
const Row: React.FC<{ icon: string; label: string; value?: string | null }> = ({
  icon, label, value,
}) => {
  if (!value) return null;
  return (
    <View style={s.row}>
      <Icon name={icon} size={13} color={NATURE.barkSoft} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue} numberOfLines={2} selectable>{value}</Text>
    </View>
  );
};

export interface CandidateDetailSheetProps {
  candidate: LookupCandidate | null;
  onClose: () => void;
  /** Mở trang xuất xứ công khai theo mã `ORI-…`. */
  onOpenTrace: (code: string) => void;
}

const CandidateDetailSheet: React.FC<CandidateDetailSheetProps> = ({
  candidate, onClose, onOpenTrace,
}) => {
  const insets = useSafeAreaInsets();
  const c = candidate;
  const tree = c?.tree ?? null;
  const prov = provenanceOf(c);
  const anchored = isAnchored(prov);
  const code = tree?.code?.trim() || null;
  const page = safeHttpUrl(tree?.public_url);
  const chain = safeExplorerUrl(prov);

  const gps = Array.isArray(tree?.gps) && tree.gps.length >= 2
    ? `${tree.gps[0].toFixed(3)}, ${tree.gps[1].toFixed(3)}`
    : null;

  return (
    <Modal
      visible={c !== null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Đóng" />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, SPACE.lg) }]}>
        <View style={s.grabber} />

        <View style={s.head}>
          <View style={s.headText}>
            <Text style={TYPE.section} numberOfLines={1}>
              {c?.name?.trim() || 'Quả ứng viên'}
            </Text>
            <Text style={s.headHint} numberOfLines={1}>
              {[STATUS_VI[c?.status ?? ''] ?? c?.status, fmtDate(c?.enrolled_at)]
                .filter(Boolean).join(' · ') || 'Quả đã đăng ký công khai'}
            </Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12} style={s.closeBtn} accessibilityRole="button">
            <Icon name="xmark" size={15} color={NATURE.barkSoft} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
          {/* Ảnh: cuộn ngang khi máy chủ trả nhiều góc. */}
          {c && c.img_urls.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.photos}>
              {c.img_urls.map((u, i) => (
                <Image key={`${u}-${i}`} source={{ uri: u }} style={s.photo} resizeMode="cover" />
              ))}
            </ScrollView>
          ) : (
            <View style={[s.photo, s.photoEmpty]}>
              <Icon name="apple-whole" size={26} color={TONE.primary} />
            </View>
          )}

          {/* Câu nhắc nằm NGAY dưới ảnh — người ta quyết định lúc nhìn ảnh. */}
          <View style={s.warn}>
            <Icon name="circle-info" size={13} color={TONE.sun} />
            <Text style={s.warnTxt}>
              Máy chỉ so ảnh, chưa khẳng định đây là quả của bạn. So vết sẹo, mảng gai,
              vết nứt cuống rồi tự quyết.
            </Text>
          </View>

          <View style={s.block}>
            <Text style={s.blockTitle}>CÂY MẸ</Text>
            <Row icon="tree" label="Cây" value={tree?.name ?? null} />
            <Row icon="qrcode" label="Mã" value={code} />
            <Row icon="calendar" label="Trồng/đăng ký" value={fmtDate(tree?.created_at)} />
            {/* "Khu vực", KHÔNG phải "vị trí cây" — toạ độ đã bị làm thô. */}
            <Row icon="location-dot" label="Khu vực" value={gps} />
            {!tree && (
              <Text style={s.dim}>
                Máy chủ không trả thông tin cây mẹ cho quả này.
              </Text>
            )}
          </View>

          <View style={s.block}>
            <Text style={s.blockTitle}>BẰNG CHỨNG</Text>
            <View style={s.anchorRow}>
              <Icon
                name={anchored === true ? 'circle-check' : 'circle-info'}
                size={15}
                color={anchored === true ? TONE.primary : NATURE.barkSoft}
              />
              {/* Câu của máy chủ (`provenance.label`) thắng câu app tự soạn. */}
              <Text style={s.anchorTxt}>
                {prov?.label?.trim()
                  || (anchored === true ? 'Đã ghi lên chuỗi'
                    : anchored === false ? 'Chưa lên chuỗi' : 'Chưa rõ')}
              </Text>
            </View>
            {!!prov?.means?.trim() && <Text style={s.dim}>{prov.means.trim()}</Text>}
            <Row icon="circle-nodes" label="Mạng" value={prov?.network ?? null} />
            {!!c?.n_imgs && (
              <Row icon="images" label="Số góc đã lưu" value={String(c.n_imgs)} />
            )}
          </View>

          {code ? (
            <Pressable
              style={({ pressed }) => [s.primaryBtn, pressed && s.pressed]}
              onPress={() => onOpenTrace(code)}
              accessibilityRole="button"
            >
              <Icon name="file-pen" size={17} color={NATURE.paper} />
              <Text style={s.primaryTxt}>Xem hồ sơ xuất xứ</Text>
            </Pressable>
          ) : (
            <Text style={s.dim}>
              Quả này chưa có mã công khai để mở hồ sơ xuất xứ.
            </Text>
          )}

          {(page || chain) && (
            <View style={s.linkRow}>
              {!!page && (
                <Pressable
                  style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}
                  onPress={() => Linking.openURL(page).catch(() => { /* không mở được trình duyệt */ })}
                  accessibilityRole="button"
                >
                  <Icon name="arrow-up-right-from-square" size={13} color={TONE.primaryDeep} />
                  <Text style={s.ghostTxt}>Trang cây</Text>
                </Pressable>
              )}
              {!!chain && (
                <Pressable
                  style={({ pressed }) => [s.ghostBtn, pressed && s.pressed]}
                  onPress={() => Linking.openURL(chain).catch(() => { /* không mở được trình duyệt */ })}
                  accessibilityRole="button"
                >
                  <Icon name="circle-nodes" size={13} color={TONE.primaryDeep} />
                  <Text style={s.ghostTxt}>Bằng chứng trên chuỗi</Text>
                </Pressable>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};

export default CandidateDetailSheet;

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
  headText: { flex: 1, minWidth: 0 },
  headHint: { ...TYPE.caption, fontSize: 13, marginTop: 2 },
  closeBtn: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.sunken,
  },

  body: { paddingTop: SPACE.md, paddingBottom: SPACE.md, gap: SPACE.md },
  pressed: { opacity: 0.9 },

  photos: { gap: SPACE.sm, paddingRight: SPACE.sm },
  photo: {
    width: 132, height: 132, borderRadius: RADIUS.card,
    backgroundColor: SURFACE.sunken,
  },
  photoEmpty: { alignItems: 'center', justifyContent: 'center' },

  warn: {
    flexDirection: 'row', gap: SPACE.sm,
    backgroundColor: TONE.sunSoft,
    borderRadius: RADIUS.field,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
  },
  warnTxt: { flex: 1, fontSize: 12.5, lineHeight: 18, color: NATURE.bark },

  block: {
    borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: TONE.border,
    padding: SPACE.md, gap: SPACE.sm,
  },
  blockTitle: {
    fontSize: 10.5, letterSpacing: 0.8, fontWeight: '800', color: NATURE.barkSoft,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  rowLabel: { fontSize: 13, color: NATURE.barkSoft, width: 104 },
  rowValue: { flex: 1, fontSize: 14, fontWeight: '600', color: NATURE.bark },
  dim: { ...TYPE.caption, fontSize: 12.5 },

  anchorRow: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  anchorTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: NATURE.bark },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    minHeight: TOUCH_MIN, borderRadius: RADIUS.chip, backgroundColor: TONE.primary,
  },
  primaryTxt: { fontSize: 16, fontWeight: '700', color: NATURE.paper },

  linkRow: { flexDirection: 'row', gap: SPACE.sm, flexWrap: 'wrap' },
  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.sm,
    borderRadius: RADIUS.chip,
    borderWidth: 1, borderColor: TONE.border,
  },
  ghostTxt: { fontSize: 13.5, fontWeight: '700', color: TONE.primaryDeep },
});
