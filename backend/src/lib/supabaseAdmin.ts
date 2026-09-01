import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env'

// Cliente server-side com a service role key — bypassa RLS. Usado apenas
// para: auth.admin.createUser, auth.admin.deleteUser,
// auth.resetPasswordForEmail e auth.getUser(token) (validação de JWT no
// middleware de autenticação). NUNCA importar este módulo em código que
// possa ser exposto ao cliente/browser.
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})
