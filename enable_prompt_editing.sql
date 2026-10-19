-- Run once in Supabase SQL Editor. No existing rows are deleted or replaced.
begin;

create or replace function public.geo_save_prompts(p_changes jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $function$
declare
  entry jsonb;
  existing public.geo_prompts%rowtype;
  item_id text;
  saved_count integer := 0;
  result_rows jsonb;
begin
  if jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_array_length(p_changes) > 200 then
    raise exception 'Invalid prompt changes' using errcode = '22023';
  end if;
  if (select count(*) from jsonb_array_elements(p_changes)) <>
     (select count(distinct value->>'id') from jsonb_array_elements(p_changes)) then
    raise exception 'Duplicate prompt IDs' using errcode = '22023';
  end if;

  for entry in select value from jsonb_array_elements(p_changes) order by value->>'id'
  loop
    item_id := entry->>'id';
    if coalesce(length(trim(item_id)), 0) = 0
       or coalesce(length(trim(entry->>'text')), 0) = 0
       or coalesce(length(trim(entry->>'topic')), 0) = 0
       or entry->>'language' is distinct from 'en'
       or entry->>'target_market' is distinct from 'global'
       or jsonb_typeof(entry->'active') is distinct from 'boolean' then
      raise exception 'Invalid prompt fields' using errcode = '22023';
    end if;

    select * into existing from public.geo_prompts where id = item_id for update;
    if found then
      if existing.baseline_id <> 'english-v2'
         or existing.version is distinct from (entry->>'expected_version')::integer then
        raise exception 'Prompt changed by another editor; refresh and retry'
          using errcode = '40001';
      end if;
      -- Classifications and metadata are preserved when editing an existing question.
      update public.geo_prompts set
        text = entry->>'text', topic = entry->>'topic',
        language = 'en', target_market = 'global', active = (entry->>'active')::boolean,
        version = existing.version + 1, updated_at = now()
      where id = item_id;
    else
      if entry->>'expected_version' is not null then
        raise exception 'Prompt no longer exists; refresh and retry' using errcode = '40001';
      end if;
      insert into public.geo_prompts
        (id, baseline_id, text, topic, language, target_market,
         prompt_type, test_type, scope, active, version, metadata)
      values
        (item_id, 'english-v2', entry->>'text', entry->>'topic', 'en', 'global',
         'unbranded', 'natural_discovery', 'core', (entry->>'active')::boolean, 1,
         '{"created_via":"dashboard"}'::jsonb);
    end if;
    saved_count := saved_count + 1;
  end loop;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) into result_rows
    from public.geo_prompts p where baseline_id = 'english-v2';
  return jsonb_build_object('saved', saved_count, 'prompts', result_rows);
end;
$function$;

revoke all on function public.geo_save_prompts(jsonb) from public, anon, authenticated;
grant execute on function public.geo_save_prompts(jsonb) to service_role;
commit;
