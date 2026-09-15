// services/sessionTokenOwner.test.ts
//
// THẺ PHIÊN PHẢI MANG DẤU CHỦ, VÀ PHÉP KIỂM PHẢI PHÂN BIỆT BỐN TRẠNG THÁI.
//
// Bài anh em của `sessionTokenOrphanMint.test.ts`, và cố ý KHÔNG gộp: bài kia canh
// một lượt đúc mồ côi TRỒNG LẠI thẻ (đo số hiệu thế, trong một lượt), bài này canh
// một thẻ NẰM LẠI từ lượt trước (đo dấu chủ, giữa hai lượt). Hai đường vào khác
// nhau: đường thứ hai đi qua nút "đổi tài khoản", và nút đó không gọi `logoutUser`
// nên không chạm số hiệu thế nào cả.
//
// Vì sao bốn trạng thái chứ không hai: một phép đo trả về giá trị hợp lệ đúng lúc
// nó không đo được gì thì màu xanh của nó vô nghĩa. Thẻ KHÔNG mang dấu (do bản app
// cũ ghi) là trạng thái MÙ — nó phải tách khỏi "thẻ của người khác", dù cả hai đều
// dẫn tới cùng một hành động là bỏ thẻ.

import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('./remoteLogger', () => ({
  __esModule: true,
  default: new Proxy({}, { get: () => new Proxy(() => {}, { get: () => () => {} }) }),
}));

import {
  setSessionToken,
  getSessionToken,
  getSessionTokenOwnerDid,
  clearSessionToken,
  ensureSessionTokenBelongsTo,
  sessionMintGeneration,
} from './phoenixKey-api';

const A = 'did:phoenix:1:' + 'a'.repeat(64);
const B = 'did:phoenix:1:' + 'b'.repeat(64);
const SESSION_TOKEN_KEY = 'phoenixkey_session_token';
const OWNER_KEY = 'phoenixkey_session_token_did';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('dấu chủ đi cùng thẻ', () => {
  it('ghi thẻ là ghi luôn dấu chủ', async () => {
    await setSessionToken('the-A', A);
    expect(await getSessionToken()).toBe('the-A');
    expect(await getSessionTokenOwnerDid()).toBe(A);
  });

  it('bỏ thẻ là bỏ luôn dấu chủ — để lại dấu mồ côi thì lượt sau đọc ra một lời khai về một thẻ không còn', async () => {
    await setSessionToken('the-A', A);
    await clearSessionToken();
    expect(await getSessionToken()).toBeNull();
    expect(await getSessionTokenOwnerDid()).toBeNull();
  });
});

describe('ensureSessionTokenBelongsTo — bốn trạng thái', () => {
  it('không có thẻ nào ⟹ none, và KHÔNG coi là một lần lệch', async () => {
    expect(await ensureSessionTokenBelongsTo(A)).toBe('none');
  });

  it('thẻ mang dấu đúng người ⟹ ok, thẻ giữ nguyên', async () => {
    await setSessionToken('the-A', A);
    expect(await ensureSessionTokenBelongsTo(A)).toBe('ok');
    expect(await getSessionToken()).toBe('the-A');
  });

  it('thẻ mang dấu NGƯỜI KHÁC ⟹ foreign, và thẻ bị bỏ', async () => {
    await setSessionToken('the-A', A);
    expect(await ensureSessionTokenBelongsTo(B)).toBe('foreign');
    expect(await getSessionToken()).toBeNull();
    expect(await getSessionTokenOwnerDid()).toBeNull();
  });

  it('thẻ KHÔNG mang dấu ⟹ unmarked (trạng thái mù), và cũng bị bỏ', async () => {
    // Đúng hình dạng thẻ do bản app CŨ ghi: có thẻ, không có khoá dấu chủ.
    await AsyncStorage.setItem(SESSION_TOKEN_KEY, 'the-ban-cu');
    expect(await ensureSessionTokenBelongsTo(A)).toBe('unmarked');
    expect(await getSessionToken()).toBeNull();
  });

  it('unmarked KHÔNG được đọc thành ok — đây là cả nội dung của bài', async () => {
    await AsyncStorage.setItem(SESSION_TOKEN_KEY, 'the-ban-cu');
    const verdict = await ensureSessionTokenBelongsTo(A);
    expect(verdict).not.toBe('ok');
    expect(verdict).not.toBe('foreign'); // và cũng không gộp vào ca lệch
  });

  it('mỗi lần bỏ thẻ đều bơm số hiệu thế — lượt đúc đang bay không trồng lại được', async () => {
    await setSessionToken('the-A', A);
    const before = sessionMintGeneration();
    await ensureSessionTokenBelongsTo(B);
    expect(sessionMintGeneration()).toBeGreaterThan(before);
  });

  it('ca ok KHÔNG bơm số hiệu thế — bơm vô cớ là huỷ một lượt đúc hợp lệ của chính người này', async () => {
    await setSessionToken('the-A', A);
    const before = sessionMintGeneration();
    await ensureSessionTokenBelongsTo(A);
    expect(sessionMintGeneration()).toBe(before);
  });

  it('dấu chủ rỗng cũng là mù, không phải khớp với một DID rỗng', async () => {
    await AsyncStorage.setItem(SESSION_TOKEN_KEY, 'the-x');
    await AsyncStorage.setItem(OWNER_KEY, '');
    expect(await ensureSessionTokenBelongsTo('')).not.toBe('ok');
  });
});
