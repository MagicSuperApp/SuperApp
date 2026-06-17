// types/index.ts
//
// Types app-level (dùng cho user, auth). Domain types theo module
// được khai báo trong src/modules/<name>/types/.

export interface User {
  id: string;
  name: string;
  phone: string;
  email?: string;
  relativePhone?: string;
  walletAddress: string;
  walletKey: string; // Mock, in real would be encrypted
  biometricData?: string;
  did?: string; // Decentralized Identifier
  magicCredits: number;
  lampTokens: number;
  adaTokens: number;
}
