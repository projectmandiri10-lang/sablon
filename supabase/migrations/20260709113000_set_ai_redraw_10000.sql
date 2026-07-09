update public.pricing_rules
set
  amount_idr = 10000,
  description = 'AI Redesign Premium image-to-image termasuk pecah warna sablon',
  active = true,
  updated_at = timezone('utc', now())
where key = 'ai_redraw';

insert into public.pricing_rules (key, amount_idr, description, active)
select 'ai_redraw', 10000, 'AI Redesign Premium image-to-image termasuk pecah warna sablon', true
where not exists (
  select 1
  from public.pricing_rules
  where key = 'ai_redraw'
);
