-- Keep existing pet.png assets readable while new saves use immutable UUID versions.
-- The pointer always names this pet owner's folder; storage RLS remains unchanged.
alter table public.pets
  drop constraint pets_drawing_path_check;

alter table public.pets
  add constraint pets_drawing_path_check
  check (
    drawing_path is null
    or drawing_path ~ (
      '^' || user_id::text ||
      '/(pet|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})[.]png$'
    )
  );
