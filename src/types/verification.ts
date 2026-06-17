/**
 * OriLife Verification Module - Type Definitions
 * MVP v1.3
 */

// ===== Domain Models =====
export interface Tree {
  id: string;
  farmId: string;
  location: {
    lat: number;
    lng: number;
    accuracy: number;
  };
  registeredAt: number;
  lastUpdated: number;
  status: 'healthy' | 'flagged' | 'unknown';
  metaHash?: string; // Hash từ PhoenixKey
}

export interface Fruit {
  id: string;
  treeId: string;
  farmId: string;
  status: 'unidentified' | 'identified' | 'harvested';
  estQuantity?: number;
  variants?: string[];
  capturedAt?: number;
  verificationResult?: VerificationResult;
}

export interface CaptureImage {
  id: string;
  fruitId?: string;
  treeId?: string;
  uri: string; // Local file path
  timestamp: number;
  quality: {
    laplacianVariance: number;
    isSharp: boolean;
  };
  sensor?: {
    accelerationMagnitude: number; // Độ lớn gia tốc
    isStable: boolean; // < 0.8
  };
}

// ===== Sync Queue & State Machine =====
export type SyncState = 'pending' | 'syncing' | 'verified' | 'error';

export interface QueueItem {
  id: string;
  type: 'metadata' | 'image';
  payload: any;
  priority: 'high' | 'normal' | 'low'; // metadata = high, images = normal
  syncState: SyncState;
  retryCount: number;
  lastError?: string;
  createdAt: number;
  updatedAt: number;
}

export interface SyncQueue {
  items: QueueItem[];
  totalPending: number;
  totalSyncing: number;
  isOnline: boolean;
  lastSyncAt?: number;
}

// ===== Verification Result (từ Backend) =====
export type VerificationStatus = 'MATCH' | 'NO_MATCH' | 'PENDING_VERIFICATION';

export interface VerificationResult {
  status: VerificationStatus;
  confidence: number; // 0-1
  matchedTreeId?: string;
  matchedFruitId?: string;
  metadata: {
    detectedAt: number;
    processedAt: number;
    modelVersion: string;
    signature?: string; // Từ PhoenixKey
  };
  suggestions?: {
    action: 'view_log' | 'register_new' | 'care_guide';
    label: string;
  }[];
}

// ===== PhoenixKey SDK Types =====
export interface WalletStatus {
  isActivated: boolean;
  magicCredits: number;
  lampTokens: number;
  adaBalance: number;
  address: string;
  lastUpdated: number;
}

export interface SignaturePayload {
  timestamp: number;
  data: Record<string, any>;
  nonce: string;
}

export interface SignedData {
  payload: SignaturePayload;
  signature: string;
  publicKey: string;
}

// ===== Error Types =====
export interface APIError {
  code: string;
  message: string;
  userMessage: string; // Localized message cho người dùng
  retryable: boolean;
  details?: Record<string, any>;
}

export interface CaptureError extends APIError {
  context: 'blur' | 'stability' | 'network' | 'gps' | 'signature' | 'storage';
}

// ===== Camera & Sensor Data =====
export interface CameraFrameData {
  confidence: number; // YOLO confidence
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  detectionClass?: string; // e.g., 'durian_fruit', 'durian_tree'
}

export interface SensorData {
  accelerationX: number;
  accelerationY: number;
  accelerationZ: number;
  timestamp: number;
}

// ===== Request/Response DTOs =====
export interface VerifyImageDTO {
  fruitId?: string;
  treeId: string;
  farmId: string;
  imageBase64: string;
  metadata: {
    capturedAt: number;
    location: {
      lat: number;
      lng: number;
      accuracy: number;
    };
    imageQuality: {
      laplacianVariance: number;
    };
  };
  signature: string; // Từ PhoenixKey.signData
}

export interface SyncBatchDTO {
  items: {
    type: 'metadata' | 'image';
    payload: any;
    signature: string;
  }[];
  timestamp: number;
  userAddress: string;
}

// ===== UI State =====
export interface VerificationScreenState {
  result: VerificationResult | null;
  isLoading: boolean;
  error: CaptureError | null;
  retryCount: number;
}

export interface DashboardScreenState {
  items: (Tree | Fruit)[];
  syncQueue: SyncQueue;
  isSyncing: boolean;
  showKillSwitch: boolean; // Khi > 100 bản ghi pending
  filter: 'all' | 'unidentified' | 'verified' | 'error';
}

export interface SmartCaptureScreenState {
  capturedImages: CaptureImage[];
  progressPercentage: number;
  targetImages: number;
  isCapturing: boolean;
  latestFrame?: CameraFrameData;
  error?: CaptureError;
  showManualOverride: boolean; // Sau 30s không detect
}
