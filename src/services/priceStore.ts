/**
 * priceStore — nhớ GIÁ LẦN ĐỌC TRƯỚC, để tính được mức biến động.
 *
 * Trang nguồn chỉ đăng giá HÔM NAY, không có lịch sử. Muốn nói "tăng 6%" thì
 * phải tự nhớ lần trước đọc được bao nhiêu. Đây là toàn bộ việc của tệp này.
 *
 * Mọi hàm NUỐT lỗi: đọc hỏng thì coi như chưa có gì để so, và màn hình hiện giá
 * mà không hiện mũi tên. Mất phần biến động thì tiếc, nhưng không được phép làm
 * sập trang.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CommodityPrice } from './agriPriceService';

const KEY = '@aladin/price/prev';

/** `mã mặt hàng → giá lần đọc trước`. Chưa có gì thì trả bảng rỗng. */
export async function loadPrevPrices(): Promise<Record<string, number>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Ghi đè giá đã đọc.
 *
 * Ghi ĐÈ chứ không cộng dồn lịch sử: app này cần đúng một phép so "hôm nay với
 * lần trước". Giữ cả chuỗi lịch sử trong AsyncStorage là mở một kho dữ liệu
 * không ai dọn và không màn nào đọc.
 */
export async function savePrices(prices: CommodityPrice[]): Promise<void> {
  try {
    const map: Record<string, number> = {};
    for (const p of prices) {
      if (Number.isFinite(p?.priceVnd) && p.priceVnd > 0) map[p.key] = p.priceVnd;
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* hết chỗ / lỗi ghi → lần sau đọc lại, không sao */
  }
}
