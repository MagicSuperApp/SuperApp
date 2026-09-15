// components/genie/edgeWaveShader.ts
//
// MÃ NGUỒN SHADER của hiệu ứng viền, tách khỏi component.
// Sinh ra từ `edgeWaveMath.ts` — không gõ lại một con số nào.
//
// ── VÌ SAO TÁCH ─────────────────────────────────────────────────────────────
// `EdgeWaveGL.tsx` import `expo-gl`, nên không bài kiểm nào nạp được nó: jest sẽ
// chết ở chính cái module native mà cả `EdgeWave.tsx` phải dò bằng try/catch.
// Shader nằm trong đó thì nó KHÔNG KIỂM ĐƯỢC — và một shader không kiểm được là
// một shader chỉ hỏng trên máy thật.
//
// Đã trả giá đúng một lần: đổi chữ ký `ribbonAt` (thêm tham số) mà quên đổi hai
// chỗ gọi. `tsc` không thấy gì — với TypeScript thì cả khối chỉ là một chuỗi.
// Lỗi chỉ nổ lúc `compileShader` trên máy, và vì `GLErrorBoundary` bắt nó nên
// app không sập: nó lặng lẽ rơi về bản dự phòng, người ta tưởng máy mình yếu.
//
// ⚠ CẢ KHỐI SHADER NẰM TRONG MỘT TEMPLATE LITERAL. Chú thích GLSL bên trong viết
//   KHÔNG DẤU HUYỀN-NGƯỢC: một dấu huyền-ngược ở đó cắt đứt chuỗi, và lỗi báo ở
//   một dòng hoàn toàn khác. Bài kiểm canh điều này.

import {
  EDGE_NAMES, EDGE_REGIONS, BASE_ENERGY, BREATH_AMP, BREATH_FREQ, BREATH_SPREAD,
  RIBBONS, RIBBON_PHASE_RIGHT, RIBBON_HALO_SCALE, RIBBON_HALO_WEIGHT,
  CENTER_WAVES,
  COILS,
  COIL_CALM,
  coilCycles,
  type EdgeName,
} from './edgeWaveMath';

export const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const f = (n: number) => n.toFixed(4);

/** Tên hàm GLSL cho một cạnh: `top` → `waveTop`. */
const fnOf = (e: EdgeName) => `wave${e[0].toUpperCase()}${e.slice(1)}`;

/**
 * Sinh một hàm sóng cho MỘT cạnh, từ bảng vùng của cạnh đó.
 *
 * Mỗi cạnh một hàm riêng chứ không một hàm dùng chung nhận mảng: GLSL ES 1.0 chỉ
 * cho chỉ số mảng là hằng, nên "một hàm dùng chung" sẽ phải bung vòng lặp bằng
 * tay — tức là vẫn sinh mã, chỉ khó đọc hơn.
 */
function edgeFn(edge: EdgeName): string {
  const terms = EDGE_REGIONS[edge]
    .map((r) => {
      const w = `exp(-0.5 * pow((u - ${f(r.center)}) / ${f(r.spread)}, 2.0))`;
      const osc = `sin(TAU * ${f(r.freq)} * uTime + ${f(r.phase)})`;
      return `  s += ${w} * ${f(r.amp * r.bright)} * ${osc};`;
    })
    .join('\n');

  return `float ${fnOf(edge)}(float u) {
  float s = 0.0;
${terms}
  // Nhip tho nen: giu vien SONG ca khi im lang. Vien dung im doc thanh "app treo".
  float breath = ${f(BREATH_AMP)} * sin(TAU * ${f(BREATH_FREQ)} * uTime + u * ${f(BREATH_SPREAD)});
  return (${f(BASE_ENERGY)} + uLevel) * s + breath;
}`;
}

/** Sinh các lời gọi dải sáng cho hai cạnh dọc. */
const ribbonCalls = RIBBONS.map((r, i) => {
  const a = [r.base, r.amp, r.freq, r.speed, r.width].map(f).join(', ');
  // Lech pha cua canh phai di vao THAM SO PHA, KHONG cong vao toa do doc.
  const lech = RIBBON_PHASE_RIGHT[i].toFixed(4);
  return `  rb = max(rb, ribbonAt(xnL, yn, 0.0, ${a}));\n`
       + `  rb = max(rb, ribbonAt(xnR, yn, ${lech}, ${a}));`;
}).join('\n');

export const FRAG = `
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform float uLevel;
uniform float uAlpha;
uniform float uW;
uniform float uSpan;
uniform float uRibbon;
uniform vec3  uColor;
uniform vec3  uRibbonColor;
// Dai song giua man: tam theo truc doc va nua chieu cao, tinh bang diem anh VAT LY.
// Vi tri do tu bo cuc React, khong gia dinh o day — cum song phai nam dung cho ma
// bo cuc danh cho no, ke ca khi ban phim bung len.
uniform float uWaveCy;
uniform float uWaveH;
uniform float uWaveOn;
uniform float uCoil;      // 0 = dai ngang · 1 = vong tron
uniform float uCoilR;     // ban kinh nen (px)

const float TAU = 6.28318530718;
const float PI  = 3.14159265359;

${EDGE_NAMES.map(edgeFn).join('\n\n')}

// Be rong quang sang tai mot diem, tu bien do song o do.
float widthOf(float a) {
  // Kep ve [0,1] roi moi nhan: be rong AM la vo nghia, va exp(-d/w) voi w<=0 cho
  // ra NaN loang khap khung hinh — tren may that no hien thanh ca man xanh dac.
  float k = clamp(0.5 + 0.5 * a, 0.0, 1.0);
  return max(uW + uSpan * k, 1.0);
}

// Mot DAI SANG UON LUON doc theo mot canh doc.
//
// Tham so phase la THAM SO RIENG, KHONG duoc cong vao yn: fade tinh tu clamp(yn),
// nen cong pha vao do se day fade ve 0 va tat han canh phai.
float ribbonAt(float xn, float yn, float phase, float base, float amp, float freq, float speed, float w) {
  float cx = base + amp * sin(TAU * (freq * yn + speed * uTime + phase));
  float d  = xn - cx;
  // Hai lop: LOI manh va sac, cong mot QUANG rong gap may lan va mo hon. Chi co
  // loi thi dai trong nhu mot soi day ve bang but chi; quang la thu lam no ra
  // anh sang.
  float core = exp(-(d*d) / (2.0*w*w));
  float hw   = w * ${RIBBON_HALO_SCALE.toFixed(2)};
  float halo = exp(-(d*d) / (2.0*hw*hw)) * ${RIBBON_HALO_WEIGHT.toFixed(2)};
  // Mo dan o hai dau: cat cut o mep tren/duoi trong nhu mot vet xuoc.
  float fade = sin(PI * clamp(yn, 0.0, 1.0));
  return (core + halo) * fade;
}

const float COIL_CALM = ${f(COIL_CALM)};

// Mot DAI SONG SIN giua man hinh — HAI DANG, hoa bang uCoil.
//
//   uCoil = 0  dai ngang. Bao hinh = chuong quanh diem tu NHAN kep (1 - u*u), de
//              dai tat han o hai mep; thieu kep thi duoi dai con mot vet mo chay
//              toi sat mep man, trong nhu mot net ve bi cat cut.
//   uCoil = 1  VONG TRON. Moi vong mot ban kinh, mot toc do, mot CHIEU xoay —
//              day la dang "dang nghi", thay cho dong chu "Em dang xu ly...".

float centerWave(float px, float py, float focus, float sigma, float amp,
                 float freq, float speed, float phase,
                 float w, float halo, float haloW, float bright,
                 float coilR, float spin, float cycles, float envK) {
  float u = (px / max(uRes.x, 1.0)) * 2.0 - 1.0;
  float dd = (u - focus) / sigma;
  float env = exp(-dd*dd) * max(0.0, 1.0 - u*u);

  // San 0.12: song phang li khi im lang doc thanh "tat", khong thanh "dang cho".
  // Nhe dan khi cuon vao — giu nguyen bien do thi vong tron rang cua nhu banh rang.
  float bien = (0.12 + 0.88 * uLevel) * amp * mix(1.0, COIL_CALM, uCoil);

  // ── DANG THANG ──────────────────────────────────────────────────────────
  float yS = uWaveCy + uWaveH * bien * env * sin(TAU * (freq * u - speed * uTime) + phase);
  float dS = abs(py - yS);

  // ── DANG VONG ───────────────────────────────────────────────────────────
  // Toa do CUC quanh tam dai. Khoang cach toi duong cong = |r - r(goc)|, dung y
  // nhu |py - y(u)| o dang thang — nen hai ben hoa duoc voi nhau o muc KHOANG
  // CACH, khong phai o muc hinh dang. Hoa hinh dang thi giua chung khong con la
  // mot duong cong nao ca.
  float qx = px - uRes.x * 0.5;
  float qy = py - uWaveCy;
  float r  = length(vec2(qx, qy));
  // Bo goc xoay rieng cua vong nay ra truoc: "goc cua diem anh nay, trong he quy
  // chieu DANG QUAY cua vong".
  float th = atan(qy, qx) - TAU * spin * uTime;

  // HAI DAU SONG NOI LIEN. Doan thang co hai dau; vong tron thi hai dau ay GAP
  // NHAU, nen gia tri va do doc tai hai dau deu phai bang nhau — khong thi cho
  // gap la mot moi noi chay vong quanh theo nhip xoay.
  //
  // Dieu kien: so chu ky quanh vong (cycles) la SO NGUYEN. Khi do
  //   sin(N*(+PI) + p) = (-1)^N * sin p = sin(N*(-PI) + p)   -> noi lien
  //   dao ham hai dau cung bang nhau                          -> noi MUOT
  // KHONG con phep gap uc ve [-1,1): chinh phep gap do la cho tao ra moi noi.
  float sC = sin(cycles * th - TAU * speed * uTime + phase);

  // Bao hinh theo GOC, nen no TU TUAN HOAN. Mot bao hinh theo u se nhay o cho u
  // gap vong — moi noi van con, chi chuyen tu pha song sang do sang.
  // (1 - cos d) la "khoang cach binh phuong" cua duong tron.
  float envC = 0.45 + 0.55 * exp(-(1.0 - cos(th - PI * focus)) * envK);

  float rC = coilR + uWaveH * bien * envC * sC;
  float dC = abs(r - rC);

  float d = mix(dS, dC, uCoil);
  float e = mix(env, envC, uCoil);

  float core = exp(-(d*d) / (2.0*w*w));
  float hw = w * halo;
  float glow = exp(-(d*d) / (2.0*hw*hw)) * haloW;
  return (core + glow) * bright * e;
}

void main() {
  float x = gl_FragCoord.x;
  float y = uRes.y - gl_FragCoord.y;   // lat truc: GL dem tu duoi, man hinh tu tren
  float fx = x / max(uRes.x, 1.0);
  float fy = y / max(uRes.y, 1.0);

  // Bon canh tinh RIENG roi lay max, thay vi tim canh gan nhat roi tinh mot lan.
  // Cach sau re hon mot chut nhung de lai DUONG NOI o bon goc — mat bat duoc ngay
  // vi goc la noi hai dai sang gap nhau.
  float gT = exp(-max(y, 0.0)            / widthOf(${fnOf('top')}(fx)));
  float gB = exp(-max(uRes.y - y, 0.0)   / widthOf(${fnOf('bottom')}(fx)));
  float gL = exp(-max(x, 0.0)            / widthOf(${fnOf('left')}(fy)));
  float gR = exp(-max(uRes.x - x, 0.0)   / widthOf(${fnOf('right')}(fy)));

  float g = max(max(gT, gB), max(gL, gR));

  // Dai uon luon — CHI hai canh doc. Canh tren bi tai tho va thanh trang thai cat
  // vun, canh duoi la cho dat cum nut; them duong uon vao hai cho do la them nhieu.
  float xnL = fx;
  float xnR = 1.0 - fx;
  float yn  = fy;
  float rb = 0.0;
${ribbonCalls}
  rb = rb * uRibbon;

  // Cum song giua man — su hien dien cua Tro ly.
  //
  // Chan som theo chieu doc: cum song chi chiem mot dai ngang, con day la mot
  // luot ve PHU CA MAN. Khong chan thi moi diem anh o goc man cung phai tinh ba
  // dai song — dat nhat trong ca shader, cho mot ket qua luon bang 0.
  float cw = 0.0;
  // Khi CUON, ba vong vuon xa hon han mot dai ngang, nen phai noi chan ra theo
  // ban kinh — khong thi vong lon nhat bi cat cut o tren va duoi, va no chi cat o
  // dung luc dang cuon.
  if (uWaveOn > 0.001
      && abs(y - uWaveCy) < mix(uWaveH * 1.6 + 48.0, uCoilR + uWaveH * 1.2 + 48.0, uCoil)) {
${CENTER_WAVES.map((w, i) => {
  const a = [w.focus, w.sigma, w.amp, w.freq, w.speed, w.phase, w.widthPx, w.halo, w.haloWeight, w.bright]
    .map(f).join(', ');
  // Ban kinh + chieu xoay RIENG cho tung vong: ba vong cung thong so se chong
  // khit len nhau va doc thanh MOT vong day.
  // Ban kinh + chieu xoay RIENG, cong so chu ky NGUYEN va do rong bao hinh —
  // ca bon deu sinh tu `edgeWaveMath`, khong go lai mot con so nao.
  const c = `uCoilR * ${f(COILS[i].radius)}, ${f(COILS[i].spin)}, `
    + `${f(coilCycles(i))}, ${f(0.7 / (w.sigma * w.sigma))}`;
  return `    cw += centerWave(x, y, ${a}, ${c});`;
}).join('\n')}
    cw = cw * uWaveOn;
  }

  // HAI nguon sang, HAI mau: quang vien mang mau thuong hieu, dai uon mang mau
  // trang-xanh. Hoa theo TI TRONG dong gop chu khong lay mau cua ben manh hon —
  // lay theo ben manh hon thi cho giao nhau doi mau dot ngot thanh mot duong vien.
  // Cum song giua man mang mau SANG nhu dai uon: no la net chinh cua man hinh,
  // ve bang mau nen thi no chim vao nen.
  float sang = rb + cw;
  float tong = g + sang;
  vec3 col = tong > 0.0001 ? (uColor * g + uRibbonColor * sang) / tong : uColor;

  // Dai duoc CONG THEM do sang (bloom) chu khong chi lay max: quang bloom phai
  // chong len quang vien, khong thay the no.
  float a = clamp(max(max(g, rb), cw) + rb * 0.30 + cw * 0.35, 0.0, 1.0);

  gl_FragColor = vec4(col, a * uAlpha);
}
`;
