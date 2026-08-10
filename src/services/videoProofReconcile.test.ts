/**
 * Test videoProofReconcile — đối chiếu bằng chứng "đã lưu" với /v1/inspect.
 * Trọng tâm #117 mục 6: CID nodes-rỗng/404 phải BÁO người trực (rLog.error), CID lành
 * và CID giả `local_`/chưa-stored phải im; throttle + khử-trùng + không-báo-lại đúng.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { reconcileVideoProofsOnce, maybeReconcileOnNetChange } from './videoProofReconcile';
import { loadAllVideoProofs } from './videoProofStore';
import rLog from './remoteLogger';

jest.mock('./videoProofStore', () => ({ loadAllVideoProofs: jest.fn() }));
jest.mock('./remoteLogger', () => ({ __esModule: true, default: { info: jest.fn(), error: jest.fn() } }));

const mockProofs = loadAllVideoProofs as jest.Mock;
const rlErr = rLog.error as jest.Mock;
const rlInfo = rLog.info as jest.Mock;

function inspectOk(nodes: number) {
  return { status: 200, ok: true, json: async () => ({ nodes: Array.from({ length: nodes }, (_, i) => ({ node_id: `n${i}` })) }) };
}
const inspect404 = { status: 404, ok: false, json: async () => ({}) };

const proof = (over: Partial<any> = {}) => ({
  videoCid: 'ln1q_aaaa0000_clip', kind: 'tree', at: '2026-08-10T00:00:00Z',
  stored: true, treeId: 'tree-1', ...over,
});

beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  (global as any).fetch = jest.fn();
});

it('CID nodes rỗng → BÁO người trực (rLog.error) + đếm 1', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_dead0001_clip' })]);
  (global.fetch as jest.Mock).mockResolvedValue(inspectOk(0));

  const n = await reconcileVideoProofsOnce();

  expect(n).toBe(1);
  expect(rlErr).toHaveBeenCalledWith('lampnet_proof_orphaned', expect.objectContaining({ cid: 'ln1q_dead0001_clip', treeId: 'tree-1' }));
});

it('CID 404 (đã biến mất) cũng là mồ côi → báo', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_gone0002_clip' })]);
  (global.fetch as jest.Mock).mockResolvedValue(inspect404);

  expect(await reconcileVideoProofsOnce()).toBe(1);
  expect(rlErr).toHaveBeenCalledWith('lampnet_proof_orphaned', expect.objectContaining({ httpStatus: 404 }));
});

it('CID lành (≥1 node) → KHÔNG báo', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_live0003_clip' })]);
  (global.fetch as jest.Mock).mockResolvedValue(inspectOk(1));

  expect(await reconcileVideoProofsOnce()).toBe(0);
  expect(rlErr).not.toHaveBeenCalled();
});

it('bỏ qua CID giả `local_` và bản ghi chưa stored — không gọi inspect', async () => {
  mockProofs.mockResolvedValue([
    proof({ videoCid: 'local_ffff0004_clip' }),          // CID giả
    proof({ videoCid: 'ln1q_pend0005_clip', stored: false }), // chưa xác nhận lưu
    proof({ videoCid: 'ln1q_pend0006_clip', stored: undefined }),
  ]);

  expect(await reconcileVideoProofsOnce()).toBe(0);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('lỗi mạng/timeout = inconclusive → KHÔNG báo (để lượt sau)', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_neterr07_clip' })]);
  (global.fetch as jest.Mock).mockRejectedValue(new Error('network'));

  expect(await reconcileVideoProofsOnce()).toBe(0);
  expect(rlErr).not.toHaveBeenCalled();
});

it('khử trùng CID trùng → chỉ inspect một lần', async () => {
  mockProofs.mockResolvedValue([
    proof({ videoCid: 'ln1q_dup0008_clip', treeId: 'tree-1' }),
    proof({ videoCid: 'ln1q_dup0008_clip', treeId: 'tree-2' }),
  ]);
  (global.fetch as jest.Mock).mockResolvedValue(inspectOk(2));

  await reconcileVideoProofsOnce();
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

it('throttle: lượt hai trong 30 phút bị bỏ (không fetch), force thì chạy', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_live0009_clip' })]);
  (global.fetch as jest.Mock).mockResolvedValue(inspectOk(1));

  await reconcileVideoProofsOnce();
  expect(global.fetch).toHaveBeenCalledTimes(1);

  await reconcileVideoProofsOnce();                 // bị throttle
  expect(global.fetch).toHaveBeenCalledTimes(1);

  await reconcileVideoProofsOnce({ force: true });  // ép chạy
  expect(global.fetch).toHaveBeenCalledTimes(2);
});

it('không báo lại CID mồ côi đã báo ở lượt trước', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_dead0010_clip' })]);
  (global.fetch as jest.Mock).mockResolvedValue(inspectOk(0));

  expect(await reconcileVideoProofsOnce()).toBe(1);           // báo lần đầu
  expect(await reconcileVideoProofsOnce({ force: true })).toBe(0); // vẫn mồ côi, nhưng không báo lại
  expect(rlErr).toHaveBeenCalledTimes(1);
});

it('maybeReconcileOnNetChange: chỉ chạy khi WIFI', async () => {
  mockProofs.mockResolvedValue([proof({ videoCid: 'ln1q_live0011_clip' })]);
  (global.fetch as jest.Mock).mockResolvedValue(inspectOk(1));

  maybeReconcileOnNetChange({ type: 'cellular', isConnected: true, isInternetReachable: true });
  await new Promise(r => setTimeout(r, 0));
  expect(global.fetch).not.toHaveBeenCalled();

  maybeReconcileOnNetChange({ type: 'wifi', isConnected: true, isInternetReachable: true });
  await new Promise(r => setTimeout(r, 0));
  expect(global.fetch).toHaveBeenCalled();
});
