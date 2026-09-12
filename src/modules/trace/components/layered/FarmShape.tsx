/**
 * FarmShape — vẽ CHÍNH mảnh vườn đó, từ toạ độ thật.
 *
 * ── Vì sao có tệp này ───────────────────────────────────────────────────────
 * Hai ô "Sơ đồ 3D" và "Ranh giới" trước đây là biểu tượng + một dòng chữ. Một
 * biểu tượng bánh răng xoay và chữ "Sơ đồ 3D" nói được đúng một điều: *bấm vào
 * đây sẽ mở một thứ tên là sơ đồ 3D*. Nó không nói vườn này có hình gì, đã vẽ
 * ranh giới chưa, có bao nhiêu cây và chúng nằm đâu — tức là không nói gì mà
 * người mở màn thật sự muốn biết.
 *
 * Ô nay HIỆN THỨ NÓ MỞ. Cùng một mảnh vườn, ba cách nhìn:
 *
 *   flat   nhìn từ trên xuống — đúng thứ màn "Ranh giới" mở ra.
 *   iso    nghiêng và dựng thành đặc, trên nền sáng.
 *   space  KHUNG DÂY quay quanh trục đứng, trên nền TỐI — đúng thứ màn "Sơ đồ
 *          3D" mở ra. Chỉ ba thứ: điểm nối, đường nối, điểm cây. Không mặt tô,
 *          không thành dựng, không bóng.
 *
 * Không nhãn, không biểu tượng. Hình đã là nhãn.
 *
 * ⚠ `space` chỉ đúng trên nền tối. Đặt nó trên nền sáng thì vầng sáng biến mất
 * và hình tụt về một đa giác mờ — xem token `GRADIENT.space`.
 *
 * ── Đây KHÔNG phải bản đồ ───────────────────────────────────────────────────
 * Không có nền bản đồ, không tỉ lệ, không hướng bắc. Nó là một hình BÓNG của
 * mảnh đất, đủ để nhận ra "à, vườn nhà mình hình này". Vẽ bằng SVG từ mảng toạ
 * độ đã có sẵn trong bộ nhớ nên không tốn một lượt gọi mạng nào, không cần
 * chìa khoá bản đồ, và không đợi ô nào tải.
 *
 * ⚠ Phép chiếu ở đây coi kinh-vĩ độ như toạ độ phẳng. Sai số hình dạng theo vĩ
 * độ Việt Nam (~10-23°B) là cỡ vài phần trăm bề ngang — mắt không thấy trên một
 * ô rộng chưa tới nửa màn. Đừng mang hàm này đi đo đạc; nó để NHÌN.
 */

import React from 'react';
import {
  AccessibilityInfo, StyleSheet, View, type StyleProp, type ViewStyle,
} from 'react-native';
import Svg, { Circle, Polygon, Path, G, Defs, RadialGradient, Stop } from 'react-native-svg';

import { NATURE, TONE } from '../../theme/depth';
import {
  chuanHoa, nghieng, noiDiem, phang, viTriCay, vongRanh, xoayNhe,
} from '../../utils/farmShapeGeo';

/** Góc xoay của "không gian" — nhẹ, chỉ để mảnh đất thôi thẳng hàng với mép ô. */
const GOC_XOAY = 14;

/**
 * Màu phát sáng của chế độ `space`.
 *
 * MỘT màu duy nhất cho cả viền, thành, điểm nối và cây — khác nhau chỉ ở độ
 * đục. Nền tối cộng nhiều màu sáng là chỗ mọi thứ bắt đầu trông như đèn nháy;
 * một màu ở nhiều độ đục thì vẫn đọc ra chiều sâu mà giữ được sự tĩnh.
 *
 * Xanh lam-lục sáng: nổi trên nền tối `#123A47` mà không chói, và cùng họ với
 * tông nước của cả module.
 */
const SANG = '#7FE7C4';

/**
 * CHẤM CÂY — xanh lá, và cố ý KHÁC màu khung dây.
 *
 * Khung, điểm nối và thành đều là `SANG` (xanh lam-lục): chúng nói về MẢNH ĐẤT.
 * Cây là thứ khác loại — nó là cái sống trên mảnh đất đó — nên nó phải đọc ra
 * ngay mà không cần chú giải. Hai màu, hai nghĩa; thêm màu thứ ba thì ô bắt đầu
 * thành bảng màu.
 *
 * Hai giá trị vì hai nền:
 *   `LA_TREN_TOI`  xanh lá sáng, tương phản 5,4 với chặng sáng nhất của nền tối.
 *                  Lệch tông rõ so với `SANG` (lá ~130°, lam-lục ~160°) nên hai
 *                  thứ không lẫn vào nhau dù độ sáng gần nhau.
 *   `LA_TREN_SANG` xanh lá đậm của module, tương phản 5,4 trên mặt ô ranh giới.
 */
const LA_TREN_TOI = '#6EDB7A';
const LA_TREN_SANG = NATURE.leaf;

/** Một vòng quay đầy mất bao lâu. Chậm là có chủ ý — xem `useGocXoay`. */
const CHU_KY_MS = 26_000;

/**
 * Nhịp vẽ lại của vòng quay, tính bằng khung/giây.
 *
 * KHÔNG chạy 60fps. Mỗi khung phải tính lại toạ độ của mọi đỉnh và tối đa 60
 * chấm cây RỒI dựng lại cây SVG — việc đó nằm trên luồng JS, cùng luồng với
 * cuộn danh sách và với mọi thứ khác của màn. Ở 12fps chuyển động vẫn liền vì
 * hình quay rất chậm, mà giá chỉ bằng một phần năm.
 */
const NHIP = 12;

/**
 * Góc quay hiện tại của mảnh đất, tính theo đồng hồ.
 *
 * ── Ba thứ đáng nói, vì cả ba đều là chỗ animation gây hại thật ─────────────
 *
 * TẮT KHI NGƯỜI DÙNG XIN TẮT. `AccessibilityInfo.isReduceMotionEnabled` là
 * thiết lập hệ điều hành cho người say chuyển động (vestibular). Bỏ qua nó là
 * làm một nhóm người dùng buồn nôn để đổi lấy một hiệu ứng trang trí. Lúc đó
 * hình đứng yên ở `GOC_XOAY` — vẫn nghiêng, vẫn ra không gian, chỉ không quay.
 *
 * DỌN KHI RỜI MÀN. Không có `clearInterval` thì vòng lặp sống tiếp sau khi màn
 * đóng, gọi `setState` trên một component đã tháo, và ăn CPU nền — trên máy
 * nông dân giữa nắng thì đó là pin.
 *
 * ĐỌC ĐỒNG HỒ, KHÔNG CỘNG DỒN. `goc += 1` mỗi nhịp thì tốc độ quay đổi theo
 * việc máy có kịp vẽ hay không: máy yếu quay chậm hơn máy khoẻ. Suy góc từ
 * `Date.now()` cho tốc độ như nhau ở mọi máy, và một khung bị bỏ lỡ chỉ làm
 * hình nhảy một hơi chứ không làm nó tụt lại vĩnh viễn.
 */
function useGocXoay(bat: boolean): number {
  const [goc, setGoc] = React.useState(GOC_XOAY);

  React.useEffect(() => {
    if (!bat) return;
    let dung = false;
    let id: ReturnType<typeof setInterval> | null = null;

    const chay = () => {
      if (dung) return;
      id = setInterval(() => {
        setGoc(GOC_XOAY + ((Date.now() % CHU_KY_MS) / CHU_KY_MS) * 360);
      }, 1000 / NHIP);
    };

    AccessibilityInfo.isReduceMotionEnabled()
      .then((giamChuyenDong) => {
        if (!giamChuyenDong) chay();
      })
      // Không đọc được thiết lập thì QUAY — mặc định giữ nguyên trải nghiệm cho
      // số đông, và người cần tắt vẫn tắt được ở nấc hệ điều hành khi máy trả
      // lời được. Đây là hiệu ứng trang trí, không phải cổng an toàn.
      .catch(() => chay());

    return () => {
      dung = true;
      if (id) clearInterval(id);
    };
  }, [bat]);

  return goc;
}

export const FarmShape: React.FC<{
  farm: any;
  trees?: readonly any[];
  mode: 'flat' | 'iso' | 'space';
  /**
   * Có ẢNH BẢN ĐỒ nằm dưới hay không (xem `FarmMapBackdrop`).
   *
   * Mặc định `false` — nền là một mảng phẳng, nên mặt vườn tô ĐẶC cho mảnh đất
   * ra hình khối rõ ràng. Bật lên thì mặt hạ xuống gần trong suốt: một mảng
   * xanh đục phủ kín ảnh vệ tinh lấy mất đúng thứ người ta nhìn ảnh vệ tinh để
   * xem — tán cây thật, bờ ruộng, lối đi. Lúc đó ranh giới nói bằng ĐƯỜNG VIỀN,
   * và viền dày thêm một chút để nó không chìm vào nền nhiều chi tiết.
   */
  coNenBanDo?: boolean;
  style?: StyleProp<ViewStyle>;
}> = ({ farm, trees, mode, coNenBanDo = false, style }) => {
  const khongGian = mode === 'space';

  // ⚠ MỌI hook phải đứng TRƯỚC đường thoát sớm ở dưới (`ring.length < 3`). Gọi
  // hook sau nó là số hook đổi giữa hai lượt dựng — và React ném ở lượt vườn
  // VỪA ĐỦ điểm, chứ không phải lượt đang thiếu.
  const quangId = `bloom-${React.useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const goc = useGocXoay(khongGian);

  const ring = vongRanh(farm?.coordinates);
  // Ba điểm mới thành một mảnh đất. Ít hơn thì không có hình để vẽ, và vẽ một
  // hình bịa ra ở đây là nói với người dùng rằng vườn đã có ranh giới.
  if (ring.length < 3) return null;

  const veVi = chuanHoa(ring);
  const khoi = mode !== 'flat';
  // Xoay TRONG MẶT PHẲNG ĐẤT rồi mới nghiêng — đó là chỗ "xoay quanh trục" đến
  // từ đâu: trục đứng của mảnh đất. Xoay sau phép nghiêng thì hình bị vặn phẳng
  // như một tờ giấy quay, không còn ra không gian.
  const xoay = khongGian ? xoayNhe(goc) : (d: ReturnType<typeof veVi>) => d;
  const chieu = khoi ? nghieng : phang;
  const dat = (p: { lat: number; lng: number }) => chieu(xoay(veVi(p)));
  const vien = ring.map(dat);

  const cayTrong = (trees ?? [])
    .map(viTriCay)
    .filter((p): p is NonNullable<typeof p> => p != null)
    .map(dat)
    // Trần 60 chấm: một vườn 400 cây vẽ đủ thì ra một mảng đặc, vừa không đọc
    // được vừa tốn một cây SVG 400 nút cho một ô bằng bàn tay. Ở chế độ `space`
    // trần này còn gánh thêm việc khác: nó là trần cho MỖI KHUNG HÌNH của vòng
    // quay, nên nó quyết định luôn giá của animation.
    .slice(0, 60);

  /**
   * Thành đất dựng xuống — CHỈ cho `iso`.
   *
   * `space` cố ý KHÔNG có: yêu cầu là bỏ đổ bóng, chỉ giữ điểm nối, đường nối
   * và điểm cây. Một mảng đặc dựng xuống chính là cái bóng ấy, chỉ khác tên.
   */
  const day = 13;
  const duongThanh =
    mode === 'iso'
      ? vien
          .map((p, i) => {
            const q = vien[(i + 1) % vien.length];
            // Chỉ dựng thành ở những cạnh NHÌN THẤY được — cạnh mặt trước, tức
            // cạnh đi về phía dưới màn. Dựng cả vòng thì thành che mất mặt trên.
            if (q.x < p.x) return null;
            return `M${p.x},${p.y} L${q.x},${q.y} L${q.x},${q.y + day} L${p.x},${p.y + day} Z`;
          })
          .filter(Boolean)
          .join(' ')
      : '';

  return (
    <View pointerEvents="none" style={[styles.wrap, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        {khongGian ? (
          <Defs>
            {/*
              Quầng BLOOM cho mỗi điểm nối. Vẽ bằng chuyển sắc TOẢ TRÒN từ sáng
              ra trong suốt — đó là cách duy nhất có được vầng sáng mềm trong
              SVG mà không cần bộ lọc làm mờ; `feGaussianBlur` tốn hơn nhiều và
              `react-native-svg` không dựng nó đều nhau giữa hai nền tảng.
            */}
            <RadialGradient id={quangId}>
              <Stop offset="0" stopColor={SANG} stopOpacity={0.55} />
              <Stop offset="0.55" stopColor={SANG} stopOpacity={0.18} />
              <Stop offset="1" stopColor={SANG} stopOpacity={0} />
            </RadialGradient>
          </Defs>
        ) : null}

        {duongThanh ? (
          <Path
            d={duongThanh}
            fill={khongGian ? SANG : NATURE.leafDeep}
            // Thành đất TRONG SUỐT NHẸ ở chế độ không gian: nhìn xuyên được là
            // thứ làm khối đọc ra "không gian" chứ không ra "vật đặc".
            opacity={khongGian ? 0.16 : 0.5}
          />
        ) : null}

        {/*
          ĐƯỜNG NỐI — ở `space` chỉ còn đường, KHÔNG tô mặt.

          Yêu cầu là giữ lại đúng ba thứ: điểm nối, đường nối, điểm cây. Một mặt
          phẳng có tô, dù mờ tới đâu, vẫn là thứ thứ tư — và nó che mất chính
          những chấm cây nằm phía trong. Khung dây để hở thì cây nhìn xuyên qua
          được, và đó cũng là thứ làm hình đọc ra KHÔNG GIAN chứ không ra một
          miếng dán.
        */}
        <Polygon
          points={noiDiem(vien)}
          fill={khongGian ? 'none' : khoi ? NATURE.moss : TONE.primarySoft}
          fillOpacity={khongGian ? 0 : khoi ? 0.9 : coNenBanDo ? 0.22 : 1}
          stroke={khongGian ? SANG : TONE.primary}
          strokeOpacity={khongGian ? 0.92 : 1}
          strokeWidth={khongGian ? 1.2 : khoi ? 1.4 : coNenBanDo ? 2.4 : 1.8}
          strokeLinejoin="round"
        />

        {/*
          ĐIỂM NỐI hiện rõ — chỉ ở chế độ không gian.

          Ở hai chế độ kia, đỉnh đa giác không mang nghĩa gì thêm ngoài hình
          dạng. Ở đây chúng là các mốc người dùng tự đi bộ ghi ngoài vườn, nên
          làm chúng thấy được là nói đúng cái vườn này được dựng bằng gì. Mỗi
          mốc hai lớp: quầng toả rộng, rồi một chấm đặc nhỏ ở tâm.
        */}
        {khongGian ? (
          <G>
            {vien.map((p, i) => (
              <Circle key={`q${i}`} cx={p.x} cy={p.y} r={6.5} fill={`url(#${quangId})`} />
            ))}
            {vien.map((p, i) => (
              <Circle key={`d${i}`} cx={p.x} cy={p.y} r={1.9} fill={SANG} opacity={0.95} />
            ))}
          </G>
        ) : null}

        {/*
          CHẤM CÂY — nhỏ, xanh lá, một chấm một cây.

          Đây là thứ biến hình bóng mảnh đất thành hình VƯỜN: ranh giới nói đất
          rộng bao nhiêu, chấm cây nói trong đó có gì và trồng thưa hay dày. Hai
          ô cùng vẽ, vì cả hai đều mở ra một màn có cây.
        */}
        <G>
          {cayTrong.map((c, i) => (
            <Circle
              key={i}
              cx={c.x}
              // `iso` nâng chấm cây lên 3 để nó đứng TRÊN mặt đã tô. `space`
              // không có mặt nào để đứng lên, nên nâng chỉ làm cây trôi lơ lửng
              // lệch khỏi chỗ thật của nó.
              cy={mode === 'iso' ? c.y - 3 : c.y}
              // Nhỏ, và nhỏ có lý do: một vườn trăm cây mà chấm to thì các chấm
              // dính vào nhau thành một mảng đặc, và lúc đó nó thôi nói được
              // "trồng thưa hay dày" — tức mất đúng cái tin nó mang.
              r={khongGian ? 2 : 1.8}
              fill={khongGian ? LA_TREN_TOI : LA_TREN_SANG}
              // Trên ảnh vệ tinh, một chấm xanh lá nằm giữa tán cây xanh lá thì
              // biến mất. Viền sáng mảnh là thứ tách nó khỏi nền — cùng lý do
              // với viền trắng quanh chấm cây ở màn bản đồ.
              stroke={!khongGian && coNenBanDo ? NATURE.paper : undefined}
              strokeWidth={!khongGian && coNenBanDo ? 0.7 : undefined}
              opacity={khongGian ? 0.9 : 0.9}
            />
          ))}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, alignItems: 'stretch', justifyContent: 'center' },
});

export default FarmShape;
