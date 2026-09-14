// screens/BannerCard.tsx
//
// MỘT tấm băng của Trang chủ: ảnh bên trái, tan vào màu module, chữ bên phải.
//
// ── Vì sao tách khỏi `HomeScreen` ───────────────────────────────────────────
// Ba lượt sửa liên tiếp (14/09) đều là sửa CON SỐ BỐ CỤC — bề ngang khung ảnh,
// vạch chữ, mốc đặc màu — và không lượt nào kiểm được: các số ấy nằm trong
// `StyleSheet.create` ở giữa một tệp 1.400 dòng, muốn dựng ra để đo thì phải
// dựng cả Trang chủ kèm store, nav và mười thứ khác.
//
// Nay chúng đi qua `boCucBang()` — một hàm THUẦN nhận bề ngang × chiều cao thẻ
// và trả về đủ bộ số — còn thẻ là một thành phần dựng được một mình. Sửa số nào
// cũng có chỗ để hỏi "nó thật sự ra bao nhiêu", thay vì phải chạy app rồi nhìn.

import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { NEUTRAL } from '../shared/theme';
import { ScrimWash, mocDacAnToan } from '../shared/components/SoftGradient';
import type { TamBang } from './homeBanners';

// ── Các con số của bố cục ───────────────────────────────────────────────────

/**
 * Góc của dải chuyển sắc.
 *
 * 90 là ngang phẳng — mốc đặc màu khi ấy là một đường DỌC chạy hết chiều cao
 * thẻ, và một đường dọc thì đọc ra một mối ghép. Lệch 10° là đủ để nó nghiêng
 * mà không thành đường chéo: `gradientUnits` của SVG làm việc trong hộp ĐƠN VỊ,
 * nên trên thẻ rộng gấp hai lần rưỡi chiều cao, 100° hiện ra khoảng 4°.
 */
export const GOC = 100;

/**
 * Vạch chữ — mép trái khối chữ, theo phần bề ngang thẻ.
 *
 * Đẩy dần sang phải qua ba lượt (0,50 → 0,54 → 0,58) theo một yêu cầu lặp lại:
 * cho thấy tấm ảnh nhiều hơn. Rồi kéo NGƯỢC về 0,48, và đây là một ĐÁNH ĐỔI
 * phải nói rõ chứ không phải một lần lùi âm thầm.
 *
 * Lý do: tiêu đề được yêu cầu gấp đôi cỡ chữ (15 → 30). Một thẻ 350 × 140 chỉ
 * có ngần ấy chỗ — cột chữ ở 0,58 rộng 129 px, ở cỡ 30 thì chưa được bốn chữ
 * một dòng. Muốn chữ to thì phải trả bằng bề ngang, không có đường thứ ba.
 *
 * 0,48 cho cột 166 px. Vẫn còn hơn nửa quãng ảnh (ảnh rõ tới ~110 px), nhưng
 * ranh giới lùi lại chừng 35 px so với lượt trước. Muốn giữ ranh giới ở 0,58
 * thì phải hạ cỡ chữ về quãng 20 — hai thứ ấy không cùng lúc có được.
 */
export const CHU_X = 0.48;

/**
 * Tỉ lệ khung ảnh CHỤP (bề ngang / chiều cao).
 *
 * ── Đây là con số đã gây ra "ảnh bị zoom quá to" ───────────────────────────
 * Bản đầu đặt bề ngang khung theo BỀ NGANG THẺ (78% của nó) → 273×140, tức
 * 1,95:1. `cover` lấp đầy khung bằng cách phóng ảnh tới khi cạnh ngắn vừa khung
 * rồi cắt phần thừa, nên khung càng dẹt hơn ảnh thì phóng càng nhiều: ảnh báo
 * 1,5:1 mất 23% chiều cao, hình minh hoạ vuông mất NỬA.
 *
 * Suy từ CHIỀU CAO thẻ thì khung khớp tỉ lệ ảnh và gần như không còn gì để cắt.
 * 1,6 là quãng giữa của ảnh báo (RSS trả từ 3:2 tới 16:9).
 */
export const TI_LE_ANH = 1.6;

/**
 * Tỉ lệ khung HÌNH VẼ. Vuông, vì hình minh hoạ của app là ảnh vuông
 * 2000×2000 — khung vuông là khung khớp tỉ lệ, không cắt gì.
 *
 * ── Khung TRÀN RA NGOÀI thẻ, và vì sao ─────────────────────────────────────
 * Hai lượt trước đều để khung bằng hoặc nhỏ hơn chiều cao thẻ, và cả hai lượt
 * đều bị báo là "không nhìn thấy ảnh đâu". Lý do không nằm ở khung mà nằm
 * TRONG tệp ảnh: hình minh hoạ 2000×2000 có một vành trong suốt khá rộng quanh
 * nét vẽ, nên nét vẽ chỉ chiếm quãng 70% cạnh. Khung 140 px vì thế cho ra một
 * hình chỉ chừng 100 px nằm lọt giữa một thẻ cao 140 — nhỏ, nhạt, và nằm chệch
 * về phía dải chuyển sắc đang làm mờ nó.
 *
 * Nên khung nay RỘNG HƠN thẻ (1,35 lần chiều cao) và tràn đều lên trên xuống
 * dưới; thẻ có `overflow: 'hidden'` nên phần tràn bị cắt gọn. Nét vẽ to lên
 * tương ứng và lấp đầy chiều cao thẻ. Đổi lại, vành trong suốt bị cắt bớt —
 * chính là thứ đáng cắt.
 *
 * Vuông, vì ảnh nguồn vuông: khung khớp tỉ lệ thì không cắt vào nét vẽ.
 */
export const TI_LE_HINH = 1.35;

export interface BoCucBang {
  /** Bề ngang khung ảnh chụp (px). */
  anhW: number;
  /** Bề ngang khung hình vẽ (px). Chiều cao luôn là trọn chiều cao thẻ. */
  hinhW: number;
  /** Mép trái khối chữ (px). */
  chuX: number;
  /** Mốc dải đặc màu, theo phần bề ngang — truyền cho `ScrimWash`. */
  mocDac: number;
  goc: number;
}

/**
 * Bộ số bố cục của một thẻ băng `rong × cao`.
 *
 * Hàm THUẦN, và đó là toàn bộ lý do nó tồn tại: ba lượt sửa vừa rồi đều sửa
 * đúng những con số này, và không lượt nào có chỗ để hỏi chúng ra bao nhiêu.
 */
export function boCucBang(rong: number, cao: number): BoCucBang {
  return {
    anhW: cao * TI_LE_ANH,
    hinhW: cao * TI_LE_HINH,
    chuX: rong * CHU_X,
    // KHÔNG gõ tay: dải nghiêng thì mốc đặc màu là một đường XIÊN, và giữ
    // nguyên vạch chữ cho nó là để một GÓC của khối chữ thò ra ngoài vùng đã
    // đặc, nằm trên ảnh. Xem `mocDacAnToan`.
    mocDac: mocDacAnToan(GOC, CHU_X),
    goc: GOC,
  };
}

// ── Thẻ ─────────────────────────────────────────────────────────────────────

export interface BannerCardProps {
  tam: TamBang;
  rong: number;
  cao: number;
  onPress: (tam: TamBang) => void;
  style?: StyleProp<ViewStyle>;
}

export const BannerCard: React.FC<BannerCardProps> = ({
  tam,
  rong,
  cao,
  onPress,
  style,
}) => {
  const bc = boCucBang(rong, cao);
  const laAnh = tam.kieu === 'anh';

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      accessibilityRole="button"
      accessibilityLabel={`${tam.module}: ${tam.title}`}
      onPress={() => onPress(tam)}
      style={[styles.the, { backgroundColor: tam.color, width: rong, height: cao }, style]}
    >
      {/* Ảnh chạm mép TRÁI. Khung suy từ CHIỀU CAO thẻ × tỉ lệ của loại ảnh —
          khung khớp tỉ lệ thì `cover` không còn gì để cắt. */}
      <Image
        testID="banner-anh"
        source={tam.image}
        // Ảnh chụp neo cả `top` lẫn `bottom` → cao đúng bằng thẻ.
        // Hình vẽ thì vuông và CAO HƠN thẻ, canh giữa theo chiều dọc bằng một
        // `top` ÂM: phần tràn bị `overflow: 'hidden'` của thẻ cắt. Cả hai lối
        // đều không để lại chỗ nào cho một dải hở ngang.
        style={
          laAnh
            ? [styles.anh, { width: bc.anhW }]
            : [
              styles.hinh,
              { width: bc.hinhW, height: bc.hinhW, top: (cao - bc.hinhW) / 2 },
            ]
        }
        // Ảnh chụp có nền, cắt nốt vài phần trăm vào nền thì không mất gì, và
        // đổi lại là không có dải trống nào. Hình vẽ nền trong suốt thì ngược
        // lại: phần dư chỉ lộ màu thẻ, nên thà chừa ra còn hơn cắt vào nhân vật.
        resizeMode={laAnh ? 'cover' : 'contain'}
        accessible={false}
      />

      {/* Ảnh → màu. Đặc màu xong TRƯỚC vạch chữ ở mọi độ cao của thẻ. */}
      <ScrimWash color={tam.color} angle={bc.goc} solidAt={bc.mocDac} />

      {/* ── MỘT bố cục cho cả ba tấm ───────────────────────────────────────
          Nhãn module neo TRÊN, nội dung neo DƯỚI, `space-between` đẩy hai đầu
          ra hai mép. Bản trước canh giữa cả cụm, nên nhãn module nằm cao thấp
          khác nhau tuỳ tấm ấy có mấy dòng chữ — ba tấm trượt qua nhau thì cái
          nhãn nhảy lên nhảy xuống. Neo hai đầu thì nó đứng yên một chỗ, và ba
          tấm đọc ra như ba trang của cùng một mẫu.

          Cỡ chữ CỐ ĐỊNH và GIỐNG NHAU ở cả ba tấm: không `adjustsFontSizeToFit`
          (nó làm cỡ chữ đổi theo độ dài tin), không một bậc chữ riêng cho tấm
          nào. Tin quá dài thì cắt bằng dấu ba chấm — mất phần đuôi, không mất
          cả bậc chữ. */}
      <View testID="banner-chu" style={[styles.chu, { marginLeft: bc.chuX }]}>
        <View style={styles.nhan}>
          <Icon name={tam.icon} size={13} color={NEUTRAL.white} />
          <Text style={styles.module} numberOfLines={1}>
            {tam.module}
          </Text>
        </View>

        <View>
          <Text style={styles.title} numberOfLines={2}>
            {tam.title}
          </Text>
          {tam.sub ? (
            <Text style={styles.sub} numberOfLines={2}>
              {tam.sub}
            </Text>
          ) : null}
          {tam.meta ? (
            <Text style={styles.meta} numberOfLines={1}>
              {tam.meta}
            </Text>
          ) : null}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  /**
   * KHÔNG lề ở thẻ — lề nằm ở khối chữ.
   *
   * Không phải chuyện gu. Trong Yoga, lề của khối cha DỜI cả con nằm tuyệt đối
   * của nó: `top: 0` là mép TRONG của lề. Thẻ có `paddingVertical: 16` thì tấm
   * ảnh và lớp phủ đều thụt vào 16 px trên dưới — ảnh thấp hơn thẻ đúng 32 px,
   * và hai dải ngang trên cùng dưới cùng không có lớp phủ nào. (CSS neo con
   * tuyệt đối vào hộp PADDING, tức bỏ qua lề; Yoga thì không.)
   */
  the: {
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  anh: { position: 'absolute', left: 0, top: 0, bottom: 0 },
  hinh: { position: 'absolute', left: 0 },

  chu: {
    flex: 1,
    paddingRight: 16,
    paddingVertical: 14,
    // Nhãn lên đỉnh, nội dung xuống đáy. Xem chú thích tại chỗ dùng.
    justifyContent: 'space-between',
  },
  nhan: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  module: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: NEUTRAL.white,
  },
  /**
   * MỘT cỡ chữ tiêu đề cho cả ba tấm, và khoảng dòng BÌNH THƯỜNG — 1,3 lần cỡ
   * chữ, đúng quãng mặc định của phông.
   *
   * Hai lượt trước lệch khỏi mức thường ở cả hai chiều và cả hai đều bị báo:
   * `lineHeight: 34` đặt cạnh `adjustsFontSizeToFit` cho khoảng dòng hở toang
   * (RN co `fontSize` nhưng KHÔNG co khoảng dòng — nó là pixel, không phải tỉ
   * lệ), rồi siết về 1,07 lần thì hai dòng dính vào nhau. Cỡ chữ nay cố định
   * nên con số pixel này đúng trở lại, và nó để ở mức thường.
   */
  title: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
    color: NEUTRAL.white,
    letterSpacing: -0.3,
    // Bóng chữ: lớp phủ là SVG và nó chỉ vẽ sau khi đo xong khối cha, nên có
    // một khung hình chưa có nó. Bóng là thứ duy nhất không phụ thuộc vào đó.
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sub: {
    fontSize: 12,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.82)',
    marginTop: 4,
    fontWeight: '500',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  /** Dòng cuối: TÊN BÁO ở tấm tin. */
  meta: {
    fontSize: 10.5,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 5,
    fontWeight: '600',
  },
});
