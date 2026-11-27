/**
 * config.js — Configuración de la nube (Supabase)
 * Deja SUPABASE_URL y SUPABASE_ANON_KEY vacíos para usar el modo demo (solo localStorage).
 * La "anon key" es pública por diseño: la seguridad real la dan las políticas RLS de supabase/schema.sql.
 * NUNCA pongas aquí la "service_role key".
 */
const SUPABASE_URL = "https://rgyoatclhoblugdjekwl.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_KYvI4sknHO6o-ViZpLjtvQ_xJjbawpG"; // "Publishable key" (pública por diseño)

// Ya no hay una colección pública por defecto: cada usuario tiene la suya y la comparte con ?u=<id>.
