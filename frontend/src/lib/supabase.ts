import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

/** Browser client only. Never use service-role keys in Vite environment files. */
export const supabase: SupabaseClient<Database> | null = isSupabaseConfigured ? createClient<Database>(supabaseUrl, supabasePublishableKey) : null
