// modules/chat/features/escrow/screens/EscrowScreen.tsx
//
// Chat KHÔNG có ký-quỹ. Cùng một quyết-định với ví, cùng một nguồn:
// `src/modules/chat/module.manifest.json` ("CHAT KHÔNG escrow/ví").
//
// Bản cũ bày tiến-trình ký-quỹ và số tiền lấy từ dữ-liệu MOCK. Vào được từ hai
// chỗ trong phòng chat (`ChatScreen.tsx` — nút trên đầu màn và thẻ trạng-thái),
// nên nó KHÔNG phải màn chết: người dùng thật chạm vào được.
//
// Route giữ nguyên để liên-kết cũ không văng lỗi điều-hướng.

import React from 'react';
import FeatureRemovedNotice from '../../../shared/components/FeatureRemovedNotice';

const EscrowScreen: React.FC = () => (
  <FeatureRemovedNotice
    icon="shield-off-outline"
    message="Trò chuyện không giữ ký-quỹ — thoả-thuận và thanh-toán làm ở AladinWork, không làm trong phòng chat."
  />
);

export default EscrowScreen;
