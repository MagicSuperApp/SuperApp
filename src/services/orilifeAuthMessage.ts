/**
 * MỘT câu duy nhất cho ca "máy chủ không nhận phiên của máy này".
 *
 * ── Vì sao là một tệp riêng ────────────────────────────────────────────────
 * Hai cửa hiện câu này cho người dùng — `fieldErrorMessage` (`treeReIDService`)
 * và `syncErrorMessage` (`modules/trace/store`) — mà cửa thứ hai đã nhập kiểu
 * `APIError` từ cửa thứ nhất. Đặt phép ánh xạ ở một trong hai cửa là dựng một
 * vòng nhập. Đặt ở đây thì cả hai cùng trỏ vào, không cửa nào sở hữu.
 *
 * ── Vì sao không để câu cũ đứng một mình ───────────────────────────────────
 * Câu cũ ở cả hai cửa là *"Phiên đăng nhập hết hạn. Hãy đăng nhập lại."* Nó sai
 * hai lần cùng lúc, và cả hai lần đều đo được trên bản 99 (ba đoạn quay người
 * dùng gửi 2026-09-12):
 *   · nó ĐOÁN nguyên nhân — phiên có thể chưa hết hạn chút nào; ca đang xảy ra
 *     là máy chủ danh tính TỪ CHỐI chính danh tính này;
 *   · nó ra một mệnh lệnh KHÔNG CÓ NÚT — màn trang trại không có chỗ nào "đăng
 *     nhập lại", nên người dùng bấm "Thử lại", và mỗi lần bấm chỉ bật thêm một
 *     hộp Face ID nữa. Trong một đoạn quay, hộp đó bật lại ở giây 19 · 23 · 26 ·
 *     30 · 38, lần nào cũng nhận đúng mặt, và không lần nào đi tới đâu.
 *
 * Nên từ nay câu nói đúng ô hỏng đã đo, và chỉ hứa thứ app làm được thật.
 */
import { tk } from '../i18n/keys';
import {
  lastOrilifeLoginKind,
  lastOrilifeServerSaid,
  orilifeLoginCooldownLeft,
  type DidLoginFailKind,
} from './orilifeDidAuth';

const AUTH_KEY_BY_KIND: Record<DidLoginFailKind, string> = {
  'no-identity': 'trace.sync.auth.noIdentity',
  network: 'trace.sync.auth.network',
  sign: 'trace.sync.auth.sign',
  refused: 'trace.sync.auth.refused',
  server: 'trace.sync.auth.server',
  // `unknown` cố ý rơi về câu cũ: nó là ô "không biết gì hơn", và ở đó câu mờ
  // là câu ĐÚNG. Không được lấy nó làm chỗ chứa mọi ca chưa phân loại.
  unknown: 'trace.sync.authError',
};

/**
 * Câu cho ca `auth_error`.
 *
 * Hàm ĐỌC trạng thái toàn cục chứ không nhận nó qua tham số. Cố ý: đường gọi đi
 * từ `farmSlice` qua `treeReIDService` xuống tận `ensureOrilifeToken`, và luồn
 * một trường mới qua cả bốn tầng thì bốn tầng đều phải nhớ chuyển tiếp — chỗ nào
 * quên là câu lặng lẽ rơi về bản đoán mò. Một nguồn thì không quên được.
 */
export function authSyncMessage(): string {
  const kind = lastOrilifeLoginKind();
  let cau = tk(kind ? AUTH_KEY_BY_KIND[kind] : 'trace.sync.authError');

  // Ở ô "bị từ chối", câu của MÁY CHỦ là thứ duy nhất nói được vì sao nó từ chối
  // — app ở đây không biết gì hơn ngoài "không". Chỉ nối khi máy chủ THẬT SỰ có
  // gửi một câu: `serverSaid` để rỗng khi máy chủ im, nên không có đường nào để
  // một mã app tự dựng (`Verify HTTP 401`) lọt ra màn hình.
  if (kind === 'refused') {
    const noi = lastOrilifeServerSaid();
    if (noi) cau += ` Máy chủ nói: "${noi}"`;
  }

  const conLai = orilifeLoginCooldownLeft();
  // Chỉ hứa "chờ rồi thử lại" khi thử lại THẬT SỰ đổi được kết quả. Máy chủ từ
  // chối, hoặc máy chưa có danh tính, thì chờ bao lâu cũng ra kết quả cũ — hứa ở
  // hai ô đó là dựng đúng cái vòng lặp mà bản vá này sinh ra để cắt.
  const dangCho = conLai > 0 && kind !== 'refused' && kind !== 'no-identity';
  return dangCho ? cau + tk('trace.sync.auth.wait', { s: Math.ceil(conLai / 1000) }) : cau;
}
