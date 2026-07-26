-- La policy RLS "organizer update own events" autorise la mise à jour de la
-- ligne mais pas colonne par colonne : un organisateur pouvait donc modifier
-- commission_override_pct via un appel direct à l'API. On verrouille cette
-- colonne : seul un admin peut la changer.

create or replace function prevent_commission_override_change()
returns trigger
language plpgsql
as $$
begin
  if new.commission_override_pct is distinct from old.commission_override_pct and not is_admin() then
    raise exception 'Seul un administrateur peut modifier la commission d''un événement.';
  end if;
  return new;
end;
$$;

create trigger events_prevent_commission_override_change
before update on events
for each row execute function prevent_commission_override_change();
