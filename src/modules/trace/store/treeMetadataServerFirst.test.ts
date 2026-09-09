/**
 * Ghim MỘT ràng buộc: **chữ người dùng vừa gõ không được biến mất vì mạng.**
 *
 * Tệp này đã đi qua hai bản sai ngược chiều, và cả hai đều xanh lúc viết:
 *
 *  1. Bản đầu ghim "chỉ ghi cục bộ" — dữ liệu nằm trên đúng một cái máy, gỡ app là
 *     mất, người dùng không có cách nào biết.
 *  2. Bản sau ghim "máy chủ trượt thì PHẢI từ chối" — nó gỡ được cái vỏ im lặng và
 *     dựng lên một cái tệ hơn: nông dân mất sóng thì mất luôn chữ vừa gõ. Đó là ô
 *     "Server-required validation" trong bảng CẤM TUYỆT ĐỐI của
 *     `Specs/PRINCIPLE-independent-feature.md:156`, và F3.3 offline-first ở
 *     `Specs/Platform-Feat-Spec.md:224` là mức **Must**.
 *
 * Và cả hai bản đều đo bằng **biểu thức chính quy trên mã nguồn**: cắt thân hàm ra
 * rồi tìm chữ. Phép đo đó không phân biệt được mã với lời bàn về mã, không chạy một
 * dòng nào, và xanh với mọi cách viết lại dù hành vi đảo ngược. Nên bản này **chạy
 * thunk thật** với ba hình dạng lỗi khác nhau của máy chủ và đọc kết quả thật.
 *
 * Ba ca, ba kết cục khác nhau — đó là điều đang được ghim:
 *
 *   máy chủ nhận       → `fulfilled`, không `pending`, có ghi `AsyncStorage`
 *   mất sóng / bận     → `fulfilled` CÓ `pending` mang lý do, VẪN ghi `AsyncStorage`
 *   máy chủ bác dữ liệu→ `rejected`, KHÔNG ghi `AsyncStorage`, giữ câu của máy chủ
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { configureStore } from '@reduxjs/toolkit';

jest.mock('../../../services/orilifeDidAuth', () => ({
  ensureOrilifeToken: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../../services/treeProfileService', () => ({
  ...jest.requireActual('../../../services/treeProfileService'),
  saveTreeProfile: jest.fn(),
}));
jest.mock('../../../utils/database', () => ({ database: {} }));
jest.mock('../../../services/databaseManager', () => ({
  databaseManager: { ensureReady: jest.fn() },
}));

import { saveTreeProfile } from '../../../services/treeProfileService';
import farmReducer, { saveTreeMetadata, treeMetadataKey } from './farmSlice';
import { saveErrorMessage } from './saveErrorMessage';
import type { TreeMetadata } from '../types';

const gia = saveTreeProfile as jest.MockedFunction<typeof saveTreeProfile>;

const CAY = 'cay-01';
const metadata = (): TreeMetadata => ({
  variety: 'ri6',
  age_years: 4,
  notes: 'gõ dưới gốc cây, sóng chập chờn',
  updated_at: '2026-09-09T00:00:00.000Z',
  schema_version: 'tree_metadata/1.0',
});

const luu = async () => {
  const store = configureStore({ reducer: { farm: farmReducer } });
  const action = await store.dispatch(
    saveTreeMetadata({ treeId: CAY, metadata: metadata() }),
  );
  return { action, store };
};

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('hồ sơ cây — mạng hỏng thì mất lượt gửi, KHÔNG mất chữ', () => {
  it('ca đối chứng: máy chủ nhận ⟹ xong, không cờ treo, có ghi trên máy', async () => {
    gia.mockResolvedValue({ ok: true, voiceMemo: undefined } as never);

    const { action, store } = await luu();

    expect(action.type).toBe('farm/saveTreeMetadata/fulfilled');
    expect((action.payload as { pending?: unknown }).pending).toBeUndefined();
    expect(await AsyncStorage.getItem(treeMetadataKey(CAY))).toContain('ri6');
    expect(store.getState().farm).toBeDefined();
    // Ca này phải phân biệt được với ca dưới, không thì hai ca đo cùng một thứ.
    expect(gia).toHaveBeenCalledTimes(1);
  });

  it('MẤT SÓNG: vẫn `fulfilled`, chữ vẫn nằm trên máy, và có cờ nói rõ chưa lên máy chủ', async () => {
    gia.mockResolvedValue({
      ok: false,
      error: { type: 'network_error', detail: 'Không kết nối được máy chủ', http_status: 0 },
    } as never);

    const { action } = await luu();

    expect(action.type).toBe('farm/saveTreeMetadata/fulfilled');
    // Đây là điều quan trọng nhất trong cả tệp: chữ người dùng gõ còn nguyên.
    expect(await AsyncStorage.getItem(treeMetadataKey(CAY))).toContain('sóng chập chờn');
    // Và app KHÔNG được im lặng coi như đã xong — cờ mang chính câu của máy chủ.
    expect((action.payload as { pending?: { detail: string } }).pending?.detail).toBe(
      'Không kết nối được máy chủ',
    );
  });

  it('MÁY CHỦ BẬN / HỎNG cũng giữ chữ — chỉ `validation_error` mới là lỗi của dữ liệu', async () => {
    for (const type of ['server_error', 'rate_limited', 'auth_error'] as const) {
      jest.clearAllMocks();
      await AsyncStorage.clear();
      gia.mockResolvedValue({
        ok: false,
        error: { type, detail: `hỏng kiểu ${type}`, http_status: 500 },
      } as never);

      const { action } = await luu();

      expect(`${type}: ${action.type}`).toBe(`${type}: farm/saveTreeMetadata/fulfilled`);
      expect(await AsyncStorage.getItem(treeMetadataKey(CAY))).toContain('ri6');
    }
  });

  it('MÁY CHỦ BÁC DỮ LIỆU: từ chối, không ghi, và giữ NGUYÊN VĂN câu của máy chủ', async () => {
    gia.mockResolvedValue({
      ok: false,
      error: {
        type: 'validation_error',
        detail: 'Ngày thu hoạch không hợp lệ: ở tương lai',
        http_status: 422,
      },
    } as never);

    const { action } = await luu();

    expect(action.type).toBe('farm/saveTreeMetadata/rejected');
    // Câu của máy chủ nói được người dùng phải sửa GÌ; câu chung chung của app thì
    // không. `rejectWithValue` ném ra chuỗi trần, nên màn phải đọc nó như chuỗi —
    // xem nhánh `catch` ở `screens/TreeMetadataTab.tsx`.
    expect(action.payload).toBe('Ngày thu hoạch không hợp lệ: ở tương lai');
    expect(await AsyncStorage.getItem(treeMetadataKey(CAY))).toBeNull();
  });

  it('câu báo cho người dùng đọc được NGUYÊN VĂN câu bị ném ra, dù nó là chuỗi trần', async () => {
    gia.mockResolvedValue({
      ok: false,
      error: {
        type: 'validation_error',
        detail: 'Ngày thu hoạch không hợp lệ: ở tương lai',
        http_status: 422,
      },
    } as never);

    const store = configureStore({ reducer: { farm: farmReducer } });
    let bat: unknown;
    try {
      await store.dispatch(saveTreeMetadata({ treeId: CAY, metadata: metadata() })).unwrap();
    } catch (e) {
      bat = e;
    }

    // Hình dạng thật của thứ `unwrap()` ném ra — đây là dữ kiện mà `saveErrorMessage`
    // tồn tại vì nó, nên ghim luôn cả hình dạng, không chỉ ghim hàm.
    expect(typeof bat).toBe('string');
    expect((bat as { message?: unknown })?.message).toBeUndefined();
    expect(saveErrorMessage(bat, 'CÂU CHUNG CHUNG CỦA APP')).toBe(
      'Ngày thu hoạch không hợp lệ: ở tương lai',
    );
  });

  it('thân rỗng thì KHÔNG bịa ra lượt gọi mạng, nhưng vẫn ghi trên máy', async () => {
    const store = configureStore({ reducer: { farm: farmReducer } });
    // Chỉ có hai trường máy chủ không giữ ⟹ `buildTreeProfileBody` ra thân rỗng.
    const action = await store.dispatch(
      saveTreeMetadata({
        treeId: CAY,
        metadata: { updated_at: '2026-09-09T00:00:00.000Z', schema_version: 'tree_metadata/1.0' },
      }),
    );

    expect(action.type).toBe('farm/saveTreeMetadata/fulfilled');
    expect(gia).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(treeMetadataKey(CAY))).not.toBeNull();
  });
});
