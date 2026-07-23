-- Empêche un compte client de créer un événement (le rôle n'était pas vérifié, seule la propriété l'était)
-- et empêche un utilisateur de changer son propre rôle après création du compte.

drop policy "organizer insert own events" on events;
create policy "organizer insert own events" on events for insert with check (
  auth.uid() = creator_id
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'organizer')
);

create or replace function prevent_role_change()
returns trigger
language plpgsql
as $$
begin
  if new.role <> old.role then
    raise exception 'Le rôle du compte ne peut pas être modifié.';
  end if;
  return new;
end;
$$;

create trigger profiles_prevent_role_change
before update on profiles
for each row execute function prevent_role_change();
