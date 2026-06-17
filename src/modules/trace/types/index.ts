// modules/trace/types/index.ts
//
// Domain types thuộc về module Trace (truy xuất nông nghiệp).

export interface Farm {
  id: string;
  name: string;
  coordinates: { lat: number; lng: number }[];
  userId: string;
}

// ── Build 49 § tree_metadata ──────────────────────────────────────────────────
export type TreeVariety = 'ri6' | 'monthong' | 'musang_king' | 'other';

export type TreeHealthStatus =
  | 'healthy'
  | 'flowering'
  | 'fruiting'
  | 'pest_damage'
  | 'nutrient_deficiency'
  | 'diseased'
  | 'dry'
  | 'dead'
  | 'unknown';

export interface TreeMetadata {
  variety?: TreeVariety;
  variety_other?: string;
  age_years?: number;
  health_status?: TreeHealthStatus;
  last_harvest_date?: string;          // ISO date YYYY-MM-DD
  notes?: string;                       // ≤ 500 chars
  voice_memo_path?: string;             // file:// local URI
  voice_memo_duration_s?: number;
  voice_memo_recorded_at?: string;      // ISO8601
  updated_at: string;                   // ISO8601
  schema_version: 'tree_metadata/1.0';
}

export interface Tree {
  id: string;
  farmId: string;
  code: string;
  images: string[];
  estimatedFruits: number;
  fruitCount: number;
  latitude?: number;
  longitude?: number;
  species?: string;
  plantedYear?: number;
  scanData?: {
    treeIds: string[];
    confidence?: number;
    images?: string[];
  };
  metadata?: TreeMetadata;
  // Build 52 § A7 — Tree name farmer-friendly.
  // Optional fields cho UI hiển thị tên thân thiện thay vì raw UUID.
  display_index?: number;                      // Per-farm sequential ("Cây #3")
  farmer_name?: string;                        // User-set custom name
  location?: { lat: number; lng: number };     // Alt to latitude/longitude (paired form)
}

export interface Fruit {
  id: string;
  treeId: string;
  code: string;
  images: string[];
  status: 'growing' | 'mature' | 'near_ripe' | 'ripe' | 'harvested' | 'sold' | 'processed';
  /** Stable fruit identifier from ReID/backend (distinct from the local row id). */
  fruitId?: string;
  /** ISO timestamps populated when synced from backend; optional for local rows. */
  createdAt?: string;
  updatedAt?: string;
}

export interface Activity {
  id: string;
  type: 'watering' | 'fertilizing' | 'pesticide' | 'harvesting';
  farmId: string;
  treeId?: string;
  fruitId?: string;
  images: string[];
  videos: string[];
  timestamp: Date;
  creditsUsed: number;
}
