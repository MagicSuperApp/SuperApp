/**
 * CỔNG SINH TRẮC Ở GỐC — mọi màn riêng tư nằm sau nó, mặc định ĐÓNG.
 *
 * ── Chỗ hỏng cái tệp này bịt ─────────────────────────────────────────────────
 * `Stack.Navigator` ở `navigation/index.tsx` đăng ký một bảng đường dẫn PHẲNG:
 * 53 màn host + 22 màn module là **anh em ruột** của nhau. Trong 75 màn đó,
 * ĐÚNG MỘT màn có cổng — `Main`, do `ProtectedMain` bọc (`index.tsx:1554`).
 * 74 màn còn lại mở thẳng, gồm cả:
 *
 *     SeedExport      — màn hiện 24 TỪ KHÔI PHỤC
 *     ExportIdentity  — xuất danh tính
 *     Guardian        — người bảo hộ
 *     ChatRoom        — hội thoại riêng của người dùng
 *     ContractDetail  — hợp đồng + tiền
 *     PhoenixWallet   — ví
 *
 * `ProtectedMain` không chạy khi điều hướng trỏ thẳng vào một màn anh em của
 * `Main` — nó không phải cha của chúng, nên không có cổng nào để vượt.
 *
 * ── Vì sao cổng này là cổng THẬT, không phải cổng chờ điều kiện đúng sẵn ─────
 * `index.tsx:1897` ghi rõ: *"Người dùng luôn phải xác thực sinh trắc mỗi phiên;
 * KHÔNG auto-login vào Main."* ⇒ `state.user.currentUser` là `null` ở mỗi lần
 * khởi động lạnh, tới khi người dùng qua được sinh trắc thật ở `LoginScreen`.
 * Nên `!user` KHÔNG phải điều kiện đã đúng sẵn lúc dựng — nó là kết quả của một
 * lần xác thực. Đây là chỗ khác hẳn với ý "giữ liên kết lại chờ cổng mở" đã bị
 * bác trước đó: cổng này CHẶN, không xếp hàng rồi nhả.
 *
 * Dùng ĐÚNG một nguồn với `ProtectedMain` (`state.user.currentUser`) — cố ý.
 * Thêm nguồn thứ hai (`auth_token` trong AsyncStorage, 5 dịch vụ đang đọc
 * thẳng) là dựng hai chân lý cho cùng một câu hỏi "phiên còn mở không".
 * Việc gộp hai nguồn đó là việc RIÊNG, chưa làm ở đây.
 *
 * ── Mặc định ĐÓNG ───────────────────────────────────────────────────────────
 * Cổng áp bằng phép LOẠI TRỪ: màn nào không có tên trong `PUBLIC_ROUTES` thì
 * được bọc. Nên **một màn mới thêm vào navigator là màn ĐÃ CÓ CỔNG** mà không
 * ai phải nhớ làm gì. Muốn mở một màn ra ngoài thì phải gõ tay tên nó vào danh
 * sách dưới đây — và lúc đó là một quyết định nhìn thấy được trong diff.
 */
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import type { RootState } from '../store';
import { COLORS } from '../theme';

/**
 * Màn MỞ ĐƯỢC khi chưa có phiên. Ba nhóm, mỗi nhóm một lý do đo được:
 *
 * 1. Đường VÀO — không mở thì không ai đăng nhập được lần đầu.
 * 2. Đường LẤY LẠI QUYỀN — người mất máy phải tới được đây khi chưa có phiên.
 * 3. Đường NGƯỜI MUA — người cầm sản phẩm trên tay, không có tài khoản, quét mã
 *    để tra nguồn gốc. `TraceScanScreen` và `TraceResultScreen` không đọc
 *    `state.user` một lần nào (grep cả hai tệp: 0 kết quả) — chúng thật sự
 *    không cần phiên, chứ không phải đang lách.
 *
 * Không có tên nào ở đây được thêm vì "cho tiện". Thêm một tên là mở một cửa.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  // 1 — đường vào
  'LanguageSelect',
  'Onboarding',
  'Login',
  'Terms',
  'WebPage', // chỉ `OnboardingScreen.tsx:86` mở, kèm URL cố định
  // Màn HỎI ở cửa vào — nó đứng TRƯỚC cả `SignUpBiometric` lẫn `RestoreIdentity`,
  // nên đóng nó lại là đóng luôn cả hai đường đã mở bên dưới. Màn không đọc
  // `state.user` một lần nào và không hiện dữ liệu nào của người dùng: nó chỉ
  // hỏi một câu rồi điều hướng.
  'IdentityEntryChoice',
  'SignUpBiometric',
  'SignUpComplete',
  // 2 — đường lấy lại quyền
  'RestoreIdentity',
  // 3 — đường người mua (không tài khoản)
  'TraceScan',
  'TraceResult',
  'FruitLookup',
  'TraceNews',
];

/**
 * Màn TUYỆT ĐỐI không được nằm trong `PUBLIC_ROUTES`. Đây không phải danh sách
 * đủ — nó là bộ chốt cho các màn mà mở ra ngoài là mất tiền hoặc mất danh tính
 * của người thật, để một lần sửa nhầm danh sách trên thì bài kiểm đỏ ngay chứ
 * không đợi tới lúc có người mất.
 */
export const NEVER_PUBLIC_ROUTES: readonly string[] = [
  'SeedExport',
  'ExportIdentity',
  'Guardian',
  'SignRequest',
  'PhoenixWallet',
  'Staking',
  'ChatRoom',
  'ContractDetail',
  'Contracts',
  'ProofChatWallet',
  'ProofChatEscrow',
  'BiometricSettings',
  'DeleteAccount',
  'Main',
];

export function isPublicRoute(routeName: string): boolean {
  return PUBLIC_ROUTES.includes(routeName);
}

type ScreenComponent = React.ComponentType<any>;

/** Phần chặn thật. Tách riêng để bài kiểm dựng được nó mà không cần navigator. */
export const AuthGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigation = useNavigation<any>();
  const user = useSelector((state: RootState) => state.user.currentUser);

  React.useEffect(() => {
    if (!user) {
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    }
  }, [navigation, user]);

  // CHƯA có phiên ⇒ KHÔNG dựng màn con. Không render-rồi-che, không nhả rồi
  // thu lại: màn riêng tư không được chạy lấy một khung hình, vì chỉ một khung
  // hình của `SeedExport` là đủ để chụp màn hình 24 từ.
  if (!user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.bg,
        }}
      >
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }

  return <>{children}</>;
};

// Nhớ lại component đã bọc: `Stack.Screen` so sánh `component` theo tham chiếu,
// sinh mới mỗi lần dựng là màn bị tháo/lắp lại sau mỗi lượt render của
// navigator — mất hết state của màn đang mở.
const GATED_CACHE = new Map<ScreenComponent, ScreenComponent>();

/**
 * Bọc một màn bằng cổng, TRỪ khi tên nó nằm trong `PUBLIC_ROUTES`.
 * Trả về chính component cũ cho màn công khai — không thêm một lớp nào.
 */
export function gateScreen(routeName: string, Component: ScreenComponent): ScreenComponent {
  if (isPublicRoute(routeName)) return Component;

  const cached = GATED_CACHE.get(Component);
  if (cached) return cached;

  const Gated: ScreenComponent = (props: any) => (
    <AuthGate>
      <Component {...props} />
    </AuthGate>
  );
  Gated.displayName = `Gated(${Component.displayName || Component.name || routeName})`;
  GATED_CACHE.set(Component, Gated);
  return Gated;
}
