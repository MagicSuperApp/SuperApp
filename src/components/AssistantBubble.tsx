// components/AssistantBubble.tsx
//
// Bong bóng trợ lý nổi — CỬA VÀO, không phải giao diện trợ lý.
//
//  - Kéo thả tự do, snap về cạnh trái/phải khi thả tay.
//  - Nút X nhỏ để tắt (bật lại trong Cài đặt → Trợ lý).
//  - CHẠM → mở LỚP TRỢ LÝ (`components/genie/GenieLayer`).
//  - GIỮ  → mở lớp với ý định nói (G3 sẽ bật mic ngay).
//
// ── Panel chat cũ đã GỠ, và vì sao ──────────────────────────────────────────
// Trước đây chạm bong bóng mở một panel chat riêng ngay trong tệp này. Từ khi
// Lớp Trợ lý ra đời, panel đó KHÔNG CÒN LỐI VÀO NÀO — chủ sở hữu chốt mặc định
// chạm bong bóng là mở lớp, và thanh hỏi ở trang Tổng quan (`openAssistant()`)
// cũng trỏ sang lớp.
//
// Giữ lại thì nó thành đúng thứ `navigation/actionRegistry.ts` đã phải dán cảnh
// báo lên đầu tệp: mã trông như đang sống, khai đủ nút, mà ngoài đồng không lối
// nào mở được — và đã có hai lượt rà kết luận nhầm vì nó. Nên gỡ.
//
// Phần streaming (`services/aladinChat.ts`) KHÔNG xoá: nó là đường nối cho chặng
// G4, và lúc đó nó nối vào LỚP, không nối lại vào đây.

import React, { useEffect, useRef } from 'react';
import { DeviceEventEmitter } from 'react-native';

import { ASSISTANT_OPEN_EVENT } from './assistantBus';
import {
  StyleSheet,
  TouchableOpacity,
  Animated,
  PanResponder,
  useWindowDimensions,
  Platform,
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
import { chatEnabled } from '../services/aladinChat';
import BlinkLogo from './BlinkLogo';
// Sổ playbook nhúng sẵn trong gói: bong bóng hiện khi trợ lý CÓ VIỆC LÀM ĐƯỢC,
// chứ không phải khi có endpoint hỏi-đáp. Đường tắt chạy trên máy, không mạng.
import { GENIE_PLAYBOOK_COUNT, genieMayOpen, useGenieRoute } from '../services/genie';
import { isPublicRoute } from '../navigation/authGate';
import { openGenieLayer } from './genie/genieLayerBus';
import { useGenie } from './genie/genieController';

const BUBBLE_SIZE = 56;
const EDGE_PADDING = 12;
const TOP_SAFE = Platform.OS === 'ios' ? 80 : 60;
const BOTTOM_SAFE = Platform.OS === 'ios' ? 100 : 90;

const AssistantBubble: React.FC = () => {
  const dispatch = useDispatch<any>();
  const { enabled, position, hydrated } = useSelector(
    (s: RootState) => s.chatbot,
  );
  const isLoggedIn = useSelector((s: RootState) => !!s.user.currentUser);
  const route = useGenieRoute();
  const layerOpen = useGenie().open;

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
  /**
   * Mở trợ lý TỪ NƠI KHÁC trong app (thanh hỏi ở trang Tổng quan).
   *
   * Dùng sự kiện chứ không dùng route: trợ lý nổi trên mọi màn, không phải một
   * trang — `navigate` tới nó là không có gì để tới. Cùng lối với sự kiện
   * `openScreen` sẵn có trong app.
   *
   * Nay sự kiện này mở thẳng LỚP TRỢ LÝ. Một bề mặt trợ lý, không phải hai:
   * hai bề mặt thì có cái sửa được mà cái kia không, và người dùng gặp cái nào
   * là do họ vào bằng cửa nào — không ai chủ ý thiết kế như thế.
   */
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(
      ASSISTANT_OPEN_EVENT,
      (payload?: { text?: string }) => {
        openGenieLayer(payload?.text ? { text: payload.text } : undefined);
      },
    );
    return () => sub.remove();
  }, []);

  const draggingRef = useRef(false);

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
      // ⚠ PHẢI là `false`. Đây là chỗ đã làm bong bóng KHÔNG MỞ ĐƯỢC.
      //
      // Trả `true` ở đây nghĩa là View cha giành quyền xử lý chạm NGAY LÚC NGÓN
      // TAY ĐẶT XUỐNG, trước khi có một chút di chuyển nào. Mà trong React Native
      // chỉ một view được làm responder: cha giành rồi thì `TouchableOpacity` con
      // không bao giờ nhận được cú chạm, nên `onPress={handleTap}` KHÔNG BAO GIỜ
      // chạy. Bong bóng vẫn vẽ ra, vẫn kéo thả được, vẫn sáng lên khi chạm — chỉ
      // là bấm vào thì không mở. Hỏng câm, và trông y như một cú bấm hụt.
      //
      // Phân biệt KÉO với BẤM đã có `onMoveShouldSetPanResponder` lo: chỉ khi
      // ngón tay đi quá 4px thì cha mới giành responder. Chưa quá 4px thì cú chạm
      // rơi xuống con — đúng định nghĩa của một cú bấm.
      onStartShouldSetPanResponder: () => false,
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
    openGenieLayer();
  };

  const handleLongPress = () => {
    // Kéo thả cũng kích hoạt long-press nếu ngón tay dừng lại giữa chừng; cùng
    // cái chốt `draggingRef` mà `handleTap` dùng, vì lý do y hệt.
    if (draggingRef.current) {
      draggingRef.current = false;
      return;
    }
    // Giu lau = y dinh noi. G3 se bat mic ngay; G2 mo lop o che do go.
    openGenieLayer({ voice: true });
  };

  const handleClose = () => {
    dispatch(setChatbotEnabled(false));
  };


  // Chỉ hiện bong bóng khi đã đăng nhập + đang bật + CÓ VIỆC GÌ ĐÓ LÀM ĐƯỢC.
  //
  // ── Vì sao điều kiện này vừa đổi ────────────────────────────────────────────
  // Bản trước là `isLoggedIn && enabled && chatEnabled()`, và lập luận lúc đó
  // ĐÚNG: không cấu hình `ALADIN_CHAT_URL` thì trợ lý không có nơi nào để hỏi;
  // trước nữa địa chỉ còn viết cứng là một tunnel tạm (xem `services/aladinChat.ts`)
  // nên câu hỏi của người dùng thật bay tới máy lạ. Ẩn đi là đúng.
  //
  // Nhưng lập luận đó nay LẠC HẬU, và nó lạc hậu theo hướng đắt: `.env` hiện để
  // `ALADIN_CHAT_URL=` rỗng, nên bong bóng KHÔNG DỰNG RA lấy một lần — trong khi
  // đường tắt Genie chạy hoàn toàn trên máy và KHÔNG CẦN endpoint nào. Gõ "thêm
  // vườn" là mở đúng màn, 0 token, không một gói tin nào ra mạng.
  //
  // Nên điều kiện đúng là "có việc gì đó làm được", và hôm nay có hai nguồn việc:
  // sổ playbook nhúng sẵn trong gói, hoặc endpoint hỏi-đáp nếu có cấu hình.
  //
  // ── Và KHÔNG hiện ở các màn CỬA VÀO ────────────────────────────────────────
  // `isLoggedIn` một mình chưa đủ: màn đăng nhập, khôi phục danh tính, chọn ngôn
  // ngữ, điều khoản… vẫn dựng trong lúc phiên cũ còn trong store, nên bong bóng
  // nổi lên ngay trên màn đăng nhập.
  //
  // Không chỉ xấu: `SeedExport`/`RestoreIdentity` là những màn mà một bong bóng
  // che mất một dòng có thể làm người dùng chép sai 24 từ khôi phục.
  //
  // Dùng thẳng `PUBLIC_ROUTES` (`navigation/authGate.tsx`) chứ không khai một
  // danh sách thứ hai: thêm một màn cửa-vào mới là tự động được che, không ai
  // phải nhớ. Chưa biết route (chưa `onStateChange` lần nào) thì ẨN — mặc định
  // an toàn, và nó chỉ kéo dài tới cú điều hướng đầu tiên.
  //
  // ── Và KHÔNG hiện khi LỚP TRỢ LÝ đang mở ───────────────────────────────────
  // Bong bóng là CỬA VÀO lớp. Lớp mở rồi mà cửa vào vẫn nổi lên trên là hai thứ
  // cùng nói một việc: người dùng bấm vào nó thì không có gì xảy ra (lớp đã mở),
  // và nó còn che mất một góc chính cái lớp mà nó vừa mở ra.
  // Hai tập, và phải soi CẢ HAI.
  //
  //   `PUBLIC_ROUTES`      — màn mở được khi CHƯA có phiên (đăng nhập, điều khoản…)
  //   `GENIE_ROUTE_DENY`   — màn trợ lý KHÔNG được tự mở (24 từ, ví, chat riêng…)
  //
  // Gác chỉ bằng tập thứ nhất là để lọt `Activation` và mấy màn danh tính khác:
  // chúng KHÔNG công khai (phải có phiên mới tới), nhưng cũng KHÔNG phải chỗ cho
  // một bong bóng nổi lên che chữ. Quy tắc gọn: **trợ lý không xuất hiện ở màn mà
  // chính nó không được phép mở.**
  const inPublic = route == null || isPublicRoute(route) || !genieMayOpen(route);
  const visible =
    isLoggedIn && enabled && !inPublic && !layerOpen
    && (GENIE_PLAYBOOK_COUNT > 0 || chatEnabled());

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
          // GIỮ bong bóng → mở LỚP TRỢ LÝ (lớp phủ toàn màn), CHẠM → panel gõ.
          // Hai cửa vào cho hai kiểu dùng, cùng một nút — người tay bẩn ngoài
          // vườn đỡ được một cú bấm.
          onLongPress={handleLongPress}
          delayLongPress={350}
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
