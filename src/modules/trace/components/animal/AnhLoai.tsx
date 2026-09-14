// modules/trace/components/animal/AnhLoai.tsx
/**
 * ẢNH của một loài vật nuôi — dùng ở MỌI chỗ cần bày "con gì".
 *
 * ── Vì sao là một thành phần chứ không phải vài dòng chép lại ───────────────
 * Trước bản này có SÁU chỗ tự dựng lấy: bảng cơ cấu đàn, chip lọc loài, ô chọn
 * loài ở bước một, dòng tóm tắt, danh sách ứng viên, và thẻ cá thể. Mỗi chỗ tự
 * quyết định lấy ảnh hay lấy biểu tượng, tự chọn `resizeMode`, tự đặt màu cho
 * nhánh rơi về biểu tượng. Sáu bản chép tay của cùng một quyết định thì lượt
 * sau chỉ cần sửa năm chỗ là có một chỗ lệch — và chỗ lệch ấy không đỏ ở đâu
 * cả, nó chỉ hiện ra một con gà vẽ nét nằm giữa năm con gà chụp ảnh.
 *
 * ── Hai nhánh, và nhánh sau KHÔNG phải một ô trống ──────────────────────────
 *   1. Có ảnh PNG xoá nền của loài (`speciesPhoto.ts`) → vẽ ảnh.
 *   2. Chưa có → vẽ biểu tượng (`speciesFa.ts`).
 *
 * Nhánh (2) phải còn sống: bảng ảnh thêm/bớt được mà không ai phải sửa chỗ vẽ,
 * và một loài mới của máy chủ sẽ hiện ra biểu tượng bàn chân chứ không hiện ra
 * một khoảng trắng đọc như "app hỏng".
 *
 * ⚠ `resizeMode="contain"` là bắt buộc, không phải tuỳ chọn: ảnh loài mỗi con
 *   một tỉ lệ (bò nằm ngang, gà đứng dọc), nên `cover` cắt cụt mỗi loài một
 *   kiểu — và cắt đúng phần đầu, tức phần người ta nhìn để nhận ra con gì.
 */

import React from 'react';
import { Image } from 'react-native';

import Icon from '../../../../components/Icon';
import { hinhLoai } from './speciesFa';
import { anhLoai } from './speciesPhoto';

const AnhLoai: React.FC<{
  species?: string | null;
  /** Cạnh của ô vẽ, tính bằng điểm. Ảnh nằm gọn trong ô vuông này. */
  size: number;
  /**
   * Màu của BIỂU TƯỢNG khi loài chưa có ảnh. Ảnh PNG không nhận màu.
   *
   * ⚠ CỐ Ý KHÔNG có prop `style`: nhánh biểu tượng và nhánh ảnh nhận hai kiểu
   * style khác nhau (`ViewStyle` vs `ImageStyle`), nên một prop chung chỉ áp
   * được cho một nhánh — và nhánh kia lặng lẽ bỏ qua nó. Cần lề thì nơi gọi bọc
   * một `View`; nó đúng cho cả hai nhánh.
   */
  color?: string;
}> = ({ species, size, color }) => {
  const anh = anhLoai(species);
  if (!anh) {
    return <Icon name={hinhLoai(species)} size={size} color={color} />;
  }
  return (
    <Image
      source={anh}
      style={{ width: size, height: size }}
      resizeMode="contain"
      /* Android: hiệu ứng mờ dần để lại một khung tối ở khung hình đầu trên vài
         máy — thấy rõ nhất ở danh sách, nơi hàng chục ô cùng hiện một lúc. */
      fadeDuration={0}
    />
  );
};

export default AnhLoai;
