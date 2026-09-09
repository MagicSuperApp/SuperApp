/**
 * Ghim MỘT bất biến: **danh sách rỗng vì không có, và danh sách rỗng vì không tải
 * được, phải ra hai màn hình khác nhau — ở CẢ HAI danh sách.**
 *
 * Vì sao phải nói "cả hai": `ChatHomeScreen` bắn `loadConversations()` và
 * `loadInvitations()` từ hai dòng liền nhau, không chờ nhau. Chúng hỏng cùng lúc vì
 * cùng một lý do. Bản trước phân loại nguyên nhân cho cái thứ nhất và bỏ nguyên cái
 * thứ hai ở `rejected → invitations = []`, nên cùng một lượt 401 cho ra: một chỗ nói
 * "Chưa đăng nhập được", chỗ kia nói "Chưa có lời mời nào".
 *
 * Câu thứ hai không phải một câu báo lỗi mờ nhạt — nó là một khẳng định SAI về thế
 * giới. Người dùng đóng hộp đi và bỏ lỡ lời mời thật.
 *
 * Bài này đo bằng cách dispatch thunk thật vào một store thật rồi đọc state, không
 * đọc mã nguồn: một phép so chuỗi trên mã sẽ xanh với mọi cách viết lại kể cả khi
 * hành vi đảo ngược.
 */
jest.mock('../../../services/proofchat-api', () => {
  const actual = jest.requireActual('../../../services/proofchat-api');
  return {
    ...actual,
    isProofChatBackendEnabled: jest.fn(() => true),
    getDeviceId: jest.fn(async () => 'device-1'),
    proofChatApi: {
      conversations: { list: jest.fn() },
      memberRequests: { pending: jest.fn() },
    },
  };
});

import { configureStore } from '@reduxjs/toolkit';

import { proofChatApi, ProofChatApiError } from '../../../services/proofchat-api';
import chatReducer, { loadConversations, loadInvitations } from './chatSlice';

const listConversations = proofChatApi.conversations.list as jest.Mock;
const pendingInvitations = proofChatApi.memberRequests.pending as jest.Mock;

const newStore = () => configureStore({ reducer: { chat: chatReducer } });

/** Ba nguyên nhân, năm mã máy chủ, và tiêu đề mà mỗi cái phải dẫn tới. */
const CASES = [
  { name: 'chưa đăng nhập (401)', error: new ProofChatApiError(401, 'Unauthorized'), title: 'Chưa đăng nhập được' },
  { name: 'không có quyền (403)', error: new ProofChatApiError(403, 'Forbidden'), title: 'Chưa đăng nhập được' },
  { name: 'mạng đứt (0)', error: new ProofChatApiError(0, 'Network Error'), title: 'Không nối được máy chủ' },
  { name: 'máy chủ lỗi (500)', error: new ProofChatApiError(500, 'Boom'), title: 'Chưa tải được' },
  { name: 'lỗi lạ, không phải lỗi API', error: new TypeError('undefined is not a function'), title: 'Chưa tải được' },
] as const;

beforeEach(() => {
  listConversations.mockReset();
  pendingInvitations.mockReset();
});

describe('lời mời — tải hỏng KHÔNG được đọc thành "chưa có lời mời nào"', () => {
  it.each(CASES)('$name ⇒ có câu nói vì sao, và danh sách để trống', async ({ error, title }) => {
    pendingInvitations.mockRejectedValue(error);
    const store = newStore();

    await store.dispatch(loadInvitations());
    const state = store.getState().chat;

    expect(state.invitationsStatus).toBe('error');
    expect(state.invitations).toEqual([]);
    // Đây là chốt: state phải MANG theo lý do. Thiếu nó thì màn hình không có gì để
    // phân biệt với ca rỗng thật, dù `invitationsStatus` có ghi 'error'.
    expect(state.invitationsErrorTitle).toBe(title);
    expect(state.invitationsError).toBeTruthy();
  });

  it('ca đối chứng: tải ĐƯỢC nhưng máy chủ trả rỗng ⇒ KHÔNG có câu lỗi nào', async () => {
    // Không có ca này thì bài trên xanh cả khi mã gán câu lỗi vô điều kiện, và màn
    // hình sẽ kêu "chưa đăng nhập được" cho một hộp thư rỗng bình thường.
    pendingInvitations.mockResolvedValue([]);
    const store = newStore();

    await store.dispatch(loadInvitations());
    const state = store.getState().chat;

    expect(state.invitationsStatus).toBe('ready');
    expect(state.invitationsError).toBeUndefined();
    expect(state.invitationsErrorTitle).toBeUndefined();
  });
});

describe('hai danh sách hỏng cùng lúc phải nói CÙNG một chuyện', () => {
  // Đây là bất biến thật sự đang được ghim. Hai bài riêng lẻ ở trên vẫn xanh khi
  // hai bên phân loại lệch nhau; chỉ phép so trực tiếp mới bắt được.
  it.each(CASES)('$name ⇒ phòng và lời mời cho ra cùng một tiêu đề', async ({ error }) => {
    listConversations.mockRejectedValue(error);
    pendingInvitations.mockRejectedValue(error);
    const store = newStore();

    await Promise.all([store.dispatch(loadConversations()), store.dispatch(loadInvitations())]);
    const state = store.getState().chat;

    expect(`lời mời: ${state.invitationsErrorTitle}`).toBe(`lời mời: ${state.loadErrorTitle}`);
  });

  it('câu cho người dùng KHÔNG lộ mã lỗi hay tên cửa máy chủ', async () => {
    const leaky = new ProofChatApiError(500, 'GET /member-requests/pending 500');
    listConversations.mockRejectedValue(leaky);
    pendingInvitations.mockRejectedValue(leaky);
    const store = newStore();

    await Promise.all([store.dispatch(loadConversations()), store.dispatch(loadInvitations())]);
    const state = store.getState().chat;

    for (const text of [state.loadError, state.invitationsError]) {
      expect(text).not.toMatch(/\/member-requests|\/conversations|500|401/);
    }
  });
});
