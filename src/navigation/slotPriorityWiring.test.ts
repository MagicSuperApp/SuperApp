/**
 * TRỤC CẤU HÌNH `slotPriority` — khoá lại rằng nó THẬT SỰ NỐI.
 *
 * ── Chỗ đứt trước bản này ────────────────────────────────────────────────────
 * `InstanceConfig.slotPriority` được khai đầy đủ, mỗi app một giá trị khác nhau
 * (`instance.config.ts:184` Aladin đặt Việc làm trước; `:232` CheckFarm dùng bảng
 * nền). Nhưng đường chạy thật gọi `slotPriority(persona)` mà hàm đó trả về HẰNG
 * module-level, KHÔNG đọc config. Grep `slotPriority` toàn `src/`: 0 người đọc.
 *
 * Hệ quả: hai app khai thứ tự khác nhau và chạy ra CÙNG một thanh điều hướng.
 * Đây là loại hỏng tệ nhất — nó trông như đã cấu hình được. Không bài kiểm nào
 * đỏ, vì không có gì để đỏ.
 *
 * ── Vì sao tệp này tồn tại ───────────────────────────────────────────────────
 * Nối lại một lần thì dễ; giữ cho nó đừng đứt lại mới khó, vì lần đứt sau cũng sẽ
 * IM LẶNG y như lần đầu. Ba nhóm dưới đây khoá ba nửa khác nhau của cùng một trục:
 *
 *   1. hàm thuần có tôn trọng bảng được rót vào không
 *   2. hàm dựng thanh tab có tôn trọng không (cả nhánh ghim lẫn nhánh persona)
 *   3. HAI APP THẬT trong kho có ra hai kết quả khác nhau không — đây là bài
 *      duy nhất bắt được ca "quên rót bảng ở chỗ gọi", vì hai bài trên vẫn xanh
 *      khi chỗ gọi bỏ quên tham số.
 */
import {
  DEFAULT_SLOT_PRIORITY,
  resolveVisibleTabs,
  slotPriority,
  type SlotPriorityTable,
} from './resolveVisibleTabs';
import { ALADIN_INSTANCE, CHECKFARM_INSTANCE } from '../config/instance.config';

/** Bảng bịa, cố ý KHÁC hẳn mọi bảng có thật, để không xanh nhờ trùng hợp. */
const BANG_LA: SlotPriorityTable = {
  default: ['JoinHome', 'Farms', 'WorkHome'],
  shipper: ['Farms', 'JoinHome', 'WorkHome'],
};

const KHONG_CO_DU_LIEU = { farms: 0, trees: 0, fruits: 0 };

describe('slotPriority tôn trọng bảng được rót vào', () => {
  it('trả đúng bảng truyền vào, không phải hằng của nền', () => {
    expect(slotPriority('new', BANG_LA)).toEqual(BANG_LA.default);
    expect(slotPriority('shipper', BANG_LA)).toEqual(BANG_LA.shipper);
  });

  it('không truyền bảng → dùng bảng nền, giữ nguyên hành vi cũ', () => {
    expect(slotPriority('new')).toEqual(DEFAULT_SLOT_PRIORITY.default);
    expect(slotPriority('shipper')).toEqual(DEFAULT_SLOT_PRIORITY.shipper);
  });
});

describe('resolveVisibleTabs tôn trọng bảng — CẢ HAI nhánh', () => {
  it('nhánh persona: thứ tự ô đi theo bảng của app', () => {
    const nen = resolveVisibleTabs(KHONG_CO_DU_LIEU, {}, null);
    const la = resolveVisibleTabs(KHONG_CO_DU_LIEU, {}, null, () => true, BANG_LA);
    expect(la).not.toEqual(nen);
    // `JoinHome` đứng đầu bảng lạ ⟹ phải lọt vào thanh.
    expect(la).toContain('JoinHome');
  });

  it('nhánh GHIM: phần bù cũng lấy từ bảng của app, không phải hằng nền', () => {
    // Ghim một ô; ô thứ hai do phần BÙ quyết định. Trước bản này phần bù luôn lấy
    // hằng nền, nên app khai thứ tự riêng vẫn ra thanh giống hệt ngay khi có ghim.
    //
    // Hàm trả về CẢ ô cố định: [ChatHome, ô1, Home, ô2, Account]. Nên phải so ô
    // SLOT (chỉ số 1 và 3), không so phần tử cuối — phần tử cuối luôn là `Account`
    // ở mọi cấu hình, và một phép so như thế sẽ XANH mãi mãi dù dây có đứt.
    const nen = resolveVisibleTabs(KHONG_CO_DU_LIEU, {}, ['WorkHome']);
    const la = resolveVisibleTabs(KHONG_CO_DU_LIEU, {}, ['WorkHome'], () => true, BANG_LA);

    // Ô ghim giống nhau ở cả hai — đúng, ghim đè mọi thứ.
    expect(nen[1]).toBe('WorkHome');
    expect(la[1]).toBe('WorkHome');
    // Ô thứ hai do phần BÙ quyết định ⟹ phải đi theo bảng của app.
    expect(nen[3]).toBe('Farms');       // bảng nền: Farms đứng đầu
    expect(la[3]).toBe('JoinHome');     // bảng lạ:  JoinHome đứng đầu
  });
});

describe('HAI APP THẬT phải ra hai thanh khác nhau', () => {
  /**
   * Bài quan trọng nhất tệp này. Hai bài nhóm trên vẫn XANH nếu chỗ gọi thật quên
   * rót bảng — chúng chỉ kiểm hàm, không kiểm dây. Bài này so hai cấu hình CÓ THẬT
   * trong kho, nên nó đỏ đúng lúc dây đứt.
   */
  it('Aladin đặt Việc làm trước, CheckFarm đặt Trang trại trước', () => {
    expect(ALADIN_INSTANCE.slotPriority.default[0]).toBe('WorkHome');
    expect(CHECKFARM_INSTANCE.slotPriority.default[0]).toBe('Farms');
  });

  it('rót hai bảng đó vào cùng một hàm → ra hai kết quả KHÁC nhau', () => {
    const aladin = resolveVisibleTabs(
      KHONG_CO_DU_LIEU, {}, null, () => true, ALADIN_INSTANCE.slotPriority,
    );
    const checkfarm = resolveVisibleTabs(
      KHONG_CO_DU_LIEU, {}, null, () => true, CHECKFARM_INSTANCE.slotPriority,
    );
    expect(aladin).not.toEqual(checkfarm);
  });

  it('`slotPriority` đọc bảng của từng app, không nhập chúng làm một', () => {
    expect(slotPriority('new', ALADIN_INSTANCE.slotPriority))
      .not.toEqual(slotPriority('new', CHECKFARM_INSTANCE.slotPriority));
  });
});
