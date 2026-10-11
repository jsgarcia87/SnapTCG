/**
 * config.js — Configuración de la nube (Supabase)
 * Deja SUPABASE_URL y SUPABASE_ANON_KEY vacíos para usar el modo demo (solo localStorage).
 * La "anon key" es pública por diseño: la seguridad real la dan las políticas RLS de supabase/schema.sql.
 * NUNCA pongas aquí la "service_role key".
 */
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";

// UUID del usuario dueño de la colección pública (Authentication → Users en Supabase).
const PUBLIC_OWNER_ID = "";
