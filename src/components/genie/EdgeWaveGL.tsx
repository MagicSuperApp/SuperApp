// components/genie/EdgeWaveGL.tsx
//
// Sóng viền — bản CANVAS (WebGL qua expo-gl). Bản mặc định (ARCHITECTURE §8.2).
//
// ⚠ TỆP NÀY CHỈ ĐƯỢC `require` SAU KHI ĐÃ DÒ expo-gl. Đừng import tĩnh nó từ bất
//   cứ đâu chạy lúc khởi động.
//
//   Lý do đã trả giá ở `navigation/index.tsx`: nếu native chưa cài `globalThis.expo`
//   thì `expo-modules-core` NÉM ngay lúc module-eval, và ở bản RELEASE lỗi đó đi
//   qua `ExceptionsManager.reportException` rồi **tự crash (SIGABRT)** trước khi
//   bất cứ ErrorBoundary nào kịp bắt — sập CẢ APP. `EdgeWave.tsx` dò bằng
//   `require` đồng bộ trong try/catch rồi mới nạp tệp này.
//
// ── VÌ SAO GL CHỨ KHÔNG PHẢI SVG ────────────────────────────────────────────
// Hiệu ứng cần là một QUẦNG SÁNG LIÊN TỤC quanh viền, nhấp nhô từng mảng. Đó là
// bài toán MỖI ĐIỂM ẢNH, không phải bài toán hình khối. Một fragment shader tính
// "khoảng cách tới viền → độ sáng" chạy trên GPU và JS không phải làm gì mỗi
// khung hình; cùng hiệu ứng dựng bằng SVG là hàng chục path chồng nhau và mỗi
// khung hình một lượt qua cầu JS↔native.

import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';

import type { WaveStyle } from './edgeWaveMath';
import { coilBaseR, coilEase, COIL_MS } from './edgeWaveMath';
// Chuỗi shader ở tệp RIÊNG, không import `expo-gl` — nhờ vậy bài kiểm đọc được
// nó và canh được chữ ký hàm khớp chỗ gọi. Xem đầu `edgeWaveShader.ts`.
import { VERT, FRAG } from './edgeWaveShader';

export interface EdgeWaveProps {
  style: WaveStyle;
  /** Màu quầng viền — lấy từ DESIGN TOKEN, không gõ hex (Integration-Standard §2.1). */
  color: string;
  /** Màu dải uốn: trắng-xanh. Sáng hơn hẳn quầng viền nên nó nổi lên trên. */
  ribbonColor: string;
  /**
   * Chỗ đặt cụm sóng giữa màn, theo điểm ảnh LOGIC (đo từ bố cục React).
   *
   * Vị trí đo từ bố cục chứ không gõ cứng trong shader: cụm sóng phải nằm đúng
   * chỗ mà bố cục dành cho nó, kể cả khi bàn phím bung lên và khu vực giữa co lại.
   * `null` = tắt cụm sóng.
   */
  band?: { cy: number; halfH: number } | null;
}

/** '#22C55E' → [0.13, 0.77, 0.37]. Nhận cả dạng 3 ký tự. */
function hexToRgb(hex: string): [number, number, number] {
  const s = String(hex || '').replace('#', '').trim();
  const full = s.length === 3 ? s.split('').map((ch) => ch + ch).join('') : s;
  const n = parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return [0.13, 0.77, 0.37];
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: any, type: number, src: string): any {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    // Ném để `GLErrorBoundary` bắt và rơi về bản dự phòng. Im lặng ở đây là để
    // lại một khung trong suốt hoàn toàn — trợ lý mở ra mà không có gì thay đổi.
    throw new Error(`shader lỗi: ${gl.getShaderInfoLog(sh)}`);
  }
  return sh;
}

const EdgeWaveGL: React.FC<EdgeWaveProps> = ({ style, color, ribbonColor, band }) => {
  // Giữ tham số trong ref: shader đọc chúng mỗi khung hình, và đổi tham số KHÔNG
  // được dựng lại GL context (dựng lại là một lần chớp đen giữa câu nói).
  const styleRef = useRef(style);
  styleRef.current = style;
  const colorRef = useRef(color);
  colorRef.current = color;
  const ribbonColorRef = useRef(ribbonColor);
  ribbonColorRef.current = ribbonColor;
  /** Tiến độ cuộn ∈ [0,1] — TUYẾN TÍNH; `coilEase` nắn thành đường mượt. */
  const coilP = useRef(0);
  const lastTick = useRef(0);
  const bandRef = useRef(band);
  bandRef.current = band;

  const rafRef = useRef<number | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const onContextCreate = useCallback((gl: any) => {
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`link lỗi: ${gl.getProgramInfoLog(prog)}`);
    }
    gl.useProgram(prog);

    // Một tam giác phủ cả khung, không phải hai tam giác thành hình chữ nhật:
    // rẻ hơn một chút và không có đường chéo nơi hai tam giác gặp nhau.
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'uRes');
    const uTime = gl.getUniformLocation(prog, 'uTime');
    const uLevel = gl.getUniformLocation(prog, 'uLevel');
    const uAlpha = gl.getUniformLocation(prog, 'uAlpha');
    const uW = gl.getUniformLocation(prog, 'uW');
    const uSpan = gl.getUniformLocation(prog, 'uSpan');
    const uRibbon = gl.getUniformLocation(prog, 'uRibbon');
    const uRibbonColor = gl.getUniformLocation(prog, 'uRibbonColor');
    const uWaveCy = gl.getUniformLocation(prog, 'uWaveCy');
    const uWaveH = gl.getUniformLocation(prog, 'uWaveH');
    const uWaveOn = gl.getUniformLocation(prog, 'uWaveOn');
    const uCoil = gl.getUniformLocation(prog, 'uCoil');
    const uCoilR = gl.getUniformLocation(prog, 'uCoilR');
    const uColor = gl.getUniformLocation(prog, 'uColor');

    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Đồng hồ RIÊNG, đếm từ 0 lúc lớp mở ra. Dùng `Date.now()` thì `t` là một số
    // hàng tỉ, và `sin()` ở float32 mất sạch độ phân giải — sóng đứng hình.
    const t0 = Date.now();
    let lastW = -1;

    const draw = () => {
      if (!aliveRef.current) return;
      const s = styleRef.current;
      const [r, g, b] = hexToRgb(colorRef.current);

      // Kích thước khung đổi khi xoay máy / bàn phím bung.
      if (gl.drawingBufferWidth !== lastW) {
        lastW = gl.drawingBufferWidth;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      }

      gl.uniform2f(uRes, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uTime, ((Date.now() - t0) / 1000) * s.speed);
      gl.uniform1f(uLevel, s.level);
      gl.uniform1f(uAlpha, s.alpha);
      // Nhân theo tỉ lệ điểm ảnh: `widthPx` khai theo điểm ảnh LOGIC, còn khung GL
      // đếm điểm ảnh VẬT LÝ. Bỏ bước này thì viền mỏng đi 2–3 lần trên máy nét cao.
      const scale = gl.drawingBufferWidth / Math.max(1, W) || 1;
      gl.uniform1f(uW, s.widthPx * PIXEL_RATIO * scale);
      gl.uniform1f(uSpan, s.spanPx * PIXEL_RATIO * scale);
      gl.uniform1f(uRibbon, s.ribbon);
      gl.uniform3f(uColor, r, g, b);
      const [rr, rg, rb2] = hexToRgb(ribbonColorRef.current);
      gl.uniform3f(uRibbonColor, rr, rg, rb2);

      // Cụm sóng: bố cục đo bằng điểm ảnh LOGIC, khung GL đếm điểm ảnh VẬT LÝ.
      // Bỏ bước quy đổi thì trên máy nét cao cụm sóng nằm lệch lên trên mất một nửa.
      const dai = bandRef.current;
      gl.uniform1f(uWaveOn, dai ? 1 : 0);
      gl.uniform1f(uWaveCy, (dai ? dai.cy : 0) * PIXEL_RATIO * scale);
      const hH = (dai ? dai.halfH : 0) * PIXEL_RATIO * scale;
      gl.uniform1f(uWaveH, hH);
      // Cuộn tròn khi Trợ lý đang nghĩ (§15). `coil` do `genieController` lái và
      // đã qua `coilEase`, nên ở đây chỉ việc chuyển tiếp — chỗ vẽ KHÔNG tự quyết
      // trạng thái, vì nếu nó tự quyết thì có hai nơi cùng biết "đang nghĩ" và
      // hai nơi đó sẽ lệch nhau.
      // Đi TỚI đích, không nhảy tới đích. `dt` thật chứ không giả định 60 fps:
      // máy yếu chạy 30 fps sẽ cuộn chậm đúng gấp đôi, và nó chỉ chậm ở máy đó.
      const gio = Date.now();
      const dt = lastTick.current ? Math.min(100, gio - lastTick.current) : 16;
      lastTick.current = gio;
      const dich = s.coil > 0.5 ? 1 : 0;
      const buoc = dt / COIL_MS;
      coilP.current = dich > 0
        ? Math.min(1, coilP.current + buoc)
        : Math.max(0, coilP.current - buoc);
      gl.uniform1f(uCoil, coilEase(coilP.current));
      gl.uniform1f(uCoilR, coilBaseR(gl.drawingBufferWidth * 0.5, hH));

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.endFrameEXP();
      rafRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, []);

  return (
    <GLView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      onContextCreate={onContextCreate}
    />
  );
};

// `PixelRatio` lấy một lần: nó không đổi trong vòng đời tiến trình.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const PIXEL_RATIO: number = require('react-native').PixelRatio.get();

export default EdgeWaveGL;
