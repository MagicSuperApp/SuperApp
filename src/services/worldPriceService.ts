/**
 * worldPriceService — GIÁ NGOÀI NƯỚC, dựng từ FAOSTAT.
 *
 * ── Vì sao là CHỈ SỐ chứ không phải số tiền ────────────────────────────────
 * FAOSTAT trả giá sản xuất bằng ĐỒNG TIỀN BẢN ĐỊA: Việt Nam ra đồng, Brazil ra
 * real, Indonesia ra rupiah. Bày chúng cạnh nhau trong một cột là mời người đọc
 * so ba con số không cùng đơn vị.
 *
 * Chỉ số giá sản xuất (2014–2016 = 100) thì không có đơn vị, so được giữa các
 * nước — và "biến động" vốn đúng là việc của chỉ số.
 *
 * ── Và phải nói rõ nó CŨ ────────────────────────────────────────────────────
 * Năm mới nhất FAOSTAT có là 2024. Mỗi dòng mang theo `atMs` là mốc THÁNG của số
 * liệu, để màn in ngày ra bên cạnh. Không có nó thì người đọc tưởng đây là giá
 * hôm nay — sai lệch hai năm, và họ có thể bán hàng theo nó.
 */

import type { CommodityPrice } from './agriPriceService';
import { AREA, ITEM, fetchPriceIndex, latestPair } from './faostatService';

/** Nước trồng cà phê lớn — để nhà vườn thấy mình đứng đâu so với đối thủ. */
const WORLD_ITEMS = [
  { key: 'coffeeBrazil', area: AREA.brazil, item: ITEM.coffeeGreen, nameKey: 'trace.price.coffeeBrazil' },
  { key: 'coffeeIndonesia', area: AREA.indonesia, item: ITEM.coffeeGreen, nameKey: 'trace.price.coffeeIndonesia' },
];

/** Năm cần hỏi. Lấy rộng vì FAOSTAT chậm — năm nay thường chưa có số liệu. */
const YEARS = [2023, 2024, 2025];

/** Lấy chỉ số giá thế giới. Nguồn nào hỏng thì vắng mặt, không kéo nguồn khác. */
export async function fetchWorldPrices(): Promise<CommodityPrice[]> {
  const out = await Promise.all(WORLD_ITEMS.map(async (w): Promise<CommodityPrice | null> => {
    try {
      const points = await fetchPriceIndex({ area: w.area, item: w.item, years: YEARS });
      const { latest, prev } = latestPair(points);
      if (!latest) return null;
      return {
        key: w.key,
        scope: 'global' as const,
        nameKey: w.nameKey,
        unitKey: 'trace.price.index',
        priceVnd: Math.round(latest.value * 10) / 10,
        atMs: new Date(latest.year, latest.monthIndex, 1).getTime(),
        source: 'FAOSTAT',
        prevVnd: prev ? Math.round(prev.value * 10) / 10 : null,
        prevAtMs: prev ? new Date(prev.year, prev.monthIndex, 1).getTime() : null,
        cadence: 'monthly' as const,
      };
    } catch {
      return null;
    }
  }));
  return out.filter((p): p is CommodityPrice => p != null);
}
