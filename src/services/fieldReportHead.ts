/**
 * Phần ĐẦU của báo cáo thử thực địa — dữ kiện nhận dạng bản dựng.
 *
 * ── Vì sao nó là một tệp riêng ──────────────────────────────────────────────────
 * Hai chỗ dựng báo cáo (màn Tài khoản và màn xem trước) phải in RA CÙNG một phần đầu.
 * Chép hai bản là dựng một bản sao sẽ chết im lặng: thêm một dòng ở một chỗ thì báo cáo
 * gửi từ chỗ kia thiếu đúng dòng đó, và không có gì báo. Đây là §"Một nguồn, nhiều con
 * trỏ" áp cho một thứ nhỏ — nhưng chính vì nhỏ nên nó là loại bản sao dễ sinh nhất.
 *
 * `diagnosticReport.ts` cố ý KHÔNG tự lấy mấy dữ kiện này: nó là hàm thuần, kiểm được
 * không cần thiết bị. Tệp này là nơi duy nhất chịu phần phụ thuộc thiết bị.
 */
import { Platform } from 'react-native';
import { getVersion, getBuildNumber } from 'react-native-device-info';
import { BUILD_COMMIT, BUILD_BRANCH, BUILD_ID } from '@env';

import { DEFAULT_INSTANCE } from '../config/instance.config';
import { ORILIFE_BASE } from './orilifeBase';

/** `Aladin v2.0 (86)` — tên app do cấu hình instance quyết, không gõ cứng. */
export function appVersionBase(): string {
  return `${DEFAULT_INSTANCE.displayName} v${getVersion()} (${getBuildNumber()})`;
}

export function commitShort(): string {
  return (BUILD_COMMIT ?? '').trim().slice(0, 7);
}

/**
 * Các dòng nhận dạng bản dựng.
 *
 * Ca "dựng tay" in thẳng ra là dựng tay, KHÔNG in chuỗi rỗng: một dòng `Commit:` trống
 * đọc ra là "CI có ghi nhưng mất", còn câu dưới đây đọc ra đúng việc đã xảy ra. Phân biệt
 * được hai ca đó là điều kiện để người nhận báo cáo biết có tra được mã nguồn hay không.
 */
export function fieldReportHead(): Record<string, string> {
  return {
    'Bản': appVersionBase(),
    'Commit': commitShort() || '(bản dựng tay, CI không ghi)',
    'Nhánh': (BUILD_BRANCH ?? '').trim(),
    'Mã lượt dựng': (BUILD_ID ?? '').trim(),
    'Máy chủ': ORILIFE_BASE,
    'Nền': `${Platform.OS} ${Platform.Version}`,
  };
}
