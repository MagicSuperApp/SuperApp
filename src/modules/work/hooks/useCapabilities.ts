// modules/work/hooks/useCapabilities.ts
//
// Khai + xác-minh CHỨNG CHỈ NĂNG LỰC (competency credential). Đây là 1 trong 3 điều
// kiện lọt danh bạ /taskers (chứng chỉ duyệt / dịch vụ mở / lịch rảnh). Flag OFF →
// không tạo giả: trả false + BACKEND_DISABLED.
//   create:  POST /capabilities {templateKey, metric}      → Credential (status pending)
//   verify:  POST /capabilities/:id/verify {templateKey}   → {verified, credential, stamp}

import { useState, useCallback } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import {
  createCapability,
  verifyCapability,
  newIdempotencyKey,
  WorkApiError,
  type WorkErrorKind,
} from '../services/workApi';
import type { Credential } from '../services/types';
import { mutationFailed, mutationOk, type MutationOutcome } from './mutationOutcome';

export interface CapabilityState {
  submitting: boolean;
  errorKind: WorkErrorKind | null;
  errorCode: string | null;
}

export const useCapabilities = () => {
  const [state, setState] = useState<CapabilityState>({
    submitting: false, errorKind: null, errorCode: null,
  });

  // Trả MÃ LỖI của chính lượt này; `errorCode` trong state chỉ còn để VẼ. Xem
  // `mutationOutcome.ts` — đọc `errorCode` sau một lượt `await` là đọc bao đóng cũ.
  const run = useCallback(
    async <T>(op: (key: string) => Promise<T>): Promise<MutationOutcome<T>> => {
      if (!isWorkBackendEnabled()) {
        setState({ submitting: false, errorKind: null, errorCode: 'BACKEND_DISABLED' });
        return mutationFailed('BACKEND_DISABLED');
      }
      setState({ submitting: true, errorKind: null, errorCode: null });
      try {
        const res = await op(newIdempotencyKey());
        setState({ submitting: false, errorKind: null, errorCode: null });
        return mutationOk(res);
      } catch (err) {
        const kind = err instanceof WorkApiError ? err.kind : 'server';
        const code = err instanceof WorkApiError ? err.code : 'UNKNOWN';
        console.warn('[Work] capability op failed:', err);
        setState({ submitting: false, errorKind: kind, errorCode: code });
        return mutationFailed(code);
      }
    },
    [],
  );

  const create = useCallback(
    (templateKey: string, metric: Record<string, number>): Promise<MutationOutcome<Credential>> =>
      run(key => createCapability({ templateKey, metric }, { idempotencyKey: key })),
    [run],
  );

  const verify = useCallback(
    (id: string, templateKey?: string) =>
      run(key => verifyCapability(id, templateKey ? { templateKey } : {}, { idempotencyKey: key })),
    [run],
  );

  return { ...state, create, verify };
};
