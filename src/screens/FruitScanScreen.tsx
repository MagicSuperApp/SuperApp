/**
 * FruitScanScreen — QUÉT QUẢ khi CHƯA biết cây: chụp một quả → ra quả nào, cây nào.
 *
 * Đây là cửa `POST /api/fruit/identify` — cửa DUY NHẤT soi được toàn vườn mà
 * không cần biết cây trước. Nó có trong hợp đồng từ 17/07 nhưng **chưa app nào
 * gọi** (OriLife đo: 0 sự kiện), nên nút "Quét quả" ở cổng xoè trước nay chỉ dẫn
 * người dùng tới màn chọn cây thủ công.
 *
 * ── Màn này CỐ Ý không có dấu tích xanh ─────────────────────────────────────
 * Đo trên prod của OriLife: hệ nói `MATCH` thì đúng **19/37 = 51,4%**; ở ngưỡng
 * đang chạy nó nhận nhầm **73% (412/564)** cặp quả KHÁC NHAU trên cùng một cây.
 * Con số dùng được duy nhất là rank-5 (0,92–0,95). Nên màn này luôn là BỘ CHỌN
 * top-5, kể cả khi máy nói chắc — và không bao giờ tự đi tiếp giùm nông dân.
 * Nguồn: thư OriLife 08/08 §1 và 07/08 §4 (`_Agents/inbox/_done/`).
 *
 * ── Ba đường ra, không đường nào là ngõ cụt ─────────────────────────────────
 *   chọn 1 quả  → mở màn khoanh vùng để BỒI GÓC cho đúng quả đó
 *   không quả nào đúng → đăng ký quả MỚI trên cây gần chỗ đứng
 *   máy chưa soi được  → chọn cây thủ công (đường cũ vẫn còn nguyên)
 *
 * Route params: { farmId?, treeId? }  — treeId có thì thu hẹp về đúng cây đó.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView,
  Platform, PermissionsAndroid, StatusBar,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { launchCamera } from 'react-native-image-picker';
import Geolocation from 'react-native-geolocation-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { COLORS } from '../constants';
import RemoteImage from '../components/RemoteImage';
import { ORILIFE_BASE } from '../services/orilifeBase';
import { getTrees, type TreeInfo } from '../services/treeReIDService';
import {
  identifyFruit, listFruits, fruitIdentifyVerdict,
  type FruitDecision, type FruitStatus, type FruitVerdict,
} from '../services/fruitReIDService';
import { withPhotoSave } from '../services/mediaSavePermission';
import {
  nearbyTrees, buildFruitTreeIndex, resolveCandidates, topCandidates,
  outcomeOfScan, canSendVerdict, TREE_INDEX_LIMIT,
  type ResolvedCandidate, type ScanOutcome,
} from '../features/fruitFind/fruitFind';
import { formatDistanceVi, type LatLon } from '../features/wayfind/wayfind';
import { buildCaptureMeta, serializeCaptureMeta } from '../services/captureMeta';
import { TreeReIDBridge } from '../services/treeReIDNativeBridge';
// `absUrl` ở nhờ màn danh sách quả (chỗ duy nhất từng có chốt URL tuyệt đối).
// Một chiều, không vòng: `FruitListScreen` không import màn nào.
import { absUrl } from './FruitListScreen';

import { tk } from '../i18n/keys';
import { showError, showInfo } from '../utils/alert';
import { t } from '../i18n';
const BASE_URL = ORILIFE_BASE;

interface RouteParams { farmId?: string; treeId?: string }

const STATUS_VI: Record<FruitStatus, string> = {
  on_tree: 'còn trên cây', harvested: 'đã hái', lost: 'đã mất',
};

const PHOTO_OPTIONS = {
  mediaType: 'photo' as const,
  quality: 0.9 as const,
  // 1600 px — GIỐNG đường đăng ký (`FruitListScreen`) và đường video.
  //
  // Không phải vì 1600 là cỡ tối ưu: chưa ai đo 1600 với 4032. Là vì bản mẫu dựng
  // từ ảnh đã co về 1600 mà truy vấn gửi nguyên 4032 thì hai đầu đi qua hai đường
  // xử lý khác nhau, và phần chênh lệch đo được không còn phân biệt được "khác
  // quả" với "khác đường nén". Đối xứng là điều kiện để con số có nghĩa, không
  // phải một tinh chỉnh. (OriLife xác nhận 18/08.)
  //
  // Cỡ tối ưu đo được ngay khi cửa `fruit/identify` bắt đầu có lượt gọi thật —
  // trước hôm nay nó có 0 lượt trên 1859 sự kiện, vì màn này không ai mở được.
  maxWidth: 1600,
  maxHeight: 1600,
  saveToPhotos: true,
};

async function requestLocation(): Promise<boolean> {
  if (Platform.OS === 'android') {
    try {
      const g = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      return g === PermissionsAndroid.RESULTS.GRANTED;
    } catch { return false; }
  }
  try { return (await Geolocation.requestAuthorization('whenInUse')) === 'granted'; } catch { return false; }
}

const FruitScanScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const { farmId, treeId: pinnedTreeId } = (route.params ?? {}) as RouteParams;

  const [here, setHere] = useState<LatLon | null>(null);
  const [trees, setTrees] = useState<TreeInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyNote, setBusyNote] = useState('');

  // Kích thước ẢNH GỐC phải đi kèm sang màn khoanh vùng: `FruitCropperScreen`
  // map ngược toạ-độ khung về px ảnh gốc bằng `imageW`/`imageH`, và khi thiếu nó
  // rơi về `|| 1` (`FruitCropperScreen.tsx:226-227`) ⇒ mọi bbox gửi lên máy chủ
  // thành rác mà không báo lỗi gì.
  // `capture` = khối siêu dữ liệu lúc bấm máy (heading/pitch/cỡ ảnh gốc/máy). Nó
  // đi CÙNG tấm ảnh vì chỉ dựng lại được tại đúng thời điểm chụp — xem
  // `captureMeta.ts` và `FruitCropperScreen` (màn đó nhận qua route param).
  const [photo, setPhoto] = useState<{ uri: string; w: number; h: number; capture?: string } | null>(null);
  const photoUri = photo?.uri ?? null;
  const [outcome, setOutcome] = useState<ScanOutcome | null>(null);
  const [decision, setDecision] = useState<FruitDecision | undefined>(undefined);
  const [queryId, setQueryId] = useState<string | undefined>(undefined);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [picks, setPicks] = useState<ResolvedCandidate[]>([]);
  const [verdictSent, setVerdictSent] = useState<FruitVerdict | null>(null);

  // GPS một lần: thu hẹp phạm vi soi, và để tra cây cho ứng viên.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!(await requestLocation())) return;
      Geolocation.getCurrentPosition(
        (p) => { if (alive) setHere({ lat: p.coords.latitude, lon: p.coords.longitude }); },
        () => {},
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 15000 },
      );
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await getTrees(BASE_URL, farmId);
      if (alive && r.ok && r.trees) setTrees(r.trees);
    })();
    return () => { alive = false; };
  }, [farmId]);

  const around = useMemo(() => nearbyTrees(here, trees, { limit: TREE_INDEX_LIMIT }), [here, trees]);

  /**
   * Bảng tra `fruit_id → cây`, dựng bằng các lượt GET RẺ (không tải ảnh lên).
   *
   * **Hợp đồng ĐÃ CHỐT 15/08** (thư OriLife): ứng viên của `identify` CÓ kèm
   * `tree_id`, `name`, `status` — `server.py:6534-6536` trên `main@29fa6e9`, và
   * cùng ba dòng đó có ở đúng bản đang chạy prod (`582d9f6:server.py:6130-6132`).
   * Nên đường thường ngày là `treeSource: 'server'`, không đi qua bảng này.
   *
   * OriLife đề nghị XOÁ hẳn nhánh tra bù. Nhà này GIỮ, vì hai lẽ đo được:
   *
   * 1. Nó **đã không chạy rồi**. Dòng gọi bên dưới có cổng
   *    `raw.some(c => !c.tree_id)` — máy chủ trả đủ cây thì `buildIndex()` không
   *    được gọi lần nào. Tức 6 lượt GET mà thư lo đã bằng 0 ở đường thường.
   *    Xoá không tiết kiệm thêm gì; chỉ mất lưới.
   * 2. Chính thư đó (§2) đo prod đang ngồi trên nhánh **PHÂN KỲ**
   *    (`deploy/monitor-lich-su`, không phải tổ tiên của `main`, `main` đi trước
   *    10 commit). Máy chủ tụt về bản cũ là kịch bản SỐNG, không phải giả định —
   *    và §3 của chính thư đó giữ nhánh `match_without_list` với đúng lý do ấy.
   *
   * Xoá đi thì lúc prod tụt bản, người quét quả nhận `treeSource: 'unknown'` —
   * mất đường tới cây, im lặng. Giữ lại thì tệ nhất là 6 GET rẻ trong một ca hiếm.
   */
  const buildIndex = useCallback(async () => {
    const lists = await Promise.all(
      around.map(async ({ tree }) => {
        const r = await listFruits(BASE_URL, tree.tree_id);
        return {
          treeId: tree.tree_id,
          treeName: tree.name ?? null,
          fruitIds: r.ok && r.data?.fruits ? r.data.fruits.map(f => f.fruit_id) : [],
        };
      }),
    );
    return buildFruitTreeIndex(lists);
  }, [around]);

  const runScan = useCallback(async (uri: string) => {
    setBusy(true);
    setBusyNote('Đang soi quả…');
    setVerdictSent(null);
    try {
      // KHÔNG gọi `fruit/detect` trước nữa — đo được là thừa một lượt mạng.
      //
      // Bản trước gọi `detect` lấy khung rồi gửi khung đó kèm `identify`, vì lúc
      // ĐĂNG KÝ thì ảnh luôn có khung còn màn này gửi cả tấm. Ý đồ đúng, cách làm
      // thừa: **không gửi khung thì chính cửa `identify` tự chạy đúng bộ dò đó**
      // ngay trong cùng lượt (OriLife xác nhận 18/08). Gọi trước là làm lại việc
      // máy chủ sắp làm — mất thêm một lượt mạng, giữa vườn sóng yếu.
      //
      // Khung vẫn đáng gửi khi NGƯỜI dùng tự khoanh (màn khoanh vùng làm việc đó).
      // Khung MÁY tự tìm thì chưa đủ tin: đo 18/08 trên một ảnh cả cây có sáu quả,
      // bộ dò trả đúng một khung và khung đó là lá với trời.
      const res = await identifyFruit(BASE_URL, uri, {
        treeId: pinnedTreeId,
        lat: here?.lat,
        lon: here?.lon,
      });
      const data = res.data;
      const raw = data?.candidates ?? [];

      setBusyNote('Đang tra cây cho các quả…');
      const index = raw.length > 0 && raw.some(c => !c.tree_id) ? await buildIndex() : new Map();
      const resolved = topCandidates(resolveCandidates(raw, index));

      setQueryId(data?.query_id);
      setDecision(data?.decision);
      setServerMessage(data?.message ?? null);
      setPicks(resolved);
      setOutcome(outcomeOfScan(res.ok && data?.ok !== false, data?.decision, resolved.length));
    } finally {
      setBusy(false);
      setBusyNote('');
    }
  }, [pinnedTreeId, here, buildIndex]);

  const takePhoto = useCallback(async () => {
    launchCamera(await withPhotoSave(PHOTO_OPTIONS), async (resp: any) => {
      if (resp.didCancel) return;
      if (resp.errorCode) {
        showError('Lỗi máy ảnh', resp.errorMessage ?? 'Không mở được máy ảnh. Kiểm tra quyền.');
        return;
      }
      const asset = resp.assets?.[0];
      if (!asset?.uri) return;
      if (!asset.width || !asset.height) {
        // Không có kích thước thì màn khoanh vùng phía sau không map ngược được;
        // nói ra tại đây còn hơn để bbox rác lặng lẽ vào kho.
        showInfo('Ảnh thiếu kích thước', 'Máy không trả kích thước ảnh. Anh chụp lại giúp.');
        return;
      }
      // Dựng NGAY ĐÂY, không đợi tới lúc mở màn khoanh: heading/pitch là số đo
      // tại thời điểm bấm máy, tới màn kia người ta đã xoay máy đi rồi và không
      // dựng lại được (`FruitCropperScreen` nói rõ điều đó ở khối route param).
      // Hỏng thì bỏ trống, không chặn luồng quét.
      let capture: string | undefined;
      try {
        capture = serializeCaptureMeta(await buildCaptureMeta(asset, TreeReIDBridge));
      } catch { capture = undefined; }
      setPhoto({ uri: asset.uri, w: asset.width, h: asset.height, capture });
      setOutcome(null);
      setPicks([]);
      runScan(asset.uri);
    });
  }, [runScan]);

  // ── Chọn 1 quả → mở màn khoanh vùng để bồi góc cho ĐÚNG quả đó ─────────────
  const choose = useCallback((c: ResolvedCandidate) => {
    if (!c.treeId) {
      showError('Chưa biết quả này ở cây nào',
        'Máy chủ chưa cho biết cây của quả này, và nó không nằm trong các cây quanh chỗ anh đứng. '
        + 'Anh chọn cây thủ công rồi mở lại quả đó.');
      return;
    }
    if (photo) {
      navigation.navigate('FruitCropper', {
        treeId: c.treeId,
        treeName: c.treeName ?? undefined,
        imageUri: photo.uri,
        imageW: photo.w,
        imageH: photo.h,
        capture: photo.capture,
        fruitId: c.fruitId,
        fruitName: c.name ?? undefined,
      });
    }
  }, [navigation, photo]);

  const sendVerdict = useCallback(async (v: FruitVerdict, correctFruitId?: string) => {
    if (!canSendVerdict(queryId)) return;
    setVerdictSent(v);
    // Bắn-rồi-quên có chủ ý: đây là nhãn hiệu-chỉnh cho OriLife, không phải việc
    // của nông dân. Hỏng thì nhãn mất — KHÔNG chặn họ làm tiếp vì chuyện đó.
    await fruitIdentifyVerdict(BASE_URL, queryId, v, { correctFruitId });
  }, [queryId]);

  const goCrop = useCallback((tree: { tree_id: string; name?: string }) => {
    if (!photo) return;
    navigation.navigate('FruitCropper', {
      treeId: tree.tree_id,
      treeName: tree.name,
      imageUri: photo.uri,
      imageW: photo.w,
      imageH: photo.h,
      capture: photo.capture,
    });
  }, [photo, navigation]);

  /**
   * Đăng ký quả MỚI.
   *
   * ── Vì sao có một hộp hỏi ở giữa ────────────────────────────────────────────
   * Khi màn này mở từ ĐÚNG một cây (`pinnedTreeId`), không có gì phải hỏi.
   * Nhưng mở từ cổng/Trang chủ thì `pinnedTreeId` rỗng, và bản cũ lặng lẽ lấy
   * `around[0].tree` — CÂY GẦN NHẤT theo GPS trong bán kính 60 m
   * (`fruitFind.ts:56`). Sầu riêng trồng cách nhau 8–10 m, còn sai số GPS dưới
   * tán dày là 15–25 m và cộng dồn hai đầu (toạ độ cây cũng đo bằng GPS đó) —
   * nên "gần nhất" thường xuyên không phải cây đang đứng cạnh.
   * Chính tệp `fruitFind.ts:118-121` đã CẤM đúng việc này cho đường nhận-diện,
   * nguyên văn: "KHÔNG suy ra cây gần nhất rồi gán bừa. Gán sai một lần là hồ sơ
   * quả sai vĩnh viễn, mà người dùng không có cách nào biết." Đường đăng-ký nằm
   * trong chính tệp GỌI nó lại đang làm điều bị cấm đó. Nay nó hỏi, và nói ra
   * khoảng cách để người đứng tại chỗ tự phán được.
   */
  const enrollNew = useCallback(() => {
    if (!photo) {
      showError('Chưa có ảnh', 'Anh chụp quả trước đã.');
      return;
    }
    if (pinnedTreeId) {
      const pinned = trees.find(t => t.tree_id === pinnedTreeId);
      if (pinned) { goCrop(pinned); return; }
    }
    const guess = around[0];
    if (!guess) {
      showError('Chưa chọn được cây', 'Anh chọn cây trước rồi đăng ký quả mới trên cây đó.');
      navigation.navigate('TreeManagement');
      return;
    }
    showInfo(
      tk('trace.fruitScan.confirmTreeTitle'),
      tk('trace.fruitScan.confirmTreeBody', {
        name: guess.tree.name ?? '—',
        m: Math.round(guess.distanceM),
      }),
      {
        actions: [
          { text: t('Huỷ'), style: 'cancel' },
          {
            text: tk('trace.fruitScan.confirmTreePick'),
            onPress: () => navigation.navigate('TreeManagement'),
          },
          { text: tk('trace.fruitScan.confirmTreeYes'), onPress: () => goCrop(guess.tree) },
        ],
      },
    );
  }, [pinnedTreeId, trees, around, photo, navigation, goCrop]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back} hitSlop={8}>
          <Icon name="chevron-left" size={26} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Quét quả</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {!photoUri ? (
          <View style={styles.intro}>
            <Icon name="fruit-cherries" size={54} color={COLORS.accent} />
            <Text style={styles.introTitle}>Chụp một quả, máy tìm xem nó là quả nào</Text>
            <Text style={styles.introBody}>
              Đứng gần quả, chụp sao cho quả chiếm phần lớn khung hình. Máy sẽ đưa ra vài quả
              giống nhất để anh chọn — anh là người chốt, không phải máy.
            </Text>
            {here ? (
              <Text style={styles.introNote}>
                {around.length > 0
                  ? `Đang soi quanh ${around.length} cây gần chỗ anh đứng (gần nhất ${formatDistanceVi(around[0].distanceM)}).`
                  : 'Chưa có cây nào có toạ-độ quanh đây — máy sẽ soi toàn kho, chậm và dễ nhầm hơn.'}
              </Text>
            ) : (
              <Text style={styles.introNote}>Chưa bắt được vị trí — máy sẽ soi toàn kho.</Text>
            )}
          </View>
        ) : null}

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator size="large" color={COLORS.accent} />
            <Text style={styles.muted}>{busyNote}</Text>
          </View>
        ) : null}

        {/* Câu của máy chủ — hiện thẳng, không tự dịch lại (thư OriLife 07/08 §5). */}
        {!busy && serverMessage ? <Text style={styles.serverMsg}>{serverMessage}</Text> : null}

        {!busy && outcome === 'pick' ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>Quả nào trong đây?</Text>
            <Text style={styles.resultsNote}>
              Máy chỉ xếp thứ tự giống nhau, nó không phán. Hai quả khác nhau trên cùng một cây
              thường trông giống nhau hơn là cùng một quả chụp hai lần — anh nhìn kỹ rồi chọn.
            </Text>

            {picks.map((c, i) => (
              <TouchableOpacity key={c.fruitId} style={styles.row} activeOpacity={0.75} onPress={() => choose(c)}>
                <Text style={styles.rank}>{i + 1}</Text>
                <RemoteImage
                  uri={absUrl(c.thumbnailUrl)}
                  style={styles.thumb}
                  containerStyle={[styles.thumb, styles.thumbPh]}
                  resizeMode="cover"
                  placeholder={<Icon name="fruit-cherries" size={20} color={COLORS.textMuted} />}
                />
                <View style={styles.rowInfo}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {c.name || `Quả ${c.fruitId.slice(-6)}`}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {c.treeName || (c.treeId ? `Cây ${c.treeId.slice(0, 6)}` : 'chưa rõ cây')}
                    {' · '}{c.nViews} góc
                    {c.status ? ` · ${STATUS_VI[c.status]}` : ''}
                  </Text>
                  {c.treeSource === 'nearby_index' ? (
                    <Text style={styles.rowWeak}>cây do máy này tra từ các cây quanh đây</Text>
                  ) : null}
                  {c.treeSource === 'unknown' ? (
                    <Text style={styles.rowWeak}>chưa tra được cây của quả này</Text>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={20} color={COLORS.textMuted} />
              </TouchableOpacity>
            ))}

            <TouchableOpacity style={styles.secondary} activeOpacity={0.8} onPress={() => {
              sendVerdict('other');
              enrollNew();
            }}>
              <Icon name="plus-circle-outline" size={18} color={COLORS.accent} />
              <Text style={styles.secondaryTxt}>Không quả nào đúng — đăng ký quả mới</Text>
            </TouchableOpacity>

            {/* Nút phán quyết: CHỈ hiện khi có neo query_id (xem canSendVerdict). */}
            {canSendVerdict(queryId) ? (
              <View style={styles.verdictBox}>
                <Text style={styles.verdictLabel}>
                  {verdictSent
                    ? 'Đã ghi nhận. Cảm ơn anh — chính nhãn này giúp máy soi đúng hơn về sau.'
                    : 'Quả đầu danh sách có đúng không? Trả lời giúp máy học.'}
                </Text>
                {!verdictSent ? (
                  <View style={styles.verdictRow}>
                    <TouchableOpacity
                      style={styles.verdictBtn}
                      onPress={() => sendVerdict('correct', picks[0]?.fruitId)}
                    >
                      <Text style={styles.verdictBtnTxt}>Đúng quả đó</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.verdictBtn} onPress={() => sendVerdict('wrong')}>
                      <Text style={styles.verdictBtnTxt}>Không phải</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {!busy && outcome === 'nothing_found' ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>Chưa thấy quả nào giống</Text>
            <Text style={styles.resultsNote}>
              Có thể đây là quả chưa đăng ký. Anh đăng ký nó thành quả mới, hoặc chụp lại gần hơn
              rồi thử lại.
            </Text>
            <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={enrollNew}>
              <Icon name="plus" size={18} color={COLORS.white} />
              <Text style={styles.ctaTxt}>Đăng ký quả mới</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!busy && outcome === 'match_without_list' ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>Chưa chọn được</Text>
            <Text style={styles.resultsNote}>
              Máy nói nó nhận ra quả này nhưng không đưa danh sách để anh đối chiếu. Số đo cho thấy
              lời nói chắc đó chỉ đúng khoảng một nửa số lần, nên bên này không chốt thay anh. Anh
              chọn cây rồi mở danh sách quả của cây đó.
            </Text>
            <TouchableOpacity
              style={styles.cta}
              activeOpacity={0.85}
              onPress={() => navigation.navigate('TreeManagement')}
            >
              <Icon name="tree" size={18} color={COLORS.white} />
              <Text style={styles.ctaTxt}>Chọn cây</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!busy && outcome === 'failed' ? (
          <View style={styles.results}>
            <Text style={styles.resultsTitle}>Chưa soi được</Text>
            <Text style={styles.resultsNote}>
              Không gọi được máy chủ. Đây KHÔNG có nghĩa là quả mới — đăng ký lúc này dễ tạo hồ sơ
              trùng cho một quả đã có. Anh thử lại khi có sóng.
            </Text>
            <TouchableOpacity
              style={styles.cta}
              activeOpacity={0.85}
              onPress={() => photoUri && runScan(photoUri)}
            >
              <Icon name="refresh" size={18} color={COLORS.white} />
              <Text style={styles.ctaTxt}>Soi lại</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!busy ? (
          <TouchableOpacity style={styles.cta} activeOpacity={0.85} onPress={takePhoto}>
            <Icon name="camera" size={20} color={COLORS.white} />
            <Text style={styles.ctaTxt}>{photoUri ? 'Chụp lại' : 'Chụp quả'}</Text>
          </TouchableOpacity>
        ) : null}

        {/* Đường cũ giữ nguyên — không ai bị kẹt ở màn này. */}
        <TouchableOpacity
          style={styles.linkBtn}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('TreeManagement')}
        >
          <Text style={styles.linkTxt}>Hoặc chọn cây trước rồi xem quả của cây</Text>
        </TouchableOpacity>

        {decision ? <Text style={styles.debug}>máy xếp: {decision}</Text> : null}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { padding: 16, paddingBottom: 32 },

  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 10, gap: 4 },
  back: { padding: 4 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: COLORS.text },

  intro: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  introTitle: { fontSize: 17, fontWeight: '700', color: COLORS.text, textAlign: 'center' },
  introBody: { fontSize: 14, color: COLORS.textSub, textAlign: 'center', lineHeight: 21 },
  introNote: { fontSize: 12.5, color: COLORS.textMuted, textAlign: 'center', marginTop: 4 },

  busy: { alignItems: 'center', gap: 10, paddingVertical: 26 },
  muted: { color: COLORS.textMuted, fontSize: 14, textAlign: 'center' },

  serverMsg: {
    fontSize: 14, color: COLORS.textSub, backgroundColor: COLORS.accentGlow,
    borderRadius: 10, padding: 12, marginBottom: 12, lineHeight: 20,
  },

  results: { marginTop: 6 },
  resultsTitle: { fontSize: 17, fontWeight: '800', color: COLORS.text },
  resultsNote: { fontSize: 13, color: COLORS.textSub, lineHeight: 19, marginTop: 4, marginBottom: 10 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  rank: { width: 16, fontSize: 13, fontWeight: '800', color: COLORS.textMuted },
  thumb: { width: 52, height: 52, borderRadius: 8 },
  thumbPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.inputBg },
  rowInfo: { flex: 1 },
  rowName: { fontSize: 15, fontWeight: '600', color: COLORS.text },
  rowSub: { fontSize: 12.5, color: COLORS.textMuted, marginTop: 2 },
  rowWeak: { fontSize: 11.5, color: COLORS.warning, marginTop: 2 },

  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18,
    backgroundColor: COLORS.accent, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 14,
  },
  ctaTxt: { color: COLORS.white, fontSize: 15, fontWeight: '700' },

  secondary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14,
    borderWidth: 1, borderColor: COLORS.accent, paddingVertical: 12, borderRadius: 14,
  },
  secondaryTxt: { color: COLORS.accent, fontSize: 14, fontWeight: '700' },

  verdictBox: {
    marginTop: 18, backgroundColor: COLORS.inputBg, borderRadius: 12, padding: 12, gap: 10,
  },
  verdictLabel: { fontSize: 13, color: COLORS.textSub, lineHeight: 19 },
  verdictRow: { flexDirection: 'row', gap: 10 },
  verdictBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.card,
  },
  verdictBtnTxt: { fontSize: 13.5, fontWeight: '700', color: COLORS.text },

  linkBtn: { alignItems: 'center', paddingVertical: 16 },
  linkTxt: { fontSize: 13.5, color: COLORS.accent, fontWeight: '600' },

  debug: { fontSize: 11, color: COLORS.textMuted, textAlign: 'center' },
});

export default FruitScanScreen;
