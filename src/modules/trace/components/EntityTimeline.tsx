// modules/trace/components/EntityTimeline.tsx
//
// DÒNG THỜI GIAN của một cây / quả — mọi việc đã xảy ra, xếp mới nhất trước.
//
// Vì sao dựng: máy chủ có đường này từ lâu (`GET /api/{entity_type}/{entity_id}/timeline`)
// mà app chưa gọi lần nào — `grep '/timeline' src/` = 0 trước bản này. Tab "Lịch sử"
// ở màn chi tiết cây chỉ đang xếp lại DANH SÁCH QUẢ, tức nó trả lời câu "cây này có
// mấy quả", không trả lời câu "cây này đã trải qua những gì". Người mua nhìn vào cái
// thứ hai.
//
// ⚠ ĐÂY LÀ BẢN DỰNG TẠM (chủ dự án yêu cầu 2026-08-11 để kịp đợt đo thực địa).
// Chưa ai gọi được thân 200 thật: đường đòi phiên DID của một máy thật, mà bên này
// không dựng phiên giả để đo. Hình dạng dưới đây đọc TỪ MÃ MÁY CHỦ
// (`timeline_router.py:164-176`, `timeline_store.py:255-272`), không phải từ một lượt
// gọi thành công. Nên coi phần TRÌNH BÀY là nháp để Tùng dựng lại; phần ĐỌC DỮ LIỆU
// (`services/timelineService.ts`) đã có 14 test khoá theo mã máy chủ.
//
// Nguyên tắc giữ khi dựng tạm: thà hiện ÍT mà đúng, còn hơn hiện đẹp mà đoán. Cụ thể
// là `chain_ok` — app KHÔNG tự kiểm được chuỗi băm (góc nhìn khách bị lược
// `leaf_hash`), nên chỗ đó ghi rõ "máy chủ báo", không ghi "đã kiểm".

import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import Icon from '../../../components/Icon';
import { COLORS } from '../../../constants';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import {
  fetchTimeline, sortNewestFirst, KIND_VI, KIND_ICON, KIND_FALLBACK_ICON,
  type TimelineEntityType, type TimelineEvent, type TimelineResult,
} from '../../../services/timelineService';

interface Props {
  entityType: TimelineEntityType;
  entityId: string;
  /** Số sự kiện hiện tối đa trước khi gộp lại. 0 = hiện hết. */
  limit?: number;
}

/** `2026-08-09T03:12:00+00:00` → `09/08 · 10:12`. Chuỗi hỏng → trả nguyên văn. */
const fmtWhen = (iso: string): string => {
  const t = Date.parse(iso ?? '');
  if (Number.isNaN(t)) return iso || 'chưa rõ lúc nào';
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} · ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/**
 * Một dòng tóm tắt lấy từ `payload`. `payload` là tự do phía máy chủ nên KHÔNG
 * đoán khoá: chỉ lấy vài khoá có tên rõ nghĩa, còn lại bỏ qua. Thà trống còn hơn
 * hiện `[object Object]` cho nông dân.
 */
const summarise = (ev: TimelineEvent): string | null => {
  const p = ev.payload;
  if (!p || typeof p !== 'object') return null;
  for (const key of ['note', 'ghi_chu', 'text', 'message', 'summary']) {
    const v = (p as Record<string, unknown>)[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  const nMedia = Array.isArray(ev.media) ? ev.media.length : 0;
  if (nMedia > 0) return `${nMedia} tệp đính kèm`;
  return null;
};

const EntityTimeline: React.FC<Props> = ({ entityType, entityId, limit = 0 }) => {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<TimelineResult | null>(null);
  const [errText, setErrText] = React.useState<string | null>(null);
  const [errKind, setErrKind] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  // Màn có thể bị tháo trong lúc chờ mạng (nông dân bấm lùi giữa chừng là chuyện
  // thường ngoài vườn). Đặt state vào cây đã tháo là cảnh báo đỏ trên máy thật, nên
  // cả lượt tải đầu lẫn nút "Thử lại" đều đi qua CÙNG một cờ còn-sống. Một bản
  // triển khai, không hai — hai bản là hai chỗ để quên cờ.
  const aliveRef = React.useRef(true);
  React.useEffect(() => {
    aliveRef.current = true;
    return () => { aliveRef.current = false; };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    const r = await fetchTimeline(ORILIFE_BASE, entityType, entityId);
    if (!aliveRef.current) return;
    if (r.ok && r.data) {
      setData(r.data);
      setErrText(null);
      setErrKind(null);
    } else {
      setData(null);
      setErrKind(r.error?.error_code ?? r.error?.type ?? null);
      setErrText(r.error?.detail ?? 'Không tải được dòng thời gian');
    }
    setLoading(false);
  }, [entityType, entityId]);

  React.useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <View style={styles.box}>
        <View style={styles.headRow}>
          <Icon name="clock-rotate-left" size={15} color={COLORS.accent} />
          <Text style={styles.headText}>DÒNG THỜI GIAN</Text>
        </View>
        <ActivityIndicator style={{ marginVertical: 12 }} color={COLORS.accent} />
      </View>
    );
  }

  // "Máy chủ chưa bật" KHÁC "cây chưa có sự kiện nào". Gộp hai cái làm một là nói
  // với nông dân rằng cây của họ chưa có lịch sử, trong khi máy chủ chỉ đang không
  // trả lời câu hỏi đó.
  if (errKind === 'timeline_off') {
    return (
      <View style={styles.box}>
        <View style={styles.headRow}>
          <Icon name="clock-rotate-left" size={15} color={COLORS.textMuted} />
          <Text style={[styles.headText, { color: COLORS.textMuted }]}>DÒNG THỜI GIAN</Text>
        </View>
        <Text style={styles.dim}>
          Bản máy chủ đang chạy chưa bật dòng thời gian. Đây không phải lỗi của cây này.
        </Text>
      </View>
    );
  }

  if (errText) {
    return (
      <View style={styles.box}>
        <View style={styles.headRow}>
          <Icon name="clock-rotate-left" size={15} color={COLORS.textMuted} />
          <Text style={[styles.headText, { color: COLORS.textMuted }]}>DÒNG THỜI GIAN</Text>
          <TouchableOpacity onPress={load} hitSlop={8} style={styles.retryBtn}>
            <Icon name="arrows-rotate" size={12} color={COLORS.accent} />
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.dim}>{errText}</Text>
      </View>
    );
  }

  const all = sortNewestFirst(data?.events ?? []);
  const shown = limit > 0 && !expanded ? all.slice(0, limit) : all;
  const hidden = all.length - shown.length;

  return (
    <View style={styles.box}>
      <View style={styles.headRow}>
        <Icon name="clock-rotate-left" size={15} color={COLORS.accent} />
        <Text style={styles.headText}>DÒNG THỜI GIAN{all.length ? ` · ${all.length}` : ''}</Text>
        {/*
          `chain_ok` là LỜI CỦA MÁY CHỦ, không phải kết quả app tự kiểm: góc nhìn
          khách bị lược `leaf_hash`/`prev_hash` nên app không có gì để băm lại. Chữ
          phải nói đúng ai là người kiểm, nếu không nó là một khẳng định mượn.
        */}
        {data && (
          <View style={[styles.chainChip, { backgroundColor: data.chain_ok ? 'rgba(46,125,70,0.12)' : 'rgba(200,60,40,0.12)' }]}>
            <Icon name={data.chain_ok ? 'shield-halved' : 'triangle-exclamation'} size={10}
              color={data.chain_ok ? '#2E7D46' : COLORS.error} />
            <Text style={[styles.chainText, { color: data.chain_ok ? '#2E7D46' : COLORS.error }]}>
              {data.chain_ok ? 'máy chủ báo chuỗi liền mạch' : 'máy chủ báo chuỗi gãy'}
            </Text>
          </View>
        )}
      </View>

      {all.length === 0 && (
        <Text style={styles.dim}>
          Chưa có sự kiện nào được ghi cho {entityType === 'fruit' ? 'quả' : 'cây'} này.
        </Text>
      )}

      {shown.map((ev, i) => {
        const isLast = i === shown.length - 1 && hidden === 0;
        const label = KIND_VI[ev.kind] ?? String(ev.kind);
        const note = summarise(ev);
        return (
          <View key={ev.event_id ?? `${ev.kind}-${ev.ts}-${i}`} style={styles.row}>
            <View style={styles.rail}>
              <View style={styles.dot}>
                <Icon name={KIND_ICON[ev.kind] ?? KIND_FALLBACK_ICON} size={11} color={COLORS.white} />
              </View>
              {!isLast && <View style={styles.line} />}
            </View>
            <View style={styles.body}>
              <View style={styles.titleRow}>
                <Text style={styles.title} numberOfLines={1}>{label}</Text>
                {/* Chỉ chủ mới thấy event riêng tư/chờ duyệt — đánh dấu để khỏi
                    tưởng người mua cũng nhìn thấy dòng này. */}
                {ev.visibility === 'private' && (
                  <View style={styles.tag}><Text style={styles.tagText}>riêng tư</Text></View>
                )}
                {ev.review === 'pending' && (
                  <View style={styles.tag}><Text style={styles.tagText}>chờ duyệt</Text></View>
                )}
              </View>
              <Text style={styles.when}>{fmtWhen(ev.ts)}</Text>
              {!!note && <Text style={styles.note} numberOfLines={2}>{note}</Text>}
            </View>
          </View>
        );
      })}

      {hidden > 0 && (
        <TouchableOpacity onPress={() => setExpanded(true)} style={styles.moreBtn} activeOpacity={0.85}>
          <Text style={styles.moreText}>Xem thêm {hidden} sự kiện</Text>
          <Icon name="chevron-down" size={12} color={COLORS.accent} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  box: {
    backgroundColor: COLORS.card, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: 12,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' },
  headText: { fontSize: 11, fontWeight: '800', color: COLORS.accent, letterSpacing: 0.6 },
  chainChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8 },
  chainText: { fontSize: 9, fontWeight: '700' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 'auto' },
  retryText: { fontSize: 11, fontWeight: '700', color: COLORS.accent },
  dim: { fontSize: 12, color: COLORS.textSub, lineHeight: 18 },

  row: { flexDirection: 'row', gap: 10 },
  rail: { width: 22, alignItems: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: COLORS.accent, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: COLORS.divider, marginTop: 2, minHeight: 14 },
  body: { flex: 1, paddingBottom: 14 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  title: { fontSize: 13, fontWeight: '800', color: COLORS.text, flexShrink: 1 },
  tag: { backgroundColor: COLORS.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  tagText: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted },
  when: { fontSize: 11, color: COLORS.textSub, marginTop: 2 },
  note: { fontSize: 12, color: COLORS.text, marginTop: 4, lineHeight: 17 },

  moreBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8 },
  moreText: { fontSize: 12, fontWeight: '700', color: COLORS.accent },
});

export default EntityTimeline;
