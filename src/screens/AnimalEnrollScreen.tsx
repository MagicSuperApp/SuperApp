/**
 * AnimalEnrollScreen — lối vào ĐĂNG KÝ cá thể từ bên ngoài sổ đàn.
 *
 * ── Màn này nay chỉ còn là một cái vỏ ───────────────────────────────────────
 * Luồng thật nằm trong `AnimalWizard`, dùng chung với sổ đàn của từng vườn.
 *
 * ⛔ VÌ SAO BẢN CŨ PHẢI ĐI: nó đòi ĐỦ CẢ HAI `species` + `farmId`, và thiếu một
 *    cái là `navigation.goBack()` ngay trong `useEffect` đầu tiên — không một
 *    dòng nào nói vì sao. Sổ đàn của một vườn chỉ cầm `farmId`; nó KHÔNG thể
 *    biết trước người dùng sắp ghi con gì. Nên mỗi lượt bấm "Thêm cá thể" là mở
 *    một màn rồi bị đá về ngay, và thứ người dùng thấy là trang tự tải lại.
 *
 *    Đó là một nhánh phòng thủ nguỵ trang thành đường đi bình thường: không lỗi,
 *    không log, không bài kiểm nào đỏ. Nay loài là BƯỚC MỘT của luồng, nên
 *    không còn tham số bắt buộc nào để mà thiếu.
 *
 * Tham số `{ species?, farmId? }` là TUỲ CHỌN và chỉ để bỏ bớt bước.
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

type RouteParams = {
  AnimalEnroll: { species?: string; farmId?: string };
};

const AnimalEnrollScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RouteParams, 'AnimalEnroll'>>();

  const dispatch = useAppDispatch();
  const farms = useAppSelector((s: RootState) => s.farm.farms);
  const currentUser = useAppSelector((s: RootState) => s.user.currentUser);

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
        mode="enroll"
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

export default AnimalEnrollScreen;
