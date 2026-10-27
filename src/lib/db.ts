import postgres from 'postgres';

export type Sql = ReturnType<typeof postgres>;

declare global {
  // eslint-disable-next-line no-var
  var __x5sql: Sql | undefined;
}

/** Bitta umumiy ulanish (serverless'da qayta ishlatiladi). Supabase "Transaction pooler" manzili bilan ishlaydi. */
export function db(): Sql {
  if (!globalThis.__x5sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL sozlanmagan');
    globalThis.__x5sql = postgres(url, {
      prepare: false, // transaction pooler uchun shart
      max: Number(process.env.DATABASE_POOL_MAX || 10),
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: process.env.DATABASE_SSL === 'off' ? false : 'require',
      // Supabase pooler (transaction mode) bir ulanishga ketma-ket yuborilgan so'rovlarda qotib qoladi.
      // max_pipeline: 0 tranzaksiyalarni buzadi, shuning uchun parallel so'rovlar limitedAll() bilan ulanishlar sonidan oshmaydi.
      ...({ max_pipeline: 1 } as object),
      onnotice: () => {},
      types: {
        // sanalar "2026-10-27" ko'rinishida (JS Date emas), son turlari oddiy raqam
        date: { to: 1082, from: [1082], serialize: (x: unknown) => String(x), parse: (x: string) => x },
        numeric: { to: 1700, from: [1700], serialize: (x: unknown) => String(x), parse: (x: string) => parseFloat(x) },
        bigint: { to: 20, from: [20], serialize: (x: unknown) => String(x), parse: (x: string) => Number(x) }
      }
    });
  }
  return globalThis.__x5sql;
}

/** Lazy so'rovlarni bir vaqtda ko'pi bilan `n` tadan bajaradi (ulanishlar sonidan kam), natija tartibi saqlanadi. */
export function limitedAll<T extends readonly PromiseLike<unknown>[]>(items: T, n = 4): Promise<{ -readonly [K in keyof T]: Awaited<T[K]> }> {
  const out: unknown[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await items[k];
    }
  };
  return Promise.all(Array.from({ length: Math.min(n, items.length) }, worker)).then(() => out as never);
}
