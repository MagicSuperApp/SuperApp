// components/genie/GenieSectionsPanel.tsx
//
// PANEL CÀI ĐẶT của Lớp Trợ lý — danh sách các cuộc trò chuyện.
//
// Mở bằng nút menu ở góc TRÊN BÊN TRÁI của lớp phủ.
//
// ── §3 KHÔNG áp cho panel này, cố ý ────────────────────────────────────────
// Lớp phủ trợ lý là KÍNH TỐI: nhìn xuyên được, vì màn bên dưới vẫn là ngữ cảnh
// của câu đang hỏi. Panel này thì ngược lại — chủ sở hữu chốt *"panel này không
// có opacity ở nền"*, và đó là quyết định đúng chứ không phải khác biệt tuỳ hứng:
//
//   · Đây là chỗ ĐỌC MỘT DANH SÁCH, không phải chỗ nói chuyện. Chữ nhỏ, xếp dày,
//     mỗi dòng một cái tên phải nhận ra được trong một cái liếc. Nền trong suốt
//     làm chữ nhỏ nằm trên một cái nền đang động đậy — ba dải sóng vẫn chạy phía
//     sau — và không có cỡ chữ nào cứu được chuyện đó.
//   · Đây cũng là chỗ có nút XOÁ. Một nút xoá đặt trên nền nhìn xuyên được là một
//     nút mà người ta không chắc mình đang bấm vào cái gì.
//
// Nên `SURFACE` dưới đây là mã màu ĐẶC, không có kênh alpha. Đừng đổi nó sang
// `rgba(...)` cho "hợp tông" — nó không hợp tông là có lý do.
//
// ── Vì sao trượt ra từ BÊN TRÁI ────────────────────────────────────────────
// Panel phải mọc ra từ chính cái nút mở nó. Nút ở góc trên trái, panel trượt từ
// trái — đường đi của hình nói cho mắt biết cái vừa hiện ra đến từ đâu, và đó là
// thứ rẻ nhất mà một hoạt ảnh có thể mua được.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../../i18n';
import { showWarning } from '../../utils/alert';
import {
  deleteSection,
  newSection,
  selectSection,
  useGenie,
  type GenieSection,
} from './genieController';

// ── Bảng màu ĐẶC ───────────────────────────────────────────────────────────
// Không mã nào có alpha (xem lời dẫn đầu tệp). Cùng họ lục-đen với lớp phủ để nó
// vẫn là một phần của trợ lý, chỉ là phần ĐỨNG YÊN.
const SURFACE = '#05130E';
const SURFACE_RAISED = '#0B1F18';
const SURFACE_ACTIVE = '#123528';
const LINE = '#16332A';
const TEXT = '#ECFDF5';
const MUTED = '#82A797';
const NEON = '#5BE9A6';
/** Màn còn lại bị làm tối — đây KHÔNG phải nền panel, nó là phần ngoài panel. */
const SCRIM = 'rgba(0, 6, 4, 0.55)';

const PANEL_MAX_W = 360;
const SLIDE_MS = 220;

/**
 * Nhãn thời gian NGẮN, viết như người nói.
 *
 * "14:30" cho hôm nay, "Hôm qua" cho hôm qua, ngày/tháng cho xa hơn. Không viết
 * "2 giờ trước": nó phải tính lại mỗi khi màn vẽ, và với một danh sách đứng yên
 * thì nó chỉ là một con số cũ dần đi trước mắt người đọc.
 */
export function nhanThoiGian(at: number, now = Date.now()): string {
  const d = new Date(Number(at) || 0);
  if (!at || !Number.isFinite(d.getTime())) return '';
  const n = new Date(now);
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === n.toDateString()) return hm;
  const homQua = new Date(now);
  homQua.setDate(homQua.getDate() - 1);
  if (d.toDateString() === homQua.toDateString()) return `${t('Hôm qua')} ${hm}`;
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/** Số câu, nói bằng tiếng người. Cuộc chưa có câu nào thì KHÔNG nói "0 câu". */
export function nhanSoCau(n: number): string {
  return n > 0 ? `${n} ${t('câu')}` : t('chưa có câu nào');
}

interface Props {
  onClose: () => void;
}

const GenieSectionsPanel: React.FC<Props> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const g = useGenie();
  const W = Math.min(PANEL_MAX_W, Math.round(width * 0.86));

  const slide = useRef(new Animated.Value(0)).current;
  const [dong, setDong] = useState(false);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: dong ? 0 : 1,
      duration: SLIDE_MS,
      useNativeDriver: true,
    }).start(({ finished }) => {
      // Chỉ báo cho bên ngoài SAU khi hoạt ảnh đóng chạy xong. Gỡ panel ngay lúc
      // bấm thì nó biến mất phựt một cái, và mắt không theo kịp là cái gì vừa
      // đóng lại.
      if (finished && dong) onClose();
    });
  }, [dong, slide, onClose]);

  const dongLai = useCallback(() => setDong(true), []);

  const chon = useCallback((id: string) => {
    selectSection(id);
    dongLai();
  }, [dongLai]);

  const moCuocMoi = useCallback(() => {
    newSection();
    dongLai();
  }, [dongLai]);

  /**
   * Xoá phải HỎI LẠI.
   *
   * Đây là nơi duy nhất trong trợ lý mà một cú chạm làm mất dữ liệu của người
   * dùng, và nút xoá lại nằm ngay cạnh nút mở — ngón tay của người quen cầm cuốc
   * trượt một li là xoá nhầm cả cuộc trao đổi. Không có hoàn tác, nên phải có
   * một câu hỏi.
   *
   * Hỏi bằng popup CỦA APP (`utils/alert`), không bằng `Alert` của hệ điều hành:
   * kho này đã chuyển hết 37 chỗ gọi sang đó, và `i18n/alertCallSites.test.ts`
   * canh đúng chuyện ấy. Hai kiểu hộp thoại trong một app là người dùng gặp cái
   * nào tuỳ màn hình họ đang đứng.
   */
  const xoa = useCallback((s: GenieSection) => {
    showWarning(
      t('Xoá cuộc này?'),
      `“${s.title}” — ${t('xoá rồi thì không lấy lại được ạ.')}`,
      {
        confirmText: t('Xoá'),
        cancelText: t('Thôi'),
        onConfirm: () => deleteSection(s.id),
      },
    );
  }, []);

  // Cuộc trống KHÔNG hiện trong danh sách, trừ khi nó là cuộc đang mở: một dòng
  // "chưa có câu nào" cho mỗi lần mở lớp rồi đổi ý sẽ đẩy mọi cuộc thật xuống dưới.
  const list = g.sections.filter((s) => s.messages.length > 0 || s.id === g.activeId);

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* Phần NGOÀI panel: làm tối và bấm vào là đóng. Panel là chỗ đọc; chạm ra
          ngoài nó rõ ràng là "tôi xong rồi". */}
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: slide }]}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={dongLai}
          accessibilityRole="button"
          accessibilityLabel={t('Đóng danh sách')}
        />
      </Animated.View>

      <Animated.View
        style={[
          styles.panel,
          {
            width: W,
            paddingTop: insets.top + 10,
            paddingBottom: insets.bottom + 10,
            transform: [{
              translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-W, 0] }),
            }],
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('Cuộc trò chuyện')}</Text>
            <Text style={styles.sub}>
              {list.length} {t('cuộc')} · {t('giữ lại trên máy')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={dongLai}
            style={styles.headBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel={t('Đóng danh sách')}
          >
            <Icon name="chevron-left" size={24} color={MUTED} />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          onPress={moCuocMoi}
          style={styles.newBtn}
          accessibilityRole="button"
          accessibilityLabel={t('Mở cuộc trò chuyện mới')}
        >
          <Icon name="plus" size={18} color="#04231A" />
          <Text style={styles.newText}>{t('Cuộc mới')}</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listBody}
          showsVerticalScrollIndicator={false}
        >
          {list.length === 0 && (
            <Text style={styles.empty}>
              {t('Chưa có cuộc nào ạ. Bác hỏi em một câu là nó hiện ra ở đây.')}
            </Text>
          )}

          {list.map((s) => {
            const dangMo = s.id === g.activeId;
            return (
              <TouchableOpacity
                key={s.id}
                onPress={() => chon(s.id)}
                activeOpacity={0.75}
                style={[styles.row, dangMo && styles.rowActive]}
                accessibilityRole="button"
                accessibilityState={{ selected: dangMo }}
                accessibilityLabel={s.title}
              >
                {/* Vạch sáng bên trái cho cuộc đang mở. Chỉ đổi màu nền thì trên
                    màn ngoài nắng gắt hai sắc đen gần nhau nhìn ra một. */}
                <View style={[styles.mark, dangMo && styles.markOn]} />
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowTitle, dangMo && styles.rowTitleOn]}
                    numberOfLines={1}
                  >
                    {s.title}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {nhanSoCau(s.messages.length)}
                    {s.messages.length > 0 ? ` · ${nhanThoiGian(s.touched)}` : ''}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => xoa(s)}
                  style={styles.rowDel}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`${t('Xoá')} ${s.title}`}
                >
                  <Icon name="trash-can-outline" size={17} color={MUTED} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Nói thẳng lịch sử sống ở đâu và mất lúc nào. Người dùng có quyền biết
            máy đang giữ gì của mình — nhất là trên một chiếc máy dùng chung. */}
        <Text style={styles.foot}>
          {t('Lịch sử chỉ nằm trên máy này và sẽ xoá khi bác đăng xuất.')}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: { backgroundColor: SCRIM },

  // NỀN ĐẶC. Xem lời dẫn đầu tệp trước khi đổi.
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: SURFACE,
    borderRightWidth: 1,
    borderRightColor: LINE,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 14,
    gap: 10,
  },
  headerText: { flex: 1 },
  title: { color: TEXT, fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  sub: { color: MUTED, fontSize: 12, marginTop: 3 },
  headBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SURFACE_RAISED,
  },

  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginHorizontal: 16,
    marginBottom: 12,
    // Ngón tay của người quen cầm cuốc. 48 là sàn, ở đây không hạ.
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: NEON,
  },
  newText: { color: '#04231A', fontSize: 15, fontWeight: '800' },

  list: { flex: 1 },
  listBody: { paddingHorizontal: 12, paddingBottom: 12, gap: 6 },
  empty: {
    color: MUTED,
    fontSize: 13.5,
    lineHeight: 20,
    paddingHorizontal: 8,
    paddingTop: 10,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingRight: 6,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: SURFACE_RAISED,
    minHeight: 56,
  },
  rowActive: { backgroundColor: SURFACE_ACTIVE },
  mark: {
    width: 3,
    alignSelf: 'stretch',
    marginVertical: 8,
    marginLeft: 8,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  markOn: { backgroundColor: NEON },
  rowText: { flex: 1, gap: 3 },
  rowTitle: { color: TEXT, fontSize: 14.5, fontWeight: '600' },
  rowTitleOn: { color: NEON },
  rowMeta: { color: MUTED, fontSize: 11.5 },
  rowDel: { padding: 8 },

  foot: {
    color: MUTED,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: LINE,
  },
});

export default GenieSectionsPanel;
