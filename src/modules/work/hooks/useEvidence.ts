// modules/work/hooks/useEvidence.ts
// Bằng chứng hợp đồng (chỉ BÊN LÀM/Genie đăng): list + register. Đăng trước khi
// `deliver` (server 400 NO_EVIDENCE/EVIDENCE_SHORT nếu thiếu). Flag OFF → không giả.

import { useCallback, useEffect, useState } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import {
  getEvidence,
  registerEvidence,
  newIdempotencyKey,
  WorkApiError,
  type WorkErrorKind,
  type EvidenceItem,
} from '../services/workApi';
import { mutationFailed, mutationOk, type MutationOutcome } from './mutationOutcome';

export interface EvidenceState {
  items: EvidenceItem[];
  status: string | null;
  allAnchored: boolean;
  loading: boolean;
  errorKind: WorkErrorKind | null;
  usingMock: boolean;
  submitting: boolean;
  errorCode: string | null;
}

export const useEvidence = (contractId: string) => {
  const [state, setState] = useState<EvidenceState>({
    items: [], status: null, allAnchored: false, loading: true,
    errorKind: null, usingMock: false, submitting: false, errorCode: null,
  });

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setState(s => ({ ...s, items: [], loading: false, errorKind: null, usingMock: true }));
      return;
    }
    setState(s => ({ ...s, loading: true, errorKind: null, usingMock: false }));
    try {
      const r = await getEvidence(contractId);
      setState(s => ({
        ...s, items: r.items ?? [], status: r.status ?? null,
        allAnchored: !!r.allAnchored, loading: false, errorKind: null,
      }));
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      setState(s => ({ ...s, loading: false, errorKind: kind }));
    }
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  /**
   * Đăng thêm bằng chứng.
   *
   * Trả MÃ LỖI của chính lượt này thay vì để chỗ gọi đọc `errorCode` trong state
   * — xem `mutationOutcome.ts`. `errorCode` vẫn còn trong state, nhưng chỉ để VẼ.
   */
  const register = useCallback(
    async (items: EvidenceItem[]): Promise<MutationOutcome<null>> => {
      if (!isWorkBackendEnabled()) {
        setState(s => ({ ...s, errorCode: 'BACKEND_DISABLED' }));
        return mutationFailed('BACKEND_DISABLED');
      }
      setState(s => ({ ...s, submitting: true, errorCode: null }));
      try {
        await registerEvidence(contractId, items, { idempotencyKey: newIdempotencyKey() });
        setState(s => ({ ...s, submitting: false }));
        await load();
        return mutationOk(null);
      } catch (err) {
        const code = err instanceof WorkApiError ? err.code : 'UNKNOWN';
        console.warn('[Work] registerEvidence failed:', err);
        setState(s => ({ ...s, submitting: false, errorCode: code }));
        return mutationFailed(code);
      }
    },
    [contractId, load],
  );

  return { ...state, reload: load, register };
};
