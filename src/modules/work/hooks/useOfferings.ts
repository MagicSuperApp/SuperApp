// modules/work/hooks/useOfferings.ts
//
// Hook nửa CUNG của chợ (H-28): liệt kê + tạo/sửa/đóng DỊCH VỤ (offering).
// Flag ON → /offerings thật (Bearer). OFF → KHÔNG fake: list trả rỗng, mọi thao-tác
// ghi trả false + code BACKEND_DISABLED (giống usePostJob — không "đăng-giả" khiến
// user tin đã tạo dịch vụ mà thực tế không gửi gì đi).
//
// Chủ gắn theo DID của PHIÊN ở server — hook KHÔNG gửi ownerDid trong thân tạo/sửa.

import { useState, useCallback } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import {
  getOfferings,
  createOffering,
  updateOffering,
  deleteOffering,
  newIdempotencyKey,
  WorkApiError,
  type WorkErrorKind,
  type CreateOfferingBody,
  type UpdateOfferingBody,
} from '../services/workApi';
import type { Offering } from '../services/types';

export interface OfferingsListState {
  offerings: Offering[];
  loading: boolean;
  errorKind: WorkErrorKind | null;
  usingMock: boolean;
}

export interface OfferingMutState {
  submitting: boolean;
  errorKind: WorkErrorKind | null;
  errorCode: string | null;
}

/** Liệt kê dịch vụ (mặc-định của 1 chủ khi truyền ownerDid; bỏ trống = tất cả active). */
export const useOfferingsList = (ownerDid?: string) => {
  const [state, setState] = useState<OfferingsListState>({
    offerings: [], loading: false, errorKind: null, usingMock: false,
  });

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      // KHÔNG có host → rỗng thật (không bịa dịch vụ demo để tránh ký hợp đồng ảo).
      setState({ offerings: [], loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState(s => ({ ...s, loading: true, errorKind: null, usingMock: false }));
    try {
      const list = await getOfferings(ownerDid ? { ownerDid, activeOnly: false } : { activeOnly: true });
      setState({ offerings: list, loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      setState({ offerings: [], loading: false, errorKind: kind, usingMock: false });
    }
  }, [ownerDid]);

  return { ...state, load };
};

/** Tạo / sửa / đóng dịch vụ. Trả Offering (thành công) hoặc false (mock/lỗi). */
export const useOfferingMutations = () => {
  const [state, setState] = useState<OfferingMutState>({
    submitting: false, errorKind: null, errorCode: null,
  });

  // Chạy 1 mutation ghi — idempotency ổn-định theo LẦN gọi (retry mạng không tạo 2).
  const runMut = useCallback(
    async <T>(op: (key: string) => Promise<T>): Promise<T | false> => {
      if (!isWorkBackendEnabled()) {
        setState({ submitting: false, errorKind: null, errorCode: 'BACKEND_DISABLED' });
        return false;
      }
      setState({ submitting: true, errorKind: null, errorCode: null });
      try {
        const res = await op(newIdempotencyKey());
        setState({ submitting: false, errorKind: null, errorCode: null });
        return res;
      } catch (err) {
        const kind = err instanceof WorkApiError ? err.kind : 'server';
        const code = err instanceof WorkApiError ? err.code : 'UNKNOWN';
        console.warn('[Work] offering mutation failed:', err);
        setState({ submitting: false, errorKind: kind, errorCode: code });
        return false;
      }
    },
    [],
  );

  const create = useCallback(
    (body: CreateOfferingBody) => runMut(key => createOffering(body, { idempotencyKey: key })),
    [runMut],
  );
  const update = useCallback(
    (id: string, patch: UpdateOfferingBody) => runMut(key => updateOffering(id, patch, { idempotencyKey: key })),
    [runMut],
  );
  const remove = useCallback(
    (id: string) => runMut(key => deleteOffering(id, { idempotencyKey: key })),
    [runMut],
  );

  return { ...state, create, update, remove };
};
