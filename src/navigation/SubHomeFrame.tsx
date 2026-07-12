// navigation/SubHomeFrame.tsx
//
// SG9 §5 — KHUNG SubHome THU GỌN (song song NavItemFrame của tab dưới). Component
// THUẦN TRÌNH BÀY, có kiểm soát (controlled): nhận app + tab active + usage/ghim,
// tự tra SUBHOME_FRAME → vẽ khung ~40dp dính đỉnh:
//
//   [ top-3 tab quen (icon + nhãn EN) ] ............................. [ ⌄ ]
//
// Chạm ⌄ → SỔ dropdown các tab dôi ra NGAY DƯỚI khung (overlay mỏng, KHÔNG đẩy nội
// dung, KHÔNG toàn màn). Chọn xong tự thu. Nền theo BRAND-COLOR app con (mờ) —
// truyền qua prop `brandColor`, KHÔNG hardcode hex (§8). Nhãn quốc gia = tooltip/
// accessibility (SubHome 1 dòng gọn — §5.2).
//
// Thêm khu cho app con = CLONE 1 DÒNG trong SUBHOME_FRAME (subHomeLabels.ts).
// KHÔNG sửa file này.

import * as React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { NEUTRAL, withAlpha } from '../shared/theme';
import {
  SUBHOME_FRAME,
  SUBHOME_HEIGHT,
  SUBHOME_VISIBLE_COUNT,
  rankSubTabs,
  subEn,
  subNational,
  type SubTab,
} from './subHomeLabels';

interface Props {
  /** Route app con (khoá SUBHOME_FRAME), vd 'ProofChatHome' | 'Farms'. */
  appRoute: string;
  /** Tab con đang mở. */
  activeKey: string;
  /** Người dùng chọn một tab con (visible hoặc trong dropdown). */
  onSelect: (key: string) => void;
  /** Tần suất mở từng tab (re-rank top-N). Mặc định {}. */
  usage?: Record<string, number>;
  /** Ghim tab con (đầu bảng, luôn hiển thị). null = chưa ghim. */
  pinned?: string[] | null;
  /** Màu thương hiệu app con — nền mờ + tint tab active. */
  brandColor: string;
  /** Số ô hiển thị (mặc định SUBHOME_VISIBLE_COUNT). */
  visibleCount?: number;
  style?: ViewStyle;
}

const SubHomeFrame: React.FC<Props> = ({
  appRoute,
  activeKey,
  onSelect,
  usage,
  pinned,
  brandColor,
  visibleCount = SUBHOME_VISIBLE_COUNT,
  style,
}) => {
  const tabs = React.useMemo(() => SUBHOME_FRAME[appRoute] ?? [], [appRoute]);
  const { visible, overflow } = React.useMemo(
    () => rankSubTabs(tabs, usage ?? {}, pinned ?? null, visibleCount),
    [tabs, usage, pinned, visibleCount],
  );

  const [open, setOpen] = React.useState(false);
  const chevronAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(chevronAnim, {
      toValue: open ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [open, chevronAnim]);

  // Không có tab con → không vẽ khung (app chưa khai SUBHOME_FRAME).
  if (tabs.length === 0) return null;

  const select = (key: string) => {
    setOpen(false);
    if (key !== activeKey) onSelect(key);
  };

  const bg = withAlpha(brandColor, 0.1); // nền mờ theo brand-color app con
  const activeText = brandColor;
  const dimText = NEUTRAL.textSub;

  const renderTab = (tab: SubTab, inRow: boolean) => {
    const focused = tab.key === activeKey;
    const color = focused ? activeText : dimText;
    return (
      <TouchableOpacity
        key={tab.key}
        style={inRow ? styles.tabItem : styles.dropdownItem}
        activeOpacity={0.7}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={subNational(tab)}
        onPress={() => select(tab.key)}
      >
        <Icon name={tab.icon} size={18} color={color} />
        <Text
          style={[
            inRow ? styles.tabLabel : styles.dropdownLabel,
            { color, fontWeight: focused ? '700' : '600' },
          ]}
          numberOfLines={1}
          allowFontScaling={false}
        >
          {subEn(tab)}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.wrap, style]}>
      {/* Khung thu gọn dính đỉnh */}
      <View style={[styles.bar, { height: SUBHOME_HEIGHT, backgroundColor: bg }]}>
        <View style={styles.row}>{visible.map((t) => renderTab(t, true))}</View>

        {/* Nút ⌄ — chỉ hiện khi CÓ tab dôi ra */}
        {overflow.length > 0 && (
          <TouchableOpacity
            style={styles.chevronBtn}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel={open ? 'Thu gọn' : 'Thêm mục'}
            onPress={() => setOpen((v) => !v)}
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: chevronAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '180deg'],
                    }),
                  },
                ],
              }}
            >
              <Icon name="chevron-down" size={22} color={brandColor} />
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>

      {/* Dropdown MỎNG ngay dưới khung — overlay tuyệt đối, KHÔNG đẩy nội dung */}
      {open && overflow.length > 0 && (
        <>
          {/* Vùng chạm ngoài để đóng (không tối màn — nhẹ nhàng) */}
          <Pressable style={styles.outside} onPress={() => setOpen(false)} />
          <View style={[styles.dropdown, { top: SUBHOME_HEIGHT }]}>
            {overflow.map((t) => renderTab(t, false))}
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    zIndex: 20,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    height: '100%',
  },
  tabLabel: {
    fontSize: 12,
    letterSpacing: 0.1,
  },
  chevronBtn: {
    width: 32,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Vùng chạm-ngoài phủ phần dưới khung để đóng dropdown khi chạm ra ngoài.
  outside: {
    position: 'absolute',
    top: SUBHOME_HEIGHT,
    left: 0,
    right: 0,
    height: 2000,
  },
  dropdown: {
    position: 'absolute',
    right: 8,
    minWidth: 160,
    borderRadius: 12,
    paddingVertical: 6,
    backgroundColor: NEUTRAL.card,
    borderWidth: 1,
    borderColor: NEUTRAL.border,
    shadowColor: NEUTRAL.black,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 10,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownLabel: {
    fontSize: 14,
  },
});

export default SubHomeFrame;
