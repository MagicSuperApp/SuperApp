// services/genie/genieAuth.ts
//
// Nối trợ lý vào danh tính THẬT của app — một tệp, một việc.
//
// ════════════════════════════════════════════════════════════════════════════
//  VÌ SAO LÀ THẺ ORILIFE, KHÔNG PHẢI THẺ PHIÊN PHOENIXKEY
// ════════════════════════════════════════════════════════════════════════════
//
// Genie hành động NHÂN DANH người dùng trên dữ liệu nông trại: đọc vườn, ghi
// nhật ký chăm sóc, đọc dòng thời gian. Mọi cửa đó ở `api.orilife.io` và đều
// đòi `Authorization: Bearer <auth_token>` — thẻ do `orilifeDidAuth.ts` đúc ra
// bằng cách **ký một challenge bằng khoá riêng trong Secure Enclave/Keystore**.
//
// Khoá ấy KHÔNG rời khỏi máy. Nên **máy chủ Genie không tự đúc được thẻ**, và
// đường duy nhất là vỏ trao thẻ ĐÃ ĐÚC cho nó lúc mở phiên.
//
// Đó không phải một lỗ hổng — nó là cùng tính chất khiến T3 (tiền, khoá) là
// **bất khả thi về cấu trúc** chứ không chỉ bị cấm: máy chủ không có gì để ký,
// nên nó không ký được gì. Thẻ này mở được đúng cửa dữ liệu nông trại, và sổ
// tool cũng không có đường nào tới ví hay khoá khôi phục.
//
// Genie KIỂM thẻ đó ở `GET /api/me` rồi mới mở phiên — nó không tin lời vỏ về
// việc mình đang phục vụ ai, vì hạn mức và mọi lời ghi đều treo vào cái "ai" đó.
//
// ── VÌ SAO TÁCH RA KHỎI `genieAgent.ts` ────────────────────────────────────
// `genieAgent` nhận một `AuthPort` tiêm vào chứ không tự nhập `orilifeDidAuth`.
// Nếu nó nhập thẳng, mọi bài kiểm của trợ lý sẽ kéo theo cả cây danh tính —
// Secure Enclave, kho khoá, `react-native-keychain` — và một bài kiểm phải dựng
// chừng đó thứ mới chạy được là một bài kiểm sẽ bị tắt đi.

import { setGenieAuth, resetGenieSession, warmGenie } from './genieAgent';
import { clearSections } from '../../components/genie/genieController';
import { clearGenieHistory } from '../../components/genie/genieHistory';
import { ORILIFE_BASE } from '../orilifeBase';

/** Khoá kho giữ thẻ OriLife. Cùng một khoá với 5 service ReID — không đẻ khoá thứ hai. */
const AUTH_TOKEN_KEY = 'auth_token';

/**
 * Gọi ở `onReady` của `NavigationContainer`.
 *
 * Nhập TRỄ (`require` trong thân hàm) chứ không ở đầu tệp: `orilifeDidAuth` chạm
 * Secure Enclave và `AsyncStorage` ngay lúc nạp module. Nhập ở đầu
 * `navigation/index.tsx` là kéo chừng đó việc vào đường khởi động của app, cho
 * một tính năng mà đa số phiên không dùng tới.
 */
export function installGenieAuth(): void {
  setGenieAuth({
    token: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { ensureOrilifeToken } = require('../orilifeDidAuth') as {
          ensureOrilifeToken: (base: string) => Promise<boolean>;
        };
        // LÀM MỚI TRƯỚC KHI ĐƯA. Thẻ cũ thì Genie cầm một thứ vô dụng, và mọi
        // tool trả 401 — mà 401 từ ba lớp sâu đọc ra thành "trợ lý hỏng", không
        // thành "bác đăng nhập lại giúp em".
        //
        // ⚠ `ensureOrilifeToken` cũng là chỗ chặn ca máy dùng chung ngoài đồng:
        // người A đăng xuất, người B đăng nhập, thẻ cũ còn trong kho. Nó kiểm
        // thẻ thuộc về ĐÚNG DID đang đăng nhập rồi mới trả `true` — thiếu bước
        // này thì Genie đi ra máy chủ mang danh người A.
        const ok = await ensureOrilifeToken(ORILIFE_BASE);
        if (!ok) return null;

        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const t = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
        return t && String(t).trim() ? String(t).trim() : null;
      } catch {
        // Chưa đăng nhập, kho khoá không mở được, hoặc người dùng từ chối sinh
        // trắc. Cả ba dẫn tới cùng một chỗ: không có thẻ ⇒ trợ lý lui về đường
        // tắt trên máy. Đó là hành vi ĐÚNG — không có danh tính thì không có gì
        // để làm hộ ai cả.
        return null;
      }
    },

    /**
     * Máy chủ vừa bác thẻ này (401) ⇒ vứt đi.
     *
     * Không vứt thì `ensureOrilifeToken` thấy thẻ còn nằm trong kho, trả `true`,
     * và lần sau mình lại đem đúng cái thẻ hỏng đi một vòng nữa — người dùng bấm
     * gửi mười lần, mười lần cùng một lỗi.
     */
    forget: () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        void AsyncStorage.removeItem(AUTH_TOKEN_KEY);
      } catch { /* kho khoá không mở được — lần sau ký lại vẫn được */ }
      resetGenieSession();
    },

    deviceId: async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const { getDeviceId } = require('../proofchat-api') as {
          getDeviceId: () => Promise<string>;
        };
        return await getDeviceId();
      } catch {
        // Không lấy được id máy thì vẫn mở phiên được — id máy dùng để CHỐNG SPAM
        // (§12.3), không để xác thực. Trả một chuỗi nói rõ nó là chuỗi thay thế,
        // chứ không bịa ra một UUID trông như thật.
        return 'unknown-device';
      }
    },
  });

  // Mở phiên SẴN — xem `warmGenie`. Chạy nền, không chặn `onReady`: đường khởi
  // động của app không được chờ một tính năng phụ.
  warmGenie();
}

/**
 * Đổi danh tính / đăng xuất ⇒ quên phiên trợ lý.
 *
 * Bắt buộc, không phải dọn dẹp cho gọn: phiên Genie đang giữ thẻ của người CŨ.
 * Không quên thì câu hỏi của người mới đi ra máy chủ mang danh người cũ — đúng
 * lỗi `orilifeDidAuth.ts` đã đo được ngày 28/08 trên máy dùng chung ngoài đồng.
 */
export function clearGenieAuth(): void {
  resetGenieSession();
  // Và LỊCH SỬ TRÒ CHUYỆN đi cùng, cả trong bộ nhớ lẫn trên máy.
  //
  // Cùng một luật, cùng một lý do: ngoài đồng chiếc máy dùng chung cho cả tổ.
  // Thẻ của người cũ mà ở lại thì Genie đi ra máy chủ mang danh họ; câu hỏi của
  // người cũ mà ở lại thì người sau mở panel ra đọc được vườn nhà ai, hỏi gì về
  // bệnh gì. Cái thứ hai không làm sai một lời ghi nào, nhưng nó là chuyện riêng
  // của người ta.
  clearSections();
  clearGenieHistory();
}
