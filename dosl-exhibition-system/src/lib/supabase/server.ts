import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// サーバーサイド専用: service_role key でRLSをバイパス
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
