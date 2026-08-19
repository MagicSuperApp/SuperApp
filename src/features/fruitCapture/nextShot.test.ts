import { nextShotAsk } from './nextShot';
import type { CapturePlan } from '../../services/capturePlanService';

const plan = (p: Partial<CapturePlan>): CapturePlan => ({ ok: true, ...p });

describe('nextShotAsk', () => {
  it('còn thiếu mặt → mời chụp tiếp, dùng ĐÚNG câu của máy chủ', () => {
    const r = nextShotAsk(plan({
      next: { action: 'shoot_face', view_type: 'stem', need: 3, text_vi: 'Chụp 3 tấm mặt cuống.' },
    } as Partial<CapturePlan>));
    expect(r).toEqual({ message: 'Chụp 3 tấm mặt cuống.', yesLabel: 'Chụp tiếp' });
  });

  it('máy chủ nói ĐỦ → không mời, thoát như cũ', () => {
    expect(nextShotAsk(plan({
      next: { action: 'done', need: 0, text_vi: 'Quả này đã đủ ảnh các mặt.' },
    } as Partial<CapturePlan>))).toBeNull();
  });

  it('chưa có kế hoạch → KHÔNG bịa lời mời', () => {
    expect(nextShotAsk(null)).toBeNull();
    expect(nextShotAsk(undefined)).toBeNull();
    expect(nextShotAsk(plan({}))).toBeNull();
  });

  it('kế hoạch ok=false → không mời', () => {
    expect(nextShotAsk({ ok: false, next: { action: 'shoot_face', view_type: 'stem', need: 1, text_vi: 'x' } } as CapturePlan)).toBeNull();
  });

  it('câu rỗng → không mời (nút không chữ còn tệ hơn không có nút)', () => {
    expect(nextShotAsk(plan({
      next: { action: 'shoot_face', view_type: 'stem', need: 1, text_vi: '   ' },
    } as Partial<CapturePlan>))).toBeNull();
  });
});
