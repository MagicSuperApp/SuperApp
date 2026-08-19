/**
 * Sáu dữ-kiện chuỗi để mint LAMP bằng OrgDID — MỘT chỗ duy nhất phải điền.
 *
 * Toàn bộ đường mint đã dựng xong và có test: màn → `orgMintService` →
 * `orgMintTxBuilder` → cầu native → `taad_build_mint_lamp_via_did` (Rust). Cái
 * còn thiếu KHÔNG phải mã, mà là số liệu triển khai on-chain:
 *
 *   registryUtxoJson       — Registry UTxO sau khi LAMP deploy registry
 *   tokenTagHex            — token_tag của LAMP trong bảng registry
 *   supplyStateUtxoJson    — SupplyState UTxO sau genesis
 *   supplyStateScriptCbor  — script supply_state đã biên dịch (CBOR hex)
 *   khoUtxoJson            — KHO Distribution UTxO (đích rót LAMP)
 *   lampPolicyCborHex      — script lamp_mint đã biên dịch (CBOR hex)
 *
 * `null` = chưa có gì. Khi đó `makeBuildAndSignMintTx` trả về hàm ném
 * `OrgMintChainNotConfiguredError` NÊU TÊN từng thứ còn thiếu — người dùng và
 * người đọc log đều biết đang chờ cái gì, thay vì "sẽ mở ở bản sau".
 *
 * Điền vào đây rồi thì KHÔNG phải sửa chỗ nào khác. Nhưng đừng điền số đoán:
 * mint sai một tham số là tx hỏng trên chuỗi, mất phí, và không quay lại được.
 *
 * ⛔ CÒN MỘT MÂU THUẪN CHƯA GIẢI, ĐỌC TRƯỚC KHI ĐIỀN
 *
 * `Integration/LAMP.md` §3 (đội LAMP viết 2026-08-05) nói `POST
 * /identity/org/{orgDid}/mint-lamp` **không đúc, không submit** — nó trả một
 * **Grant uỷ quyền**, và **bên đúc là MagicLamp**, không phải app. Cùng chỗ đó
 * nói `mint-lamp/submit-tx` "sẽ không bao giờ tồn tại", còn `orgMint-api.ts`
 * hiện đang gửi `{orgDid, amount}` rồi chờ SSE.
 *
 * Nghĩa là: đường dựng+ký NGAY TRÊN MÁY này có thể **không phải** hình dạng cuối
 * cùng. Rust + cầu native thì dùng được cho bên nào đứng ra đúc; nhưng chuyện
 * app có phải bên đó không thì PhoenixKey + LAMP còn phải chốt (LAMP tự ghi phần
 * nghĩa vụ Grant của mình là "CHƯA HIỆN THỰC").
 *
 * Vì vậy: điền sáu số dưới đây là ĐIỀU KIỆN CẦN, chưa phải điều kiện đủ. Đừng bật
 * `ORG_MINT_ENABLED=true` chỉ vì chỗ này đã có số.
 *
 * (Một đính chính cho §2 mục 1 của tệp đó: nay `codemagic.yaml` ĐÃ ghi
 * `ORG_MINT_ENABLED=${ORG_MINT_ENABLED:-false}` ở cả 4 khối — thêm từ `ed05f21`
 * — nên đặt biến trên giao diện Codemagic BÂY GIỜ có tác dụng. Đo lại 2026-08-18.)
 */

import type { OrgMintChainInputs } from '../services/orgMintTxBuilder';

export const ORG_MINT_CHAIN: Partial<OrgMintChainInputs> | null = null;

/** 0 = preprod/preview, 1 = mainnet. Đổi cùng lúc với bộ số ở trên. */
export const ORG_MINT_NETWORK = 0;
