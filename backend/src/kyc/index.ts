import type { KycProvider } from "./types.js";
import { MockKycProvider } from "./mockProvider.js";
import { DigiLockerKycProvider } from "./digilockerProvider.js";

export function selectKycProvider(mockKyc: boolean): KycProvider {
  return mockKyc ? new MockKycProvider() : new DigiLockerKycProvider();
}

export type { KycProvider } from "./types.js";
