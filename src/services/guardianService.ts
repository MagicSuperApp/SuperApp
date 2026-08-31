/**
 * Guardian (khôi-phục xã-hội) — dựng `proofSignature` + gọi
 * `POST /guardians/add · /guardians/remove`.
 *
 * ══ Trước bản này chỗ đây HỎNG, và mã tự khai là hỏng ════════════════════════
 * Nhà PhoenixKey báo 2026-08-27 (thư `ma:pk-canon-len`) rằng máy chủ đã đổi từ
 * **V30**, lệch với app HAI chỗ:
 *
 *   1. đóng khung theo độ dài (`canonicalMessage.ts`) thay cho nối `':'`;
 *   2. có thêm field THỨ TƯ `opSeq` — mốc chống phát lại.
 *
 * Phần (1) app dựng được từ lâu. Phần (2) thì không: `opSeq` không tồn tại ở đâu
 * trong kho này, và không có cửa nào ĐỌC ra nó. Nên bản trước để nguyên chuỗi ký
 * cũ kèm một lời khai thẳng rằng nó gần chắc không verify được — đúng lựa chọn,
 * vì sửa nửa vời sẽ làm mã TRÔNG như đã xong trong khi chữ ký vẫn hỏng.
 *
 * Nay `GET /identity/{did}/op-seq` đã được nối (`identity.opSeq`), nên cả hai nửa
 * đều dựng được và tệp này sửa hẳn.
 *
 * ══ Hợp đồng, đối chiếu `GuardianServiceImpl.java:84,155` ════════════════════
 *
 *     CanonicalMessage.build(GUARDIAN_ADD_PREFIX,
 *             request.userDid(), request.guardianDid(),
 *             request.nonce(), String.valueOf(request.opSeq()));
 *
 * Tiền tố mang sẵn dấu hai chấm (`"PHOENIXKEY_GUARDIAN_ADD:"`) và đi vào dạng byte
 * THÔ, không đóng khung — nó là tiền tố miền, không phải một field. Bốn field sau
 * mỗi cái kèm 4 byte độ dài big-endian.
 *
 * `opSeq` vào chuỗi ký dưới dạng CHUỖI THẬP PHÂN, không phải 8 byte số.
 *
 * ══ Mức chắc của lời khai này ════════════════════════════════════════════════
 * Đây vẫn là phép đối chiếu MÃ NGUỒN máy chủ, không phải một lượt chạy thật —
 * nhà này chưa chạy luồng guardian trên máy chủ thật lần nào. Khác với bản trước ở
 * chỗ: trước là "biết sai mà không sửa được", nay là "dựng đúng theo hợp đồng đã
 * đọc". Lượt chạy thật đầu tiên vẫn là phép đo cuối cùng.
 */

import taad from '../sdk/taadEnclave';
import { signRaw, currentUserDid } from '../sdk/phoenixKey';
import { buildCanonicalHex } from './canonicalMessage';
import { phoenixKeyApi, GuardianMutateRequest } from './phoenixKey-api';

/** Tiền tố miền — kèm dấu hai chấm, đúng như hằng phía máy chủ. */
export const CHALLENGE_ADD = 'PHOENIXKEY_GUARDIAN_ADD:';
export const CHALLENGE_REMOVE = 'PHOENIXKEY_GUARDIAN_REMOVE:';

/**
 * Dựng chuỗi ký guardian, trả **hex**.
 *
 * Tách ra khỏi hàm gọi mạng để bài kiểm ghim được từng byte mà không phải giả lập
 * khoá phần cứng — đây là chỗ duy nhất trong tệp sai được một cách im lặng.
 */
export function buildGuardianMessageHex(
  prefix: string,
  userDid: string,
  guardianDid: string,
  nonce: string,
  opSeq: number,
): string {
  return buildCanonicalHex(prefix, userDid, guardianDid, nonce, String(opSeq));
}

async function buildProof(
  prefix: string,
  guardianDid: string,
): Promise<GuardianMutateRequest> {
  const userDid = await currentUserDid();
  if (!userDid) throw new Error('Chưa có danh tính để ký xác nhận người bảo hộ.');

  const nonce = await taad.generateSalt();
  // Đọc mốc SÁT lúc gửi. Giữ lại một giá trị đọc từ trước là tự chuốc 409
  // `OP_SEQ_REPLAY` khi có thao tác khác chen vào giữa.
  const { nextOpSeq } = await phoenixKeyApi.identity.opSeq(userDid);

  const proofSignature = await signRaw(
    buildGuardianMessageHex(prefix, userDid, guardianDid, nonce, nextOpSeq),
    'Xác nhận người bảo hộ',
    'Ký bằng khoá phần cứng của bạn',
  );
  return { userDid, guardianDid, nonce, opSeq: nextOpSeq, proofSignature };
}

/** Thêm người bảo hộ: ký proof rồi POST /guardians/add. */
export async function addGuardian(guardianDid: string): Promise<void> {
  await phoenixKeyApi.guardians.add(await buildProof(CHALLENGE_ADD, guardianDid));
}

/** Bớt người bảo hộ: ký proof rồi POST /guardians/remove. */
export async function removeGuardian(guardianDid: string): Promise<void> {
  await phoenixKeyApi.guardians.remove(await buildProof(CHALLENGE_REMOVE, guardianDid));
}
