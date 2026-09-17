// services/genie/fastPath.test.ts
//
// Đường tắt trợ lý — bản chạy trên máy.
//
// Ca kiểm viết bằng câu người ta THẬT SỰ gõ/nói ngoài vườn: thiếu dấu, kèm chữ
// đưa đẩy, sai thanh điệu. Câu mẫu sạch sẽ trong phòng không chứng minh được gì
// về tệp này.

import { matchFastPath, genieMayOpen, GENIE_ROUTE_DENY, nearScore } from './fastPath';
import { GENIE_PLAYBOOKS, GENIE_PLAYBOOK_COUNT } from './playbooks.generated';
import { boDau, chuaCum, gan, amTiet } from './viet';
import { setGenieNavigator, genieOpenScreen, genieNavigatorReady } from './genieNav';
import { handle, MISS_LINES, __resetMissLine } from './index';

const idOf = (q: string): string | null => {
  const r = matchFastPath(q);
  return r.kind === 'hit' ? r.hit.playbook.id : null;
};

describe('chuẩn hoá tiếng Việt', () => {
  it('bỏ dấu — `đ` phải xử tay, NFD không tách nó', () => {
    expect(boDau('đàn')).toBe('dan');
    expect(boDau('vườn')).toBe('vuon');
    expect(boDau('Đắk Lắk')).toBe('Dak Lak');
  });

  it('tách theo âm tiết, không tách theo ký tự', () => {
    expect(amTiet('Thêm vườn, giúp em!')).toEqual(['thêm', 'vườn', 'giúp', 'em']);
  });

  it('chịu lệch 1 ký tự ở âm tiết dài, KHÔNG nới cho âm tiết ngắn', () => {
    expect(gan('vườn', 'vượn')).toBe(true);
    expect(gan('bo', 'ba')).toBe(false);
    expect(gan('ga', 'gao')).toBe(false);
  });

  it('khớp theo ÂM TIẾT LIỀN NHAU, không theo chuỗi con', () => {
    expect(chuaCum('tôi muốn thêm vườn', 'thêm vườn')).toBe(2);
    expect(chuaCum('thêm cây', 'thêm vườn')).toBe(0);
  });
});

describe('đường tắt', () => {
  it('sổ playbook có mặt trong gói app', () => {
    expect(GENIE_PLAYBOOKS.length).toBe(GENIE_PLAYBOOK_COUNT);
    expect(GENIE_PLAYBOOKS.length).toBeGreaterThanOrEqual(13);
  });

  it('"thêm vườn" và mọi biến thể đều mở đúng màn thêm vườn', () => {
    for (const q of [
      'thêm vườn',
      'Thêm vườn',
      'tôi muốn thêm vườn',
      'them vuon',
      'thêm vườn giúp em với',
      'bác ơi thêm vườn',
      'tạo vườn',
    ]) {
      expect(idOf(q)).toBe('farm.add');
    }
    const r = matchFastPath('thêm vườn');
    expect(r.kind).toBe('hit');
    if (r.kind === 'hit') {
      expect(r.hit.playbook.route).toBe('FarmDetail');
      // Câu đọc lên phải nhắc ĐÚNG hai cái nút có thật trên màn đó.
      expect(r.hit.playbook.say).toContain('Tự động ghi');
      expect(r.hit.playbook.say).toContain('Tự vẽ điểm');
    }
  });

  it('gõ không dấu vẫn về đúng việc', () => {
    expect(idOf('quet nhan thuoc')).toBe('care.scan');
    expect(idOf('vuon cua toi')).toBe('farm.list');
    expect(idOf('so vat nuoi')).toBe('animal.book');
  });

  it('câu MANG ĐÍCH thì KHÔNG đi tắt — nó cần tra mã thật', () => {
    // Đây là ranh giới quan trọng nhất của tệp: đi tắt một câu có đích nghĩa là
    // mở màn mà không biết mở cho vườn nào.
    expect(matchFastPath('ghi lịch sử bón phân cho vườn 3').kind).not.toBe('hit');
    expect(matchFastPath('vườn nào sắp thu hoạch được').kind).not.toBe('hit');
    expect(matchFastPath('đổi tên vườn 2 thành vườn sau nhà').kind).not.toBe('hit');
  });

  it('câu không liên quan thì trả `miss`, KHÔNG đoán bừa một màn', () => {
    // Một gợi ý SAI còn tệ hơn một lời từ chối thật thà: người dùng đi theo nó
    // rồi mới biết là trật.
    for (const q of ['hôm nay trời đẹp quá', 'chào em', 'ờ', '']) {
      expect(matchFastPath(q).kind).toBe('miss');
    }
  });

  it('GẦN khớp thì nêu ĐÚNG việc gần nhất, không nói chung chung', () => {
    // Câu thật của người dùng hiếm khi trùng khít một cách-nói trong sổ. Trả một
    // lời từ chối chung cho mọi câu trượt là cách nhanh nhất biến trợ lý thành
    // máy trả lời tự động.
    const r = matchFastPath('ghi lại hôm nay bón phân cho vườn');
    expect(r.kind).toBe('near');
    if (r.kind === 'near') {
      expect(r.score).toBeGreaterThanOrEqual(0.6);
      expect(r.phrase.length).toBeGreaterThan(3);
    }
  });

  it('gần khớp đòi CẢ tỉ lệ LẪN số âm tiết', () => {
    // Chỉ có tỉ lệ thì cách-nói hai âm tiết chỉ cần trúng MỘT là đã đạt 0.5.
    const pb = GENIE_PLAYBOOKS.find((p) => p.id === 'fruit.video')!;
    const n = nearScore(pb, 'hôm nay trời đẹp quá');
    expect(n.matched).toBeLessThan(2);
  });

  it('không playbook nào trỏ vào màn trợ lý bị cấm tự mở', () => {
    for (const pb of GENIE_PLAYBOOKS) {
      expect(GENIE_ROUTE_DENY).not.toContain(pb.route);
    }
  });

  it('màn ĐĂNG NHẬP và các màn cửa-vào: trợ lý không mở, và không nổi lên trên', () => {
    // Lỗi đã thấy trên máy: bong bóng nổi lên ngay giữa màn đăng nhập.
    for (const r of ['Login', 'Activation', 'Onboarding', 'LanguageSelect', 'Terms',
      'IdentityEntryChoice', 'SignUpBiometric', 'SignUpComplete']) {
      expect(genieMayOpen(r)).toBe(false);
    }
  });

  it('báo route NGAY lúc container sẵn sàng, không đợi lần điều hướng đầu', () => {
    // `onStateChange` chỉ chạy khi trạng thái ĐỔI — nó không chạy cho màn đầu
    // tiên. Thiếu chỗ này thì suốt từ lúc mở app tới cú điều hướng đầu, trợ lý
    // không biết mình đang ở màn nào.
    const nav = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'navigation', 'index.tsx'), 'utf8',
    );
    const ma = nav.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const onReady = ma.slice(ma.indexOf('onReady={'), ma.indexOf('<Stack.Navigator'));
    expect(onReady).toMatch(/setGenieRoute\(/);
    expect(ma).toMatch(/onStateChange=\{[\s\S]{0,400}setGenieRoute\(/);
  });

  it('màn ra tiền / mất danh tính thì trợ lý không mở được', () => {
    for (const r of ['SeedExport', 'WalletSend', 'ChatRoom', 'Guardian', 'Staking']) {
      expect(genieMayOpen(r)).toBe(false);
    }
    // Nhưng ví thì mở được — mở đúng màn rồi DỪNG.
    expect(genieMayOpen('PhoenixWallet')).toBe(true);
  });
});

describe('mở màn', () => {
  afterEach(() => setGenieNavigator(null));

  it('chưa nối dây thì báo `not-ready`, KHÔNG im lặng nuốt', () => {
    setGenieNavigator(null);
    expect(genieNavigatorReady()).toBe(false);
    expect(genieOpenScreen('FarmDetail')).toEqual({ ok: false, reason: 'not-ready' });
  });

  it('gõ "thêm vườn" ⇒ điều hướng tới đúng FarmDetail', () => {
    const calls: Array<[string, unknown]> = [];
    setGenieNavigator((route, params) => calls.push([route, params]));

    const out = handle('thêm vườn');
    expect(out.kind).toBe('opened');
    if (out.kind === 'opened') {
      expect(out.route).toBe('FarmDetail');
      expect(out.playbookId).toBe('farm.add');
      expect(out.say).toContain('thêm vườn');
    }
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('FarmDetail');
  });

  it('mở không được thì KHÔNG nói "em mở rồi"', () => {
    setGenieNavigator(null); // chưa sẵn sàng
    expect(handle('thêm vườn').kind).toBe('passthrough');
  });

  it('câu lạ ⇒ passthrough, và LUÔN có câu nói được', () => {
    setGenieNavigator(() => {});
    const out = handle('hôm nay trời đẹp quá');
    expect(out.kind).toBe('passthrough');
    expect(out.say.length).toBeGreaterThan(20);
  });

  it('câu từ chối XOAY VÒNG — lặp y hệt là thứ làm người ta nhận ra cái máy', () => {
    setGenieNavigator(() => {});
    __resetMissLine();
    const noi = [0, 1, 2].map(() => handle('chào em').say);
    expect(new Set(noi).size).toBe(3);
    for (const s of noi) expect(MISS_LINES).toContain(s);
  });

  it('mọi câu từ chối đều THỪA NHẬN giới hạn, không đổ cho người dùng', () => {
    // Hôm nay trợ lý đúng là chưa hiểu được — nói thẳng thế, đừng để người dùng
    // tưởng mình hỏi sai.
    for (const s of MISS_LINES) {
      expect(s.toLowerCase()).toMatch(/em (chưa|còn|nghe|chịu)/);
      expect(s.length).toBeGreaterThan(30);
    }
  });

  it('màn cấm không mở được dù có ai gọi thẳng', () => {
    setGenieNavigator(() => {
      throw new Error('không được điều hướng tới đây');
    });
    expect(genieOpenScreen('SeedExport')).toEqual({ ok: false, reason: 'denied' });
  });
});
