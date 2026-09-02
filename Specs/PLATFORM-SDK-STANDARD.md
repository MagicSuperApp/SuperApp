# Platform SDK Standard v1.0

**Aladin SuperApp Platform — Internal Specification**
Phiên bản: 1.1.0 | Ngày: 2026-06-18 | Trạng thái: Draft

---

## Mục lục

1. [Tổng quan & mục tiêu](#1-tổng-quan--mục-tiêu)
2. [module.manifest.json v2 schema](#2-modulemanifestjson-v2-schema)
3. [TypeScript interface chuẩn](#3-typescript-interface-chuẩn)
4. [npm package structure](#4-npm-package-structure)
5. [Navigation contract](#5-navigation-contract)
6. [Backend contract](#6-backend-contract)
7. [Native module contract](#7-native-module-contract)
8. [Auto-sync pipeline](#8-auto-sync-pipeline)
9. [Platform registry](#9-platform-registry)
10. [Ví dụ implement — @orilife/trace-rn](#10-ví-dụ-implement--orilifetrace-rn)
11. [Checklist onboard platform mới](#11-checklist-onboard-platform-mới)
12. [Security constraints](#12-security-constraints)
13. [Changelog](#13-changelog)

---

## 1. Tổng quan & mục tiêu

### 1.1 Tại sao cần standard này

SuperApp hiện kéo 4 platform nội bộ vào cùng một shell app. Không có chuẩn chung dẫn tới:

- Mỗi platform tự đặt tên screen, tự quản navigation — xung đột route key khi compose.
- Backend URL hardcode trong platform code — không thể deploy đa tenant.
- Native module naming không nhất quán — link bị lỗi trên New Architecture.
- Không có pipeline tự động — sync phiên bản là thủ công, dễ bỏ sót.
- PII nằm rải rác nhiều layer — vi phạm INV-3 khi cần xóa.

Platform SDK Standard v1.0 (gọi tắt: **PSS-1**) giải quyết toàn bộ các vấn đề trên bằng một hợp đồng duy nhất mà mọi platform phải tuân thủ.

### 1.2 Ai đọc tài liệu này

| Vai trò | Mục đích đọc |
|---|---|
| Platform engineer | Biết export gì, đặt tên gì, viết manifest thế nào |
| SuperApp shell engineer | Biết cách mount platform, đọc registry |
| DevOps / CI engineer | Cấu hình Renovate, CI gate |
| Security reviewer | Kiểm tra INV-SEC, INV-3 compliance, Section 12 |
| Product lead | Biết billing hook hoạt động thế nào |

### 1.3 Scope áp dụng

**Áp dụng bắt buộc** với mọi package có prefix `@orilife/`, `@proofchat/`, `@aladinwork/`, `@lampnet/` khi package đó được import vào SuperApp shell.

Khi onboard tổ chức mới (org prefix mới), cần cập nhật đồng thời: whitelist regex trong `loadPlatformModules`, pattern trong JSON Schema `npmPackage`, `matchPackagePrefixes` trong Renovate config, và ALLOWED_PATTERN trong Section 12.

**Không áp dụng** với: thư viện util thuần (không có screen, không có native module), backend service riêng, Rust crate không qua UniFFI.

### 1.4 Bốn bất biến không thể vi phạm

| Mã | Tên | Ý nghĩa với platform |
|---|---|---|
| INV-1 | data-federation | Platform quản lý data store riêng. Không ghi trực tiếp vào store của platform khác. Giao tiếp qua contract event hoặc deep link. INV-1 được enforce ở JS layer; cần thêm keychain isolation ở native layer — xem Section 12. |
| INV-2 | experience layer | Platform chỉ export Screen component. Không tự tạo NavigationContainer, không tự render Tab bar. |
| INV-3 | PII erasable | Mọi PII phải qua `PiiVault` service. Không persist PII vào AsyncStorage trực tiếp. |
| INV-SEC | no-RCE | Không `eval()`, không dynamic require runtime, không WebView với `javaScriptEnabled` không có sandbox. `loadPlatformModules` dùng static import — xem Section 9.2. |

---

## 2. module.manifest.json v2 schema

### 2.1 JSON Schema đầy đủ

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://aladin.app/schemas/module-manifest-v2.json",
  "title": "ModuleManifest",
  "description": "Khai báo metadata của một platform module tích hợp vào Aladin SuperApp.",
  "type": "object",
  "required": [
    "manifestVersion",
    "moduleId",
    "displayName",
    "version",
    "npmPackage",
    "minPlatformVersion",
    "screens",
    "navigation",
    "capabilities",
    "peerDependencies"
  ],
  "additionalProperties": false,
  "properties": {

    "manifestVersion": {
      "type": "integer",
      "const": 2,
      "description": "Phiên bản schema manifest. Phải là 2 cho PSS-1."
    },

    "moduleId": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9]*\\.[a-z][a-z0-9]*$",
      "description": "Định danh duy nhất toàn platform. Dạng 'org.product', ví dụ: 'orilife.trace'. Không thay đổi sau khi publish."
    },

    "displayName": {
      "type": "string",
      "minLength": 1,
      "maxLength": 50,
      "pattern": "^[^<>\"'\\\\]+$",
      "description": "Tên hiển thị người dùng nhìn thấy trong app. Không được chứa ký tự HTML đặc biệt. Ví dụ: 'Truy xuất OriLife'."
    },

    "version": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-((?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\\.(?:0|[1-9]\\d*|\\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$",
      "description": "Semantic version của platform package. Được tự động sync từ package.json bởi prepack script — không sửa tay."
    },

    "npmPackage": {
      "type": "string",
      "pattern": "^@(orilife|proofchat|aladinwork|lampnet)/[a-z][a-z0-9-]+-rn$",
      "description": "Tên npm package chính xác. Org prefix phải nằm trong whitelist. Ví dụ: '@orilife/trace-rn'."
    },

    "minPlatformVersion": {
      "type": "string",
      "pattern": "^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)$",
      "description": "Phiên bản SuperApp shell tối thiểu cần thiết. Platform sẽ không load nếu shell version thấp hơn."
    },

    "screens": {
      "type": "array",
      "minItems": 1,
      "description": "Danh sách tất cả màn hình platform export. Mỗi screen name phải là unique toàn SuperApp.",
      "items": {
        "type": "object",
        "required": ["name", "exportKey", "title"],
        "additionalProperties": false,
        "properties": {
          "name": {
            "type": "string",
            "pattern": "^[A-Z][a-zA-Z0-9]+Screen$",
            "description": "Tên route dùng trong navigation. Bắt buộc kết thúc bằng 'Screen'. Ví dụ: 'FarmDashboardScreen'."
          },
          "exportKey": {
            "type": "string",
            "description": "Key trong object screens export từ index.ts. Phải khớp với tên property."
          },
          "title": {
            "type": "string",
            "description": "Tiêu đề header mặc định của màn hình."
          },
          "requiresAuth": {
            "type": "boolean",
            "default": true,
            "description": "Nếu true, SuperApp shell kiểm tra session trước khi navigate tới screen này."
          },
          "containsPii": {
            "type": "boolean",
            "default": false,
            "description": "Đánh dấu màn hình render PII. Shell dùng để enforce screen capture restriction (INV-3)."
          },
          "deepLinkPath": {
            "type": "string",
            "pattern": "^/[a-z][a-z0-9/-]*$",
            "description": "Path deep link tương đối. Validate script kiểm tra thêm semantic path traversal (path.normalize). Ví dụ: '/trace/farm'."
          }
        }
      }
    },

    "navigation": {
      "type": "object",
      "required": ["routes"],
      "additionalProperties": false,
      "description": "Khai báo cách platform tham gia vào navigation cây của SuperApp.",
      "properties": {
        "tab": {
          "type": "object",
          "required": ["label", "icon", "screenName"],
          "additionalProperties": false,
          "description": "Nếu platform muốn có tab trong Bottom Tab Bar. Bỏ qua nếu platform không có tab.",
          "properties": {
            "label": {
              "type": "string",
              "maxLength": 15,
              "description": "Nhãn tab. Ngắn, tối đa 15 ký tự."
            },
            "icon": {
              "type": "string",
              "pattern": "^[a-z][a-z0-9-]+$",
              "description": "Tên icon từ thư viện MaterialCommunityIcons. Chỉ chứa chữ thường và dấu gạch ngang. Ví dụ: 'leaf'. SuperApp shell KHÔNG dùng field này làm dynamic require path."
            },
            "screenName": {
              "type": "string",
              "description": "Tên screen mở khi tap vào tab. Phải có trong mảng screens[]."
            },
            "tabIndex": {
              "type": "integer",
              "minimum": 0,
              "maximum": 9,
              "description": "Vị trí tab mong muốn. SuperApp có quyền điều chỉnh nếu xung đột."
            }
          }
        },
        "routes": {
          "type": "array",
          "description": "Tất cả route platform khai báo. SuperApp đăng ký vào Stack Navigator.",
          "items": {
            "type": "object",
            "required": ["screenName", "presentation"],
            "additionalProperties": false,
            "properties": {
              "screenName": {
                "type": "string",
                "description": "Phải có trong mảng screens[]."
              },
              "presentation": {
                "type": "string",
                "enum": ["card", "modal", "transparentModal"],
                "description": "Kiểu transition. SuperApp dùng @react-navigation/stack (JS stack), không phải native-stack. 'containedModal' không được hỗ trợ."
              },
              "gestureEnabled": {
                "type": "boolean",
                "default": true
              },
              "headerShown": {
                "type": "boolean",
                "default": true
              }
            }
          }
        }
      }
    },

    "capabilities": {
      "type": "array",
      "description": "Runtime permission platform cần. SuperApp xin permission trước khi khởi động platform.",
      "items": {
        "type": "string",
        "enum": [
          "camera",
          "gps",
          "storage",
          "microphone",
          "biometric",
          "notifications",
          "bluetooth",
          "nfc",
          "contacts"
        ]
      },
      "uniqueItems": true
    },

    "nativeModules": {
      "type": "array",
      "description": "Khai báo TurboModule platform đóng gói. Bắt buộc điền nếu platform có native code.",
      "items": {
        "type": "object",
        "required": ["moduleName", "iosClassName", "androidPackage", "keychainAccessGroup"],
        "additionalProperties": false,
        "properties": {
          "moduleName": {
            "type": "string",
            "pattern": "^[A-Z][a-zA-Z0-9]+$",
            "description": "Tên TurboModule. Ví dụ: 'ScannerSDK'. Phải khớp với tên trong NativeModules.<name>."
          },
          "iosClassName": {
            "type": "string",
            "description": "Tên class Objective-C/Swift. Ví dụ: 'RCTScannerSDKModule'."
          },
          "androidPackage": {
            "type": "string",
            "description": "Fully-qualified Java/Kotlin class. Ví dụ: 'com.orilife.trace.ScannerSDKModule'."
          },
          "keychainAccessGroup": {
            "type": "string",
            "pattern": "^com\\.aladin\\.[a-z][a-z0-9]*$",
            "description": "Keychain access group riêng của module. Bắt buộc để isolate keychain/SharedPreferences giữa các native module. Ví dụ: 'com.aladin.orilife'. CI semgrep sẽ audit iOS/Android code xác nhận chỉ dùng group này."
          },
          "isOptional": {
            "type": "boolean",
            "default": false,
            "description": "Nếu true, platform graceful degrade khi module không tồn tại (simulator, web preview)."
          },
          "specFile": {
            "type": "string",
            "description": "Đường dẫn tương đối tới file NativeXxx.ts (TurboModule spec). Bắt buộc khi nativeModules không rỗng. Ví dụ: 'src/native/NativeScannerSDK.ts'."
          }
        }
      }
    },

    "backendContracts": {
      "type": "object",
      "required": ["baseUrlEnvKey", "authType"],
      "additionalProperties": false,
      "description": "Khai báo backend mà platform gọi. SuperApp inject env vars khi bundle.",
      "properties": {
        "baseUrlEnvKey": {
          "type": "string",
          "pattern": "^[A-Z][A-Z0-9_]+_API_URL$",
          "description": "Tên biến môi trường chứa base URL. Quy ước: SCREAMING_SNAKE, kết thúc _API_URL. Ví dụ: 'ORILIFE_TRACE_API_URL'."
        },
        "authType": {
          "type": "string",
          "enum": ["bearer-jwt", "api-key", "mtls", "none"],
          "description": "Cơ chế xác thực. Platform không tự hardcode token — nhận từ SuperApp auth service."
        },
        "authTokenEnvKey": {
          "type": "string",
          "description": "Chỉ dùng khi authType='api-key'. Tên env var chứa key. Chú ý: tên biến (không phải giá trị) nằm trong manifest và publish lên npm — không dùng tên có nghĩa nhạy cảm."
        },
        "wsUrlEnvKey": {
          "type": "string",
          "pattern": "^[A-Z][A-Z0-9_]+_WS_URL$",
          "description": "Tên biến môi trường chứa WebSocket URL. Ví dụ: 'PROOFCHAT_CHAT_WS_URL'. Chỉ khai báo khi platform dùng WebSocket."
        },
        "endpoints": {
          "type": "array",
          "description": "Khai báo endpoint để SuperApp có thể preflight check và rate-limit policy.",
          "items": {
            "type": "object",
            "required": ["id", "method", "path", "containsPii"],
            "additionalProperties": false,
            "properties": {
              "id": {
                "type": "string",
                "description": "Định danh endpoint. Ví dụ: 'tree.identify'."
              },
              "method": {
                "type": "string",
                "enum": ["GET", "POST", "PUT", "PATCH", "DELETE"]
              },
              "path": {
                "type": "string",
                "description": "Path tương đối. Có thể chứa path param dạng {id}. Ví dụ: '/trees/{treeId}/identify'."
              },
              "containsPii": {
                "type": "boolean",
                "description": "Nếu true, request/response log phải qua PII masking trước khi ghi."
              },
              "rateLimit": {
                "type": "object",
                "properties": {
                  "maxPerMinute": { "type": "integer", "minimum": 1 }
                }
              }
            }
          }
        }
      }
    },

    "billingHooks": {
      "type": "array",
      "description": "Sự kiện tính phí platform phát ra. SuperApp intercept và ghi vào billing ledger.",
      "items": {
        "type": "object",
        "required": ["event", "unit", "valueBased"],
        "additionalProperties": false,
        "properties": {
          "event": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9]*\\.[a-z][a-z0-9.]*$",
            "description": "Tên sự kiện. Ví dụ: 'tree.identify'. emitBillingEvent sẽ reject event name không có trong mảng này."
          },
          "unit": {
            "type": "string",
            "pattern": "^[a-z][a-z0-9_]+$",
            "description": "Đơn vị tính phí — free string theo pattern snake_case. Ví dụ: 'per_call', 'per_tree', 'per_user_month'. Business rule validate ở billing service layer."
          },
          "valueBased": {
            "type": "boolean",
            "description": "Nếu true, event payload phải có field 'amount' (number) và 'currency' (ISO 4217). Billing service cross-check amount với backend transaction log qua requestId."
          },
          "description": {
            "type": "string",
            "description": "Mô tả cho billing dashboard."
          }
        }
      }
    },

    "peerDependencies": {
      "type": "object",
      "description": "Khai báo peer dep platform cần, để SuperApp kiểm tra trước khi load. Key là package name, value là semver range.",
      "additionalProperties": {
        "type": "string"
      },
      "examples": [
        {
          "react-native": ">=0.84.1",
          "react": ">=18.3.0",
          "@react-navigation/native": ">=6.0.0"
        }
      ]
    },

    "featureFlags": {
      "type": "object",
      "description": "Feature flag platform đọc từ SuperApp config store.",
      "propertyNames": {
        "pattern": "^[A-Z][A-Z0-9_]+$",
        "description": "Key chỉ chứa chữ hoa, số, dấu gạch dưới — tránh injection khi dùng trong template string."
      },
      "additionalProperties": {
        "type": "object",
        "required": ["default", "description"],
        "properties": {
          "default": { "type": ["boolean", "string", "number"] },
          "description": { "type": "string" }
        }
      }
    }
  }
}
```

### 2.2 Quy tắc validation bổ sung (không encode được trong JSON Schema)

Các ràng buộc sau được kiểm tra bởi `scripts/validate-manifest.js` trong bước `prepack`:

- Mọi `screenName` trong `navigation.tab` và `navigation.routes[].screenName` phải xuất hiện trong `screens[].name`.
- `version` trong manifest được tự động sync từ `package.json` bởi prepack script — không validate strict equality thủ công nữa (xem Section 4.2).
- Nếu `authType` là `api-key`, trường `authTokenEnvKey` là bắt buộc.
- Nếu `nativeModules` không rỗng, mỗi entry phải có `specFile` (file phải tồn tại tại đường dẫn đó).
- Mỗi `deepLinkPath`: `path.normalize(value) === value` — chặn semantic path traversal (`/../`).
- Mọi `billingHooks[].event` phải là unique trong mảng.

Pseudocode kiểm tra cross-field `screenName`:

```javascript
// scripts/validate-manifest.js (đoạn cross-field check)
const screenNames = new Set(manifest.screens.map(s => s.name));

for (const route of manifest.navigation.routes) {
  if (!screenNames.has(route.screenName)) {
    throw new Error(`routes[].screenName '${route.screenName}' không có trong screens[]`);
  }
}
if (manifest.navigation.tab) {
  if (!screenNames.has(manifest.navigation.tab.screenName)) {
    throw new Error(`navigation.tab.screenName '${manifest.navigation.tab.screenName}' không có trong screens[]`);
  }
}

// deepLinkPath semantic check
const path = require('path');
for (const screen of manifest.screens) {
  if (screen.deepLinkPath) {
    const normalized = path.normalize(screen.deepLinkPath);
    if (normalized !== screen.deepLinkPath) {
      throw new Error(`deepLinkPath '${screen.deepLinkPath}' không hợp lệ (path traversal)`);
    }
  }
}
```

---

## 3. TypeScript interface chuẩn

### 3.1 Quy tắc export từ `index.ts`

`index.ts` (entry point của package) **bắt buộc** export 4 thứ: `screens`, `manifest`, `services`, và các `types`.

Platform chỉ có UI thuần (không cung cấp service cross-platform) vẫn phải export `services` với object rỗng nhưng typed đúng — xem ví dụ Section 10.

```typescript
// index.ts — bắt buộc export đủ 4 nhóm sau

// 1. Screens object — key phải khớp với screens[].exportKey trong manifest
export { screens } from './src/screens';

// 2. Manifest — typed, không phải raw JSON import
export { manifest } from './src/manifest';

// 3. Services — business logic mà SuperApp hoặc platform khác có thể gọi
//    Platform chỉ có UI: export services = { moduleId: 'xxx.yyy' } as const
export { services } from './src/services';

// 4. Types — shared types SuperApp cần để type-check khi dùng platform
export type {
  PlatformModule,
  ScreensMap,
  ManifestV2,
  ServiceRegistry,
  BillingEvent,
  PlatformError,
} from './src/types';
```

### 3.2 Interface định nghĩa chi tiết

```typescript
// src/types/index.ts

import type { ComponentType } from 'react';
import type { StackScreenProps } from '@react-navigation/stack';

// --- Manifest types ---

export interface ManifestV2 {
  manifestVersion: 2;
  moduleId: string;
  displayName: string;
  version: string;
  npmPackage: string;
  minPlatformVersion: string;
  screens: ScreenDeclaration[];
  navigation: NavigationDeclaration;
  capabilities: Capability[];
  nativeModules?: NativeModuleDeclaration[];
  backendContracts?: BackendContractDeclaration;
  billingHooks?: BillingHookDeclaration[];
  peerDependencies: Record<string, string>;
  featureFlags?: Record<string, FeatureFlagDeclaration>;
}

export interface ScreenDeclaration {
  name: string;
  exportKey: string;
  title: string;
  requiresAuth?: boolean;
  containsPii?: boolean;
  deepLinkPath?: string;
}

export interface NavigationDeclaration {
  tab?: TabDeclaration;
  routes: RouteDeclaration[];
}

export interface TabDeclaration {
  label: string;
  icon: string;
  screenName: string;
  tabIndex?: number;
}

export interface RouteDeclaration {
  screenName: string;
  // SuperApp dùng @react-navigation/stack (JS stack).
  // 'containedModal' chỉ có trong native-stack — không dùng ở đây.
  presentation: 'card' | 'modal' | 'transparentModal';
  gestureEnabled?: boolean;
  headerShown?: boolean;
}

export type Capability =
  | 'camera' | 'gps' | 'storage' | 'microphone'
  | 'biometric' | 'notifications' | 'bluetooth' | 'nfc' | 'contacts';

export interface NativeModuleDeclaration {
  moduleName: string;
  iosClassName: string;
  androidPackage: string;
  keychainAccessGroup: string;   // bắt buộc — xem Section 12
  isOptional?: boolean;
  specFile?: string;
}

export interface BackendContractDeclaration {
  baseUrlEnvKey: string;
  authType: 'bearer-jwt' | 'api-key' | 'mtls' | 'none';
  authTokenEnvKey?: string;
  wsUrlEnvKey?: string;          // thêm: hỗ trợ WebSocket
  endpoints?: EndpointDeclaration[];
}

export interface EndpointDeclaration {
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  containsPii: boolean;
  rateLimit?: { maxPerMinute: number };
}

export interface BillingHookDeclaration {
  event: string;
  unit: string;                  // free string — validate business rule ở billing service
  valueBased: boolean;
  description?: string;
}

export interface FeatureFlagDeclaration {
  default: boolean | string | number;
  description: string;
}

// --- Screen component types ---

// SuperApp dùng @react-navigation/stack — platform dùng StackScreenProps
export type PlatformScreenProps<
  RootParamList extends Record<string, object | undefined>,
  RouteName extends keyof RootParamList,
> = StackScreenProps<RootParamList, RouteName>;

export type ScreensMap<RootParamList extends Record<string, object | undefined>> = {
  [K in keyof RootParamList]?: ComponentType<StackScreenProps<RootParamList, K>>;
};

// --- Service registry ---

// Generic để platform tự khai báo typed methods
export interface ServiceRegistry<
  T extends Record<string, (...args: never[]) => unknown> = Record<string, never>
> {
  readonly moduleId: string;
}

// Platform khai báo service cụ thể bằng cách extend ServiceRegistry<T>:
// export interface TraceServiceRegistry extends ServiceRegistry<{
//   identifyTree(imageBase64: string): Promise<TreeIdentifyResult>;
//   listFarms(): Promise<FarmSummary[]>;
// }> {}

// --- Billing event (phát ra từ platform code) ---

export interface BillingEvent {
  event: string;              // phải khớp với billingHooks[].event trong manifest
  // moduleId KHÔNG do platform điền — SDK tự inject từ manifest đã load
  userId: string;             // từ SuperApp auth context
  timestamp: number;          // Unix ms
  idempotencyKey: string;     // bắt buộc — format: '<requestId>-<event>', TTL 24h dedup phía server
  metadata?: Record<string, unknown>;
  // Chỉ có khi valueBased = true
  amount?: number;
  currency?: string;          // ISO 4217
}

// --- Error envelope chuẩn ---

export interface PlatformError {
  code: string;               // dạng 'MODULE_ID.ERROR_CODE', ví dụ: 'orilife.trace.SCAN_FAILED'
  message: string;
  retryable: boolean;
  httpStatus?: number;
  requestId?: string;
}

// --- PlatformModule — type tổng hợp SuperApp dùng để load platform ---

export interface PlatformModule<
  S extends ScreensMap<Record<string, object | undefined>> = ScreensMap<Record<string, object | undefined>>,
  Svc extends ServiceRegistry = ServiceRegistry,
> {
  manifest: ManifestV2;
  screens: S;
  services: Svc;
}
```

### 3.3 SDK helper utilities (platform import từ `@aladin/platform-sdk`)

```typescript
import {
  emitBillingEvent,        // gọi khi sự kiện tính phí xảy ra
  usePiiVault,             // hook để read/write/erase PII (INV-3)
  usePlatformAuth,         // hook lấy JWT token từ SuperApp auth context
  usePlatformCapability,   // hook kiểm tra & xin permission trước khi dùng capability
  PlatformErrorBoundary,   // component bao quanh screen để catch lỗi
} from '@aladin/platform-sdk';

// Đọc env var qua react-native-dotenv (cơ chế thực tế của SuperApp)
import { ORILIFE_TRACE_API_URL } from '@env';
```

**Quan trọng:** SuperApp dùng `react-native-dotenv` với Babel transform. Platform đọc env var qua `import { VAR } from '@env'` — không dùng `process.env.*` hoặc `usePlatformConfig().get()`. Quy ước đặt tên biến giữ nguyên (SCREAMING_SNAKE kết thúc `_API_URL`), nhưng cơ chế inject là compile-time Babel transform.

---

## 4. npm package structure

### 4.1 Cấu trúc thư mục bắt buộc

```
@org/product-rn/
├── src/
│   ├── screens/
│   │   ├── index.ts          # export screens object
│   │   └── [ScreenName]/
│   │       ├── index.tsx
│   │       └── [ScreenName].tsx
│   ├── services/
│   │   └── index.ts          # export services object
│   ├── native/               # chỉ có nếu có native module
│   │   └── NativeXxx.ts      # TurboModule spec
│   ├── types/
│   │   └── index.ts          # export types
│   └── manifest.ts           # export manifest (typed ManifestV2)
├── lib/                      # output của tsc --outDir lib (không commit, tạo khi build)
│   ├── index.js
│   └── index.d.ts
├── android/                  # chỉ có nếu có native module
├── ios/                      # chỉ có nếu có native module
├── module.manifest.json      # file JSON gốc (validate bằng schema)
├── index.ts                  # entry point — chỉ re-export từ src/
├── package.json
└── tsconfig.json
```

### 4.2 package.json — các field bắt buộc

```jsonc
{
  "name": "@orilife/trace-rn",
  "version": "0.3.0",

  // Entry points — thứ tự ưu tiên:
  // Metro bundler: đọc "react-native" trước (raw TypeScript, transpile on-the-fly)
  // Node.js (CI scripts, Jest): đọc "main" → compiled JS
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "react-native": "./src/index.ts",

  // exports map — Metro 0.83 nhìn condition "react-native" trước tiên
  "exports": {
    ".": {
      "react-native": "./src/index.ts",
      "import": "./lib/index.js",
      "require": "./lib/index.js",
      "types": "./lib/index.d.ts"
    },
    "./types": {
      "types": "./src/types/index.ts"
    },
    "./manifest": {
      "react-native": "./src/manifest.ts",
      "import": "./lib/manifest.js",
      "require": "./lib/manifest.js",
      "types": "./lib/manifest.d.ts"
    }
  },

  // Bắt buộc với mọi package có TurboModule (RN 0.84 New Architecture)
  // Thiếu field này: react-native-codegen không sinh native glue code,
  // module sẽ không link được trên cả Android và iOS.
  "codegenConfig": {
    "name": "OriLifeTraceSpec",
    "type": "modules",
    "jsSrcsDir": "src/native",
    "android": {
      "javaPackageName": "com.orilife.trace"
    }
  },

  "peerDependencies": {
    "react": ">=18.3.0",
    "react-native": ">=0.84.1",
    "@react-navigation/native": ">=6.0.0",
    "@react-navigation/stack": ">=7.0.0",
    "@aladin/platform-sdk": ">=1.0.0"
  },

  // chỉ publish những gì cần thiết
  "files": [
    "src/",
    "lib/",
    "android/",
    "ios/",
    "module.manifest.json",
    "index.ts"
  ],

  "aladinManifest": "./module.manifest.json",

  // Đánh giá sideEffects từng file — không set false blanket nếu có
  // AppRegistry.registerComponent hoặc initialization code
  "sideEffects": false,

  "scripts": {
    "build": "tsc --outDir lib --declaration --emitDeclarationOnly false",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ --ext .ts,.tsx",
    "test": "jest",
    // version hook: tự động sync manifest version khi chạy npm/yarn version
    "version": "node scripts/sync-manifest-version.js && git add module.manifest.json",
    // prepack: validate manifest + build lib trước khi publish
    "prepack": "node scripts/validate-manifest.js && yarn build"
  }
}
```

**Lưu ý `codegenConfig`:** Bắt buộc với mọi package có native module (khi `nativeModules` array không rỗng). Nếu package không có native module, bỏ qua field này.

**Lưu ý `sideEffects`:** Nếu package có file chứa side effect thực sự (AppRegistry, initialization), khai báo danh sách file cụ thể thay vì `false` blanket: `"sideEffects": ["./src/init.ts"]`.

### 4.3 Script sync manifest version

```javascript
// scripts/sync-manifest-version.js
const fs = require('fs');
const pkg = require('../package.json');
const manifest = require('../module.manifest.json');

if (manifest.version !== pkg.version) {
  console.log(`[sync] manifest.version: ${manifest.version} → ${pkg.version}`);
  manifest.version = pkg.version;
  fs.writeFileSync(
    './module.manifest.json',
    JSON.stringify(manifest, null, 2) + '\n'
  );
}
```

Chạy tự động khi `npm version patch/minor/major` qua npm lifecycle hook `version`. Renovate bump `package.json` xong, CI chạy `prepack` sẽ tự sync — không cần platform engineer commit tay.

### 4.4 Quy tắc đặt tên package

| Tổ chức | Prefix bắt buộc | Ví dụ |
|---|---|---|
| OriLife | `@orilife/` | `@orilife/trace-rn` |
| ProofChat | `@proofchat/` | `@proofchat/chat-rn` |
| AladinWork | `@aladinwork/` | `@aladinwork/work-rn` |
| LampNet | `@lampnet/` | `@lampnet/join-rn` |

Tên package **bắt buộc** kết thúc `-rn` để phân biệt với backend SDK hoặc Rust crate. Khi onboard org mới, cập nhật whitelist tại Section 1.3.

---

## 5. Navigation contract

### 5.1 Nguyên tắc cốt lõi (INV-2)

- **SuperApp sở hữu `NavigationContainer`** — chỉ có 1 duy nhất trong toàn app.
- **SuperApp dùng `@react-navigation/stack` (JS stack v7)** — không phải `@react-navigation/native-stack`. Platform phải dùng `StackScreenProps` từ `@react-navigation/stack`, không dùng `NativeStackScreenProps`.
- **Platform chỉ export Screen component** — không tự tạo Navigator, không tự gọi `useNavigationContainerRef`.
- **Platform không tự navigate giữa các platform khác** — dùng deep link scheme hoặc event bus.

### 5.2 Platform khai báo screens

```typescript
// src/screens/index.ts trong @orilife/trace-rn

import type { ScreensMap } from '@aladin/platform-sdk';
import type { OriLifeStackParamList } from '../types/navigation';

import FarmDashboardScreen from './FarmDashboard';
import TreeDetailScreen from './TreeDetail';
import ScanScreen from './Scan';

export const screens: ScreensMap<OriLifeStackParamList> = {
  FarmDashboardScreen,
  TreeDetailScreen,
  ScanScreen,
};
```

```typescript
// src/types/navigation.ts trong @orilife/trace-rn

export type OriLifeStackParamList = {
  FarmDashboardScreen: undefined;
  TreeDetailScreen: { treeId: string };
  ScanScreen: { mode: 'quick' | 'full' };
};
```

### 5.3 SuperApp mount platform screens

```typescript
// SuperApp shell — PlatformLoader.tsx
// Dùng @react-navigation/stack (JS stack), không phải native-stack

import { createStackNavigator } from '@react-navigation/stack';
import type { RootStackParamList } from './navigation/types';
import { PLATFORM_MODULES } from './registry';

const Stack = createStackNavigator<RootStackParamList>();

export function PlatformScreens() {
  return (
    <>
      {PLATFORM_MODULES.flatMap(({ manifest, screens }) =>
        manifest.navigation.routes.map((route) => {
          const ScreenComponent = screens[route.screenName];
          if (!ScreenComponent) return null;

          return (
            <Stack.Screen
              key={`${manifest.moduleId}.${route.screenName}`}
              name={route.screenName as keyof RootStackParamList}
              component={ScreenComponent}
              options={{
                presentation: route.presentation,
                gestureEnabled: route.gestureEnabled ?? true,
                headerShown: route.headerShown ?? true,
              }}
            />
          );
        })
      )}
    </>
  );
}
```

### 5.4 RootStackParamList trong SuperApp — conflict-safe merge

TypeScript intersection với key trùng trả về `never` (silent), không báo lỗi compile. Dùng `MergeParamLists` để phát hiện sớm:

```typescript
// SuperApp — navigation/types.ts

import type { OriLifeStackParamList } from '@orilife/trace-rn';
import type { ProofChatStackParamList } from '@proofchat/chat-rn';
import type { AladinWorkStackParamList } from '@aladinwork/work-rn';
import type { LampNetStackParamList } from '@lampnet/join-rn';

// Helper type: báo lỗi compile rõ ràng nếu 2 platform dùng cùng screen name
type MergeParamLists<A, B> =
  keyof A & keyof B extends never
    ? A & B
    : { readonly __SCREEN_NAME_CONFLICT__: keyof A & keyof B };
    // Nếu có conflict → RootStackParamList chứa __SCREEN_NAME_CONFLICT__ key
    // → tất cả navigator call fail → CI typecheck báo lỗi rõ ràng

type Step1 = MergeParamLists<OriLifeStackParamList, ProofChatStackParamList>;
type Step2 = MergeParamLists<Step1, AladinWorkStackParamList>;
export type RootStackParamList = MergeParamLists<Step2, LampNetStackParamList>;
```

CI cũng chạy `scripts/check-screen-name-conflicts.js` trước typecheck để báo lỗi rõ hơn:

```javascript
// scripts/check-screen-name-conflicts.js
const modules = require('./src/registry/static-manifest-index.js');

const allNames = [];
for (const { manifest } of modules) {
  for (const screen of manifest.screens) {
    const dup = allNames.find(n => n.name === screen.name);
    if (dup) {
      console.error(
        `CONFLICT: screen '${screen.name}' khai báo bởi cả '${dup.moduleId}' và '${manifest.moduleId}'`
      );
      process.exit(1);
    }
    allNames.push({ name: screen.name, moduleId: manifest.moduleId });
  }
}
console.log('Screen name check: OK');
```

### 5.5 Điều hướng giữa các platform

Platform **không được** import screen component hoặc navigation type từ platform khác. Điều hướng cross-platform dùng deep link với scheme `lamp://`.

> ⚠️ **CHƯA CHẠY ĐƯỢC — đo 2026-08-17.** Câu cũ ở đây viết `(scheme thực tế đăng ký trong
> SuperApp)`. **Sai.** SuperApp KHÔNG đăng ký scheme nào ở tầng hệ điều hành:
> `ios/SuperApp/Info.plist:25-35` chỉ có scheme OAuth của Google;
> `android/app/src/main/AndroidManifest.xml` chỉ có intent-filter `MAIN`/`LAUNCHER`, không có
> `<data android:scheme>` nào. `prefixes` ở `src/navigation/index.tsx` chỉ nói cho React
> Navigation biết cách ĐỌC một URL đã tới tay app — nó KHÔNG bảo hệ điều hành gửi URL tới.
>
> Gốc: app CŨ `Legacy/Aladin_mobile` có đăng ký thật (`aladin`, xem Info.plist của nó). Đợt đổi
> tên scheme (§ nhật ký bản 1.1.0) sửa TÀI LIỆU, không sửa phần native, và app mới dựng lại từ
> đầu thì không mang theo. Nên `Linking.openURL('lamp://…')` hôm nay **thất bại im lặng**.
>
> Đoạn dưới là hợp đồng ĐÃ THIẾT KẾ, chưa phải hiện trạng. Đừng dựa vào nó để bỏ đường dự phòng.

```typescript
// Trong platform A, muốn mở screen của platform B
import { Linking } from 'react-native';

// Scheme lamp:// — khớp với prefixes trong SuperApp navigation/index.tsx
await Linking.openURL('lamp://proofchat-chat/rooms/123');
// Chú ý: host dùng hyphen (proofchat-chat), không dùng dấu chấm (proofchat.chat)
// vì một số Android webview version không xử lý đúng dấu chấm trong custom scheme host
```

Deep link scheme format: `lamp://<org>-<product>/<path>`. Ví dụ:
- `lamp://orilife-trace/farms/123`
- `lamp://proofchat-chat/rooms/456`

---

## 6. Backend contract

### 6.1 Env var naming convention

| Pattern | Ví dụ |
|---|---|
| `<SCREAMING_MODULE_ID>_API_URL` | `ORILIFE_TRACE_API_URL` |
| `<SCREAMING_MODULE_ID>_API_KEY` | chỉ khi authType=api-key |
| `<SCREAMING_MODULE_ID>_WS_URL` | nếu có WebSocket |

Platform đọc env var qua `react-native-dotenv`:

```typescript
// Platform đọc URL — cơ chế thực tế của SuperApp
import { ORILIFE_TRACE_API_URL } from '@env';
// Babel transform (react-native-dotenv) inject giá trị tại bundle time
// Không dùng process.env.* hoặc usePlatformConfig().get()
```

### 6.2 Auth header

Platform không tự quản lý token. SuperApp auth service inject Authorization header qua HTTP interceptor.

```typescript
import { createPlatformHttpClient } from '@aladin/platform-sdk';

// createPlatformHttpClient tự động:
// 1. Đọc baseUrl từ @env (react-native-dotenv)
// 2. Attach Bearer JWT từ auth context
// 3. Inject X-Request-ID header
// 4. Log request/response qua PII masking nếu endpoint containsPii=true
// 5. Không có certificate pinning mặc định — xem Section 12 để cấu hình thêm
const apiClient = createPlatformHttpClient('ORILIFE_TRACE_API_URL');
```

### 6.3 Error envelope format (bắt buộc từ backend)

Mọi error response từ backend phải trả về JSON envelope sau:

```json
{
  "error": {
    "code": "TREE_NOT_FOUND",
    "message": "Không tìm thấy cây với ID đã cung cấp.",
    "retryable": false,
    "requestId": "req_01J9XYZ..."
  }
}
```

Platform chuyển đổi thành `PlatformError`:

```typescript
{
  code: 'orilife.trace.TREE_NOT_FOUND',
  message: 'Không tìm thấy cây với ID đã cung cấp.',
  retryable: false,
  httpStatus: 404,
  requestId: 'req_01J9XYZ...'
}
```

### 6.4 WebSocket contract (dành cho @proofchat/chat-rn)

Backend dùng socket.io. Platform khai báo `wsUrlEnvKey` trong `backendContracts`:

```json
{
  "backendContracts": {
    "baseUrlEnvKey": "PROOFCHAT_CHAT_API_URL",
    "wsUrlEnvKey": "PROOFCHAT_CHAT_WS_URL",
    "authType": "bearer-jwt"
  }
}
```

Auth qua WS: gửi JWT trong `auth` option khi connect, không phải header (socket.io limitation). JWT cần refresh trước khi hết hạn — platform phải implement TTL refresh để tránh session hijacking khi WS session tồn tại lâu dài. Tham khảo `usePlatformAuth` hook trong `@aladin/platform-sdk` có sẵn `onTokenRefresh` callback.

---

## 7. Native module contract

### 7.1 Bắt buộc dùng TurboModule (New Architecture)

React Native 0.84.1 mặc định New Architecture. Platform **không được** dùng Native Modules cũ (NativeModules bridge). Bắt buộc implement TurboModule spec.

### 7.2 Naming convention

| Thành phần | Quy tắc | Ví dụ |
|---|---|---|
| Spec file | `NativeXxx.ts` trong `src/native/` | `NativeScannerSDK.ts` |
| TurboModule name | PascalCase, không prefix | `ScannerSDK` |
| iOS class | `RCT` + TurboModule name + `Module` | `RCTScannerSDKModule` |
| Android class | `com.<org>.<product>.` + TurboModule name + `Module` | `com.orilife.trace.ScannerSDKModule` |
| Android package | `com.<org>.<product>.` + TurboModule name + `Package` | `com.orilife.trace.ScannerSDKPackage` |
| Keychain access group | `com.aladin.<org>` | `com.aladin.orilife` |

### 7.3 TurboModule spec file

```typescript
// src/native/NativeScannerSDK.ts

import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  // Method async trả về Promise — phù hợp cho operation cần I/O hoặc thời gian đáng kể
  scan(options: {
    mode: string;
    timeoutMs: number;
  }): Promise<{
    treeId: string;
    confidence: number;
    rawData: string;
  }>;

  // Codegen RN 0.84 hỗ trợ sync method trả primitive — getVersion() có thể là sync
  // nếu chỉ đọc giá trị constant trong native. Dùng Promise khi cần async, string khi
  // giá trị đọc sync từ native constant.
  getVersion(): string;
}

export default TurboModuleRegistry.getEnforcing<Spec>('ScannerSDK');
```

### 7.4 Graceful degradation

Nếu `isOptional: true` trong manifest, platform phải có fallback:

```typescript
// src/native/ScannerSDKModule.ts

import type { Spec } from './NativeScannerSDK';
import { TurboModuleRegistry } from 'react-native';

// Fallback implementation cho simulator / web preview
// Chỉ implement đúng method trong Spec — không thêm addListener/removeListeners
// trừ khi Spec extends NativeEventEmitter (module phát events)
const mockScannerSDK: Spec = {
  scan: async () => ({
    treeId: 'mock-tree-001',
    confidence: 0.0,
    rawData: '',
  }),
  getVersion: () => '0.0.0-mock',
};

function getNativeModule(): Spec {
  try {
    const native = TurboModuleRegistry.get<Spec>('ScannerSDK');
    return native ?? mockScannerSDK;
  } catch {
    return mockScannerSDK;
  }
}

export const ScannerSDKModule = getNativeModule();
```

**Lưu ý:** `addListener(eventType: string): void` và `removeListeners(count: number): void` chỉ cần implement khi `Spec` extends `NativeEventEmitter` (module phát events về JS). Không thêm hai method này vào mock nếu module không emit events.

### 7.5 Rust/UniFFI binding (dành cho @lampnet/join-rn)

Rust code được wrap qua UniFFI, sau đó expose qua TurboModule. Cấu trúc:

```
lampnet-mobile-sdk (Rust crate)
    ↓ UniFFI bindgen (0.28+)
iOS: lampnet_mobile_sdk.swift + lampnet_mobile_sdk.modulemap
Android: lampnet_mobile_sdk.kt + .so
    ↓ Wrap trong TurboModule
NativeLampNetJoin.ts (TurboModule spec)
```

UniFFI 0.28 tự động xử lý memory safety — không cần manual pointer check. Các điểm cần chú ý thực sự khi tích hợp UniFFI với React Native:

1. **Tokio runtime:** Rust async function cần Tokio runtime được khởi tạo trước khi TurboModule gọi lần đầu. Khởi tạo trong `initialize()` của TurboModule native implementation.
2. **Build script Android:** Thêm bước `uniffi-bindgen generate` vào `build.gradle` trước khi compile Kotlin.
3. **Build script iOS:** XCFramework cần `.modulemap` cho Swift binding — thêm vào `Build Phases` của Xcode target.

CI step `audit-native-permissions` (semgrep) kiểm tra iOS/Android code chỉ dùng `keychainAccessGroup` đã khai báo trong manifest — xem Section 12.

---

## 8. Auto-sync pipeline

### 8.1 Renovate config trong SuperApp

```json
{
  "$schema": "https://docs.renovatebot.com/renovate-schema.json",
  "extends": ["config:base"],

  "packageRules": [
    {
      "description": "Platform packages — patch: tự merge sau CI (bao gồm no-breaking-change check), minor: tạo PR chờ review, major: chặn cần manual",
      "matchPackagePrefixes": [
        "@orilife/",
        "@proofchat/",
        "@aladinwork/",
        "@lampnet/"
      ],
      "groupName": "Aladin Platform Packages",
      "groupSlug": "aladin-platforms",

      "patch": {
        "automerge": true,
        "automergeType": "pr",
        "automergeStrategy": "squash",
        "requiredStatusChecks": [
          "ci/build",
          "ci/typecheck",
          "ci/manifest-validate",
          "ci/no-breaking-change",
          "ci/npm-provenance-verify"
        ]
      },

      "minor": {
        "automerge": false,
        "reviewers": ["team:platform-leads"],
        "labels": ["platform-update", "needs-review"]
      },

      "major": {
        "automerge": false,
        "enabled": true,
        "labels": ["platform-update", "breaking-change", "manual-required"],
        "reviewers": ["team:platform-leads", "team:superapp-core"]
      }
    }
  ],

  "schedule": ["after 10pm on weekdays", "before 5am on weekdays", "every weekend"],
  "timezone": "Asia/Ho_Chi_Minh",
  "prConcurrentLimit": 10,
  "prConcurrentLimitPerGroup": {
    "aladin-platforms": 10
  },
  "automergeSchedule": ["after 11pm", "before 4am"],
  "rebaseWhen": "conflicted"
}
```

**Về breaking change detection:** Rule `matchCurrentVersion: '/BREAKING/'` trong spec gốc sai — không có version string nào chứa chữ `BREAKING`. Thay bằng required status check `ci/no-breaking-change`. Script này gọi GitHub API `GET /repos/{owner}/{repo}/releases/latest` để parse release notes, hoặc đọc git log tìm commit có `BREAKING CHANGE:` footer (Conventional Commits):

```javascript
// scripts/check-no-breaking-change.js
const { execSync } = require('child_process');

// Tìm commit message của tag mới nhất so với tag trước
const log = execSync('git log $(git describe --tags --abbrev=0 HEAD^)..HEAD --format=%B').toString();

if (log.includes('BREAKING CHANGE:') || log.includes('BREAKING-CHANGE:')) {
  console.error('CI/no-breaking-change: Phát hiện BREAKING CHANGE trong commit history. Không auto-merge patch.');
  process.exit(1);
}
console.log('CI/no-breaking-change: OK');
```

### 8.2 CI gate — GitHub Actions

```yaml
# .github/workflows/platform-update-ci.yml

name: Platform Update CI Gate

on:
  pull_request:
    paths:
      - 'package.json'
      - 'yarn.lock'

jobs:
  detect-native-change:
    name: Detect if native code changed
    runs-on: ubuntu-latest
    outputs:
      has_native: ${{ steps.detect.outputs.has_native }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Detect native changes
        id: detect
        run: |
          if git diff --name-only origin/${{ github.base_ref }}...HEAD | grep -qE '^(android|ios)/'; then
            echo "has_native=true" >> $GITHUB_OUTPUT
          else
            echo "has_native=false" >> $GITHUB_OUTPUT
          fi

  check-screen-name-conflicts:
    name: Check screen name conflicts
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - name: Check for screen name conflicts
        run: node scripts/check-screen-name-conflicts.js

  validate-manifests:
    name: Validate platform manifests
    runs-on: ubuntu-latest
    needs: check-screen-name-conflicts
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'
      - run: yarn install --frozen-lockfile
      - name: Validate manifests
        run: node scripts/validate-all-manifests.js
      - name: Sync + check manifest versions
        run: node scripts/check-manifest-versions.js

  no-breaking-change:
    name: Check no breaking change in patch
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: node scripts/check-no-breaking-change.js

  npm-provenance-verify:
    name: Verify npm package provenance
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - name: Verify provenance
        run: node scripts/verify-package-provenance.js
        # Script kiểm tra platform packages có publish với --provenance flag (SLSA level 2)
        # npm: npm publish --provenance (bắt buộc từ PSS-1)

  typecheck:
    name: TypeScript check
    runs-on: ubuntu-latest
    needs: validate-manifests
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - run: yarn tsc --noEmit

  build-android:
    name: Android build check
    runs-on: ubuntu-latest
    needs: [typecheck, detect-native-change]
    if: needs.detect-native-change.outputs.has_native == 'true'
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - name: Build Android
        run: |
          cd android
          ./gradlew assembleRelease --no-daemon
        timeout-minutes: 20

  build-ios:
    name: iOS build check
    runs-on: macos-14
    needs: [typecheck, detect-native-change]
    if: needs.detect-native-change.outputs.has_native == 'true'
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - name: Pod install
        run: cd ios && pod install --repo-update
      - name: Build iOS
        run: |
          xcodebuild -workspace ios/SuperApp.xcworkspace \
            -scheme SuperApp \
            -configuration Release \
            -sdk iphonesimulator \
            -destination 'platform=iOS Simulator,name=iPhone 15' \
            build CODE_SIGNING_ALLOWED=NO
        timeout-minutes: 30

  audit-native-permissions:
    name: Audit native keychain access groups
    runs-on: ubuntu-latest
    needs: [typecheck, detect-native-change]
    if: needs.detect-native-change.outputs.has_native == 'true'
    steps:
      - uses: actions/checkout@v4
      - name: Run semgrep audit
        run: |
          pip install semgrep
          semgrep --config scripts/semgrep-keychain-rules.yml android/ ios/
        # semgrep-keychain-rules.yml: flag keychain/SharedPreferences access
        # không dùng keychainAccessGroup đã khai báo trong manifest

  manifest-compatibility:
    name: Check minPlatformVersion compatibility
    runs-on: ubuntu-latest
    needs: validate-manifests
    steps:
      - uses: actions/checkout@v4
      - run: yarn install --frozen-lockfile
      - name: Check platform version compatibility
        run: node scripts/check-platform-compatibility.js
```

### 8.3 Semver rules tóm tắt

| Loại update | Hành động | Điều kiện |
|---|---|---|
| `patch` (x.y.Z) | Auto-merge sau khi CI pass toàn bộ | Tất cả required status checks pass, bao gồm `ci/no-breaking-change` và `ci/npm-provenance-verify` |
| `minor` (x.Y.z) | Tạo PR, tag platform-leads, chờ review | CI pass, không auto-merge |
| `major` (X.y.z) | Tạo PR với label `manual-required` | Chờ 2 approve từ platform-leads + superapp-core |
| `prerelease` (x.y.z-alpha) | Không tạo PR (môi trường production) | Dùng Renovate config riêng cho staging nếu cần test canary build |

---

## 9. Platform registry

### 9.1 File registry.json

```json
{
  "registryVersion": "1.0",
  "platforms": [
    {
      "moduleId": "orilife.trace",
      "npmPackage": "@orilife/trace-rn",
      "status": "active",
      "addedAt": "2025-01-15",
      "ownedBy": "team-orilife",
      "contactSlack": "#orilife-trace-dev",
      "manifestChecksum": "sha256-<hash-of-module.manifest.json-at-registered-version>"
    },
    {
      "moduleId": "proofchat.chat",
      "npmPackage": "@proofchat/chat-rn",
      "status": "active",
      "addedAt": "2025-03-01",
      "ownedBy": "team-proofchat",
      "contactSlack": "#proofchat-dev",
      "manifestChecksum": "sha256-<hash>"
    },
    {
      "moduleId": "aladinwork.work",
      "npmPackage": "@aladinwork/work-rn",
      "status": "active",
      "addedAt": "2025-03-15",
      "ownedBy": "team-aladinwork",
      "contactSlack": "#aladinwork-dev",
      "manifestChecksum": "sha256-<hash>"
    },
    {
      "moduleId": "lampnet.join",
      "npmPackage": "@lampnet/join-rn",
      "status": "active",
      "addedAt": "2025-04-01",
      "ownedBy": "team-lampnet",
      "contactSlack": "#lampnet-dev",
      "manifestChecksum": "sha256-<hash>"
    }
  ]
}
```

`manifestChecksum`: SHA-256 của `module.manifest.json` tại version đăng ký. CI step `validate-manifests` verify checksum khớp với package thực tế trên npm — phát hiện registry.json bị tamper.

### 9.2 SuperApp load platform — static import (bắt buộc)

`import()` động với string biến không hoạt động trong Metro (Metro yêu cầu string literal tĩnh) và vi phạm INV-SEC. SuperApp dùng static import registry:

```typescript
// superapp/src/registry/index.ts
// Static import — Metro bundle tất cả tại compile time

import * as oriLifeTrace from '@orilife/trace-rn';
import * as proofchatChat from '@proofchat/chat-rn';
import * as aladinworkWork from '@aladinwork/work-rn';
import * as lampnetJoin from '@lampnet/join-rn';

import type { PlatformModule } from '@aladin/platform-sdk';
import registryJson from '../../platform-registry.json';

type RegistryEntry = {
  moduleId: string;
  npmPackage: string;
  status: 'active' | 'disabled' | 'deprecated';
  manifestChecksum: string;
};

// Map static: npmPackage → module object (không dùng dynamic import)
const STATIC_MODULE_MAP: Record<string, PlatformModule> = {
  '@orilife/trace-rn': oriLifeTrace as unknown as PlatformModule,
  '@proofchat/chat-rn': proofchatChat as unknown as PlatformModule,
  '@aladinwork/work-rn': aladinworkWork as unknown as PlatformModule,
  '@lampnet/join-rn': lampnetJoin as unknown as PlatformModule,
};

export function loadPlatformModules(): PlatformModule[] {
  const active = (registryJson.platforms as RegistryEntry[]).filter(
    (p) => p.status === 'active'
  );

  return active.flatMap(({ npmPackage, moduleId }) => {
    const mod = STATIC_MODULE_MAP[npmPackage];
    if (!mod) {
      console.error(`[Registry] Không tìm thấy static module cho '${npmPackage}'`);
      return [];
    }

    try {
      validateManifest(mod.manifest, moduleId);
      return [mod];
    } catch (err) {
      console.error(`[Registry] Không load được platform ${npmPackage}:`, err);
      return [];
    }
  });
}

// PLATFORM_MODULES: export sync, dùng trong PlatformLoader.tsx
export const PLATFORM_MODULES = loadPlatformModules();
```

```typescript
// superapp/src/registry/validateManifest.ts
import semver from 'semver';
import type { ManifestV2 } from '@aladin/platform-sdk';

// SUPERAPP_VERSION inject qua react-native-config hoặc babel-plugin-transform-inline-environment-variables
import { SUPERAPP_VERSION } from '@env';

export function validateManifest(manifest: ManifestV2, expectedModuleId: string): void {
  if (manifest.manifestVersion !== 2) {
    throw new Error(`Platform ${manifest.moduleId} dùng manifest v${manifest.manifestVersion}, yêu cầu v2.`);
  }

  if (manifest.moduleId !== expectedModuleId) {
    throw new Error(`manifest.moduleId '${manifest.moduleId}' không khớp registry entry '${expectedModuleId}'.`);
  }

  const shellVersion = SUPERAPP_VERSION ?? '0.0.0';
  if (!semver.satisfies(shellVersion, `>=${manifest.minPlatformVersion}`)) {
    throw new Error(
      `Platform ${manifest.moduleId} yêu cầu SuperApp >= ${manifest.minPlatformVersion}, hiện tại ${shellVersion}.`
    );
  }
}
```

**Lưu ý `semver`:** Dùng `semver` package ở đây là hợp lệ vì `validateManifest` chỉ chạy trong Node.js context (CI scripts). Trong React Native runtime, `SUPERAPP_VERSION` được inject qua Babel transform — `semver` không cần bundle vào app nếu validation chỉ cần ở build time. Nếu cần validate runtime, dùng `react-native-config` để inject `SUPERAPP_VERSION`.

### 9.3 Thêm platform mới vào registry

Platform team mở PR vào SuperApp repo, sửa **3 file**:

1. `platform-registry.json` — thêm entry mới (kèm `manifestChecksum`).
2. `package.json` — thêm package vào `dependencies`.
3. `src/registry/index.ts` — thêm static import và entry vào `STATIC_MODULE_MAP`.

PR này trigger CI gate đầy đủ. `CODEOWNERS` bắt buộc 2 approve từ `team:superapp-core` — xem Section 12.

---

## 10. Ví dụ implement — @orilife/trace-rn

### 10.1 package.json

```json
{
  "name": "@orilife/trace-rn",
  "version": "0.3.0",
  "description": "OriLife Trace platform module cho Aladin SuperApp",
  "main": "./lib/index.js",
  "types": "./lib/index.d.ts",
  "react-native": "./src/index.ts",
  "exports": {
    ".": {
      "react-native": "./src/index.ts",
      "import": "./lib/index.js",
      "require": "./lib/index.js",
      "types": "./lib/index.d.ts"
    },
    "./types": {
      "types": "./src/types/index.ts"
    },
    "./manifest": {
      "react-native": "./src/manifest.ts",
      "import": "./lib/manifest.js",
      "require": "./lib/manifest.js",
      "types": "./lib/manifest.d.ts"
    }
  },
  "codegenConfig": {
    "name": "OriLifeTraceSpec",
    "type": "modules",
    "jsSrcsDir": "src/native",
    "android": {
      "javaPackageName": "com.orilife.trace"
    }
  },
  "files": [
    "src/",
    "lib/",
    "android/",
    "ios/",
    "module.manifest.json",
    "index.ts"
  ],
  "aladinManifest": "./module.manifest.json",
  "sideEffects": false,
  "peerDependencies": {
    "react": ">=18.3.0",
    "react-native": ">=0.84.1",
    "@react-navigation/native": ">=6.0.0",
    "@react-navigation/stack": ">=7.0.0",
    "@aladin/platform-sdk": ">=1.0.0"
  },
  "scripts": {
    "build": "tsc --outDir lib --declaration",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/ --ext .ts,.tsx",
    "test": "jest",
    "version": "node scripts/sync-manifest-version.js && git add module.manifest.json",
    "prepack": "node scripts/validate-manifest.js && yarn build"
  }
}
```

### 10.2 module.manifest.json v2

```json
{
  "manifestVersion": 2,
  "moduleId": "orilife.trace",
  "displayName": "Truy xuất OriLife",
  "version": "0.3.0",
  "npmPackage": "@orilife/trace-rn",
  "minPlatformVersion": "1.0.0",

  "screens": [
    {
      "name": "FarmDashboardScreen",
      "exportKey": "FarmDashboardScreen",
      "title": "Nông trại của tôi",
      "requiresAuth": true,
      "containsPii": false,
      "deepLinkPath": "/trace/farms"
    },
    {
      "name": "TreeDetailScreen",
      "exportKey": "TreeDetailScreen",
      "title": "Chi tiết cây",
      "requiresAuth": true,
      "containsPii": false,
      "deepLinkPath": "/trace/trees"
    },
    {
      "name": "ScanScreen",
      "exportKey": "ScanScreen",
      "title": "Quét nhận dạng",
      "requiresAuth": true,
      "containsPii": false
    },
    {
      "name": "FieldReIDScreen",
      "exportKey": "FieldReIDScreen",
      "title": "Field Re-ID",
      "requiresAuth": true,
      "containsPii": true
    }
  ],

  "navigation": {
    "tab": {
      "label": "Trace",
      "icon": "leaf",
      "screenName": "FarmDashboardScreen",
      "tabIndex": 1
    },
    "routes": [
      { "screenName": "FarmDashboardScreen", "presentation": "card" },
      { "screenName": "TreeDetailScreen", "presentation": "card" },
      { "screenName": "ScanScreen", "presentation": "modal", "gestureEnabled": false },
      { "screenName": "FieldReIDScreen", "presentation": "modal", "gestureEnabled": false }
    ]
  },

  "capabilities": ["camera", "gps", "storage"],

  "nativeModules": [
    {
      "moduleName": "ScannerSDK",
      "iosClassName": "RCTScannerSDKModule",
      "androidPackage": "com.orilife.trace.ScannerSDKModule",
      "keychainAccessGroup": "com.aladin.orilife",
      "isOptional": false,
      "specFile": "src/native/NativeScannerSDK.ts"
    },
    {
      "moduleName": "PhoenixKeyModule",
      "iosClassName": "RCTPhoenixKeyModule",
      "androidPackage": "com.orilife.trace.PhoenixKeyModule",
      "keychainAccessGroup": "com.aladin.orilife",
      "isOptional": true,
      "specFile": "src/native/NativePhoenixKey.ts"
    }
  ],

  "backendContracts": {
    "baseUrlEnvKey": "ORILIFE_TRACE_API_URL",
    "authType": "bearer-jwt",
    "endpoints": [
      {
        "id": "tree.identify",
        "method": "POST",
        "path": "/trees/identify",
        "containsPii": false,
        "rateLimit": { "maxPerMinute": 30 }
      },
      {
        "id": "farm.list",
        "method": "GET",
        "path": "/farms",
        "containsPii": false
      },
      {
        "id": "field.reid",
        "method": "POST",
        "path": "/fields/{fieldId}/reid",
        "containsPii": true,
        "rateLimit": { "maxPerMinute": 10 }
      }
    ]
  },

  "billingHooks": [
    {
      "event": "tree.identify",
      "unit": "per_tree",
      "valueBased": false,
      "description": "Tính phí mỗi lần nhận dạng cây thành công"
    },
    {
      "event": "field.reid",
      "unit": "per_call",
      "valueBased": false,
      "description": "Tính phí mỗi lần chạy Field Re-ID"
    }
  ],

  "peerDependencies": {
    "react": ">=18.3.0",
    "react-native": ">=0.84.1",
    "@react-navigation/native": ">=6.0.0",
    "@react-navigation/stack": ">=7.0.0",
    "@aladin/platform-sdk": ">=1.0.0"
  },

  "featureFlags": {
    "TRACE_FIELD_REID_ENABLED": {
      "default": false,
      "description": "Bật tính năng Field Re-ID. Mặc định tắt chờ beta."
    },
    "TRACE_SCAN_QUICK_MODE": {
      "default": true,
      "description": "Dùng quick scan thay vì full scan để tiết kiệm pin."
    }
  }
}
```

### 10.3 src/index.ts

```typescript
// src/index.ts

export { screens } from './screens';
export { manifest } from './manifest';
export { services } from './services';

export type {
  OriLifeStackParamList,
  TraceServiceRegistry,
  TreeIdentifyResult,
  FarmSummary,
  FieldReIDResult,
} from './types';
```

```typescript
// src/manifest.ts
import type { ManifestV2 } from '@aladin/platform-sdk';
import rawManifest from '../module.manifest.json';

// prepack script validate JSON trước khi publish — cast an toàn ở đây
export const manifest = rawManifest as ManifestV2;
```

```typescript
// src/screens/index.ts
import type { ScreensMap } from '@aladin/platform-sdk';
import type { OriLifeStackParamList } from '../types/navigation';

import FarmDashboardScreen from './FarmDashboard';
import TreeDetailScreen from './TreeDetail';
import ScanScreen from './Scan';
import FieldReIDScreen from './FieldReID';

export const screens: ScreensMap<OriLifeStackParamList> = {
  FarmDashboardScreen,
  TreeDetailScreen,
  ScanScreen,
  FieldReIDScreen,
};
```

```typescript
// src/services/index.ts
import type { TraceServiceRegistry } from '../types';
import { createPlatformHttpClient, emitBillingEvent } from '@aladin/platform-sdk';

const apiClient = createPlatformHttpClient('ORILIFE_TRACE_API_URL');

export const services: TraceServiceRegistry = {
  moduleId: 'orilife.trace',

  async identifyTree(imageBase64: string) {
    const result = await apiClient.post('/trees/identify', { image: imageBase64 });

    // moduleId KHÔNG điền thủ công — SDK tự inject từ manifest
    // idempotencyKey bắt buộc để billing service dedup
    await emitBillingEvent({
      event: 'tree.identify',
      idempotencyKey: `${result.data.requestId}-tree.identify`,
    });

    return result.data;
  },

  async listFarms() {
    const result = await apiClient.get('/farms');
    return result.data;
  },
};
```

---

## 11. Checklist onboard platform mới

```
Bước 1 — Khởi tạo package
  □ Tạo npm package đúng tên @org/product-rn (org phải trong whitelist)
  □ Setup cấu trúc thư mục theo mục 4.1
  □ Cấu hình package.json đủ các field bắt buộc (mục 4.2), bao gồm codegenConfig
    nếu có native module

Bước 2 — Viết manifest v2
  □ Tạo module.manifest.json với manifestVersion: 2
  □ Điền đủ tất cả required fields theo schema mục 2.1
  □ Chạy validate-manifest.js cục bộ, không có lỗi schema
  □ Version tự động sync bởi prepack — không sửa tay

Bước 3 — Export TypeScript chuẩn
  □ src/index.ts export đủ: screens, manifest, services, types
  □ services export ít nhất { moduleId: 'org.product' } nếu không có cross-platform service
  □ Khai báo StackParamList riêng dùng StackScreenProps (@react-navigation/stack)
  □ Mọi screen name kết thúc bằng 'Screen'
  □ Chạy tsc --noEmit không có lỗi

Bước 4 — Native module (nếu có)
  □ Tạo TurboModule spec file NativeXxx.ts trong src/native/
  □ Thêm codegenConfig vào package.json
  □ Implement graceful degradation nếu isOptional: true (không thêm addListener/
    removeListeners trừ khi module emit events)
  □ Khai báo keychainAccessGroup trong nativeModules[] manifest
  □ Khai báo nativeModules[] trong manifest với specFile chính xác

Bước 5 — Kiểm tra 4 bất biến
  □ INV-1: platform không ghi vào store của platform khác
  □ INV-2: không tự tạo NavigationContainer, không dùng @react-navigation/native-stack
  □ INV-3: PII đi qua usePiiVault, không qua AsyncStorage trực tiếp
  □ INV-SEC: không có eval(), dynamic require, hoặc unsafe WebView

Bước 6 — Mở PR vào SuperApp repo
  □ Thêm entry vào platform-registry.json (kèm manifestChecksum)
  □ Thêm package vào dependencies trong package.json của SuperApp
  □ Thêm static import và entry vào STATIC_MODULE_MAP trong src/registry/index.ts
  □ Thêm StackParamList mới vào chuỗi MergeParamLists trong navigation/types.ts
  □ PR cần 2 approve từ team:superapp-core (CODEOWNERS rule)

Bước 7 — Kiểm tra CI pass
  □ check-screen-name-conflicts: PASS
  □ validate-manifests: PASS (bao gồm manifestChecksum verify)
  □ typecheck: PASS (không có type collision — MergeParamLists sẽ báo lỗi rõ)
  □ build-android: PASS (chỉ bắt buộc nếu có native code)
  □ build-ios: PASS (chỉ bắt buộc nếu có native code)
  □ audit-native-permissions: PASS (chỉ bắt buộc nếu có native code)
  □ manifest-compatibility: PASS (minPlatformVersion tương thích)
  □ npm-provenance-verify: PASS

Bước 8 — Cấu hình env vars
  □ Thêm baseUrlEnvKey vào .env.example của SuperApp
  □ Thêm vào CI secret management (không commit .env)
  □ Thông báo DevOps cập nhật staging/production secrets

Bước 9 — Verify billing hooks
  □ Test emitBillingEvent với từng event trong billingHooks[]
  □ Mỗi lần gọi emitBillingEvent phải có idempotencyKey unique
  □ Xác nhận event xuất hiện trong billing dashboard staging
  □ Xác nhận SDK tự inject moduleId đúng (không điền thủ công)

Bước 10 — Đăng ký Renovate
  □ Xác nhận package prefix nằm trong matchPackagePrefixes của renovate.json
  □ Tạo test PR giả để kiểm tra auto-merge pipeline hoạt động
  □ Thêm contact Slack vào platform-registry.json để alert khi CI fail

Bước 11 — Publish npm với provenance
  □ Publish lên npm với: npm publish --provenance
  □ Xác nhận package có SLSA provenance attestation trên npmjs.com
```

---

## 12. Security constraints

Section này tổng hợp các ràng buộc bảo mật bắt buộc cho mọi platform. Security reviewer dùng checklist này để đánh giá compliance.

### 12.1 Supply chain integrity

**Bắt buộc publish với npm provenance (SLSA level 2):**

```bash
# Platform team publish
npm publish --provenance
# Hoặc qua GitHub Actions CI:
# permissions: id-token: write
# npm publish --provenance (tự động dùng OIDC token)
```

CI gate `ci/npm-provenance-verify` kiểm tra provenance attestation tồn tại trên npmjs.com trước khi Renovate auto-merge patch.

**Private registry cho `@aladin/platform-sdk`:**

```
# .npmrc trong SuperApp repo
@aladin:registry=https://npm.aladin.internal/
```

Ngăn dependency confusion attack — package `@aladin/*` chỉ được resolve từ registry nội bộ.

### 12.2 Registry access control

File `platform-registry.json` được bảo vệ bởi CODEOWNERS:

```
# .github/CODEOWNERS
platform-registry.json @team:superapp-core @team:security
src/registry/index.ts   @team:superapp-core @team:security
```

Quy tắc approve:
- Bắt buộc 2 approve từ `team:superapp-core`.
- Reviewer không được cùng org với submitter (không self-approve).
- `team:security` có quyền veto.

### 12.3 Billing event integrity

Để chống inflate billing và charge nhầm module:

1. **`moduleId` do SDK inject** — `BillingEvent.moduleId` không có trong interface public của platform. SDK tự điền từ manifest đã load khi khởi tạo.

2. **`idempotencyKey` bắt buộc** — Format: `<requestId>-<eventName>`. Billing service dedup trong TTL 24h. Platform phải dùng `requestId` từ backend response.

3. **SDK validate event name** trước khi emit — throw `PlatformError` nếu event không có trong `manifest.billingHooks[].event`. Platform không thể emit event tùy tiện.

4. **`valueBased=true`** — Billing service cross-check `amount` với backend transaction log qua `requestId`.

```typescript
// SDK nội bộ (không phải platform code) — minh họa validate logic
function emitBillingEvent(input: Omit<BillingEvent, 'moduleId' | 'timestamp'>): void {
  const manifest = getCurrentPlatformManifest(); // inject khi platform load

  const hookDef = manifest.billingHooks?.find(h => h.event === input.event);
  if (!hookDef) {
    throw new PlatformError({
      code: `${manifest.moduleId}.BILLING_EVENT_NOT_DECLARED`,
      message: `Event '${input.event}' không khai báo trong billingHooks.`,
      retryable: false,
    });
  }

  const event: BillingEvent = {
    ...input,
    moduleId: manifest.moduleId, // SDK inject, không nhận từ platform
    timestamp: Date.now(),
  };

  billingLedger.record(event);
}
```

### 12.4 Manifest field injection prevention

Các field trong manifest có thể là vector injection nếu SuperApp dùng không đúng:

| Field | Ràng buộc | Lý do |
|---|---|---|
| `displayName` | Pattern `^[^<>"'\\]+$` | Ngăn XSS nếu render trong WebView |
| `navigation.tab.icon` | Pattern `^[a-z][a-z0-9-]+$` | SuperApp KHÔNG được dùng field này làm dynamic require path |
| `deepLinkPath` | `path.normalize(value) === value` | Ngăn path traversal (`/../`) |
| `featureFlags` key | Pattern `^[A-Z][A-Z0-9_]+$` | Ngăn injection khi dùng key trong template string |

SuperApp shell khi dùng `icon` field: tra cứu trong object mapping tĩnh `ICON_MAP[manifest.navigation.tab.icon]` — không dùng làm require path động.

### 12.5 Native module keychain isolation

Mọi native module phải khai báo `keychainAccessGroup` trong manifest. CI step `audit-native-permissions` dùng semgrep rule kiểm tra:

- iOS: Mọi `SecItemAdd`, `SecItemCopyMatching` call phải có `kSecAttrAccessGroup` trỏ tới group đã khai báo.
- Android: Mọi `SharedPreferences` và `EncryptedSharedPreferences` access phải dùng file name có prefix là `keychainAccessGroup` đã khai báo.

Platform không được đọc keychain/SharedPreferences của platform khác (enforce INV-1 ở native layer).

### 12.6 Dynamic import whitelist

Mặc dù Section 9.2 đã dùng static import, nếu trong tương lai cần dynamic load (ví dụ: lazy load cho platform không active), whitelist pattern phải được hardcode trong SuperApp shell code — không đọc từ config file có thể bị tamper:

```typescript
// Hardcode trong source code — không đọc từ file config
const ALLOWED_PACKAGE_PATTERN =
  /^@(orilife|proofchat|aladinwork|lampnet)\/[a-z][a-z0-9-]+-rn$/;

function assertAllowedPackage(npmPackage: string): void {
  if (!ALLOWED_PACKAGE_PATTERN.test(npmPackage)) {
    throw new Error(`[Security] Package '${npmPackage}' không trong whitelist. Dynamic import bị chặn.`);
  }
}
```

### 12.7 Các ràng buộc bảo mật khác

**Capability enforcement:**
- Platform phải gọi `usePlatformCapability(cap)` trước khi dùng camera/GPS/v.v.
- ESLint rule cấm platform import trực tiếp `react-native-camera`, `@react-native-community/geolocation` v.v. mà không qua SDK hook.

**Backend secret:**
- `authTokenEnvKey` trong manifest chỉ chứa tên biến — giá trị thực tế không bao giờ commit vào source.
- Tên biến nên trung lập (tránh đặt tên gợi ý hệ thống bảo mật nội bộ).

**Audit log registry:**
- Mọi thay đổi `status` trong `platform-registry.json` phải qua PR — traceable qua git log.
- Không có cơ chế runtime để thay đổi status ngoài PR merge.

**WebSocket JWT:**
- Platform dùng WebSocket phải implement JWT refresh qua `usePlatformAuth` `onTokenRefresh` callback.
- Không giữ JWT trong socket `auth` option sau khi token hết hạn — reconnect với token mới.

---

## 13. Changelog

### v1.1.0 — 2026-06-18 (bản hiện tại)

Tổng hợp từ phản biện của RN architect, ecosystem architect, và security architect. Tất cả điểm CRITICAL và MAJOR đã được sửa.

**Sửa CRITICAL:**

| # | Nguồn | Vấn đề | Sửa tại |
|---|---|---|---|
| C1 | RN architect | Thiếu `codegenConfig` trong package.json — TurboModule không link được trên New Architecture | §4.2, §10.1 |
| C2 | RN architect | `createNativeStackNavigator` và `NativeStackScreenProps` từ `@react-navigation/native-stack` — SuperApp dùng JS stack | §3.2, §5.1, §5.3, §10.1 |
| C3 | RN architect | `exports` map thiếu condition `react-native` — Metro không resolve được package | §4.2, §10.1 |
| C4 | RN architect | `loadPlatformModules` dùng dynamic `import(string)` — vi phạm INV-SEC và không hoạt động trong Metro | §9.2 |
| C5 | Ecosystem architect | Renovate `matchCurrentVersion: '/BREAKING/'` sai logic — không bao giờ kích hoạt | §8.1 |
| C6 | Ecosystem architect | `RootStackParamList` intersection type silent khi có key collision | §5.4 |
| C7 | Ecosystem architect | Dynamic import không có whitelist validation — supply chain risk | §9.2, §12.6 |
| C8 | Ecosystem architect | `main` trỏ raw TypeScript — Node.js CI scripts fail | §4.2 |
| C9 | Security architect | Auto-merge patch không có npm provenance verify | §8.1, §8.2, §11, §12.1 |
| C10 | Security architect | `platform-registry.json` không có CODEOWNERS / 2-approver rule | §9.3, §12.2 |
| C11 | Security architect | `emitBillingEvent` không có idempotency key, platform tự điền moduleId | §3.2, §10.3, §12.3 |
| C12 | Security architect | `navigation.tab.icon`, `displayName`, `deepLinkPath` có thể là injection vector | §2.1, §12.4 |

**Sửa MAJOR:**

| # | Nguồn | Vấn đề | Sửa tại |
|---|---|---|---|
| M1 | RN architect | `mockScannerSDK` thêm `addListener`/`removeListeners` không cần thiết | §7.4 |
| M2 | RN architect | `semver.satisfies` và `process.env.SUPERAPP_VERSION` không hoạt động trong RN runtime | §9.2 |
| M3 | RN architect | Renovate `matchCurrentVersion: '/BREAKING/'` dead code | §8.1 (sửa chung C5) |
| M4 | RN architect | `services` export bắt buộc nhưng `ServiceRegistry` index signature mất type safety | §3.1, §3.2 |
| M5 | RN architect | `usePlatformConfig().get()` không khớp cơ chế env thực tế (react-native-dotenv) | §3.3, §6.1 |
| M6 | RN architect | `main: ./src/index.ts` publish raw TypeScript | §4.2 (sửa chung C8) |
| M7 | RN architect | `moduleId` prefix không nhất quán (orilife.* vs magiclamp.*) | §1.3, §2.1 (nhắc cập nhật whitelist khi onboard) |
| M8 | Ecosystem architect | `prConcurrentLimit: 5` không đủ cho nhiều platform | §8.1 |
| M9 | Ecosystem architect | `npmPackage` pattern cho phép org tùy ý | §2.1 |
| M10 | Ecosystem architect | CI build native cho mọi PR — không khả thi | §8.2 |
| M11 | Ecosystem architect | `wsUrlEnvKey` thiếu trong schema và interface | §2.1, §3.2, §6.4 |
| M12 | Ecosystem architect | Validation rule version strict equality phá Renovate flow | §2.2, §4.2, §4.3 |
| M13 | Ecosystem architect | `platform-registry.json` static file — bottleneck khi nhiều platform | §9.1 (thêm `manifestChecksum`; roadmap tách registry package ghi chú khi scale) |
| M14 | Security architect | Native module không có keychain access group isolation | §2.1, §3.2, §7.2, §12.5 |
| M15 | Security architect | Không có `usePlatformCapability` hook / ESLint rule | §3.3, §12.7 |
| M16 | Security architect | `authTokenEnvKey` expose tên biến nhạy cảm trong manifest | §2.1, §12.7 |
| M17 | Security architect | Certificate pinning không có trong `createPlatformHttpClient` | §6.2, §12.7 |

**Thay đổi nhỏ (MINOR) đáng chú ý:**

- §7.3: Bỏ ràng buộc "tất cả method phải async" — codegen RN 0.84 hỗ trợ sync method với primitive.
- §7.5: Sửa hướng dẫn UniFFI — bỏ "check raw pointer", thay bằng 3 điểm thực tế (Tokio, build script, XCFramework).
- §5.5: Đổi scheme từ `aladin://` sang `lamp://`, đổi host format từ `org.product` sang `org-product`.
- §2.1: `billingHooks[].unit` đổi từ enum sang free string với pattern — dễ mở rộng khi có platform mới.
- §2.1: `featureFlags` thêm `propertyNames` pattern constraint.
- §4.2: Thêm subpath exports `./types` và `./manifest` — chuẩn bị cho future use.
- §8.2: Thêm job `check-screen-name-conflicts` chạy trước typecheck.
- §10.3: Cập nhật `emitBillingEvent` call trong ví dụ — không truyền `moduleId`, thêm `idempotencyKey`.

---

*Platform SDK Standard v1.1.0 — Aladin SuperApp Platform*
*Mọi thay đổi spec cần PR vào repo `aladin-superapp-docs`, tag review `team:platform-leads`.*