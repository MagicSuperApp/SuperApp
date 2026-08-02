// modules/proofchat/features/chat/screens/ChatScreen.tsx
//
// Application Layer: chat UI cho 1 phòng (1-1 only).
// Khi user gửi: dispatch theo OUTGOING_PIPELINE → UI tự render stage.
// Khi user tap decrypt: chạy INCOMING_PIPELINE → kết thúc bằng decryptMessage.

import React, { useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, StatusBar,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSelector, useDispatch, useStore } from 'react-redux';
import { RootState } from '../../../../../store';
import { NEUTRAL } from '../../../../../shared/theme';
import { PROOFCHAT_THEME } from '../../../theme/colors';
import ChatHeader from '../components/ChatHeader';
import MessageBubble from '../components/MessageBubble';
import ChatInput from '../components/ChatInput';
import SyncStatusPill from '../components/SyncStatusPill';
import EscrowStatusCard from '../../escrow/components/EscrowStatusCard';
import StateView from '../../../../../components/state/StateView';
import type { AppDispatch } from '../../../../../store';
import {
  sendMessage,
  setMessageStage,
  decryptMessage,
  markRoomRead,
  loadRoomMessages,
} from '../../../store/proofchatSlice';
import {
  OUTGOING_PIPELINE,
  INCOMING_PIPELINE,
  finalStatusFor,
} from '../../proof/lifecycle';
import type { Message } from '../types';
import { isProofChatBackendEnabled } from '../../../../../services/proofchat-api';

const ChatScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const dispatch = useDispatch<AppDispatch>();
  const store = useStore<RootState>();

  const roomId: string = route.params?.roomId;
  const room = useSelector((s: RootState) =>
    s.proofchat.rooms.find(r => r.id === roomId),
  );
  const messages = useSelector(
    (s: RootState) => s.proofchat.messagesByRoom[roomId] ?? [],
  );
  const sync = useSelector((s: RootState) => s.proofchat.sync);
  const identity = useSelector((s: RootState) => s.proofchat.identity);
  const meId = useSelector((s: RootState) => s.proofchat.meId);

  const listRef = useRef<FlatList>(null);

  useEffect(() => {
    if (room && room.unreadCount > 0) dispatch(markRoomRead(roomId));
  }, [roomId]);

  // ── Wiring dữ liệu THẬT (chỉ khi feature flag ON) ─────────────────────────
  // Tải tin nhắn (ciphertext E2EE) qua REST GET /conversations/:id/messages.
  // Realtime nhận tin đi qua socket.io (chatSocket.ts → proofchatService, E2EE 3
  // tầng của Thư). Màn này CHƯA nối trực tiếp vào proofchatService — sẽ nối UI ↔
  // service trong bước sau (chờ staging creds + interop danh tính did:phoenix↔web).
  // Raw WS cũ (proofchatWs.ts, host ws.proofchat.app đã chết) đã gỡ theo chỉ dẫn ProofChat.
  const backendEnabled = isProofChatBackendEnabled();
  useEffect(() => {
    if (!backendEnabled || !roomId) return;
    dispatch(loadRoomMessages({ roomId, meId }));
  }, [backendEnabled, roomId, meId, dispatch]);

  const sections = useMemo(() => groupByDate(messages), [messages]);

  useEffect(() => {
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length]);

  if (!room) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.notFound}>Không tìm thấy cuộc trò chuyện.</Text>
      </View>
    );
  }

  // ── Outgoing pipeline simulator ────────────────────────────────────────────
  // Đọc id của message vừa tạo từ store ngay sau khi dispatch sendMessage,
  // rồi chuyển stage theo timeline đã định nghĩa trong OUTGOING_PIPELINE.
  const handleSend = (text: string) => {
    dispatch(sendMessage({ roomId, text }));
    if (!sync.online) return;

    const list = store.getState().proofchat.messagesByRoom[roomId] ?? [];
    const newest = list[list.length - 1];
    if (!newest || !newest.isMine) return;

    let elapsed = 0;
    OUTGOING_PIPELINE.slice(1).forEach(step => {
      elapsed += step.delayMs;
      setTimeout(() => {
        dispatch(setMessageStage({
          roomId,
          messageId: newest.id,
          stage: step.stage,
          verificationStatus:
            step.stage === 'sent' ? 'verified' : undefined,
        }));
      }, elapsed);
    });

    // Mô phỏng peer ack: sau ~2s → delivered
    setTimeout(() => {
      dispatch(setMessageStage({
        roomId, messageId: newest.id, stage: 'delivered',
      }));
    }, elapsed + 800);
  };

  // ── Incoming pipeline simulator ────────────────────────────────────────────
  const handleDecrypt = (m: Message) => {
    if (m.stage !== 'encrypted') return;
    let elapsed = 0;

    // Stage 1: decrypting
    dispatch(setMessageStage({
      roomId, messageId: m.id, stage: 'decrypting',
    }));

    // Stage 2: verifying signature
    elapsed += INCOMING_PIPELINE[1].delayMs;
    setTimeout(() => {
      dispatch(setMessageStage({
        roomId, messageId: m.id, stage: 'verifying_signature',
      }));
    }, elapsed);

    // Stage 3: checking integrity
    elapsed += INCOMING_PIPELINE[2].delayMs;
    setTimeout(() => {
      dispatch(setMessageStage({
        roomId, messageId: m.id, stage: 'checking_integrity',
      }));
    }, elapsed);

    // Stage 4: done
    elapsed += INCOMING_PIPELINE[3].delayMs;
    setTimeout(() => {
      const decrypted =
        m.id === 'm6'
          ? 'Em vừa kiểm tra lại — model anh sửa được, em chuẩn bị đồ nghề.'
          : m.id === 'm33'
          ? 'Mình báo giá 450 MAGIC cho 3 phương án logo + 1 vòng chỉnh sửa.'
          : 'Tin nhắn đã giải mã thành công.';
      dispatch(decryptMessage({
        roomId,
        messageId: m.id,
        text: decrypted,
        verificationStatus: finalStatusFor(m.id),
      }));
    }, elapsed);
  };

  const sessionExpired = identity.sessionStatus === 'expired';

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor={NEUTRAL.bg} />

      <ChatHeader
        room={room}
        onBack={() => navigation.goBack()}
        onPressEscrow={() =>
          navigation.navigate('ProofChatEscrow', { roomId })
        }
        onPressMore={() => {}}
      />

      {/* DEMO banner — chat đang chạy mock: tin nhắn CHƯA gửi thật qua mạng.
          Chữ ký/ciphertext là minh hoạ trong máy, không phải bằng chứng thật. */}
      {!isProofChatBackendEnabled() && (
        <View style={styles.demoBanner}>
          <Text style={styles.demoText}>
            DEMO — tin nhắn minh hoạ, CHƯA gửi thật qua mạng. Đang chờ máy chủ Aladin Chat.
          </Text>
        </View>
      )}

      {/* Session expired banner */}
      {sessionExpired && (
        <View style={styles.expiredBanner}>
          <Text style={styles.expiredText}>
            Phiên đăng nhập đã hết hạn — tin nhắn sẽ không được ký số. Đăng nhập lại để tiếp tục.
          </Text>
        </View>
      )}

      {/* Sync strip */}
      <View style={styles.syncStrip}>
        <SyncStatusPill state={sync} />
        <View style={styles.protRow}>
          <Text style={styles.protText}>End-to-end · Proof System</Text>
        </View>
      </View>

      {/* Optional escrow strip */}
      {room.escrow && (
        <EscrowStatusCard
          escrow={room.escrow}
          jobTitle={room.jobTitle}
          compact
          onPress={() =>
            navigation.navigate('ProofChatEscrow', { roomId })
          }
        />
      )}

      <FlatList
        ref={listRef}
        data={sections}
        keyExtractor={item => item.key}
        renderItem={({ item }) => {
          if (item.type === 'sep') {
            return (
              <View style={styles.dateSep}>
                <View style={styles.dateLine} />
                <Text style={styles.dateText}>{item.label}</Text>
                <View style={styles.dateLine} />
              </View>
            );
          }
          return (
            <MessageBubble
              message={item.message}
              showTail={item.showTail}
              onDecrypt={handleDecrypt}
            />
          );
        }}
        contentContainerStyle={
          sections.length === 0 ? styles.listEmpty : styles.listContent
        }
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <StateView
            status="empty"
            title="Chưa có tin nhắn"
            message="Hãy gửi tin nhắn đầu tiên để bắt đầu trao đổi."
          />
        }
        onContentSizeChange={() =>
          listRef.current?.scrollToEnd({ animated: false })
        }
      />

      <ChatInput onSend={handleSend} />
    </View>
  );
};

// ── helpers ─────────────────────────────────────────────────────────────────
type Item =
  | { type: 'msg'; key: string; message: Message; showTail: boolean }
  | { type: 'sep'; key: string; label: string };

function groupByDate(messages: Message[]): Item[] {
  const out: Item[] = [];
  let prevDate = '';
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const d = new Date(m.timestamp);
    const dateKey = d.toDateString();
    if (dateKey !== prevDate) {
      out.push({ type: 'sep', key: `sep-${dateKey}`, label: humanDate(d) });
      prevDate = dateKey;
    }
    const next = messages[i + 1];
    const showTail = !next || next.isMine !== m.isMine;
    out.push({ type: 'msg', key: m.id, message: m, showTail });
  }
  return out;
}

function humanDate(d: Date) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, today)) return 'Hôm nay';
  if (sameDay(d, yesterday)) return 'Hôm qua';
  return d.toLocaleDateString('vi-VN');
}
function sameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: NEUTRAL.bgSoft },
  center: { alignItems: 'center', justifyContent: 'center' },
  notFound: { color: NEUTRAL.textMuted, fontSize: 14 },

  expiredBanner: {
    backgroundColor: '#FCE6DE',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8B0A0',
  },
  expiredText: { fontSize: 11, color: '#8C3622', fontWeight: '600' },

  demoBanner: {
    backgroundColor: '#FFF4D6',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E8CE86',
  },
  demoText: { fontSize: 11, color: '#8A6D1B', fontWeight: '600' },

  syncStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: NEUTRAL.bg,
    borderBottomWidth: 1,
    borderBottomColor: NEUTRAL.borderSoft,
  },
  protRow: {
    flex: 1,
    backgroundColor: NEUTRAL.bgSoft,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  protText: {
    fontSize: 10, color: PROOFCHAT_THEME.primary,
    fontWeight: '700', letterSpacing: 0.3,
  },

  listContent: { paddingVertical: 12 },
  listEmpty: { flexGrow: 1 },
  dateSep: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginVertical: 12, paddingHorizontal: 24,
  },
  dateLine: { flex: 1, height: 1, backgroundColor: NEUTRAL.borderSoft },
  dateText: {
    fontSize: 11, fontWeight: '700',
    color: NEUTRAL.textMuted, letterSpacing: 0.5,
  },
});

export default ChatScreen;
