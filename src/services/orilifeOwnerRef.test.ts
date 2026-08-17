// services/orilifeOwnerRef.test.ts
//
// Khoá `owner-ref` của chính người đang đăng nhập.
//
// VÌ SAO CẦN BÀI KIỂM RIÊNG. `GET /api/grants` trả danh sách chia sẻ HAI CHIỀU
// trong một mảng phẳng; `splitGrants` tách chiều bằng owner-ref này. Mã sai hoặc
// mã sót lại của phiên trước ⟹ màn chia sẻ hiện ĐÚNG NGƯỢC CHIỀU: "bạn đã chia
// sẻ cây này cho 3 người" trong khi thật ra ba người đó chia sẻ cây của họ cho
// bạn. Không có gì đỏ, không có gì báo — nên phải khoá ở tầng này.
//
// Hai điều kiện bài kiểm giữ, cả hai đều thuộc họ "sai mà im lặng":
//   1. Chưa biết mình là ai thì trả `null`, KHÔNG trả chuỗi rỗng. Chuỗi rỗng
//      lọt qua `if (me)` ở chỗ gọi theo cách khác hẳn `null`.
//   2. Đăng xuất phải xoá mã này CÙNG LÚC với token. Sót lại là tách chiều theo
//      người dùng cũ.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { currentOwnerRef, clearOrilifeToken, OWNER_REF_KEY } from './orilifeDidAuth';

const AUTH_TOKEN_KEY = 'auth_token';

describe('owner-ref của người đang đăng nhập', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('chưa lưu bao giờ → null, không phải chuỗi rỗng', async () => {
    await expect(currentOwnerRef()).resolves.toBeNull();
  });

  it('đọc lại đúng mã đã lưu', async () => {
    await AsyncStorage.setItem(OWNER_REF_KEY, 'acct:me-0001');
    await expect(currentOwnerRef()).resolves.toBe('acct:me-0001');
  });

  it('cắt khoảng trắng thừa', async () => {
    await AsyncStorage.setItem(OWNER_REF_KEY, '  did:phoenix:1:abc  ');
    await expect(currentOwnerRef()).resolves.toBe('did:phoenix:1:abc');
  });

  // Chuỗi toàn khoảng trắng KHÔNG phải một owner-ref. Trả nguyên nó ra thì
  // `splitGrants` nhận một `me` "có vẻ thật" rồi lọc ra hai nhóm RỖNG — màn báo
  // "chưa chia sẻ cho ai" trong khi danh sách có người.
  it('chuỗi rỗng hoặc toàn khoảng trắng → null', async () => {
    await AsyncStorage.setItem(OWNER_REF_KEY, '   ');
    await expect(currentOwnerRef()).resolves.toBeNull();

    await AsyncStorage.setItem(OWNER_REF_KEY, '');
    await expect(currentOwnerRef()).resolves.toBeNull();
  });

  it('đăng xuất xoá CẢ token lẫn owner-ref', async () => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, 'tok-123');
    await AsyncStorage.setItem(OWNER_REF_KEY, 'acct:me-0001');

    await clearOrilifeToken();

    await expect(AsyncStorage.getItem(AUTH_TOKEN_KEY)).resolves.toBeNull();
    await expect(currentOwnerRef()).resolves.toBeNull();
  });
});
