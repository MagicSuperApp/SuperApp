/**
 * TreePublicCard — Ô TÓM TẮT trạng thái công khai, trong tab "Thông tin" của cây.
 *
 * ⚠ Tệp này KHÔNG còn dựng giao diện bật/tắt và mã QR nữa. Toàn bộ phần đó nay
 * nằm ở `TreePublicSheet`, mở từ nút "Công khai & mã QR" trên thanh dưới của tab
 * Tổng quan.
 *
 * Vì sao gom lại một chỗ: trước đây đây là NƠI DUY NHẤT bật được công khai, và
 * nó nằm khuất trong tab thứ ba. Đo trên kho sản xuất 08/2026: **139 cây — 54
 * riêng tư, 85 chưa đặt, 0 công khai.** Đưa nút ra thanh dưới thì phải có chỗ
 * dựng mới; giữ luôn cả hai bản giao diện thì thành hai màn cùng làm một việc,
 * và sớm muộn hai bản lệch nhau. Nên chỗ này rút về đúng vai của nó: một dòng
 * cho biết cây đang ở trạng thái nào, và một lối đi tới chỗ đổi.
 *
 * Phép đọc trạng thái vẫn như cũ và vẫn cùng một giới hạn: không có cửa
 * "get_visibility", ta suy từ `GET /api/provenance/{tree_id}` — máy chủ cố ý gộp
 * *cây riêng tư* với *cây không có* thành cùng một 404. Nên chỉ khẳng định được
 * "đang công khai / chưa", không phân biệt được mức.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from '../../../components/Icon';
import { ORILIFE_BASE } from '../../../services/orilifeBase';
import { getProvenance } from '../../../services/provenanceService';
import TreePublicSheet from './TreePublicSheet';
import { NATURE, RADIUS, SPACE, SURFACE, TONE, TOUCH_MIN, TYPE } from '../theme/depth';

interface Props {
  /** `tree_id` phía máy chủ — KHÔNG phải id hàng cục bộ. */
  treeId: string;
}

const TreePublicCard: React.FC<Props> = ({ treeId }) => {
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await getProvenance(ORILIFE_BASE, treeId);
    if (!alive.current) return;
    // `not_public` là CÂU TRẢ LỜI, `error` mới là hỏng — đừng gộp, nếu không mất
    // mạng cũng hiện thành "chưa công khai".
    setIsPublic(r.kind === 'ok');
    setCode(r.kind === 'ok' ? (r.provenance.code ?? null) : null);
    setLoading(false);
  }, [treeId]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [s.card, pressed && s.pressed]}
        accessibilityRole="button"
        accessibilityLabel="Công khai và mã truy xuất"
      >
        <View style={s.icon}>
          <Icon name="qrcode" size={17} color={TONE.primaryDeep} />
        </View>

        <View style={s.text}>
          <Text style={s.title}>Công khai &amp; mã truy xuất</Text>
          {loading ? (
            <ActivityIndicator style={s.spin} size="small" color={TONE.primary} />
          ) : (
            <Text style={s.sub} numberOfLines={1}>
              {isPublic ? 'Đang công khai' : 'Chưa công khai'}
              {code ? ` · ${code}` : ''}
            </Text>
          )}
        </View>

        <Icon name="chevron-right" size={14} color={NATURE.barkSoft} />
      </Pressable>

      <TreePublicSheet
        visible={open}
        onClose={() => { setOpen(false); refresh(); }}
        treeId={treeId}
      />
    </>
  );
};

export default TreePublicCard;

const s = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: SPACE.md,
    minHeight: TOUCH_MIN,
    backgroundColor: SURFACE.raised,
    borderRadius: RADIUS.card,
    borderWidth: 1, borderColor: TONE.border,
    paddingHorizontal: SPACE.md, paddingVertical: SPACE.md,
  },
  pressed: { opacity: 0.92 },
  icon: {
    width: 34, height: 34, borderRadius: RADIUS.field,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: TONE.primarySoft,
  },
  text: { flex: 1, minWidth: 0 },
  title: { ...TYPE.cardTitle, fontSize: 15.5 },
  sub: { ...TYPE.caption, fontSize: 13, marginTop: 1 },
  spin: { alignSelf: 'flex-start', marginTop: 3 },
});
