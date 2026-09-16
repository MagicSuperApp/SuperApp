// components/genie/GenieLayer.tsx
//
// LỚP TRỢ LÝ — dựng theo `docs/AI_ASSISTANT_UI-UX.md`.
//
// ── §2: MỘT LỚP ĐỘC LẬP TRÊN TOÀN BỘ APP ───────────────────────────────────
// Dựng ở `navigation/index.tsx` ngay sau `<AssistantBubble />` — ANH EM của
// `Stack.Navigator`, không nằm trong nó. Không màn hình nào phải sửa gì, và lớp
// dùng lại được ở mọi màn (§21: *"Không hard-code cho một screen cụ thể"*).
//
// `<CoachMarkOverlay />` đứng TRÊN lớp này, cố ý: khi trợ lý chiếu đèn vào một
// nút, lớp phải nhường chỗ chứ không che nó.
//
// ── §3: LỚP KÍNH TỐI, KHÔNG PHẢI MÀN ĐEN ───────────────────────────────────
// `rgba(0,10,8,0.62)` — màn bên dưới vẫn nhìn thấy nhưng đã lùi ra sau. Đây là
// chỗ ĐỔI so với bản trước: bản trước cố ý để trong suốt hoàn toàn, và nó sai
// với §3/§17 — sự chú ý phải chuyển hẳn sang Trợ lý, màn cũ chỉ còn là ngữ cảnh.
//
// ⚠ CÒN THIẾU: `backdrop blur` của §4. React Native không có blur nền cho view
//   thường, và kho này chưa có `expo-blur` / `@react-native-community/blur`. Phần
//   DIM đã làm đúng spec; phần BLUR thì chưa, và nó chưa làm được nếu không thêm
//   một native dependency + dựng lại native. Nói ra thay vì để nó trôi.
//
// ── §21: LỚP CHẶN THAO TÁC VỚI MÀN BÊN DƯỚI ────────────────────────────────
// Chủ sở hữu chốt: *"layer đè lên thì không được cho thao tác"* — đúng tinh thần
// §20 ("AI Assistant layer đang chiếm quyền tương tác tạm thời"). Lớp nuốt mọi cú
// chạm không rơi vào nút của chính nó.
//
// ⚠ Nuốt chạm KHÔNG có nghĩa chạm-đâu-cũng-đóng. Bản đầu làm thế và nó sai: người
//   dùng chạm nhầm là lớp biến mất giữa câu. Đường ra là NÚT X.
//
// ── G2: CHƯA CÓ GIỌNG ───────────────────────────────────────────────────────
// Nút Mic có mặt vì nó là control CHÍNH (§12), nhưng bấm vào thì nó nói thật là
// giọng nói chưa dựng xong rồi mở bàn phím. Một nút chết im lặng thì người dùng
// bấm ba lần rồi nghĩ máy hỏng.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  PermissionsAndroid,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';

import type { RootState } from '../../store';
import { COLORS } from '../../theme';
import { t } from '../../i18n';
import EdgeWave from './EdgeWave';
import RichText from './RichText';
import { Envelope, styleFor } from './edgeWaveMath';
import {
  closeAssistant, pushMessage, setAgentState, setAudioLevel, setTypingMode, useGenie,
} from './genieController';
import GenieSectionsPanel from './GenieSectionsPanel';
import { useAutoOpenOnLogin } from './autoOpenOnLogin';
import {
  GENIE_PLAYBOOK_COUNT,
  useGenieRoute,
  genieMayOpen,
} from '../../services/genie';
import { ask as genieAsk, type AskHandle } from '../../services/genie/genieAgent';
import { asr } from '../../services/genie/asr';
import { tts } from '../../services/genie/tts';
import { prepareImages, imageSupportAvailable } from '../../services/genie/genieImage';

// Bộ chọn ảnh nạp MỀM — cùng khuôn `ActivityScreen.tsx` và `FruitVideo`: máy chưa
// có thì báo rõ, không làm đổ app.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const imagePicker = (() => {
  try {
    return require('react-native-image-picker');
  } catch {
    return null;
  }
})();
import { isPublicRoute } from '../../navigation/authGate';

/**
 * Sau khi Agent mở xong một màn thì bao lâu nữa lớp tự tắt (§16).
 *
 * Đủ dài để đọc hết một câu hướng dẫn ngắn, đủ ngắn để không chắn màn vừa mở.
 * [THAM SỐ THỬ NGHIỆM] — chốt lại bằng đo trên người dùng thật, không bằng cảm
 * giác của ai trong phòng.
 */
const CLOSE_AFTER_OPEN_MS = 2200;



/**
 * Màn CHÀO — hiện khi người dùng chưa hỏi gì.
 *
 * ── Vì sao đổi từ một câu hướng dẫn sang một lời tự giới thiệu ──────────────
 * Bản trước đặt ở đây một câu dạy cách dùng ("bác cứ nói bình thường…"). Chủ sở
 * hữu chốt bỏ, và bỏ là đúng: người vừa mở lớp phủ lần đầu chưa biết mình đang
 * nói chuyện với AI hay với một cái máy tra cứu, nên thứ họ cần trước hết là
 * BIẾT MÌNH ĐANG NÓI VỚI AI — một cái tên, một vai trò, rồi một lời chào.
 *
 * Câu chào để trong một BONG BÓNG y hệt mọi câu sau của trợ lý, cố ý: nó nói cho
 * mắt biết đây là lời của trợ lý, không phải chữ trang trí của app. Nhưng nó
 * KHÔNG phải một tin thật trong kho — xem chỗ dựng bên dưới.
 */
/** Tên trợ lý. KHÔNG dịch và KHÔNG đổi theo instance — nó là một cái tên riêng. */
const GENIE_NAME = 'GENIE';
const GENIE_TAGLINE = 'Trợ lý thông minh';
/**
 * Lời chào. `{brand}` chứ không phải tên app viết cứng.
 *
 * `i18n/translate.ts` thay chỗ này bằng tên của chính app đang chạy. Viết cứng
 * một cái tên thì bản CheckFarm chào người dùng bằng tên một app khác — đúng lỗi
 * đã đo được ngày 29/08 ở 15 chuỗi xin quyền, và là lý do chỗ thay này tồn tại.
 *
 * ── Vì sao là HÀM, không phải hằng chuỗi ───────────────────────────────────
 * Hai lý do, và cả hai đều bắt buộc:
 *
 *   · Gọi `t()` lúc NẠP MODULE là đóng băng bản dịch theo ngôn ngữ lúc app khởi
 *     động; người dùng đổi ngôn ngữ xong thì câu này đứng nguyên tiếng cũ.
 *   · `i18n/brandSlot.test.ts` soi TỪNG DÒNG: một dòng có `{brand}` mà không có
 *     lời gọi dịch nào trên chính dòng ấy là đỏ. Cổng đó thô, nhưng nó thô có lý
 *     do — `autoText.tsx` bỏ qua `t()` ở tiếng Việt, nên một chuỗi `{brand}`
 *     không đi qua `t()` sẽ hiện nguyên dấu ngoặc nhọn cho phần đông người dùng.
 *     Để lời gọi và chỗ thay trên cùng một dòng là chứng minh được bằng mắt.
 */
const cauChao = () =>
  t('Xin chào, mình là trợ lý của bạn trên {brand}. Mình có thể giúp gì cho bạn?');

/**
 * §18 — nền kính tối. KHÔNG đen 100%: màn bên dưới phải còn nhìn thấy.
 *
 * 0.78 chứ không phải 0.62 như bản trước: chủ sở hữu chốt tối hơn nữa. Con số
 * này vượt khoảng §3 của spec (0.55–0.70) — ghi ra đây để lần sau không ai "sửa
 * lại cho đúng spec" mà không biết nó đã bị đảo có chủ ý.
 *
 * Và nó DỪNG ở đây, không đi tiếp: §3 gọi lớp này là KÍNH TỐI, không phải màn
 * đen. Màn bên dưới còn nhìn thấy là phần ngữ cảnh của câu đang hỏi — trợ lý vừa
 * mở một màn thì người dùng phải thấy được nó ngay sau lớp phủ. Đục hẳn là lớp
 * phủ thành một trang riêng, và lúc ấy §16 (tự tắt sau khi mở màn) mất chỗ dựa.
 */
const GLASS = 'rgba(0, 10, 8, 0.78)';
/**
 * Nền các khối chữ.
 *
 * Trước đây là "kính tối hơn một bậc so với nền" — đúng khi `GLASS` còn ở 0.62.
 * Nền vừa xuống 0.78, và lúc đó một bong bóng tối hơn nữa thì nó TAN VÀO nền:
 * không còn đường viền nào cho mắt bám, và cả dòng tin đọc ra thành chữ trôi
 * lơ lửng chứ không phải mấy câu nói xếp chồng.
 *
 * Nên hai mã này đi NGƯỢC chiều với `GLASS`: nền càng tối thì bong bóng càng
 * phải sáng lên, vì thứ cần giữ không phải độ tối của từng cái mà là KHOẢNG CÁCH
 * giữa chúng.
 */
const CHIP_AGENT = 'rgba(19, 137, 68, 0.88)';
const CHIP_USER = 'rgba(0, 165, 82, 0.86)';
const CHIP_CTRL = 'rgba(4, 20, 14, 0.62)';

/**
 * §18 — màu ánh sáng: trắng ngả mint.
 *
 * Cố ý KHÔNG lấy từ bộ token thương hiệu: bộ đó toàn sắc lục ấm, và ánh sáng vẽ
 * bằng chính màu nền thì nó chìm vào nền. Ánh sáng phải SÁNG HƠN và LẠNH HƠN.
 * Đây là hằng thị giác ở tầng component, cùng loại với `RING`/`SCRIM` ở
 * `onboarding/CoachMarkOverlay.tsx` — ràng buộc "cấm hex" của
 * `Integration-Standard.md §2.1` áp cho LỜI KHAI, không áp cho hằng vẽ.
 */
const MINT = '#CFF7E4';
const NEON = '#5BE9A6';

/**
 * Màu hai nút nhỏ dưới bong bóng: TRẮNG MỜ.
 *
 * Trắng chứ không màu thương hiệu, và mờ chứ không đậm: chúng là việc phụ, đứng
 * dưới mọi câu. Cho chúng màu neon là để một hàng chấm sáng chạy dọc dòng tin,
 * kéo mắt khỏi đúng thứ cần đọc.
 */
const ACT = 'rgba(255,255,255,0.42)';

const GenieLayer: React.FC = () => {
  const insets = useSafeAreaInsets();
  const isLoggedIn = useSelector((s: RootState) => !!s.user.currentUser);
  const enabledPref = useSelector((s: RootState) => s.chatbot.enabled);
  const route = useGenieRoute();
  const g = useGenie();

  const [draft, setDraft] = useState('');
  /** Panel danh sách cuộc (sau nút menu góc trên trái). */
  const [menu, setMenu] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;

  // Ẩn ở màn CỬA VÀO: người dùng mở lớp rồi đăng xuất thì lớp phải biến mất theo
  // chứ không phủ lên màn đăng nhập. Một lớp che mất một dòng trên `SeedExport`
  // có thể làm người ta chép sai 24 từ khôi phục.
  //
  // Tính ở ĐÂY chứ không ngay trước chỗ `return null`: cửa gác tự-mở bên dưới cần
  // đúng con số này, và nó là một hook — hook không được nằm sau một lối thoát.
  const inPublic = route == null || isPublicRoute(route) || !genieMayOpen(route);

  // Tự mở MỘT LẦN sau khi đăng nhập. Mọi luật nằm ở `autoOpenOnLogin.ts`.
  useAutoOpenOnLogin({
    loggedIn: isLoggedIn,
    enabled: enabledPref && GENIE_PLAYBOOK_COUNT > 0,
    routeOk: !inPublic,
    layerOpen: g.open,
  });

  // ── Chỗ đặt CỤM SÓNG giữa màn ─────────────────────────────────────────────
  //
  // Cụm sóng do Canvas vẽ (một lượt phủ cả màn), nhưng CHỖ của nó do BỐ CỤC
  // quyết — nó phải nằm đúng khoảng trống mà bố cục dành cho nó, và khoảng đó co
  // lại khi bàn phím bung lên.
  //
  // Đo bằng `measureInWindow` rồi TRỪ gốc của chính lớp phủ: `onLayout` chỉ cho
  // toạ độ so với cha, mà cha ở đây nằm sau vài tầng. Trên Android toạ độ cửa sổ
  // còn gồm cả thanh trạng thái. Đây đúng phép đo mà `onboarding/CoachMarkOverlay`
  // đã phải làm, và vì cùng lý do: vẽ theo toạ độ cửa sổ thô thì hình LỆCH.
  const rootRef = useRef<View | null>(null);
  const bandRef = useRef<View | null>(null);
  const [band, setBand] = useState<{ cy: number; halfH: number } | null>(null);

  const doBand = useCallback(() => {
    const r = rootRef.current;
    const b = bandRef.current;
    if (!r || !b) return;
    r.measureInWindow((rx, ry) => {
      b.measureInWindow((bx, by, bw, bh) => {
        if (!bh) return;
        setBand({ cy: by - ry + bh / 2, halfH: bh / 2 });
      });
    });
  }, []);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Lượt đang chạy — giữ để cắt được khi người dùng hỏi tiếp hoặc đóng lớp. */
  const inflight = useRef<AskHandle | null>(null);
  /** Hàm dừng phần NGHE / phần ĐỌC đang chạy. `null` = đang không chạy. */
  const dungNghe = useRef<(() => void) | null>(null);
  const dungNoi = useRef<(() => void) | null>(null);

  // Hẹn giờ tắt phải huỷ được: người dùng đóng tay, hoặc hỏi tiếp câu nữa, thì
  // một cái hẹn còn sống sẽ tắt lớp giữa câu sau.
  const huyHenTat = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);
  useEffect(() => huyHenTat, [huyHenTat]);

  // ── §8/§10 — NÓI ra một câu ──────────────────────────────────────────────
  //
  // MỘT đường duy nhất cho mọi lời của trợ lý: hiện chữ, rồi đọc, rồi lấy biên độ
  // giọng đọc đẩy vào sóng viền. Có hai đường thì sẽ có câu hiện mà không đọc, và
  // sóng sẽ nhấp nhô trong lúc trợ lý đang im.
  //
  // Máy chưa có phần đọc ⇒ chỉ hiện chữ. Trợ lý im tiếng vẫn dùng được.
  const noi = useCallback((text: string) => {
    pushMessage('agent', text);
    setAgentState('speaking');
    dungNoi.current?.();
    dungNoi.current = tts.speak(text, {
      onLevel: setAudioLevel,
      onDone: () => {
        dungNoi.current = null;
        setAudioLevel(0);
      },
    });
  }, []);

  // ── G5 — CỬA GẬT cho tool GHI (T2) ───────────────────────────────────────
  //
  // Đây là chỗ DUY NHẤT trong app mà trợ lý xin phép ghi, và nó cố ý nằm ở lớp
  // phủ chứ không ở service: sự đồng ý phải do MẮT NGƯỜI cho, nên nó phải ở nơi
  // có mắt người.
  //
  // Ba luật, và cả ba đều là luật chứ không phải tuỳ chọn (§4.6):
  //   1. IM LẶNG KHÔNG PHẢI ĐỒNG Ý — không có hết-giờ-thì-coi-như-gật, không có
  //      nút nào được bấm sẵn. Lớp đóng giữa chừng ⇒ LẮC.
  //   2. Câu đọc lại bằng TÊN, không bằng MÃ. Chữ hiện ra đây do máy chủ dựng từ
  //      `IdLedger`; lớp phủ KHÔNG tự viết lại, vì viết lại là mở đường cho hai
  //      bên hiểu khác nhau về cùng một lời ghi.
  //   3. Một gật, một lần. Việc tiêu cái gật nằm ở máy chủ, ngay trước lúc ghi.
  /** Dòng tin — giữ để tự cuộn xuống câu mới nhất. */
  const streamRef = useRef<ScrollView | null>(null);

  /**
   * Cuộn xuống đáy khi có câu mới.
   *
   * `animated: false` lúc lớp vừa mở, `true` về sau — một cú cuộn có hoạt ảnh ở
   * khung hình đầu tiên đọc thành giật, còn về sau thì nó nói cho mắt biết có chữ
   * mới vừa tới.
   */
  /**
   * Chép một câu ra bộ nhớ tạm.
   *
   * KHÔNG hiện thông báo "đã chép": một dòng chữ bật ra giữa dòng tin sẽ đẩy mọi
   * thứ nhảy một nhịp, và người dùng vừa bấm thì họ đã biết mình vừa bấm gì.
   */
  const chepCau = useCallback((text: string) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      require('@react-native-clipboard/clipboard').default.setString(text);
    } catch {
      // Máy không có module bộ nhớ tạm — im lặng bỏ qua. Đây là việc phụ, nó
      // không được phép làm đổ màn hình.
    }
  }, []);

  const xuongCuoi = useCallback(() => {
    streamRef.current?.scrollToEnd({ animated: true });
  }, []);

  const [confirm, setConfirm] = useState<{ text: string; callId: string } | null>(null);
  const confirmResolve = useRef<((ok: boolean) => void) | null>(null);

  const traLoiGat = useCallback((ok: boolean) => {
    const f = confirmResolve.current;
    confirmResolve.current = null;
    setConfirm(null);
    f?.(ok);
  }, []);

  const xinPhep = useCallback((text: string, callId: string): Promise<boolean> => {
    // Đang có một lời xin khác treo ⇒ LẮC cái cũ trước. Chồng hai cửa gật lên
    // nhau thì người dùng gật cái này mà máy chủ tiêu cái kia.
    confirmResolve.current?.(false);
    setConfirm({ text, callId });
    setAgentState('speaking');
    return new Promise<boolean>((res) => {
      confirmResolve.current = res;
    });
  }, []);

  // Lớp đóng trong lúc còn treo một lời xin ⇒ LẮC. Người dùng bỏ đi không phải
  // là người dùng đồng ý.
  useEffect(() => {
    if (!g.open && confirmResolve.current) traLoiGat(false);
  }, [g.open, traLoiGat]);

  // ── Hỏi một câu ──────────────────────────────────────────────────────────
  //
  // Lớp phủ KHÔNG tự nghĩ câu nào. Mọi lời đều từ `services/genie/genieAgent.ts`
  // — đường tắt trên máy trước, mô hình sau. Để câu chữ ở một chỗ thì nó mới xoay
  // vòng được, và mới không có hai nơi cùng nói hai kiểu về cùng một việc.
  const ask = useCallback((raw: string) => {
    const text = raw.trim();
    if (!text) return;

    // TẮT BÀN PHÍM ngay khi gửi.
    //
    // Bàn phím che gần nửa màn, và nửa bị che là nửa có ba dải sóng — tức là
    // đúng chỗ Trợ lý đang nói "em đang nghĩ" bằng hình. Người dùng gửi xong là
    // họ chuyển sang CHỜ, không gõ nữa; để bàn phím đứng đó là bắt họ tự bấm nút
    // quay lại mới nhìn được câu trả lời.
    //
    // `Keyboard.dismiss()` chứ không `blurOnSubmit`: nút gửi cũng phải tắt được
    // bàn phím, và `blurOnSubmit` chỉ lo cho phím Enter.
    Keyboard.dismiss();

    huyHenTat();
    setDraft('');
    pushMessage('user', text);
    setAgentState('processing');

    // Cắt lượt cũ trước khi mở lượt mới. Hai dòng chạy song song thì hai câu trả
    // lời sẽ đan vào nhau trong cùng một hộp tin — đọc như trợ lý đang lẩm bẩm.
    inflight.current?.abort();
    inflight.current = genieAsk(text, {
      onSay: noi,
      onState: (st) => {
        // Bảng trạng thái của service (§11) và của lớp phủ (§15) không trùng tên.
        // Đổi ở ĐÂY, một chỗ — để mỗi bên giữ được từ vựng của mình.
        if (st === 'thinking') setAgentState('processing');
        else if (st === 'speaking') setAgentState('speaking');
      },
      onOpened: () => {
        // §16 — LỚP GIỮ NGUYÊN trong lúc điều hướng, rồi TỰ TẮT khi đã mở xong.
        //
        // Spec §16 cho cả hai đường ("Overlay có thể tự động thu nhỏ/tắt. Hoặc
        // giữ Assistant active"); chủ sở hữu chốt đường TẮT. Và nó đúng: trợ lý
        // vừa mở một màn CHO NGƯỜI DÙNG XEM — để lớp che lên trên là làm hỏng
        // đúng việc mình vừa làm, nhất là khi lớp đang chặn mọi thao tác (§21).
        //
        // Chờ `CLOSE_AFTER_OPEN_MS` chứ không tắt ngay: câu "Em mở … rồi. Bác
        // chọn **Tự động ghi** hay **Tự vẽ điểm**?" là lời hướng dẫn cho đúng
        // cái màn vừa mở. Tắt tức thì thì nó nhấp nháy một cái rồi mất, và bác
        // nông dân nhìn vào một màn lạ mà không ai nói gì.
        setAgentState('executing');
        huyHenTat();
        closeTimer.current = setTimeout(closeAssistant, CLOSE_AFTER_OPEN_MS);
      },
      // G5 — cửa gật cho tool GHI (T2). Xem `xinPhep` bên dưới.
      onConfirm: xinPhep,
      onDone: () => setAgentState('speaking'),
    });
  }, [huyHenTat, xinPhep, noi]);

  // Cắt lượt đang chạy khi lớp đóng hoặc component tháo. Không cắt thì một câu
  // trả lời về muộn sẽ rơi vào một hộp tin đã đóng — và hiện ra ở lần mở sau.
  useEffect(() => {
    if (!g.open) {
      inflight.current?.abort();
      setMenu(false);
    }
  }, [g.open]);

  // Người dùng ĐỔI SANG CUỘC KHÁC trong panel ⇒ cắt lượt đang chạy và im tiếng.
  // Không cắt thì câu trả lời của cuộc cũ về muộn và rơi vào cuộc vừa mở — hai
  // mạch chuyện lồng vào nhau trong một hộp tin, không ai đọc ra nổi câu nào trả
  // lời câu nào.
  //
  // So với LẦN TRƯỚC chứ không chạy theo mỗi lượt vẽ, và phải soi cả `open`: mở
  // lớp cũng sinh ra một cuộc mới, và nhịp `activated` của §15 vừa đặt xong sẽ bị
  // chính chỗ này gạt về `idle` — lớp hiện ra mà không có gì báo là nó đang sống.
  const truoc = useRef({ id: g.activeId, open: g.open });
  useEffect(() => {
    const p = truoc.current;
    truoc.current = { id: g.activeId, open: g.open };
    if (!g.open || !p.open || p.id === g.activeId) return;
    inflight.current?.abort();
    dungNoi.current?.();
    dungNoi.current = null;
    setAgentState('idle');
  }, [g.activeId, g.open]);
  useEffect(() => () => inflight.current?.abort(), []);

  // ── G3 — NGHE và NÓI ─────────────────────────────────────────────────────
  //
  // Hai cổng ở `services/genie/{asr,tts}.ts` đều DÒ module native lúc chạy. Kho
  // này chưa cài module nào, nên hôm nay `available()` trả `false` và nút mic
  // nói đúng sự thật đó. Cài `@react-native-voice/voice` + `expo-speech` rồi
  // dựng lại native là nó tự sống, KHÔNG phải sửa tệp này.
  const [nghe, setNghe] = useState(false);

  const bamMic = useCallback(() => {
    // Đang nghe ⇒ bấm lần nữa là DỪNG. Một nút, hai nghĩa, và nghĩa hiện tại đọc
    // được từ hình cái nút (mic ↔ ô vuông) — không bắt người dùng nhớ.
    if (nghe) {
      dungNghe.current?.();
      dungNghe.current = null;
      setNghe(false);
      setAgentState('idle');
      return;
    }

    if (!asr.available()) {
      // Nói THẲNG là máy chưa có, rồi mở bàn phím. Một nút bấm vào không có gì
      // xảy ra là thứ làm người ta nghĩ app hỏng.
      noi(t('Máy mình chưa nghe được giọng nói ạ. Bác gõ giúp em nhé.'));
      setTypingMode(true);
      return;
    }

    // BARGE-IN (§10): người dùng bấm mic trong lúc trợ lý đang đọc ⇒ trợ lý IM
    // NGAY. Nói đè lên người là cách nhanh nhất để người ta bỏ trợ lý.
    dungNoi.current?.();
    dungNoi.current = null;
    inflight.current?.abort();

    setNghe(true);
    setAgentState('listening');
    dungNghe.current = asr.start({
      // Biên độ mic đi ĐÚNG đường mà biên độ loa đi — qua `setAudioLevel`, rồi
      // qua `Envelope`. Một đường, nên sóng viền không thể có hai độ mượt khác
      // nhau tuỳ theo ai đang phát ra tiếng.
      onLevel: setAudioLevel,
      onPartial: (txt) => setDraft(txt),
      onFinal: (txt) => {
        dungNghe.current = null;
        setNghe(false);
        setAudioLevel(0);
        ask(txt);
      },
      onError: () => {
        dungNghe.current = null;
        setNghe(false);
        setAudioLevel(0);
        noi(t('Em nghe chưa rõ ạ. Bác nói lại hoặc gõ giúp em nhé.'));
      },
    });
  }, [nghe, ask, noi]);

  // ── G6 — GỬI ẢNH ─────────────────────────────────────────────────────────
  //
  // Chụp xong thì ảnh đi thẳng vào lượt, KHÔNG qua đường tắt: đường tắt chỉ đọc
  // chữ, nên nó sẽ nuốt câu và làm rơi mất tấm ảnh (xem `genieAgent.ask`).
  //
  // Câu đi kèm lấy từ ô nhập nếu người dùng đã gõ gì đó. Trống thì đặt một câu
  // hỏi chung — mô hình cần BIẾT người ta hỏi gì về tấm ảnh; gửi ảnh trần là bắt
  // nó đoán, và nó sẽ đoán.
  const bamAnh = useCallback(async () => {
    if (!imagePicker?.launchCamera || !imageSupportAvailable()) {
      noi(t('Máy mình chưa gửi ảnh được ạ. Bác gõ giúp em nhé.'));
      return;
    }

    // Android: hộp quyền phải do APP bật TRƯỚC. `launchCamera` không tự xin, và
    // không xin thì máy ảnh loé lên rồi tắt — đúng lỗi đội thực địa đã báo trên
    // `ActivityScreen`, và người dùng đọc nó thành "máy ảnh hỏng".
    if (Platform.OS === 'android') {
      const ok = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.CAMERA,
        {
          title: t('Trợ lý cần máy ảnh'),
          message: t('Em cần xem ảnh để trả lời bác ạ.'),
          buttonPositive: t('Cho phép'),
          buttonNegative: t('Không'),
        },
      );
      if (ok !== PermissionsAndroid.RESULTS.GRANTED) {
        noi(t('Chưa có quyền máy ảnh nên em chưa xem được ạ.'));
        return;
      }
    }

    imagePicker.launchCamera(
      { mediaType: 'photo', quality: 1, saveToPhotos: false },
      async (res: { didCancel?: boolean; assets?: Array<{ uri?: string; width?: number; height?: number }> }) => {
        if (res?.didCancel) return;
        const a = res?.assets?.[0];
        if (!a?.uri) {
          noi(t('Em chưa nhận được ảnh ạ. Bác chụp lại giúp em nhé.'));
          return;
        }
        setAgentState('processing');
        const anh = await prepareImages([{ uri: a.uri, width: a.width, height: a.height }]);
        if (!anh.length) {
          noi(t('Ảnh này em chưa đọc được ạ. Bác chụp lại giúp em nhé.'));
          return;
        }
        const cau = draft.trim() || t('Bác xem giúp em tấm ảnh này với ạ.');
        setDraft('');
        pushMessage('user', cau);
        inflight.current?.abort();
        inflight.current = genieAsk(cau, {
          onSay: noi,
          onState: (st) => {
            if (st === 'thinking') setAgentState('processing');
            else if (st === 'speaking') setAgentState('speaking');
          },
          onConfirm: xinPhep,
          onDone: () => setAgentState('speaking'),
        }, anh);
      },
    );
  }, [draft, xinPhep, noi]);

  // Tháo lớp / đóng lớp ⇒ thả mic và tắt tiếng. Một mic còn mở sau khi lớp đóng
  // là một mic đang ghi mà không ai thấy nó đang ghi.
  useEffect(() => {
    if (g.open) return;
    dungNghe.current?.();
    dungNghe.current = null;
    dungNoi.current?.();
    dungNoi.current = null;
    setNghe(false);
  }, [g.open]);
  useEffect(() => () => {
    dungNghe.current?.();
    tts.stopAll();
  }, []);


  // ── §8: làm mượt biên độ âm thanh ────────────────────────────────────────
  // Giá trị thô từ `setAudioLevel` đi qua đây trước khi tới chỗ vẽ. Một chỗ duy
  // nhất, nên mic của người và giọng của trợ lý không thể có hai độ mượt khác nhau.
  const env = useRef(new Envelope()).current;
  const [level, setLevel] = useState(0);
  const lastTick = useRef(0);

  useEffect(() => {
    if (!g.open) {
      env.reset(0);
      setLevel(0);
      return undefined;
    }
    let raf = 0;
    const tick = (ts: number) => {
      const dt = lastTick.current ? ts - lastTick.current : 16;
      lastTick.current = ts;
      setLevel(env.push(g.audioLevel, dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastTick.current = 0;
    };
  }, [g.open, g.audioLevel, env]);

  // ── §19: vào/ra mượt, không phải fade thô ────────────────────────────────
  useEffect(() => {
    Animated.timing(fade, {
      toValue: g.open ? 1 : 0,
      duration: g.open ? 260 : 180,
      useNativeDriver: true,
    }).start();
    if (!g.open) {
      Keyboard.dismiss();
      setDraft('');
      huyHenTat();
    }
  }, [g.open, fade, huyHenTat]);

  // §15: `activated` chỉ là một nhịp mở màn — lắng xuống `idle` sau khi người
  // dùng kịp thấy lớp đã lên.
  useEffect(() => {
    if (g.state !== 'activated') return undefined;
    const id = setTimeout(() => setAgentState('idle'), 900);
    return () => clearTimeout(id);
  }, [g.state]);

  if (!g.open || !isLoggedIn || !enabledPref || inPublic || GENIE_PLAYBOOK_COUNT === 0) {
    return null;
  }

  const wave = styleFor(g.state, level);

  // Câu hướng dẫn chỉ hiện khi CHƯA hỏi gì. Hỏi rồi mà vẫn để nó nằm giữa màn là
  // chắn mất chính câu trả lời vừa nhận.
  const chuaHoi = !g.messages.some((m) => m.from === 'user');

  // §9 — dòng tin TỐI GIẢN. Kho giữ nhiều hơn (để Agent sửa được câu cuối), nhưng
  // trên màn chỉ vẽ vài câu gần nhất: vẽ hết thì khu giữa cao dần lên và đẩy cụm
  // nút xuống, rồi hai thứ đè nhau.

  // ── Nhãn trạng thái: CHỈ còn hai ca ─────────────────────────────────────
  //
  // `processing` đã BỎ nhãn chữ. Lúc đang nghĩ, ba dải sóng cuộn lại thành ba
  // vòng tròn xoay — mỗi vòng một bán kính, một tốc độ, một chiều. Hình đang
  // quay nói ra trạng thái mà không bắt ai phải đọc, và với người ít tiếp xúc máy
  // móc thì đó là đường rẻ hơn hẳn.
  //
  // Hai ca kia GIỮ nhãn, và giữ có lý do:
  //   · `listening` — mic đang mở. Một cái mic đang ghi mà không nói ra bằng CHỮ
  //     là thứ không được phép: dáng sóng thì đẹp, nhưng nó không nói rõ "máy
  //     đang nghe bác".
  //   · `executing` — trợ lý đang thao tác THẬT trong app. Người dùng phải biết
  //     màn hình sắp đổi dưới tay mình.
  const nhan =
    g.state === 'listening' ? t('Em đang nghe…')
      : g.state === 'executing' ? t('Em đang mở…')
        : null;

  return (
    <Animated.View
      ref={rootRef}
      pointerEvents="auto"
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}
      onLayout={doBand}
    >
      {/* §3 — LỚP KÍNH TỐI. Không đen 100%: màn bên dưới vẫn nhìn thấy. */}
      <View style={[StyleSheet.absoluteFill, styles.glass]} pointerEvents="none" />

      {/* §5–§7 — Canvas: sóng viền bốn cạnh + dải uốn hai cạnh dọc. */}
      <EdgeWave style={wave} color={NEON} ribbonColor={MINT} band={band} />

      {/* §21 — lớp hấp thụ chạm. Nuốt cú chạm không rơi vào nút của lớp, và KHÔNG
          làm gì cả. Đóng là việc của nút X. */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
      />

      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          {/* ── NÚT MENU (góc trên TRÁI) ───────────────────────────────────
              Mở danh sách các cuộc trò chuyện. Đặt ở trái, đối diện nút đóng:
              một bên là "xem lại", một bên là "xong rồi" — hai việc trái ngược
              thì không nên nằm cạnh nhau, vì ngón tay trượt một li là bấm nhầm
              cái kia, và cái kia làm mất màn hình đang đọc. */}
          <TouchableOpacity
            onPress={() => {
              // Bàn phím phải TẮT trước: panel trượt ra chiếm gần hết bề ngang,
              // và một bàn phím còn đứng đó che mất nửa dưới của chính danh sách
              // vừa mở.
              Keyboard.dismiss();
              setMenu(true);
            }}
            style={styles.topBtn}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel={t('Danh sách cuộc trò chuyện')}
          >
            <Icon name="menu" size={21} color={MINT} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={closeAssistant}
            style={styles.topBtn}
            hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
            accessibilityRole="button"
            accessibilityLabel={t('Đóng trợ lý')}
          >
            <Icon name="close" size={20} color={MINT} />
          </TouchableOpacity>
        </View>

        {/* ── §20: biểu tượng + dòng tin, ở KHU VỰC TRUNG TÂM ─────────────── */}
        <View style={styles.center} pointerEvents="box-none">
          {/* §11 — SỰ HIỆN DIỆN của Trợ lý.
              Trước đây là một vòng tròn có quầng sáng. Chủ sở hữu bác: nó xấu.
              Và nó xấu có lý do đo được — một cái vòng CHỈ nở ra co vào được, nên
              nó nói "có thứ gì đó đang sống" mà không nói "đang NÓI". Sóng thì nói
              được: mắt người đọc hình dạng sóng thành tiếng nói từ trước khi có
              máy tính, và spec §8 xây cả một mục quanh đúng chuyện đó.
              Khối này CHỈ giữ chỗ — ba dải sóng do Canvas vẽ vào đúng ô này. */}
          <View
            ref={bandRef}
            style={styles.waveBand}
            onLayout={doBand}
            pointerEvents="none"
          />


          {!!nhan && <Text style={styles.stateLabel}>{nhan}</Text>}

          {/* §9/§10 — DÒNG TIN, CUỘN ĐƯỢC.
              Trước đây đây là một `View` cứng vẽ đúng ba câu gần nhất, câu càng cũ
              càng mờ — hợp với ý "một dòng chảy, không phải một kho lưu". Nhưng
              khi trợ lý trả lời được thật thì người dùng CẦN đọc lại câu trước:
              một câu hướng dẫn hai bước mà trôi mất bước một thì bước hai vô nghĩa.

              Và phép làm mờ theo tuổi phải BỎ cùng lúc: cuộn lên gặp chữ mờ tịt
              là một hộp tin có chữ mà không đọc được. Nó chỉ đúng khi mọi câu đều
              đang nằm trên màn. */}
          <ScrollView
            ref={streamRef}
            style={styles.stream}
            contentContainerStyle={styles.streamBody}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={xuongCuoi}
          >
            {g.messages.map((m) => (
              <View key={m.id} style={m.from === 'agent' ? styles.rowAgent : styles.rowUser}>
                <View
                  style={[styles.bubble, m.from === 'agent' ? styles.bubbleAgent : styles.bubbleUser]}
                >
                  <RichText
                    style={m.from === 'agent' ? styles.textAgent : styles.textUser}
                    boldStyle={styles.textBold}
                  >
                    {m.text}
                  </RichText>
                </View>

                {/* ── Hai nút nhỏ dưới mỗi bong bóng ───────────────────────
                    MỜ và KHÔNG VIỀN: chúng là việc phụ. Một cái viền quanh mỗi
                    nút, nhân với mấy chục bong bóng, biến dòng tin thành một
                    bảng điều khiển — mà đây là chỗ để ĐỌC.

                    `hitSlop` rộng gấp mấy lần cái hình: nút vẽ nhỏ cho đỡ chiếm
                    chỗ, nhưng vùng bấm phải vừa ngón tay người quen cầm cuốc. */}
                <View style={m.from === 'agent' ? styles.actAgent : styles.actUser}>
                  <TouchableOpacity
                    onPress={() => chepCau(m.text)}
                    style={styles.actBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel={t('Chép câu này')}
                  >
                    <Icon name="content-copy" size={14} color={ACT} />
                  </TouchableOpacity>

                  {/* CHẠY LẠI chỉ có ở bong bóng NGƯỜI DÙNG.
                      Chạy lại một câu của Trợ lý là vô nghĩa — nó là câu TRẢ LỜI,
                      không phải một lời yêu cầu. Cho nút đó xuất hiện ở đấy là mời
                      người ta bấm một thứ không làm gì. */}
                  {m.from === 'user' && (
                    <TouchableOpacity
                      onPress={() => ask(m.text)}
                      style={styles.actBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel={t('Hỏi lại câu này')}
                    >
                      <Icon name="rotate-right" size={15} color={ACT} />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            ))}
          </ScrollView>

          {/* ── MÀN CHÀO ─────────────────────────────────────────────────────
              Tên trợ lý, vai trò, rồi một câu chào trong đúng bong bóng mà mọi
              câu sau của trợ lý sẽ dùng.

              Câu chào KHÔNG đi qua `pushMessage`, cố ý. Nó không phải một lượt
              nói: cho nó vào kho thì nó được ghi xuống máy, và mỗi lần mở lớp
              rồi đổi ý sẽ để lại một "cuộc" chỉ có mỗi lời chào — panel danh
              sách đầy những dòng như thế thì nó không còn là danh sách nữa.

              Và KHÔNG có hàng nút gợi ý: đây là một super app: mấy chục tính
              năng, bốn cái nút chọn sẵn vừa không đại diện cho cái gì, vừa khiến
              người dùng tưởng trợ lý CHỈ làm được bốn việc đó. */}
          {chuaHoi && !confirm && (
            // `pointerEvents="none"`: khối này phủ lên hộp tin, nên để nó ăn cú
            // chạm là khoá luôn thao tác cuộn ở ngay dưới nó.
            <View style={styles.intro} pointerEvents="none">
              <Text style={styles.brand}>{GENIE_NAME}</Text>
              <Text style={styles.brandSub}>{t(GENIE_TAGLINE)}</Text>
              <View style={[styles.bubble, styles.bubbleAgent, styles.introBubble]}>
                <Text style={styles.textAgent}>{cauChao()}</Text>
              </View>
            </View>
          )}

          {/* ── G5 — CỬA GẬT ────────────────────────────────────────────────
              Hai nút, không nút nào được bấm sẵn, và không có hết-giờ. Chữ hiện
              ra là chữ MÁY CHỦ dựng từ tên thật (tên vườn, tên cây) — lớp phủ
              không viết lại một chữ nào, vì viết lại là mở đường cho hai bên
              hiểu khác nhau về cùng một lời ghi. */}
          {confirm && (
            <View style={styles.confirmBox}>
              <RichText style={styles.confirmText} boldStyle={styles.textBold}>
                {confirm.text}
              </RichText>
              <View style={styles.confirmRow}>
                {/* "Thôi" đứng TRƯỚC, và nó không phải nút nổi bật. Ở một cửa
                    ghi thì đường an toàn phải là đường dễ đi nhất. */}
                <TouchableOpacity
                  onPress={() => traLoiGat(false)}
                  style={[styles.confirmBtn, styles.confirmNo]}
                  accessibilityRole="button"
                  accessibilityLabel={t('Không ghi')}
                >
                  <Text style={styles.confirmNoText}>{t('Thôi ạ')}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => traLoiGat(true)}
                  style={[styles.confirmBtn, styles.confirmYes]}
                  accessibilityRole="button"
                  accessibilityLabel={t('Đồng ý ghi')}
                >
                  <Text style={styles.confirmYesText}>{t('Đúng rồi, ghi đi')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* ── §12–§14: cụm điều khiển dưới cùng ────────────────────────────── */}
        <View style={[styles.bottom, { paddingBottom: insets.bottom + 22 }]}>
          {/* §14 — ô nhập KHÔNG hiện mặc định. Chỉ khi người dùng chọn bàn phím. */}
          {g.typing && (
            <View style={styles.inputRow}>
              <TextInput
                style={styles.input}
                value={draft}
                onChangeText={setDraft}
                placeholder={t('Bác nói em nghe…')}
                placeholderTextColor="rgba(207,247,228,0.45)"
                onSubmitEditing={() => ask(draft)}
                returnKeyType="send"
                autoFocus
              />
            </View>
          )}

          <View style={styles.controls}>
            {/* ── NÚT TRÁI — đổi vai theo chế độ ────────────────────────
                đang NÓI  → hiện bàn phím: "muốn gõ thì bấm đây"
                đang GÕ   → hiện mic:      "muốn nói thì bấm đây"

                Mỗi nút luôn chỉ tới CHỖ MÌNH CHƯA Ở. Nút mang hình của chế độ
                hiện tại là một nút không nói được nó làm gì — người dùng phải
                thử mới biết, và với người ít tiếp xúc máy móc thì "thử" là thứ
                họ tránh. */}
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={() => {
                // Rời chế độ gõ thì TẮT bàn phím theo. Để nó đứng lại che nửa
                // màn trong khi ô nhập đã biến mất là một màn hình không ai hiểu.
                if (g.typing) Keyboard.dismiss();
                setTypingMode(!g.typing);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={g.typing ? t('Nói với trợ lý') : t('Gõ chữ')}
            >
              <Icon name={g.typing ? 'microphone' : 'keyboard-outline'} size={21} color={MINT} />
            </TouchableOpacity>

            {/* §12/§13 — nút Mic: tròn, kính tối, vòng neon xanh, quầng sáng ngoài.
                Quầng dựng bằng ba vòng đồng tâm, CỘNG `shadow` màu sáng:
                `shadowColor` chỉ đổ bóng CÓ MÀU trên iOS, còn Android `elevation`
                cho ra bóng xám — hai nền hai kiểu, và bên Android mất hẳn quầng.
                Ba vòng View chạy giống nhau ở cả hai nền. */}
            <View style={styles.micWrap}>
              <View
                pointerEvents="none"
                style={[styles.micHalo, styles.micHalo3, { opacity: 0.08 + 0.22 * level }]}
              />
              <View
                pointerEvents="none"
                style={[styles.micHalo, styles.micHalo2, { opacity: 0.2 + 0.35 * level }]}
              />
              <View
                pointerEvents="none"
                style={[styles.micHalo, styles.micHalo1, { opacity: 0.5 + 0.5 * level }]}
              />
              {/* ── NÚT GIỮA — mic, hoặc GỬI khi đang gõ ─────────────────
                  Đang gõ thì việc duy nhất người dùng muốn làm với nút to nhất
                  màn hình là GỬI. Để nó vẫn là mic thì nút chính trở thành nút
                  ít dùng nhất, và nút thật sự cần lại là một biểu tượng nhỏ nép
                  trong ô nhập.

                  Chưa gõ chữ nào thì nút MỜ ĐI và không bấm được — bấm gửi một ô
                  trống là một cú bấm không có việc gì xảy ra, và người dùng đọc
                  nó thành "nút hỏng". */}
              <TouchableOpacity
                style={[styles.micBtn, g.typing && !draft.trim() && styles.micBtnLo]}
                onPress={g.typing ? () => ask(draft) : bamMic}
                disabled={g.typing && !draft.trim()}
                accessibilityLabel={
                  g.typing ? t('Gửi') : nghe ? t('Dừng nghe') : t('Nói với trợ lý')
                }
              >
                <Icon
                  name={g.typing ? 'send' : nghe ? 'stop' : 'microphone'}
                  size={g.typing ? 26 : 30}
                  color={MINT}
                />
              </TouchableOpacity>
            </View>

            {/* §G6 — Máy ảnh. Đối xứng với bàn phím ở phía kia nút mic. */}
            <TouchableOpacity
              style={styles.smallBtn}
              onPress={bamAnh}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityLabel={t('Gửi ảnh')}
            >
              <Icon name="camera-outline" size={21} color={MINT} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* Panel dựng CUỐI CÂY, nên nó nằm trên cả cụm nút lẫn ba dải sóng. Dựng
          sớm hơn thì nút Mic — cái hình to nhất màn — thò lên trên một panel có
          nền đặc, và đó là thứ đọc ra thành lỗi vẽ. */}
      {menu && <GenieSectionsPanel onClose={() => setMenu(false)} />}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { zIndex: 900, elevation: 900 },
  glass: { backgroundColor: GLASS },
  fill: { flex: 1 },

  // Hai đầu: menu bên trái, đóng bên phải. Trước đây hàng này chỉ có nút đóng
  // nên nó dồn hết sang phải.
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  topBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHIP_CTRL,
    borderWidth: 1,
    borderColor: 'rgba(91,233,166,0.22)',
  },

  // `overflow:'hidden'` là chốt chặn cuối: khu giữa co lại khi bàn phím bung, và
  // một dòng tin dài KHÔNG được tràn xuống đè lên cụm nút.
  center: {
    flex: 1,
    alignItems: 'center',
    // Dồn xuống ĐÁY, không canh giữa: hộp tin giờ cao gần hết khu này, và câu mới
    // nhất phải nằm sát cụm nút — đó là chỗ mắt đang ở khi vừa bấm gửi.
    justifyContent: 'flex-end',
    paddingHorizontal: 22,
    gap: 14,
    overflow: 'hidden',
  },
  // Ô giữ chỗ cho cụm sóng. Trải hết bề ngang MÀN, không theo `paddingHorizontal`
  // của khung giữa: ba dải sóng phải chạy từ mép này sang mép kia rồi tắt dần ở
  // hai đầu — bó chúng vào lề thì chỗ tắt rơi vào giữa màn và trông như bị cắt.
  // Ô ĐO cho ba dải sóng — `position:'absolute'` nên nó KHÔNG chiếm chỗ bố cục.
  //
  // Trước đây nó là một khối cao 132 nằm trong dòng, và nó đẩy hộp tin xuống đúng
  // ngần ấy. Chủ sở hữu chốt: cho sóng ĐÈ LÊN tin nhắn cũng được — nên ô này ra
  // khỏi dòng, và hộp tin lấy lại toàn bộ khu giữa.
  //
  // Sóng vẽ ở lớp DƯỚI chữ (Canvas dựng trước trong cây), nên chữ vẫn đọc được;
  // sóng thành cái nền đang thở sau lời nói, đúng vai nó phải đóng.
  waveBand: {
    position: 'absolute',
    left: -22,
    right: -22,
    top: 0,
    height: 132,
  },
  stateLabel: { color: MINT, opacity: 0.7, fontSize: 13, letterSpacing: 0.4 },

  // `flexShrink: 1` để dòng tin NHƯỜNG chỗ khi bàn phím bung lên, thay vì đẩy
  // cụm nút xuống dưới mép màn. `maxHeight` chặn nó ăn hết khu vực trung tâm —
  // ba dải sóng phải còn chỗ, chúng là thứ nói trạng thái.
  stream: { width: '100%', flexShrink: 1, maxHeight: '88%' },
  // Tin xếp từ DƯỚI lên: câu mới nhất luôn sát đáy, đúng như mọi hộp tin khác.
  streamBody: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    gap: 8,
    // Chừa một khoảng TRÊN: câu đầu tiên không nên nằm ngay dưới ba dải sóng, và
    // khoảng trống đó cũng là chỗ mắt nghỉ giữa hình và chữ.
    paddingTop: 96,
    paddingBottom: 4,
  },
  // §10 — bóng thoại kính nổi: bo góc lớn, viền rất mờ, quầng nhẹ.
  // Hàng chứa bong bóng + cụm nút, canh theo phía người nói.
  rowAgent: { width: '100%', alignItems: 'flex-start' },
  rowUser: { width: '100%', alignItems: 'flex-end' },

  // Cụm nút: MỜ, KHÔNG VIỀN, nép sát bong bóng.
  actAgent: { flexDirection: 'row', gap: 14, paddingLeft: 6, paddingTop: 5 },
  actUser: { flexDirection: 'row', gap: 14, paddingRight: 6, paddingTop: 5 },
  actBtn: { paddingVertical: 2, paddingHorizontal: 2 },

  bubble: {
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    maxWidth: '92%',
  },
  // ── Góc VUÔNG ở phía người nói ───────────────────────────────────────────
  // Bong bóng của trợ lý vuông góc TRÊN-TRÁI, của người dùng vuông góc TRÊN-PHẢI.
  // Ba góc bo tròn và một góc vuông là cái đuôi chỉ về phía người nói: ai nói câu
  // nào đọc ra được từ HÌNH DẠNG, không phải từ việc so lề trái với lề phải —
  // thứ chỉ phân biệt được khi hai câu liền nhau cùng nằm trên màn.
  bubbleAgent: {
    backgroundColor: CHIP_AGENT,
    borderColor: 'rgba(91,233,166,0.18)',
    alignSelf: 'flex-start',
    borderTopLeftRadius: 0,
  },
  // §10 — câu của người dùng NHỎ HƠN câu của trợ lý.
  bubbleUser: {
    backgroundColor: CHIP_USER,
    borderColor: 'rgba(255,255,255,0.10)',
    alignSelf: 'flex-end',
    maxWidth: '78%',
    paddingVertical: 9,
    borderTopRightRadius: 0,
  },
  textAgent: { color: COLORS.white, fontSize: 16, lineHeight: 23 },
  textUser: { color: MINT, fontSize: 14, lineHeight: 20 },
  // Tên nút: đậm + màu ánh sáng, để mắt tìm ra nó trên màn hình thật nhanh hơn.
  textBold: { fontWeight: '800', color: NEON },

  // ── Màn chào ─────────────────────────────────────────────────────────────
  //
  // GIỮA MÀN, cả hai chiều. Dựng RA KHỎI DÒNG (`absoluteFill`) chứ không nằm
  // trong cột: cột giữa dồn mọi thứ xuống đáy (`justifyContent: 'flex-end'`) để
  // câu mới nhất luôn sát cụm nút, nên một khối nằm trong dòng thì không tài nào
  // căn giữa theo chiều dọc được mà không phá đúng cái nết ấy.
  //
  // Và vì nó ra khỏi dòng nên nó KHÔNG đẩy hộp tin đi đâu cả — lúc màn chào tắt
  // đi (người dùng hỏi câu đầu tiên) bố cục không nhảy một nhịp nào.
  intro: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  brand: {
    color: MINT,
    fontSize: 38,
    fontWeight: '800',
    // Giãn chữ cho cái tên đứng ra khỏi mọi chữ khác trên lớp phủ — đây là thứ
    // duy nhất ở đây KHÔNG phải câu nói, nên nó phải đọc ra là một cái TÊN.
    letterSpacing: 7,
    // React Native cộng khoảng giãn vào SAU cả ký tự cuối, nên chữ căn giữa bị
    // lệch sang trái đúng một nhịp giãn. Đẩy lại bằng chừng ấy.
    marginLeft: 7,
  },
  brandSub: {
    color: MINT,
    opacity: 0.62,
    fontSize: 13,
    letterSpacing: 1.6,
    marginTop: -2,
  },
  // Lời chào nép về TRÁI như mọi câu sau của trợ lý. Căn giữa nó thì nó đọc ra
  // thành khẩu hiệu của app, không phải lời của người đang nói chuyện với mình.
  // Nhích sang phải một chút, không sát lề như mấy câu sau: ở màn chào nó đứng
  // dưới một khối chữ căn giữa, nên dán nó vào đúng mép trái làm cả cụm trông
  // như bị lệch. Vào cuộc rồi thì các câu mới về đúng lề của dòng tin.
  introBubble: { alignSelf: 'flex-start', marginTop: 8, marginLeft: 14 },

  // ── G5 — cửa gật ─────────────────────────────────────────────────────────
  // Nền ĐẶC hơn hộp tin thường và có viền sáng: đây là chỗ duy nhất trên lớp phủ
  // mà một cú chạm ghi thật vào sổ của người dùng, nên nó phải trông khác.
  confirmBox: {
    marginTop: 14,
    backgroundColor: 'rgba(4, 26, 20, 0.92)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(91,233,166,0.34)',
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 14,
  },
  confirmText: { color: COLORS.white, fontSize: 16, lineHeight: 24 },
  confirmRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    // Ngón tay của người quen cầm cuốc. 48 là sàn khuyến nghị; ở đây không hạ.
    minHeight: 48,
  },
  confirmNo: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(207,247,228,0.30)',
  },
  confirmNoText: { color: MINT, fontSize: 15, fontWeight: '600' },
  confirmYes: { backgroundColor: NEON },
  confirmYesText: { color: '#04231A', fontSize: 15, fontWeight: '800' },

  bottom: { paddingHorizontal: 22, gap: 10 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CHIP_AGENT,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(91,233,166,0.18)',
    paddingLeft: 18,
    paddingRight: 6,
    paddingVertical: 4,
  },
  input: { flex: 1, color: COLORS.white, fontSize: 16, paddingVertical: 10 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  smallBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CHIP_CTRL,
    borderWidth: 1,
    borderColor: 'rgba(91,233,166,0.20)',
  },

  // Ô của nút Mic phải rộng bằng QUẦNG SÁNG ngoài cùng, không bằng cái nút.
  //
  // Quầng là ba vòng `position:'absolute'`, nên bố cục KHÔNG tính chúng vào kích
  // thước. Để ô bằng cái nút (78) thì quầng 136 tràn ra ngoài và đè lên bóng thoại
  // ngay phía trên — đúng lỗi đã thấy trên máy. Hình vẽ ra tới đâu thì ô phải rộng
  // tới đó, kể cả phần "chỉ là ánh sáng".
  // Nút giữa lúc chưa gõ gì: mờ và không bấm được.
  micBtnLo: { opacity: 0.45 },

  micWrap: { width: 140, height: 140, alignItems: 'center', justifyContent: 'center' },
  micHalo: { position: 'absolute', borderRadius: 999, borderColor: NEON },
  micHalo1: { width: 92, height: 92, borderWidth: 3 },
  micHalo2: { width: 112, height: 112, borderWidth: 7 },
  micHalo3: { width: 136, height: 136, borderWidth: 12 },
  micBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    alignItems: 'center',
    justifyContent: 'center',
    // §12 — kính tối ở giữa, vòng neon xanh quanh.
    backgroundColor: 'rgba(3, 22, 15, 0.72)',
    borderWidth: 2,
    borderColor: NEON,
    // §12 — quầng sáng ngoài. Bóng KHÔNG lệch (offset 0) và mang màu sáng, nên nó
    // toả đều thành ánh sáng chứ không rơi xuống như bóng đổ của một vật thể.
    shadowColor: NEON,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
  },
});

export default GenieLayer;
