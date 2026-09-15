// screens/SyncQueueScreen.tsx
//
// HÀNG ĐỢI GỬI LÊN MÁY CHỦ — màn duy nhất cho người dùng nhìn thấy những mục
// chưa lên được máy chủ, và bấm gửi lại.
//
// ── Vì sao màn này tồn tại ──────────────────────────────────────────────────
// Vòng vá trước đã sửa chỗ mất dữ liệu: mục nhật ký đồng áng không còn bị xoá khi
// mất sóng hay khi chạm trần thử lại (`syncService.handleSyncFailure`). Nhưng
// một mục SỐNG mà không màn nào bày ra thì người dùng vẫn không phân biệt được
// với một mục đã mất — họ ghi lại lần nữa, và thành hai bản ghi cho một việc.
// Chính chú thích trong `syncService` đã tự khai chỗ hở đó: *"Ở đây KHÔNG có màn
// nào bày hàng đợi, cũng không có nút nào"*.
//
// ── Ba trạng thái, không phải hai ───────────────────────────────────────────
// có mục · hàng đợi rỗng THẬT · KHÔNG ĐỌC ĐƯỢC kho. Trạng thái thứ ba phải kêu
// to hơn trạng thái thứ hai: một lần đọc hỏng vẽ ra màn "chưa có gì" là nói với
// người dùng rằng dữ liệu của họ không tồn tại.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';

import { COLORS } from '../constants';
import StateView from '../components/state/StateView';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { loadSyncQueue } from '../store/syncSlice';
import { syncService } from '../services/syncService';
import {
  buildSyncQueueEntries,
  countByGroup,
  describeRetryAllOutcome,
  describeRetryOutcome,
  SYNC_QUEUE_GROUP_TEXT,
  type SyncQueueDiagnostic,
  type SyncQueueGroup,
  type SyncRetryNote,
} from '../services/syncQueueStatus';

/** Icon theo nhóm. Icon là thứ ĐI KÈM chữ, không thay chữ. */
const GROUP_ICON: Record<SyncQueueGroup, string> = {
  stopped: 'close-octagon-outline',
  needsAttention: 'alert-circle-outline',
  sessionExpired: 'account-key-outline',
  waitingNetwork: 'wifi-off',
  serverBusy: 'timer-sand',
  serverNotReady: 'server-off',
  sending: 'upload-outline',
  queued: 'tray-full',
};

/** Nhóm nào tô màu cảnh báo. Màu là lớp phụ — mọi nhóm đều có nhãn chữ riêng. */
const GROUP_TONE: Record<SyncQueueGroup, 'bad' | 'warn' | 'calm'> = {
  stopped: 'bad',
  needsAttention: 'warn',
  sessionExpired: 'warn',
  waitingNetwork: 'calm',
  serverBusy: 'calm',
  serverNotReady: 'warn',
  sending: 'calm',
  queued: 'calm',
};

const toneColor = (tone: 'bad' | 'warn' | 'calm'): string =>
  tone === 'bad' ? COLORS.error : tone === 'warn' ? COLORS.warning : COLORS.accent;

const formatMoment = (ms: number): string => new Date(ms).toLocaleString('vi-VN');

const SyncQueueScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const dispatch = useAppDispatch();
  const rows = useAppSelector((s) => s.sync.queue);

  const [loading, setLoading] = useState(true);
  /** Lý do THẬT của lần đọc hỏng gần nhất. `null` = lần đọc gần nhất đã xong. */
  const [readFailure, setReadFailure] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, SyncQueueDiagnostic>>({});
  const [note, setNote] = useState<SyncRetryNote | null>(null);
  /** Mã giao dịch đang có lượt gửi chạy; `'ALL'` = lượt gửi cả hàng đợi. */
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // `createAsyncThunk` KHÔNG ném khi thân hỏng — nó trả một hành động
    // `…/rejected` mang `error`. Đây đúng là cách `syncService` đọc kết quả
    // `removeFromSyncQueue`; không soi `error` thì lần đọc hỏng đi qua im lặng và
    // màn hình vẽ ra danh sách rỗng của lần trước.
    const result: any = await dispatch(loadSyncQueue() as any);
    if (result?.error) {
      setReadFailure(result.error.message || 'Không rõ lý do');
    } else {
      setReadFailure(null);
    }
    setDiagnostics(syncService.getQueueDiagnostics());
    setLoading(false);
  }, [dispatch]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Dựng danh sách hiển thị.
   *
   * `buildSyncQueueEntries` CÔ LẬP từng dòng: dòng không có mã giao dịch thì không
   * gửi lại được nên không bày ra như một mục, nhưng nó cũng KHÔNG được phép xoá
   * những dòng lành khỏi màn — làm thế là lấy mất đường gửi tay duy nhất vì một
   * dòng rác. Số dòng bị loại hiện thành một băng riêng ngay dưới.
   */
  const built = useMemo(
    () => buildSyncQueueEntries(rows as any[], diagnostics),
    [rows, diagnostics],
  );

  const entries = built.entries;
  const unreadableRows = built.unreadableRows;
  const failure = readFailure;
  const groups = countByGroup(entries);
  /** Số mục màn hình còn bấm "gửi lại" được. Nhóm `stopped` KHÔNG tính. */
  const retriableCount = entries.filter((e) => e.group !== 'stopped').length;

  const runRetryItem = useCallback(
    async (transactionId: string) => {
      setBusy(transactionId);
      try {
        setNote(describeRetryOutcome(await syncService.retryItemNow(transactionId)));
      } catch (e: any) {
        // Lượt gửi lại NÉM là một kết quả phải nói ra, không phải một kết quả
        // để nuốt: người dùng vừa bấm, họ đang chờ một câu trả lời.
        setNote({
          tone: 'bad',
          text: 'Không chạy được lượt gửi lại.',
          detail: e?.message ? String(e.message) : String(e),
        });
      } finally {
        setBusy(null);
        await load();
      }
    },
    [load],
  );

  const runRetryAll = useCallback(async () => {
    setBusy('ALL');
    try {
      setNote(describeRetryAllOutcome(await syncService.retryAllNow()));
    } catch (e: any) {
      setNote({
        tone: 'bad',
        text: 'Không chạy được lượt gửi lại.',
        detail: e?.message ? String(e.message) : String(e),
      });
    } finally {
      setBusy(null);
      await load();
    }
  }, [load]);

  const header = (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={8} testID="sync-queue-back">
        <Icon name="arrow-left" size={22} color={COLORS.white} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Hàng đợi gửi lên máy chủ</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.root}>
        {header}
        <StateView status="loading" loadingLines={5} />
      </View>
    );
  }

  // Đọc hỏng mà chưa có mục nào trong tay ⇒ KHÔNG được vẽ màn rỗng. Hai màn nói
  // hai chuyện khác hẳn nhau, và chỉ một trong hai là tin mừng.
  if (failure != null && entries.length === 0) {
    return (
      <View style={styles.root}>
        {header}
        <View testID="sync-queue-read-failed" style={styles.failWrap}>
          <StateView
            status="error"
            title="Không đọc được hàng đợi"
            message="Chưa đọc được danh sách mục đang chờ gửi trên máy này. Đây KHÔNG phải là hàng đợi rỗng — chưa biết trong đó có gì."
            onRetry={load}
          />
          <Text style={styles.failReason}>{failure}</Text>
        </View>
      </View>
    );
  }

  const noteBanner = note ? (
    <View
      testID="sync-queue-retry-note"
      style={[styles.note, { borderColor: note.tone === 'ok' ? COLORS.success : COLORS.error }]}
    >
      <Icon
        name={note.tone === 'ok' ? 'check-circle-outline' : 'alert-circle-outline'}
        size={16}
        color={note.tone === 'ok' ? COLORS.success : COLORS.error}
      />
      <View style={{ flex: 1 }}>
        <Text style={styles.noteText}>{note.text}</Text>
        {note.detail != null && <Text style={styles.noteDetail}>{note.detail}</Text>}
      </View>
    </View>
  ) : null;

  const unreadableBanner = unreadableRows > 0 ? (
    <View testID="sync-queue-unreadable-banner" style={styles.staleBanner}>
      <Icon name="alert-outline" size={16} color={COLORS.warning} />
      <Text style={styles.staleText}>
        {`Có ${unreadableRows} dòng trong kho không đọc được nên không hiện ở đây. Dữ liệu chưa mất — báo đội hỗ trợ.`}
      </Text>
    </View>
  ) : null;

  const summary = (
    <View style={styles.summary}>
      <View style={styles.summaryTop}>
        {/* KHÔNG đặt tên "Đang chờ gửi" ở đây: đó là nhãn của MỘT nhóm bên dưới,
            và con số tổng gồm cả mục đã dừng hẳn — hai thứ trùng tên mà khác tập. */}
        <Text style={styles.summaryTitle}>Việc chưa lên máy chủ</Text>
        <Text testID="sync-queue-total" style={styles.summaryCount}>
          {String(entries.length)}
        </Text>
      </View>
      {groups.map(({ group, count }) => (
        <View key={group} testID={`sync-queue-group-${group}`} style={styles.groupRow}>
          <Icon name={GROUP_ICON[group]} size={16} color={toneColor(GROUP_TONE[group])} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.groupLabel, { color: toneColor(GROUP_TONE[group]) }]}>
              {SYNC_QUEUE_GROUP_TEXT[group].label}
            </Text>
            <Text style={styles.groupDetail}>{SYNC_QUEUE_GROUP_TEXT[group].detail}</Text>
          </View>
          <Text testID={`sync-queue-group-count-${group}`} style={styles.groupCount}>
            {String(count)}
          </Text>
        </View>
      ))}
      {/* Không còn mục nào gửi được thì nút này chỉ bấm ra một câu báo hỏng cho
          việc nó chưa từng thử. Vô hiệu nó, và nói rõ vì sao — im lặng vô hiệu là
          một nút trông như đang hỏng. */}
      <TouchableOpacity
        testID="sync-queue-retry-all"
        style={[styles.retryAll, retriableCount === 0 && styles.retryAllOff]}
        activeOpacity={0.85}
        disabled={busy != null || retriableCount === 0}
        onPress={runRetryAll}
      >
        {busy === 'ALL' ? (
          <ActivityIndicator size="small" color={COLORS.white} />
        ) : (
          <Icon name="upload" size={16} color={COLORS.white} />
        )}
        <Text style={styles.retryAllText}>Gửi lại tất cả ngay</Text>
      </TouchableOpacity>
      {retriableCount === 0 && entries.length > 0 && (
        <Text testID="sync-queue-nothing-retriable" style={styles.groupDetail}>
          Không mục nào còn tự gửi lại được. Xem từng mục bên dưới.
        </Text>
      )}
      {/* Lần đọc hỏng NHƯNG vẫn còn danh sách của lần trước: giữ danh sách và
          nói rõ nó có thể đã cũ. Im lặng ở đây là trình dữ liệu cũ như dữ liệu mới. */}
      {failure != null && (
        <View testID="sync-queue-stale-banner" style={styles.staleBanner}>
          <Icon name="alert-outline" size={16} color={COLORS.warning} />
          <View style={{ flex: 1 }}>
            <Text style={styles.staleText}>
              Lần đọc gần nhất hỏng — danh sách dưới đây là của lần đọc trước, có thể đã cũ.
            </Text>
            <Text style={styles.failReason}>{failure}</Text>
          </View>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.accentDeep} />
      {header}
      <FlatList
        data={entries}
        keyExtractor={(it) => it.transactionId}
        contentContainerStyle={entries.length === 0 ? styles.emptyWrap : styles.list}
        onRefresh={load}
        // Phải là `loading` thật. Gõ cứng `false` thì vòng xoay không bao giờ hiện:
        // người dùng kéo xuống, không thấy gì động, và đọc ra là màn bị treo.
        refreshing={loading && entries.length > 0}
        ListHeaderComponent={
          <View>
            {noteBanner}
            {unreadableBanner}
            {entries.length > 0 && summary}
          </View>
        }
        ListEmptyComponent={
          unreadableRows > 0 ? (
            <View testID="sync-queue-only-unreadable" style={{ flex: 1 }}>
              <StateView
                status="error"
                title="Không đọc được mục nào trong kho"
                message="Kho còn dữ liệu chưa gửi, nhưng không dòng nào đọc được thành một mục. Đây KHÔNG phải là hàng đợi rỗng."
                onRetry={load}
              />
            </View>
          ) : (
          <View testID="sync-queue-empty" style={{ flex: 1 }}>
            <StateView
              status="empty"
              title="Không có mục nào đang chờ"
              message="Mọi thứ bạn ghi đã lên máy chủ. Mục mới sẽ hiện ở đây khi chưa gửi được."
            />
          </View>
          )
        }
        renderItem={({ item }) => {
          const tone = GROUP_TONE[item.group];
          const text = SYNC_QUEUE_GROUP_TEXT[item.group];
          return (
            <View testID={`sync-queue-item-${item.transactionId}`} style={styles.card}>
              <View style={styles.cardTop}>
                <Icon name={GROUP_ICON[item.group]} size={18} color={toneColor(tone)} />
                <Text style={styles.cardType}>{item.typeLabel}</Text>
                <Text style={[styles.cardGroup, { color: toneColor(tone) }]}>{text.label}</Text>
              </View>

              <Text style={styles.cardDetail}>{text.detail}</Text>

              {/* Thời điểm tạo. Không phân giải được thì hiện CHUỖI THÔ, và không
                  có chuỗi nào thì nói thẳng là không biết — một mốc đệm sẽ đi tiếp
                  vào mắt người đọc như một dữ kiện thật. */}
              {item.createdAtMs != null ? (
                <Text style={styles.cardLine}>{`Ghi lúc ${formatMoment(item.createdAtMs)}`}</Text>
              ) : item.createdAtRaw != null ? (
                <Text style={styles.cardLine}>{`Ghi lúc (chưa đọc được múi giờ): ${item.createdAtRaw}`}</Text>
              ) : (
                <Text style={styles.cardLine}>Không rõ thời điểm ghi</Text>
              )}

              {/* Số lần thử: chỉ có trong bộ nhớ của phiên đang chạy, và nó CHỈ đếm
                  hạng `retryable` — mất sóng, phiên hết hạn, máy chủ chưa nhận đều
                  không tăng nó (xem trần thử lại trong `syncService`). Nên câu này
                  phải nói đúng đại lượng: gọi nó là "số lần thử" thì một mục đã gọi
                  mạng 20 lượt vẫn đọc ra "đã thử 0 lần". Số 0 là tin thật ở đây,
                  không phải chỗ trống — nó nói mục chưa tiến về phía trần nào. */}
              {item.attempts != null ? (
                <Text style={styles.cardLine}>{`Đã tính ${item.attempts} lượt vào trần thử lại`}</Text>
              ) : (
                <Text style={styles.cardLine}>Chưa có số liệu thử lại trong phiên này</Text>
              )}

              {item.group !== 'stopped' && item.nextAttemptAt != null && item.nextAttemptAt > Date.now() && (
                <Text style={styles.cardLine}>{`Tự thử lại vào khoảng ${formatMoment(item.nextAttemptAt)}`}</Text>
              )}

              {/* Câu NGUYÊN VĂN của máy chủ. Không có thì nói là không có, đừng
                  thay bằng "có lỗi xảy ra" — câu đó không giúp ai làm gì. */}
              {item.serverMessage != null ? (
                <View style={styles.msgBox}>
                  <Text style={styles.msgLabel}>Máy chủ trả lời</Text>
                  <Text testID={`sync-queue-message-${item.transactionId}`} style={styles.msgText}>
                    {item.serverMessage}
                  </Text>
                </View>
              ) : (
                <Text style={styles.cardLine}>Chưa có câu trả lời nào từ máy chủ</Text>
              )}

              {item.group === 'stopped' ? (
                <Text testID={`sync-queue-stopped-${item.transactionId}`} style={styles.stoppedNote}>
                  Mục này KHÔNG tự gửi lại nữa. Hãy ghi lại việc này, hoặc báo đội hỗ trợ kèm câu trả lời trên.
                </Text>
              ) : (
                <TouchableOpacity
                  testID={`sync-queue-retry-${item.transactionId}`}
                  style={styles.retryItem}
                  activeOpacity={0.85}
                  disabled={busy != null}
                  onPress={() => runRetryItem(item.transactionId)}
                >
                  {busy === item.transactionId ? (
                    <ActivityIndicator size="small" color={COLORS.accent} />
                  ) : (
                    <Icon name="refresh" size={15} color={COLORS.accent} />
                  )}
                  <Text style={styles.retryItemText}>Gửi lại mục này ngay</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: COLORS.accentDeep,
    paddingTop: 56,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerTitle: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.white },

  list: { padding: 12, gap: 10 },
  emptyWrap: { flexGrow: 1 },

  failWrap: { flex: 1 },
  failReason: {
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
  },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  noteText: { fontSize: 13, fontWeight: '700', color: COLORS.text, lineHeight: 18 },
  noteDetail: { fontSize: 12, color: COLORS.textSub, marginTop: 4, lineHeight: 17 },

  summary: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 10,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  summaryTitle: { fontSize: 14, fontWeight: '800', color: COLORS.text },
  summaryCount: { fontSize: 22, fontWeight: '800', color: COLORS.accent },
  groupRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  groupLabel: { fontSize: 13, fontWeight: '800' },
  groupDetail: { fontSize: 12, color: COLORS.textSub, marginTop: 2, lineHeight: 17 },
  groupCount: { fontSize: 15, fontWeight: '800', color: COLORS.text },
  retryAllOff: { opacity: 0.45 },
  retryAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 12,
  },
  retryAllText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.warning,
    borderRadius: 12,
    padding: 10,
  },
  staleText: { fontSize: 12, color: COLORS.text, lineHeight: 17, fontWeight: '600' },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 14,
    padding: 14,
    gap: 4,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardType: { flex: 1, fontSize: 14, fontWeight: '800', color: COLORS.text },
  cardGroup: { fontSize: 12, fontWeight: '800' },
  cardDetail: { fontSize: 12, color: COLORS.textSub, lineHeight: 17, marginBottom: 4 },
  cardLine: { fontSize: 12, color: COLORS.textMuted, lineHeight: 17 },
  msgBox: {
    backgroundColor: COLORS.inputBg,
    borderRadius: 10,
    padding: 10,
    marginTop: 6,
  },
  msgLabel: { fontSize: 11, fontWeight: '800', color: COLORS.textSub },
  msgText: { fontSize: 12, color: COLORS.text, marginTop: 3, lineHeight: 17 },
  stoppedNote: {
    fontSize: 12,
    color: COLORS.error,
    fontWeight: '700',
    lineHeight: 17,
    marginTop: 8,
  },
  retryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 10,
  },
  retryItemText: { fontSize: 13, fontWeight: '700', color: COLORS.accent },
});

export default SyncQueueScreen;
