alter table public.pets
  drop constraint if exists pets_drawing_path_check;

alter table public.pets
  add constraint pets_drawing_path_check
  check (drawing_path is null or drawing_path ~ '^[0-9a-f-]+/pet[.]png$');
