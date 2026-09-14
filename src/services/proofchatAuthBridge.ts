/**
 * proofchatAuthBridge.ts — Cầu nối danh tính PhoenixKey → ProofChat (TRỤC 3 v2.0).
 *
 * Nguyên lý (CLAUDE.md): vận hành độc lập. Nếu backend ProofChat OFF hoặc PhoenixKey
 * chưa có session token → trả trạng thái rõ ràng, KHÔNG ném lỗi làm sập chat tab.
 * Chat UI tiếp tục chạy mock; cầu nối chỉ "nâng cấp" sang phiên thật khi đủ điều kiện.
 *
 * Luồng: getSessionToken() (PhoenixKey, lưu sau QR-approve) → POST /auth/phoenixkey/login
 *        → lưu accessToken/refreshToken ProofChat.
 */
import { currentUserDid } from '../sdk/phoenixKey';

import { getSessionToken as getPhoenixSessionToken, clearSessionToken } from './phoenixKey-api';
import { ensurePhoenixSession } from './phoenixSessionService';
import {
  proofChatApi,
  isProofChatBackendEnabled,
  getAccessToken,
  getTokenOwnerDid,
  setTokenOwnerDid,
  clearTokens,
  ProofChatApiError,
} from './proofchat-api';

export type ConnectResult =
  | { status: 'connected'; alreadyHadSession: boolean }
  | { status: 'disabled' } // feature flag OFF / thiếu URL
  | { status: 'no-phoenix-session' } // chưa đăng nhập PhoenixKey
  | { status: 'error'; message: string };

/**
 * Nghỉ giữa hai lần dựng phiên SAU KHI thất bại.
 *
 * VÌ SAO PHẢI CÓ: đường dựng phiên đi qua `ensurePhoenixSession`, và bước ký ở đó
 * BẬT HỘP VÂN TAY của hệ điều hành ("Activate the wallet"). Hàm này lại được gọi
 * từ hai phía cùng lúc: `proofchatService.init()` mỗi lần mở màn Trò chuyện, và
 * interceptor REST ở MỌI lượt gọi cần-auth khi kho chưa có token. Nên khi phiên
 * PhoenixKey đang hỏng (đo trên máy thật 2026-09-08: `POST /auth/session/{id}/approve`
 * trả 401 `Unauthorized — Missing Bearer token`), người dùng nhận một chuỗi hộp
 * vân tay liên tiếp mà lần nào xác thực xong cũng chỉ để nhận lại đúng lỗi đó.
 * Hỏi vân tay cho một lượt CHẮC CHẮN hỏng là cái giá không được phép trả.
 *
 * Nghỉ 60 giây: phiên sống lại thì lượt kế trong vòng một phút vẫn tự chạy. Người
 * dùng bấm "Thử lại"/kéo-xuống muốn thử NGAY thì gọi `resetProofChatSessionBackoff()`
 * — hành-động cố ý thì được quyền hỏi vân tay.
 */
const RETRY_COOLDOWN_MS = 60_000;
let _lastFailureAt = 0;
let _lastFailure: ConnectResult | null = null;
/**
 * DID của người dùng lúc lượt hỏng đó xảy ra.
 *
 * Thiếu vế này thì thời gian nghỉ là một trạng thái của CÁI MÁY, trong khi nguyên
 * nhân hỏng là trạng thái của MỘT NGƯỜI. Hai ca thật, cả hai đều đo được:
 *
 *  · A gặp phiên hỏng → nghỉ 60s → A đăng xuất → B đăng nhập (DID khác, phiên
 *    PhoenixKey sống) → B mở Chat và nhận nguyên văn lỗi CỦA A, 0 lượt gọi máy chủ.
 *  · Máy chưa có danh tính → hỏng → người dùng đi tạo danh tính xong quay lại
 *    trong vòng 60 giây → vẫn nhận lỗi cũ, dù điều kiện đã đổi hẳn.
 *
 * Nên cổng nghỉ chỉ áp khi DID **không đổi**: cùng người, cùng cảnh, thì lượt sau
 * đúng là chắc chắn hỏng và không đáng một hộp vân tay nữa. Đổi người hay vừa có
 * danh tính thì đó là một câu hỏi khác, phải hỏi lại máy chủ.
 */
let _lastFailureDid: string | null = null;

/** Xoá thời gian nghỉ — dùng khi người dùng CỐ Ý yêu cầu thử lại. */
export const resetProofChatSessionBackoff = (): void => {
  _lastFailureAt = 0;
  _lastFailure = null;
  _lastFailureDid = null;
};

/**
 * Bảo đảm có phiên ProofChat hợp lệ. Idempotent: nếu đã có accessToken thì không
 * gọi lại login. Không bao giờ throw — trả ConnectResult để UI quyết định hiển thị.
 *
 * ── Gộp lượt gọi song song NẰM Ở ĐÂY, không phải ở `ensureProofChatSession` ──
 *
 * Hàm này có HAI đường vào, và chúng chạy chồng nhau thật:
 *   · `proofchatService.init()` gọi THẲNG vào đây, mỗi lần mở màn Trò chuyện.
 *   · interceptor REST đi qua `ensureProofChatSession` khi kho chưa có token.
 *
 * Đặt phép gộp ở `ensureProofChatSession` chỉ chặn được đường thứ hai. Đo được:
 * `Promise.all([connectProofChat(), ensureProofChatSession()])` cho ra HAI lượt
 * `POST /auth/phoenixkey/login`, và lượt sau có thể thu hồi token của lượt trước
 * — tức người dùng mất phiên ngay khi vừa mở màn. Đây cũng đúng lý do thời gian
 * nghỉ sau khi hỏng được đặt ở đây: đây là chỗ DUY NHẤT cả hai đường đi qua.
 *
 * ⚠ Hàm ngoài KHÔNG được là `async`, và `_connectInflight` phải được gán TRƯỚC
 * mọi `await`. Một `await` đứng trước phép gán là một khe cho lượt thứ hai lọt
 * qua cửa `if` — đúng lớp lỗi vừa phải sửa ở `ensureProofChatSession`.
 */
let _connectInflight: Promise<ConnectResult> | null = null;

export const connectProofChat = (): Promise<ConnectResult> => {
  if (_connectInflight) return _connectInflight;
  const run = connectProofChatInner();
  _connectInflight = run;
  // Nhả khoá khi xong, dù đạt hay ném. Dùng `then` hai nhánh thay vì `finally`
  // để cái đuôi này không thành một promise bị bỏ rơi khi `run` ném.
  const nha = (): void => {
    if (_connectInflight === run) _connectInflight = null;
  };
  run.then(nha, nha);
  return run;
};

const connectProofChatInner = async (): Promise<ConnectResult> => {
  if (!isProofChatBackendEnabled()) {
    return { status: 'disabled' };
  }

  const did = await currentUserDid().catch(() => null);

  const existing = await getAccessToken();
  if (existing) {
    // "CÓ token" chưa đủ — phải là token CỦA NGƯỜI ĐANG DÙNG MÁY. Xem ghi chú ở
    // `TOKEN_DID_KEY` (proofchat-api.ts): trên máy dùng chung, câu hỏi thiếu vế
    // đó cho người sau chạy tiếp phiên chat của người trước.
    const owner = await getTokenOwnerDid();
    if (did && owner && owner === did) {
      return { status: 'connected', alreadyHadSession: true };
    }
    // Không khớp, hoặc không rõ của ai → XOÁ rồi đăng nhập lại. Xoá chứ không chỉ
    // bỏ qua: 42 phương thức trong `proofchat-api` đọc thẳng token từ kho qua
    // interceptor, nên chừng nào token lạ còn nằm đó thì chừng đó còn đường cho
    // nó ra khỏi máy.
    await clearTokens();
  }

  // Từ đây trở xuống là phần ĐẮT (có thể bật hộp vân tay + đi mạng). Đang trong
  // thời gian nghỉ thì trả lại NGUYÊN VĂN kết quả hỏng lần trước — nơi gọi vẫn
  // phân biệt được 'no-phoenix-session' với 'error', chỉ là không hỏi lại vân tay.
  // `_lastFailureDid === did` so cả ca hai bên cùng `null` (máy chưa có danh tính
  // ở cả hai lượt) — đúng ca đáng nghỉ. Vừa có danh tính thì `did` khác `null` và
  // cổng nhả ngay, không phải đợi hết 60 giây.
  if (
    _lastFailure &&
    _lastFailureDid === did &&
    Date.now() - _lastFailureAt < RETRY_COOLDOWN_MS
  ) {
    return _lastFailure;
  }

  let phoenixSession = await getPhoenixSessionToken();
  if (!phoenixSession) {
    // Mobile-only chưa có PhoenixKey session token (chưa self-pair) → tự ký lấy rồi
    // thử lại. Cùng token dùng cho /wallet/standard/register — xem phoenixSessionService.
    phoenixSession = await ensurePhoenixSession();
  }
  if (!phoenixSession) {
    return noteFailure({ status: 'no-phoenix-session' }, did);
  }

  const signIn = async (token: string): Promise<ConnectResult> => {
    await proofChatApi.auth.phoenixKeyLogin(token);
    // Đóng dấu chủ NGAY sau khi có token. `did` null (chưa đọc được DID) thì
    // KHÔNG đóng dấu bừa: lượt sau sẽ coi token là vô chủ và đăng nhập lại. Đăng
    // nhập thừa một lượt rẻ hơn nhận nhầm token của người khác là của mình.
    if (did) await setTokenOwnerDid(did);
    resetProofChatSessionBackoff();
    return { status: 'connected', alreadyHadSession: false };
  };

  try {
    return await signIn(phoenixSession);
  } catch (err) {
    // ── THẺ PHIÊN CHẾT LÀ NGÕ CỤT VĨNH VIỄN, nếu không có khối này ────────────
    //
    // `getPhoenixSessionToken()` là một lệnh đọc kho trần: không kiểm hạn, không
    // kiểm gì (`phoenixKey-api.ts:332`). Thẻ phiên PhoenixKey sống 24 giờ. Hết
    // hạn thì đường đi ở trên lấy đúng nó ra, ProofChat chối, và KHÔNG chỗ nào
    // xoá — `clearSessionToken()` chỉ được gọi từ `wipeIdentity()`, tức phải xoá
    // hẳn danh tính mới dọn được.
    //
    // Người dùng thấy "Chưa đăng nhập được… kéo xuống để thử lại", và kéo xuống
    // KHÔNG BAO GIỜ gỡ được: nó xoá thời gian nghỉ 60 giây rồi đọc lại đúng thẻ
    // chết đó. Lối ra duy nhất trước bản này là xoá dữ liệu app / cài lại —
    // đăng xuất cũng không, vì `logoutUser` khi ấy chưa dọn thẻ này.
    //
    // Chỉ thử lại với 401/403, và chỉ MỘT lần. Lỗi khác (mạng, 5xx) không phải
    // "thẻ sai", thử lại chỉ tốn thêm một hộp vân tay cho một lượt vẫn hỏng.
    const httpStatus = err instanceof ProofChatApiError ? err.httpStatus : 0;
    if (httpStatus === 401 || httpStatus === 403) {
      try {
        await clearSessionToken();
        // `force: true` bỏ qua thẻ trong kho và đúc thẻ mới. Đây là nơi dùng ĐẦU
        // TIÊN của tham số đó — nó được viết ra cho đúng ca này rồi bỏ không.
        const moi = await ensurePhoenixSession({ force: true });
        if (moi) return await signIn(moi);
      } catch (err2) {
        const m2 =
          err2 instanceof ProofChatApiError ? err2.message : 'Không kết nối được ProofChat';
        return noteFailure({ status: 'error', message: m2 }, did);
      }
      return noteFailure({ status: 'no-phoenix-session' }, did);
    }
    const message =
      err instanceof ProofChatApiError ? err.message : 'Không kết nối được ProofChat';
    return noteFailure({ status: 'error', message }, did);
  }
};

/** Ghi mốc hỏng để bật thời gian nghỉ, rồi trả lại đúng kết quả đó cho nơi gọi. */
const noteFailure = (res: ConnectResult, did: string | null): ConnectResult => {
  _lastFailureAt = Date.now();
  _lastFailure = res;
  _lastFailureDid = did;
  console.warn(
    `[ProofChat] chưa dựng được phiên: ${res.status} — nghỉ ${RETRY_COOLDOWN_MS / 1000}s ` +
      'trước khi thử lại (tránh hỏi vân tay liên tục).',
  );
  return res;
};

/**
 * Provider phiên cho interceptor của `proofchat-api` (đăng ký ở bootstrap).
 *
 * Gộp lời gọi song song vào MỘT lần đăng nhập: màn danh sách bắn
 * `loadConversations` + `loadInvitations` cùng lúc, không gộp thì thành hai lượt
 * POST /auth/phoenixkey/login và lượt sau có thể thu hồi token của lượt trước.
 *
 * KHÔNG ném: trả `null` khi chưa đủ điều kiện (chưa có danh tính PhoenixKey, máy
 * chủ chối) để lượt gọi đi tiếp mà không Bearer rồi nhận lỗi thật của nó, thay vì
 * biến mọi lỗi thành lỗi đăng nhập.
 */
let _ensureInflight: Promise<string | null> | null = null;
export const ensureProofChatSession = (): Promise<string | null> => {
  if (_ensureInflight) return _ensureInflight;

  // ⚠ Hàm này KHÔNG được là `async`, và `_ensureInflight` phải được gán TRƯỚC mọi
  // `await`. Bản đầu đọc kho token bằng `await` rồi mới gán — và một `await` đứng
  // trước phép gán là một khe cho lượt gọi thứ hai lọt qua:
  //
  //     A: _ensureInflight rỗng → await getAccessToken()   ↩ nhả luồng
  //     B: _ensureInflight VẪN rỗng → await getAccessToken()
  //     A: gán _ensureInflight = P1
  //     B: ĐÈ _ensureInflight = P2        ⟹ hai lần POST /auth/phoenixkey/login
  //
  // Đo được, không phải suy luận: `ChatHomeScreen` bắn `loadConversations()` và
  // `loadInvitations()` liền nhau, và bài kiểm "hai lượt gọi CÙNG LÚC chỉ đăng nhập
  // một lần" đếm ra 2. Lượt sau có thể thu hồi token của lượt trước, tức người dùng
  // mất phiên ngay khi vừa mở màn — đúng thứ phép gộp này sinh ra để chặn.
  //
  // Nay phần đọc kho nằm TRONG promise, và promise được gán ngay trong cùng một
  // lượt chạy đồng bộ. Không còn khe nào.
  _ensureInflight = (async () => {
    try {
      // ⛔ KHÔNG được đọc tắt `getAccessToken()` rồi trả luôn ở đây. "Kho có token"
      // không phải câu hỏi cần trả lời — câu hỏi là "token đó CỦA AI". Phép kiểm
      // chủ sở hữu chỉ nằm trong `connectProofChat` (`getTokenOwnerDid() === did`),
      // nên một đường tắt ở đây là cửa THỨ HAI vào kho token, và cửa đó không hỏi
      // gì: người B mở app trên máy dùng chung sẽ đi tiếp bằng token của người A.
      // `connectProofChat` tự có đường trả sớm rẻ cho ca token khớp chủ — không
      // đi mạng, không hộp vân tay — nên bỏ đường tắt không làm chậm ca thường.
      const res = await connectProofChat();
      if (res.status !== 'connected') return null;
      return await getAccessToken();
    } catch (err) {
      console.warn(`[ProofChat] dựng phiên ném lỗi: ${(err as Error)?.message ?? err}`);
      return null;
    } finally {
      _ensureInflight = null;
    }
  })();
  return _ensureInflight;
};

/**
 * Ngắt phiên ProofChat (đăng xuất cục bộ).
 *
 * ⛔ XOÁ TOKEN LÀ VIỆC KHÔNG ĐIỀU KIỆN. Bản trước thoát sớm khi cờ tính năng tắt
 * (`if (!isProofChatBackendEnabled()) return;` đặt TRƯỚC mọi thứ), nên có một
 * đường đi thật sự xảy ra: bật cờ → người A đăng nhập, token vào kho → tắt cờ →
 * người A đăng xuất, `logoutUser` gọi hàm này và nó thoát ngay, token Ở LẠI →
 * bật cờ lại → người B mở app và tiếp tục phiên chat của người A.
 *
 * Cờ tính năng quyết định có GỌI MÁY CHỦ hay không. Nó không được quyết định có
 * dọn dữ liệu phiên trên máy này hay không.
 */
export const disconnectProofChat = async (): Promise<void> => {
  if (isProofChatBackendEnabled()) {
    // logout() đã clearTokens() trong finally dù mạng lỗi.
    await proofChatApi.auth.logout().catch(() => undefined);
  }
  // Chạy cả khi cờ tắt, và cả khi logout() ở trên đã xoá — `clearTokens` là
  // idempotent, và đây là đường duy nhất bảo đảm kho sạch sau khi đăng xuất.
  await clearTokens().catch(() => undefined);
  // Token không phải thứ duy nhất sống ở phạm vi module. Thời gian nghỉ cũng vậy,
  // và nó sống sót qua đăng xuất: A gặp phiên hỏng → nghỉ 60 giây → A đăng xuất →
  // B đăng nhập → B mở Chat và nhận nguyên văn lỗi của A, không một lượt gọi nào.
  // `_lastFailureDid` đã chặn ca đó ở tầng so DID; đây là lớp thứ hai, và nó dọn
  // theo đúng SỰ KIỆN "phiên này kết thúc" thay vì suy ra từ một giá trị.
  resetProofChatSessionBackoff();
  // Nhả cả lượt đang bay: nó được dựng bằng danh tính CŨ, nên ai bám vào nó sau
  // khi đăng xuất là bám vào một câu trả lời cho người khác.
  _connectInflight = null;
  _ensureInflight = null;
};
