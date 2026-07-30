import { supabase } from "./supabase";

export async function getProfile(userId) {
  const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (error) throw error;
  return data;
}

export async function getSession() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function getSessionProfile() {
  const session = await getSession();
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

/* ---------- Google OAuth ---------- */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

// Après une première connexion Google, il n'existe pas encore de profil
// applicatif (role/nom/téléphone) : on le crée une fois que l'utilisateur
// les a renseignés dans l'écran "Compléter mon profil".
export async function createProfileForCurrentUser({ role, name, phone }) {
  const session = await getSession();
  if (!session) throw new Error("Session expirée — reconnecte-toi.");
  const { error } = await supabase.from("profiles").insert({ id: session.user.id, role, name, phone });
  if (error) throw error;
  return { id: session.user.id, role, name, phone };
}

/* ---------- Mot de passe oublié ---------- */
export async function sendPasswordReset(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin,
  });
  if (error) throw error;
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}

export function onAuthEvent(callback) {
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((event, session) => callback(event, session));
  return () => subscription.unsubscribe();
}
