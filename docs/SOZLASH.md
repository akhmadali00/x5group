# x5group — ishga tushirish qo'llanmasi

Bu qo'llanma bir marta bajariladi (taxminan 20–30 daqiqa). Hamma kalit va parollarni **faqat o'zingiz** Vercel/Supabase oynalariga kiritasiz. Ularni hech kimga, shu jumladan Claude'ga ham yubormang.

## 1. Baza (Supabase)

1. Supabase loyihangizni oching → chapdagi **SQL Editor** → **New query**.
2. GitHub'dagi `supabase/migrations/0001_init.sql` faylini oching, hammasini nusxalab SQL Editor'ga qo'ying → **Run**. «Success» chiqishi kerak.
3. **Database → Extensions** bo'limida `pg_cron` va `pg_net` ni yoqing (eslatmalar uchun kerak).
4. **Project Settings → Database → Connection string** (yoki yuqoridagi **Connect** tugmasi) → **Transaction pooler** (port **6543**) satrini nusxalang. Ichidagi `[YOUR-PASSWORD]` o'rniga baza parolini yozing. Parolda `@ : / ? # %` belgilari bo'lsa, ularni kodlash kerak (masalan `@` → `%40`); osonrog'i — Supabase'da parolni harf va raqamdan iborat qilib almashtirish.

## 2. Telegram bot

Bot allaqachon bor: `@x5group_ai_bot`. Tokenni @BotFather'dan oling (`/mybots` → botni tanlang → **API Token**). Tokenni faqat Vercel'ga yozasiz.

## 3. Sayt (Vercel)

1. Vercel → **Add New → Project** → GitHub'dan `akhmadali00/x5group` ni **Import** qiling.
2. **Environment Variables** bo'limida quyidagilarni kiriting:

| Nomi | Qiymati |
|---|---|
| `DATABASE_URL` | 1-qadamdagi Transaction pooler satri |
| `TELEGRAM_BOT_TOKEN` | @BotFather bergan token |
| `TELEGRAM_WEBHOOK_SECRET` | o'zingiz o'ylab topgan uzun tasodifiy matn (kamida 24 belgi, harf va raqam) |
| `CRON_SECRET` | yana bitta uzun tasodifiy matn (yuqoridagidan boshqacha) |
| `BACKUP_KEY` | ixtiyoriy, kamida 16 belgi: zaxira faylidagi parollarni shifrlaydi (yo'qotib qo'ymang!) |

Ixtiyoriy qo'shimcha o'zgaruvchilar (keyinroq ham qo'shsangiz bo'ladi; qo'shgandan keyin Vercel'da **Redeploy** qiling):

| Nomi | Nima uchun |
|---|---|
| `ANTHROPIC_API_KEY` | botdagi AI yordamchi (oddiy matn yozsangiz, savolga javob beradi va vazifa/syomka qo'shadi; har kim faqat o'z ruxsati doirasida). `AI_MODEL` bilan modelni almashtirish mumkin |
| `META_ACCESS_TOKEN` | Meta reklama (Facebook/Instagram) kampaniyalari va kunlik natijalar avtomatik yangilanadi. Loyihaning **Reklama akkaunt** maydoniga `act_123...` yoki shunchaki raqamni kiriting. Token «ads_read» ruxsatli System User tokeni bo'lsin |
| `META_IG_USER_ID` | Instagram obunachilar sonini avtomatik olish uchun (o'zingizning Instagram Business akkaunt ID'ingiz; boshqa akkauntlarning ochiq obunachi sonini shu orqali o'qiydi) |
| `YOUTUBE_API_KEY` | YouTube kanal obunachilari sonini avtomatik olish uchun |

Telegram kanal obunachilari uchun qo'shimcha kalit kerak emas: kanal havolasi ochiq (`t.me/nom`) bo'lsa, bot soni o'zi o'qiydi.

3. **Deploy** ni bosing. Tugagach sayt manzili chiqadi (masalan `x5group.vercel.app`).

## 4. Birinchi kirish

1. Saytni oching. Birinchi ekran **«Admin yaratish»** bo'ladi: ism, email, parol kiriting. Birinchi kirgan odam Admin bo'ladi, shuning uchun bu ishni darhol o'zingiz bajaring.
2. Ma'lumotlar bo'sh holda boshlanadi. Hammasini o'zingiz kiritasiz.

## 5. Botni ulash

1. Saytda **Arxiv → Bot** bo'limiga kiring. Hamma qator ✅ bo'lishi kerak, so'ng **«Webhookni o'rnatish»** ni bosing.
2. O'ng yuqoridagi ismingiz → **Mening sahifam → Telegramni ulash** → chiqqan havolani Telegramda oching → **Start**. Endi bot sizni Admin sifatida taniydi.
3. Jamoa a'zolari uchun: **Jamoa → a'zoni oching → Telegramni ulash** → havolani shu a'zoga yuboring. Yoki a'zo botga o'zi `/start` yozadi, siz botdan kelgan xabardagi tugma bilan kimligini tanlab tasdiqlaysiz.

## 6. Eslatmalar (har daqiqalik tekshiruv)

1. `supabase/pg_cron.sql` faylini oching, ichidagi `SAYT_MANZILI` va `CRON_SECRET` o'rniga o'z qiymatlaringizni yozing.
2. Supabase **SQL Editor** da ishga tushiring.
3. Tekshirish: **Arxiv → Bot** da «Yuborilmagan xabarlar navbati» 0 bo'lishi kerak.

Qo'shimcha: `vercel.json` da kuniga bir marta ishlaydigan zaxira chaqiruv bor (Vercel bepul tarifi shuni beradi). Asosiy har daqiqalik chaqiruvni Supabase qiladi.

## 6.1. Avtomatik yangilanishlar

- Har 3 soatda reklama (Meta) va obunachilar soni yangilanadi; Admin botda `/yangila` yozsa darhol yangilanadi.
- Reklama signallari: natijasiz kampaniya, o'rtachadan 1.5× qimmat CPR va o'rtachadan ancha arzon (byudjetni oshirish mumkin) kampaniyalar haqida PM va Adminga haftada bir marta xabar keladi.
- Oylik PDF hisobot har oyning 1-kuni ertalab Adminga Telegramda keladi; istalgan oyni `/hisobot 2026-10` deb so'rash mumkin.
- Telefonga o'rnatish: sayt manzilini telefonda oching → brauzer menyusidan **«Bosh ekranga qo'shish»**. Bot ichida ham **Platforma** tugmasi paydo bo'ladi (Webhookni o'rnatganingizdan keyin).

## 7. Xavfsizlik

- **Mening sahifam → 2 bosqichli kirish → Yoqish** (Google Authenticator bilan). Admin uchun tavsiya etiladi.
- Token va parollarni chatga, GitHub'ga yozmang. Agar tasodifan oshkor bo'lsa, tokenni @BotFather'da `/revoke` qiling, Supabase'da parolni almashtiring.

## 8. Zaxira

- Har kuni ertalab 03:00 dan keyin avtomatik zaxira olinadi va Adminga Telegramda **fayl** bo'lib keladi. Oxirgi 30 kun bazada ham saqlanadi.
- **Arxiv → Zaxira** da qo'lda zaxira olish, yuklab olish va tiklash mumkin. Tiklashdan oldin joriy holat avtomatik saqlanadi.
- Fayldan tiklaganda parollar `BACKUP_KEY` bilan shifrlangan holda faylda bo'ladi; kalit bo'lmasa, tiklashda mavjud parollar saqlanib qoladi (bo'sh bazaga tiklasangiz parollarni qaytadan belgilash kerak bo'ladi).

## Cheklovlar (bepul tariflar)

- **Vercel Hobby** tarifi rasman faqat notijorat foydalanish uchun. Agentlik ishida ishlatilsa, Vercel Pro (oyiga ~$20) ga o'tish kerak bo'lishi mumkin.
- **Supabase bepul** loyiha 1 hafta faoliyatsiz bo'lsa to'xtatiladi (har daqiqalik eslatma buni oldini oladi), hajmi 500 MB, o'z zaxirasi yo'q (shuning uchun bizning Telegram zaxiramiz bor).
