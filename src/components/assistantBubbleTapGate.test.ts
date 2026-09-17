// components/assistantBubbleTapGate.test.ts
//
// CỔNG canh bong bóng + Lớp Trợ lý.
//
// Hai nhóm:
//   1. các lỗi đã làm bong bóng KHÔNG MỞ ĐƯỢC — chúng hỏng CÂM, bong bóng vẫn vẽ
//      ra, không lỗi nào nổ ra, người dùng chỉ thấy "bấm mãi không lên";
//   2. các điều khoản của `docs/AI_ASSISTANT_UI-UX.md` mà chỉ nhìn mã mới canh
//      được (bố cục, thứ tự lớp, cái gì hiện mặc định).
//
// Bài kiểm soi MÃ NGUỒN chứ không dựng component. Lý do thực dụng: dựng
// `AssistantBubble`/`GenieLayer` là kéo theo `react-native-vector-icons`, Lottie,
// Redux store và cả cây theme — bài kiểm sẽ chết ở một `import` cách đó bốn tầng,
// và "không chạy được" thì trong thực tế nghĩa là không có bài kiểm nào. Đây đúng
// lối `navigation/moduleIds.ts` đã phải tách tệp vì cùng lý do.

import fs from 'fs';
import path from 'path';

/**
 * Đọc tệp và CHUẨN HOÁ xuống dòng về `\n`.
 *
 * Kho này dùng CRLF. Mọi mẫu tìm có `\n` trong đó sẽ trượt trên máy Windows mà
 * khớp trên CI Linux — hoặc ngược lại. Một bài kiểm chỉ đỏ trên một loại máy là
 * một bài kiểm sẽ bị ai đó nới ra cho khỏi phiền, và lúc đó nó không còn canh gì.
 */
const raw = (f: string) =>
  fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
/** Bỏ chú thích trước khi soi — chú thích ở các tệp kia có nhắc chính các mẫu này. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const BUBBLE = code(raw('AssistantBubble.tsx'));
const LAYER = code(raw('genie/GenieLayer.tsx'));
const PANEL = code(raw('genie/GenieSectionsPanel.tsx'));

describe('bong bóng — cổng chống "bấm không mở"', () => {
  it('PanResponder KHÔNG được giành responder ngay lúc đặt ngón tay', () => {
    // `onStartShouldSetPanResponder: () => true` làm View cha giành quyền xử lý
    // chạm trước khi có di chuyển nào. Chỉ một view được làm responder, nên
    // `TouchableOpacity` con không bao giờ nhận cú chạm và `onPress` không chạy.
    expect(BUBBLE).toMatch(/onStartShouldSetPanResponder:\s*\(\)\s*=>\s*false/);
    expect(BUBBLE).not.toMatch(/onStartShouldSetPanResponder:\s*\(\)\s*=>\s*true/);
    expect(BUBBLE).not.toMatch(/onStartShouldSetPanResponderCapture:\s*\(\)\s*=>\s*true/);
  });

  it('vẫn phân biệt được KÉO với BẤM bằng ngưỡng di chuyển', () => {
    // Bỏ `onStart…` mà không có `onMove…` thì bong bóng hết kéo được — sửa một
    // lỗi bằng cách tạo một lỗi khác.
    expect(BUBBLE).toMatch(/onMoveShouldSetPanResponder/);
  });

  it('bong bóng KHÔNG bị ẩn chỉ vì thiếu endpoint hỏi-đáp', () => {
    // Đường tắt Genie chạy hoàn toàn trên máy, không cần `ALADIN_CHAT_URL`. Gác
    // chỉ bằng `chatEnabled()` là ẩn mất một tính năng đang chạy được.
    const m = BUBBLE.match(/const\s+visible\s*=\s*([^;]+);/);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/GENIE_PLAYBOOK_COUNT/);
    expect(m![1]).toMatch(/isLoggedIn/);
  });

  it('CHẠM bong bóng mở LỚP TRỢ LÝ — đó là mặc định', () => {
    expect(BUBBLE).toMatch(/onPress=\{handleTap\}/);
    const tap = BUBBLE.match(/const handleTap = \(\) => \{[\s\S]*?\n  \};/);
    expect(tap).not.toBeNull();
    expect(tap![0]).toMatch(/openGenieLayer\(\)/);
  });

  it('GIỮ bong bóng cũng mở lớp, kèm ý định nói', () => {
    const lp = BUBBLE.match(/const handleLongPress = \(\) => \{[\s\S]*?\n  \};/);
    expect(lp).not.toBeNull();
    expect(lp![0]).toMatch(/openGenieLayer\(\{ voice: true \}\)/);
  });

  it('MỘT bề mặt trợ lý, không phải hai — panel chat cũ đã gỡ hẳn', () => {
    // Để lại panel không lối vào là để lại đúng thứ `navigation/actionRegistry.ts`
    // đã phải dán cảnh báo lên đầu tệp: mã trông như đang sống mà ngoài đồng
    // không nút nào mở được, và đã có hai lượt rà kết luận nhầm vì nó.
    expect(BUBBLE).not.toMatch(/<Modal/);
    expect(BUBBLE).not.toMatch(/streamChat\(/);
    // Thanh hỏi ở trang Tổng quan cũng phải trỏ sang lớp, không mở panel riêng.
    expect(BUBBLE).toMatch(/ASSISTANT_OPEN_EVENT[\s\S]{0,260}openGenieLayer\(/);
  });

  it('bong bóng ẨN khi LỚP đang mở — hai thứ không cùng nói một việc', () => {
    // Bong bóng là CỬA VÀO lớp. Lớp mở rồi mà cửa vào vẫn nổi lên thì bấm vào nó
    // không có gì xảy ra, và nó còn che mất một góc chính cái lớp nó vừa mở.
    const m = BUBBLE.match(/const\s+visible\s*=\s*([^;]+);/);
    expect(m![1]).toMatch(/!layerOpen/);
    expect(BUBBLE).toMatch(/useGenie\(\)\.open/);
  });

  it('trợ lý ẨN ở màn cửa-vào VÀ ở màn nó không được phép mở', () => {
    // Gác chỉ bằng `isPublicRoute` là để lọt `Activation` và mấy màn danh tính
    // khác: chúng KHÔNG công khai (phải có phiên mới tới) nhưng cũng không phải
    // chỗ cho một bong bóng nổi lên che chữ. Quy tắc gọn: trợ lý không xuất hiện
    // ở màn mà chính nó không được phép mở.
    for (const src of [BUBBLE, LAYER]) {
      expect(src).toMatch(/isPublicRoute\(route\)/);
      expect(src).toMatch(/!genieMayOpen\(route\)/);
      // Chưa biết route (chưa điều hướng lần nào) ⇒ ẨN. Mặc định an toàn.
      expect(src).toMatch(/route == null \|\|/);
    }
  });
});

describe('Lớp Trợ lý — theo docs/AI_ASSISTANT_UI-UX.md', () => {
  it('§3 — có LỚP KÍNH TỐI, và KHÔNG đen 100%', () => {
    // Spec §3: `rgba(0,10,8, 0.55~0.70)`. Bản trước cố ý để trong suốt hoàn toàn
    // và nó sai với §3/§17 — sự chú ý phải chuyển hẳn sang Trợ lý.
    //
    // Chủ sở hữu chốt 15/09 tối hơn nữa (0.78), tức VƯỢT khoảng của spec. Bài này
    // canh khoảng RỘNG hơn spec, cố ý: cái nó giữ không phải con số mà là hai đầu
    // mút — đủ tối để màn cũ lùi hẳn ra sau, và chưa đục tới mức lớp phủ thành
    // một trang riêng (lúc ấy §16 "tự tắt sau khi mở màn" mất chỗ dựa).
    const m = LAYER.match(/const GLASS = 'rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)'/);
    expect(m).not.toBeNull();
    const alpha = Number(m![4]);
    expect(alpha).toBeGreaterThanOrEqual(0.5);
    expect(alpha).toBeLessThan(0.8);
    expect(LAYER).toMatch(/backgroundColor: GLASS/);
  });

  it('§5/§7 — hiệu ứng viền do CANVAS vẽ, không phải một đống View', () => {
    expect(LAYER).toMatch(/<EdgeWave/);
    // Lớp không được tự dựng gradient viền bằng SVG — Canvas là thành phần chính
    // của visual effect (§21).
    expect(LAYER).not.toMatch(/LinearGradient/);
  });

  it('§8 — biên độ âm thanh đi qua bộ làm mượt trước khi tới chỗ vẽ', () => {
    // "Không được giật theo từng frame audio."
    expect(LAYER).toMatch(/new Envelope\(\)/);
    expect(LAYER).toMatch(/env\.push\(/);
    expect(LAYER).toMatch(/requestAnimationFrame/);
  });

  it('§9/§10 — dòng tin CUỘN ĐƯỢC (chủ sở hữu đảo quyết định của spec)', () => {
    // ⚠ Spec viết: "Không tạo full-screen chat / danh sách message dài", và bài
    // kiểm này từng CẤM `<ScrollView>` cùng bắt câu cũ mờ dần.
    //
    // Chủ sở hữu chốt lại 15/09: hộp tin phải cuộn được. Và lý do đứng vững —
    // lúc spec viết thì trợ lý chưa có mô hình, mỗi câu là một dòng ngắn từ bảng
    // tra. Giờ nó trả lời được thật, và một câu hướng dẫn hai bước mà trôi mất
    // bước một thì bước hai vô nghĩa.
    //
    // Phép làm mờ theo tuổi bỏ CÙNG LÚC, không phải tiện tay: cuộn lên gặp chữ
    // mờ tịt là một hộp tin có chữ mà không đọc được. Nó chỉ đúng khi mọi câu
    // đều đang nằm trên màn.
    expect(LAYER).toMatch(/<ScrollView/);
    expect(LAYER).not.toMatch(/opacity: mo/);
    // Vẫn KHÔNG phải một màn chat đầy đủ: không thanh tiêu đề, không danh sách
    // phiên, không ô nhập cố định.
    expect(LAYER).toMatch(/showsVerticalScrollIndicator=\{false\}/);
  });

  it('§10 — câu của người dùng NHỎ HƠN câu của trợ lý', () => {
    const agent = LAYER.match(/bubbleAgent:\s*\{[^}]*\}/)![0];
    const user = LAYER.match(/bubbleUser:\s*\{[^}]*\}/)![0];
    expect(user).toMatch(/maxWidth/);
    expect(agent).toMatch(/alignSelf: 'flex-start'/);
    expect(user).toMatch(/alignSelf: 'flex-end'/);
  });

  it('góc VUÔNG quay về phía người nói — đuôi của bong bóng', () => {
    // Ba góc bo và một góc vuông nói ai là người nói bằng HÌNH DẠNG. So lề trái
    // với lề phải chỉ phân biệt được khi hai câu liền nhau cùng nằm trên màn —
    // một câu đứng một mình thì không có gì để so.
    const agent = LAYER.match(/bubbleAgent:\s*\{[^}]*\}/)![0];
    const user = LAYER.match(/bubbleUser:\s*\{[^}]*\}/)![0];
    expect(agent).toMatch(/borderTopLeftRadius: 0/);
    expect(user).toMatch(/borderTopRightRadius: 0/);
    // Và chỉ MỘT góc mỗi bên — vuông cả hai thì hết là bong bóng.
    expect(agent).not.toMatch(/borderTopRightRadius: 0/);
    expect(user).not.toMatch(/borderTopLeftRadius: 0/);
  });

  it('§11 — sự hiện diện của Trợ lý là CỤM SÓNG, không phải vòng tròn', () => {
    // Đổi hình dạng, không bỏ vai trò: vòng tròn chỉ nở ra co vào được nên nó nói
    // "có thứ gì đó đang sống" mà không nói "đang NÓI".
    expect(LAYER).toMatch(/waveBand/);
    expect(LAYER).toMatch(/band=\{band\}/);
    expect(LAYER).not.toMatch(/AgentAvatar/);
  });

  it('chỗ đặt cụm sóng ĐO TỪ BỐ CỤC, không gõ cứng trong shader', () => {
    // Khu giữa co lại khi bàn phím bung; một toạ độ gõ cứng sẽ để cụm sóng nằm
    // lệch đúng lúc người dùng đang gõ.
    expect(LAYER).toMatch(/measureInWindow/);
    // Và phải TRỪ gốc của chính lớp phủ — trên Android toạ độ cửa sổ gồm cả thanh
    // trạng thái. Đây đúng phép đo `CoachMarkOverlay` đã phải làm.
    expect(LAYER).toMatch(/by - ry/);
  });

  it('ô của nút Mic rộng bằng QUẦNG SÁNG, không bằng cái nút', () => {
    // Quầng là ba vòng `position:'absolute'` nên bố cục không tính chúng vào kích
    // thước. Ô bằng cái nút thì quầng tràn ra và ĐÈ LÊN bóng thoại phía trên —
    // lỗi đã thấy trên máy.
    const wrap = Number(LAYER.match(/micWrap:\s*\{\s*width:\s*(\d+)/)![1]);
    const halo = Number(LAYER.match(/micHalo3:\s*\{\s*width:\s*(\d+)/)![1]);
    expect(wrap).toBeGreaterThanOrEqual(halo);
  });

  it('dòng tin KHÔNG tràn xuống đè cụm nút', () => {
    // Đây là thứ bài kiểm cũ THẬT SỰ bảo vệ, và nó vẫn còn giá trị sau khi dòng
    // tin cuộn được. Chỉ cách ép là khác: trước dùng trần SỐ CÂU
    // (`VISIBLE_MESSAGES`), giờ dùng trần CHIỀU CAO — vì số câu không còn chặn
    // được gì khi mỗi câu dài ngắn khác nhau.
    const stream = LAYER.match(/\bstream: \{[^}]*\}/)![0];
    expect(stream).toMatch(/maxHeight/);
    expect(stream).toMatch(/flexShrink: 1/);
    // Và cụm nút phải nằm NGOÀI vùng cuộn.
    expect(LAYER).toMatch(/<\/ScrollView>[\s\S]*styles\.controls/);
  });

  it('§12 — nút Mic tròn, kính tối, vòng neon, QUẦNG SÁNG ngoài', () => {
    const mic = LAYER.match(/micBtn:\s*\{[\s\S]*?\n  \},/)![0];
    expect(mic).toMatch(/borderRadius: 39/);
    expect(mic).toMatch(/borderColor: NEON/);
    // Bóng KHÔNG lệch và mang màu sáng ⇒ toả đều thành ánh sáng, không rơi xuống
    // như bóng đổ của một vật thể.
    expect(mic).toMatch(/shadowColor: NEON/);
    expect(mic).toMatch(/shadowOffset: \{ width: 0, height: 0 \}/);
    expect(LAYER).toMatch(/micHalo/);
  });

  it('§13 — quầng quanh Mic phản ứng theo biên độ', () => {
    expect(LAYER).toMatch(/opacity: [\d.]+ \+ [\d.]+ \* level/);
  });

  it('§14 — ô nhập KHÔNG hiện mặc định, chỉ khi chọn bàn phím', () => {
    expect(LAYER).toMatch(/\{g\.typing && \(/);
    expect(LAYER).toMatch(/setTypingMode\(!g\.typing\)/);
  });

  it('§15 — dùng đủ các trạng thái, kể cả `executing`', () => {
    for (const st of ['processing', 'executing', 'speaking']) {
      expect(LAYER).toMatch(new RegExp(`setAgentState\\('${st}'\\)`));
    }
  });

  it('§16 — Agent mở xong một màn thì lớp TỰ TẮT', () => {
    // Spec §16 cho cả hai đường ("Overlay có thể tự động thu nhỏ/tắt. Hoặc giữ
    // Assistant active"); chủ sở hữu chốt đường TẮT — trợ lý vừa mở một màn CHO
    // NGƯỜI DÙNG XEM, để lớp che lên trên là làm hỏng đúng việc mình vừa làm,
    // nhất là khi lớp đang chặn mọi thao tác (§21).
    expect(LAYER).toMatch(/CLOSE_AFTER_OPEN_MS/);
    expect(LAYER).toMatch(/setTimeout\(closeAssistant, CLOSE_AFTER_OPEN_MS\)/);
  });

  it('§16 — nhưng KHÔNG tắt ngay: câu hướng dẫn phải kịp đọc', () => {
    const m = LAYER.match(/const CLOSE_AFTER_OPEN_MS = (\d+);/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(1200);
  });

  it('hẹn giờ tắt phải HUỶ ĐƯỢC', () => {
    // Người dùng đóng tay, hoặc hỏi tiếp một câu nữa, thì một cái hẹn còn sống sẽ
    // tắt lớp giữa câu sau.
    expect(LAYER).toMatch(/huyHenTat/);
    expect(LAYER).toMatch(/clearTimeout\(closeTimer\.current\)/);
  });

  it('§21 — lớp CHẶN thao tác với màn bên dưới', () => {
    // "AI Assistant layer đang chiếm quyền tương tác tạm thời với toàn bộ app."
    // Soi đúng cái GỐC. Các khung bên trong dùng `box-none` là hợp lệ và cần
    // thiết — nó cho cú chạm rơi xuống lớp hấp thụ ngay dưới, chứ không rơi
    // xuống app. Cấm chuỗi đó trên cả tệp là bắt nhầm thứ đang làm đúng việc.
    const root = LAYER.match(/<Animated\.View[\s\S]*?>/)![0];
    expect(root).toMatch(/pointerEvents="auto"/);
    expect(root).not.toMatch(/box-none/);
    expect(LAYER).toMatch(/onStartShouldSetResponder=\{\(\) => true\}/);
    expect(LAYER).toMatch(/onMoveShouldSetResponder=\{\(\) => true\}/);
  });

  it('có nút ĐÓNG rõ ràng, và chạm ra ngoài KHÔNG đóng', () => {
    // Chạm-ra-ngoài-để-đóng là một cửa thoát người dùng KHÔNG THẤY; với người ít
    // tiếp xúc máy móc thì "không thấy" nghĩa là "không có". Và nó làm lớp biến
    // mất giữa câu khi người ta chạm nhầm.
    expect(LAYER).toMatch(/onPress=\{closeAssistant\}/);
    expect(LAYER).toMatch(/name="close"/);
    expect(LAYER).not.toMatch(/absoluteFill\}\s*activeOpacity=\{1\}/);
  });

  it('câu của trợ lý đi qua RichText — không hiện nguyên dấu sao', () => {
    expect(LAYER).toMatch(/RichText/);
  });

  it('KHÔNG có hàng nút gợi ý — màn chào thay cho nó', () => {
    // Đây là một super app: mấy chục tính năng, và bốn cái nút chọn sẵn thì vừa
    // không đại diện cho cái gì, vừa khiến người dùng tưởng trợ lý CHỈ làm được
    // bốn việc đó.
    expect(LAYER).not.toMatch(/SUGGEST_IDS/);
    expect(LAYER).not.toMatch(/chipText/);
    expect(LAYER).toMatch(/\{chuaHoi && /);
  });

  it('màn chào nói rõ TRỢ LÝ LÀ AI: tên, vai trò, rồi lời chào', () => {
    // Câu dạy cách dùng đã bỏ. Người vừa mở lớp phủ lần đầu chưa biết mình đang
    // nói chuyện với ai, nên thứ cần trước hết là một cái tên và một vai trò.
    expect(LAYER).toMatch(/const GENIE_NAME = 'GENIE';/);
    expect(LAYER).toMatch(/const GENIE_TAGLINE = 'Trợ lý thông minh';/);
    expect(LAYER).toMatch(/const cauChao = \(\) =>/);
    // Tên phải ĐỌC RA LÀ MỘT CÁI TÊN, không lẫn vào chữ thường quanh nó.
    const brand = LAYER.match(/\bbrand: \{[^}]*\}/s)![0];
    expect(Number(brand.match(/fontSize: (\d+)/)![1])).toBeGreaterThanOrEqual(28);
    expect(brand).toMatch(/letterSpacing: [1-9]/);
  });

  it('màn chào nằm GIỮA màn, cả hai chiều — chỉ bong bóng nép trái', () => {
    // Cột giữa dồn mọi thứ xuống đáy để câu mới nhất sát cụm nút, nên khối này
    // phải ra khỏi dòng mới căn giữa theo chiều dọc được. Ra khỏi dòng cũng là
    // để lúc màn chào tắt đi, bố cục không nhảy một nhịp nào.
    const intro = LAYER.match(/\bintro: \{[^}]*\}/s)![0];
    expect(intro).toMatch(/position: 'absolute'/);
    expect(intro).toMatch(/alignItems: 'center'/);
    expect(intro).toMatch(/justifyContent: 'center'/);
    const bubble = LAYER.match(/\bintroBubble: \{[^}]*\}/s)![0];
    expect(bubble).toMatch(/alignSelf: 'flex-start'/);
  });

  it('màn chào KHÔNG được nuốt cú chạm của hộp tin bên dưới', () => {
    expect(LAYER).toMatch(/style=\{styles\.intro\} pointerEvents="none"/);
  });

  it('lời chào nằm trong ĐÚNG bong bóng mà trợ lý vẫn dùng', () => {
    // Nó phải đọc ra là lời của trợ lý, không phải chữ trang trí của app.
    expect(LAYER).toMatch(/styles\.bubbleAgent, styles\.introBubble/);
  });

  it('lời chào KHÔNG vào kho tin — panel danh sách không được đầy cuộc rỗng', () => {
    // Cho nó qua `pushMessage` thì nó được ghi xuống máy, và mỗi lần mở lớp rồi
    // đổi ý để lại một "cuộc" chỉ có mỗi lời chào.
    expect(LAYER).not.toMatch(/pushMessage\('agent', GENIE_GREETING/);
    expect(LAYER).not.toMatch(/pushMessage\([^)]*GREETING/);
  });

  it('lời chào dùng {brand}, KHÔNG viết cứng tên một app', () => {
    // `i18n/translate.ts` thay chỗ này bằng tên app đang chạy. Viết cứng thì bản
    // CheckFarm chào người dùng bằng tên một app khác — đúng lỗi 15 chuỗi xin
    // quyền đã mắc, và là lý do chỗ thay này tồn tại.
    const m = LAYER.match(/const cauChao = \(\) =>([\s\S]*?);\n/);
    expect(m).not.toBeNull();
    const cau = m![1];
    expect(cau).toMatch(/\{brand\}/);
    expect(cau).not.toMatch(/Aladin|CheckFarm/);
    // Lời gọi `t()` phải nằm TRÊN CHÍNH DÒNG có `{brand}` — xem
    // `i18n/brandSlot.test.ts`: `autoText.tsx` bỏ qua `t()` ở tiếng Việt, nên một
    // chuỗi `{brand}` không đi qua `t()` hiện nguyên dấu ngoặc nhọn lên màn.
    const dong = cau.split('\n').find((l) => l.includes('{brand}'))!;
    expect(dong).toMatch(/\bt\(/);
    // Và gọi lúc VẼ, không phải lúc nạp module — đổi ngôn ngữ thì câu phải đổi.
    expect(LAYER).toMatch(/\{cauChao\(\)\}/);
  });
});

describe('hộp tin cao lên — sóng được phép đè lên chữ', () => {
  it('ô ĐO cụm sóng KHÔNG chiếm chỗ bố cục nữa', () => {
    // Trước đây nó là một khối cao 132 nằm trong dòng và đẩy hộp tin xuống đúng
    // ngần ấy. Chủ sở hữu chốt: cho sóng đè lên tin nhắn cũng được — nên ô này ra
    // khỏi dòng, và hộp tin lấy lại toàn bộ khu giữa.
    const band = LAYER.match(/\bwaveBand: \{[^}]*\}/)![0];
    expect(band).toMatch(/position: 'absolute'/);
  });

  it('hộp tin chiếm gần hết khu giữa', () => {
    const stream = LAYER.match(/\bstream: \{[^}]*\}/)![0];
    const m = stream.match(/maxHeight: '(\d+)%'/);
    expect(m).toBeTruthy();
    expect(Number(m![1])).toBeGreaterThanOrEqual(80);
  });

  it('tin dồn xuống ĐÁY — câu mới nhất sát cụm nút', () => {
    // Đó là chỗ mắt đang ở khi vừa bấm gửi.
    expect(LAYER).toMatch(/\bstreamBody: \{[^}]*justifyContent: 'flex-end'/s);
    expect(LAYER).toMatch(/\bcenter: \{[^}]*justifyContent: 'flex-end'/s);
  });

  it('sóng vẽ DƯỚI chữ — chữ phải còn đọc được', () => {
    // Canvas dựng TRƯỚC trong cây thì nó nằm dưới; sóng thành cái nền đang thở
    // sau lời nói, đúng vai nó đóng. Đảo thứ tự là chữ chìm vào hình.
    // Mốc là `</ScrollView>`, KHÔNG phải `<ScrollView` — chuỗi kia còn khớp vào
    // `useRef<ScrollView | null>` ở phần khai báo, tức một chỗ chẳng liên quan gì
    // tới thứ tự vẽ. Bài kiểm bắt nhầm như thế thì đỏ vì lý do sai.
    const iWave = LAYER.indexOf('<EdgeWave');
    const iStream = LAYER.indexOf('</ScrollView>');
    expect(iWave).toBeGreaterThan(0);
    expect(iStream).toBeGreaterThan(0);
    expect(iWave).toBeLessThan(iStream);
  });
});

describe('nút menu + panel danh sách cuộc', () => {
  it('hàng trên cùng có HAI đầu, menu bên TRÁI', () => {
    // Trước bản này hàng đó chỉ có nút đóng nên nó dồn hết sang phải
    // (`alignItems: 'flex-end'`). Để nguyên thì nút menu chồng lên nút đóng.
    expect(LAYER).toMatch(/\btop: \{[^}]*justifyContent: 'space-between'/s);
    const iMenu = LAYER.indexOf('name="menu"');
    const iClose = LAYER.indexOf('name="close"');
    expect(iMenu).toBeGreaterThan(0);
    expect(iMenu).toBeLessThan(iClose);
  });

  it('panel dựng SAU cụm nút — nút Mic không được thò lên trên nó', () => {
    const iCtrl = LAYER.indexOf('</KeyboardAvoidingView>');
    const iPanel = LAYER.indexOf('<GenieSectionsPanel');
    expect(iPanel).toBeGreaterThan(0);
    expect(iPanel).toBeGreaterThan(iCtrl);
  });

  it('nền panel ĐẶC — không kênh alpha', () => {
    // Chủ sở hữu chốt: *"panel này không có opacity ở nền"*. Và nó có lý do đo
    // được: đây là chỗ đọc một danh sách chữ nhỏ, với ba dải sóng vẫn chạy phía
    // sau — nền nhìn xuyên được thì không cỡ chữ nào cứu nổi.
    const style = PANEL.match(/\bpanel: \{[^}]*\}/s)![0];
    expect(style).toMatch(/backgroundColor: SURFACE/);
    expect(style).not.toMatch(/rgba|opacity/);
    // `SURFACE` phải là mã màu 6 chữ số — 8 chữ số là đã có alpha.
    expect(PANEL).toMatch(/const SURFACE = '#[0-9A-Fa-f]{6}';/);
  });

  it('xoá một cuộc phải HỎI LẠI — không có hoàn tác', () => {
    expect(PANEL).toMatch(/showWarning\(/);
    expect(PANEL).toMatch(/deleteSection\(/);
  });
});
