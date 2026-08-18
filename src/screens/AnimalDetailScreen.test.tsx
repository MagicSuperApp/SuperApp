// screens/AnimalDetailScreen.test.tsx
//
// KHOÁ ĐẦU ĐỌC PARAMS của màn hồ sơ cá thể — không phải bộ phân giải QR.
//
// Vì sao có tệp này. `traceScan.test.ts` chốt `lamp://AnimalDetail?id=a1` →
// `params:{id:'a1'}` và XANH, vì nó chỉ kiểm bộ phân giải. Màn đích lại đọc
// `route.params.animalDid` ⇒ `undefined`, dữ liệu thật nằm ngay trong params mà
// màn hiện "Không có dữ liệu cá thể". Đúng mẫu "test xanh trên đường không ai đi
// được". Test dưới đây đi ĐÚNG đường người dùng đi: dựng màn với params rồi xem
// nó gọi máy chủ bằng mã nào.
//
// Bẫy đã tránh: `useNavigation` mock trả về CÙNG MỘT object mỗi lượt dựng (như
// react-navigation thật). Trả object mới mỗi lần thì `useCallback` phụ thuộc nó
// tái tạo liên tục và lỗi phụ thuộc biến mất — test PASS giả.

import React from 'react';
import renderer, { act } from 'react-test-renderer';

// ── Mock điều hướng ─────────────────────────────────────────────────────────
const mockNav = { navigate: jest.fn(), goBack: jest.fn() }; // ổn định qua mọi lượt dựng
let mockRouteParams: Record<string, unknown> | undefined;

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockRouteParams }),
}));

// ── Mock cửa máy chủ ────────────────────────────────────────────────────────
const mockGetAnimal = jest.fn();
jest.mock('../services/animalReIDService', () => ({
  getAnimal: (...args: unknown[]) => mockGetAnimal(...args),
}));

// Dòng thời gian tự gọi mạng khi mount — không phải thứ tệp này kiểm.
jest.mock('../modules/trace/components/EntityTimeline', () => 'EntityTimeline');

import AnimalDetailScreen, { readAnimalDid } from './AnimalDetailScreen';

const ANIMAL = {
  animal_did: 'did:ori:animal:a1',
  name: 'Bò số 3',
  species: 'bo',
  farm_id: 'farm-7',
  n_images: 5,
};

/** Gom mọi chuỗi Text trong cây dựng được. */
function texts(tree: renderer.ReactTestRenderer): string[] {
  const out: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') { out.push(node); return; }
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const n = node as { children?: unknown[] } | null;
    if (n && Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk(tree.toJSON());
  return out;
}

async function mount(params: Record<string, unknown> | undefined) {
  mockRouteParams = params;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(React.createElement(AnimalDetailScreen));
  });
  return tree;
}

beforeEach(() => {
  mockGetAnimal.mockReset();
  mockGetAnimal.mockResolvedValue({ ok: true, data: ANIMAL });
  mockNav.navigate.mockReset();
  mockNav.goBack.mockReset();
});

// ---------------------------------------------------------------------------
// readAnimalDid — hàm thuần
// ---------------------------------------------------------------------------

describe('readAnimalDid', () => {
  it('khoá CHÍNH THỨC là `animalDid` (khớp lệ treeId/farmId)', () => {
    expect(readAnimalDid({ animalDid: 'a1' })).toBe('a1');
  });

  it('đỡ khoá `id` của mã QR cũ đã in ra ngoài', () => {
    expect(readAnimalDid({ id: 'a2' })).toBe('a2');
  });

  it('có cả hai → `animalDid` thắng, không nhập nhằng', () => {
    expect(readAnimalDid({ animalDid: 'a1', id: 'a2' })).toBe('a1');
  });

  it('không params / rỗng / toàn khoảng trắng → chuỗi rỗng', () => {
    expect(readAnimalDid(undefined)).toBe('');
    expect(readAnimalDid({})).toBe('');
    expect(readAnimalDid({ animalDid: '   ' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Màn dựng thật — mã nào tới được máy chủ
// ---------------------------------------------------------------------------

describe('AnimalDetailScreen đọc params', () => {
  it('`animalDid` → gọi getAnimal đúng mã và hiện tên thật', async () => {
    const tree = await mount({ animalDid: 'did:ori:animal:a1' });
    expect(mockGetAnimal).toHaveBeenCalledTimes(1);
    expect(mockGetAnimal.mock.calls[0][1]).toBe('did:ori:animal:a1');
    expect(texts(tree).join(' ')).toContain('Bò số 3');
  });

  it('`id` (QR cũ) → VẪN gọi getAnimal, không rơi vào màn trống', async () => {
    const tree = await mount({ id: 'did:ori:animal:a1' });
    expect(mockGetAnimal).toHaveBeenCalledTimes(1);
    expect(mockGetAnimal.mock.calls[0][1]).toBe('did:ori:animal:a1');
    expect(texts(tree).join(' ')).not.toContain('Không nhận được mã cá thể');
  });

  it('thiếu mã hẳn → KHÔNG gọi mạng, nói rõ thiếu gì', async () => {
    const tree = await mount({});
    expect(mockGetAnimal).not.toHaveBeenCalled();
    expect(texts(tree).join(' ')).toContain('Không nhận được mã cá thể');
  });

  it('máy chủ từ chối → hiện đúng lời máy chủ, KHÔNG nuốt thành màn trống', async () => {
    mockGetAnimal.mockResolvedValue({
      ok: false,
      error: { type: 'auth_error', detail: 'Token hết hạn hoặc không hợp lệ', http_status: 401 },
    });
    const tree = await mount({ animalDid: 'did:ori:animal:a1' });
    expect(texts(tree).join(' ')).toContain('Token hết hạn hoặc không hợp lệ');
  });

  it('KHÔNG còn là màn giữ chỗ: câu "đang được phát triển" phải biến mất', async () => {
    const tree = await mount({ animalDid: 'did:ori:animal:a1' });
    expect(texts(tree).join(' ')).not.toContain('đang được phát triển');
  });
});
