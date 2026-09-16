// bootstrap.template.ts — KHUÔN, không phải mã chạy.
//
// `create-test-identity.sh` chép tệp này thành `src/devTestIdentityBootstrap.ts`,
// thay các ô `__…__` bằng giá trị thật, chạy xong thì XOÁ đi.
//
// ── Vì sao là khuôn vá vào lúc chạy, không phải một nhánh `if (__DEV__)` ────────
// Lời hứa của sản phẩm neo vào một câu: *khoá danh tính chỉ sinh ra sau một lượt
// sinh trắc của chính người dùng*. Tệp này đi vòng qua đúng câu đó — nó tạo danh
// tính mà không ai chạm vào máy.
//
// `__DEV__` KHÔNG đủ để giữ lời hứa ấy. Nó là cờ cắt ở tầng đóng gói: mã vẫn nằm
// trong cây nguồn, vẫn đi qua mọi bước dựng, và chỉ bị loại ở bước cuối. So với
// nhánh máy ảo trong `PhoenixKeyModule.swift:56` — thứ dùng `#if
// targetEnvironment(simulator)` của trình biên dịch nên lát `iphoneos` **không
// mang một byte nào** — thì `__DEV__` yếu hơn hẳn một bậc.
//
// Cách duy nhất chứng minh bản phát hành không mang đường tắt này là: lúc dựng,
// đường tắt KHÔNG CÓ MẶT trong cây nguồn. Nên nó sống ở đây, dưới đuôi
// `.template.ts` mà `tsconfig`/Metro/Jest đều không nhận là mã.
//
// ── Kết quả đi ra bằng tệp, không bằng nhật ký ─────────────────────────────────
// Đọc nhật ký để biết script xong hay chưa là đọc một kênh mà mọi thư viện khác
// cũng đang ghi vào. Tệp kết quả thì hoặc có hoặc không, và script đọc được thẳng
// từ hộp dữ liệu của app qua `simctl get_app_container`.

import { registerIdentity } from './services/phoenixKeyAuthService';
import { wipeLocalIdentity } from './services/accountDeletionService';
import { currentUserDid, isKeypairEnrolled } from './sdk/phoenixKey';

const RESULT_FILE = '__RESULT_FILE__';
const USERNAME = '__USERNAME__';
const RESET = __RESET__;
const BOOT_DELAY_MS = __BOOT_DELAY_MS__;

type Stage =
  | 'boot'
  | 'reset'
  | 'already-present'
  | 'register'
  | 'done';

type Result =
  | { ok: true; did: string; txHash: string; username: string; reused: boolean; at: string }
  | { ok: false; stage: Stage; message: string; name?: string; at: string; logs: string[] };

// ── Vì sao phải hứng console ở đây ────────────────────────────────────────────
// `friendlyRegisterError` (phoenixKeyAuthService.ts:789) ghi nguyên nhân THẬT ra
// `console.warn` rồi trả về một câu chung chung cho giao diện. Trên máy ảo,
// `console` của React Native đi về Metro — KHÔNG vào nhật ký hệ điều hành, nên
// `simctl log show` không thấy gì, và script bên ngoài chỉ nhận được câu chung
// chung ấy. Một bộ đệm vòng ở đây là cách duy nhất để nguyên nhân đi ra cùng kết
// quả, thay vì nằm lại trong một cửa sổ terminal ai đó phải đang mở sẵn.
const LOGS: string[] = [];
const LOG_TOI_DA = 40;

/** Che thẻ phiên và chuỗi hex dài trước khi ghi xuống đĩa. */
function cheBiMat(s: string): string {
  return s
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g, '<đã che: thẻ>')
    .replace(/\b[0-9a-fA-F]{64,}\b/g, '<đã che: hex dài>');
}

function hungConsole(): void {
  (['warn', 'error'] as const).forEach((muc) => {
    const goc = console[muc].bind(console);
    console[muc] = (...args: unknown[]) => {
      try {
        if (LOGS.length < LOG_TOI_DA) {
          LOGS.push(
            cheBiMat(
              `[${muc}] ` +
                args
                  .map((a) => {
                    if (a instanceof Error) {
                      const extra = a as Error & { code?: unknown; httpStatus?: unknown };
                      return `${a.name}(code=${String(extra.code)}, http=${String(
                        extra.httpStatus,
                      )}): ${a.message}`;
                    }
                    try {
                      return typeof a === 'string' ? a : JSON.stringify(a);
                    } catch {
                      return String(a);
                    }
                  })
                  .join(' '),
            ).slice(0, 600),
          );
        }
      } catch {
        /* hứng log KHÔNG được phép làm hỏng lượt chạy */
      }
      goc(...args);
    };
  });
}
hungConsole();

async function writeResult(payload: Result): Promise<void> {
  // Cùng lối nạp trễ mà `videoUploadQueue.ts:77` đang dùng: nhánh `/legacy` là
  // nhánh DUY NHẤT có `documentDirectory` + `writeAsStringAsync`.
  const FileSystem = require('expo-file-system/legacy');
  await FileSystem.writeAsStringAsync(
    FileSystem.documentDirectory + RESULT_FILE,
    JSON.stringify(payload, null, 2),
    { encoding: 'utf8' },
  );
  console.log('[dev-identity] đã ghi kết quả:', JSON.stringify(payload));
}

let stage: Stage = 'boot';

async function run(): Promise<void> {
  if (RESET) {
    stage = 'reset';
    // ⚠ PHẢI là `wipeLocalIdentity()`, KHÔNG phải `wipeIdentity()`.
    //
    // `wipeIdentity()` xoá khoá HW + con trỏ alias + DID + thẻ phiên, nhưng KHÔNG
    // đụng Master_KEK của ví (`masterKekStore.ts` tự khai đúng điều đó). Khoá TAAD
    // suy ra từ KEK ấy nên nó sống sót, và lượt đăng ký tiếp theo bị máy chủ bác:
    //
    //   PhoenixKeyApiError(code=3005, http=409)
    //   "Public key already registered — TAAD public key đã được bind vào một DID khác"
    //
    // Đo được ở đúng script này, lượt chạy thật đầu tiên (15/09/2026).
    //
    // `wipeLocalIdentity()` (accountDeletionService.ts:60) làm đủ bốn việc theo
    // ĐÚNG thứ tự: wipeIdentity → clearMasterKek → clearOrilifeToken →
    // AsyncStorage.clear. Thứ tự đó không tuỳ tiện — đảo lại thì khoá đã xoay
    // thành khoá mồ côi không ai xoá được nữa.
    //
    // Bất khả hồi. Chỉ chạy khi script được gọi kèm `--reset`, và chỉ trên máy ảo.
    await wipeLocalIdentity();
  }

  const [did, hasKey] = await Promise.all([currentUserDid(), isKeypairEnrolled()]);
  if (did && hasKey) {
    // Máy đã có danh tính và script KHÔNG được bảo xoá. Trả về cái đang có thay vì
    // tạo thêm một DID thứ hai — đúng chiều mà `primaryCta` chọn ở màn đăng nhập.
    stage = 'already-present';
    await writeResult({
      ok: true,
      did,
      txHash: '',
      username: USERNAME,
      reused: true,
      at: new Date().toISOString(),
    });
    return;
  }

  stage = 'register';
  // 'face' khớp với thứ máy ảo mô phỏng; 'new-person' vì tới đây chắc chắn máy
  // chưa có khoá (nhánh trên đã trả về).
  const { user, txHash } = await registerIdentity('face', 'new-person', USERNAME);

  stage = 'done';
  await writeResult({
    ok: true,
    did: user.did,
    txHash,
    username: USERNAME,
    reused: false,
    at: new Date().toISOString(),
  });
}

// Chờ app dựng xong cây màn hình rồi mới chạy. Gọi thẳng ở thân module thì
// `registerIdentity` chạy trước khi lớp dịch và lớp cấu hình mạng kịp cài, và
// thông báo lỗi lúc đó nói về i18n chứ không nói về danh tính.
setTimeout(() => {
  run().catch(async (e: unknown) => {
    const err = e as { message?: string; name?: string };
    try {
      await writeResult({
        ok: false,
        stage,
        message: err?.message ?? String(e),
        name: err?.name,
        at: new Date().toISOString(),
        logs: LOGS,
      });
    } catch (e2) {
      // Ghi tệp hỏng thì KHÔNG nuốt: script bên ngoài sẽ hết giờ chờ và báo
      // "KHÔNG ĐO ĐƯỢC", đúng trạng thái thật — chứ không báo "tạo hỏng".
      console.error('[dev-identity] không ghi nổi tệp kết quả:', e2, 'lỗi gốc:', e);
    }
  });
}, BOOT_DELAY_MS);

export {};
