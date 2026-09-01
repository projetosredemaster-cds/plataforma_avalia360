import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  // Não logar os valores das env vars, apenas avisar que estão ausentes.
  console.error(
    'Supabase: variáveis de ambiente VITE_SUPABASE_URL e/ou VITE_SUPABASE_ANON_KEY não configuradas. ' +
      'Verifique o arquivo .env (veja .env.example).',
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
