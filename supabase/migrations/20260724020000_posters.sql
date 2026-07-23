-- Affiche d'événement : bucket de stockage public + colonne sur events

alter table events add column poster_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('posters', 'posters', true, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;

create policy "public read posters" on storage.objects for select using (bucket_id = 'posters');

create policy "organizer upload own posters" on storage.objects for insert with check (
  bucket_id = 'posters'
  and (storage.foldername(name))[1] = auth.uid()::text
  and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'organizer')
);

create policy "organizer update own posters" on storage.objects for update using (
  bucket_id = 'posters' and (storage.foldername(name))[1] = auth.uid()::text
) with check (
  bucket_id = 'posters' and (storage.foldername(name))[1] = auth.uid()::text
);
