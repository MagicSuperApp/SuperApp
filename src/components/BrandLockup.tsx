/**
 * CỤM NHẬN DIỆN — BA MẢNH RỜI, ghép lại lúc chạy.
 *
 * ── Vì sao không dùng một ảnh gộp nữa ────────────────────────────────────────
 * Trước tệp này, ba màn trước-đăng-nhập vẽ `lockup-on-dark.png`: dấu hiệu và chữ
 * hiệu HÀN vào nhau trong một ảnh. Cách đó rẻ cho tới lúc cần xếp lại — và việc
 * xếp lại là việc thường: có màn muốn [dấu hiệu | chữ hiệu + khẩu hiệu] nằm
 * ngang, có màn muốn chồng dọc. Một ảnh gộp chỉ biết một cách xếp, nên "đổi bố
 * cục" biến thành "vẽ lại một ảnh", và ảnh mới thì không ai đối chiếu được với
 * ảnh cũ.
 *
 * Chỗ hỏng NẶNG hơn là ràng buộc bố cục không giải được: khẩu hiệu phải rộng
 * đúng bằng CHỮ HIỆU, mà trong ảnh gộp không có cách nào biết chữ hiệu bắt đầu
 * và kết thúc ở đâu — nó chỉ là các điểm ảnh. Số đo duy nhất lấy được là bề
 * ngang CẢ CỤM, và căn theo nó thì khẩu hiệu thò ra dưới cả chiếc lá.
 *
 * Nên cụm nay là BA mảnh: dấu hiệu (ảnh) · chữ hiệu (ảnh) · khẩu hiệu (CHỮ, vẫn
 * dịch theo ngôn ngữ đang chọn). Hai ảnh cắt sát hộp mực từ chính ảnh gộp cũ —
 * cùng bộ sinh, cùng phông, cùng cỡ đã giải ra từ bốn ràng buộc bố cục — nên
 * chúng không thể trôi khỏi ảnh trên trang cửa hàng.
 *
 * ── ÂM BẢN, không phải dấu màu ───────────────────────────────────────────────
 * Mọi chỗ dùng cụm này đều là nền lục sẫm, nên hai mảnh đây là bản ÂM: mực
 * TRẮNG trên nền trong suốt. `DEFAULT_INSTANCE.logo` thì KHÔNG dùng được ở đây —
 * đo ra mực lục (CheckFarm ≈ `(60,148,90)`, Aladin ≈ `(74,116,70)`), tức lục
 * trên lục. Nó không biến mất hẳn nên không có gì kêu, nó chỉ mờ đi.
 *
 * ── Một phép đo, không phải hai ──────────────────────────────────────────────
 * Mọi kích thước suy từ CHIỀU CAO DẤU HIỆU theo các tỉ lệ ở `config/brandLockup`,
 * và chiều cao ấy do bố cục quyết (bề rộng khối × tỉ lệ), không do chữ. Nên chữ
 * không đẩy ngược lại kích thước ảnh, và không có vòng đuổi nhau. Phép đo duy
 * nhất còn lại là bề ngang TỰ NHIÊN của câu khẩu hiệu, để giãn nó ra cho vừa —
 * cùng cơ chế `letterSpacing` mà màn đăng nhập vẫn dùng, nay ở một chỗ.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { DEFAULT_INSTANCE } from '../config/instance.config';
import {
  BRAND_MARK_ASPECT,
  BRAND_WORDMARK_ASPECT,
  MARK_TO_WORDMARK_GAP,
  SLOGAN_SHARE,
  WORDMARK_SHARE,
  WORDMARK_TO_SLOGAN_GAP,
} from '../config/brandLockup';
import type { LangCode } from '../i18n/types';
import { NEUTRAL } from '../theme';

/**
 * GIÃN CHỮ cho một dòng rộng đúng bằng một bề ngang cho trước.
 *
 * KHÔNG xuất ra ngoài, và đó là một ranh giới chứ không phải chuyện gọn gàng:
 * phép này phục vụ một RÀNG BUỘC HÌNH HỌC của cụm nhận diện (khẩu hiệu rộng
 * đúng bằng chữ hiệu), nơi người đọc nhìn cả khối như một dấu hiệu. Dùng nó cho
 * một câu bình thường để ĐỌC thì chữ giãn ra tới mức phải ghép từng chữ cái —
 * đã thử một lần ở dòng ba đức tính của màn đăng nhập và bị bác ngay.
 *
 * `target` phải là một bề ngang KHÔNG do chữ quyết định — nếu không thì đặt
 * `letterSpacing` làm dòng rộng ra, nó `onLayout` lại, và hai thứ đuổi nhau mãi.
 * Cái chốt `daCan` chặn vòng thứ hai; `target` sạch thì chặn cả vòng đầu.
 */
function useLetterSpacingToWidth(text: string, target: number) {
  const [rongTuNhien, setRongTuNhien] = useState(0);
  const [gianChu, setGianChu] = useState(0);
  const daCan = useRef(false);

  /**
   * ĐỔI NGÔN NGỮ thì phải căn lại từ đầu — và phải căn lại ĐÚNG CÁCH. Không đủ
   * nếu chỉ mở chốt: số đo bề ngang lúc đó vẫn đang mang `letterSpacing` cũ, nên
   * nó không phải bề ngang TỰ NHIÊN của câu mới. Phải trả `gianChu` về 0 VÀ xoá
   * số đo cũ, để dòng được đo lại từ trạng thái chưa giãn.
   *
   * ⚠ Đặt lại NGAY TRONG LƯỢT DỰNG khi chữ đổi, KHÔNG dùng `useEffect([text])`.
   * Khác biệt tưởng như không có, nhưng `useEffect` còn chạy một lần lúc GẮN
   * khối — và `onLayout` có thể bắn TRƯỚC lần chạy ấy. Khi đó hiệu ứng xoá đúng
   * số đo vừa lấy được, bố cục không đổi nên không có lượt `onLayout` thứ hai để
   * đo lại, và dòng chữ nằm im ở bề ngang tự nhiên. Đã đo được trên máy ảo
   * 19/09/2026: dòng ba đức tính rộng 170pt trong một khối rộng 244pt — trông
   * hoàn toàn bình thường, không có gì kêu. Đặt lại lúc dựng thì nó chỉ chạy khi
   * `text` thật sự đổi.
   */
  const chuTruoc = useRef(text);
  if (chuTruoc.current !== text) {
    chuTruoc.current = text;
    daCan.current = false;
    setGianChu(0);
    setRongTuNhien(0);
  }

  useEffect(() => {
    if (daCan.current || rongTuNhien <= 0 || target <= 0) return;
    daCan.current = true;
    // Chia cho SỐ KHE (`độ dài - 1`), không phải số ký tự: khoảng cách nằm GIỮA
    // các chữ. Android còn cộng thêm một khe sau chữ cuối, nên bề ngang thật có
    // thể dôi ra đúng một khe — sai số đó nhỏ hơn một ký tự, chấp nhận được.
    const soKhe = Math.max(1, text.length - 1);
    setGianChu(Math.max(0, (target - rongTuNhien) / soKhe));
  }, [rongTuNhien, target, text]);

  return {
    gianChu,
    /**
     * Đã đo xong bề ngang tự nhiên chưa.
     *
     * Người gọi PHẢI để dòng chữ tự co theo nội dung (`alignSelf: 'flex-start'`)
     * cho tới khi cờ này bật, rồi mới ghim bề ngang. Ghim sớm hơn thì `onLayout`
     * trả về BỀ NGANG BỊ GHIM chứ không phải bề ngang tự nhiên, `gianChu` ra 0,
     * và dòng chữ trông bình thường — sai mà không có gì kêu. Đây là chỗ đã hỏng
     * thật một lần, bắt được bằng cách đo ảnh chụp màn hình chứ không phải bằng
     * bộ kiểm: khẩu hiệu rộng 96pt dưới một chữ hiệu rộng 134pt.
     */
    daDo: rongTuNhien > 0,
    onLayout: (e: LayoutChangeEvent) => setRongTuNhien(e.nativeEvent.layout.width),
  };
}

type Props = {
  /**
   * `row` — [dấu hiệu] [chữ hiệu / khẩu hiệu] nằm cạnh nhau.
   * `column` — ba mảnh chồng dọc.
   *
   * Đây chính là lý do cụm phải rời ra: đổi bố cục là đổi MỘT tham số, không
   * phải vẽ lại một ảnh.
   */
  direction: 'row' | 'column';
  /** Bề ngang tối đa của cả khối, tính bằng điểm. */
  maxWidth: number;
  /** Ngôn ngữ đang chọn — quyết câu khẩu hiệu. */
  lang: LangCode;
  /**
   * Có kèm khẩu hiệu dưới chữ hiệu không.
   *
   * Cỡ CHỮ HIỆU không đổi theo cờ này — đó là điều bộ sinh bên kho CheckFarm nói
   * rõ: *"bỏ câu giới thiệu chỉ đổi chỗ canh giữa theo chiều dọc, không đổi cỡ"*.
   * Bật cờ thì cột chữ thành ba phần `99 : 22 : 37` và cao đúng bằng cạnh vuông
   * ngoại tiếp dấu hiệu; tắt thì cột chỉ còn chữ hiệu, canh giữa theo dấu hiệu.
   */
  withSlogan?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * App này đã có cụm nhận diện cắt thành mảnh chưa.
 *
 * Xuất ra ngoài vì hai màn có ĐƯỜNG RƠI RIÊNG đẹp hơn đường rơi chung ở đây (ô
 * tròn lồng ô tròn, cỡ chữ riêng) và chúng đã phát hành như thế — chúng cần tự
 * hỏi câu này. Đọc `DEFAULT_INSTANCE` một lần ở tầng mô-đun là đủ: hai lời khai
 * app là hằng, không đổi lúc chạy.
 */
export const CO_CUM_NHAN_DIEN: boolean =
  DEFAULT_INSTANCE.brandMarkOnDark !== null &&
  DEFAULT_INSTANCE.brandWordmarkOnDark !== null;

export function BrandLockup({
  direction,
  maxWidth,
  lang,
  withSlogan = false,
  style,
}: Props) {
  const slogan = DEFAULT_INSTANCE.slogan[lang];

  // ── Kích thước: suy hết từ MỘT con số, là CẠNH VUÔNG NGOẠI TIẾP DẤU HIỆU ───
  // Với chiếc lá CheckFarm cạnh ấy chính là bề rộng dấu hiệu (hộp mực rộng hơn
  // cao). Bề ngang cả khối là hằng đã biết (`maxWidth`), nên cạnh này tính thẳng
  // ra, không cần `onLayout`.
  //
  // Hàng ngang rộng: lá `S` + khe `S·MARK_TO_WORDMARK_GAP` + chữ
  // `S·WORDMARK_SHARE·aspectChữ`.
  const heSoNgang =
    1 + MARK_TO_WORDMARK_GAP + WORDMARK_SHARE * BRAND_WORDMARK_ASPECT;
  const canhDau =
    direction === 'row'
      ? maxWidth / heSoNgang
      : // Xếp dọc thì bề ngang do CHỮ HIỆU quyết — nó rộng hơn lá nhiều lần.
        maxWidth / (WORDMARK_SHARE * BRAND_WORDMARK_ASPECT);

  const caoDau = canhDau / BRAND_MARK_ASPECT;
  const caoChu = canhDau * WORDMARK_SHARE;
  const rongChuHieu = caoChu * BRAND_WORDMARK_ASPECT;
  const khe = canhDau * WORDMARK_TO_SLOGAN_GAP;
  const caoKhauHieu = canhDau * SLOGAN_SHARE;

  // Bề ngang đích là bề ngang CHỮ HIỆU — một con số tính ra từ bố cục, không phải
  // một số đo của chữ. Đó là điều kiện để phép giãn không đuổi theo chính nó.
  const {
    gianChu,
    daDo: daDoKhauHieu,
    onLayout: doKhauHieu,
  } = useLetterSpacingToWidth(slogan, rongChuHieu);

  // ── Đường rơi: app chưa cắt cụm thành mảnh ────────────────────────────────
  if (!CO_CUM_NHAN_DIEN) {
    return (
      <View
        style={[
          direction === 'row' ? styles.hangNgang : styles.hangDoc,
          { maxWidth },
          style,
        ]}
      >
        <Image source={DEFAULT_INSTANCE.logo} style={styles.logoRoi} />
        <View style={styles.cotChu}>
          <Text style={styles.ten} allowFontScaling={false} numberOfLines={1}>
            {DEFAULT_INSTANCE.displayName.toUpperCase()}
          </Text>
          {withSlogan ? (
            <Text style={styles.khauHieuRoi} allowFontScaling={false} numberOfLines={1}>
              {slogan}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  const cotChu = (
    <View style={{ width: rongChuHieu }}>
      <Image
        source={DEFAULT_INSTANCE.brandWordmarkOnDark!}
        style={{ width: rongChuHieu, height: caoChu, resizeMode: 'contain' }}
        // `accessible` là phần KHÔNG bỏ được, và nó phản trực giác. `<Text>` mặc
        // định LÀ phần tử trợ năng trên iOS (`Libraries/Text/Text.js` —
        // `ios: accessible !== false`), còn `<Image>` thì KHÔNG (`Image.ios.js`
        // chỉ bật khi có `alt` hoặc `accessible`), và `accessibilityRole` không
        // bật hộ. Nên thay chữ tên app bằng một ảnh mà quên dòng này là XOÁ tên
        // app khỏi VoiceOver: người mù mở app lần đầu không nghe được mình đang ở
        // app nào, ở đúng ba màn trước-đăng-nhập. Bộ kiểm không bắt được — preset
        // jest của RN thay hẳn cả `Image` lẫn `Text` bằng mock.
        //
        // Nhãn đặt ở CHỮ HIỆU chứ không ở dấu hiệu: chữ hiệu ĐÚNG LÀ tên app, còn
        // chiếc lá là hình trang trí. Đặt cả hai thì trình đọc màn hình đọc tên
        // app hai lần.
        accessible
        accessibilityRole="image"
        accessibilityLabel={DEFAULT_INSTANCE.displayName}
      />

      {withSlogan ? (
        <Text
          style={[
            styles.khauHieu,
            {
              marginTop: khe,
              fontSize: caoKhauHieu,
              lineHeight: caoKhauHieu * 1.16,
              letterSpacing: gianChu,
              // Co theo nội dung TRƯỚC, ghim bề ngang SAU — xem `daDo` ở hook.
              alignSelf: daDoKhauHieu ? 'stretch' : 'flex-start',
            },
          ]}
          allowFontScaling={false}
          numberOfLines={1}
          // Câu dài hơn bề ngang chữ hiệu thì KHÔNG ép `letterSpacing` âm — thu
          // nhỏ cỡ chữ cho vừa đúng bề ngang ấy. Hai nhánh phủ cả hai chiều, nên
          // câu nào ở bốn thứ tiếng cũng căn được.
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          onLayout={doKhauHieu}
        >
          {slogan}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View
      style={[
        direction === 'row' ? styles.hangNgang : styles.hangDoc,
        style,
      ]}
    >
      <Image
        source={DEFAULT_INSTANCE.brandMarkOnDark!}
        style={{
          // CẢ HAI chiều ghi thẳng, KHÔNG dùng `aspectRatio`. Đo được trên máy
          // ảo 19/09/2026: `<Image>` chỉ khai `height` + `aspectRatio` vẽ ra
          // ĐÚNG CỠ GỐC của tệp (157×136) chứ không phải cỡ đã tính — và nó
          // không báo gì, chỉ to gấp ba. Số tính ra vẫn đúng (`caoDau = 43,3`),
          // nên mọi phép kiểm số học đều xanh; chỗ sai chỉ lộ ra khi đo ảnh
          // chụp màn hình thật. Chữ hiệu ngay bên cạnh khai đủ hai chiều và
          // luôn đúng — đó là cặp đối chứng chỉ ra nguyên nhân.
          width: canhDau,
          height: caoDau,
          resizeMode: 'contain',
          marginRight: direction === 'row' ? canhDau * MARK_TO_WORDMARK_GAP : 0,
          marginBottom: direction === 'row' ? 0 : canhDau * WORDMARK_TO_SLOGAN_GAP,
        }}
        // Chiếc lá là hình trang trí — tên app đã nằm ở chữ hiệu bên cạnh.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      {cotChu}
    </View>
  );
}

const styles = StyleSheet.create({
  hangNgang: { flexDirection: 'row', alignItems: 'center' },
  hangDoc: { flexDirection: 'column', alignItems: 'flex-start' },
  logoRoi: { width: 52, height: 52, borderRadius: 13, marginRight: 12 },
  cotChu: { alignItems: 'flex-start' },
  ten: {
    fontSize: 26,
    fontWeight: '800',
    // Giãn nhẹ: chữ IN HOA đứng sát nhau đọc ra một khối đặc, giãn ra thì nó đọc
    // ra một dấu hiệu nhận diện.
    letterSpacing: 1.5,
    color: NEUTRAL.white,
  },
  khauHieuRoi: { marginTop: 3, fontSize: 11, fontWeight: '600', color: NEUTRAL.white },
  khauHieu: { fontWeight: '600', color: NEUTRAL.white },
});
