/**
 * TraceNewsScreen — TOÀN BỘ tin nhà nông.
 *
 * ── Vì sao tách khỏi trang Tổng quan ────────────────────────────────────────
 * Trang Tổng quan chỉ bày TIN NÓNG (24 giờ, ba mục). Trước bản này nó đổ cả danh
 * sách và tự tải thêm khi cuộn — nghĩa là trang chủ dài vô tận và biến thành một
 * trang báo. Người mở app buổi sáng để xem vườn, không để đọc hai chục tin; ai
 * muốn đọc hết thì vào đây.
 *
 * ── Tin nóng vẫn lên đầu ────────────────────────────────────────────────────
 * Cụm NÓNG đứng riêng trên cùng, phần còn lại xếp mới-trước ở dưới. Trộn chung
 * là mất luôn thông tin "cái nào vừa xảy ra".
 *
 * ── Vì sao cụm nóng xếp SO LE ───────────────────────────────────────────────
 * Tin nóng bày ba dáng khác nhau thay vì ba hàng giống hệt:
 *
 *   tin 1     ảnh TRÀN NGANG, cao 200 — tin mới nhất đáng một khuôn hình lớn
 *   tin 2, 4  ảnh bên TRÁI
 *   tin 3, 5  ảnh bên PHẢI
 *
 * Không phải để cho vui mắt. Một cột năm hàng giống hệt nhau thì mắt lướt qua cả
 * năm mà không dừng ở đâu — đúng thứ phải tránh ở mục "nóng". Đảo bên ảnh buộc
 * mắt đổi hướng ở mỗi hàng, và thứ tự vẫn đọc được vì hàng nào cũng đọc từ trên
 * xuống. Cụm "tin trước đó" thì giữ một dáng đều, vì ở đó việc cần là LƯỚT NHANH.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Linking, Pressable, RefreshControl,
  StatusBar, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

import Icon from '../../../components/Icon';
import RemoteImage from '../../../components/RemoteImage';
import { useTk } from '../../../i18n/keys';
import { fetchAgriNews, hotNews, timeAgoVi, type NewsItem } from '../../../services/agriNewsService';
import {
  NATURE, ORGANIC_CARD, ORGANIC_TILE, RADIUS, SPACE, SURFACE, TONE, TYPE,
} from '../theme/depth';

/** Bao nhiêu tin được coi là nóng ở trang này — rộng hơn trang Tổng quan. */
const HOT_LIMIT = 5;

const TraceNewsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const tk = useTk();

  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const items = await fetchAgriNews();
    setNews(items);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await load();
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  /**
   * Chia hai cụm. `hot` lên đầu; phần còn lại là những tin KHÔNG nằm trong cụm
   * nóng — lọc theo id chứ không cắt theo chỉ số, vì `hotNews` sắp lại thứ tự.
   */
  const { hot, rest } = useMemo(() => {
    const h = hotNews(news, { now: Date.now(), limit: HOT_LIMIT });
    const ids = new Set(h.map(n => n.id));
    const r = [...news]
      .filter(n => !ids.has(n.id))
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0));
    return { hot: h, rest: r };
  }, [news]);

  const rows = useMemo(
    () => [
      ...(hot.length ? [{ header: tk('trace.news.hot') } as const] : []),
      // `hotIndex` quyết định dáng: 0 = ảnh tràn ngang, lẻ = ảnh trái, chẵn = ảnh phải.
      ...hot.map((item, i) => ({ item, hotIndex: i })),
      ...(rest.length ? [{ header: tk('trace.news.older') } as const] : []),
      ...rest.map(item => ({ item })),
    ],
    [hot, rest, tk],
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={SURFACE.ground} />

      <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={10}>
          <Icon name="arrow-left" size={21} color={NATURE.bark} />
        </Pressable>
        <View style={styles.headText}>
          <Text style={TYPE.title} numberOfLines={1}>{tk('trace.section.news')}</Text>
          <Text style={TYPE.caption}>{tk('trace.news.hint')}</Text>
        </View>
      </View>

      {loading && news.length === 0 ? (
        <View style={styles.center}>
          <ActivityIndicator color={TONE.primary} />
          <Text style={TYPE.caption}>{tk('trace.news.loading')}</Text>
        </View>
      ) : news.length === 0 ? (
        <View style={styles.center}>
          <Text style={TYPE.cardTitle}>{tk('trace.news.failTitle')}</Text>
          <Text style={[TYPE.caption, styles.centerTxt]}>{tk('trace.news.failBody')}</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r, i) => ('header' in r ? `h-${r.header}-${i}` : r.item.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={TONE.primary} />
          }
          renderItem={({ item: row }) => {
            if ('header' in row) return <Text style={styles.groupHead}>{row.header}</Text>;
            const hi = (row as { hotIndex?: number }).hotIndex;
            if (hi === undefined) return <NewsRow item={row.item} />;
            if (hi === 0) return <NewsHero item={row.item} />;
            return <NewsRow item={row.item} big flip={hi % 2 === 0} />;
          }}
        />
      )}
    </View>
  );
};

/** Tin nóng nhất — ảnh tràn ngang, chữ nằm dưới. */
const NewsHero: React.FC<{ item: NewsItem }> = ({ item }) => (
  <Pressable
    style={({ pressed }) => [styles.hero, pressed && styles.rowOn]}
    onPress={() => Linking.openURL(item.link).catch(() => {})}
  >
    <RemoteImage
      uri={item.imageUrl}
      style={styles.heroImg}
      containerStyle={[styles.heroImg, styles.thumbPh]}
      resizeMode="cover"
      placeholder={<Icon name="newspaper" size={30} color={NATURE.barkSoft} />}
    />
    <View style={styles.heroBody}>
      <Text style={styles.heroTitle} numberOfLines={3}>{item.title}</Text>
      <Meta item={item} />
    </View>
  </Pressable>
);

/**
 * Một tin theo hàng ngang. `big` cho ảnh lớn hơn (dùng ở cụm nóng), `flip` đẩy
 * ảnh sang PHẢI — hai thứ tạo ra nhịp so le.
 */
const NewsRow: React.FC<{ item: NewsItem; big?: boolean; flip?: boolean }> = ({
  item, big, flip,
}) => {
  const img = (
    <RemoteImage
      uri={item.imageUrl}
      style={big ? styles.thumbBig : styles.thumb}
      containerStyle={[big ? styles.thumbBig : styles.thumb, styles.thumbPh]}
      resizeMode="cover"
      placeholder={<Icon name="newspaper" size={big ? 26 : 20} color={NATURE.barkSoft} />}
    />
  );
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowOn]}
      onPress={() => Linking.openURL(item.link).catch(() => {})}
    >
      {flip ? null : img}
      <View style={styles.rowBody}>
        <Text style={[styles.rowTitle, big && styles.rowTitleBig]} numberOfLines={3}>
          {item.title}
        </Text>
        <Meta item={item} />
      </View>
      {flip ? img : null}
    </Pressable>
  );
};

const Meta: React.FC<{ item: NewsItem }> = ({ item }) => (
  <View style={styles.rowMeta}>
    <Text style={styles.rowSource} numberOfLines={1}>{item.source}</Text>
    <Text style={styles.rowDot}>·</Text>
    <Text style={styles.rowTime}>{timeAgoVi(item.publishedAt)}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.xxl },
  centerTxt: { textAlign: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.page, paddingBottom: SPACE.md,
  },
  backBtn: {
    width: 44, height: 44, ...ORGANIC_TILE,
    backgroundColor: SURFACE.raised,
    borderWidth: 1, borderColor: TONE.border,
    alignItems: 'center', justifyContent: 'center',
  },
  headText: { flex: 1, minWidth: 0 },

  list: { paddingHorizontal: SPACE.page, gap: SPACE.sm },

  groupHead: {
    ...TYPE.section, fontSize: 16,
    marginTop: SPACE.md, marginBottom: SPACE.xs,
  },

  row: {
    flexDirection: 'row', gap: SPACE.md,
    backgroundColor: SURFACE.raised,
    ...ORGANIC_CARD,
    borderWidth: 1, borderColor: TONE.border,
    padding: SPACE.md,
  },
  rowOn: { backgroundColor: TONE.primarySoft },
  thumb: { width: 92, height: 74, borderRadius: RADIUS.field },
  thumbBig: { width: 128, height: 104, borderRadius: RADIUS.field },

  hero: {
    backgroundColor: SURFACE.raised, ...ORGANIC_CARD,
    borderWidth: 1, borderColor: TONE.border,
    overflow: 'hidden',
  },
  heroImg: { width: '100%', height: 200 },
  heroBody: { padding: SPACE.md, gap: SPACE.sm },
  heroTitle: { fontSize: 18, fontWeight: '700', lineHeight: 25, color: NATURE.bark },
  thumbPh: { backgroundColor: SURFACE.sunken, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, minWidth: 0, justifyContent: 'space-between', gap: SPACE.sm },
  rowTitle: { fontSize: 15.5, fontWeight: '600', lineHeight: 21, color: NATURE.bark },
  rowTitleBig: { fontSize: 16.5, lineHeight: 23 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowSource: { fontSize: 12.5, color: TONE.primaryDeep, fontWeight: '600', flexShrink: 1 },
  rowDot: { fontSize: 12.5, color: NATURE.barkSoft },
  rowTime: { fontSize: 12.5, color: NATURE.barkSoft },
});

export default TraceNewsScreen;
