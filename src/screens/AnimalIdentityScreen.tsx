/**
 * AnimalIdentityScreen — lối vào NHẬN DIỆN vật nuôi từ bên ngoài sổ đàn.
 *
 * ── Màn này nay chỉ còn là một cái vỏ ───────────────────────────────────────
 * Toàn bộ luồng — chọn loài, chọn vườn, đếm đàn, chụp, đọc kết quả — nằm trong
 * `AnimalWizard`, và sổ đàn của từng vườn (`FarmAnimalsTab`) mở ĐÚNG cùng một
 * thành phần đó. Một luồng, một bản dựng.
 *
 * ⛔ Vì sao không giữ bản dựng riêng ở đây: trước bản này màn tự dựng lấy luồng
 *    của mình, và nó lệch với đường đi trong sổ đàn theo những cách không ai
 *    thấy cho tới khi dùng thật —
 *
 *    · nó cho chụp NGAY cả khi vườn chưa có con nào để so, rồi mới để máy chủ
 *      trả `EMPTY_FARM` sau khi ảnh đã tải lên xong;
 *    · khung xem trước có nền `#000` và không bắt `onError`, nên mọi lượt ảnh
 *      không đọc được URI đều hiện ra một mảng đen không lời giải thích;
 *    · loài + vườn + ảnh + nút gửi bày cùng một lúc trong một biểu mẫu dài.
 *
 *    Ba thứ đó nay được sửa ở MỘT chỗ, và sửa một lần là cả hai lối vào cùng
 *    được sửa. Xem đầu tệp `AnimalWizard.tsx`.
 *
 * Tham số `{ species?, farmId? }` là TUỲ CHỌN và chỉ để bỏ bớt bước: cổng xoè mở
 * màn này mà không biết vườn nào, còn sổ đàn thì biết. Thiếu cả hai cũng chạy —
 * luồng tự hỏi.
 */

import React, { useEffect } from 'react';
import { StatusBar, View, StyleSheet } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import AnimalWizard from '../modules/trace/components/animal/AnimalWizard';
import { GroundBackdrop } from '../modules/trace/components/layered/Organic';
import { SURFACE as ORG_SURFACE } from '../modules/trace/theme/depth';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import type { RootState } from '../store';
import { loadFarms } from '../modules/trace/store/farmSlice';

/**
 * Bộ chuyển ứng viên UNCERTAIN. Thân hàm đã dời sang `components/reid` để bước
 * chọn ứng viên trong `AnimalWizard` dùng chung được; xuất lại ở đây để
 * `AnimalIdentityScreen.candidates.test.ts` giữ nguyên đường nhập — bài đó khoá
 * một lỗi có thật (khoá `tree_id` vs `id`) và không có lý do gì phải dời theo.
 */
export { toReidCandidates } from '../components/reid/animalCandidates';

type AnimalIdentityRouteParams = {
  AnimalIdentity: { species?: string; farmId?: string };
};

const AnimalIdentityScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<AnimalIdentityRouteParams, 'AnimalIdentity'>>();

  const dispatch = useAppDispatch();
  const farms = useAppSelector((s: RootState) => s.farm.farms);
  const currentUser = useAppSelector((s: RootState) => s.user.currentUser);

  // Vật nuôi PHẢI thuộc một vườn thật — máy chủ nhận `farm_id` và mọi màn đọc
  // lại đều lọc theo mã đó. Nạp danh sách vườn để bước chọn vườn có gì mà chọn.
  useEffect(() => {
    if (currentUser?.id && farms.length === 0) dispatch(loadFarms(currentUser.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={ORG_SURFACE.ground} />
      <GroundBackdrop variant="detail" />
      <AnimalWizard
        visible
        mode="identify"
        species={route.params?.species}
        farmId={route.params?.farmId}
        farms={farms}
        onClose={() => navigation.goBack()}
        /* `navigate`, KHÔNG `replace`: tấm trượt gọi `onClose()` trước rồi mới gọi
             chỗ này, tức màn vỏ đã bị gỡ khỏi ngăn xếp — `replace` lúc đó nhắm vào
             màn nằm DƯỚI nó. Ngoài ra `replace` chỉ có ở navigator dạng stack. */
        onOpenAnimal={(did) => navigation.navigate('AnimalDetail', { animalDid: did })}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ORG_SURFACE.ground },
});

export default AnimalIdentityScreen;
