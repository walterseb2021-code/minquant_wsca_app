// lib/catalog.ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
export const supabase = createClient(url, anon);

export type Mineral = {
  name: string;
  formula: string | null;
  commodity: string | null;
  content_fraction: number | null;
  density_g_cm3: string | null;
  hardness_mohs: string | null;
  color: string | null;
  luster: string | null;
  habit: string | null;
  system: string | null;
  occurrence: string | null;
  associated: string | null;
  notes: string | null;
  last_reviewed: string | null;
  source_url: string | null;
};

function normalizeQuery(q: string) { return q.trim().toLowerCase(); }

// Busca por nombre canónico, por sinónimo y por coincidencia parcial
export async function getMineralByName(name: string): Promise<Mineral | null> {
  const q = normalizeQuery(name);

  // 1) nombre canónico exacto
  let { data: m1, error: e1 } = await supabase.from('minerals').select('*').eq('name', name).limit(1);
  if (!e1 && m1 && m1.length) return m1[0] as Mineral;

  // 2) por sinónimo
  let { data: syn, error: e2 } = await supabase.from('mineral_synonyms')
    .select('mineral_name').ilike('synonym', q).limit(1);
  if (!e2 && syn && syn.length) {
    const canon = syn[0].mineral_name as string;
    let { data: m2 } = await supabase.from('minerals').select('*').eq('name', canon).limit(1);
    if (m2 && m2.length) return m2[0] as Mineral;
  }

  // 3) coincidencia parcial
  let { data: m3 } = await supabase.from('minerals').select('*').ilike('name', `%${q}%`).limit(1);
  if (m3 && m3.length) return m3[0] as Mineral;

  return null;
}
