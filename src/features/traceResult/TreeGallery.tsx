/**
 * TreeGallery — dải ảnh cây, chiếm đầu màn nguồn gốc.
 *
 * Đây là thứ người mua nhìn ĐẦU TIÊN và lâu nhất: họ đang cầm quả trên tay và so
 * với ảnh trên màn. Nên ảnh phải to hết bề ngang, vuốt được, và có chấm trang để
 * biết còn mấy tấm nữa — chứ không phải một ô thumbnail 200px ở góc.
 *
 * Ảnh đi qua `RemoteImage` chứ không phải `<Image>` trần, vì hai lẽ:
 *   · nó có ba đường lùi và một ô báo hỏng có nút thử lại — `<Image>` trần hỏng
 *     thì để lại một ô xám câm, và người dùng kết luận app làm mất ảnh;
 *   · và `shouldAttachAuth` của nó chỉ gắn token khi ảnh nằm ĐÚNG máy chủ
 *     OriLife. Ảnh ở đây nằm trên `lampnet.cloud` — một host khác — nên token
 *     không đi theo. Đó là điều mong muốn: đây là cửa CÔNG KHAI, người xem có thể
 *     chưa đăng nhập, và gửi token sang host thứ ba là rò token.
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';

import Icon from '../../components/Icon';
import RemoteImage from '../../components/RemoteImage';
import { NATURE, SPACE, TONE } from '../../modules/trace/theme/depth';

export interface TreeGalleryProps {
  urls: string[];
  width: number;
  height: number;
}

const TreeGallery: React.FC<TreeGalleryProps> = ({ urls, width, height }) => {
  const [page, setPage] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const lastPage = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const p = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
    // Chỉ đặt state khi trang THỰC SỰ đổi: sự kiện cuộn bắn liên tục, và gọi
    // setState mỗi lần là dựng lại cả dải ảnh giữa lúc ngón tay đang vuốt.
    if (p !== lastPage.current) {
      lastPage.current = p;
      setPage(p);
    }
  }, [width]);

  if (urls.length === 0) {
    return (
      <View style={[styles.empty, { width, height }]}>
        <Icon name="tree" size={34} color={TONE.primarySoft} />
        <Text style={styles.emptyTxt}>Hồ sơ này chưa có ảnh cây</Text>
      </View>
    );
  }

  return (
    <View style={{ width, height }}>
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
      >
        {urls.map((u, i) => (
          <RemoteImage
            key={u}
            uri={u}
            retryKey={retryKey}
            style={{ width, height }}
            resizeMode="cover"
            placeholder={(
              // Chạm vào ô hỏng = nạp lại. `retryKey` đổi thì `RemoteImage` nối
              // thêm `?r=n` — bắt buộc, vì phản hồi 404 nằm lại trong bộ đệm ảnh
              // của hệ điều hành và nạp lại ĐÚNG URL cũ thì vẫn trắng.
              <Pressable style={styles.brokenInner} onPress={() => setRetryKey((n) => n + 1)}>
                <Icon name="image" size={26} color={TONE.primarySoft} />
                <Text style={styles.emptyTxt}>{`Ảnh ${i + 1} chưa tải được — chạm để thử lại`}</Text>
              </Pressable>
            )}
            accessibilityLabel={`Ảnh cây ${i + 1}`}
          />
        ))}
      </ScrollView>

      {urls.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {urls.map((u, i) => (
            <View key={u} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
      ) : null}

      {urls.length > 1 ? (
        <View style={styles.counter} pointerEvents="none">
          <Text style={styles.counterTxt}>{`${page + 1}/${urls.length}`}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    backgroundColor: NATURE.soilDeep,
  },
  brokenInner: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs,
    backgroundColor: NATURE.soilDeep,
  },
  emptyTxt: { fontSize: 13, color: NATURE.barkSoft },
  dots: {
    position: 'absolute', bottom: SPACE.md, alignSelf: 'center',
    flexDirection: 'row', gap: 6,
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  dotOn: { backgroundColor: NATURE.paper, width: 18 },
  counter: {
    position: 'absolute', right: SPACE.md, bottom: SPACE.md,
    backgroundColor: 'rgba(0,0,0,0.38)',
    borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3,
  },
  counterTxt: { fontSize: 11, fontWeight: '600', color: NATURE.paper },
});

export default TreeGallery;
