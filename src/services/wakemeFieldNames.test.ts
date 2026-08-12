// Khoá TÊN TRƯỜNG trên dây của cụm WakeMe.
//
// VÌ SAO CÓ TỆP NÀY — hai bên đổi tên theo hai luật khác nhau, và chỗ lệch KHÔNG
// BAO GIỜ báo lỗi: đọc một trường không tồn tại trong JS chỉ ra `undefined`.
//   · Jackson (`SNAKE_CASE`) gặp HAI CHỮ HOA LIỀN NHAU thì chèn MỘT gạch dưới:
//       initialDLamp → initial_dlamp   ·   currentDLamp → current_dlamp
//   · `toCamelCase` của app chỉ viết hoa chữ NGAY SAU gạch dưới:
//       initial_dlamp → initialDlamp   ·   current_dlamp → currentDlamp
// Nên tên đúng ở phía client là `initialDlamp` / `currentDlamp` — chữ l THƯỜNG.
// Nhìn qua thì giống lỗi đánh máy, nên rất dễ bị "sửa" ngược lại. Bài kiểm này là
// thứ duy nhất ngăn chuyện đó.
//
// Đây đúng họ với sáu tên trường lệch của OriLife: không cái nào báo lỗi, chỉ âm
// thầm ra `undefined`.

import { toCamelCase, toSnakeCase } from './phoenixKey-api';

/** Mô phỏng `PropertyNamingStrategies.SnakeCaseStrategy` của Jackson. */
const jacksonSnake = (s: string): string =>
  s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

describe('WakeMe — tên trường trên dây', () => {
  it('Jackson gộp hai chữ hoa liền nhau thành một gạch dưới', () => {
    expect(jacksonSnake('initialDLamp')).toBe('initial_dlamp');
    expect(jacksonSnake('currentDLamp')).toBe('current_dlamp');
  });

  it('client đọc chúng thành initialDlamp / currentDlamp — l THƯỜNG', () => {
    expect(toCamelCase('initial_dlamp')).toBe('initialDlamp');
    expect(toCamelCase('current_dlamp')).toBe('currentDlamp');
  });

  it('khai initialDLamp/currentDLamp là SAI — sẽ vĩnh viễn undefined', () => {
    // Nếu ai đó "sửa chính tả" interface về `currentDLamp`, dòng này giải thích
    // vì sao trường đó không bao giờ có giá trị: tên client đó ứng với một khoá
    // dây (`current_d_lamp`) mà máy chủ KHÔNG hề gửi.
    expect(toSnakeCase('currentDLamp')).toBe('current_d_lamp');
    expect(toSnakeCase('currentDLamp')).not.toBe('current_dlamp');
  });

  it('các tên còn lại của cụm WakeMe đi qua được cả hai chiều', () => {
    const roundTrip = ['walletAddress', 'didCommit', 'signedTxCbor', 'unsignedTxCbor',
      'requiredSignerKeyHash', 'vaultAddress', 'potBalanceLamp', 'vestStartSlot',
      'phase1Days', 'ttlSlot', 'cardanoTxHash', 'daysToPhase2', 'conditionalLamp',
      'reclaimedToPotLamp', 'magicBalanceCurrent', 'activityGate', 'dCap'];
    for (const name of roundTrip) {
      expect(toCamelCase(jacksonSnake(name))).toBe(name);
    }
  });

  it('dLamp và dOildrop KHÔNG đi qua được — biết trước để đừng tin', () => {
    // Một chữ hoa đứng đầu sau `d`: Jackson ra `d_lamp`, client đọc lại thành
    // `dLamp` — trường hợp này TÌNH CỜ đúng. Ghi lại để người sau khỏi tưởng
    // mọi tên đều an toàn: chỉ tên có HAI chữ hoa liền nhau mới gãy.
    expect(toCamelCase(jacksonSnake('dLamp'))).toBe('dLamp');
    expect(toCamelCase(jacksonSnake('dOildrop'))).toBe('dOildrop');
  });
});
