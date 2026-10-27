// AI yordamchi (keyingi bosqich): hozircha o'chiq.
import type { Me } from '../perm';

export const agentEnabled = () => false;
export async function askAgent(_me: Me, _text: string, _chat: number): Promise<string> {
  return "AI yordamchi hali ulanmagan.";
}
