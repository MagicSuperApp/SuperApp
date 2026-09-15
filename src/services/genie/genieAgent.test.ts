// services/genie/genieAgent.test.ts
//
// Chặng G3–G6 phía vỏ: nối mô hình, nghe, nói, ảnh.
//
// Không bài nào chạm mạng và không bài nào cần module native. Cái được soi ở đây
// là những chỗ ĐÃ hoặc SẼ sai âm thầm: câu nào đi lên mô hình và câu nào không,
// ảnh có bị đường tắt nuốt mất không, và cửa gật có bao giờ tự gật không.

import { parseSse } from './genieClient';
import { fitEdge, MAX_IMAGES, MAX_EDGE } from './genieImage';
import { normLevel } from './asr';
import { estimateMs } from './tts';

/**
 * Đọc mã nguồn một tệp, ĐÃ BỎ chú thích.
 *
 * Bỏ chú thích là bắt buộc, không phải cho gọn: một bộ quét mã đọc cả chú thích
 * sẽ báo nhầm mỗi lần ai đó VIẾT VỀ đoạn mã cũ — và nó đã báo nhầm thật, vì chú
 * thích trong `genieAgent.ts` có nguyên văn `catch { ses = null }` để giải thích
 * lỗi vừa sửa. Bài kiểm bắt nhầm là bài kiểm sẽ bị nới ra cho đỡ phiền.
 */
const maNguon = (ten: string): string => require('fs')
  .readFileSync(require('path').join(__dirname, ten), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('đọc dòng SSE', () => {
  it('gom đúng sự kiện, bỏ [DONE] và dòng rỗng', () => {
    const evs = parseSse(
      'data: {"seq":1,"type":"state","value":"thinking"}\n\n'
      + 'data: {"seq":2,"type":"say","text":"Dạ em mở rồi ạ."}\n\n'
      + 'data: [DONE]\n\n',
    );
    expect(evs).toHaveLength(2);
    expect(evs[1]).toMatchObject({ type: 'say', text: 'Dạ em mở rồi ạ.' });
  });

  it('một mẩu HỎNG không làm mất những mẩu lành đi sau nó', () => {
    // Mẩu sau có thể là `error` — đúng cái người dùng cần thấy nhất.
    const evs = parseSse(
      'data: {khong-phai-json\n\n'
      + 'data: {"seq":9,"type":"error","code":"BUDGET","message":"Hôm nay bác hỏi nhiều rồi ạ."}\n\n',
    );
    expect(evs).toHaveLength(1);
    expect(evs[0]).toMatchObject({ type: 'error', code: 'BUDGET' });
  });

  it('mẩu chưa trọn thì KHÔNG trả ra nửa sự kiện', () => {
    expect(parseSse('data: {"seq":1,"type":"say","text":"Dạ em ')).toHaveLength(0);
  });
});

describe('rút gọn ảnh trước khi gửi', () => {
  it('giữ TỈ LỆ — ảnh méo thì mô hình đọc sai hình cái lá', () => {
    const r = fitEdge(4032, 3024);
    expect(Math.max(r.width, r.height)).toBe(MAX_EDGE);
    // Tỉ lệ 4:3 phải còn nguyên sau khi co.
    expect(r.width / r.height).toBeCloseTo(4032 / 3024, 2);
  });

  it('ảnh dọc co theo cạnh DÀI, không theo chiều rộng', () => {
    const r = fitEdge(1200, 3600);
    expect(r.height).toBe(MAX_EDGE);
    expect(r.width).toBeLessThan(MAX_EDGE);
  });

  it('ảnh đã nhỏ hơn trần thì ĐỂ NGUYÊN, không phóng to', () => {
    // Phóng to lên cho "đủ chuẩn" là thêm byte mà không thêm chi tiết nào.
    expect(fitEdge(640, 480)).toEqual({ width: 640, height: 480 });
  });

  it('kích thước rác không làm ném — trả về trần', () => {
    for (const [w, h] of [[0, 0], [-1, 100], [NaN, 100]]) {
      const r = fitEdge(w, h);
      expect(Number.isFinite(r.width) && r.width > 0).toBe(true);
    }
  });

  it('trần số ảnh khớp cổng gác phía máy chủ', () => {
    // Hai chỗ cùng một con số: chỗ này để tiết kiệm, chỗ kia để bảo vệ. Lệch nhau
    // thì một bên sẽ từ chối cái bên kia vừa gửi, và người dùng chỉ thấy "lỗi".
    expect(MAX_IMAGES).toBe(3);
  });
});

describe('cổng nghe', () => {
  it('nắn biên độ về [0,1] và kẹp ở hai đầu', () => {
    expect(normLevel(-2)).toBe(0);
    expect(normLevel(10)).toBe(1);
    expect(normLevel(4)).toBeCloseTo(0.5, 2);
    // Thang gốc khác nhau giữa hai hệ điều hành, nên giá trị ngoài khoảng là
    // chuyện thường — kẹp, đừng để nó chạy ra ngoài rồi làm sóng nhảy vọt.
    expect(normLevel(999)).toBe(1);
    expect(normLevel(-999)).toBe(0);
    expect(normLevel(NaN)).toBe(0);
  });
});

describe('cổng nói', () => {
  it('ước lượng theo ÂM TIẾT, không theo ký tự', () => {
    // Tiếng Việt đơn âm: số âm tiết ổn định, còn số ký tự phình ra vì dấu.
    const a = estimateMs('Em đã mở tính năng thêm vườn cho bác rồi ạ');
    const b = estimateMs('Em da mo tinh nang them vuon cho bac roi a');
    expect(a).toBe(b);
    expect(a).toBeGreaterThan(1500);
    expect(a).toBeLessThan(4000);
  });

  it('câu rỗng ⇒ 0, không phải một khoảng chờ vô nghĩa', () => {
    expect(estimateMs('')).toBe(0);
    expect(estimateMs('   ')).toBe(0);
  });
});

describe('chọn đường: đường tắt hay mô hình', () => {
  // `genieAgent` đọc `GENIE_URL` lúc nạp module, nên mỗi ca phải nạp lại sạch.
  //
  // ⚠ `genieNav` PHẢI nối dây BÊN TRONG cùng khối `isolateModules`. Nạp lại tách
  // biệt cho ra một thể `genieNav` KHÁC, nên một `setGenieNavigator` gọi ở ngoài
  // sẽ nối vào thể cũ — và bài kiểm đỏ ở một chỗ trông như lỗi điều hướng, trong
  // khi mã sản phẩm hoàn toàn đúng.
  const load = (): typeof import('./genieAgent') => {
    let m: typeof import('./genieAgent');
    jest.isolateModules(() => {
      (require('./genieNav') as typeof import('./genieNav')).setGenieNavigator(() => {});
      m = require('./genieAgent');
    });
    return m!;
  };

  it('câu KHỚP sổ ⇒ mở màn NGAY, không gọi mô hình', async () => {
    const { ask } = load();
    const says: string[] = [];
    let opened: string | null = null;
    await new Promise<void>((done) => {
      ask('thêm vườn', {
        onSay: (s) => says.push(s),
        onOpened: (r) => { opened = r; },
        onDone: done,
      });
    });
    expect(opened).toBe('FarmDetail');
    expect(says.join(' ')).toContain('thêm vườn');
  });

  it('KHÔNG nối được ⇒ NÓI RA, không lặng lẽ trả lời bằng bảng tra', async () => {
    // ⛔ Đây là lỗi người dùng báo, và nó là lỗi TỆ vì nó trông như đang chạy:
    // bấm gửi → "đang xử lý" một lúc lâu → rồi nhận một câu y như chưa từng nối
    // gì. Bản trước nuốt sạch lỗi (`catch { ses = null }`) rồi rơi thẳng về
    // `handle()`, nên không ai phân biệt được "mô hình trả lời thế" với "mô hình
    // không chạy".
    //
    // Bản dựng test có `GENIE_URL` nhưng KHÔNG có `setGenieAuth` ⇒ chưa đăng
    // nhập. Câu nói ra phải chỉ đúng việc phải làm.
    const { ask } = load();
    const says: string[] = [];
    await new Promise<void>((done) => {
      ask('hôm nay trời đẹp quá', { onSay: (s) => says.push(s), onDone: done });
    });
    expect(says.length).toBeGreaterThanOrEqual(1);
    expect(says[0]).toMatch(/đăng nhập/i);
  });

  it('mỗi ca hỏng một CÂU KHÁC NHAU — gộp lại là bắt người dùng đoán', () => {
    // Ba ca, ba việc phải làm: đăng nhập · chờ máy chủ · không làm gì được cả.
    // Gộp thành một câu chung thì họ gõ lại đúng câu đó thêm mười lần.
    const src = maNguon('genieAgent.ts');
    expect(src).toMatch(/chua-dang-nhap/);
    expect(src).toMatch(/khong-noi-duoc/);
    expect(src).toMatch(/chua-cau-hinh/);
    // Và lỗi KHÔNG được nuốt: phải còn chỗ ghi lại lý do.
    expect(src).toMatch(/lastFail/);
    expect(src).not.toMatch(/catch\s*\{\s*ses = null/);
  });

  it('hỏng rồi thì NGHỈ, không trả giá trần mạng ở mọi câu tiếp theo', () => {
    // Không có chỗ nghỉ thì mỗi câu người dùng gõ lại chờ hết trần một lần nữa —
    // và họ sẽ gõ tiếp, vì lần trước trông như chỉ chậm.
    const src = maNguon('genieAgent.ts');
    expect(src).toMatch(/RETRY_AFTER_MS/);
  });

  it('bắt tay phải HỎNG NHANH — 15 giây là 15 giây người dùng ngồi nhìn', () => {
    const src = maNguon('genieClient.ts');
    const m = src.match(/JSON_TIMEOUT_MS = ([\d_]+)/);
    expect(m).toBeTruthy();
    expect(Number(String(m![1]).replace(/_/g, ''))).toBeLessThanOrEqual(8000);
  });

  it('CÓ ẢNH thì KHÔNG đi đường tắt, dù câu chữ khớp sổ', async () => {
    // Đường tắt chỉ đọc chữ. Để nó nuốt một câu kèm ảnh là làm rơi mất tấm ảnh —
    // và người dùng chụp ảnh là họ đang hỏi VỀ tấm ảnh đó.
    const { ask } = load();
    const says: string[] = [];
    let opened: string | null = null;
    await new Promise<void>((done) => {
      ask('thêm vườn', {
        onSay: (s) => says.push(s),
        onOpened: (r) => { opened = r; },
        onDone: done,
      }, [{ mediaType: 'image/jpeg', data: 'AAAA' }]);
    });
    expect(opened).toBeNull();
    // Không nối được ⇒ nói thẳng là ảnh cần máy chủ, không giả vờ xem được.
    expect(says.join(' ')).toMatch(/ảnh/i);
  });

  it('cắt lời được ngay, kể cả trước khi có câu nào', () => {
    const { ask } = load();
    const h = ask('câu gì đó rất lạ', { onSay: () => {} });
    expect(() => h.abort()).not.toThrow();
  });
});

describe('cửa gật — luật, không phải tuỳ chọn', () => {
  it('lớp phủ KHÔNG bao giờ tự gật: thiếu chỗ hỏi ⇒ LẮC', () => {
    // Soi thẳng mã nguồn, vì đây là loại luật mà một bản sửa "cho tiện" sẽ phá
    // trong im lặng: đổi `: false` thành `: true` không làm đỏ bài kiểm nào khác.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'genieAgent.ts'), 'utf8',
    );
    expect(src).toMatch(/cb\.onConfirm\s*\?\s*await cb\.onConfirm\([^)]*\)\s*:\s*false/);
    // Và không có đường nào coi hết-giờ là đồng ý.
    expect(src).not.toMatch(/granted\s*=\s*true/);
  });

  it('lớp phủ LẮC khi đóng giữa chừng', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, '..', '..', 'components', 'genie', 'GenieLayer.tsx'), 'utf8',
    );
    expect(src).toMatch(/if \(!g\.open && confirmResolve\.current\) traLoiGat\(false\)/);
  });
});

describe('không có đường lui mặc định', () => {
  it('KHÔNG có địa chỉ máy chủ nào viết cứng trong mã trợ lý', () => {
    // `aladinChat.ts` đã trả giá cho đúng lỗi này: một tunnel tạm trên máy lập
    // trình viên nằm trong bundle và nhận nguyên văn câu hỏi của người dùng thật.
    const fs = require('fs');
    const path = require('path');
    for (const f of ['genieClient.ts', 'genieAgent.ts', 'genieAuth.ts']) {
      const src = fs.readFileSync(path.join(__dirname, f), 'utf8');
      const ma = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(ma).not.toMatch(/https?:\/\/[a-z0-9]/i);
    }
  });
});

describe('scope — app và sổ tool phải khớp, không được gõ tay', () => {
  it('SCOPES lấy từ tệp SINH, không phải một danh sách viết tay', () => {
    // ⛔ Ca đã xảy ra: tệp này gõ tay `farm.read`/`care.write`… không khớp một chữ
    // nào với tên thật `read:trace.record`/`write:trace.record`. Máy chủ lọc sổ
    // tool theo scope ⇒ app thấy đúng 5 tool `ui.*`, 17 tool máy chủ vô hình.
    // Trợ lý mở được màn mà không đọc nổi một cái vườn — và phiên vẫn 200.
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'genieAgent.ts'), 'utf8',
    );
    expect(src).toMatch(/import \{ GENIE_SCOPES \} from '\.\/playbooks\.generated'/);
    // Không có mảng scope viết tay nào còn sót lại.
    expect(src).not.toMatch(/'(farm|care|animal|trace|notify)\.(read|write)'/);
  });

  it('mọi scope đều có dạng `hành-động:tài-nguyên` như sổ tool khai', () => {
    const { GENIE_SCOPES } = require('./playbooks.generated');
    expect(GENIE_SCOPES.length).toBeGreaterThanOrEqual(5);
    for (const s of GENIE_SCOPES) {
      expect(s).toMatch(/^(read|write):[a-z.]+$/);
    }
  });

  it('KHÔNG scope nào chạm tiền/khoá — T3 là tính chất cấu trúc', () => {
    // Máy chủ không có gì để ký, nên nó không ký được gì. Một scope ví/khoá xuất
    // hiện ở đây nghĩa là ai đó vừa mở một cửa mà cả kiến trúc dựng để không có.
    const { GENIE_SCOPES } = require('./playbooks.generated');
    for (const s of GENIE_SCOPES) {
      expect(s).not.toMatch(/wallet|seed|key|sign|pay|transfer|stake/i);
    }
  });
});

describe('chẩn đoán phải NÓI ĐÚNG cái nó biết', () => {
  it('hết giờ KHÔNG được khẳng định "mở được kết nối"', () => {
    // ⛔ Bản trước nói đúng câu đó, và nó SAI: một lần hết giờ chỉ chứng minh
    // KHÔNG CÓ ĐÁP trong ngần ấy giây. Đo lại thì bắt tay chỉ mất 0,25–0,5s —
    // tức máy chủ không hề chậm, và câu chẩn đoán đã dẫn đi soi nhầm chỗ suốt
    // một vòng.
    const src = maNguon('genieAgent.ts');
    expect(src).not.toMatch(/mở được kết nối nhưng máy chủ/);
    // Và phải nêu nghi phạm hay gặp nhất: địa chỉ không tới được từ chỗ app chạy.
    expect(src).toMatch(/10\.0\.2\.2/);
    expect(src).toMatch(/GENIE_HOST=0\.0\.0\.0/);
  });

  it('hỏng thì HỎI THÊM /health — một lần hết giờ không tách nổi hai ca', () => {
    // `/health` câm  → không tới được máy chủ
    // `/health` đáp  → tới được, hỏng ở cửa mở phiên
    const src = maNguon('genieAgent.ts');
    expect(src).toMatch(/genieHealth\(\)/);
  });

  it('phiên mở SẴN lúc khởi động — bắt tay không nằm trên đường câu hỏi đầu', () => {
    // Không có chỗ này thì người dùng gõ xong, bấm gửi, rồi ngồi chờ hết cả lượt
    // bắt tay — và nếu nó hỏng thì chờ hết trần mới biết.
    expect(maNguon('genieAgent.ts')).toMatch(/export function warmGenie/);
    expect(maNguon('genieAuth.ts')).toMatch(/warmGenie\(\)/);
  });

  it('MỞ PHIÊN có trần riêng, dài hơn — nó đi thêm một chặng nữa', () => {
    // Máy chủ phải gọi `GET /api/me` của OriLife để kiểm thẻ. Dùng chung trần với
    // những lượt gọi không đi đâu cả là ép cái bắt tay vào một cái áo chật.
    const src = maNguon('genieClient.ts');
    const ses = Number(String(src.match(/SESSION_TIMEOUT_MS = ([\d_]+)/)![1]).replace(/_/g, ''));
    const ngan = Number(String(src.match(/JSON_TIMEOUT_MS = ([\d_]+)/)![1]).replace(/_/g, ''));
    expect(ses).toBeGreaterThan(ngan);
    expect(ses).toBeLessThanOrEqual(15000);
  });
});

describe('lỗi NHỚ LẠI phải nói là mình đang nhắc lại', () => {
  it('không được trả nguyên văn lý do cũ như thể vừa xảy ra', () => {
    // ⛔ Người dùng thấy "hết 12s không có đáp" bật ra NGAY LẬP TỨC — một câu tự
    // mâu thuẫn. Cái nhanh là đúng (đã hỏng thì đừng bắt chờ thêm 12 giây nữa);
    // cái sai là không nói ra mình đang nhắc lại một lần thử cũ.
    const src = maNguon('genieAgent.ts');
    expect(src).toMatch(/nhớ lại từ lần thử/);
  });

  it('`warmGenie` báo kết quả ra console — đừng bắt phải chat mới biết', () => {
    // Lúc chat thì cái hiện ra lại là lỗi NHỚ LẠI, khó đọc gấp đôi.
    expect(maNguon('genieAgent.ts')).toMatch(/phiên sẵn sàng/);
  });
});
