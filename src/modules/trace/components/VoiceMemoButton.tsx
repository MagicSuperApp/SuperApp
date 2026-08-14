// modules/trace/components/VoiceMemoButton.tsx
//
// Build 49 § 3 — Tap-to-start / tap-to-stop recorder UI cho TreeMetadataTab.
//
// Design quyết định (Q5):
//   - Tap (KHÔNG press-hold) — farmer 55t kính lão, tay dính nhựa cây.
//   - Auto-stop 30s + haptic warning at 25s (1 vibration).
//   - 1 voice memo per tree với confirm dialog khi overwrite.
//   - Native module: VoiceMemoModule (Promise-only, không EventEmitter).

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  NativeModules,
  Platform,
  Animated,
  Alert,
} from 'react-native';

import { buzz } from '../../../utils/haptics';
// Icon: bộ Font Awesome Solid tải qua Iconify (assets/icons → icons.generated).
// Thêm icon mới: `node scripts/icons.js <tên-fa6-solid>`.
import Icon from '../../../components/Icon';
import { COLORS } from '../../../constants';

type VoiceMemoNative = {
  startRecording(treeId: string): Promise<{ uri: string; max_duration_s: number; treeId: string }>;
  stopRecording():                Promise<{ uri: string; duration_s: number; bytes: number }>;
  cancelRecording():              Promise<null>;
  deleteRecording(treeId: string): Promise<null>;
  play(treeId: string):           Promise<{ uri: string; duration_s: number }>;
  stopPlayback():                 Promise<null>;
  getExistingRecording(treeId: string): Promise<{ uri: string; duration_s: number; bytes: number } | null>;
};

const VoiceMemo: VoiceMemoNative | undefined = (NativeModules as any).VoiceMemoModule;

interface Props {
  treeId: string;
  existingPath?: string;
  existingDurationS?: number;
  maxSeconds?: number;
  onRecorded: (path: string, durationS: number) => void;
  onDeleted: () => void;
}

const HAPTIC_WARN_AT = 25;  // seconds — vibrate ngắn để cảnh báo còn 5s

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, '0')}`;
}

const VoiceMemoButton: React.FC<Props> = ({
  treeId,
  existingPath,
  existingDurationS,
  maxSeconds = 30,
  onRecorded,
  onDeleted,
}) => {
  const [recording, setRecording]   = useState(false);
  const [playing,   setPlaying]     = useState(false);
  const [elapsed,   setElapsed]     = useState(0);
  const [busy,      setBusy]        = useState(false);

  const tickRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef   = useRef(false);
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Pulse animation while recording (red dot heartbeat).
  useEffect(() => {
    if (!recording) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return;
    }
    // Nhánh `else` chỉ chạy khi cờ `recording` đổi. Rời màn GIỮA lúc đang ghi thì
    // effect không chạy lại — chỉ hàm dọn chạy, nên vòng lặp phải dừng ở đây.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [recording, pulseAnim]);

  // Auto-stop on max + haptic warn at 25s.
  useEffect(() => {
    if (!recording) {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
      warnedRef.current = false;
      return;
    }
    tickRef.current = setInterval(() => {
      setElapsed((e) => {
        const next = e + 0.1;
        if (!warnedRef.current && next >= HAPTIC_WARN_AT) {
          warnedRef.current = true;
          // Short vibration (≈200ms) to signal "5 seconds left". iOS ignores
          // duration arg but vibrates ≈400ms regardless; that's acceptable.
          buzz(200);
        }
        if (next >= maxSeconds) {
          // Schedule stop on next tick — calling stopRecording from inside the
          // interval callback can race with React setState.
          setTimeout(() => { void handleStopInternal(true); }, 0);
        }
        return next;
      });
    }, 100);
    return () => {
      if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
    };
  }, [recording, maxSeconds]);

  // Stop playback timeout cleanup
  useEffect(() => {
    return () => {
      if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    };
  }, []);

  const ensureNative = (): VoiceMemoNative | null => {
    if (!VoiceMemo) {
      Alert.alert('Chưa hỗ trợ', Platform.OS === 'android'
        ? 'Ghi âm sẽ có trong bản Android sắp tới.'
        : 'Tính năng ghi âm chưa sẵn sàng. Vui lòng cập nhật ứng dụng.');
      return null;
    }
    return VoiceMemo;
  };

  const handleStartRecording = async () => {
    const native = ensureNative();
    if (!native) return;

    const start = async () => {
      setBusy(true);
      try {
        await native.startRecording(treeId);
        setElapsed(0);
        warnedRef.current = false;
        setRecording(true);
      } catch (e: any) {
        const msg = e?.message ?? 'Không thể bắt đầu ghi âm.';
        if (msg.includes('Quyền micro') || msg.includes('permission')) {
          Alert.alert(
            'Cần quyền micro',
            'Vui lòng vào Cài đặt → Aladin → Micro để cho phép ghi âm.',
            [{ text: 'Đã hiểu' }]
          );
        } else {
          Alert.alert('Lỗi ghi âm', msg);
        }
      } finally {
        setBusy(false);
      }
    };

    // If a memo already exists, confirm overwrite (Q5 — single memo per tree).
    if (existingPath) {
      Alert.alert(
        'Ghi âm lại?',
        'Đã có ghi âm cho cây này, ghi lại sẽ thay thế cái cũ?',
        [
          { text: 'Huỷ', style: 'cancel' },
          { text: 'Ghi lại', style: 'destructive', onPress: () => { void start(); } },
        ],
      );
      return;
    }
    await start();
  };

  const handleStopInternal = async (auto: boolean) => {
    const native = ensureNative();
    if (!native) { setRecording(false); return; }
    setBusy(true);
    try {
      const { uri, duration_s } = await native.stopRecording();
      onRecorded(uri, duration_s);
    } catch (e: any) {
      if (!auto) Alert.alert('Lỗi', e?.message ?? 'Không thể dừng ghi âm.');
    } finally {
      setRecording(false);
      setElapsed(0);
      setBusy(false);
    }
  };

  const handleStop = () => { void handleStopInternal(false); };

  const handlePlay = async () => {
    const native = ensureNative();
    if (!native) return;
    if (playing) {
      try { await native.stopPlayback(); } catch {}
      setPlaying(false);
      if (playbackTimeoutRef.current) {
        clearTimeout(playbackTimeoutRef.current);
        playbackTimeoutRef.current = null;
      }
      return;
    }
    try {
      const { duration_s } = await native.play(treeId);
      setPlaying(true);
      // Auto-clear playing flag when audio finishes — native module doesn't
      // emit an end-of-playback event (Promise-only), so approximate via
      // duration timer + small buffer.
      const ms = Math.max(500, (duration_s || existingDurationS || 0) * 1000 + 200);
      playbackTimeoutRef.current = setTimeout(() => setPlaying(false), ms);
    } catch (e: any) {
      Alert.alert('Lỗi phát lại', e?.message ?? 'Không phát được.');
    }
  };

  const handleDelete = () => {
    const native = ensureNative();
    if (!native) return;
    Alert.alert(
      'Xoá ghi âm?',
      'Bản ghi âm hiện tại sẽ bị xoá khỏi máy.',
      [
        { text: 'Huỷ', style: 'cancel' },
        {
          text: 'Xoá', style: 'destructive',
          onPress: async () => {
            try {
              if (playing) await native.stopPlayback();
              await native.deleteRecording(treeId);
              setPlaying(false);
              onDeleted();
            } catch (e: any) {
              Alert.alert('Lỗi', e?.message ?? 'Không xoá được.');
            }
          },
        },
      ],
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (recording) {
    const pct = Math.min(elapsed / maxSeconds, 1);
    return (
      <View style={styles.recordingCard}>
        <View style={styles.recordingHeader}>
          <Animated.View style={[
            styles.recDot,
            { transform: [{ scale: pulseAnim }] },
            elapsed >= HAPTIC_WARN_AT && { backgroundColor: COLORS.warning },
          ]} />
          <Text style={styles.recTimer}>
            {formatTime(elapsed)} / {formatTime(maxSeconds)}
          </Text>
        </View>

        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            { width: `${pct * 100}%`,
              backgroundColor: elapsed >= HAPTIC_WARN_AT ? COLORS.warning : COLORS.error },
          ]} />
        </View>

        <TouchableOpacity
          style={[styles.stopBtn, busy && { opacity: 0.6 }]}
          onPress={handleStop}
          disabled={busy}
          activeOpacity={0.85}
        >
          <Icon name="circle-stop" size={20} color={COLORS.white} />
          <Text style={styles.stopBtnText}>Dừng ghi âm</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (existingPath) {
    return (
      <View style={styles.existingCard}>
        <View style={styles.existingInfo}>
          <Icon
            name={playing ? 'circle-pause' : 'circle-play'}
            size={32}
            color={COLORS.accent}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.existingLabel}>Ghi âm đã lưu</Text>
            <Text style={styles.existingMeta}>
              {existingDurationS ? `${formatTime(existingDurationS)} • AAC mono` : 'AAC mono'}
            </Text>
          </View>
        </View>

        <View style={styles.existingActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handlePlay}
            activeOpacity={0.85}
          >
            <Icon name={playing ? 'stop' : 'play'} size={18} color={COLORS.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleStartRecording}
            activeOpacity={0.85}
          >
            <Icon name="microphone-lines" size={18} color={COLORS.accent} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={handleDelete}
            activeOpacity={0.85}
          >
            <Icon name="trash" size={18} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={[styles.startBtn, busy && { opacity: 0.6 }]}
      onPress={handleStartRecording}
      activeOpacity={0.85}
      disabled={busy}
    >
      <Icon name="microphone" size={20} color={COLORS.accent} />
      <Text style={styles.startBtnText}>Bấm để ghi âm (tối đa 30s)</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  startBtnText: { fontSize: 14, color: COLORS.accent, fontWeight: '600' },

  recordingCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  recordingHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recDot: {
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: COLORS.error,
  },
  recTimer: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    fontVariant: ['tabular-nums'],
  },

  progressBar: {
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', borderRadius: 2 },

  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: COLORS.error,
    borderRadius: 10,
    paddingVertical: 12,
  },
  stopBtnText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },

  existingCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 12,
    gap: 12,
  },
  existingInfo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  existingLabel: { fontSize: 14, fontWeight: '600', color: COLORS.text },
  existingMeta: { fontSize: 12, color: COLORS.textMuted, marginTop: 2 },

  existingActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  iconBtn: {
    width: 40, height: 40,
    borderRadius: 10,
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default VoiceMemoButton;
