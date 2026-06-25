/**
 * TreeIdentify — RN client for POST /trees/identify (Build 57).
 *
 * Spec: /Identify/FormalMath/TreeIdentify-Contract-v0.1.md
 *
 * Replaces the legacy native Swift VerifyAPI + Capture3DPreVerifier path
 * for Build 57+. Build 56 still uses native Swift; this module is dormant
 * there but the same backend endpoint serves both clients.
 *
 * Honors:
 *  - INV-03: handles HTTP 503 by enqueuing to offline queue, no silent fail.
 *  - INV-07: client_capture_id idempotency.
 *  - Independent Operation: works offline (queue + sync).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ---------------------------------------------------------------------------
// Types — mirror src/dto/tree_identify.py
// ---------------------------------------------------------------------------

export type Decision = 'MATCH' | 'AMBIGUOUS' | 'NO_MATCH';

export type SpeciesHint =
  | 'durian'
  | 'jackfruit'
  | 'coffee'
  | 'pepper'
  | 'mango'
  | 'avocado'
  | 'other';

export interface TimeSeries {
  latitude: number;
  longitude: number;
  timestamp: number; // unix seconds
  heading: number;
  pitch: number;
  roll: number;
}

export interface IdentifyMetadata {
  device_id: string;
  nonce: string;
  signature: string;
}

export interface IdentifyPayload {
  client_capture_id: string;
  farm_id?: string;
  time_series: TimeSeries;
  metadata: IdentifyMetadata;
  species_hint?: SpeciesHint;
  pipeline_version: string;
  radius_m?: number;
}

export interface MatchCandidate {
  tree_id: string;
  confidence: number;
  thumbnail_url?: string;
  first_seen_at?: string;
  label?: string;
  distance_m?: number;
}

export interface IdentifyResponse {
  decision: Decision;
  tree_id: string | null;
  confidence: number | null;
  candidates: MatchCandidate[];
  pending_image_id: string | null;
  expires_at: string | null;
  pipeline_version: string;
  version_tag: string;
  processed_ms: number;
}

export interface IdentifyError {
  type:
    | 'feature_extractor_unavailable'
    | 'invalid_image'
    | 'geofence_violation'
    | 'pending_expired'
    | 'rate_limited'
    | 'internal_error'
    | 'network_error';
  detail: string;
  retry_after_seconds?: number;
  http_status?: number;
}

export interface IdentifyResult {
  ok: true;
  response: IdentifyResponse;
}

export interface IdentifyFailure {
  ok: false;
  error: IdentifyError;
  enqueued?: boolean;
  client_capture_id: string;
}

// ---------------------------------------------------------------------------
// Constants — must match math_constants.py
// ---------------------------------------------------------------------------

export const PIPELINE_VERSION = 'v0.1-prototype-dino-384';
const IDENTIFY_PATH = '/trees/identify';
const CONFIRM_PATH = '/trees/identify/confirm';
const REQUEST_TIMEOUT_MS = 8000;
const QUEUE_KEY = '@aladin/treeIdentify/offlineQueue';
// B12 fix: cap offline queue at 200 entries. Older entries dropped first.
// Rationale: iPhone XS 256MB AsyncStorage parses slowly above ~5MB JSON.
// 200 entries × ~200 bytes metadata = 40KB JSON (image_uri only, not image bytes).
const MAX_QUEUE_SIZE = 200;
const MAX_RETRY_COUNT = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function newCaptureId(): string {
  // Math C-T-C04 doesn't constrain client id format. Use timestamp + random.
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `cap_${ts}_${rnd}`;
}

interface QueuedScan {
  client_capture_id: string;
  image_uri: string; // file:// path
  payload: IdentifyPayload;
  base_url: string;
  api_key: string;
  enqueued_at: number;
  retry_count: number;
  last_error?: string;
}

async function loadQueue(): Promise<QueuedScan[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedScan[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

async function enqueueScan(scan: QueuedScan): Promise<void> {
  const queue = await loadQueue();
  // Idempotency: replace existing entry with same client_capture_id.
  let filtered = queue.filter(s => s.client_capture_id !== scan.client_capture_id);
  filtered.push(scan);
  // B12: cap queue size. Drop oldest first (FIFO eviction).
  if (filtered.length > MAX_QUEUE_SIZE) {
    filtered = filtered
      .sort((a, b) => a.enqueued_at - b.enqueued_at)
      .slice(filtered.length - MAX_QUEUE_SIZE);
  }
  await saveQueue(filtered);
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(QUEUE_KEY);
}

export async function removeFromQueue(client_capture_id: string): Promise<void> {
  const queue = await loadQueue();
  await saveQueue(queue.filter(s => s.client_capture_id !== client_capture_id));
}

// ---------------------------------------------------------------------------
// Core: identify
// ---------------------------------------------------------------------------

export interface IdentifyInput {
  image_uri: string;       // file:// path to local jpeg/png
  time_series: TimeSeries;
  metadata: IdentifyMetadata;
  farm_id?: string;
  species_hint?: SpeciesHint;
  radius_m?: number;
  client_capture_id?: string; // optional override for retry
}

export interface IdentifyClientConfig {
  base_url: string;          // e.g. https://api.orilife.io
  api_key: string;
  enqueue_on_503?: boolean;  // default true (INV-03)
}

export async function identifyTree(
  input: IdentifyInput,
  config: IdentifyClientConfig,
): Promise<IdentifyResult | IdentifyFailure> {
  const client_capture_id = input.client_capture_id ?? newCaptureId();
  const payload: IdentifyPayload = {
    client_capture_id,
    farm_id: input.farm_id,
    time_series: input.time_series,
    metadata: input.metadata,
    species_hint: input.species_hint,
    pipeline_version: PIPELINE_VERSION,
    radius_m: input.radius_m,
  };

  const form = new FormData();
  form.append('payload', JSON.stringify(payload));
  // @ts-ignore — React Native FormData supports {uri,name,type} for file uploads
  form.append('image', {
    uri: input.image_uri,
    name: `${client_capture_id}.jpg`,
    type: 'image/jpeg',
  });

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const resp = await fetch(`${config.base_url}${IDENTIFY_PATH}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        Accept: 'application/json',
      },
      body: form,
      signal: controller.signal,
    });
    clearTimeout(timeoutHandle);

    if (resp.status === 503) {
      const body = await resp.json().catch(() => ({}));
      const retry = body?.error?.retry_after_seconds ?? 60;
      const shouldEnqueue = config.enqueue_on_503 !== false;
      if (shouldEnqueue) {
        await enqueueScan({
          client_capture_id,
          image_uri: input.image_uri,
          payload,
          base_url: config.base_url,
          api_key: config.api_key,
          enqueued_at: Date.now(),
          retry_count: 0,
        });
      }
      return {
        ok: false,
        error: {
          type: 'feature_extractor_unavailable',
          detail: body?.error?.detail ?? 'Server feature extractor unavailable',
          retry_after_seconds: retry,
          http_status: 503,
        },
        enqueued: shouldEnqueue,
        client_capture_id,
      };
    }

    if (resp.status === 409) {
      const body = await resp.json().catch(() => ({}));
      return {
        ok: false,
        error: {
          type: 'geofence_violation',
          detail: body?.error?.detail ?? 'Geofence 3m violated',
          http_status: 409,
        },
        client_capture_id,
      };
    }

    if (!resp.ok) {
      return {
        ok: false,
        error: {
          type: 'internal_error',
          detail: `HTTP ${resp.status}`,
          http_status: resp.status,
        },
        client_capture_id,
      };
    }

    const envelope = await resp.json();
    const data = envelope?.data ?? envelope;
    return { ok: true, response: data as IdentifyResponse };
  } catch (err: any) {
    clearTimeout(timeoutHandle);
    // Network/timeout/offline — always enqueue (INV-07)
    await enqueueScan({
      client_capture_id,
      image_uri: input.image_uri,
      payload,
      base_url: config.base_url,
      api_key: config.api_key,
      enqueued_at: Date.now(),
      retry_count: 0,
      last_error: String(err?.message ?? err),
    });
    return {
      ok: false,
      error: {
        type: 'network_error',
        detail: String(err?.message ?? err),
      },
      enqueued: true,
      client_capture_id,
    };
  }
}

// ---------------------------------------------------------------------------
// Confirm (AMBIGUOUS → user picks)
// ---------------------------------------------------------------------------

export async function confirmTreeIdentify(
  pending_image_id: string,
  chosen_tree_id: string | 'new',
  config: IdentifyClientConfig,
): Promise<IdentifyResult | IdentifyFailure> {
  try {
    const resp = await fetch(`${config.base_url}${CONFIRM_PATH}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.api_key}`,
      },
      body: JSON.stringify({ pending_image_id, chosen_tree_id }),
    });
    if (resp.status === 410) {
      return {
        ok: false,
        error: { type: 'pending_expired', detail: 'AMBIGUOUS choice expired', http_status: 410 },
        client_capture_id: pending_image_id,
      };
    }
    if (!resp.ok) {
      return {
        ok: false,
        error: { type: 'internal_error', detail: `HTTP ${resp.status}`, http_status: resp.status },
        client_capture_id: pending_image_id,
      };
    }
    const envelope = await resp.json();
    const data = envelope?.data ?? envelope;
    return { ok: true, response: data as IdentifyResponse };
  } catch (err: any) {
    return {
      ok: false,
      error: { type: 'network_error', detail: String(err?.message ?? err) },
      client_capture_id: pending_image_id,
    };
  }
}

// ---------------------------------------------------------------------------
// Drain offline queue (call when network restored)
// ---------------------------------------------------------------------------

export async function drainQueue(): Promise<{
  attempted: number;
  succeeded: number;
  remaining: number;
}> {
  const queue = await loadQueue();
  const remaining: QueuedScan[] = [];
  let succeeded = 0;

  for (const item of queue) {
    if (item.retry_count >= MAX_RETRY_COUNT) {
      // Give up after MAX_RETRY_COUNT. Drop entirely to free queue space (B12).
      continue;
    }
    const result = await identifyTree(
      {
        image_uri: item.image_uri,
        time_series: item.payload.time_series,
        metadata: item.payload.metadata,
        farm_id: item.payload.farm_id,
        species_hint: item.payload.species_hint,
        radius_m: item.payload.radius_m,
        client_capture_id: item.client_capture_id, // idempotency (INV-07)
      },
      {
        base_url: item.base_url,
        api_key: item.api_key,
        enqueue_on_503: false, // already in queue
      },
    );
    if (result.ok) {
      succeeded += 1;
    } else {
      remaining.push({
        ...item,
        retry_count: item.retry_count + 1,
        last_error: result.error.detail,
      });
    }
  }

  await saveQueue(remaining);
  return { attempted: queue.length, succeeded, remaining: remaining.length };
}

export async function pendingQueueSize(): Promise<number> {
  return (await loadQueue()).length;
}
