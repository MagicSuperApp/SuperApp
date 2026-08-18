// modules/trace/components/TreePublicCard.tsx
//
// THẺ "CÔNG KHAI & MÃ TRUY XUẤT" trong tab Thông tin của một cây.
//
// Nối hai mắt xích trước nay đứt hẳn ở phía app:
//
//   1. BẬT CÔNG KHAI (`POST /api/tree/set_visibility`). Đây là ĐIỀU KIỆN để quả
//      của cây lọt vào tầm tra cứu của người mua — cửa `/api/fruit/lookup` lấy
//      phạm vi đúng bằng "quả thuộc cây nông dân đã bật công khai". Trước bản này
//      app không có đường nào gọi cửa đó, nên đo trên kho sản xuất 08/2026 là
//      **139 cây — 54 riêng tư, 85 chưa đặt, 0 công khai**: không phải nông dân
//      không muốn, mà là không bấm được ở đâu cả.
//
//   2. LẤY MÃ + QR để in (`Provenance.code` → `/qr/{code}`). Màn "Quét truy xuất"
//      đọc được mã `ORI-…` từ lâu, nhưng app chưa từng hiện mã đó ra — quét mãi
//      không ra vì chưa ai in nổi cái mã để mà dán.
//
// ── ĐỌC trạng thái công khai bằng cách nào, và giới hạn của phép đọc đó ───────
// Không có cửa "get_visibility". Ta suy từ `GET /api/provenance/{tree_id}`: máy
// chủ CỐ Ý gộp *cây riêng tư* với *cây không có* thành cùng một 404 (rọc-phách
// §18), nên có thân trả về ⟹ cây đang công khai; 404 ⟹ chưa.
//
// Giới hạn phải nói rõ: phép suy này KHÔNG phân biệt được `public_readonly` với
// `public_contributable`. Nên thẻ chỉ khẳng định "đang công khai / chưa", và khi
// người dùng chọn mức thì hiện đúng mức họ vừa chọn — không bịa ra một mức mà ta
// không đọc được.
//
// ── Vì sao có cả một đoạn cảnh báo trước khi bật ─────────────────────────────
// Bật công khai KHÔNG chỉ là "có trang web để xem". Từ 08/2026 nó còn nghĩa là
// mọi NGƯỜI LẠ đem ảnh tới so được với quả của cây này (`server.py:4066`). Nông
// dân phải biết điều đó TRƯỚC khi bấm — đây là quyết định của họ, không phải mặc
// định của hệ.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Alert,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SvgXml } from 'react-native-svg';
import Icon from '../../../components/Icon';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { getProvenance } from '../../../services/provenanceService';
import {
  setTreeVisibility,
  type TreeVisibility,
} from '../../../services/treeVisibilityService';
import { fetchTreeQrSvg, publicTraceUrl } from '../../../services/treeQrService';
import {
  TONE, NATURE, SURFACE, TYPE, RADIUS, TOUCH_MIN,
} from '../theme/depth';

interface Props {
  /** `tree_id` phía máy chủ — KHÔNG phải id hàng cục bộ. */
  treeId: string;
}

const OPTIONS: { value: TreeVisibility; label: string; hint: string }[] = [
  { value: 'private', label: 'Riêng tư', hint: 'Chỉ mình bạn thấy. Quả không vào tầm tra cứu.' },
  { value: 'public_readonly', label: 'Công khai', hint: 'Người mua tra được xuất xứ. Không ai sửa được gì.' },
  { value: 'public_contributable', label: 'Công khai + góp', hint: 'Người khác còn gửi đóng góp cho cây này.' },
];

const TreePublicCard: React.FC<Props> = ({ treeId }) => {
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [chosen, setChosen] = useState<TreeVisibility | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  /**
   * Đọc lại trạng thái từ cửa công khai.
   *
   * `provenanceService` đã tách sẵn ba nhánh, dùng đúng nhánh chứ đừng suy từ mã
   * HTTP: `not_public` là CÂU TRẢ LỜI (cây riêng tư hoặc chưa đặt), còn `error`
   * mới là hỏng. Gộp hai thứ đó lại thì mất mạng cũng hiện thành "chưa công
   * khai", rồi nông dân bấm bật lại một cây vốn đã bật.
   */
  const refresh = useCallback(async () => {
    setLoading(true);
    setQrError(null);
    const r = await getProvenance(ORILIFE_BASE, treeId);
    const prov = r.kind === 'ok' ? r.provenance : null;
    const c = prov?.code ?? null;
    setIsPublic(r.kind === 'ok');
    setCode(c);
    setLoading(false);

    if (c) {
      // QR chỉ là TIỆN LỢI. Hỏng thì mã chữ vẫn hiện được để người dùng tự dựng
      // QR bằng công cụ khác — đừng để một cửa chưa gọi thật lần nào chặn cả thẻ.
      const q = await fetchTreeQrSvg(ORILIFE_BASE, c);
      if (q.ok && q.svg) setQr(q.svg);
      else setQrError(q.error ?? 'Không lấy được ảnh QR.');
    } else {
      setQr(null);
    }
  }, [treeId]);

  useEffect(() => { refresh(); }, [refresh]);

  const apply = useCallback(async (v: TreeVisibility) => {
    setSaving(true);
    const r = await setTreeVisibility(ORILIFE_BASE, treeId, v);
    setSaving(false);

    if (!r.ok) {
      // Câu của tầng dịch vụ đã phân biệt "hết suất 24 giờ" với "máy chủ bận" —
      // hiện nguyên câu đó, đừng thay bằng câu chung của app.
      Alert.alert('Chưa đổi được', r.error.message);
      return;
    }
    setChosen(v);
    await refresh();
  }, [treeId, refresh]);

  const confirmPublic = useCallback((v: TreeVisibility) => {
    if (v === 'private') { apply(v); return; }
    Alert.alert(
      'Bật công khai cây này?',
      'Người mua sẽ tra được xuất xứ cây, và ẢNH QUẢ của cây này lọt vào tầm so khớp '
      + 'của mọi người lạ dùng chức năng tra cứu. Bạn tắt lại được bất cứ lúc nào.',
      [
        { text: 'Thôi', style: 'cancel' },
        { text: 'Bật công khai', onPress: () => apply(v) },
      ],
    );
  }, [apply]);

  const copyCode = useCallback(() => {
    if (!code) return;
    Clipboard.setString(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [code]);

  const traceUrl = code ? publicTraceUrl(ORILIFE_BASE, code) : null;

  return (
    <View style={s.card}>
      <View style={s.head}>
        <Icon name="qrcode" size={18} color={TONE.primary} />
        <Text style={s.title}>Công khai &amp; mã truy xuất</Text>
      </View>

      <Text style={s.body}>
        Quả chỉ tra cứu được khi cây mẹ đã bật công khai. Đây là quyết định của bạn —
        hệ không tự bật cho cây nào.
      </Text>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={TONE.primary} /></View>
      ) : (
        <>
          <View style={s.status}>
            <View style={[s.dot, { backgroundColor: isPublic ? TONE.primary : NATURE.barkSoft }]} />
            <Text style={s.statusText}>
              {isPublic ? 'Đang công khai' : 'Chưa công khai'}
              {chosen ? ` · ${OPTIONS.find((o) => o.value === chosen)?.label}` : ''}
            </Text>
          </View>

          <View style={s.opts}>
            {OPTIONS.map((o) => {
              const active = chosen === o.value || (!chosen && isPublic && o.value === 'public_readonly');
              return (
                <TouchableOpacity
                  key={o.value}
                  style={[s.opt, active && s.optActive]}
                  disabled={saving}
                  onPress={() => confirmPublic(o.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active, disabled: saving }}
                >
                  <Text style={[s.optLabel, active && s.optLabelActive]}>{o.label}</Text>
                  <Text style={s.optHint}>{o.hint}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {saving && <View style={s.center}><ActivityIndicator color={TONE.primary} /></View>}

          {code ? (
            <View style={s.codeBox}>
              <Text style={s.codeLabel}>MÃ CÔNG KHAI — in ra, dán lên bao bì</Text>
              <TouchableOpacity onPress={copyCode} style={s.codeRow} accessibilityRole="button">
                <Text style={s.code} selectable>{code}</Text>
                <Icon name={copied ? 'check' : 'copy'} size={16} color={TONE.primary} />
              </TouchableOpacity>
              {traceUrl && <Text style={s.url} numberOfLines={1} selectable>{traceUrl}</Text>}

              {qr ? (
                <View style={s.qrWrap}>
                  <SvgXml xml={qr} width={168} height={168} />
                </View>
              ) : (
                <Text style={s.qrErr}>
                  {qrError ?? 'Đang lấy ảnh QR…'}
                  {qrError ? ' Mã chữ ở trên vẫn dùng được để tự tạo QR.' : ''}
                </Text>
              )}
            </View>
          ) : (
            isPublic && (
              <Text style={s.note}>
                Cây đang công khai nhưng máy chủ chưa cấp mã. Mã được cấp SAU khi cây đã
                định danh bằng ảnh.
              </Text>
            )
          )}
        </>
      )}
    </View>
  );
};

const s = StyleSheet.create({
  card: {
    backgroundColor: SURFACE.raised,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: TONE.border,
    padding: 16,
    gap: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...TYPE.cardTitle },
  body: { ...TYPE.caption },
  center: { paddingVertical: 12, alignItems: 'center' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 999 },
  statusText: { ...TYPE.caption, color: NATURE.bark, fontWeight: '600' },
  opts: { gap: 8 },
  opt: {
    minHeight: TOUCH_MIN,
    justifyContent: 'center',
    borderRadius: RADIUS.field,
    borderWidth: 1,
    borderColor: TONE.border,
    backgroundColor: SURFACE.sunken,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  optActive: { borderColor: TONE.primary, backgroundColor: TONE.primarySoft },
  optLabel: { fontSize: 15, fontWeight: '600', color: NATURE.bark },
  optLabelActive: { color: TONE.primaryDeep },
  optHint: { ...TYPE.caption, fontSize: 13, marginTop: 2 },
  codeBox: {
    borderTopWidth: 1,
    borderTopColor: TONE.border,
    paddingTop: 12,
    gap: 8,
  },
  codeLabel: {
    fontSize: 11,
    letterSpacing: 0.8,
    fontWeight: '700',
    color: NATURE.barkSoft,
  },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  code: { fontSize: 17, fontWeight: '700', color: NATURE.bark, letterSpacing: 0.5 },
  url: { ...TYPE.caption, fontSize: 12 },
  qrWrap: { alignItems: 'center', paddingVertical: 10 },
  qrErr: { ...TYPE.caption, fontSize: 13, color: NATURE.barkSoft },
  note: { ...TYPE.caption, fontSize: 13 },
});

export default TreePublicCard;
