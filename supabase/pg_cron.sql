-- Har daqiqada eslatma/zaxira "tick"ini chaqiradi. Supabase -> SQL Editor da BIR MARTA ishga tushiring.
-- 1) Avval Database -> Extensions bo'limida "pg_cron" va "pg_net" ni yoqing.
-- 2) Quyidagi 2 ta qiymatni o'zingiznikiga almashtiring:
--      SAYT_MANZILI  -> masalan  https://x5group.vercel.app
--      CRON_SECRET   -> Vercel'ga kiritgan CRON_SECRET qiymati
select cron.schedule(
  'x5-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := 'SAYT_MANZILI/api/cron/tick',
    headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET'),
    timeout_milliseconds := 20000
  );
  $$
);
-- To'xtatish uchun:  select cron.unschedule('x5-tick');
