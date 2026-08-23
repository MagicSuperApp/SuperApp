// screens/AnimalIdentityScreen.candidates.test.ts
//
// KHOÁ BỘ CHUYỂN ứng viên UNCERTAIN: AnimalCandidate (máy chủ) → ReidCandidate
// (hộp thoại chọn cá thể).
//
// Vì sao có tệp này. Bản cũ dựng ứng viên với khoá `tree_id`, trong khi
// `ReidConfirmDialog` khai `ReidCandidate.id` (:25), lấy `key={candidate.id}`
// (:191) và gọi `onSelect(candidate.id)` (:193). Chỗ gọi lại ép
// `candidates={… as any}` nên TypeScript KHÔNG gác được. Đo lúc chạy: bấm một
// ứng viên thì `onSelect` nhận `undefined` → `navigate('AnimalDetail',
// {animalDid: undefined})` → màn "Không có dữ liệu cá thể". Bản cũ cũng bỏ luôn
// `sim` dù máy chủ có trả (`animalReIDService.ts:21`) ⇒ mất huy hiệu % giống.
//
// Hai lớp gác nay chồng lên nhau: chú kiểu `(c): ReidCandidate` làm `tsc` đỏ khi
// đổi tên khoá, và các ca dưới đây bắt cả trường hợp khoá đúng nhưng gán nhầm giá trị.

import { toReidCandidates } from './AnimalIdentityScreen';
import type { AnimalCandidate } from '../services/animalReIDService';

const C: AnimalCandidate = {
  animal_did: 'did:ori:animal:abc123',
  name: 'Bò số 3',
  species: 'cattle',   // khoá của MÁY CHỦ (animal_config.py), không phải 'bo'
  sim: 0.82,
  near_prev: true,
  n_views: 7,
};

describe('toReidCandidates', () => {
  it('`id` = animal_did — đây là khoá hộp thoại đọc để chọn và để điều hướng', () => {
    const [got] = toReidCandidates([C]);
    expect(got.id).toBe('did:ori:animal:abc123');
    // Khoá cũ KHÔNG được sót lại dưới bất kỳ dạng nào.
    expect((got as unknown as Record<string, unknown>).tree_id).toBeUndefined();
  });

  it('mọi ứng viên đều có `id` không rỗng (không cái nào lọt undefined)', () => {
    const list = toReidCandidates([C, { ...C, animal_did: 'did:ori:animal:xyz' }]);
    expect(list).toHaveLength(2);
    for (const c of list) {
      expect(typeof c.id).toBe('string');
      expect(c.id.length).toBeGreaterThan(0);
    }
  });

  it('giữ `sim` nguyên vẹn — bỏ nó là mất huy hiệu % giống', () => {
    expect(toReidCandidates([C])[0].sim).toBe(0.82);
    // 0 là giá trị THẬT, không phải "không có": không được rơi mất vì falsy.
    expect(toReidCandidates([{ ...C, sim: 0 }])[0].sim).toBe(0);
  });

  it('giữ `near_prev` và `n_views` — bản cũ ép cứng near_prev=false', () => {
    const [got] = toReidCandidates([C]);
    expect(got.near_prev).toBe(true);
    expect(got.n_views).toBe(7);
  });

  // Bài này trước khoá đúng hành vi CŨ: khoá tiếng Việt bỏ dấu (`bo`), và loài lạ
  // thì in nguyên khoá thô ra màn hình. Cả hai đều sai.
  //
  // Máy chủ trả khoá TIẾNG ANH (`animal_config.py:45-54`); giao với bộ khoá cũ của
  // app là RỖNG, nên nhánh "giữ nguyên văn" là nhánh chạy 100% số lần — màn hình
  // hiện "cattle", "chicken" cho nông dân, và không có gì đỏ lên vì `?? s` nuốt hết.
  // Nay khoá lạ hiện "Loài chưa rõ": trượt phải nhìn thấy được thì mới có người sửa.
  it('`code` là nhãn tiếng Việt, tra theo khoá MÁY CHỦ; loài lạ nói thật là chưa rõ', () => {
    expect(toReidCandidates([C])[0].code).toBe('Bò');
    expect(toReidCandidates([{ ...C, species: 'chicken' }])[0].code).toBe('Gà');
    // Bí danh máy chủ tự quy đổi (`animal_server_ext.py:86`) — app hiểu để hiện đúng.
    expect(toReidCandidates([{ ...C, species: 'buffalo' }])[0].code).toBe('Bò');
    // Khoá cũ của app nay là loài LẠ — đúng như nó vốn vậy với máy chủ.
    expect(toReidCandidates([{ ...C, species: 'bo' }])[0].code).toBe('Loài chưa rõ');
    expect(toReidCandidates([{ ...C, species: 'ngua' }])[0].code).toBe('Loài chưa rõ');
    expect(toReidCandidates([{ ...C, species: undefined }])[0].code).toBeUndefined();
  });

  it('thiếu tên → chuỗi rỗng (hộp thoại đòi `name: string`), KHÔNG null', () => {
    const [got] = toReidCandidates([{ ...C, name: undefined }]);
    expect(got.name).toBe('');
  });

  it('không có ứng viên / undefined → mảng rỗng, không nổ', () => {
    expect(toReidCandidates([])).toEqual([]);
    expect(toReidCandidates(undefined)).toEqual([]);
  });
});
