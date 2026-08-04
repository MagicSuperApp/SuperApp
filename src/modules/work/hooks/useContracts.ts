// modules/work/hooks/useContracts.ts
//
// Hook Hợp đồng + state machine Pledge. Cùng pattern useJobs: flag ON → workApi
// thật; OFF → mock (workMockApi) để UI chạy không cần host.
//
// Tiêu thụ THẲNG schema backend (WorkContract) — không qua adapter UI, vì shape
// hợp đồng đã hợp cho UI và các trường (state/parties/pledge) là nghiệp vụ cứng.

import { useCallback, useEffect, useState } from 'react';
import { isWorkBackendEnabled } from '../services/config';
import {
  getMyContracts,
  getContract,
  contractAction,
  createContract,
  newIdempotencyKey,
  WorkApiError,
  type WorkErrorKind,
  type ContractAction,
  type CreateContractBody,
} from '../services/workApi';
import type { WorkContract } from '../services/types';
import { MOCK_CONTRACTS, getMockContract } from '../data/workMockApi';

export interface LoadState {
  loading: boolean;
  errorKind: WorkErrorKind | null;
  usingMock: boolean;
}
const initState: LoadState = { loading: true, errorKind: null, usingMock: false };

/** Danh sách hợp đồng của tôi. */
export const useMyContracts = () => {
  const [contracts, setContracts] = useState<WorkContract[]>([]);
  const [state, setState] = useState<LoadState>(initState);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setContracts(MOCK_CONTRACTS);
      setState({ loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState({ loading: true, errorKind: null, usingMock: false });
    try {
      const remote = await getMyContracts();
      setContracts(remote);
      setState({ loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getMyContracts failed:', err);
      setContracts([]);
      setState({ loading: false, errorKind: kind, usingMock: false });
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  return { contracts, ...state, reload: load };
};

/** Chi tiết 1 hợp đồng. */
export const useContract = (id: string) => {
  const [contract, setContract] = useState<WorkContract | null>(null);
  const [state, setState] = useState<LoadState>(initState);

  const load = useCallback(async () => {
    if (!isWorkBackendEnabled()) {
      setContract(getMockContract(id) ?? null);
      setState({ loading: false, errorKind: null, usingMock: true });
      return;
    }
    setState({ loading: true, errorKind: null, usingMock: false });
    try {
      const remote = await getContract(id);
      setContract(remote);
      setState({ loading: false, errorKind: null, usingMock: false });
    } catch (err) {
      const kind = err instanceof WorkApiError ? err.kind : 'server';
      console.warn('[Work] getContract failed:', err);
      setContract(null);
      setState({ loading: false, errorKind: kind, usingMock: false });
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  return { contract, ...state, reload: load, setContract };
};

/** Thông điệp thân thiện cho lỗi nghiệp vụ Pledge (đọc `code` backend). */
export const pledgeErrorMessage = (err: unknown): string => {
  const code = err instanceof WorkApiError ? err.code : '';
  switch (code) {
    case 'ESCROW_RULE':
      return 'Chưa tới bước này trong quy trình ký quỹ — tải lại rồi thử lại.';
    case 'NO_FUNDS':
      return 'Số dư CARP không đủ để khoá cọc.';
    case 'NO_EVIDENCE':
      return 'Cần đăng bằng chứng trước khi giao việc.';
    case 'FORBIDDEN':
      return 'Bạn không phải một trong hai bên của hợp đồng này.';
    default:
      return err instanceof WorkApiError ? err.message : 'Thao tác thất bại, thử lại.';
  }
};

/**
 * Chạy 1 hành động state machine. Trả hợp đồng mới (đã cập nhật state) khi thành
 * công, ném lỗi (screen bắt + `pledgeErrorMessage`). Ở chế độ mock: no-op success
 * trả lại hợp đồng hiện tại (state không đổi — cần backend thật để thực thi).
 */
export const useContractAction = () => {
  const [running, setRunning] = useState<ContractAction | null>(null);

  const run = useCallback(
    async (
      id: string,
      action: ContractAction,
      body: Record<string, unknown> = {},
      ifVersion?: string, // version hợp-đồng đang cầm (screen truyền contract.version)
    ): Promise<WorkContract | null> => {
      if (!isWorkBackendEnabled()) {
        // Demo: không có host để thực thi state machine — trả mock hiện tại.
        return getMockContract(id) ?? null;
      }
      setRunning(action);
      try {
        // Idempotency-Key ổn-định qua các retry mạng của LẦN BẤM này (axios giữ
        // cùng config) + If-Version chặn double-apply khi bấm lại sau khi đã chạy.
        return await contractAction(id, action, body, {
          ifVersion,
          idempotencyKey: newIdempotencyKey(),
        });
      } finally {
        setRunning(null);
      }
    },
    [],
  );

  return { run, running };
};

/**
 * Tạo hợp đồng (luồng THUÊ) — từ ứng viên khớp việc `{jobId, candidateDid}` hoặc từ
 * dịch vụ `{offeringId}`. Thành công → trả WorkContract (caller điều-hướng ContractDetail).
 * Mock/lỗi → false + errorCode (BACKEND_DISABLED khi chưa có host — không tạo hợp đồng giả).
 * Idempotency-Key ổn-định theo lần bấm → mạng chập chờn không tạo 2 hợp đồng.
 */
export const useCreateContract = () => {
  const [creating, setCreating] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  const create = useCallback(
    async (body: CreateContractBody): Promise<WorkContract | false> => {
      if (!isWorkBackendEnabled()) {
        setErrorCode('BACKEND_DISABLED');
        return false;
      }
      setCreating(true);
      setErrorCode(null);
      try {
        return await createContract(body, { idempotencyKey: newIdempotencyKey() });
      } catch (err) {
        setErrorCode(err instanceof WorkApiError ? err.code : 'UNKNOWN');
        return false;
      } finally {
        setCreating(false);
      }
    },
    [],
  );

  return { create, creating, errorCode };
};
