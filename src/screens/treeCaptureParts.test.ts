/**
 * Bài kiểm cho bảng chia thân/gốc.
 *
 * Ca quan trọng nhất ở đây KHÔNG phải "chia đúng khi dữ liệu đẹp" — ca đó xanh
 * với gần như mọi cách cài. Ca quan trọng là ca phân biệt được TRUNG VỊ với
 * TRUNG BÌNH, vì đó là chỗ bảng này hỏng lặng lẽ khi người dùng chụp gốc nhiều:
 * mốc trôi theo chính nhóm ảnh gốc, tới lúc ảnh gốc tự xếp thành thân và thanh
 * tiến độ báo đủ trong khi chưa đủ.
 */
import {
  referencePitch,
  partitionCaptures,
  missingParts,
  nextManualPart,
  BASE_PITCH_DELTA,
  MIN_TRUNK,
  MIN_BASE,
  type CaptureAngle,
  type TreePart,
} from './treeCaptureParts';

/** Dựng loạt ảnh: `n` tấm cùng một pitch, id có tiền tố cho dễ đọc khi đỏ. */
const loat = (tien: string, n: number, pitch: number | null): CaptureAngle[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${tien}${i}`, pitch }));

describe('referencePitch', () => {
  it('không ảnh nào có số → không có mốc', () => {
    expect(referencePitch([])).toBeNull();
    expect(referencePitch(loat('x', 3, null))).toBeNull();
  });

  it('lẻ thì lấy tấm giữa, chẵn thì lấy trung bình hai tấm giữa', () => {
    expect(referencePitch([
      { id: 'a', pitch: -10 }, { id: 'b', pitch: 0 }, { id: 'c', pitch: 50 },
    ])).toBe(0);
    expect(referencePitch([
      { id: 'a', pitch: -10 }, { id: 'b', pitch: 0 }, { id: 'c', pitch: 4 }, { id: 'd', pitch: 50 },
    ])).toBe(2);
  });

  it('bỏ qua tấm không có số thay vì coi nó là 0', () => {
    // Coi `null` là 0 sẽ kéo mốc về 0 và làm hỏng mọi loạt chụp ngang ở góc khác.
    expect(referencePitch([
      { id: 'a', pitch: -30 }, { id: 'b', pitch: null }, { id: 'c', pitch: -30 },
    ])).toBe(-30);
  });
});

describe('partitionCaptures — lia quanh cây rồi chúc xuống gốc', () => {
  it('ca đối chứng — loạt chụp thật thì chia đúng', () => {
    // Người dùng lia ngang quanh thân (pitch quanh -5), rồi chúc xuống gốc (-45).
    const angles = [...loat('than', 10, -5), ...loat('goc', 3, -45)];
    const p = partitionCaptures(angles);
    expect(p.reference).toBe(-5);
    expect(p.trunk).toBe(10);
    expect(p.base).toBe(3);
    expect(p.unknown).toBe(0);
  });

  it('người cầm máy cao thấp khác nhau vẫn chia đúng — mốc lấy từ chính loạt ảnh', () => {
    // Cùng hình dạng như trên nhưng dịch cả loạt đi +40°: một ngưỡng tuyệt đối
    // gõ cứng sẽ hỏng ở đây, mốc-theo-loạt thì không.
    const angles = [...loat('than', 10, 35), ...loat('goc', 3, -5)];
    const p = partitionCaptures(angles);
    expect(p.trunk).toBe(10);
    expect(p.base).toBe(3);
  });

  it('🔴 CHỐT — mốc phải là TRUNG VỊ; trung bình thì chụp gốc nhiều là hỏng', () => {
    // 6 tấm thân ở 0°, 5 tấm gốc ở -70°.
    //   trung vị = 0    ⟹ thân |0-0|=0 ≤ 22 → thân ✓ ; gốc |-70-0|=70 > 22 → gốc ✓
    //   trung bình = (6·0 + 5·(-70))/11 = -31,8
    //                   ⟹ thân |0+31,8| = 31,8 > 22 → bị xếp nhầm thành GỐC ✗
    // Tức với trung bình, càng chụp gốc nhiều thì ảnh thân càng biến thành gốc,
    // và người dùng bị bảo "còn thiếu góc thân" giữa lúc đang đứng chụp thân.
    const angles = [...loat('than', 6, 0), ...loat('goc', 5, -70)];
    const p = partitionCaptures(angles);

    expect(p.reference).toBe(0);
    expect(p.trunk).toBe(6);
    expect(p.base).toBe(5);
    for (const a of angles) {
      expect(p.parts[a.id]).toBe(a.id.startsWith('than') ? 'trunk' : 'base');
    }
  });

  it('đúng ngưỡng thì vẫn là thân — chỉ VƯỢT mới thành gốc', () => {
    // Ba tấm ở 0° giữ trung vị đứng yên tại 0, để ca này đo ĐÚNG cái ngưỡng chứ
    // không vô tình đo phép tính trung vị. (Bản đầu chỉ có một tấm 0° ngoài hai
    // tấm đo ngưỡng ⟹ trung vị rơi vào 11 và ca đỏ vì lý do chẳng liên quan.)
    const angles = [
      { id: 'a', pitch: 0 },
      { id: 'd', pitch: 0 },
      { id: 'e', pitch: 0 },
      { id: 'b', pitch: BASE_PITCH_DELTA },
      { id: 'c', pitch: BASE_PITCH_DELTA + 0.5 },
    ];
    const p = partitionCaptures(angles);
    expect(p.reference).toBe(0);
    expect(p.parts.b).toBe('trunk');
    expect(p.parts.c).toBe('base');
  });
});

describe('partitionCaptures — ảnh không có số đo', () => {
  it('không có pitch thì là "chưa rõ", KHÔNG đệm thành thân', () => {
    const p = partitionCaptures([...loat('than', 4, -5), ...loat('mu', 3, null)]);
    expect(p.trunk).toBe(4);
    expect(p.unknown).toBe(3);
    expect(p.base).toBe(0);
  });

  it('cả loạt không có số → không tấm nào bị đoán bừa', () => {
    const p = partitionCaptures(loat('mu', 5, null));
    expect(p.reference).toBeNull();
    expect(p.unknown).toBe(5);
    expect(p.trunk + p.base).toBe(0);
  });

  it('🔴 CHỐT — ảnh "chưa rõ" KHÔNG được tính bù để báo đủ', () => {
    // 4 tấm thân + 2 tấm chưa rõ: nếu "chưa rõ" bị đếm sang gốc thì hàm báo ĐỦ
    // trong khi người dùng chưa chụp gốc lần nào.
    const p = partitionCaptures([...loat('than', MIN_TRUNK, -5), ...loat('mu', MIN_BASE, null)]);
    const m = missingParts(p);
    expect(m.enough).toBe(false);
    expect(m.base).toBe(MIN_BASE);
  });
});

describe('partitionCaptures — người dùng tự sửa nhãn', () => {
  it('nhãn đặt tay ĐÈ lên máy', () => {
    const angles = [...loat('than', 10, -5), ...loat('goc', 3, -45)];
    const p = partitionCaptures(angles, { than0: 'base', goc0: 'trunk' });
    expect(p.parts.than0).toBe('base');
    expect(p.parts.goc0).toBe('trunk');
    expect(p.trunk).toBe(10); // 9 máy đoán + 1 đặt tay
    expect(p.base).toBe(3);   // 2 máy đoán + 1 đặt tay
  });

  it('đặt tay được cho cả ảnh máy không đọc nổi pitch', () => {
    const p = partitionCaptures(loat('mu', 2, null), { mu0: 'base' });
    expect(p.parts.mu0).toBe('base');
    expect(p.parts.mu1).toBe('unknown');
    expect(p.base).toBe(1);
  });

  it('🔴 CHỐT — chụp thêm ảnh KHÔNG được xoá nhãn người dùng đã đặt', () => {
    // Mốc trôi khi có ảnh mới. Nhãn đặt tay phải sống sót qua lượt tính lại —
    // nếu không thì người dùng sửa xong, lia thêm một tấm là mất công sửa.
    const dat = { goc0: 'trunk' } as const;
    const truoc = partitionCaptures([...loat('than', 6, 0), ...loat('goc', 5, -70)], dat);
    const sau = partitionCaptures(
      [...loat('than', 6, 0), ...loat('goc', 5, -70), { id: 'moi', pitch: -70 }],
      dat,
    );
    expect(truoc.parts.goc0).toBe('trunk');
    expect(sau.parts.goc0).toBe('trunk');
    expect(sau.parts.moi).toBe('base');
  });
});

describe('nextManualPart — chạm vào ảnh trong dải xem lại', () => {
  it('đi đúng ba nấc rồi về chỗ cũ', () => {
    expect(nextManualPart(undefined)).toBe('trunk');
    expect(nextManualPart('trunk')).toBe('base');
    expect(nextManualPart('base')).toBeUndefined();
  });

  it('🔴 CHỐT — phải có đường TRẢ LẠI CHO MÁY, không chỉ đảo qua lại hai nhãn', () => {
    // Ca này phân biệt được vòng-ba-nấc với vòng-hai-nấc. Với vòng hai nấc
    // (`trunk ⇄ base`) thì chạm nhầm một cái là khoá vĩnh viễn một nhãn đè lên
    // phán đoán của máy, và không thao tác nào gỡ ra được.
    let n: TreePart | undefined;
    const duong: (TreePart | undefined)[] = [];
    for (let i = 0; i < 3; i++) { n = nextManualPart(n); duong.push(n); }
    expect(duong).toEqual(['trunk', 'base', undefined]);
  });

  it('ảnh máy đoán là gốc, người dùng chạm một cái thì thành thân', () => {
    const angles = [...loat('than', 6, 0), ...loat('goc', 5, -70)];
    expect(partitionCaptures(angles).parts.goc0).toBe('base');
    const dat = { goc0: nextManualPart(undefined)! };
    expect(partitionCaptures(angles, dat).parts.goc0).toBe('trunk');
  });
});

describe('missingParts', () => {
  it('nói còn thiếu bao nhiêu mỗi phần', () => {
    const p = partitionCaptures([...loat('than', 2, -5), ...loat('goc', 1, -45)]);
    expect(missingParts(p)).toEqual({ trunk: MIN_TRUNK - 2, base: MIN_BASE - 1, enough: false });
  });

  it('đủ thì không âm, và chụp dư vẫn là đủ', () => {
    const p = partitionCaptures([...loat('than', 30, -5), ...loat('goc', 9, -45)]);
    expect(missingParts(p)).toEqual({ trunk: 0, base: 0, enough: true });
  });

  it('thiếu gốc thôi thì vẫn CHƯA đủ', () => {
    const p = partitionCaptures(loat('than', 30, -5));
    const m = missingParts(p);
    expect(m.trunk).toBe(0);
    expect(m.base).toBe(MIN_BASE);
    expect(m.enough).toBe(false);
  });
});
