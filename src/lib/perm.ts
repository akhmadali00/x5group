// Ruxsatlar mantig'i. Brauzerdagi (public/app/app.js) qoidalar bilan bir xil bo'lishi shart:
// asosiy himoya shu yerda, serverda.

export type Me = {
  id: string;
  name: string;
  role: 'admin' | 'member';
  position: string | null;
  permissions: Set<string>;
  projectIds: Set<string>; // PM bo'lgan yoki biriktirilgan loyihalar
  telegramChatId: number | null;
};

export const TARGET_ROLES = ['PM', 'Targetolog'];

export const PERM_TREE: [string, string, [string, string][]][] = [
  ['bosh', 'Bosh menu', [['umumiy', "Umumiy ko'rsatkichlar"], ['bugun', 'Bugun joylanadiganlar'], ['loyihalar', 'Loyihalar']]],
  ['loyihalar', 'Loyihalar', [['royxat', "Loyihalar ro'yxati"]]],
  ['target', 'Target', [['umumiy', "Umumiy ko'rsatkichlar"], ['kampaniyalar', 'Kampaniyalar']]],
  ['vazifalar', 'Vazifalar', [['korsatkich', "Ko'rsatkichlar"], ['royxat', "Vazifalar ro'yxati"]]],
  ['syomkalar', 'Syomkalar', [['korsatkich', "Ko'rsatkichlar"], ['rejada', 'Barcha syomkalar']]],
  ['jamoa', 'Jamoa', [['azolar', "A'zolar"], ['frilans', 'Frilans']]]
];

export const ALL_PERM_KEYS: string[] = PERM_TREE.flatMap(([p, , cs]) => [p, ...cs.map(([c]) => `${p}.${c}`)]);

/** Yangi a'zo uchun odatiy ruxsatlar (Target faqat PM/Targetolog uchun). */
export function defaultPermissions(position: string | null): string[] {
  return PERM_TREE.filter(([p]) => p !== 'target' || (position && TARGET_ROLES.includes(position))).flatMap(([p, , cs]) => [
    p,
    ...cs.map(([c]) => `${p}.${c}`)
  ]);
}

export const isAdmin = (me: Me) => me.role === 'admin';
export const isPM = (me: Me) => me.position === 'PM';

export function can(me: Me, key: string): boolean {
  if (isAdmin(me)) return true;
  const page = key.split('.')[0];
  if (page === 'arxiv') return false;
  if (page === 'target' && !(me.position && TARGET_ROLES.includes(me.position))) return false;
  return me.permissions.has(key);
}

export function canProject(me: Me, projectId: string | null | undefined): boolean {
  if (!projectId) return false;
  return isAdmin(me) || me.projectIds.has(projectId);
}

/** "Tasdiqlandi" va "Ijobiy" bosqichini faqat Admin yoki PM qo'yadi. */
export function stageLocked(me: Me, stage: string): boolean {
  return (stage === 'Tasdiqlandi' || stage === 'Ijobiy') && !(isAdmin(me) || isPM(me));
}

/** Frilans/akkauntsiz a'zolar ruxsat massivi va ro'yxatiga kirmasligi kerak. */
export function normalizePermissions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const ok = new Set(ALL_PERM_KEYS);
  return [...new Set(list.map(String).filter((k) => ok.has(k)))];
}
