// modules/trace/utils/geohash.ts
//
// Bộ mã geohash. Tệp này TỪNG tên `implicitParent.ts` và từng dài 367 dòng.
//
// ── Cái đã gỡ, và vì sao ────────────────────────────────────────────────────
// Phần lớn tệp cũ là hai luồng tự-tạo-cha: `getOrCreateImplicitFarm` và
// `getOrCreateImplicitTree` — người dùng bấm "Định danh cây" / "Quét quả" ở một
// toạ độ chưa có vườn thì app TỰ dựng một vườn 22m × 22m rồi TỰ dựng một cây
// trong đó. Kèm theo là khoá chống chạy chồng, bộ dựng biên vuông, bộ đặt tên
// vườn, và bốn hằng số chỉ hai luồng đó đọc.
//
// Gỡ 01/09 vì hai lẽ, lẽ thứ hai mới là lẽ quyết định:
//
// 1. KHÔNG ĐƯỜNG NÀO GỌI TỚI. Cả hai hàm đều `export` mà 0 nơi gọi. Chú thích ở
//    `aladin-api.ts` ghi "gọi từ HomeScreen" — sai; grep cả `src/` không ra chỗ
//    nào. Chú thích ở đầu tệp test cũ ghi hai luồng này "integration-tested
//    separately on device"; không gọi được thì cũng không thử trên máy được.
//
// 2. CHÚNG PHẠM CHÍNH BẤT BIẾN MÀ `aladin-api.ts` ĐƯỢC KHAI TỬ ĐỂ CHẶN. Hai hàm
//    tự sinh khoá chính ở phía máy người dùng:
//
//        const farmId = `farm-auto-${Date.now()}`
//        const treeId = `tree-auto-${Date.now()}`
//
//    `aladin-api.ts:6-9` gọi đúng thứ này là gốc lỗi B2 ("tạo vườn nhưng cây
//    không vào vườn") và là chỗ phạm INV-1 (INTEGRATION-STANDARD §3.2): client
//    KHÔNG được tự sinh id, phải để máy chủ cấp uuid. Nên đây KHÔNG phải một
//    tính năng nằm chờ được nối dây — nối vào là dựng lại đúng con lỗi ấy.
//    (`Date.now()` làm khoá chính còn đụng nhau giữa hai máy, nhưng đó là lỗi
//    phụ; lỗi chính là ai được quyền cấp khoá.)
//
// Đường thay thế đã chạy: "Quét quả" nay trỏ `FruitScan`, ở đó máy chủ soi quả
// rồi trả về cây (`actionRegistry.ts:71-77`), và khi máy chủ không biết thì màn
// đó đưa người dùng đi chọn cây thủ công — không tự dựng gì cả
// (`FruitScanScreen.tsx:256`, `:322`).
//
// ── Cái còn lại ─────────────────────────────────────────────────────────────
// Chỉ bộ mã geohash, vì nó có người dùng thật: `syncDispatch.ts:126` gắn
// `geohash_7` cho mỗi cây đẩy lên hàng đợi đồng bộ.

// ── Geohash 7 encoder (standard base32) ──────────────────────────────────────
// Reference: https://en.wikipedia.org/wiki/Geohash
// Precision 7 ≈ 153m × 153m cell — comfortably contains a 22m × 22m farm.

const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';

/**
 * Encode GPS coordinates to a geohash string of the requested precision.
 * Standard interleaved-bit algorithm: alternate bisecting lng/lat ranges.
 */
export function computeGeohash(lat: number, lng: number, precision: number = 7): string {
  if (lat < -90 || lat > 90) throw new Error(`Invalid lat: ${lat}`);
  if (lng < -180 || lng > 180) throw new Error(`Invalid lng: ${lng}`);
  if (precision < 1 || precision > 12) throw new Error(`Invalid precision: ${precision}`);

  let latMin = -90, latMax = 90;
  let lngMin = -180, lngMax = 180;
  let isLng = true;
  let bit = 0;
  let charBits = 0;
  let result = '';

  while (result.length < precision) {
    if (isLng) {
      const mid = (lngMin + lngMax) / 2;
      if (lng >= mid) {
        charBits |= (1 << (4 - bit));
        lngMin = mid;
      } else {
        lngMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        charBits |= (1 << (4 - bit));
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isLng = !isLng;
    bit++;
    if (bit === 5) {
      result += BASE32[charBits];
      charBits = 0;
      bit = 0;
    }
  }
  return result;
}

export function computeGeohash7(lat: number, lng: number): string {
  return computeGeohash(lat, lng, 7);
}
