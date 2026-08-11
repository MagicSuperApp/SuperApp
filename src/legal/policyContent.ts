// legal/policyContent.ts — nội dung Điều khoản & Chính sách hiển thị TRONG ứng dụng.
//
// ⚠ HAI ĐIỀU NGƯỜI SỬA SAU PHẢI BIẾT
//
// 1. Đây là bản mô tả ĐÚNG những gì mã nguồn đang làm, không phải văn bản pháp lý đã
//    qua rà soát. Mọi câu ở đây đều truy được về một dòng mã hoặc một khai báo quyền
//    (ghi kèm trong chú thích từng mục). Trước khi phát hành ra cửa hàng, chủ sở hữu
//    phải đọc và chuẩn y — nhất là mục 6 (quyền của người dùng) và mục 8 (luật áp dụng),
//    là hai chỗ mã nguồn không trả lời thay được.
//
// 2. Sửa mã mà không sửa file này là làm cho chính sách nói sai. Cụ thể: thêm một quyền
//    vào `AndroidManifest.xml` / `Info.plist`, hoặc thêm một đích gửi dữ liệu mới, thì
//    phải thêm dòng tương ứng ở §2 và §5. Google Play coi lệch giữa quyền khai báo và
//    chính sách công bố là căn cứ gỡ ứng dụng.
//
// Vì sao không đi qua `t()`: hệ dịch tự động tra theo từ điển cụm; thiếu bản dịch thì
// hiện nguyên tiếng Việt. Với văn bản thường thì đó là hành vi an toàn — với văn bản
// pháp lý thì không, người đọc bản tiếng Anh phải nhận đúng bản tiếng Anh. Nên nội dung
// ở đây gắn cứng theo ngôn ngữ, thiếu thì lui về tiếng Anh (dòng chuẩn), không lui về
// tiếng Việt.

import type { LangCode } from '../i18n/types';

export interface PolicySection {
  heading: string;
  /** Mỗi phần tử là một đoạn. Chuỗi bắt đầu bằng "• " được vẽ thành gạch đầu dòng. */
  body: string[];
}

export interface PolicyDoc {
  title: string;
  effective: string;
  intro: string;
  sections: PolicySection[];
}

/** Ngày hiệu lực — đổi mỗi lần nội dung đổi, đừng để nguyên. */
export const POLICY_EFFECTIVE_DATE = '2026-08-06';

/**
 * Thông tin đơn vị vận hành.
 *
 * `address` do chủ sở hữu cung cấp 06/08/2026.
 * `contact` đang dùng hòm thư tài khoản chính — chủ sở hữu xác nhận lại trước khi phát
 * hành nếu muốn dùng một hòm thư riêng cho việc bảo mật dữ liệu.
 */
export const OPERATOR = {
  name: 'Aladin',
  address:
    'Số nhà 77, đường Chà Là 11, Khu đô thị Vinhomes Ocean Park 2, Xã Nghĩa Trụ, Tỉnh Hưng Yên, Việt Nam',
  addressEn:
    'No. 77, Cha La 11 Street, Vinhomes Ocean Park 2, Nghia Tru Commune, Hung Yen Province, Vietnam',
  contact: 'aladincontract@gmail.com',
} as const;

const VI: PolicyDoc = {
  title: 'Điều khoản & Chính sách',
  effective: `Hiệu lực từ ${POLICY_EFFECTIVE_DATE}`,
  intro:
    'Trang này nói rõ ứng dụng lấy gì của bạn, gửi đi đâu, và chỗ nào bạn lấy lại được — ' +
    'chỗ nào thì không. Chúng tôi viết ngắn và nói thẳng, kể cả những chỗ bất lợi cho chúng tôi.',
  sections: [
    {
      heading: '1. Ai vận hành ứng dụng',
      body: [
        `${OPERATOR.name} vận hành ứng dụng này.`,
        `Địa chỉ: ${OPERATOR.address}`,
        `Liên hệ về dữ liệu cá nhân: ${OPERATOR.contact}`,
      ],
    },
    {
      // Nguồn: AndroidManifest.xml:4-23 · Info.plist:51-66 (khai báo quyền của cả hai nền tảng).
      heading: '2. Ứng dụng lấy gì',
      body: [
        'Chỉ những thứ dưới đây, và chỉ khi bạn đã cho phép ở hộp thoại của hệ điều hành:',
        '• Máy ảnh — ảnh và video cây, quả, vật nuôi, nông trại mà bạn chủ động chụp.',
        '• Micrô — 30 giây âm thanh môi trường quanh cây khi bạn quay video định danh, dùng để ghi lại điều kiện lúc chụp.',
        '• Vị trí — toạ độ GPS gắn vào mỗi điểm đo và ranh giới nông trại bạn vẽ.',
        '• Cảm biến chuyển động — hướng máy ảnh khi bạn chụp vòng quanh cây.',
        '• Thư viện ảnh — để lưu bản gốc ảnh/video bạn vừa chụp vào máy, và để bạn chọn ảnh có sẵn.',
        '• Thông báo — nếu bạn bật.',
        'Ứng dụng không đọc danh bạ, không đọc tin nhắn, không đọc lịch sử duyệt web, và không có mật khẩu nào để lấy.',
      ],
    },
    {
      // Nguồn: services/phoenixKey-native.ts (Android Keystore / iOS Secure Enclave).
      heading: '3. Khuôn mặt và vân tay — điều quan trọng nhất',
      body: [
        'Ứng dụng KHÔNG nhận được khuôn mặt hay vân tay của bạn, và không lưu bản nào ở bất kỳ đâu.',
        'Khi bạn quét khuôn mặt hoặc vân tay, việc đối chiếu do chính hệ điều hành làm, bên trong con chip bảo mật của máy. Ứng dụng chỉ nhận lại một câu trả lời có hoặc không.',
        'Dữ liệu sinh trắc học không rời khỏi máy của bạn, không gửi lên máy chủ của chúng tôi, và chúng tôi không có cách nào lấy được.',
      ],
    },
    {
      // Nguồn: services/phoenixKeyAuthService.ts · sdk/phoenixKey.ts.
      heading: '4. Danh tính PhoenixKey',
      body: [
        'Ứng dụng không dùng mật khẩu. Danh tính của bạn là một cặp khoá do chip bảo mật trong máy sinh ra.',
        'Khoá riêng nằm trong chip đó và không bao giờ rời máy — chúng tôi không có, không sao lưu được, và không khôi phục hộ được.',
        'Chỉ khoá công khai và mã định danh (DID) của bạn được gửi lên danh bạ PhoenixKey, để người khác kiểm chứng được chữ ký của bạn.',
        'Hệ quả bạn cần biết trước: mất máy mà chưa lập người giám hộ khôi phục thì mất quyền ký. Dữ liệu đã ghi vẫn còn, nhưng bạn không ký tiếp được bằng danh tính cũ.',
      ],
    },
    {
      // Nguồn: services/analytics/analyticsApi.ts · các service OriLife / ProofChat / AladinWork.
      heading: '5. Dữ liệu đi đâu',
      body: [
        '• Ảnh, video, toạ độ và ghi chú nông trại → máy chủ OriLife, rồi lưu trên mạng lưu trữ phân tán LampNet.',
        '• Tin nhắn → dịch vụ ProofChat, mã hoá đầu-cuối.',
        '• Việc làm và hợp đồng → dịch vụ AladinWork.',
        '• Sự kiện thao tác trong ứng dụng (mở màn nào, bấm nút nào, chậm bao lâu) → máy chủ đo lường của chúng tôi, dùng để tìm chỗ ứng dụng chạy sai hoặc chạy chậm. Phần này tắt hẳn khi bản dựng không được cấu hình.',
        'Chúng tôi không bán dữ liệu của bạn cho ai, và không dùng nó để hiển thị quảng cáo.',
      ],
    },
    {
      heading: '6. Bạn lấy lại được gì, và chỗ nào thì không',
      body: [
        'Bạn có thể yêu cầu xem, sửa hoặc xoá dữ liệu cá nhân của mình bằng cách viết tới hòm thư ở mục 1.',
        'Nhưng có một chỗ chúng tôi nói trước cho rõ: sổ bằng chứng truy xuất nguồn gốc là sổ CHỈ GHI THÊM. Một dòng đã ghi thì không sửa và không xoá được — đó chính là lý do nó có giá trị làm bằng chứng. Chúng tôi có thể gỡ liên kết giữa dòng đó với danh tính của bạn, nhưng không xoá được bản thân dòng đó.',
        'Ảnh và video bạn đã lưu vào thư viện của máy thì thuộc về máy bạn; xoá hay giữ là quyền của bạn, chúng tôi không đụng tới.',
      ],
    },
    {
      heading: '7. Độ tuổi',
      body: [
        'Ứng dụng dành cho người từ 16 tuổi trở lên. Chúng tôi không cố ý thu thập dữ liệu của trẻ em dưới độ tuổi này.',
      ],
    },
    {
      heading: '8. Thay đổi và luật áp dụng',
      body: [
        'Khi nội dung trang này đổi, ngày hiệu lực ở đầu trang sẽ đổi theo. Thay đổi làm ảnh hưởng tới dữ liệu đã thu sẽ được báo trong ứng dụng trước khi có hiệu lực.',
        'Chính sách này áp dụng theo pháp luật Việt Nam.',
      ],
    },
  ],
};

const EN: PolicyDoc = {
  title: 'Terms & Policies',
  effective: `Effective ${POLICY_EFFECTIVE_DATE}`,
  intro:
    'This page states what the app takes from you, where it goes, and what you can get back — ' +
    'including the parts you cannot. It is short and direct, including where that is inconvenient for us.',
  sections: [
    {
      heading: '1. Who operates this app',
      body: [
        `${OPERATOR.name} operates this app.`,
        `Address: ${OPERATOR.addressEn}`,
        `Data protection contact: ${OPERATOR.contact}`,
      ],
    },
    {
      heading: '2. What the app collects',
      body: [
        'Only the following, and only after you grant permission in your operating system:',
        '• Camera — photos and video of trees, fruit, animals and farms that you choose to capture.',
        '• Microphone — 30 seconds of ambient sound around a tree while you record its identity video, to record the conditions at capture time.',
        '• Location — GPS coordinates attached to each measurement point and to farm boundaries you draw.',
        '• Motion sensors — camera orientation while you walk around a tree.',
        '• Photo library — to save the originals of what you just captured, and to let you pick existing photos.',
        '• Notifications — if you enable them.',
        'The app does not read your contacts, messages or browsing history, and there is no password for anyone to take.',
      ],
    },
    {
      heading: '3. Face and fingerprint — the part that matters most',
      body: [
        'The app does NOT receive your face or fingerprint, and stores no copy of either anywhere.',
        'When you scan, the matching is done by your operating system inside your device’s secure chip. The app receives only a yes or no.',
        'Biometric data never leaves your device, is never sent to our servers, and we have no way to obtain it.',
      ],
    },
    {
      heading: '4. Your PhoenixKey identity',
      body: [
        'The app uses no passwords. Your identity is a key pair generated by the secure chip in your device.',
        'The private key stays inside that chip and never leaves your device — we do not hold it, cannot back it up, and cannot restore it for you.',
        'Only your public key and your identifier (DID) are published to the PhoenixKey directory, so that others can verify your signatures.',
        'One consequence you should know in advance: if you lose your device without having set up a recovery guardian, you lose the ability to sign. Your recorded data remains, but you cannot sign again with the old identity.',
      ],
    },
    {
      heading: '5. Where your data goes',
      body: [
        '• Photos, video, coordinates and farm notes → OriLife servers, then stored on the LampNet distributed storage network.',
        '• Messages → the ProofChat service, end-to-end encrypted.',
        '• Jobs and contracts → the AladinWork service.',
        '• In-app interaction events (which screen, which button, how long it took) → our measurement server, used to find where the app misbehaves or runs slow. This is switched off entirely in builds where it is not configured.',
        'We do not sell your data to anyone, and we do not use it to serve advertising.',
      ],
    },
    {
      heading: '6. What you can get back, and what you cannot',
      body: [
        'You may request access to, correction of, or deletion of your personal data by writing to the address in section 1.',
        'One point we state plainly: the traceability evidence ledger is APPEND-ONLY. An entry once written cannot be edited or deleted — that is precisely why it holds value as evidence. We can unlink an entry from your identity, but we cannot erase the entry itself.',
        'Photos and video saved into your device’s own library belong to your device; keeping or deleting them is yours to decide, and we do not touch them.',
      ],
    },
    {
      heading: '7. Age',
      body: [
        'This app is intended for people aged 16 and over. We do not knowingly collect data from children below that age.',
      ],
    },
    {
      heading: '8. Changes and governing law',
      body: [
        'When this page changes, the effective date at the top changes with it. Changes affecting data already collected will be announced in the app before they take effect.',
        'This policy is governed by the laws of Vietnam.',
      ],
    },
  ],
};

/**
 * Bản chính sách theo ngôn ngữ đang chọn.
 *
 * Chỉ `vi` có bản riêng; mọi ngôn ngữ khác lui về `en` — dòng chuẩn của sản phẩm.
 * Cố ý KHÔNG lui về `vi`: người đọc bản tiếng Trung/Nhật thà đọc tiếng Anh còn hơn
 * đọc một văn bản pháp lý bằng thứ tiếng họ không đọc được.
 */
export function policyFor(lang: LangCode): PolicyDoc {
  return lang === 'vi' ? VI : EN;
}
