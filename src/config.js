// Réglages de l'app. Les deux clés Supabase ci-dessous sont publiques par conception :
// la sécurité vient des règles d'accès de la base (voir supabase/schema.sql).
// Ne jamais mettre ici la clé « service_role ».
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Chaud'
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
