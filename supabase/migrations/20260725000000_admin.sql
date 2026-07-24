-- Compte super admin : vue globale, suspension/suppression de comptes,
-- gestion (suppression) de n'importe quel événement, lecture des commissions.

alter table profiles drop constraint profiles_role_check;
alter table profiles add constraint profiles_role_check check (role in ('organizer', 'client', 'admin'));
alter table profiles add column suspended boolean not null default false;

-- security definer : contourne volontairement le RLS de `profiles` pour éviter
-- toute récursion de policy, et sert de brique commune aux policies ci-dessous.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function is_suspended()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select suspended from profiles where id = auth.uid()), false);
$$;

-- Lecture globale pour l'admin
create policy "admin read all profiles" on profiles for select using (is_admin());
create policy "admin read all events" on events for select using (is_admin());
create policy "admin read all buyers" on buyers for select using (is_admin());
create policy "admin read all withdrawals" on withdrawals for select using (is_admin());

-- Gestion des comptes par l'admin (suspension, suppression du profil applicatif)
create policy "admin update any profile" on profiles for update using (is_admin()) with check (is_admin());
create policy "admin delete any profile" on profiles for delete using (is_admin());

-- Gestion des événements par l'admin
create policy "admin update any event" on events for update using (is_admin()) with check (is_admin());
create policy "admin delete any event" on events for delete using (is_admin());
create policy "admin delete any buyer" on buyers for delete using (is_admin());
create policy "admin delete any withdrawal" on withdrawals for delete using (is_admin());
create policy "admin delete any event_access" on event_access for delete using (is_admin());

-- Un compte suspendu ne peut plus créer d'événement, acheter, ni retirer de fonds
drop policy "organizer insert own events" on events;
create policy "organizer insert own events" on events for insert with check (
  auth.uid() = creator_id
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'organizer')
  and not is_suspended()
);

drop policy "organizer update own events" on events;
create policy "organizer update own events" on events for update using (
  auth.uid() = creator_id and not is_suspended()
) with check (
  auth.uid() = creator_id and not is_suspended()
);

drop policy "buyers insert own" on buyers;
create policy "buyers insert own" on buyers for insert with check (auth.uid() = user_id and not is_suspended());

drop policy "withdrawals insert own event" on withdrawals;
create policy "withdrawals insert own event" on withdrawals for insert with check (
  exists (select 1 from events e where e.code = withdrawals.event_code and e.creator_id = auth.uid())
  and not is_suspended()
);
