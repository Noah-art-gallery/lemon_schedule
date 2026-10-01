alter table public.pets
  add column selected_color text not null default 'leaf-green'
    check (selected_color in ('leaf-green', 'lemon-yellow')),
  add column selected_accessory text
    check (selected_accessory is null or selected_accessory = 'leaf-hat'),
  add column selected_background text
    check (selected_background is null or selected_background = 'sunny-garden');

create function public.set_pet_decorations(
  target_color text,
  target_accessory text,
  target_background text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if target_color is null or target_color not in ('leaf-green', 'lemon-yellow')
    or (target_accessory is not null and target_accessory <> 'leaf-hat')
    or (target_background is not null and target_background <> 'sunny-garden') then
    raise exception 'INVALID_PET_DECORATION' using errcode = 'P0001';
  end if;
  if (target_color = 'lemon-yellow' and not exists (
      select 1 from public.pet_unlocks
      where user_id = current_user_id and item_key = 'lemon-yellow'
    ))
    or (target_accessory = 'leaf-hat' and not exists (
      select 1 from public.pet_unlocks
      where user_id = current_user_id and item_key = 'leaf-hat'
    ))
    or (target_background = 'sunny-garden' and not exists (
      select 1 from public.pet_unlocks
      where user_id = current_user_id and item_key = 'sunny-garden'
    )) then
    raise exception 'PET_ITEM_LOCKED' using errcode = 'P0001';
  end if;

  update public.pets
  set
    selected_color = target_color,
    selected_accessory = target_accessory,
    selected_background = target_background
  where user_id = current_user_id;
  if not found then
    raise exception 'PET_NOT_FOUND' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'selectedColor', target_color,
    'selectedAccessory', target_accessory,
    'selectedBackground', target_background
  );
end;
$$;

revoke all on function public.set_pet_decorations(text, text, text) from public, anon;
grant execute on function public.set_pet_decorations(text, text, text) to authenticated;
