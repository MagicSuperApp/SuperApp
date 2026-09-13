/**
 * Mạng lưới chấm của màn đăng nhập — kiểm những thứ mắt không kiểm được.
 *
 * Một màn hiệu ứng rất dễ "trông thì chạy". Bốn cách hỏng dưới đây đều KHÔNG lộ
 * ra trong mươi giây đầu người ta nhìn thử, và cả bốn đều là hỏng thật:
 *
 *   1. chấm trôi ra ngoài khung rồi không về — sau một phút màn còn một nửa số chấm;
 *   2. cú chạm kéo cả mạng thành một CỤC ĐẶC rồi đứng im, hết cả quỹ đạo;
 *   3. làn sáng dừng giữa chừng, bỏ lại một mảng tối — người dùng đứng chờ một
 *      màn chuyển không bao giờ tới, vì nơi gọi chờ `daSangHet()`;
 *   4. app về lại tiền cảnh sau một lúc nằm nền, khung đầu mang `dt` khổng lồ và
 *      mạng lưới nổ tung.
 *
 * Nguồn ngẫu nhiên bơm vào là một dãy ĐỊNH SẴN, nên mỗi lần chạy là cùng một
 * mạng lưới: một lần đỏ ở máy dựng bản là một lần dựng lại được trên máy mình.
 */

import {
  BAN_KINH_NOI,
  batLanTruyen,
  buoc,
  daSangHet,
  buongCham,
  datCham,
  doiKhung,
  duyetCanh,
  taoMangLuoi,
  type MangLuoi,
} from './mangLuoi';

/** Nguồn giả định sẵn — tuần hoàn, không lặp lại đúng một giá trị. */
const nguon = (hat = 1): (() => number) => {
  let x = hat;
  return () => {
    // LCG nhỏ. Không cần chất lượng mật mã: chỉ cần LẶP LẠI ĐƯỢC.
    x = (x * 1103515245 + 12345) % 2147483648;
    return x / 2147483648;
  };
};

const RONG = 390;
const CAO = 844;

const tua = (m: MangLuoi, giay: number, dt = 1 / 60) => {
  for (let i = 0; i < Math.round(giay / dt); i++) buoc(m, dt);
};

/**
 * Chấm đi LẠC — xa khung tới mức không còn là quán tính.
 *
 * Không so với đúng mép màn nữa: mô hình lò xo có độ vọt, nên một chấm ở ô ngoài
 * cùng được phép trôi quá mép vài chục pixel rồi lắc về, và đó là thứ CẦN có.
 * Biên 120 px rộng hơn mọi độ vọt đo được, nhưng vẫn chặn được chấm thật sự bay
 * đi mất — thứ mà bản dội-mép trước đây không có gì canh.
 */
const LE = 120;
const ngoaiKhung = (m: MangLuoi) =>
  m.nut.filter((n) => n.x < -LE || n.x > m.rong + LE || n.y < -LE || n.y > m.cao + LE);

describe('lang thang tự do', () => {
  it('không chấm nào rời khỏi khung, dù chạy hai phút', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    tua(m, 120);
    expect(ngoaiKhung(m)).toHaveLength(0);
  });

  it('mọi chấm đều có đường đi riêng — không hai chấm nào trùng bước', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    const dau = m.nut.map((n) => ({ x: n.x, y: n.y }));
    tua(m, 8);
    // Mỗi chấm dịch một quãng khác nhau. Trùng nhau tới hai chữ số thập phân
    // nghĩa là chúng đang dùng chung một tham số — đúng lỗi "quỹ đạo riêng" hỏng.
    const quang = m.nut.map((n, i) =>
      Math.hypot(n.x - dau[i].x, n.y - dau[i].y).toFixed(2),
    );
    expect(new Set(quang).size).toBeGreaterThan(90);
  });

  /**
   * Lang thang là LƯỢN QUANH NHÀ, không phải trôi đi đâu đó.
   *
   * Ngưỡng suy từ thiết kế: bán kính vòng lượn tối đa là 42 px mỗi trục, nên
   * chấm không bao giờ được ở xa nhà quá đường chéo của nó (~60 px) cộng một
   * phần dư cho độ vọt của lò xo. Đây là bài canh chặt nhất của cả tệp: nó là
   * thứ ngăn mạng lưới dồn dần về một phía, điều mà bản dội-mép trước đây làm.
   */
  it('không chấm nào đi xa NHÀ của nó, dù chạy hai phút', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    let xa = 0;
    for (let i = 0; i < 120 * 60; i++) {
      buoc(m, 1 / 60);
      for (const n of m.nut) xa = Math.max(xa, Math.hypot(n.x - n.nhaX, n.y - n.nhaY));
    }
    expect(xa).toBeLessThan(80);
  });

  it('lưới dàn đều khắp màn — không phần tư nào bị bỏ trống', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    tua(m, 30);
    const dem = [0, 0, 0, 0];
    for (const n of m.nut) {
      dem[(n.x > m.rong / 2 ? 1 : 0) + (n.y > m.cao / 2 ? 2 : 0)]++;
    }
    // 100 chấm trên lưới 10×10 → mỗi phần tư đúng 25 ô. Cho rộng tay vì chấm
    // lượn qua lại quanh đường chia, nhưng một phần tư dưới 15 là mạng đã dồn.
    for (const d of dem) expect(d).toBeGreaterThanOrEqual(15);
  });
});

describe('tốc độ lúc KHÔNG có tác động', () => {
  /**
   * Ngưỡng suy TỪ THIẾT KẾ, không bốc: tốc độ tiếp tuyến của vòng lượn là
   * `2π · bán kính · tần số`, trần là `2π × 42 × 0,055 ≈ 14,5 px/s`. Cho thêm
   * một phần dư cho độ vọt của lò xo rồi chốt ở 20.
   *
   * Đây là bài canh đúng thứ vừa bị báo: kéo tần số vòng lượn lên là mạng lưới
   * chạy nhanh trở lại, và bài này đỏ ngay.
   */
  it('không chấm nào đi nhanh quá 20 px/s khi đã lặng', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    tua(m, 10); // để hệ lắng hẳn
    let nhanhNhat = 0;
    for (let i = 0; i < 30 * 60; i++) {
      buoc(m, 1 / 60);
      for (const n of m.nut) nhanhNhat = Math.max(nhanhNhat, Math.hypot(n.vx, n.vy));
    }
    expect(nhanhNhat).toBeLessThan(20);
  });

  it('nhưng CÓ tác động thì nhanh hẳn lên — không phải một màn đứng im', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    tua(m, 10);
    datCham(m, RONG / 2, CAO / 2);
    let nhanhNhat = 0;
    for (let i = 0; i < 3 * 60; i++) {
      buoc(m, 1 / 60);
      for (const n of m.nut) nhanhNhat = Math.max(nhanhNhat, Math.hypot(n.vx, n.vy));
    }
    // Gấp nhiều lần mức lặng; nếu hai chế độ xấp xỉ nhau thì cú chạm vô nghĩa.
    expect(nhanhNhat).toBeGreaterThan(120);
  });
});

describe('lưới nhà', () => {
  it('100 chấm cho lưới 10×10, mỗi chấm một ô riêng', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    expect(m.cot).toBe(10);
    expect(m.hang).toBe(10);
    const o = new Set(m.nut.map((n) => `${n.oCot},${n.oHang}`));
    expect(o.size).toBe(100);
  });

  it('nhà nằm TRONG ô của nó', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    const oRong = RONG / m.cot;
    const oCao = CAO / m.hang;
    for (const n of m.nut) {
      expect(n.nhaX).toBeGreaterThanOrEqual(n.oCot * oRong);
      expect(n.nhaX).toBeLessThanOrEqual((n.oCot + 1) * oRong);
      expect(n.nhaY).toBeGreaterThanOrEqual(n.oHang * oCao);
      expect(n.nhaY).toBeLessThanOrEqual((n.oHang + 1) * oCao);
    }
  });

  it('khung hình ĐẦU TIÊN đã là lưới dàn đều, không phải đám chấm đang trôi về', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    for (const n of m.nut) {
      expect(n.x).toBe(n.nhaX);
      expect(n.y).toBe(n.nhaY);
    }
  });
});

describe('chạm — tụ về và xoay quanh', () => {
  it('kéo các chấm lại gần điểm chạm', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    const cx = RONG / 2;
    const cy = CAO / 2;
    const truoc = m.nut.map((n) => Math.hypot(n.x - cx, n.y - cy));
    datCham(m, cx, cy);
    tua(m, 3);
    const sau = m.nut.map((n) => Math.hypot(n.x - cx, n.y - cy));
    const trungBinh = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(trungBinh(sau)).toBeLessThan(trungBinh(truoc));
  });

  it('KHÔNG tụ thành một cục — mỗi chấm giữ bán kính riêng', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    const cx = RONG / 2;
    const cy = CAO / 2;
    datCham(m, cx, cy);
    tua(m, 4);
    const bk = m.nut.map((n) => Math.hypot(n.x - cx, n.y - cy));
    // Chấm gần nhất và xa nhất phải cách nhau rõ rệt; nếu cả trăm chấm rơi vào
    // cùng một bán kính thì đó là một cái vòng, không phải một mạng lưới.
    expect(Math.max(...bk) - Math.min(...bk)).toBeGreaterThan(60);
  });

  it('vẫn XOAY sau khi đã vào quỹ đạo — góc của chấm đổi theo thời gian', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    const cx = RONG / 2;
    const cy = CAO / 2;
    datCham(m, cx, cy);
    tua(m, 2);
    const goc = m.nut.map((n) => Math.atan2(n.y - cy, n.x - cx));
    tua(m, 1.5);
    const gocSau = m.nut.map((n) => Math.atan2(n.y - cy, n.x - cx));
    const doi = goc.filter((g, i) => Math.abs(g - gocSau[i]) > 0.05);
    expect(doi.length).toBeGreaterThan(90);
  });

  it('xoay CẢ HAI CHIỀU — không thành một bánh xe quay một phía', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    const thuan = m.nut.filter((n) => n.tocDoQuay > 0).length;
    expect(thuan).toBeGreaterThan(20);
    expect(thuan).toBeLessThan(80);
  });

  it('giữ ngón bao lâu cũng KHÔNG tự thả', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    datCham(m, RONG / 2, CAO / 2);
    tua(m, 30);
    expect(m.cham).not.toBeNull();
  });

  it('bám theo ngón tay khi ngón DỊCH, không đứng ở chỗ chạm đầu', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    datCham(m, 60, 120);
    tua(m, 1.5);
    // Kéo ngón sang góc đối diện rồi giữ ở đó.
    for (let i = 0; i < 90; i++) {
      datCham(m, 60 + (i * (RONG - 120)) / 90, 120 + (i * (CAO - 240)) / 90);
      buoc(m, 1 / 60);
    }
    tua(m, 1.5);
    const tb = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const quanhNgon = tb(m.nut.map((n) => Math.hypot(n.x - (RONG - 60), n.y - (CAO - 120))));
    const quanhChoCu = tb(m.nut.map((n) => Math.hypot(n.x - 60, n.y - 120)));
    expect(quanhNgon).toBeLessThan(quanhChoCu);
  });

  it('thả tay thì các chấm quay về NHÀ', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    datCham(m, RONG / 2, CAO / 2);
    tua(m, 3);
    const xaLucTu = m.nut.map((n) => Math.hypot(n.x - n.nhaX, n.y - n.nhaY));
    buongCham(m);
    expect(m.cham).toBeNull();
    tua(m, 4);
    const xaSauVe = m.nut.map((n) => Math.hypot(n.x - n.nhaX, n.y - n.nhaY));
    const tb = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(tb(xaSauVe)).toBeLessThan(tb(xaLucTu));
    expect(Math.max(...xaSauVe)).toBeLessThan(80);
  });

  /**
   * QUÁN TÍNH. Đây là thứ phân biệt lò xo với phép gán vị trí, và là câu trả lời
   * cho "hiện tại quá cứng": một chấm bay nhanh về nhà phải VỌT QUA rồi lắc lại,
   * chứ không dừng khựng đúng điểm đích.
   *
   * ── Vì sao ngưỡng chỉ là 10 trên 100 chấm ───────────────────────────────
   * Phép dò đòi chấm phải tới RẤT GẦN nhà (dưới 6 px) rồi xa ra lại. Nhưng đích
   * thật của chấm lúc tự do không phải điểm nhà mà là một điểm chạy vòng quanh
   * nhà, bán kính tới 42 px — nên chỉ những chấm có vòng lượn tình cờ quét sát
   * nhà mới lọt vào phép dò này. Đo được 17; ngưỡng đặt 10 để chừa dư.
   *
   * Điều bài này thật sự khẳng định là con số ấy KHÁC KHÔNG. Với `zeta = 1`
   * (giảm chấn tới hạn) thì theo định nghĩa không có độ vọt, và nó về 0.
   */
  it('có ĐỘ VỌT khi về nhà từ xa — đó là quán tính', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    datCham(m, RONG / 2, CAO / 2);
    tua(m, 3);
    buongCham(m);
    const day = m.nut.map((n) => Math.hypot(n.x - n.nhaX, n.y - n.nhaY));
    const vot = new Array(m.nut.length).fill(false);
    for (let i = 0; i < 4 * 60; i++) {
      buoc(m, 1 / 60);
      m.nut.forEach((n, j) => {
        const d = Math.hypot(n.x - n.nhaX, n.y - n.nhaY);
        if (d < day[j]) day[j] = d;
        // Đã tới rất gần nhà rồi lại xa ra đáng kể = vọt qua.
        else if (day[j] < 6 && d > day[j] + 4) vot[j] = true;
      });
    }
    expect(vot.filter(Boolean).length).toBeGreaterThan(10);
  });
});

describe('làn sáng sau khi xác thực', () => {
  it('thắp tới CHẤM CUỐI CÙNG, không bỏ sót chấm nào', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    batLanTruyen(m, RONG / 2, CAO / 2);
    tua(m, 12);
    expect(m.nut.filter((n) => n.moc < 0)).toHaveLength(0);
    expect(daSangHet(m)).toBe(true);
  });

  it('LAN chứ không sáng cùng lúc — sau một nhịp vẫn còn chấm tối', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    batLanTruyen(m, RONG / 2, CAO / 2);
    buoc(m, 1 / 60);
    const sang = m.nut.filter((n) => n.moc >= 0).length;
    expect(sang).toBeGreaterThan(0);
    expect(sang).toBeLessThan(m.nut.length);
  });

  it('chưa bật thì `daSangHet` là false, dù mạng có đứng yên bao lâu', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    tua(m, 30);
    expect(daSangHet(m)).toBe(false);
  });

  it('bật lần hai không làm gì — một làn sáng chồng lên sẽ thắp cả mạng ngay', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    batLanTruyen(m, 0, 0);
    buoc(m, 1 / 60);
    const sang = m.nut.filter((n) => n.moc >= 0).length;
    batLanTruyen(m, RONG, CAO); // góc đối diện
    expect(m.nut.filter((n) => n.moc >= 0).length).toBe(sang);
  });

  /**
   * Nhánh KHÔNG chấm nào đủ gần ngòi. Dựng bằng một mạng một chấm nằm xa hẳn:
   * nếu bỏ trống nhánh này thì `daSangHet` không bao giờ thành true, và nơi gọi
   * đứng chờ mãi một màn chuyển không tới — người dùng đã đăng nhập xong mà vẫn
   * kẹt ở màn đăng nhập.
   */
  it('không chấm nào trong tầm ngòi thì vẫn thắp chấm gần nhất', () => {
    const m = taoMangLuoi(RONG, CAO, 1, nguon());
    m.nut[0].x = RONG;
    m.nut[0].y = CAO;
    batLanTruyen(m, 0, 0);
    expect(m.nut[0].moc).toBeGreaterThanOrEqual(0);
    tua(m, 2);
    expect(daSangHet(m)).toBe(true);
  });
});

describe('bước thời gian', () => {
  /**
   * App nằm nền rồi quay lại: khung đầu tiên mang cả quãng thời gian đã vắng.
   * Không chặn trần thì mọi chấm nhảy một bước dài bằng nhiều lần chiều rộng màn.
   */
  it('một bước 30 GIÂY không làm chấm nào bay ra khỏi khung', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    buoc(m, 30);
    expect(ngoaiKhung(m)).toHaveLength(0);
    // Và đồng hồ chỉ nhích đúng phần bị chặn, không nhích 30 giây.
    expect(m.t).toBeLessThanOrEqual(1 / 20 + 1e-9);
  });

  it('dt âm hoặc bằng 0 không đổi gì', () => {
    const m = taoMangLuoi(RONG, CAO, 10, nguon());
    const truoc = m.nut.map((n) => `${n.x},${n.y}`).join('|');
    buoc(m, 0);
    buoc(m, -5);
    expect(m.nut.map((n) => `${n.x},${n.y}`).join('|')).toBe(truoc);
  });
});

describe('dây nối', () => {
  it('chỉ nối các cặp trong tầm, và không cặp nào kể hai lần', () => {
    const m = taoMangLuoi(RONG, CAO, 60, nguon());
    const cap = new Set<string>();
    let dem = 0;
    duyetCanh(m, (a, c, manh) => {
      dem++;
      expect(Math.hypot(c.x - a.x, c.y - a.y)).toBeLessThanOrEqual(BAN_KINH_NOI + 1e-6);
      expect(manh).toBeGreaterThanOrEqual(0);
      expect(manh).toBeLessThanOrEqual(1);
      cap.add([m.nut.indexOf(a), m.nut.indexOf(c)].sort().join('-'));
    });
    expect(cap.size).toBe(dem);
  });

  it('dây chỉ sáng khi CẢ HAI đầu đã sáng', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    batLanTruyen(m, RONG / 2, CAO / 2);
    buoc(m, 1 / 60);
    duyetCanh(m, (a, c, _manh, sang) => {
      if (a.moc < 0 || c.moc < 0) expect(sang).toBe(0);
    });
  });
});

describe('đổi khung (xoay máy)', () => {
  it('kéo mọi chấm về trong khung mới, không bỏ chấm nào ở ngoài', () => {
    const m = taoMangLuoi(RONG, CAO, 100, nguon());
    tua(m, 5);
    doiKhung(m, CAO, RONG);
    expect(m.rong).toBe(CAO);
    expect(m.cao).toBe(RONG);
    expect(ngoaiKhung(m)).toHaveLength(0);
  });

  it('bỏ qua khung rỗng — số đo 0 xuất hiện ở khung bố cục đầu tiên', () => {
    const m = taoMangLuoi(RONG, CAO, 10, nguon());
    doiKhung(m, 0, 0);
    expect(m.rong).toBe(RONG);
    expect(ngoaiKhung(m)).toHaveLength(0);
  });
});
