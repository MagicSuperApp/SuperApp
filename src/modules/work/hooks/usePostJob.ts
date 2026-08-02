// modules/work/hooks/usePostJob.ts
//
// Hook đăng tin tuyển. Flag ON → POST /jobs thật (cần session Bearer). Flag OFF
// → giả lập thành công (mock) để UI test không vỡ.
//
// LƯU Ý map form UI → body backend: form hiện thu title/category/description/
// budget/location/urgent; backend cần templateKey (JobType). Chưa có bước chọn
// JobType trong form → tạm map categoryId làm templateKey khi có template khớp;
// nếu backend từ chối (404 NO_TEMPLATE) → trả code cho UI báo "chọn loại việc".

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

  const submit = useCallback(async (input: PostJobInput): Promise<boolean> => {
    if (!isWorkBackendEnabled()) {
      // KHÔNG chạm mạng ⇒ KHÔNG được báo thành công. Trước đây `return true` là
      // "đăng-giả": người dùng tin đã đăng tin tuyển, thực tế không có gì gửi đi.
      // Trả false + mã BACKEND_DISABLED để UI báo trung thực "chưa đăng được".
      setState({ submitting: false, errorKind: null, errorCode: 'BACKEND_DISABLED', result: null });
      return false;
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
      return true;
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      const code = err instanceof WorkApiError ? err.code : 'UNKNOWN';
      console.warn('[Work] postJob failed:', err);
      setState({ submitting: false, errorKind: kind, errorCode: code, result: null });
      return false;
    }
  }, []);

  return { ...state, submit };
};
