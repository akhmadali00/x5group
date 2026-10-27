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
      max: Number(process.env.DATABASE_POOL_MAX || 8),
      idle_timeout: 20,
      connect_timeout: 15,
      ssl: process.env.DATABASE_SSL === 'off' ? false : 'require',
      // Supabase pooler (transaction mode) bir ulanishda ketma-ket yuborilgan so'rovlarda qotib qoladi: har ulanishda bittadan
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
