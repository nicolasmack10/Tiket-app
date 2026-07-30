-- La policy "read own or accessible events" référençait buyers, dont la propre
-- policy référence events en retour : Postgres détecte ce cycle et refuse
-- d'évaluer la policy ("infinite recursion detected"), ce qui cassait même la
-- lecture par l'organisateur de son propre événement.
--
-- La clause sur buyers était de toute façon redondante : le parcours d'achat
-- passe toujours par recordEventAccess avant l'ouverture du paiement, donc un
-- acheteur a déjà une ligne event_access au moment où il possède un billet.

drop policy "read own or accessible events" on events;

create policy "read own or accessible events" on events for select using (
  auth.uid() = creator_id
  or exists (select 1 from event_access ea where ea.event_code = events.code and ea.user_id = auth.uid())
);
