// components/genie/edgeWaveMath.test.ts
//
// Toán hiệu ứng Lớp Trợ lý, theo `docs/AI_ASSISTANT_UI-UX.md`.
//
// Mỗi bài kiểm ở đây canh MỘT điều khoản của spec, và tên bài nói rõ điều khoản
// nào. Ai nới một bài là đang nới một yêu cầu thiết kế, và diff sẽ nói đúng cái nào.

import {
  EDGE_NAMES,
  EDGE_REGIONS,
  regionWeight,
  edgeWaveAt,
  RIBBONS,
  RIBBON_PHASE_RIGHT,
  ribbonCenter,
  ribbonGlow,
  RIBBON_MAX_REACH,
  CENTER_WAVES,
  centerEnvelope,
  centerWaveY,
  centerWaveGlow,
  Envelope,
  styleFor,
  glowWidthPx,
  glowAt,
  BASE_ENERGY,
  BREATH_AMP,
  type AgentState,
  COILS,
  COIL_CALM,
  coilBaseR,
  coilEase,
  centerWavePoint,
  coilCycles,
  coilEnvelopeAt,
} from './edgeWaveMath';

const STATES: AgentState[] = ['idle', 'activated', 'listening', 'processing', 'executing', 'speaking'];

describe('§6 — mỗi cạnh chia thành nhiều VÙNG SÓNG ĐỘC LẬP', () => {
  it('bốn cạnh, mỗi cạnh nhiều vùng', () => {
    expect(EDGE_NAMES).toHaveLength(4);
    for (const e of EDGE_NAMES) {
      expect(EDGE_REGIONS[e].length).toBeGreaterThanOrEqual(3);
    }
  });

  it('các vùng KHÁC NHAU về biên độ, tốc độ, pha và ĐỘ SÁNG', () => {
    // Spec §6 liệt kê đủ bốn thứ, kể cả "độ sáng khác nhau" — không chỉ biên độ.
    for (const e of EDGE_NAMES) {
      const rs = EDGE_REGIONS[e];
      for (const key of ['amp', 'freq', 'phase', 'bright'] as const) {
        const vals = new Set(rs.map((r) => r[key]));
        expect(vals.size).toBe(rs.length);
      }
    }
  });

  it('tần số trong CÙNG một cạnh không trùng và không là bội của nhau', () => {
    // Trùng nhịp thì các vùng đập cùng lúc và cả viền lại thở chung — đúng cái
    // spec §6 cấm: "Không được để toàn bộ border chuyển động cùng một lúc".
    for (const e of EDGE_NAMES) {
      const fs = EDGE_REGIONS[e].map((r) => r.freq);
      for (let i = 0; i < fs.length; i += 1) {
        for (let j = i + 1; j < fs.length; j += 1) {
          const r = fs[j] / fs[i];
          expect(Math.abs(r - Math.round(r))).toBeGreaterThan(0.12);
        }
      }
    }
  });

  it('CẢ VIỀN KHÔNG chuyển động cùng một nhịp', () => {
    // Đây là bài kiểm cho chính câu spec §6. Lấy hai điểm ở hai vùng khác nhau
    // trên cùng một cạnh: nếu chúng luôn lên xuống cùng pha thì cả viền đang thở
    // chung, và các "vùng độc lập" chỉ tồn tại trên giấy.
    for (const e of EDGE_NAMES) {
      let lechToiDa = 0;
      for (let t = 0; t < 12; t += 0.05) {
        const a = edgeWaveAt(e, 0.18, t, 0.6);
        const b = edgeWaveAt(e, 0.84, t, 0.6);
        lechToiDa = Math.max(lechToiDa, Math.abs(a - b));
      }
      expect(lechToiDa).toBeGreaterThan(0.2);
    }
  });

  it('bốn cạnh cũng không đập giống nhau', () => {
    let lech = 0;
    for (let t = 0; t < 12; t += 0.05) {
      lech = Math.max(lech, Math.abs(edgeWaveAt('top', 0.5, t, 0.6) - edgeWaveAt('bottom', 0.5, t, 0.6)));
    }
    expect(lech).toBeGreaterThan(0.2);
  });

  it('cửa sổ vùng mạnh nhất ở tâm và tắt dần ra xa', () => {
    const r = EDGE_REGIONS.top[0];
    expect(regionWeight(r, r.center)).toBeCloseTo(1, 6);
    expect(regionWeight(r, r.center + r.spread)).toBeLessThan(0.7);
    expect(regionWeight(r, r.center + 4 * r.spread)).toBeLessThan(0.01);
  });

  it('biên độ hữu hạn và có chặn ở mọi vị trí, mọi lúc', () => {
    for (const e of EDGE_NAMES) {
      for (let u = 0; u <= 1; u += 0.05) {
        for (let t = 0; t < 20; t += 0.17) {
          const v = edgeWaveAt(e, u, t, 1);
          expect(Number.isFinite(v)).toBe(true);
          expect(Math.abs(v)).toBeLessThan(10);
        }
      }
    }
  });
});

describe('§19 — viền LUÔN có chuyển động nhẹ khi Trợ lý đang bật', () => {
  it('im lặng hoàn toàn vẫn còn nhịp thở', () => {
    // Viền đứng im đọc thành "app treo", không thành "đang chờ".
    let dinh = 0;
    for (let t = 0; t < 14; t += 0.05) {
      dinh = Math.max(dinh, Math.abs(edgeWaveAt('left', 0.4, t, 0)));
    }
    expect(dinh).toBeGreaterThan(BREATH_AMP * 0.5);
  });

  it('có năng lượng nền, nên vùng sóng không tắt hẳn khi chưa có tiếng', () => {
    expect(BASE_ENERGY).toBeGreaterThan(0);
  });
});

describe('§8 — bao hình âm thanh: mượt, nội suy, giảm chấn', () => {
  it('LÊN NHANH, XUỐNG CHẬM', () => {
    // Bộ bám đối xứng làm sóng nhấp nháy theo từng âm tiết — đọc thành "giật"
    // chứ không thành "đang nói".
    const up = new Envelope();
    up.reset(0);
    up.push(1, 70);
    const sauLen = up.value;

    const down = new Envelope();
    down.reset(1);
    down.push(0, 70);
    const sauXuong = 1 - down.value;

    expect(sauLen).toBeGreaterThan(sauXuong);
  });

  it('KHÔNG giật theo từng khung — một bước không nhảy tới đích', () => {
    const e = new Envelope();
    e.reset(0);
    const v = e.push(1, 16);
    expect(v).toBeGreaterThan(0);
    expect(v).toBeLessThan(0.45);
  });

  it('tốc độ bám ĐỘC LẬP với nhịp khung hình', () => {
    // Một hệ số cố định kiểu `v += (x-v)*0.2` làm máy yếu mượt hơn máy khoẻ, và
    // không ai hiểu vì sao.
    const nhanh = new Envelope();
    for (let i = 0; i < 12; i += 1) nhanh.push(1, 8); // ~120fps
    const cham = new Envelope();
    for (let i = 0; i < 3; i += 1) cham.push(1, 32); // ~30fps
    expect(Math.abs(nhanh.value - cham.value)).toBeLessThan(0.05);
  });

  it('kẹp đầu vào: số lạ không làm vỡ bao hình', () => {
    const e = new Envelope();
    expect(e.push(NaN, 16)).toBe(0);
    e.push(5, 1000);
    expect(e.value).toBeLessThanOrEqual(1);
    e.push(-3, 1000);
    expect(e.value).toBeGreaterThanOrEqual(0);
  });
});

describe('§15 — sáu trạng thái, mỗi trạng thái một dáng', () => {
  it('mọi trạng thái đều có dáng hợp lệ', () => {
    for (const st of STATES) {
      const s = styleFor(st, 0.5);
      expect(s.level).toBeGreaterThanOrEqual(0);
      expect(s.level).toBeLessThanOrEqual(1);
      expect(s.widthPx).toBeGreaterThan(0);
      expect(s.alpha).toBeGreaterThan(0);
    }
  });

  it('nghe/nói đi theo mức âm thanh; nghĩ/làm thì không', () => {
    expect(styleFor('listening', 1).level).toBeGreaterThan(styleFor('listening', 0).level);
    expect(styleFor('speaking', 1).level).toBeGreaterThan(styleFor('speaking', 0).level);
    // `processing`/`executing` có nhịp riêng, không phụ thuộc tiếng.
    expect(styleFor('processing', 1).level).toBe(styleFor('processing', 0).level);
    expect(styleFor('executing', 1).level).toBe(styleFor('executing', 0).level);
  });

  it('đang nghĩ thì sóng chạy NHANH hơn lúc rảnh', () => {
    expect(styleFor('processing').speed).toBeGreaterThan(styleFor('idle').speed);
  });

  it('đang thao tác thì lặng bớt, nhưng KHÔNG tắt', () => {
    // Người dùng cần nhìn xuống màn hình bên dưới, nhưng cũng cần biết trợ lý
    // vẫn đang làm.
    const ex = styleFor('executing');
    expect(ex.alpha).toBeLessThan(styleFor('listening').alpha);
    expect(ex.alpha).toBeGreaterThan(0.5);
    expect(ex.ribbon).toBeGreaterThan(0);
  });

  it('mức ngoài [0,1] bị kẹp', () => {
    expect(styleFor('listening', 9).level).toBeLessThanOrEqual(1);
    expect(styleFor('listening', -5).level).toBe(styleFor('listening', 0).level);
  });
});

describe('cổng chống NaN loang cả màn', () => {
  it('bề rộng quầng sáng LUÔN dương ở mọi trạng thái', () => {
    // `exp(-d/w)` với `w <= 0` cho ra NaN, và trong fragment shader NaN không
    // hiện thành lỗi: nó hiện thành cả màn hình xanh đặc, che sạch màn bên dưới.
    for (const st of STATES) {
      const s = styleFor(st, 1);
      for (const e of EDGE_NAMES) {
        for (let u = 0; u <= 1; u += 0.1) {
          for (let t = 0; t < 12; t += 0.31) {
            const w = glowWidthPx(e, u, t, s);
            expect(w).toBeGreaterThan(0);
            expect(Number.isFinite(w)).toBe(true);
          }
        }
      }
    }
  });

  it('độ sáng giảm dần ra xa viền; bề rộng 0 cho ra 0, không cho ra NaN', () => {
    expect(glowAt(0, 20)).toBeCloseTo(1, 6);
    expect(glowAt(60, 20)).toBeLessThan(glowAt(5, 20));
    expect(glowAt(10, 0)).toBe(0);
  });
});

describe('§5/§6 — dải sáng uốn lượn hai cạnh dọc', () => {
  it('đường tâm UỐN theo chiều cao và TRÔI theo thời gian', () => {
    for (const r of RIBBONS) {
      const mau = [0, 0.25, 0.5, 0.75, 1].map((y) => ribbonCenter(r, y, 0));
      expect(Math.max(...mau) - Math.min(...mau)).toBeGreaterThan(r.amp);
      expect(ribbonCenter(r, 0.5, 0)).not.toBeCloseTo(ribbonCenter(r, 0.5, 2.3), 4);
    }
  });

  it('có dải trôi NGƯỢC chiều — chỗ mắt bắt được chuyển động rõ nhất', () => {
    expect(RIBBONS.some((r) => r.speed > 0)).toBe(true);
    expect(RIBBONS.some((r) => r.speed < 0)).toBe(true);
  });

  it('ba dải nằm SÁT MÉP', () => {
    // Trải rộng vào trong thì chúng đọc thành ba đường kẻ song song — một cái
    // khung, không phải ánh sáng phát ra từ mép.
    for (const r of RIBBONS) {
      expect(r.base + r.amp + r.width).toBeLessThanOrEqual(RIBBON_MAX_REACH);
    }
  });

  it('ba dải ĐÈ LÊN NHAU khi uốn', () => {
    // Ánh sáng thật thì các lớp chồng lên nhau: chỗ giao nhau sáng hơn, chỗ tách
    // ra mảnh đi — cái dày mỏng bất thường đó mới là thứ mắt đọc thành "đang phát
    // sáng". Đây là điều kiện NGƯỢC với bản trước, và đó là chủ ý.
    const s = [...RIBBONS].sort((a, b) => a.base - b.base);
    for (let i = 0; i + 1 < s.length; i += 1) {
      const trai = s[i].base + s[i].amp + s[i].width;
      const phai = s[i + 1].base - s[i + 1].amp - s[i + 1].width;
      expect(trai).toBeGreaterThan(phai);
    }
  });

  it('LÕI sắc + QUẦNG bloom, và vẫn không loang vào giữa màn', () => {
    const r = RIBBONS[0];
    const c = ribbonCenter(r, 0.5, 0);
    const tam = ribbonGlow(r, c, 0.5, 0);
    expect(tam).toBeGreaterThan(1);
    expect(ribbonGlow(r, c + 3 * r.width, 0.5, 0)).toBeLessThan(tam * 0.6);
    expect(ribbonGlow(r, c + 15 * r.width, 0.5, 0)).toBeLessThan(0.01);
    expect(ribbonGlow(r, 0.5, 0.5, 0)).toBeLessThan(0.001);
  });

  it('mờ dần ở hai đầu — cắt cụt trông như vết xước', () => {
    const r = RIBBONS[0];
    expect(ribbonGlow(r, ribbonCenter(r, 0.0, 0), 0.0, 0)).toBeLessThan(0.01);
    expect(ribbonGlow(r, ribbonCenter(r, 1.0, 0), 1.0, 0)).toBeLessThan(0.01);
  });

  it('CẠNH PHẢI sáng ở MỌI độ cao, y như cạnh trái', () => {
    // Bài kiểm cho một lỗi đã thấy trên máy: "bên phải không có dải nào". Lệch
    // pha bị cộng vào `yNorm` thay vì vào pha sóng — mà `fade = sin(π·clamp(y))`,
    // nên `yNorm + 1.11` luôn clamp về 1 ⇒ `sin(π) = 0` ⇒ dải vô hình.
    for (let i = 0; i < RIBBONS.length; i += 1) {
      const r = RIBBONS[i];
      const p = RIBBON_PHASE_RIGHT[i];
      for (const y of [0.15, 0.35, 0.5, 0.65, 0.85]) {
        expect(ribbonGlow(r, ribbonCenter(r, y, 0, p), y, 0, p)).toBeGreaterThan(0.5);
      }
    }
  });

  it('hai cạnh KHÔNG uốn đối xứng gương', () => {
    // Đối xứng gương thì hai bên trông như một cái khung, không như hai luồng chảy.
    expect(RIBBON_PHASE_RIGHT).toHaveLength(RIBBONS.length);
    for (let i = 0; i < RIBBONS.length; i += 1) {
      expect(ribbonCenter(RIBBONS[i], 0.5, 0, 0))
        .not.toBeCloseTo(ribbonCenter(RIBBONS[i], 0.5, 0, RIBBON_PHASE_RIGHT[i]), 3);
    }
  });
});

describe('cụm sóng giữa màn — sự hiện diện của Trợ lý', () => {
  it('ba dải, ĐIỂM TỤ khác nhau', () => {
    // Ba điểm tụ lệch nhau là thứ làm cụm sóng có CHIỀU SÂU: mắt thấy ba lớp ở ba
    // chỗ chứ không thấy ba đường vẽ chồng lên nhau.
    expect(CENTER_WAVES).toHaveLength(3);
    const tu = CENTER_WAVES.map((w) => w.focus);
    expect(new Set(tu).size).toBe(3);
    for (let i = 0; i < tu.length; i += 1) {
      for (let j = i + 1; j < tu.length; j += 1) {
        expect(Math.abs(tu[i] - tu[j])).toBeGreaterThan(0.1);
      }
    }
  });

  it('ba dải có ĐỘ SÁNG và BLOOM khác nhau', () => {
    for (const key of ['bright', 'halo', 'haloWeight', 'widthPx'] as const) {
      expect(new Set(CENTER_WAVES.map((w) => w[key])).size).toBe(CENTER_WAVES.length);
    }
  });

  it('tần số và tốc độ không trùng, không là bội của nhau', () => {
    // Trùng nhịp thì ba dải gặp nhau đều đặn ở cùng một chỗ, và mắt bắt được cái
    // chu kỳ đó ngay.
    const fs = CENTER_WAVES.map((w) => w.freq);
    for (let i = 0; i < fs.length; i += 1) {
      for (let j = i + 1; j < fs.length; j += 1) {
        const r = fs[j] / fs[i];
        expect(Math.abs(r - Math.round(r))).toBeGreaterThan(0.1);
      }
    }
    expect(new Set(CENTER_WAVES.map((w) => w.speed)).size).toBe(CENTER_WAVES.length);
  });

  it('có dải chạy NGƯỢC chiều', () => {
    expect(CENTER_WAVES.some((w) => w.speed > 0)).toBe(true);
    expect(CENTER_WAVES.some((w) => w.speed < 0)).toBe(true);
  });

  it('biên độ LỚN quanh điểm tụ, THẤP dần ra hai đầu', () => {
    for (const w of CENTER_WAVES) {
      const tam = centerEnvelope(w, w.focus);
      expect(tam).toBeGreaterThan(0.5);
      expect(centerEnvelope(w, w.focus + w.sigma)).toBeLessThan(tam);
      expect(centerEnvelope(w, w.focus - w.sigma)).toBeLessThan(tam);
    }
  });

  it('bao hình BẰNG 0 ở hai mép — dải không bị cắt cụt', () => {
    // Thiếu kẹp `1 − u²` thì đuôi dải còn một vệt mờ chạy tới sát mép màn, và nó
    // trông như một nét vẽ bị cắt ngang.
    for (const w of CENTER_WAVES) {
      expect(centerEnvelope(w, -1)).toBe(0);
      expect(centerEnvelope(w, 1)).toBe(0);
      expect(centerEnvelope(w, -1.5)).toBe(0);
      expect(centerEnvelope(w, 2)).toBe(0);
    }
  });

  it('biên độ đi theo mức âm thanh, nhưng KHÔNG phẳng lì khi im lặng', () => {
    // Sóng phẳng đọc thành "tắt", không thành "đang chờ" (§19).
    const w = CENTER_WAVES[0];
    let toDa0 = 0;
    let toDa1 = 0;
    for (let t = 0; t < 8; t += 0.02) {
      toDa0 = Math.max(toDa0, Math.abs(centerWaveY(w, w.focus, t, 0)));
      toDa1 = Math.max(toDa1, Math.abs(centerWaveY(w, w.focus, t, 1)));
    }
    expect(toDa0).toBeGreaterThan(0.02);
    expect(toDa1).toBeGreaterThan(toDa0 * 3);
  });

  it('sóng CHẠY ngang theo thời gian', () => {
    const w = CENTER_WAVES[0];
    expect(centerWaveY(w, 0, 0, 1)).not.toBeCloseTo(centerWaveY(w, 0, 1.7, 1), 3);
  });

  it('lệch dọc có chặn — không đẩy dải ra ngoài ô của nó', () => {
    for (const w of CENTER_WAVES) {
      for (let u = -1.2; u <= 1.2; u += 0.03) {
        for (let t = 0; t < 6; t += 0.11) {
          const y = centerWaveY(w, u, t, 1);
          expect(Number.isFinite(y)).toBe(true);
          expect(Math.abs(y)).toBeLessThanOrEqual(1.001);
        }
      }
    }
  });

  it('LÕI sắc + QUẦNG bloom, và tắt hẳn ở hai đầu', () => {
    const w = CENTER_WAVES[0];
    const env = centerEnvelope(w, w.focus);
    const tam = centerWaveGlow(w, 0, env);
    expect(tam).toBeGreaterThan(0);
    expect(centerWaveGlow(w, w.widthPx * 2, env)).toBeLessThan(tam);
    expect(centerWaveGlow(w, w.widthPx * w.halo * 4, env)).toBeLessThan(tam * 0.02);
    // Ở mép: bao hình bằng 0 ⇒ không sáng chút nào, kể cả ngay trên đường sóng.
    expect(centerWaveGlow(w, 0, centerEnvelope(w, 1))).toBe(0);
  });

  it('dải sáng hơn thì sáng hơn thật', () => {
    const env = 1;
    const sang = [...CENTER_WAVES].sort((a, b) => b.bright - a.bright);
    expect(centerWaveGlow(sang[0], 0, env)).toBeGreaterThan(centerWaveGlow(sang[2], 0, env));
  });
});

describe('cuộn tròn — dáng "đang nghĩ"', () => {
  it('ba vòng KHÁC bán kính, KHÁC tốc độ, và có cả hai CHIỀU xoay', () => {
    // Ba vòng cùng thông số sẽ chồng khít lên nhau và đọc thành MỘT vòng dày.
    const r = COILS.map((c) => c.radius);
    const sp = COILS.map((c) => c.spin);
    expect(new Set(r).size).toBe(3);
    expect(new Set(sp.map(Math.abs)).size).toBe(3);
    // Dấu là chiều xoay — phải có cả hai, không thì ba vòng quay như một khối.
    expect(sp.some((x) => x > 0)).toBe(true);
    expect(sp.some((x) => x < 0)).toBe(true);
  });

  it('bán kính tăng dần và vòng lớn nhất KHÔNG tràn mép ngang', () => {
    const halfW = 195; // máy 390pt — hẹp nhất còn gặp
    const halfH = 66;
    const base = coilBaseR(halfW, halfH);
    const rs = COILS.map((c) => c.radius * base);
    expect(rs[0]).toBeLessThan(rs[1]);
    expect(rs[1]).toBeLessThan(rs[2]);
    expect(Math.max(...rs)).toBeLessThanOrEqual(halfW);
  });

  it('coil=0 cho ĐÚNG dáng thẳng cũ — không đổi gì khi chưa cuộn', () => {
    // Hoà ở mức toạ độ, nên ở hai đầu phép hoà phải trùng khít bản gốc. Lệch ở
    // đây nghĩa là dáng thường đã đổi mà không ai yêu cầu.
    for (const u of [-0.8, -0.3, 0, 0.45, 0.9]) {
      const p = centerWavePoint(0, u, 1.7, 0.5, 0, 195, 66);
      expect(p.x).toBeCloseTo(u * 195, 6);
      expect(p.y).toBeCloseTo(centerWaveY(CENTER_WAVES[0], u, 1.7, 0.5) * 66, 6);
    }
  });

  it('coil=1 cho một VÒNG KÍN — không có hai đầu bị cắt cụt', () => {
    // `centerEnvelope` có kẹp `1 − u²` để dải tắt hẳn ở hai mép; đúng cho một
    // đoạn thẳng, SAI cho vòng tròn. Giữ nó lại là xé vòng thành một cung cụt.
    const base = coilBaseR(195, 66);
    const rs: number[] = [];
    for (let u = -1; u < 1; u += 0.05) {
      const p = centerWavePoint(1, u, 2.4, 0.5, 1, 195, 66);
      rs.push(Math.hypot(p.x, p.y));
    }
    // Mọi bán kính phải quanh quẩn bán kính danh nghĩa — không điểm nào sụp về 0.
    const R = COILS[1].radius * base;
    expect(Math.min(...rs)).toBeGreaterThan(R * 0.6);
    expect(Math.max(...rs)).toBeLessThan(R * 1.4);
  });

  it('cuộn rồi thì sóng NHẸ hơn, nhưng KHÔNG tắt', () => {
    // "Vẫn giữ nhịp độ sóng nhưng nhẹ nhàng hơn" — nhẹ là một con số, không phải
    // một cảm giác; và tắt hẳn thì mất luôn cái nhịp nói rằng Trợ lý còn sống.
    expect(COIL_CALM).toBeGreaterThan(0.2);
    expect(COIL_CALM).toBeLessThan(0.7);

    const base = coilBaseR(195, 66);
    const R = COILS[0].radius * base;
    let lech = 0;
    for (let u = -1; u < 1; u += 0.02) {
      const p = centerWavePoint(0, u, 3.1, 1, 1, 195, 66);
      lech = Math.max(lech, Math.abs(Math.hypot(p.x, p.y) - R));
    }
    expect(lech).toBeGreaterThan(1); // còn gợn
  });

  it('vòng XOAY theo thời gian, và hai vòng ngược chiều đi ngược nhau', () => {
    const goc = (i: number, t: number): number => {
      const p = centerWavePoint(i, 0, t, 0, 1, 195, 66);
      return Math.atan2(p.y, p.x);
    };
    const d0 = goc(0, 0.5) - goc(0, 0);
    const d1 = goc(1, 0.5) - goc(1, 0);
    expect(Math.abs(d0)).toBeGreaterThan(0.01);
    expect(Math.sign(d0)).not.toBe(Math.sign(d1));
  });

  it('coilEase mượt ở HAI đầu — tuyến tính thì giật lúc bắt đầu và lúc dừng', () => {
    expect(coilEase(0)).toBe(0);
    expect(coilEase(1)).toBe(1);
    expect(coilEase(0.5)).toBeCloseTo(0.5, 6);
    // Vận tốc ở hai đầu phải ~0.
    const eps = 1e-4;
    expect(coilEase(eps) / eps).toBeLessThan(0.01);
    expect((1 - coilEase(1 - eps)) / eps).toBeLessThan(0.01);
    expect(coilEase(-5)).toBe(0);
    expect(coilEase(9)).toBe(1);
  });

  it('CHỈ trạng thái `processing` cuộn — các trạng thái khác duỗi thẳng', () => {
    expect(styleFor('processing').coil).toBe(1);
    for (const st of ['idle', 'listening', 'speaking', 'executing', 'activated'] as const) {
      expect(styleFor(st).coil).toBe(0);
    }
  });

  it('lúc cuộn thì sóng viền cũng dịu đi, không dồn hai chuyển động lên nhau', () => {
    // Vòng tròn quay ĐÃ là chuyển động. Cộng thêm viền chạy nhanh nữa thì thành
    // rối, và mắt không biết nhìn đâu.
    const p = styleFor('processing');
    const l = styleFor('listening', 1);
    expect(p.speed).toBeLessThan(1.6);
    expect(p.level).toBeLessThan(l.level);
  });
});

describe('nhãn trạng thái', () => {
  it('BỎ hẳn chữ "đang xử lý" — hình cuộn nói thay', () => {
    const src = require('fs').readFileSync(
      require('path').join(__dirname, 'GenieLayer.tsx'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(src).not.toMatch(/Em đang xử lý/);
    // Hai ca kia GIỮ nhãn: mic đang mở, và trợ lý đang thao tác thật trong app —
    // cả hai đều là thứ phải nói bằng CHỮ.
    expect(src).toMatch(/Em đang nghe/);
    expect(src).toMatch(/Em đang mở/);
  });
});

describe('vòng cuộn phải KHÉP KÍN — hai đầu sóng nối vào nhau', () => {
  const HW = 195;
  const HH = 66;

  it('số chu kỳ quanh vòng là SỐ NGUYÊN — điều kiện để hai đầu khớp pha', () => {
    // Đặt θ = π·u thì số sóng theo góc là N = 2·freq. Với freq hiện tại
    // (2.30 · 1.70 · 3.10) thì N = 4.6 · 3.4 · 6.2 — KHÔNG nguyên, và bản trước
    // có mối nối thật: một chỗ gãy chạy vòng quanh theo nhịp xoay.
    for (let i = 0; i < CENTER_WAVES.length; i += 1) {
      const N = coilCycles(i);
      expect(Number.isInteger(N)).toBe(true);
      expect(N).toBeGreaterThanOrEqual(1);
    }
    // Và ba số vẫn phải KHÁC nhau — nếu không, ba vòng lại chồng khít.
    expect(new Set([0, 1, 2].map(coilCycles)).size).toBe(3);
  });

  it('điểm ở hai đầu TRÙNG nhau — không có khe hở', () => {
    // Đây là bài kiểm chính của cả mục: `u = −1` và `u = +1` là CÙNG MỘT chỗ
    // trên vòng, nên chúng phải cho ra cùng một điểm.
    for (let i = 0; i < CENTER_WAVES.length; i += 1) {
      for (const t of [0, 0.7, 2.3, 9.1]) {
        const a = centerWavePoint(i, -1, t, 0.8, 1, HW, HH);
        const b = centerWavePoint(i, 1, t, 0.8, 1, HW, HH);
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('nối MƯỢT, không gấp khúc — độ dốc hai đầu cũng phải khớp', () => {
    // Hai đầu bằng nhau mà độ dốc khác nhau thì chỗ gặp là một góc nhọn, và nó
    // lộ y như một khe hở.
    const h = 1e-5;
    for (let i = 0; i < CENTER_WAVES.length; i += 1) {
      const R = (u: number): number => {
        const p = centerWavePoint(i, u, 1.3, 0.8, 1, HW, HH);
        return Math.hypot(p.x, p.y);
      };
      const dTrai = (R(-1 + h) - R(-1)) / h;   // đi vào từ đầu −1
      const dPhai = (R(1) - R(1 - h)) / h;     // đi ra ở đầu +1
      expect(Math.abs(dTrai - dPhai)).toBeLessThan(0.02 * Math.max(1, Math.abs(dTrai)));
    }
  });

  it('bao hình cũng tuần hoàn — mối nối không được chuyển thành vệt sáng', () => {
    // Một bao hình theo `u` sẽ nhảy ở chỗ `u` gấp vòng: mối nối vẫn còn, chỉ
    // chuyển từ pha sóng sang ĐỘ SÁNG. Nên nó phải là hàm của GÓC.
    for (const w of CENTER_WAVES) {
      expect(coilEnvelopeAt(w, -Math.PI)).toBeCloseTo(coilEnvelopeAt(w, Math.PI), 10);
      // Và không tắt hẳn ở đâu cả — vòng tròn không có hai đầu để tắt.
      for (let th = -Math.PI; th <= Math.PI; th += 0.05) {
        expect(coilEnvelopeAt(w, th)).toBeGreaterThan(0.4);
      }
    }
  });

  it('bán kính chạy quanh vòng KHÔNG có bước nhảy nào', () => {
    // Quét cả vòng và đo bước nhảy lớn nhất giữa hai mẫu liền nhau. Một mối nối
    // sẽ hiện ra ở đây thành một bước nhảy lớn hơn hẳn phần còn lại.
    for (let i = 0; i < CENTER_WAVES.length; i += 1) {
      const rs: number[] = [];
      const n = 720;
      for (let k = 0; k <= n; k += 1) {
        const u = -1 + (2 * k) / n;
        const p = centerWavePoint(i, u, 4.2, 1, 1, HW, HH);
        rs.push(Math.hypot(p.x, p.y));
      }
      let lonNhat = 0;
      for (let k = 1; k < rs.length; k += 1) lonNhat = Math.max(lonNhat, Math.abs(rs[k] - rs[k - 1]));
      // Chỗ gấp vòng (mẫu cuối → mẫu đầu) cũng phải êm như mọi chỗ khác.
      const gapVong = Math.abs(rs[rs.length - 1] - rs[0]);
      expect(gapVong).toBeLessThan(lonNhat * 1.5 + 1e-6);
    }
  });
});

describe('cụm nút dưới màn — đổi vai theo chế độ', () => {
  const layer = (): string => require('fs')
    .readFileSync(require('path').join(__dirname, 'GenieLayer.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('mỗi nút chỉ tới CHỖ MÌNH CHƯA Ở', () => {
    // Nút mang hình của chế độ HIỆN TẠI là một nút không nói được nó làm gì —
    // người dùng phải thử mới biết, và người ít tiếp xúc máy móc thì tránh "thử".
    const s = layer();
    // Nút trái: đang gõ → hiện mic; đang nói → hiện bàn phím.
    expect(s).toMatch(/g\.typing \? 'microphone' : 'keyboard-outline'/);
    // Nút giữa: đang gõ → GỬI.
    expect(s).toMatch(/g\.typing \? 'send' :/);
  });

  it('nút GIỬA gửi khi đang gõ, và TẮT khi ô nhập trống', () => {
    // Bấm gửi một ô trống là một cú bấm không có việc gì xảy ra, và người dùng
    // đọc nó thành "nút hỏng".
    const s = layer();
    expect(s).toMatch(/onPress=\{g\.typing \? \(\) => ask\(draft\) : bamMic\}/);
    expect(s).toMatch(/disabled=\{g\.typing && !draft\.trim\(\)\}/);
  });

  it('CHỈ MỘT nút gửi — nút nhỏ trong ô nhập đã bỏ', () => {
    // Hai nút làm cùng một việc, nằm cạnh nhau, là hai chỗ để người dùng phân vân.
    expect(layer()).not.toMatch(/styles\.sendBtn/);
  });

  it('rời chế độ gõ thì TẮT bàn phím theo', () => {
    // Bàn phím đứng lại che nửa màn trong khi ô nhập đã biến mất là một màn hình
    // không ai hiểu.
    expect(layer()).toMatch(/if \(g\.typing\) Keyboard\.dismiss\(\)/);
  });
});

describe('hai nút nhỏ dưới mỗi bong bóng', () => {
  const layer = (): string => require('fs')
    .readFileSync(require('path').join(__dirname, 'GenieLayer.tsx'), 'utf8');

  it('CHẠY LẠI chỉ có ở bong bóng NGƯỜI DÙNG', () => {
    // Chạy lại một câu của Trợ lý là vô nghĩa — nó là câu TRẢ LỜI, không phải một
    // lời yêu cầu. Cho nút đó ở đấy là mời người ta bấm một thứ không làm gì.
    const s = layer();
    const i = s.indexOf("m.from === 'user' && (");
    const j = s.indexOf('rotate-right');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
  });

  it('nút CHÉP có ở CẢ HAI phía — câu nào cũng chép được', () => {
    const s = layer();
    expect(s).toMatch(/content-copy/);
    // Nút chép nằm NGOÀI nhánh `m.from === 'user'`.
    const iChep = s.indexOf('content-copy');
    const iUser = s.indexOf("m.from === 'user' && (");
    expect(iChep).toBeLessThan(iUser);
  });

  it('nút MỜ TRẮNG, KHÔNG viền', () => {
    const s = layer();
    expect(s).toMatch(/const ACT = 'rgba\(255,255,255,0\.4\d\)'/);
    // Không viền: `actBtn` chỉ có đệm, không `borderWidth`/`borderColor`.
    const m = s.match(/actBtn: \{[^}]*\}/);
    expect(m).toBeTruthy();
    expect(m![0]).not.toMatch(/border/);
  });

  it('vùng bấm RỘNG hơn hình vẽ — ngón tay người quen cầm cuốc', () => {
    const s = layer();
    expect((s.match(/hitSlop=\{\{ top: 10, bottom: 10, left: 10, right: 10 \}\}/g) || []).length)
      .toBeGreaterThanOrEqual(2);
  });
});
