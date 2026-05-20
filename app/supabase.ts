import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const DEVICE_ID_KEY = 'fifty2_device_id';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;

function generateUUID(): string {
  return Crypto.randomUUID();
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const newId = generateUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
    return newId;
  } catch (secureStoreError) {
    console.error('SecureStore failed for device ID, falling back to AsyncStorage', secureStoreError);
    // Fallback 1: AsyncStorage. Persistent across launches, just not hardware-backed.
    try {
      const existing = await AsyncStorage.getItem(DEVICE_ID_KEY);
      if (existing) return existing;
      const newId = generateUUID();
      await AsyncStorage.setItem(DEVICE_ID_KEY, newId);
      return newId;
    } catch (asyncStorageError) {
      // Fallback 2: transient. Identity will not survive app restart but the
      // current session still works. Caller can detect this by the new
      // device row not matching previous Supabase records.
      console.error('AsyncStorage also failed for device ID; returning transient ID', asyncStorageError);
      return generateUUID();
    }
  }
}
