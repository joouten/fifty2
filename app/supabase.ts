import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vhgjelprozqgwkndzzqx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZoZ2plbHByb3pxZ3drbmR6enF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NjM4NTMsImV4cCI6MjA5MTIzOTg1M30.IBo3oGh_Ki5wW4AnVb_f2P3mrzdWaKld6kjRdutpKl0';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
export default supabase;