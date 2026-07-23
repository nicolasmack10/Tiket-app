import { supabase } from "./supabase";

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function getSessionProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  try {
    return await getProfile(session.user.id);
  } catch {
    return null;
  }
}

export async function signUp({ email, password, role, name, phone }) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.user || !data.session) {
    throw new Error("Vérifie ta boîte mail pour confirmer ton compte avant de te connecter.");
  }
  const { error: profErr } = await supabase.from("profiles").insert({ id: data.user.id, role, name, phone });
  if (profErr) throw profErr;
  return { id: data.user.id, role, name, phone };
}

export async function signIn({ email, password }) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return getProfile(data.user.id);
}

export async function signOut() {
  await supabase.auth.signOut();
}
