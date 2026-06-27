update public.pricing_rules
set
  amount_idr = 2000,
  description = 'Vector Siap Proses SVG tanpa AI',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ready_trace';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ready_trace', 2000, 'Vector Siap Proses SVG tanpa AI', true
where not exists (
  select 1
  from public.pricing_rules
  where key = 'ready_trace'
);

update public.pricing_rules
set
  amount_idr = 5000,
  description = 'AI Redesign Premium image-to-image',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ai_redraw';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ai_redraw', 5000, 'AI Redesign Premium image-to-image', true
where not exists (
  select 1
  from public.pricing_rules
  where key = 'ai_redraw'
);
