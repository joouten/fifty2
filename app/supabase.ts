import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
const DEVICE_ID_KEY = 'fifty2_device_id';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (existing) return existing;
    const newId = generateUUID();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, newId);
    return newId;
} catch (e) {
    console.error('Failed to get/create device ID', e);
    return generateUUID();  // ← replace with this
  }
}