/**
 * Bố cục một tấm băng — ĐO, không nhìn.
 *
 * ── Vì sao tệp này tồn tại ─────────────────────────────────────────────────
 * Ba lượt sửa liên tiếp (14/09) đều là sửa con số bố cục, và cả ba lượt đều
 * quay lại với cùng ba lời: ranh giới chưa dịch, ảnh vẫn zoom, hai tấm mất ảnh.
 * Không lượt nào có cách nào để nói con số THẬT SỰ ra bao nhiêu — chúng nằm
 * trong `StyleSheet.create` giữa một tệp 1.400 dòng, muốn đo thì phải dựng cả
 * Trang chủ.
 *
 * Nên bài này dựng đúng một tấm và hỏi thẳng cái cây đã dựng: khung ảnh rộng
 * bao nhiêu, `resizeMode` là gì, dải đặc màu ở đâu, chữ bắt đầu ở đâu. Từ nay
 * "nó ra bao nhiêu" là một câu trả lời được, không phải một phỏng đoán.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Image, Text } from 'react-native';

import { BannerCard, boCucBang } from './BannerCard';
import { ScrimWash } from '../shared/components/SoftGradient';
import { allBanners } from './homeBanners';

/** Thẻ trên màn 390 px: 390 − 2×20 lề Trang chủ. */
const RONG = 350;
const CAO = 140;

const [TRACE, CHAT, WORK] = allBanners(null);

const dung = (tam = TRACE) => {
  let cay!: renderer.ReactTestRenderer;
  act(() => {
    cay = renderer.create(
      <BannerCard tam={tam} rong={RONG} cao={CAO} onPress={() => { }} />,
    );
  });
  return cay;
};

/** Gom mọi chuỗi chữ trong một nhánh đã dựng. */
const collect = (node: unknown): string => {
  const ra: string[] = [];
  const di = (x: any): void => {
    if (x === null || x === undefined || x === false) return;
    if (typeof x === 'string' || typeof x === 'number') { ra.push(String(x)); return; }
    if (Array.isArray(x)) { x.forEach(di); return; }
    if (x.props?.children !== undefined) di(x.props.children);
  };
  di(node);
  return ra.join(' ');
};

/** Gộp mảng style lồng nhau về một object, như RN làm lúc vẽ. */
const gop = (style: unknown): Record<string, any> =>
  Object.assign({}, ...[].concat(style as never).filter(Boolean));

const anh = (cay: renderer.ReactTestRenderer) =>
  cay.root.findByProps({ testID: 'banner-anh' });

describe('bộ số bố cục', () => {
  const bc = boCucBang(RONG, CAO);

  /**
   * KHUNG ẢNH SUY TỪ CHIỀU CAO, không từ bề ngang thẻ. Đây là chỗ đã gây ra
   * "ảnh bị zoom quá to": bề ngang 78% thẻ cho khung 1,95:1, mà `cover` phóng
   * ảnh tới khi cạnh ngắn vừa khung — khung càng dẹt hơn ảnh, phóng càng nhiều.
   */
  it('khung ảnh chụp KHÔNG còn dính vào bề ngang thẻ', () => {
    expect(bc.anhW).toBe(CAO * 1.6);
    expect(bc.anhW).toBe(224);
    // Và nó phải hẹp hơn hẳn con số cũ (0,78 × bề ngang = 273).
    expect(bc.anhW).toBeLessThan(RONG * 0.78);
  });

  it('phần bị cắt của một ảnh báo 3:2 còn dưới 10%', () => {
    // `cover`: phóng tới khi CẢ HAI cạnh phủ kín khung, rồi cắt phần thừa.
    const tiLeAnh = 1024 / 683; // tấm nền vườn dâu đang dùng làm đường lùi
    const tiLeKhung = bc.anhW / CAO;
    const cat = 1 - Math.min(tiLeAnh, tiLeKhung) / Math.max(tiLeAnh, tiLeKhung);
    expect(cat).toBeLessThan(0.1);
  });

  /**
   * Khung hình vẽ VUÔNG và CAO HƠN thẻ.
   *
   * Hai lượt trước đều thua ở đây. Lượt một thu khung về 86% chiều cao "cho
   * hình thở" → hở 10 px trên dưới. Lượt hai để bằng đúng chiều cao thẻ → hết
   * hở, nhưng nét vẽ vẫn nhỏ, vì tệp ảnh có một vành TRONG SUỐT rộng quanh nét
   * vẽ nên hình 140 px chỉ cho ra nét vẽ chừng 100 px.
   *
   * Khung cao hơn thẻ thì nét vẽ to lên và phần tràn — tức cái vành trong suốt
   * ấy — bị thẻ cắt. Ngưỡng dưới là CAO: bằng hoặc nhỏ hơn là hở lại.
   */
  it('khung hình vẽ VUÔNG và CAO HƠN thẻ — nét vẽ mới đủ to, và không thể hở', () => {
    expect(bc.hinhW).toBeGreaterThan(CAO);
  });

  /**
   * VẠCH CHỮ và MỐC ĐẶC MÀU. Mốc phải nằm TRƯỚC vạch chữ — đó là toàn bộ điều
   * kiện để chữ trắng luôn đứng trên màu đặc chứ không trên ảnh.
   */
  it('dải đặc màu xong trước vạch chữ', () => {
    expect(bc.mocDac * RONG).toBeLessThan(bc.chuX);
  });

  it('ranh giới giữ trong quãng đã chọn', () => {
    // Đã kéo ngược về 0,48 để đổi lấy cỡ chữ tiêu đề gấp đôi — xem `CHU_X`.
    // Sàn 0,44: dưới mức đó thì ảnh chỉ còn một dải hẹp và bố cục "ảnh → màu"
    // thôi là một bố cục có ảnh.
    expect(bc.chuX / RONG).toBeGreaterThanOrEqual(0.44);
  });

  it('dải NGHIÊNG, không còn ngang phẳng', () => {
    expect(bc.goc).not.toBe(90);
    expect(Math.abs(bc.goc - 90)).toBeLessThanOrEqual(15); // chéo NHẸ
  });
});

describe('tấm đã dựng — đúng những con số ấy', () => {
  it('ảnh chụp: khung rộng đúng `anhW`, cao trọn thẻ, `cover`', () => {
    const cay = dung(TRACE);
    const el = anh(cay);
    const st = gop(el.props.style);
    expect(el.props.resizeMode).toBe('cover');
    expect(st.width).toBe(boCucBang(RONG, CAO).anhW);
    // Cao trọn thẻ: neo cả `top` lẫn `bottom`, không đặt `height`.
    expect(st.top).toBe(0);
    expect(st.bottom).toBe(0);
    expect(st.left).toBe(0);
    act(() => { cay.unmount(); });
  });

  /**
   * Hai tấm hình vẽ — ca "không còn nhìn thấy đâu".
   *
   * Hai điều kiện, và tấm trước hỏng ở điều kiện thứ hai: khung rộng 189 px
   * trong khi hình chỉ 140 px, mà `contain` canh GIỮA, nên hình bị đẩy sang
   * phải vào đúng chỗ dải đã đục hơn 70%.
   */
  it.each([
    ['Trò chuyện', CHAT],
    ['Việc làm', WORK],
  ])('hình vẽ (%s): `contain`, khung vuông, và nằm trong vùng dải còn trong', (_ten, tam) => {
    const cay = dung(tam);
    const el = anh(cay);
    const st = gop(el.props.style);
    const bc = boCucBang(RONG, CAO);

    expect(el.props.resizeMode).toBe('contain');
    expect(st.width).toBe(bc.hinhW);
    expect(st.height).toBe(bc.hinhW); // vuông
    expect(st.left).toBe(0);

    // KHÔNG được hở dải nào trên/dưới: khung phải phủ hết chiều cao thẻ, và vì
    // nó cao hơn thẻ thì `top` phải ÂM đúng một nửa phần dôi ra (canh giữa).
    expect(st.height).toBeGreaterThanOrEqual(CAO);
    expect(st.top).toBeLessThanOrEqual(0);
    expect(st.top + st.height).toBeGreaterThanOrEqual(CAO);
    expect(st.top).toBeCloseTo(-(st.height - CAO) / 2, 6);

    // Tâm hình phải còn ở phía TRƯỚC mốc đặc màu — sau mốc ấy là màu đặc, tức
    // là nét vẽ có to tới đâu cũng không ai thấy.
    expect(st.width / 2).toBeLessThan(bc.mocDac * RONG);
    act(() => { cay.unmount(); });
  });

  it('lớp phủ nhận đúng góc và mốc của bố cục', () => {
    const cay = dung(TRACE);
    const scrim = cay.root.findByType(ScrimWash);
    const bc = boCucBang(RONG, CAO);
    expect(scrim.props.angle).toBe(bc.goc);
    expect(scrim.props.solidAt).toBeCloseTo(bc.mocDac, 6);
    expect(scrim.props.color).toBe(TRACE.color);
    act(() => { cay.unmount(); });
  });

  it('khối chữ bắt đầu ĐÚNG tại vạch chữ', () => {
    const cay = dung(TRACE);
    const chu = cay.root.findByProps({ testID: 'banner-chu' });
    expect(gop(chu.props.style).marginLeft).toBe(boCucBang(RONG, CAO).chuX);
    act(() => { cay.unmount(); });
  });

  /**
   * Thẻ KHÔNG được có lề dọc. Trong Yoga, lề của khối cha dời cả con nằm tuyệt
   * đối của nó — thẻ có `paddingVertical: 16` thì ảnh thấp hơn thẻ 32 px và hai
   * dải ngang trên/dưới không có lớp phủ. Đã xảy ra một lần.
   */
  it('thẻ không có lề dọc — nếu không, ảnh và lớp phủ đều bị thụt vào', () => {
    const cay = dung(TRACE);
    const st = gop(cay.root.findByType(Image).parent?.props.style);
    expect(st.paddingVertical).toBeUndefined();
    expect(st.padding).toBeUndefined();
    expect(st.height).toBe(CAO);
    act(() => { cay.unmount(); });
  });
});

/**
 * CHỮ trên tấm tin — sau đợt 14/09 bỏ dòng tóm tắt và dòng nguồn.
 *
 * Tấm tin từng xếp bốn tầng chữ vào một cột rộng 129 px, trong đó dòng tóm tắt
 * là câu mở đầu của bài — nó nói lại ý của tiêu đề bằng chữ nhỏ hơn.
 */
describe('chữ trên tấm', () => {
  const tinMau = {
    id: 'n1',
    title: 'Giá sầu riêng tăng trở lại sau đợt mưa kéo dài ở miền Tây',
    link: 'https://danviet.vn/a.html',
    summary: 'Thương lái vào vườn thu mua sớm hơn mọi năm.',
    imageUrl: null,
    publishedAt: 1_700_000_000_000 - 2 * 3600_000,
    source: 'Dân Việt · Nhà nông',
  };

  it('có tin: tiêu đề + tên báo, KHÔNG tóm tắt', () => {
    const [tam] = allBanners(tinMau);
    expect(tam.title).toBe(tinMau.title);
    expect(tam.sub).toBe('');
    expect(tam.meta).toBe(tinMau.source);
  });

  /**
   * MỘT bậc chữ cho cả ba tấm.
   *
   * Từng có một bậc riêng cho tấm tin. Ba tấm trượt qua nhau trong cùng một
   * khung, nên hai cỡ chữ tiêu đề đọc ra là chữ "nhảy cỡ" mỗi bốn giây chứ
   * không đọc ra một sự nhấn mạnh.
   */
  it('ba tấm dùng CÙNG một cỡ chữ tiêu đề', () => {
    const [tinTam] = allBanners(tinMau);
    const coChu = (tam: typeof tinTam) => {
      const cay = dung(tam);
      const el = cay.root.findAllByType(Text).find(t => t.props.children === tam.title)!;
      const co = gop(el.props.style).fontSize;
      act(() => { cay.unmount(); });
      return co;
    };
    expect(new Set([coChu(tinTam), coChu(CHAT), coChu(WORK)]).size).toBe(1);
  });

  /**
   * Cỡ chữ CỐ ĐỊNH, và khoảng dòng CHẶT.
   *
   * Hai vế của cùng một luật. `adjustsFontSizeToFit` làm cỡ chữ tiêu đề đổi
   * theo độ dài tin — ba tấm trượt qua nhau với ba cỡ khác nhau — và nó còn kéo
   * theo một lỗi thứ hai: RN co `fontSize` nhưng KHÔNG co `lineHeight` (pixel,
   * không phải tỉ lệ), nên cỡ 30 co còn 21 mà khoảng dòng vẫn 34 thì giữa hai
   * dòng hở gần nửa dòng trống. Cả hai đều đã xảy ra.
   */
  it('tiêu đề dùng cỡ chữ cố định, khoảng dòng ở mức BÌNH THƯỜNG', () => {
    const [tinTam] = allBanners(tinMau);
    for (const tam of [tinTam, CHAT]) {
      const cay = dung(tam);
      const el = cay.root.findAllByType(Text).find(t => t.props.children === tam.title)!;
      const st = gop(el.props.style);
      expect(el.props.adjustsFontSizeToFit).toBeUndefined();
      expect(typeof st.fontSize).toBe('number');
      // Quãng của một khoảng dòng thường. Dưới 1,15 thì hai dòng dính vào nhau;
      // trên 1,45 thì hở ra như thiếu một dòng. Cả hai đều đã bị báo một lần.
      const tiLe = st.lineHeight / st.fontSize;
      expect(tiLe).toBeGreaterThanOrEqual(1.15);
      expect(tiLe).toBeLessThanOrEqual(1.45);
      act(() => { cay.unmount(); });
    }
  });

  it('tấm tin: nhãn module, tiêu đề, rồi TÊN BÁO — không dòng rỗng nào', () => {
    const [tinTam] = allBanners(tinMau);
    const cay = dung(tinTam);
    const chu = cay.root.findAllByType(Text).map(t => t.props.children);
    expect(chu).toEqual([tinTam.module, tinTam.title, tinMau.source]);
    act(() => { cay.unmount(); });
  });

  /**
   * NHÃN MODULE NEO TRÊN, nội dung neo DƯỚI.
   *
   * Bản trước canh giữa cả cụm chữ, nên nhãn nằm cao thấp khác nhau tuỳ tấm ấy
   * có mấy dòng — ba tấm trượt qua nhau thì cái nhãn nhảy lên nhảy xuống.
   */
  it('nhãn module neo trên, nội dung neo dưới', () => {
    const cay = dung(CHAT);
    const chu = cay.root.findByProps({ testID: 'banner-chu' });
    expect(gop(chu.props.style).justifyContent).toBe('space-between');
    // Và nhãn phải là khối ĐẦU TIÊN trong cột chữ.
    const dau = chu.props.children[0];
    expect(collect(dau)).toContain(CHAT.module);
    act(() => { cay.unmount(); });
  });
});

describe('bấm', () => {
  it('gọi đúng tấm được bấm', () => {
    const bam = jest.fn();
    let cay!: renderer.ReactTestRenderer;
    act(() => {
      cay = renderer.create(
        <BannerCard tam={CHAT} rong={RONG} cao={CAO} onPress={bam} />,
      );
    });
    act(() => {
      cay.root.findByProps({ accessibilityRole: 'button' }).props.onPress();
    });
    expect(bam).toHaveBeenCalledWith(CHAT);
    act(() => { cay.unmount(); });
  });
});
