/**
 * Dải ảnh xem lại — hiện máy đã xếp từng tấm vào THÂN hay GỐC, cho sửa, KHÔNG bắt sửa.
 *
 * ── Vì sao nó ở đây, và vì sao nó không chặn đường ────────────────────────────
 *
 * Chủ sở hữu chốt 2026-09-19, hai câu ghép lại thành đúng một ràng buộc:
 *
 *   *"Phải cho sửa lại được nhưng k bắt buộc, đừng tin tưởng vào sự nỗ lực của
 *   người dùng."*
 *   *"Việc của OriLife là phải làm tăng độ chính xác của kết quả chứ k phải cứ
 *   để cho phép máy đoán sai."*
 *
 * Nên dải này KHÔNG phải một bước phải qua. Nó nằm giữa lúc chụp xong và nút Nhận
 * diện; người không chạm gì thì bấm thẳng Nhận diện, đúng như trước. Một dải BẮT
 * BUỘC phải duyệt sẽ biến lỗi của máy thành việc của nông dân — đó là chiều ngược
 * với câu thứ hai.
 *
 * ── Vì sao nó CÓ mặt, dù máy đã tự đoán ──────────────────────────────────────
 *
 * Phép đoán hiện nay là gián tiếp: nó đọc GÓC CHÚC của ống kính (`treeCaptureParts.ts`),
 * không nhìn vào cái cây. Nó không phân biệt được một tấm có cả thân lẫn gốc, và
 * nó mù ở máy không trả `pitch`. Chừng nào máy chủ chưa trả nhãn từng ảnh thì dải
 * này là đường duy nhất để một phán đoán sai không đi thẳng vào lượt nhận diện.
 *
 * ⚠ Ảnh chỉ tới được tầng JS sau `stopCaptureSession()` — `CaptureTriggered` lúc
 * đang chụp KHÔNG mang `fileURL` (`treeReIDNativeBridge.ts:64-70` so với `:21-30`).
 * Nên chỗ đặt dải này là SAU khi dừng chụp, và đó là ràng buộc của tầng native,
 * không phải một lựa chọn giao diện.
 */
import React from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity, StyleSheet,
} from 'react-native';

import {
  partitionCaptures, missingParts, nextManualPart,
  MIN_TRUNK, MIN_BASE,
  type CaptureAngle, type TreePart,
} from './treeCaptureParts';

/** Một tấm trong dải: đủ để vẽ và đủ để xếp loại. */
export interface ReviewShot {
  id: string;
  uri: string;
  pitch: number | null;
}

interface Props {
  shots: readonly ReviewShot[];
  manualParts: Readonly<Record<string, TreePart>>;
  onChangeManualParts: (next: Record<string, TreePart>) => void;
}

/** Chữ hiện trên nhãn từng tấm. */
const NHAN: Record<TreePart, string> = {
  trunk: 'Thân',
  base: 'Gốc',
  unknown: 'Chưa rõ',
};

export default function TreePartReviewStrip({
  shots, manualParts, onChangeManualParts,
}: Props) {
  const angles: CaptureAngle[] = shots.map(s => ({ id: s.id, pitch: s.pitch }));
  const partition = partitionCaptures(angles, manualParts);
  const missing = missingParts(partition);

  const chamVaoAnh = (id: string) => {
    const tiep = nextManualPart(manualParts[id]);
    const next = { ...manualParts };
    // Trả về cho máy đoán thì phải XOÁ khoá, không đặt `undefined`: một khoá mang
    // giá trị `undefined` vẫn là một khoá có mặt, và `partitionCaptures` đọc nó
    // như một lần đặt tay rỗng thay vì như "không ai đặt".
    if (tiep === undefined) delete next[id];
    else next[id] = tiep;
    onChangeManualParts(next);
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.title}>Máy đã xếp {shots.length} tấm</Text>
        <Text style={styles.sub}>
          {missing.enough
            ? 'Đủ góc rồi. Bấm Nhận diện, hoặc chạm vào tấm nào máy xếp sai.'
            : `Còn thiếu ${missing.trunk > 0 ? `${missing.trunk} góc thân` : ''}`
              + `${missing.trunk > 0 && missing.base > 0 ? ' và ' : ''}`
              + `${missing.base > 0 ? `${missing.base} góc gốc` : ''}.`}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {shots.map(s => {
          const part = partition.parts[s.id] ?? 'unknown';
          const datTay = manualParts[s.id] !== undefined;
          return (
            <TouchableOpacity
              key={s.id}
              style={styles.o}
              onPress={() => chamVaoAnh(s.id)}
              accessibilityRole="button"
              accessibilityLabel={`Ảnh ${NHAN[part]}${datTay ? ', bạn đã tự đặt' : ''}. Chạm để đổi.`}
            >
              <Image source={{ uri: s.uri }} style={styles.anh} />
              <View style={[styles.nhan, part === 'base' && styles.nhanGoc, part === 'unknown' && styles.nhanMu]}>
                <Text style={styles.nhanChu}>{NHAN[part]}</Text>
              </View>
              {/* Dấu người dùng tự đặt: để lần sau họ biết tấm nào là ý mình, tấm
                  nào là máy đoán — không có dấu này thì hai thứ trông y hệt nhau. */}
              {datTay && <View style={styles.dauTay}><Text style={styles.dauTayChu}>✓</Text></View>}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.dem}>
        <Text style={styles.demChu}>
          Thân {partition.trunk}/{MIN_TRUNK}   ·   Gốc {partition.base}/{MIN_BASE}
          {partition.unknown > 0 ? `   ·   Chưa rõ ${partition.unknown}` : ''}
        </Text>
        <Text style={styles.goiY}>Chạm vào ảnh để đổi: Thân → Gốc → để máy tự đoán.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 12, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12 },
  header: { paddingHorizontal: 14, marginBottom: 8 },
  title: { color: '#fff', fontSize: 15, fontWeight: '700' },
  sub: { color: 'rgba(255,255,255,0.78)', fontSize: 13, marginTop: 2 },
  row: { paddingHorizontal: 12, gap: 8 },
  o: { width: 76, height: 100, borderRadius: 8, overflow: 'hidden', backgroundColor: '#222' },
  anh: { width: '100%', height: '100%' },
  nhan: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingVertical: 3, alignItems: 'center', backgroundColor: 'rgba(34,139,84,0.92)',
  },
  nhanGoc: { backgroundColor: 'rgba(176,112,20,0.92)' },
  nhanMu: { backgroundColor: 'rgba(90,90,90,0.92)' },
  nhanChu: { color: '#fff', fontSize: 11, fontWeight: '700' },
  dauTay: {
    position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center',
  },
  dauTayChu: { color: '#1b6b3a', fontSize: 11, fontWeight: '900' },
  dem: { paddingHorizontal: 14, marginTop: 8 },
  demChu: { color: '#fff', fontSize: 13, fontWeight: '600' },
  goiY: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },
});
