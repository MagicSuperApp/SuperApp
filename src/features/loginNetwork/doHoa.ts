// features/loginNetwork/doHoa.ts
//
// Dựng các đối tượng three.js cho màn đăng nhập mạng lưới. Tách khỏi màn hình vì
// nó dài, và vì nó là thứ DUY NHẤT trong màn phải nói tiếng OpenGL — mọi thứ còn
// lại (mô phỏng, luồng sinh trắc) không cần biết ở đây có shader.
//
// ── Bốn lớp, vẽ theo đúng thứ tự này ────────────────────────────────────────
//   (nền)  KHÔNG có lớp nào — nền là màu XOÁ NỀN của mặt vẽ, một màu phẳng.
//          Bản trước dựng một tấm phủ kín màn với shader chuyển sắc + rìa tối;
//          nay yêu cầu là "xanh lá thuần, không gradient", mà cách phẳng nhất để
//          ra một màu phẳng là đừng vẽ gì cả — không tấm, không shader, nên cũng
//          không có chỗ nào cho các vòng tròn đồng tâm (banding) lọt ra.
//   vet    vệt sáng các chấm để lại khi đi nhanh, tan trong khoảng một phần sáu giây
//   duong  các dây nối giữa chấm gần nhau
//   cham   ~100 chấm, mỗi chấm một quầng sáng trắng
//
// NÚT sinh trắc KHÔNG còn ở đây. Bản trước vẽ nó bằng hình học three.js — đĩa,
// vành, và một hình vân tay dựng từ năm cung tròn. Nay nó là một thành phần
// React Native bình thường nằm đè lên mặt vẽ (`LoginNetworkScreen#NutSinhTrac`),
// vì hai thứ mà hình học tự vẽ không làm nổi:
//   · BIỂU TƯỢNG THẬT. Năm cung tròn chỉ GỢI ra dấu vân tay; bộ biểu tượng của
//     app có sẵn hình đúng, và người dùng đã quen hình đó ở mọi màn khác.
//   · VIỀN dày đều. `LineBasicMaterial.linewidth` bị OpenGL ES làm ngơ, nên viền
//     GL phải dựng bằng một vành mesh; `borderWidth` của RN thì chỉ là một số.
//
// ── Vì sao TRỘN CỘNG (additive) ở cả ba lớp ─────────────────────────────────
// Yêu cầu: *"vùng nào càng nhiều node thì càng sáng"*. Với trộn cộng, hai quầng
// chồng lên nhau thì màu CỘNG vào nhau — chỗ đông chấm tự sáng lên, không cần
// đếm mật độ, không cần một lượt vẽ thứ hai.
//
// ── Vì sao `depthWrite: false` ở các lớp phát sáng ──────────────────────────
// Chúng trong suốt và chồng lên nhau. Ghi vào bộ đệm độ sâu thì mảnh vẽ trước
// che mảnh vẽ sau, và hai quầng chồng nhau cho ra một hình bán nguyệt bị cắt
// ngọt — trông như lỗi kết xuất chứ không như ánh sáng.

import * as THREE from 'three';

export interface BangMau {
  /** Lõi chấm: trắng. */
  loi: string;
  /** Quầng quanh chấm, dây nối và vệt. */
  quang: string;
}

/** Số mẫu vị trí giữ lại cho mỗi chấm để vẽ vệt. Ở 60 khung/giây, 10 mẫu là vệt
 *  dài khoảng một phần sáu giây — "vệt sáng nhẹ, biến mất nhanh". */
const MAU_VET = 10;

/**
 * Cỡ cơ bản của một chấm, tính bằng pixel bố cục — đường kính cả QUẦNG, không
 * phải lõi. Lõi chỉ chiếm khoảng một phần năm bán kính (xem `MANH_CHAM`), phần
 * còn lại là ánh sáng.
 *
 * Lớp bụi nhỏ hơn hẳn: nó đông bằng lớp thường và bay nhanh gấp bội, nên để
 * cùng cỡ là nó át mất mạng lưới. Nhỏ và nhanh đọc ra là bụi; to và nhanh đọc
 * ra là mạng lưới đang loạn.
 */
export const CO_CHAM = 38;
export const CO_CHAM_NHANH = 17;

/** Đoạn vệt dài hơn mức này bị bỏ: đó không phải chuyển động mà là một cú nhảy
 *  (đổi khung, dựng lại mạng), và vẽ nó ra là một tia sáng quét ngang màn. */
const VET_TOI_DA = 90;

export interface DoHoa {
  goc: THREE.Group;
  /** Tỉ lệ điểm ảnh của mặt vẽ. Chỉ lớp chấm cần, để quy `gl_PointSize`. */
  datDpr: (dpr: number) => void;
  /** Bộ đệm vị trí chấm — ghi thẳng vào, rồi gọi `xongCham`. */
  viTriCham: Float32Array;
  sangCham: Float32Array;
  xongCham: () => void;
  /**
   * Bộ đệm CỠ của từng chấm, tính bằng pixel bố cục — ghi thẳng vào, rồi gọi
   * `xongCo`. Cỡ đến từ mô phỏng (`Nut.co` × cỡ cơ bản của lớp) chứ không bốc
   * tại chỗ, vì hai lớp chấm có hai dải cỡ khác nhau và chỉ mô phỏng biết chấm
   * nào thuộc lớp nào.
   *
   * Đây là thuộc tính TĨNH: ghi một lần lúc dựng mạng, không phải mỗi khung
   * hình. `xongCo` tách riêng khỏi `xongCham` chính là để khỏi nạp lại nó 60
   * lần mỗi giây cho một mảng không đổi.
   */
  coCham: Float32Array;
  xongCo: () => void;
  /** Bộ đệm dây nối — ghi thẳng vào, rồi gọi `xongDuong(soDuong)`. */
  viTriDuong: Float32Array;
  sangDuong: Float32Array;
  xongDuong: (soDuong: number) => void;
  /** Đẩy vị trí hiện tại vào vệt và dựng lại lớp vệt. Gọi sau `xongCham`. */
  ghiVet: () => void;
  huy: () => void;
}

// ── Chấm: lõi đặc + quầng sáng ──────────────────────────────────────────────

const DINH_CHAM = /* glsl */ `
  attribute float aSang;
  attribute float aCo;
  varying float vSang;
  uniform float uDpr;
  void main() {
    vSang = aSang;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // gl_PointSize tính bằng pixel VẬT LÝ, còn mọi toạ độ khác ở đây là pixel bố
    // cục — nhân dpr, nếu không thì chấm teo lại đúng bằng lần tỉ lệ màn hình.
    gl_PointSize = aCo * uDpr;
    gl_Position = projectionMatrix * mv;
  }
`;

const MANH_CHAM = /* glsl */ `
  precision mediump float;
  varying float vSang;
  uniform vec3 uLoi;
  uniform vec3 uQuang;

  void main() {
    float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
    if (r > 1.0) discard;
    float loi = smoothstep(0.22, 0.0, r);
    float quang = pow(1.0 - r, 3.0);
    float a = loi * 0.85 + quang * 0.22;
    vec3 col = mix(uQuang, uLoi, loi);
    // Chấm đã được làn sáng thắp thì vừa sáng hơn vừa trắng hơn.
    gl_FragColor = vec4(mix(col, uLoi, vSang * 0.7), a * (0.42 + 0.58 * vSang));
  }
`;

// ── Dây nối và vệt — cùng một cặp shader ────────────────────────────────────

const DINH_DUONG = /* glsl */ `
  attribute float aSang;
  varying float vSang;
  void main() {
    vSang = aSang;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MANH_DUONG = /* glsl */ `
  precision mediump float;
  varying float vSang;
  uniform vec3 uMau;
  uniform vec3 uLoi;
  void main() {
    gl_FragColor = vec4(mix(uMau, uLoi, vSang), vSang);
  }
`;

// ── Dựng ────────────────────────────────────────────────────────────────────

/**
 * `soNoi` là số chấm CÓ THỂ NỐI DÂY, mặc định bằng `soNut`.
 *
 * Tách khỏi `soNut` vì lớp bụi không nối dây (xem `duyetCanh` ở `mangLuoi.ts`):
 * cấp phát dây theo tổng số chấm là giữ không bốn lần chỗ cần — với 200 chấm là
 * gần nửa megabyte bộ đệm không bao giờ có ai ghi vào.
 */
export function dungDoHoa(soNut: number, mau: BangMau, soNoi = soNut): DoHoa {
  const goc = new THREE.Group();
  const bo: Array<{ dispose: () => void }> = [];
  const giu = <T extends { dispose: () => void }>(x: T): T => {
    bo.push(x);
    return x;
  };

  const cLoi = new THREE.Color(mau.loi);
  const cQuang = new THREE.Color(mau.quang);

  // ── Vệt ───────────────────────────────────────────────────────────────────
  const doanVet = MAU_VET - 1;
  const viTriVet = new Float32Array(soNut * doanVet * 2 * 3);
  const sangVet = new Float32Array(soNut * doanVet * 2);
  // Vòng đệm các vị trí đã qua. `daMoi` để mồi cả vòng bằng vị trí đầu tiên —
  // không mồi thì khung hình đầu vẽ 100 tia chạy từ gốc toạ độ ra.
  const vongX = new Float32Array(soNut * MAU_VET);
  const vongY = new Float32Array(soNut * MAU_VET);
  let dinhVet = 0;
  let daMoi = false;

  const hhVet = giu(new THREE.BufferGeometry());
  hhVet.setAttribute('position', new THREE.BufferAttribute(viTriVet, 3));
  hhVet.setAttribute('aSang', new THREE.BufferAttribute(sangVet, 1));
  const vlVet = giu(
    new THREE.ShaderMaterial({
      vertexShader: DINH_DUONG,
      fragmentShader: MANH_DUONG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMau: { value: cQuang.clone() }, uLoi: { value: cLoi.clone() } },
    }),
  );
  const vet = new THREE.LineSegments(hhVet, vlVet);
  vet.frustumCulled = false;
  vet.renderOrder = 1;
  goc.add(vet);

  // ── Dây nối ───────────────────────────────────────────────────────────────
  // Sức chứa = mọi cặp có thể có. Cấp phát MỘT LẦN: cấp lại mỗi khung hình là
  // ép bộ thu gom rác chạy giữa lúc đang vẽ, và nó hiện ra thành giật đều đặn.
  const toiDaDuong = (soNoi * (soNoi - 1)) / 2;
  const viTriDuong = new Float32Array(toiDaDuong * 2 * 3);
  const sangDuong = new Float32Array(toiDaDuong * 2);
  const hhDuong = giu(new THREE.BufferGeometry());
  hhDuong.setAttribute('position', new THREE.BufferAttribute(viTriDuong, 3));
  hhDuong.setAttribute('aSang', new THREE.BufferAttribute(sangDuong, 1));
  const vlDuong = giu(
    new THREE.ShaderMaterial({
      vertexShader: DINH_DUONG,
      fragmentShader: MANH_DUONG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uMau: { value: cQuang.clone() }, uLoi: { value: cLoi.clone() } },
    }),
  );
  const duong = new THREE.LineSegments(hhDuong, vlDuong);
  duong.frustumCulled = false;
  duong.renderOrder = 2;
  goc.add(duong);

  // ── Chấm ──────────────────────────────────────────────────────────────────
  const viTriCham = new Float32Array(soNut * 3);
  const sangCham = new Float32Array(soNut);
  // Cỡ do nơi gọi ghi vào (xem `coCham` ở giao diện). Mồi bằng cỡ cơ bản của lớp
  // thường để một khung hình lỡ vẽ trước khi cỡ kịp ghi vẫn ra chấm, không ra
  // một màn đen — `gl_PointSize = 0` là chấm biến mất, không phải chấm nhỏ.
  const coCham = new Float32Array(soNut).fill(CO_CHAM);
  const hhCham = giu(new THREE.BufferGeometry());
  hhCham.setAttribute('position', new THREE.BufferAttribute(viTriCham, 3));
  hhCham.setAttribute('aSang', new THREE.BufferAttribute(sangCham, 1));
  hhCham.setAttribute('aCo', new THREE.BufferAttribute(coCham, 1));
  const vlCham = giu(
    new THREE.ShaderMaterial({
      vertexShader: DINH_CHAM,
      fragmentShader: MANH_CHAM,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uLoi: { value: cLoi.clone() },
        uQuang: { value: cQuang.clone() },
        uDpr: { value: 1 },
      },
    }),
  );
  const cham = new THREE.Points(hhCham, vlCham);
  cham.frustumCulled = false;
  cham.renderOrder = 3;
  goc.add(cham);

  return {
    goc,
    viTriCham,
    sangCham,
    viTriDuong,
    sangDuong,

    datDpr(dpr) {
      vlCham.uniforms.uDpr.value = dpr;
    },

    coCham,

    xongCham() {
      hhCham.attributes.position.needsUpdate = true;
      hhCham.attributes.aSang.needsUpdate = true;
    },

    xongCo() {
      hhCham.attributes.aCo.needsUpdate = true;
    },

    xongDuong(soDuong) {
      hhDuong.setDrawRange(0, soDuong * 2);
      hhDuong.attributes.position.needsUpdate = true;
      hhDuong.attributes.aSang.needsUpdate = true;
    },

    ghiVet() {
      // Mồi cả vòng đệm bằng vị trí hiện tại ở lần gọi đầu.
      if (!daMoi) {
        for (let i = 0; i < soNut; i++) {
          for (let j = 0; j < MAU_VET; j++) {
            vongX[i * MAU_VET + j] = viTriCham[i * 3];
            vongY[i * MAU_VET + j] = viTriCham[i * 3 + 1];
          }
        }
        daMoi = true;
      }

      dinhVet = (dinhVet + 1) % MAU_VET;
      for (let i = 0; i < soNut; i++) {
        vongX[i * MAU_VET + dinhVet] = viTriCham[i * 3];
        vongY[i * MAU_VET + dinhVet] = viTriCham[i * 3 + 1];
      }

      let k = 0;
      for (let i = 0; i < soNut; i++) {
        const nen0 = i * MAU_VET;
        for (let j = 0; j < doanVet; j++) {
          // Đi từ mẫu CŨ NHẤT tới mẫu mới nhất. Mẫu cũ nhất nằm ngay sau đỉnh.
          const a = (dinhVet + 1 + j) % MAU_VET;
          const c = (dinhVet + 2 + j) % MAU_VET;
          const ax = vongX[nen0 + a];
          const ay = vongY[nen0 + a];
          const cx = vongX[nen0 + c];
          const cy = vongY[nen0 + c];
          const dai = Math.hypot(cx - ax, cy - ay);
          if (dai > VET_TOI_DA) continue;

          // Độ đậm = (đi nhanh tới đâu) × (gần đầu vệt tới đâu). Chấm đứng yên
          // cho `dai = 0` nên vệt tắt hẳn — vệt chỉ hiện khi chấm ĐANG đi.
          const nhanh = Math.min(dai / 9, 1);
          const gan = (j + 1) / doanVet;
          const a2 = nhanh * gan * gan * 0.5;

          const p = k * 6;
          viTriVet[p] = ax;
          viTriVet[p + 1] = ay;
          viTriVet[p + 2] = 0;
          viTriVet[p + 3] = cx;
          viTriVet[p + 4] = cy;
          viTriVet[p + 5] = 0;
          // Mờ dần về phía đuôi: đầu đoạn nhạt hơn cuối đoạn.
          sangVet[k * 2] = a2 * ((j + 0.5) / doanVet);
          sangVet[k * 2 + 1] = a2;
          k++;
        }
      }
      hhVet.setDrawRange(0, k * 2);
      hhVet.attributes.position.needsUpdate = true;
      hhVet.attributes.aSang.needsUpdate = true;
    },

    huy() {
      for (const x of bo) x.dispose();
    },
  };
}
