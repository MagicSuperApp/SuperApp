// navigation/useVisibleTabs.ts
//
// SG9 §2.3 — RÀNG BUỘC ỔN ĐỊNH cho tab-bar persona-adaptive (khử "rối / lạc khi
// đổi vai"). Bọc hàm thuần `resolveVisibleTabs` bằng vòng đời React:
//
//   1. ĐÓNG BĂNG THEO PHIÊN (§2.3.2): danh sách ô HIỂN THỊ tính MỘT LẦN từ tín
//      hiệu lúc vào phiên — KHÔNG đổi theo màn. useMemo chỉ tái tính khi (a) ghim
//      đổi, (b) vượt ngưỡng farm — nên farm state đổi giữa phiên KHÔNG xáo thanh.
//   2. TỐI ĐA 1 ĐỔI/PHIÊN + TOAST (§2.3.3): baseline chưa có Farm trên thanh
//      (shipper) mà user vừa tạo vườn ĐẦU TIÊN → thêm Farm, đúng 1 lần, kèm toast
//      "Đã thêm Farm vào thanh vì bạn vừa tạo vườn." KHÔNG bao giờ đảo thầm lặng.
//   3. GHIM ĐÈ TẤT CẢ (§2.3.4): `nav_tabs_pinned_v1` nạp từ AsyncStorage; ghim rồi
//      thì persona không đổi nữa.
//
// CHỈ ĐỌC (state.farm + AsyncStorage) — KHÔNG ghi, KHÔNG chạm logic module.

import * as React from 'react';
import { useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';
import type { RootState } from '../store';
import { DEFAULT_INSTANCE } from '../config/instance.config';
import {
  resolveVisibleTabs,
  resolvePersona,
  PINNED_TABS_KEY,
  type UsageMap,
} from './resolveVisibleTabs';

interface Options {
  /** Route có tồn tại trong instance này không (lọc slot cho instance suy biến). */
  isAvailable?: (route: string) => boolean;
}

export function useVisibleTabs(opts?: Options): string[] {
  const isAvailable = opts?.isAvailable;

  // Tín hiệu domain — ĐỌC state.farm bằng selector SCALAR (số) để referentially
  // ổn định, tránh re-render thừa từ mọi thay đổi store.
  const farms = useSelector((s: RootState) => s.farm.farms.length);
  const trees = useSelector((s: RootState) => s.farm.trees.length);
  const fruits = useSelector((s: RootState) => s.farm.fruits.length);
  const hasFarm = farms > 0 || trees > 0 || fruits > 0;

  // Usage: CHƯA có nguồn (slice hoạt động Work) → {} — seam sẵn sàng cho về sau.
  const usageRef = React.useRef<UsageMap>({});

  // Ghim của user (nạp 1 lần). null = chưa ghim → theo persona.
  const [pinned, setPinned] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(PINNED_TABS_KEY)
      .then((v) => {
        if (!alive || !v) return;
        try {
          const arr = JSON.parse(v);
          if (Array.isArray(arr)) {
            setPinned(arr.filter((x): x is string => typeof x === 'string'));
          }
        } catch {
          /* ghim hỏng → bỏ qua, dùng persona */
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // Persona baseline (chốt lúc vào phiên) + cờ "đã đổi 1 lần" cho ngưỡng.
  const baselinePersonaRef = React.useRef(
    resolvePersona({ farms, trees, fruits }, usageRef.current),
  );
  const changedRef = React.useRef(false);
  const [nonce, bump] = React.useReducer((n: number) => n + 1, 0);

  // Vượt ngưỡng (§2.3.3): baseline = shipper (Farm KHÔNG trên thanh) mà user vừa
  // có farm → thêm Farm, đúng 1 lần/phiên, kèm toast. Ghim thì không tự đổi.
  React.useEffect(() => {
    if (changedRef.current) return;
    if (pinned && pinned.length > 0) return;
    if (baselinePersonaRef.current === 'shipper' && hasFarm) {
      changedRef.current = true;
      baselinePersonaRef.current = 'farmer';
      bump();
      Toast.show({
        type: 'info',
        text1: 'Đã thêm Farm vào thanh',
        text2: 'vì bạn vừa tạo vườn.',
      });
    }
  }, [hasFarm, pinned]);

  // ĐÓNG BĂNG: chỉ tái tính khi ghim/nonce đổi — KHÔNG theo farm state giữa phiên.
  // (farm signal cố tình NẰM NGOÀI deps để thanh không xáo theo màn.)
  return React.useMemo(
    // Bảng ưu tiên của APP ĐANG CHẠY — không phải hằng của nền dùng chung.
    () => resolveVisibleTabs(
      { farms, trees, fruits }, usageRef.current, pinned, isAvailable,
      DEFAULT_INSTANCE.slotPriority,
    ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pinned, nonce],
  );
}
