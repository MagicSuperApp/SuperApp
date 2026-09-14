// modules/work/hooks/usePostJob.ts
//
// Hook đăng tin tuyển. Flag ON → POST /jobs thật (cần session Bearer). Flag OFF
// → giả lập thành công (mock) để UI test không vỡ.
//
// LƯU Ý map form UI → body backend: form thu title/templateKey/description/
// budget/location; backend cần `templateKey` là khoá MẪU VIỆC do chính nó cấp
// (`GET /templates`), không phải id ngành nghề của giao diện. Màn đăng tin lấy
// danh sách mẫu từ máy chủ nên không chọn ra được khoá lạ — lý do đầy đủ ở khối
// chú thích đầu `screens/PostJobScreen.tsx`.
//
// ── `submit` trả MÃ LỖI, không bắt chỗ gọi đi đọc state ─────────────────────
// `errorCode` trong state chỉ dùng để VẼ. Chỗ gọi `await submit(...)` rồi đọc
// `errorCode` sẽ đọc trúng bao đóng của lần render TRƯỚC — lúc đó mã còn là
// `null`, nên lần bấm đầu tiên luôn rơi vào câu chung chung, đúng câu mà mọi
// nhánh mã riêng được viết ra để tránh. Lỗi đó tất định, không phải ngẫu nhiên
// theo tốc độ mạng, nên nó sẽ đi qua mọi lần thử tay mà vẫn sai với người dùng.

import { useState, useCallback } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import { postJob, WorkApiError, type WorkErrorKind, type PostJobBody } from '../services/workApi';
import type { WorkJob } from '../services/types';

export interface PostJobInput {
  templateKey: string;
  title: string;
  desc?: string;
  priceVND?: number;
  quantity?: number;
  deadlineDays?: number;
  postedByName?: string;
}

/** Kết quả một lượt gửi. `code` là mã lỗi của CHÍNH lượt này, không qua state. */
export interface PostJobOutcome {
  ok: boolean;
  code: string | null;
}

export interface PostJobState {
  submitting: boolean;
  errorKind: WorkErrorKind | null;
  errorCode: string | null;
  result: WorkJob | null;
}

export const usePostJob = () => {
  const [state, setState] = useState<PostJobState>({
    submitting: false, errorKind: null, errorCode: null, result: null,
  });

  const submit = useCallback(async (input: PostJobInput): Promise<PostJobOutcome> => {
    if (!isWorkBackendEnabled()) {
      // KHÔNG chạm mạng ⇒ KHÔNG được báo thành công. Trước đây `return true` là
      // "đăng-giả": người dùng tin đã đăng tin tuyển, thực tế không có gì gửi đi.
      // Trả false + mã BACKEND_DISABLED để UI báo trung thực "chưa đăng được".
      setState({ submitting: false, errorKind: null, errorCode: 'BACKEND_DISABLED', result: null });
      return { ok: false, code: 'BACKEND_DISABLED' };
    }
    setState({ submitting: true, errorKind: null, errorCode: null, result: null });
    try {
      const body: PostJobBody = {
        templateKey: input.templateKey,
        title: input.title,
        desc: input.desc,
        priceVND: input.priceVND,
        quantity: input.quantity,
        deadlineDays: input.deadlineDays,
        postedByName: input.postedByName,
      };
      const job = await postJob(body);
      setState({ submitting: false, errorKind: null, errorCode: null, result: job });
      return { ok: true, code: null };
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      const code = err instanceof WorkApiError ? err.code : 'UNKNOWN';
      console.warn('[Work] postJob failed:', err);
      setState({ submitting: false, errorKind: kind, errorCode: code, result: null });
      return { ok: false, code };
    }
  }, []);

  return { ...state, submit };
};
