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
  useWindowDimensions,
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
  chatEnabled,
  StreamChatHandle,
  ChatHistoryEntry,
} from '../services/aladinChat';
import BlinkLogo from './BlinkLogo';

const BUBBLE_SIZE = 56;
const EDGE_PADDING = 12;
const TOP_SAFE = Platform.OS === 'ios' ? 80 : 60;
const BOTTOM_SAFE = Platform.OS === 'ios' ? 100 : 90;

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

  // Kích thước màn LẤY THEO HOOK (luôn đúng + phản ứng khi xoay). KHÔNG dùng
  // Dimensions.get() ở tầng module vì trên Android có lúc trả 0 khi app chưa dựng
  // xong → vị trí mặc định thành số ÂM → bong bóng nằm ngoài màn, không thấy đâu.
  const { width: winW, height: winH } = useWindowDimensions();
  const dims = useRef({ w: winW, h: winH });
  dims.current = { w: winW, h: winH };

  const clampX = (x: number) =>
    Math.max(EDGE_PADDING, Math.min(dims.current.w - BUBBLE_SIZE - EDGE_PADDING, x));
  const clampY = (y: number) =>
    Math.max(TOP_SAFE, Math.min(dims.current.h - BUBBLE_SIZE - BOTTOM_SAFE, y));
  const defaultPos = () => ({
    x: dims.current.w - BUBBLE_SIZE - EDGE_PADDING,
    y: dims.current.h - BUBBLE_SIZE - BOTTOM_SAFE - 80,
  });

  const pan = useRef(new Animated.ValueXY(defaultPos())).current;
  const lastPos = useRef(defaultPos());
  // Vị trí lúc bắt đầu kéo + vị trí (đã kẹp trong màn) hiện tại của lượt kéo.
  const dragStart = useRef(defaultPos());
  const curPos = useRef(defaultPos());
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
      curPos.current = { x, y };
    }
  }, [hydrated, position, pan]);

  // TẮT rồi BẬT LẠI → đưa bong bóng VỀ VỊ TRÍ MẶC ĐỊNH (góc dưới phải). Đây cũng
  // là cách lấy lại bong bóng khi lỡ kéo lạc mất. Chỉ reset khi CHUYỂN false→true
  // (không phải mỗi lần mở app) để không xoá vị trí người dùng đã đặt.
  const prevEnabledRef = useRef(enabled);
  useEffect(() => {
    const was = prevEnabledRef.current;
    prevEnabledRef.current = enabled;
    if (enabled && !was) {
      const p = defaultPos();
      pan.setValue(p);
      lastPos.current = p;
      curPos.current = p;
      dispatch(setChatbotPosition(p));
    }
  }, [enabled, pan, dispatch]);

  // Khi biết kích thước màn (lần đầu) hoặc xoay màn → kẹp lại cho chắc chắn nằm
  // TRONG màn hình. Đây là chốt chặn cuối để bong bóng không bao giờ lạc ra ngoài.
  useEffect(() => {
    const x = clampX(lastPos.current.x);
    const y = clampY(lastPos.current.y);
    pan.setValue({ x, y });
    lastPos.current = { x, y };
    curPos.current = { x, y };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winW, winH]);

  // Đưa bong bóng về sát cạnh gần nhất + kẹp trong màn, lưu lại. Dùng chung cho
  // cả RELEASE lẫn TERMINATE (bị responder khác cướp giữa chừng) để KHÔNG BAO GIỜ
  // để bong bóng kẹt ngoài màn hình.
  const settleToEdge = () => {
    const cur = curPos.current;
    const snapX =
      cur.x + BUBBLE_SIZE / 2 < dims.current.w / 2
        ? EDGE_PADDING
        : dims.current.w - BUBBLE_SIZE - EDGE_PADDING;
    const finalY = clampY(cur.y);
    curPos.current = { x: snapX, y: finalY };
    Animated.spring(pan, {
      toValue: { x: snapX, y: finalY },
      friction: 7,
      useNativeDriver: false,
    }).start(() => {
      lastPos.current = { x: snapX, y: finalY };
      dispatch(setChatbotPosition({ x: snapX, y: finalY }));
    });
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4,
      // Không nhường responder giữa lúc kéo → tránh ScrollView/overlay cướp gesture
      // làm mất sự kiện release (nguyên nhân bong bóng lạc ra ngoài trước đây).
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        draggingRef.current = false;
        dragStart.current = { ...lastPos.current };
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.abs(gesture.dx) > 4 || Math.abs(gesture.dy) > 4) {
          draggingRef.current = true;
        }
        // KẸP LIÊN TỤC: bong bóng không thể bị kéo ra khỏi màn hình.
        const x = clampX(dragStart.current.x + gesture.dx);
        const y = clampY(dragStart.current.y + gesture.dy);
        curPos.current = { x, y };
        pan.setValue({ x, y });
      },
      onPanResponderRelease: settleToEdge,
      // Gesture bị hủy (cướp responder / nhấc tay ngoài vùng) vẫn phải về trong màn.
      onPanResponderTerminate: settleToEdge,
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

  // Chỉ hiện bong bóng khi đã đăng nhập + đang bật + CÓ endpoint để gọi.
  // `chatEnabled()` là điều kiện mới: bản phát hành không cấu hình `ALADIN_CHAT_URL`
  // thì trợ lý không có nơi nào để hỏi. Trước đây địa chỉ viết cứng là một tunnel tạm
  // (xem `services/aladinChat.ts`) — bong bóng vẫn hiện, người dùng vẫn gõ câu hỏi, và
  // hoặc là câu hỏi bay tới máy lạ, hoặc là quay tròn rồi báo lỗi. Cả hai đều tệ hơn ẩn.
  const visible = isLoggedIn && enabled && chatEnabled();

  return (
    <>
      {/* [DEBUG — chỉ hiện ở bản dev] Băng chẩn đoán: cho biết vì sao bong bóng
          ẩn (login/enabled/hydrated) và kích thước màn đo được. Xoá khi xong. */}
      {/* {__DEV__ && (
        <View pointerEvents="none" style={styles.debugBadge}>
          <Text style={styles.debugText}>
            🫧 login={String(isLoggedIn)} · enabled={String(enabled)} · hydrated=
            {String(hydrated)} · {Math.round(winW)}×{Math.round(winH)} · pos=
            {position ? `${Math.round(position.x)},${Math.round(position.y)}` : 'null'}
          </Text>
        </View>
      )} */}

      {visible && (
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
          <BlinkLogo size={BUBBLE_SIZE} autoPlay loop />
          {/* <Image source={require('../../assets/images/chatbot.png')} style={{ width: 64, height: 64 }} /> */}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleClose}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Icon name="close" size={12} color={COLORS.accent} />
        </TouchableOpacity>
      </Animated.View>
      )}

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
    boxShadow: '0px 6px 12px rgba(40, 91, 35, 0.35)',
    borderRadius: BUBBLE_SIZE / 2,
  },
  // [DEBUG] băng chẩn đoán — xoá sau khi tìm ra nguyên nhân.
  debugBadge: {
    position: 'absolute',
    top: 120,
    left: 8,
    right: 8,
    backgroundColor: 'rgba(200,0,0,0.9)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    zIndex: 100000,
    elevation: 100000,
  },
  debugText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
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
