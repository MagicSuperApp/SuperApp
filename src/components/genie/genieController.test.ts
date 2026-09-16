// components/genie/genieController.test.ts
//
// API/state interface của Lớp Trợ lý (spec §21).
//
// Đây là biên mà Backend Agent sẽ nói chuyện qua. Nó phải cư xử đúng như khai
// báo kể cả khi bên kia gửi rác — một biên tin vào bên gọi là một biên sẽ vỡ đúng
// hôm đường truyền chập chờn.

import {
  MAX_MESSAGES,
  __resetGenie,
  closeAssistant,
  getGenieSnapshot,
  openAssistant,
  pushMessage,
  setAgentState,
  setAudioLevel,
  setTypingMode,
  subscribeGenie,
  updateLastAgentMessage,
} from './genieController';

beforeEach(() => __resetGenie());

describe('mở / đóng', () => {
  it('mở ra là SẠCH — không mang theo câu của lần trước', () => {
    openAssistant();
    pushMessage('user', 'thêm vườn');
    closeAssistant();
    openAssistant();
    expect(getGenieSnapshot().messages).toHaveLength(0);
  });

  it('§15 — mở bằng chạm vào `activated`, mở bằng giọng vào thẳng `listening`', () => {
    // `activated` là một nhịp mở màn để người dùng biết lớp đã lên. Vào thẳng
    // `idle` thì lớp hiện ra mà không có gì báo là nó đang sống.
    openAssistant();
    expect(getGenieSnapshot().state).toBe('activated');
    closeAssistant();
    openAssistant({ voice: true });
    expect(getGenieSnapshot().state).toBe('listening');
  });

  it('§14 — chế độ gõ TẮT mặc định; có sẵn chữ thì mới bật', () => {
    openAssistant();
    expect(getGenieSnapshot().typing).toBe(false);
    closeAssistant();
    openAssistant({ text: 'ghi lịch sử' });
    expect(getGenieSnapshot().typing).toBe(true);
  });

  it('đóng thì về idle và tắt mọi thứ đang chạy', () => {
    openAssistant({ voice: true });
    setAudioLevel(0.8);
    setTypingMode(true);
    closeAssistant();
    const s = getGenieSnapshot();
    expect(s.open).toBe(false);
    expect(s.state).toBe('idle');
    expect(s.audioLevel).toBe(0);
    expect(s.typing).toBe(false);
  });
});

describe('§9 — DÒNG TIN, không phải kho lưu', () => {
  it('các câu XẾP CHỒNG, câu mới ở cuối', () => {
    openAssistant();
    pushMessage('user', 'a');
    pushMessage('agent', 'b');
    const ms = getGenieSnapshot().messages;
    expect(ms.map((m) => m.text)).toEqual(['a', 'b']);
    expect(ms.map((m) => m.from)).toEqual(['user', 'agent']);
  });

  it('chỉ giữ vài câu gần nhất — cũ hơn thì RỤNG', () => {
    // Spec §9 cấm "danh sách message dài". Trần này là chỗ "xếp chồng" và "không
    // phải cửa sổ chat" gặp nhau.
    openAssistant();
    for (let i = 0; i < MAX_MESSAGES + 5; i += 1) pushMessage('agent', `c${i}`);
    const ms = getGenieSnapshot().messages;
    expect(ms).toHaveLength(MAX_MESSAGES);
    expect(ms[ms.length - 1].text).toBe(`c${MAX_MESSAGES + 4}`);
    expect(ms[0].text).toBe('c5');
  });

  it('mỗi câu có id riêng — dòng tin không bao giờ trùng khoá', () => {
    openAssistant();
    const ids = new Set<string>();
    for (let i = 0; i < 20; i += 1) ids.add(pushMessage('agent', 'x').id);
    expect(ids.size).toBe(20);
  });

  it('sửa được câu cuối của trợ lý — để dựng luồng chữ chảy dần', () => {
    openAssistant();
    pushMessage('user', 'thêm vườn');
    pushMessage('agent', 'Em đang');
    updateLastAgentMessage('Em đang mở tính năng thêm vườn…');
    const ms = getGenieSnapshot().messages;
    expect(ms).toHaveLength(2);
    expect(ms[1].text).toBe('Em đang mở tính năng thêm vườn…');
    // Câu của người dùng KHÔNG bị đụng vào.
    expect(ms[0].text).toBe('thêm vườn');
  });

  it('chưa có câu nào của trợ lý thì `updateLast…` thêm mới, không ném', () => {
    openAssistant();
    updateLastAgentMessage('xin chào');
    expect(getGenieSnapshot().messages).toHaveLength(1);
  });
});

describe('§8 — mức âm thanh', () => {
  it('nhận số THÔ và kẹp về [0,1]', () => {
    openAssistant();
    setAudioLevel(5);
    expect(getGenieSnapshot().audioLevel).toBe(1);
    setAudioLevel(-2);
    expect(getGenieSnapshot().audioLevel).toBe(0);
    setAudioLevel(NaN);
    expect(getGenieSnapshot().audioLevel).toBe(0);
  });

  it('giá trị KHÔNG đổi thì không bắn sự kiện', () => {
    // `setAudioLevel` chạy ~30–60 lần/giây. Bắn lại một giá trị y hệt là ép cả
    // cây vẽ chạy lại cho không.
    openAssistant();
    let dem = 0;
    const off = subscribeGenie(() => { dem += 1; });
    setAudioLevel(0.5);
    setAudioLevel(0.5);
    setAudioLevel(0.5);
    off();
    expect(dem).toBe(1);
  });
});

describe('đăng ký lắng nghe', () => {
  it('nhận được mọi lần đổi, và huỷ được', () => {
    const thay: string[] = [];
    const off = subscribeGenie((s) => thay.push(s.state));
    openAssistant();
    setAgentState('processing');
    off();
    setAgentState('speaking');
    expect(thay).toEqual(['activated', 'processing']);
  });

  it('nhiều nơi cùng nghe đều nhận đủ', () => {
    let a = 0;
    let b = 0;
    const offA = subscribeGenie(() => { a += 1; });
    const offB = subscribeGenie(() => { b += 1; });
    openAssistant();
    offA();
    offB();
    expect(a).toBe(1);
    expect(b).toBe(1);
  });
});

describe('dòng tin giữ đủ để CUỘN LẠI', () => {
  it('kho giữ nhiều hơn hẳn 6 câu — 6 là con số của thời chưa cuộn được', () => {
    // Khi dòng tin không cuộn được thì giữ nhiều hơn số vẽ ra là giữ những câu
    // không ai xem được. Cuộn được rồi thì con số này thành "xem lại được bao xa",
    // và 6 là quá ngắn cho một cuộc trao đổi thật.
    expect(MAX_MESSAGES).toBeGreaterThanOrEqual(30);
  });

  it('vẫn CÓ trần — đây là bộ nhớ trên máy người dùng, không phải kho lưu', () => {
    expect(MAX_MESSAGES).toBeLessThanOrEqual(100);
    __resetGenie();
    for (let i = 0; i < MAX_MESSAGES + 25; i += 1) pushMessage('user', `câu ${i}`);
    expect(getGenieSnapshot().messages).toHaveLength(MAX_MESSAGES);
    // Và cắt ở ĐẦU: câu mới nhất phải còn.
    const cuoi = getGenieSnapshot().messages.at(-1);
    expect(cuoi?.text).toBe(`câu ${MAX_MESSAGES + 24}`);
  });
});
