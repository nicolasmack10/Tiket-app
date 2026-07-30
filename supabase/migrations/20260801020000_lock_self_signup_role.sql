-- CRITIQUE : "insert own profile" (auth.uid() = id) ne restreignait pas la
-- valeur de role insérée. N'importe qui pouvait s'inscrire puis insérer son
-- propre profil avec role='admin', obtenant un accès total (voir tous les
-- comptes/événements, suspendre/supprimer n'importe quel compte, supprimer
-- n'importe quel événement, changer les commissions). Un compte admin ne doit
-- pouvoir être créé que hors du flux d'inscription (SQL direct par la
-- plateforme, comme pour le compte super admin existant).

drop policy "insert own profile" on profiles;

create policy "insert own profile" on profiles for insert with check (
  auth.uid() = id and role in ('organizer', 'client')
);
