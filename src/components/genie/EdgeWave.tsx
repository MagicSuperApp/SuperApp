// components/genie/EdgeWave.tsx
//
// CỔNG chọn bản vẽ sóng viền. Hai bản, một giao diện (ARCHITECTURE §8.2).
//
//   EdgeWaveGL   — GLView + fragment shader. Mặc định.
//   EdgeWaveSvg  — react-native-svg. Dự phòng, thô hơn, không cần expo.
//
// ── PHÉP DÒ, VÀ VÌ SAO NÓ PHẢI LÀ `require` ĐỒNG BỘ ────────────────────────
// Dùng lại đúng lối `navigation/index.tsx` đã phải học bằng một lần sập app:
//
//   · KHÔNG kiểm `globalThis.expo` — đó chỉ là dấu hiệu GIÁN TIẾP và có thể lệch
//     với việc expo-gl thật sự nạp được hay không.
//   · KHÔNG `React.lazy(() => import(...))` — nếu `expo-modules-core` ném lúc
//     module-eval thì ở bản RELEASE lỗi đi qua `ExceptionsManager.reportException`
//     và **tự crash (SIGABRT)** trước khi ErrorBoundary kịp bắt.
//   · `require` ĐỒNG BỘ trong try/catch: ném ở đây là một lỗi JS thường, bị bắt
//     ngay tại chỗ, không qua ExceptionsManager ⇒ không sập app.
//
// Dò MỘT LẦN rồi nhớ. Và chỉ dò khi lớp trợ lý thật sự mở ra — không kéo expo về
// lúc khởi động, vì Lớp Trợ lý được dựng sẵn trong cây ngay từ đầu.

import React from 'react';
import GLErrorBoundary from '../GLErrorBoundary';
import EdgeWaveSvg from './EdgeWaveSvg';
import type { WaveStyle } from './edgeWaveMath';

export interface Props {
  style: WaveStyle;
  /** Màu quầng viền — lấy từ DESIGN TOKEN (Integration-Standard §2.1). */
  color: string;
  /** Màu dải uốn hai cạnh dọc: trắng-xanh, sáng hơn quầng viền. */
  ribbonColor: string;
  /** Chỗ đặt cụm sóng giữa màn, điểm ảnh logic. `null` = tắt. */
  band?: { cy: number; halfH: number } | null;
}

type Renderer = React.ComponentType<Props>;

let probed: Renderer | null | undefined;

/** @returns component GL nếu nạp được, `null` nếu không. */
function glRenderer(): Renderer | null {
  if (probed !== undefined) return probed;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('expo-gl');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    probed = require('./EdgeWaveGL').default as Renderer;
  } catch {
    // Không nạp được KHÔNG phải sự cố cần báo người dùng: bản dự phòng vẫn vẽ
    // được viền. Ghi nhật ký thì có ích, hiện lên màn thì không.
    probed = null;
  }
  return probed;
}

/** Cho bài kiểm: ép dùng bản nào, hoặc xoá kết quả dò. */
export function __setRenderer(r: Renderer | null | undefined): void {
  probed = r;
}

const EdgeWave: React.FC<Props> = (props) => {
  const GL = glRenderer();
  if (!GL) return <EdgeWaveSvg {...props} />;

  // Bọc bằng ErrorBoundary: shader lỗi biên dịch hay GL context chết thì chỉ hỏng
  // KHUNG SÓNG, không kéo theo lớp trợ lý. Người dùng vẫn nói chuyện được — mất
  // hiệu ứng viền là mất trang trí, mất lớp trợ lý là mất tính năng.
  return (
    <GLErrorBoundary tag="genie_edge_wave">
      <GL {...props} />
    </GLErrorBoundary>
  );
};

export default EdgeWave;
