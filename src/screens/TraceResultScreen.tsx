// screens/TraceResultScreen.tsx
//
// MÀN NGUỒN GỐC — góc NGƯỜI MUA, không đăng nhập.
//
// VÌ SAO có màn riêng, dù `traceScan.ts` từng ghi "KHÔNG dựng màn provenance mới":
// dòng đó viết khi tin rằng `TreeDetail` dùng lại được. Đọc lại thì không:
// `TreeDetailScreen` tra cây trong Redux `state.farm.trees` — tức vườn của CHÍNH
// người đang đăng nhập. Người mua quét mã trên bao bì không có cây nào trong store.
//
// ══ BỐ CỤC THEO CÂU HỎI CỦA NGƯỜI MUA ══════════════════════════════════════════
// Họ đang đứng ở sạp, cầm quả trên tay, và hỏi theo đúng thứ tự này:
//
//   1. "Trông nó thế nào?"   → DẢI ẢNH, hết bề ngang, vuốt được. Trên cùng.
//   2. "Cây gì, của ai?"     → tên cây + mã + chủ vườn, ngay dưới ảnh.
//   3. "Ở đâu?"              → một DÒNG ĐỊA CHỈ đọc được (không phải bản đồ).
//   4. "Đã trải qua gì?"     → nhật ký cây.
//
// Bản đồ, khối 3D, và khối neo chuỗi là PHỤ — chúng trả lời câu "chứng minh đi",
// mà đó là câu hỏi thứ năm, và chỉ một phần người mua hỏi tới. Vì vậy cả ba nằm
// trong các mục GẬP ở cuối, đóng sẵn. Gập không chỉ để gọn: bản đồ MapLibre và
// Canvas 3D mỗi thứ là một bề mặt GL, và mount cả hai cùng lúc cho một người chỉ
// nhìn được một là làm máy yếu nóng lên giữa lúc họ đang xem kỹ.
//
// ══ HAI CHỖ MÁY CHỦ KHÔNG TRẢ LỜI, VÀ MÀN PHẢI NÓI RA ══════════════════════════
// Đo trên thân thật 2026-08-19 (`GET /api/tree_by_code/ORI-w7er6uf-Z9MMB2PS`):
//
//   · **Không có trường nào về CHỦ VƯỜN.** Allowlist `_public_prov` trả đúng:
//     anchor · code · created_at · embedding_hash · gps · images · lampnet_base ·
//     lampnet_pending · lampnet_view · model3d · n_views · name · record_cid ·
//     record_hash · tree_id. Người mua hỏi "của ai" trước tiên, nên ô ấy KHÔNG
//     được bỏ trống lặng lẽ — nó nói thẳng là máy chủ chưa công khai.
//
//   · **Không có địa chỉ, chỉ có `gps: [20.989, 105.944]`.** Hai con số ấy không
//     nói gì với người đang đứng ở sạp, và bản trước hiện thẳng câu "máy chủ chưa
//     cho biết vị trí này chính xác tới đâu" — một câu nói về SỰ THIẾU CỦA MÁY CHỦ
//     chứ không trả lời câu hỏi của người mua. Nay app tự tra ngược toạ độ ra địa
//     chỉ hành chính qua chính nền bản đồ đang dùng (Nominatim/OSM, xem
//     `reverseGeocode`), và bản đồ cắm GHIM kèm nút Chỉ đường. Tra hỏng thì lùi về
//     toạ độ thô — vẫn là một thứ chép được và dán vào Google Maps.
//
//   · **Dòng thời gian đòi phiên đăng nhập.** `GET /api/tree/{id}/timeline` trả
//     `401 {"error":"Cần đăng nhập."}` cho khách. Nên với người mua, khối nhật ký
//     rơi về HAI MỐC đọc được từ chính hồ sơ (ngày đăng ký, lượt neo chuỗi), và
//     nói rõ đó là mốc của hồ sơ xuất xứ chứ không phải nhật ký chăm sóc.
//
// LUẬT CỦA MÀN NÀY: không có số thì để trống, không điền số thay máy chủ.
//  · `not_public` là một CÂU TRẢ LỜI (cây riêng tư HOẶC không có — máy chủ cố ý gộp
//    hai ca, spec rọc-phách §18) → nói đúng cả hai khả năng, KHÔNG nói "không tồn tại".
//  · lỗi mạng KHÔNG được hiện thành "mã không hợp lệ" — đó là bịa câu trả lời từ một
//    phép đo hỏng. Nhánh riêng, có nút thử lại.
//  · số ảnh gọi ĐÚNG TÊN "góc chụp lúc đăng ký", không gọi là "số bằng chứng":
//    `images[] ↔ n_views ↔ embedding_hash` cùng mô tả MỘT tập góc lúc đăng ký
//    (thư OriLife 2026-08-17 §2, dẫn `server.py:1128`, `:3133`); lượt `verify_add`
//    và khung `tree_video` KHÔNG vào đó.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text,
  useWindowDimensions, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import Clipboard from '@react-native-clipboard/clipboard';

import Icon, { type IconName } from '../components/Icon';
import { API_BASE_URL } from '../constants';
import EntityTimeline from '../modules/trace/components/EntityTimeline';
import {
  ELEVATION, NATURE, RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE,
} from '../modules/trace/theme/depth';
import {
  getProvenance, getTreeByCode, gpsPrecision, gpsRadiusMeters,
  isAnchored, type Provenance, type ProvenanceResult,
} from '../services/provenanceService';
import TreeGallery from '../features/traceResult/TreeGallery';
import TreeLocationMap from '../features/traceResult/TreeLocationMap';
import TreePointCloudView from '../features/traceResult/TreePointCloudView';
import {
  anchorView, coverageLine, galleryUrls, gpsPoint, milestones, model3dOf, model3dUrl,
  ownerLine, trustBadge,
} from '../features/traceResult/provenanceView';
import { formatLatLon, reverseGeocode } from '../features/traceResult/reverseGeocode';
import { t, tf } from '../i18n';

export const TRACE_RESULT_ROUTE_NAME = 'TraceResult';

interface RouteParams {
  /** Mã in trên bao bì (`ORI-…`). Một trong hai tham số, ưu tiên mã. */
  code?: string;
  /** `tree_id` khi tới từ deep-link đã biết id. */
  treeId?: string;
}

type State =
  | { s: 'loading' }
  | { s: 'ok'; prov: Provenance }
  | { s: 'not_public' }
  | { s: 'error'; detail: string };

/** Chiều cao dải ảnh: 4:3 cắt bớt cho gọn, chặn trên để máy màn dài không mất hết trang. */
const HERO_RATIO = 0.78;
const HERO_MAX = 400;

/** Ngày giờ máy chủ → câu tiếng Việt. Chuỗi lạ thì trả `null`, không in chuỗi thô. */
function formatVi(iso?: string | null): string | null {
  if (typeof iso !== 'string' || !iso.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const p2 = (n: number) => String(n).padStart(2, '0');
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Mảnh dùng lại
// ═══════════════════════════════════════════════════════════════════════════

/** Một dòng thông tin. `value === null` ⇒ nói rõ máy chủ chưa cho biết, không bịa. */
const Fact: React.FC<{
  icon: IconName; label: string; value: string | null; emptyText?: string;
}> = ({ icon, label, value, emptyText }) => (
  <View style={styles.fact}>
    <View style={styles.factIcon}>
      <Icon name={icon} size={15} color={TONE.primary} />
    </View>
    <View style={styles.factBody}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={[styles.factValue, value === null && styles.factEmpty]}>
        {value === null ? (emptyText ?? 'Máy chủ chưa cho biết') : value}
      </Text>
    </View>
  </View>
);

/**
 * Mục GẬP cho phần phụ. Nội dung chỉ dựng KHI MỞ.
 *
 * `render` là một hàm chứ không phải node: nếu nhận node thì React đã dựng
 * xong phần tử trước khi mục kịp quyết có mở hay không, và với bản đồ / Canvas
 * 3D thì "đã dựng" nghĩa là đã chiếm một bề mặt GL. Truyền hàm thì đóng = chưa
 * gọi = chưa tốn gì.
 */
const Fold: React.FC<{
  icon: IconName; title: string; hint?: string | null; render: () => React.ReactNode;
}> = ({ icon, title, hint, render }) => {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.fold}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        style={({ pressed }) => [styles.foldHead, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Icon name={icon} size={16} color={TONE.primary} />
        <View style={styles.foldTitleWrap}>
          <Text style={styles.foldTitle}>{title}</Text>
          {hint && !open ? <Text style={styles.foldHint} numberOfLines={1}>{hint}</Text> : null}
        </View>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={14} color={NATURE.barkSoft} />
      </Pressable>
      {open ? <View style={styles.foldBody}>{render()}</View> : null}
    </View>
  );
};

// ═══════════════════════════════════════════════════════════════════════════

const TraceResultScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation: any = useNavigation();
  const route = useRoute();
  const { width: winW } = useWindowDimensions();
  const params = route.params as RouteParams | undefined;
  const code = params?.code?.trim() || '';
  const treeId = params?.treeId?.trim() || '';

  const [state, setState] = useState<State>({ s: 'loading' });
  const [copied, setCopied] = useState(false);
  /** Địa chỉ tra ngược từ toạ độ. `null` = chưa tra xong hoặc tra không ra. */
  const [address, setAddress] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState({ s: 'loading' });
    let r: ProvenanceResult;
    if (code) r = await getTreeByCode(API_BASE_URL, code);
    else if (treeId) r = await getProvenance(API_BASE_URL, treeId);
    else {
      // Không tham số nào — lỗi của chỗ điều hướng, không phải của máy chủ.
      setState({ s: 'error', detail: 'Thiếu mã cây' });
      return;
    }
    if (r.kind === 'ok') setState({ s: 'ok', prov: r.provenance });
    else if (r.kind === 'not_public') setState({ s: 'not_public' });
    else setState({ s: 'error', detail: r.error.detail });
  }, [code, treeId]);

  useEffect(() => { void load(); }, [load]);

  /**
   * Tra ngược toạ độ ra địa chỉ, SAU khi đã có hồ sơ.
   *
   * Đây là lượt gọi duy nhất trong màn đi ra một máy chủ NGOÀI hệ thống, nên nó
   * chỉ mang đi hai con số mà máy chủ đã công khai — không mã cây, không token.
   * Hỏng thì im lặng: `address` ở nguyên `null` và màn lùi về toạ độ thô, chứ
   * không hiện thêm một dòng lỗi cho một thứ người dùng không yêu cầu.
   */
  useEffect(() => {
    const pt = state.s === 'ok' ? gpsPoint(state.prov) : null;
    if (!pt) { setAddress(null); return; }
    let alive = true;
    reverseGeocode(pt.lat, pt.lon).then((r) => {
      if (alive && r.kind === 'ok') setAddress(r.line);
    });
    return () => { alive = false; };
  }, [state]);

  const safeBack = () => {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main');
  };

  const prov = state.s === 'ok' ? state.prov : null;

  const view = useMemo(() => {
    if (!prov) return null;
    const prec = gpsPrecision(prov);
    return {
      images: galleryUrls(prov),
      owner: ownerLine(prov),
      prec,
      point: gpsPoint(prov),
      radius: gpsRadiusMeters(prov),
      anchored: isAnchored(prov),
      anchor: anchorView(prov),
      marks: milestones(prov),
      modelUrl: model3dUrl(prov),
      model: model3dOf(prov),
      advice: coverageLine(prov),
      planted: formatVi(prov.created_at),
    };
  }, [prov]);

  const heroH = Math.min(HERO_MAX, Math.round(winW * HERO_RATIO));

  const Header = (
    <View style={[styles.header, { paddingTop: insets.top + SPACE.sm }]}>
      <Pressable onPress={safeBack} style={styles.backBtn} hitSlop={10} accessibilityLabel={t('Đóng')}>
        <Icon name="chevron-left" size={20} color={NATURE.bark} />
      </Pressable>
      <Text style={styles.headerTitle}>Nguồn gốc</Text>
      <View style={styles.backBtnGhost} />
    </View>
  );

  if (state.s === 'loading') {
    return (
      <View style={styles.root}>
        {Header}
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TONE.primary} />
          <Text style={[TYPE.caption, styles.centerTxt]}>Đang tra máy chủ…</Text>
        </View>
      </View>
    );
  }

  // `not_public`: máy chủ CỐ Ý gộp "cây riêng tư" với "không có mã này" vào cùng
  // một câu trả lời, để mã lộ trên bao bì không dò được vườn riêng của người khác.
  // App không biết là ca nào ⇒ nói cả hai, không chọn bừa một.
  if (state.s === 'not_public') {
    return (
      <View style={styles.root}>
        {Header}
        <View style={styles.center}>
          <Icon name="lock" size={44} color={TONE.primarySoft} />
          <Text style={[TYPE.section, styles.centerTitle]}>Không xem được hồ sơ này</Text>
          <Text style={[TYPE.caption, styles.centerTxt]}>
            Mã có thể thuộc một cây chủ vườn để riêng tư, hoặc chưa có trong hệ thống.
            Máy chủ không phân biệt hai trường hợp này.
          </Text>
          {!!code && (
            <View style={styles.codeCard}>
              <Text style={styles.codeLabel}>MÃ ĐÃ TRA</Text>
              <Text style={styles.codeVal}>{code}</Text>
            </View>
          )}
          <Pressable onPress={safeBack} hitSlop={8}>
            <Text style={styles.linkText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Lỗi mạng/máy chủ — KHÁC hẳn `not_public`. Gộp hai cái này lại là nói với người
  // mua rằng mã sai trong khi thật ra mình chưa hỏi được máy chủ.
  if (state.s === 'error') {
    return (
      <View style={styles.root}>
        {Header}
        <View style={styles.center}>
          <Icon name="wifi" size={44} color={TONE.primarySoft} />
          <Text style={[TYPE.section, styles.centerTitle]}>Chưa tra được</Text>
          <Text style={[TYPE.caption, styles.centerTxt]}>
            Chưa hỏi được máy chủ nên chưa biết mã này có hồ sơ hay không.
          </Text>
          <Text style={styles.errDetail}>{state.detail}</Text>
          <Pressable style={styles.primaryBtn} onPress={load}>
            <Icon name="arrows-rotate" size={16} color={NATURE.paper} />
            <Text style={styles.primaryBtnText}>Thử lại</Text>
          </Pressable>
          <Pressable onPress={safeBack} hitSlop={8}>
            <Text style={styles.linkText}>Đóng</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const p = state.prov;
  const v = view!;
  const badge = trustBadge(v.anchored);

  /**
   * Dòng "nơi trồng", ba tầng lùi:
   *   1. địa chỉ tra ngược được  → "Vinhomes Ocean Park, Xã Gia Lâm, Hà Nội"
   *   2. chưa tra ra nhưng CÓ toạ độ → chính hai con số, vẫn chép dán được
   *   3. không có toạ độ nào → `null`, và `Fact` nói rõ là chưa có
   *
   * Tầng 2 mới là chỗ đổi so với bản trước: có toạ độ trong tay mà lại đi hiện
   * "máy chủ chưa cho biết vị trí này chính xác tới đâu" là trả lời một câu người
   * mua không hỏi, và giấu mất thứ duy nhất họ dùng được.
   */
  const placeLine = address ?? (v.point ? formatLatLon(v.point.lat, v.point.lon) : null);

  const copyCode = () => {
    if (!p.code) return;
    Clipboard.setString(p.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const openUrl = (u: string | null) => {
    if (!u) return;
    Linking.openURL(u).catch(() => { /* máy không có trình duyệt — không có gì để làm thêm */ });
  };

  return (
    <View style={styles.root}>
      {Header}
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + SPACE.section }]}>

        {/* ── 1. TRÔNG NÓ THẾ NÀO ────────────────────────────────────────── */}
        <TreeGallery urls={v.images} width={winW} height={heroH} />

        <View style={styles.page}>
          {/* ── 2. CÂY GÌ, CỦA AI ────────────────────────────────────────── */}
          <Text style={styles.treeName}>{p.name?.trim() || 'Cây chưa đặt tên'}</Text>

          {p.code ? (
            <Pressable onPress={copyCode} style={styles.codeRow} hitSlop={6}>
              <Text style={styles.codeInline}>{p.code}</Text>
              <Icon name={copied ? 'check' : 'copy'} size={12} color={NATURE.barkSoft} />
              {copied ? <Text style={styles.copied}>đã chép</Text> : null}
            </Pressable>
          ) : null}

          <View style={[styles.badge, badge.tone === 'ok' && styles.badgeOk,
            badge.tone === 'warn' && styles.badgeWarn]}>
            <Icon
              name={badge.tone === 'ok' ? 'shield-halved' : badge.tone === 'warn' ? 'circle-info' : 'circle-question'}
              size={13}
              color={badge.tone === 'ok' ? TONE.primaryDeep : badge.tone === 'warn' ? TONE.sun : NATURE.barkSoft}
            />
            <Text style={[styles.badgeTxt, badge.tone === 'ok' && styles.badgeTxtOk,
              badge.tone === 'warn' && styles.badgeTxtWarn]}>
              {badge.text}
            </Text>
          </View>

          {/* Thẻ trả lời hai câu hỏi đầu của người mua, đặt ngay dưới tên cây. */}
          <View style={styles.card}>
            {/* ⚠ Máy chủ KHÔNG trả trường nào về chủ vườn (xem đầu tệp). Ô này để
                trống có chủ đích, và câu trống nói rõ vì sao — người mua hỏi "của
                ai" trước tiên, nên bỏ hẳn dòng này là giấu mất câu hỏi của họ. */}
            <Fact
              icon="user"
              label="CHỦ VƯỜN"
              value={v.owner}
              emptyText="Hồ sơ công khai chưa kèm tên chủ vườn"
            />
            <View style={styles.hair} />
            <Fact
              icon="location-dot"
              label="NƠI TRỒNG"
              value={placeLine}
              emptyText="Chưa có thông tin vị trí"
            />
            <View style={styles.hair} />
            <Fact icon="calendar" label="ĐĂNG KÝ TỪ" value={v.planted} />
          </View>

          {/* ── 3. ĐÃ TRẢI QUA GÌ ────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Nhật ký cây</Text>

          {/*
            Hai mốc từ CHÍNH hồ sơ xuất xứ. Với người mua thì đây thường là tất cả
            những gì họ thấy: khối `EntityTimeline` bên dưới gọi một đường đòi phiên
            đăng nhập (đo 19/08: khách nhận 401), nên nó sẽ tự nói là chưa xem được.
            Hai mốc này không thay thế nhật ký chăm sóc, và chữ ở dưới nói rõ thế.
          */}
          {v.marks.length > 0 ? (
            <View style={styles.card}>
              {v.marks.map((m, i) => (
                <View key={m.key} style={styles.mark}>
                  <View style={styles.markRail}>
                    <View style={styles.markDot} />
                    {i < v.marks.length - 1 ? <View style={styles.markLine} /> : null}
                  </View>
                  <View style={styles.markBody}>
                    <Text style={styles.markWhen}>{formatVi(m.at) ?? 'chưa rõ ngày'}</Text>
                    <Text style={styles.markTitle}>{m.title}</Text>
                    {m.note ? <Text style={styles.markNote}>{m.note}</Text> : null}
                  </View>
                </View>
              ))}
              <Text style={styles.markFoot}>
                Hai mốc trên đọc từ hồ sơ xuất xứ, không phải từ nhật ký chăm sóc.
              </Text>
            </View>
          ) : null}

          {/* Nhật ký chăm sóc đầy đủ — chỉ mở được khi có phiên của chủ vườn. */}
          {p.tree_id ? (
            <EntityTimeline
              entityType="tree"
              entityId={p.tree_id}
              limit={5}
              authHint="Nhật ký chăm sóc chi tiết chỉ mở cho chủ vườn khi đã đăng nhập. Các mốc của hồ sơ xuất xứ ở trên thì ai cũng xem được."
            />
          ) : null}

          {/* ── 4. PHẦN PHỤ — chứng minh, cho ai muốn xem kỹ ──────────────── */}
          <Text style={styles.sectionTitle}>Xem kỹ hơn</Text>

          {v.point ? (
            <Fold
              icon="map-location-dot"
              title="Vị trí trên bản đồ"
              hint={placeLine}
              // Bản đồ chỉ mount khi mở — xem chú thích ở `Fold`.
              render={() => (
                <TreeLocationMap
                  lat={v.point!.lat}
                  lon={v.point!.lon}
                  // Vòng CHỈ vẽ khi máy chủ tự khai là đã làm thô. Không khai gì
                  // thì `radiusM` là null và bản đồ chỉ cắm ghim — xem đầu
                  // `TreeLocationMap`.
                  radiusM={v.prec === 'coarse' ? v.radius : null}
                  caption={placeLine}
                  label={p.name?.trim() || null}
                  width={winW - SPACE.page * 2 - SPACE.lg * 2}
                />
              )}
            />
          ) : null}

          {v.modelUrl ? (
            <Fold
              icon="cube"
              title="Không gian ba chiều của cây"
              hint={
                typeof v.model?.n_points === 'number'
                  ? tf('{n} điểm', { n: v.model.n_points.toLocaleString('vi-VN') })
                  : null
              }
              render={() => (
                <TreePointCloudView
                  url={v.modelUrl!}
                  advice={v.advice}
                  declaredPoints={typeof v.model?.n_points === 'number' ? v.model.n_points : null}
                />
              )}
            />
          ) : null}

          {v.anchor ? (
            <Fold
              icon="link"
              title="Neo lên chuỗi khối"
              hint={v.anchor.status}
              render={() => (
                <View>
                  <Fact icon="circle-check" label="TRẠNG THÁI" value={v.anchor!.status} />
                  <View style={styles.hair} />
                  <Fact icon="circle-nodes" label="MẠNG" value={v.anchor!.network} />
                  <View style={styles.hair} />
                  <Fact icon="certificate" label="MÃ GIAO DỊCH" value={v.anchor!.txShort} />
                  <View style={styles.hair} />
                  <Fact icon="clock" label="GỬI NEO LÚC" value={formatVi(v.anchor!.submittedAt)} />
                  {/* `explorer_url` do máy chủ gửi và app mở thẳng — `anchorView`
                      đã lọc chỉ còn http(s) trước khi tới đây. */}
                  {v.anchor!.explorer ? (
                    <Pressable style={styles.ghostBtn} onPress={() => openUrl(v.anchor!.explorer)}>
                      <Icon name="arrow-up-right-from-square" size={14} color={TONE.primary} />
                      <Text style={styles.ghostBtnTxt}>Mở trang tra chuỗi</Text>
                    </Pressable>
                  ) : null}
                </View>
              )}
            />
          ) : null}

          <Fold
            icon="images"
            title="Góc chụp lúc đăng ký"
            hint={v.images.length ? tf('{n} ảnh', { n: v.images.length }) : null}
            render={() => (
              <Text style={[TYPE.caption]}>
                {/* Tên đúng của con số: đây là số GÓC lúc đăng ký, KHÔNG phải số
                    bằng chứng tích luỹ. Gọi sai tên là làm hồ sơ trông dày hơn
                    thực tế. Xem thư OriLife 17/08 §2. */}
                {v.images.length
                  ? tf('Cây được chụp {n} góc lúc đăng ký. Đây là tập ảnh máy dùng để nhận lại cây, không phải toàn bộ ảnh đã chụp về sau.', { n: v.images.length })
                  : 'Hồ sơ này chưa kèm ảnh đăng ký nào.'}
              </Text>
            )}
          />

          <Text style={styles.foot}>
            Hồ sơ do máy chủ OriLife cung cấp. Mục nào để trống là mục máy chủ chưa cho biết —
            app không tự điền.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SURFACE.ground },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACE.md, paddingBottom: SPACE.md,
    backgroundColor: SURFACE.ground,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: SURFACE.raised, ...ELEVATION.card,
  },
  backBtnGhost: { width: 36 },
  headerTitle: { ...TYPE.cardTitle },
  body: { paddingBottom: SPACE.section },
  page: { paddingHorizontal: SPACE.page, paddingTop: SPACE.lg, gap: SPACE.md },

  treeName: { ...TYPE.title },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -SPACE.sm },
  codeInline: { fontSize: 13, color: NATURE.barkSoft, letterSpacing: 0.5 },
  copied: { fontSize: 11, color: TONE.primary, fontWeight: '600' },

  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start',
    borderRadius: RADIUS.chip, paddingHorizontal: 11, paddingVertical: 6,
    backgroundColor: NATURE.soilDeep,
  },
  badgeOk: { backgroundColor: TONE.primarySoft },
  badgeWarn: { backgroundColor: TONE.sunSoft },
  badgeTxt: { fontSize: 12.5, fontWeight: '600', color: NATURE.barkSoft },
  badgeTxtOk: { color: TONE.primaryDeep },
  badgeTxtWarn: { color: TONE.sun },

  sectionTitle: { ...TYPE.section, marginTop: SPACE.md },

  card: {
    backgroundColor: SURFACE.raised, borderRadius: RADIUS.card, padding: SPACE.lg,
    borderWidth: 1, borderColor: TONE.border, ...ELEVATION.card,
  },
  hair: { height: 1, backgroundColor: TONE.border, marginVertical: SPACE.md },

  fact: { flexDirection: 'row', gap: SPACE.md, alignItems: 'flex-start' },
  factIcon: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center', backgroundColor: TONE.primarySoft,
  },
  factBody: { flex: 1 },
  factLabel: { fontSize: 11, letterSpacing: 0.6, color: NATURE.barkSoft, fontWeight: '600' },
  factValue: { fontSize: 15.5, lineHeight: 22, color: NATURE.bark, fontWeight: '600', marginTop: 3 },
  factEmpty: { fontWeight: '400', color: NATURE.barkSoft, fontStyle: 'italic', fontSize: 14 },

  mark: { flexDirection: 'row', gap: SPACE.md },
  markRail: { width: 12, alignItems: 'center' },
  markDot: {
    width: 10, height: 10, borderRadius: 5, marginTop: 5,
    backgroundColor: TONE.primary,
  },
  markLine: { flex: 1, width: 2, backgroundColor: TONE.primarySoft, marginVertical: 3 },
  markBody: { flex: 1, paddingBottom: SPACE.lg },
  markWhen: { fontSize: 11.5, color: NATURE.barkSoft, letterSpacing: 0.4 },
  markTitle: { fontSize: 15.5, fontWeight: '600', color: NATURE.bark, marginTop: 2 },
  markNote: { fontSize: 13.5, color: NATURE.barkSoft, marginTop: 2 },
  markFoot: { fontSize: 12, lineHeight: 18, color: NATURE.barkSoft, fontStyle: 'italic' },

  fold: {
    backgroundColor: SURFACE.raised, borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: TONE.border, overflow: 'hidden',
  },
  foldHead: {
    minHeight: TOUCH_MIN, flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    paddingHorizontal: SPACE.lg,
  },
  foldTitleWrap: { flex: 1, paddingVertical: SPACE.md },
  foldTitle: { fontSize: 15.5, fontWeight: '600', color: NATURE.bark },
  foldHint: { fontSize: 12.5, color: NATURE.barkSoft, marginTop: 2 },
  foldBody: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg },

  ghostBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    minHeight: 48, borderRadius: RADIUS.field, marginTop: SPACE.lg,
    borderWidth: 1, borderColor: TONE.primary,
  },
  ghostBtnTxt: { fontSize: 14.5, fontWeight: '600', color: TONE.primary },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACE.xxl, gap: SPACE.md },
  centerTitle: { textAlign: 'center' },
  centerTxt: { textAlign: 'center' },
  errDetail: { fontSize: 12, color: NATURE.barkSoft, textAlign: 'center' },
  foot: { fontSize: 12, lineHeight: 18, color: NATURE.barkSoft, marginTop: SPACE.sm },

  codeCard: {
    backgroundColor: SURFACE.raised, borderRadius: RADIUS.field,
    borderWidth: 1, borderColor: TONE.border,
    paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg,
    alignItems: 'center', gap: SPACE.xs, maxWidth: '100%',
  },
  codeLabel: { fontSize: 11, color: NATURE.barkSoft, letterSpacing: 1 },
  codeVal: { fontSize: 13, fontWeight: '600', color: NATURE.bark, textAlign: 'center' },

  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACE.sm,
    backgroundColor: TONE.primary, borderRadius: RADIUS.field,
    paddingVertical: 15, paddingHorizontal: SPACE.xxl, marginTop: SPACE.xs,
  },
  primaryBtnText: { color: NATURE.paper, fontSize: 15, fontWeight: '700' },
  linkText: { color: TONE.primary, fontSize: 14, marginTop: SPACE.xs },
  pressed: { opacity: 0.7 },
});

export default TraceResultScreen;
