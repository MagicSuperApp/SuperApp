/**
 * Aladin Real API Client
 * Connects to actual backend (replaces mock API)
 */

import axios, { AxiosInstance } from 'axios';
import { Farm, Tree } from '../modules/trace/types';
import { ALADIN_API_URL, ALADIN_API_KEY } from '@env';

// API Envelope wrapper (§1.2)
interface ApiEnvelope<T> {
  status_code: number;
  message: string;
  error: any;
  data: T | null;
}

// Farm API models (§4)
// Build 54 (2026-05-18) — region_code became optional. Backend derives region
// from the boundary GeoJSON centroid. Caller passes 'auto' as a sentinel; older
// callers passing concrete region codes (e.g. 'vn-south-01') still work.
interface FarmCreateRequest {
  farm_id: string;
  owner_did: string;
  region_code?: string;
  farm_name?: string;
  boundary: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

interface GridConfigRequest {
  lon_origin: number;
  lat_origin: number;
  row_spacing: number;
  col_spacing: number;
}

// Tree API models (§5)
interface TreeCreateRequest {
  id: string;
  region_code: string;
  farm_id: string;
  geohash_7: string;
  latitude?: number;
  longitude?: number;
  row_idx?: number;
  col_idx?: number;
  metadata?: Record<string, any>;
}

// Base URL THẬT mà client farm/aladin đang dùng (đã bake lúc build từ ALADIN_API_URL).
// Export để màn debug hiện ra → field soi máy đang trỏ server nào (chẩn đoán 404 farm
// do build cũ/lệch env — Lỗi field #5).
export const API_BASE_URL = ALADIN_API_URL || 'http://localhost:8001';

class AladinAPIClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = API_BASE_URL;
    const apiKey = ALADIN_API_KEY || 'mock-local-api-key';

    this.client = axios.create({
      baseURL,
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    console.log('[AladinAPI] Initialized:', baseURL);

    // Add error interceptor for better debugging
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.code === 'ECONNABORTED') {
          console.error('[AladinAPI] Request timeout');
        } else if (error.message === 'Network Error') {
          console.error('[AladinAPI] Network error - check if API server is running and accessible');
          console.error('[AladinAPI] Current baseURL:', baseURL);
        }
        return Promise.reject(error);
      }
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // FARM APIs (§4)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * GET /farms - List farms
   */
  async getFarms(params?: {
    region_code?: string;
    owner_did?: string;
    limit?: number;
    offset?: number;
  }): Promise<Farm[]> {
    try {
      const response = await this.client.get<ApiEnvelope<{ items: any[] }>>('/farms', { params });
      const data = response.data.data;
      if (!data) throw new Error('No data in response');

      // Map backend Farm to app Farm type
      return data.items.map(f => ({
        id: f.farm_id,
        name: f.farm_name || f.farm_id,
        coordinates: this.parsePolygonToCoordinates(f.boundary),
        userId: f.owner_did,
      }));
    } catch (error: any) {
      console.error('[OriLifeAPI] getFarms error:', error.message);
      throw error;
    }
  }

  /**
   * POST /farms - Create farm
   */
  async createFarm(request: FarmCreateRequest): Promise<Farm> {
    try {
      const response = await this.client.post<ApiEnvelope<any>>('/farms', request);
      const data = response.data.data;
      if (!data) throw new Error('No data in response');

      return {
        id: data.farm_id,
        name: data.farm_name || data.farm_id,
        coordinates: this.parsePolygonToCoordinates(data.boundary),
        userId: data.owner_did,
      };
    } catch (error: any) {
      console.error('[OriLifeAPI] createFarm error:', error.message);
      throw error;
    }
  }

  /**
   * GET /farms/{farm_id} - Get farm detail
   */
  async getFarmById(farmId: string): Promise<Farm> {
    try {
      const response = await this.client.get<ApiEnvelope<any>>(`/farms/${farmId}`);
      const data = response.data.data;
      if (!data) throw new Error('No data in response');

      return {
        id: data.farm_id,
        name: data.farm_name || data.farm_id,
        coordinates: this.parsePolygonToCoordinates(data.boundary),
        userId: data.owner_did,
      };
    } catch (error: any) {
      console.error('[OriLifeAPI] getFarmById error:', error.message);
      throw error;
    }
  }

  /**
   * POST /farms/{farm_id}/grid-config - Set grid config
   */
  async setGridConfig(farmId: string, config: GridConfigRequest): Promise<void> {
    try {
      await this.client.post(`/farms/${farmId}/grid-config`, config);
      console.log('[OriLifeAPI] Grid config set for farm:', farmId);
    } catch (error: any) {
      console.error('[OriLifeAPI] setGridConfig error:', error.message);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // TREE APIs (§5)
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * POST /trees - Create tree
   */
  async createTree(request: TreeCreateRequest): Promise<Tree> {
    try {
      const response = await this.client.post<ApiEnvelope<any>>('/trees', request);
      const data = response.data.data;
      if (!data) throw new Error('No data in response');

      return {
        id: data.id,
        farmId: data.farm_id,
        code: data.id,
        images: [],
        estimatedFruits: 0,
        fruitCount: 0,
        latitude: data.latitude,
        longitude: data.longitude,
        species: data.metadata?.species,
        plantedYear: data.metadata?.planted_year,
      };
    } catch (error: any) {
      console.error('[OriLifeAPI] createTree error:', error.message);
      throw error;
    }
  }

  /**
   * GET /trees - List trees
   */
  async getTrees(params?: {
    farm_id?: string;
    region_code?: string;
    limit?: number;
    offset?: number;
  }): Promise<Tree[]> {
    try {
      const response = await this.client.get<ApiEnvelope<{ items: any[] }>>('/trees', { params });
      const data = response.data.data;
      if (!data) throw new Error('No data in response');

      return data.items.map(t => ({
        id: t.id,
        farmId: t.farm_id,
        code: t.id,
        images: [],
        estimatedFruits: 0,
        fruitCount: 0,
        latitude: t.latitude,
        longitude: t.longitude,
        species: t.metadata?.species,
        plantedYear: t.metadata?.planted_year,
      }));
    } catch (error: any) {
      console.error('[OriLifeAPI] getTrees error:', error.message);
      throw error;
    }
  }

  /**
   * GET /trees/{tree_id} - Get tree detail
   */
  async getTreeById(treeId: string): Promise<Tree> {
    try {
      const response = await this.client.get<ApiEnvelope<any>>(`/trees/${treeId}`);
      const data = response.data.data;
      if (!data) throw new Error('No data in response');

      return {
        id: data.id,
        farmId: data.farm_id,
        code: data.id,
        images: [],
        estimatedFruits: 0,
        fruitCount: 0,
        latitude: data.latitude,
        longitude: data.longitude,
        species: data.metadata?.species,
        plantedYear: data.metadata?.planted_year,
      };
    } catch (error: any) {
      console.error('[OriLifeAPI] getTreeById error:', error.message);
      throw error;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Parse GeoJSON Polygon to app coordinates format
   */
  private parsePolygonToCoordinates(boundary: any): { lat: number; lng: number }[] {
    try {
      if (boundary?.type === 'Polygon' && boundary.coordinates?.[0]) {
        return boundary.coordinates[0].map((coord: number[]) => ({
          lng: coord[0],
          lat: coord[1],
        }));
      }
      return [];
    } catch (error) {
      console.error('[AladinAPI] Failed to parse polygon:', error);
      return [];
    }
  }
}

// Singleton instance
const aladinAPI = new AladinAPIClient();

export default aladinAPI;

// Export types
export type { FarmCreateRequest, GridConfigRequest, TreeCreateRequest };
