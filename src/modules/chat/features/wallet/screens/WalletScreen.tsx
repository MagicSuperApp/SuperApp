// modules/chat/features/wallet/screens/WalletScreen.tsx
//
// Chat KHÔNG có ví. Quyết-định nằm ở `src/modules/chat/module.manifest.json`
// ("CHAT KHÔNG escrow/ví — anh Aladin chốt: nhắn tin miễn phí"), và `routes` của
// manifest chỉ khai ["ChatHome","ChatRoom"].
//
// Bản cũ của màn này bày số dư + địa-chỉ ví lấy từ dữ-liệu MOCK, kèm bốn nút
// Nhận/Gửi/Quét/Đổi gắn hàm rỗng (issue #110). Trong một màn có chữ "ví" và một
// con số, bấm "Gửi" mà không có gì xảy ra KHÔNG đọc ra là "chưa làm" — nó đọc ra
// là tiền vừa đi đâu mất. Nên gỡ hẳn, không phải vô-hiệu-hoá nút.
//
// Route giữ nguyên để liên-kết cũ không văng lỗi điều-hướng.

import React from 'react';
import FeatureRemovedNotice from '../../../shared/components/FeatureRemovedNotice';

const WalletScreen: React.FC = () => (
  <FeatureRemovedNotice
    icon="wallet-outline"
    message="Trò chuyện không có ví — nhắn tin miễn phí, không giữ tiền trong ứng-dụng chat."
  />
);

export default WalletScreen;
