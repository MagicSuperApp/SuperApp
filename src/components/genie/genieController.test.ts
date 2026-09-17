// components/genie/genieController.test.ts
//
// API/state interface của Lớp Trợ lý (spec §21).
//
// Đây là biên mà Backend Agent sẽ nói chuyện qua. Nó phải cư xử đúng như khai
// báo kể cả khi bên kia gửi rác — một biên tin vào bên gọi là một biên sẽ vỡ đúng
// hôm đường truyền chập chờn.

import {
  MAX_MESSAGES,
  MAX_SECTIONS,
  SECTION_NEW_TITLE,
  __resetGenie,
  clearSections,
  closeAssistant,
  deleteSection,
  getGenieSnapshot,
  newSection,
  openAssistant,
  pushMessage,
  sectionTitle,
  selectSection,
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

  it('...nhưng câu cũ KHÔNG bị xoá, nó lui vào danh sách', () => {
    // Màn hình sạch như trước; thứ đổi là cái biến khỏi màn hình thôi biến khỏi
    // máy. Trước bản này `openAssistant` đặt thẳng `messages: []` — mỗi lần mở là
    // một lần xoá không hỏi ai.
    openAssistant();
    pushMessage('user', 'thêm vườn');
    const cu = getGenieSnapshot().activeId;
    closeAssistant();
    openAssistant();
    const s = getGenieSnapshot();
    expect(s.activeId).not.toBe(cu);
    expect(s.sections.find((x) => x.id === cu)?.messages).toHaveLength(1);
  });

  it('mở-đóng-mở khi chưa hỏi gì thì KHÔNG đẻ ra cuộc trống', () => {
    // Ba cuộc trống là một cột rác che mất mấy cuộc thật.
    openAssistant();
    closeAssistant();
    openAssistant();
    closeAssistant();
    openAssistant();
    expect(getGenieSnapshot().sections).toHaveLength(1);
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

describe('các CUỘC trò chuyện', () => {
  it('luôn có sẵn một cuộc, kể cả lúc chưa ai hỏi gì', () => {
    // Để `sections` rỗng thì mọi lệnh ghi tin phải tự lo ca "chưa có cuộc nào",
    // và chỉ cần một chỗ quên là câu của người dùng rơi vào hư vô.
    const s = getGenieSnapshot();
    expect(s.sections).toHaveLength(1);
    expect(s.activeId).toBe(s.sections[0].id);
  });

  it('`messages` là tin của cuộc ĐANG MỞ, không phải một bản sao thứ hai', () => {
    openAssistant();
    pushMessage('user', 'a');
    const s = getGenieSnapshot();
    expect(s.messages).toBe(s.sections.find((x) => x.id === s.activeId)!.messages);
  });

  it('tên cuộc lấy từ câu hỏi ĐẦU TIÊN, và chỉ một lần', () => {
    openAssistant();
    pushMessage('user', 'sâu ăn lá cam');
    pushMessage('agent', 'Dạ bác chụp giúp em tấm ảnh');
    pushMessage('user', 'đây ạ');
    const s = getGenieSnapshot();
    // Tên chạy theo câu mới nhất thì danh sách không nhớ được.
    expect(s.sections.find((x) => x.id === s.activeId)?.title).toBe('sâu ăn lá cam');
  });

  it('câu của TRỢ LÝ không đặt tên cuộc', () => {
    openAssistant();
    pushMessage('agent', 'Em chào bác ạ');
    const s = getGenieSnapshot();
    expect(s.sections.find((x) => x.id === s.activeId)?.title).toBe(SECTION_NEW_TITLE);
  });

  it('tên dài bị cắt THEO TỪ, không cắt giữa chữ', () => {
    const dai = 'bác cho em hỏi cái cây cam nhà em bị vàng lá từ tuần trước thì làm sao ạ';
    const ten = sectionTitle(dai);
    expect(ten.length).toBeLessThanOrEqual(44);
    expect(ten.endsWith('\u2026')).toBe(true);
    // Cắt giữa một chữ cho ra một âm tiết cụt không đọc được.
    expect(dai.startsWith(ten.slice(0, -1))).toBe(true);
    expect(ten).not.toMatch(/ \u2026$/);
  });

  it('câu rỗng thì tên mặc định, không phải một dòng trắng', () => {
    expect(sectionTitle('   ')).toBe(SECTION_NEW_TITLE);
    expect(sectionTitle(undefined as never)).toBe(SECTION_NEW_TITLE);
  });

  it('chuyển cuộc thì dòng tin đổi theo', () => {
    openAssistant();
    pushMessage('user', 'cuộc một');
    const mot = getGenieSnapshot().activeId;
    const hai = newSection();
    pushMessage('user', 'cuộc hai');
    expect(getGenieSnapshot().messages.map((m) => m.text)).toEqual(['cuộc hai']);
    selectSection(mot);
    expect(getGenieSnapshot().messages.map((m) => m.text)).toEqual(['cuộc một']);
    selectSection(hai);
    expect(getGenieSnapshot().messages.map((m) => m.text)).toEqual(['cuộc hai']);
  });

  it('id lạ thì KHÔNG chuyển — không tự đẻ cuộc ma', () => {
    openAssistant();
    const cu = getGenieSnapshot().activeId;
    selectSection('khong-co-that');
    expect(getGenieSnapshot().activeId).toBe(cu);
    expect(getGenieSnapshot().sections).toHaveLength(1);
  });

  it('cuộc MỚI NHẤT đứng đầu danh sách', () => {
    openAssistant();
    pushMessage('user', 'cũ');
    const moi = newSection();
    expect(getGenieSnapshot().sections[0].id).toBe(moi);
  });

  it('xoá cuộc KHÁC thì cuộc đang mở không xê dịch', () => {
    openAssistant();
    pushMessage('user', 'cũ');
    const cu = getGenieSnapshot().activeId;
    newSection();
    pushMessage('user', 'mới');
    deleteSection(cu);
    expect(getGenieSnapshot().messages.map((m) => m.text)).toEqual(['mới']);
  });

  it('xoá đúng cuộc ĐANG MỞ thì có cuộc khác thế chỗ ngay', () => {
    // Để `activeId` trỏ vào hư vô là để lệnh ghi tin kế tiếp lặng lẽ đẻ ra một
    // cuộc thứ hai mà người dùng không hiểu ở đâu ra.
    openAssistant();
    pushMessage('user', 'cũ');
    const cu = getGenieSnapshot().activeId;
    newSection();
    pushMessage('user', 'mới');
    deleteSection(getGenieSnapshot().activeId);
    const s = getGenieSnapshot();
    expect(s.activeId).toBe(cu);
    expect(s.sections.some((x) => x.id === s.activeId)).toBe(true);
  });

  it('xoá cuộc CUỐI CÙNG vẫn còn một cuộc trắng để hỏi tiếp', () => {
    openAssistant();
    pushMessage('user', 'một mình');
    deleteSection(getGenieSnapshot().activeId);
    const s = getGenieSnapshot();
    expect(s.sections).toHaveLength(1);
    expect(s.messages).toHaveLength(0);
    expect(s.activeId).toBe(s.sections[0].id);
  });

  it('đăng xuất thì SẠCH — máy ngoài đồng dùng chung cho cả tổ', () => {
    openAssistant();
    pushMessage('user', 'vườn nhà bác A');
    newSection();
    pushMessage('user', 'câu nữa');
    clearSections();
    const s = getGenieSnapshot();
    expect(s.sections).toHaveLength(1);
    expect(s.messages).toHaveLength(0);
  });

  it('danh sách CÓ TRẦN — cuộc cũ nhất rụng', () => {
    openAssistant();
    for (let i = 0; i < MAX_SECTIONS + 6; i += 1) {
      newSection();
      pushMessage('user', `cuộc ${i}`);
    }
    const s = getGenieSnapshot();
    expect(s.sections).toHaveLength(MAX_SECTIONS);
    expect(s.sections[0].messages[0].text).toBe(`cuộc ${MAX_SECTIONS + 5}`);
  });

  it('id cuộc không bao giờ trùng id câu — danh sách không vẽ nhầm hàng', () => {
    openAssistant();
    const ids = new Set<string>();
    for (let i = 0; i < 8; i += 1) {
      ids.add(newSection());
      ids.add(pushMessage('user', `x${i}`).id);
    }
    expect(ids.size).toBe(16);
  });
});
