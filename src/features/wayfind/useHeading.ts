/**
 * useHeading — HƯỚNG MÁY ĐANG CHĨA, lấy từ nguồn tốt nhất máy có.
 *
 * ── Hai nguồn, rất khác nhau ────────────────────────────────────────────────
 *   LA BÀN TỪ  (`compass`) — hướng máy đang chĩa. Đúng cả khi người đứng yên.
 *                Đây là thứ kim la bàn cần.
 *   HƯỚNG ĐI   (`course`)  — `coords.heading` của GPS, tức hướng DI CHUYỂN.
 *                Chỉ có nghĩa khi đang đi; đứng yên là số rác.
 *
 * ── Vì sao có lớp trung gian này ────────────────────────────────────────────
 * App CHƯA cài thư viện la bàn nào (kiểm `package.json`: không có
 * `react-native-compass-heading`, `react-native-sensors`, `expo-sensors`).
 * `TreeReIDBridge.getCurrentHeading` thì chỉ sống trong phiên chụp ảnh cây và
 * chỉ có trên iOS — không dùng chung được.
 *
 * Nên hook này DÒ mô-đun native lúc chạy: có thì dùng la bàn thật, chưa có thì
 * lùi về hướng-đi của GPS. Màn hình phía trên chỉ thấy một con số `headingDeg`,
 * không cần biết nó từ đâu ra. Ngày nào cài thư viện thì SỬA ĐÚNG TỆP NÀY, màn
 * không phải đụng một dòng.
 *
 * Cài để có la bàn thật:
 *     npm i react-native-compass-heading && npx pod-install    (rồi dựng lại app)
 * Hook tự nhận ra mô-đun và chuyển sang `compass` — không cần đổi mã.
 *
 * ── Con số trả về đã được LỌC ───────────────────────────────────────────────
 * La bàn từ rung ±3–8° cả khi máy nằm yên, mạnh hơn khi gần kim loại (hàng rào,
 * máy bơm, xe máy — thứ nhà vườn nào cũng đứng cạnh). Số thô đưa thẳng vào phép
 * quay thì kim rung liên tục. Xem `smoothHeading` trong `needle.ts`.
 */

import { useEffect, useRef, useState } from 'react';
import { NativeEventEmitter, NativeModules } from 'react-native';

import { smoothHeading } from './needle';

export type HeadingSource = 'compass' | 'course' | null;

export interface HeadingReading {
  /** Hướng máy đang chĩa, 0…360 (0 = Bắc). `null` = chưa biết. */
  headingDeg: number | null;
  /** Số này từ đâu ra — màn dùng để nói đúng sự thật với người dùng. */
  source: HeadingSource;
  /** Máy này có la bàn từ dùng được không (đã cài thư viện chưa). */
  hasCompass: boolean;
}

/** Bộ lọc: nhỏ thì mượt mà chậm, lớn thì bám nhanh mà rung. */
const SMOOTHING = 0.15;

/** Đổi hướng dưới ngần này thì bỏ qua — đỡ vẽ lại màn 60 lần/giây vì nhiễu. */
const MIN_STEP_DEG = 0.5;

/**
 * Mô-đun la bàn. Trên Android là `CompassHeadingModule.kt` của chính dự án — nó
 * bọc lại `HeadingSensorReader` (cảm biến hợp nhất TYPE_ROTATION_VECTOR) vốn đã
 * có sẵn nhưng bị khoá trong phiên chụp ảnh cây.
 *
 * Tên module đặt trùng `react-native-compass-heading` để sau này thay bằng thư
 * viện đó (hoặc thêm bản iOS) thì tệp này không phải đụng.
 */
const CompassModule: any = (NativeModules as any).CompassHeading ?? null;

export function useHeading(enabled = true): HeadingReading {
  const [headingDeg, setHeadingDeg] = useState<number | null>(null);
  const [source, setSource] = useState<HeadingSource>(null);
  /**
   * Máy CÓ mô-đun chưa chắc có cảm biến: máy rẻ thiếu từ kế thì
   * `TYPE_ROTATION_VECTOR` không tồn tại. `null` = đang hỏi.
   */
  const [supported, setSupported] = useState<boolean | null>(null);
  const smoothed = useRef<number | null>(null);

  useEffect(() => {
    if (!CompassModule?.hasCompass) { setSupported(false); return; }
    let alive = true;
    CompassModule.hasCompass()
      .then((ok: boolean) => { if (alive) setSupported(!!ok); })
      .catch(() => { if (alive) setSupported(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!enabled || !CompassModule || supported !== true) return;

    let alive = true;
    const emitter = new NativeEventEmitter(CompassModule);

    const applyRaw = (raw: unknown): void => {
      const n = Number(raw);
      if (!Number.isFinite(n)) return;
      const prev = smoothed.current;
      const next = smoothHeading(prev, n, SMOOTHING);
      smoothed.current = next;
      if (prev === null || Math.abs(next - prev) >= MIN_STEP_DEG) {
        setHeadingDeg(next);
        setSource('compass');
      }
    };

    const sub = emitter.addListener('HeadingUpdated', (data: any) => {
      if (!alive) return;
      applyRaw(typeof data === 'number' ? data : data?.heading);
    });

    try {
      // Tham số DUY NHẤT là "đổi bao nhiêu độ mới báo". Native lọc rung sẵn
      // (α=0,15); đặt 1° ở đây chỉ để bớt số lần vẽ lại, rồi phía JS lọc lần nữa.
      CompassModule.start(1);
    } catch {
      // Mô-đun có mặt nhưng không khởi động được → im lặng rơi về hướng-đi GPS.
      // Đừng dựng hộp lỗi cho một thứ phụ giữa lúc người ta đang tìm đường.
    }

    return () => {
      alive = false;
      sub.remove();
      try { CompassModule.stop?.(); } catch { /* không có gì để dừng */ }
    };
  }, [enabled, supported]);

  return { headingDeg, source, hasCompass: supported === true };
}

/**
 * Nhận hướng-đi của GPS làm nguồn LÙI, khi máy chưa có la bàn.
 *
 * Tách khỏi hook trên vì hai nguồn có vòng đời khác hẳn: la bàn tự phát sự kiện,
 * còn hướng-đi đi kèm mỗi bản tin GPS mà màn vốn đã theo dõi sẵn. Màn gọi hàm
 * này mỗi lần có bản tin mới, và CHỈ khi `hasCompass` là false — có la bàn thật
 * rồi thì đừng để một con số kém chính xác hơn tranh chỗ.
 */
export function courseFallback(
  prevSmoothed: number | null,
  courseDeg: number | null,
): number | null {
  if (courseDeg === null || !Number.isFinite(courseDeg)) return prevSmoothed;
  return smoothHeading(prevSmoothed, courseDeg, SMOOTHING);
}
