// components/AssistantBubble.tsx
//
// Bong bóng trợ lý nổi:
//  - Kéo thả tự do, snap về cạnh trái/phải khi thả tay.
//  - Nút X nhỏ để tắt (bật lại trong Cài đặt → Trợ lý).
//  - Tap mở panel chat (placeholder UI sẵn sàng nối với backend chatbot).

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  Image,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../store';
import {
  hydrateChatbot,
  setChatbotEnabled,
  setChatbotPosition,
} from '../store/chatbotSlice';
import { COLORS } from '../constants';
import {
  streamChat,
  StreamChatHandle,
  ChatHistoryEntry,
} from '../services/aladinChat';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const BUBBLE_SIZE = 56;
const EDGE_PADDING = 12;
const TOP_SAFE = Platform.OS === 'ios' ? 80 : 60;
const BOTTOM_SAFE = Platform.OS === 'ios' ? 100 : 90;
const DEFAULT_X = SCREEN_W - BUBBLE_SIZE - EDGE_PADDING;
const DEFAULT_Y = SCREEN_H - BUBBLE_SIZE - BOTTOM_SAFE - 80;

const clampX = (x: number) =>
  Math.max(EDGE_PADDING, Math.min(SCREEN_W - BUBBLE_SIZE - EDGE_PADDING, x));
const clampY = (y: number) =>
  Math.max(TOP_SAFE, Math.min(SCREEN_H - BUBBLE_SIZE - BOTTOM_SAFE, y));

interface ChatMessage {
  id: string;
  from: 'user' | 'bot';
  text: string;
  ts: number;
}

const SUGGESTIONS = [
  'Cách quét cây',
  'Truy xuất nguồn gốc quả',
  'Nạp tín dụng MAGIC',
];

const AssistantBubble: React.FC = () => {
  const dispatch = useDispatch<any>();
  const { enabled, position, hydrated } = useSelector(
    (s: RootState) => s.chatbot,
  );
  const isLoggedIn = useSelector((s: RootState) => !!s.user.currentUser);

  const pan = useRef(new Animated.ValueXY({ x: DEFAULT_X, y: DEFAULT_Y })).current;
  const lastPos = useRef({ x: DEFAULT_X, y: DEFAULT_Y });
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      from: 'bot',
      text: 'Xin chào 👋 Mình là trợ lý Aladin. Bạn cần giúp gì hôm nay?',
      ts: Date.now(),
    },
  ]);
  const [draft, setDraft] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const draggingRef = useRef(false);
  const streamHandleRef = useRef<StreamChatHandle | null>(null);

  // Abort stream khi unmount
  useEffect(() => {
    return () => {
      streamHandleRef.current?.abort();
      streamHandleRef.current = null;
    };
  }, []);

  // Hydrate from AsyncStorage on mount
  useEffect(() => {
    if (!hydrated) dispatch(hydrateChatbot());
  }, [hydrated, dispatch]);

  // Apply persisted position once hydrated
  useEffect(() => {
    if (hydrated && position) {
      const x = clampX(position.x);
      const y = clampY(position.y);
      pan.setValue({ x, y });
      lastPos.current = { x, y };
    }
  }, [hydrated, position, pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        draggingRef.current = false;
        pan.extractOffset();
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) {
          draggingRef.current = true;
        }
        Animated.event([null, { dx: pan.x, dy: pan.y }], {
          useNativeDriver: false,
        })(_, gesture);
      },
      onPanResponderRelease: () => {
        pan.flattenOffset();
        // Snap to nearest edge
        const cur: any = { x: (pan.x as any)._value, y: (pan.y as any)._value };
        const snapX =
          cur.x + BUBBLE_SIZE / 2 < SCREEN_W / 2
            ? EDGE_PADDING
            : SCREEN_W - BUBBLE_SIZE - EDGE_PADDING;
        const finalY = clampY(cur.y);
        Animated.spring(pan, {
          toValue: { x: snapX, y: finalY },
          friction: 7,
          useNativeDriver: false,
        }).start(() => {
          lastPos.current = { x: snapX, y: finalY };
          dispatch(setChatbotPosition({ x: snapX, y: finalY }));
        });
      },
    }),
  ).current;

  const handleTap = () => {
    if (draggingRef.current) {
      draggingRef.current = false;
      return;
    }
    setOpen(true);
  };

  const handleClose = () => {
    dispatch(setChatbotEnabled(false));
  };

  const handleSend = () => {
    const text = draft.trim();
    if (!text || isStreaming) return;

    const now = Date.now();
    const userMsg: ChatMessage = {
      id: `u_${now}`,
      from: 'user',
      text,
      ts: now,
    };
    const botId = `b_${now}`;
    const botMsg: ChatMessage = {
      id: botId,
      from: 'bot',
      text: '',
      ts: now,
    };

    // History gửi lên: tất cả lượt trước đó (bỏ lời chào welcome).
    const history: ChatHistoryEntry[] = messages
      .filter((m) => m.id !== 'welcome' && m.text.trim().length > 0)
      .map((m) => [m.text, m.from === 'user' ? 'user' : 'assistant']);

    setMessages((m) => [...m, userMsg, botMsg]);
    setDraft('');
    setIsStreaming(true);

    streamHandleRef.current?.abort();
    streamHandleRef.current = streamChat({
      message: text,
      history,
      onChunk: (_delta, full) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === botId ? { ...m, text: full } : m)),
        );
      },
      onDone: () => {
        setIsStreaming(false);
        streamHandleRef.current = null;
      },
      onError: (err) => {
        // Giữ lỗi gốc trong console để debug, KHÔNG hiện tiếng Anh kỹ thuật ra UI.
        console.error('[AssistantBubble] streamChat error:', err);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === botId
              ? {
                  ...m,
                  text:
                    m.text ||
                    'Xin lỗi, mình chưa kết nối được tới trợ lý. Bạn thử lại sau nhé.',
                }
              : m,
          ),
        );
        setIsStreaming(false);
        streamHandleRef.current = null;
      },
    });
  };

  // Don't render bubble on login flow or when disabled
  if (!isLoggedIn || !enabled) return null;

  return (
    <>
      <Animated.View
        style={[
          styles.bubbleWrap,
          { transform: pan.getTranslateTransform() },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleTap}
          style={styles.bubble}
        >
          <Image source={require('../../assets/images/chatbot.png')} style={{ width: 64, height: 64 }} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="close" size={12} color={COLORS.accent} />
        </TouchableOpacity>
      </Animated.View>

      <Modal
        visible={open}
        animationType="slide"
        transparent
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalRoot}>
          <StatusBar barStyle="dark-content" />
          <TouchableOpacity
            activeOpacity={1}
            style={styles.backdrop}
            onPress={() => setOpen(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.sheet}
          >
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <View style={styles.sheetIconWrap}>
                <Icon name="question" size={20} color={COLORS.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Trợ lý Aladin</Text>
                <Text style={styles.sheetSub}>Đang trực tuyến</Text>
              </View>
              <TouchableOpacity
                style={styles.sheetCloseBtn}
                onPress={() => setOpen(false)}
              >
                <Icon name="close" size={18} color={COLORS.textSub} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.messagesScroll}
              contentContainerStyle={styles.messagesContent}
              keyboardShouldPersistTaps="handled"
            >
              {messages.map((m) => {
                const isEmptyStreaming =
                  m.from === 'bot' && !m.text && isStreaming;
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.bubbleMsg,
                      m.from === 'user' ? styles.bubbleUser : styles.bubbleBot,
                    ]}
                  >
                    {isEmptyStreaming ? (
                      <Text style={styles.typingText}>Đang trả lời…</Text>
                    ) : (
                      <Text
                        style={[
                          styles.bubbleMsgText,
                          m.from === 'user' && { color: COLORS.white },
                        ]}
                      >
                        {m.text}
                      </Text>
                    )}
                  </View>
                );
              })}

              {messages.length <= 2 && (
                <View style={styles.suggestionsWrap}>
                  {SUGGESTIONS.map((s) => (
                    <TouchableOpacity
                      key={s}
                      style={styles.suggestionChip}
                      onPress={() => {
                        setDraft(s);
                      }}
                    >
                      <Text style={styles.suggestionText}>{s}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </ScrollView>

            <View style={styles.inputBar}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder="Hỏi trợ lý..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                onSubmitEditing={handleSend}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!draft.trim() || isStreaming}
                style={[
                  styles.sendBtn,
                  (!draft.trim() || isStreaming) && styles.sendBtnDisabled,
                ]}
              >
                <Icon
                  name={isStreaming ? 'dots-horizontal' : 'send'}
                  size={18}
                  color={COLORS.white}
                />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  bubbleWrap: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    zIndex: 9999,
    elevation: 12,
  },
  bubble: {
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12
  },
  closeBtn: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.white,
  },

  // Modal sheet
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 26, 46, 0.45)',
  },
  sheet: {
    backgroundColor: COLORS.bg,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '78%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sheetIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: COLORS.accentGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.text,
    letterSpacing: -0.2,
  },
  sheetSub: {
    fontSize: 11,
    color: COLORS.success,
    fontWeight: '600',
    marginTop: 1,
  },
  sheetCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.bgWarm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },

  // Messages
  messagesScroll: { flex: 1 },
  messagesContent: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  bubbleMsg: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
  },
  bubbleBot: {
    alignSelf: 'flex-start',
    backgroundColor: COLORS.bgWarm,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderBottomLeftRadius: 4,
  },
  bubbleUser: {
    alignSelf: 'flex-end',
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: 4,
  },
  bubbleMsgText: {
    fontSize: 13.5,
    color: COLORS.text,
    lineHeight: 19,
  },
  typingText: {
    fontSize: 13.5,
    color: COLORS.textMuted,
    fontStyle: 'italic',
    lineHeight: 19,
  },

  suggestionsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: COLORS.accentGlow,
    borderWidth: 1,
    borderColor: COLORS.accentLight,
  },
  suggestionText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.accent,
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 4,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 110,
    backgroundColor: COLORS.bgWarm,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  sendBtnDisabled: {
    opacity: 0.4,
    shadowOpacity: 0,
  },
});

export default AssistantBubble;
