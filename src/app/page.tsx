import { MARKUP } from '@/ui/markup.generated';
import { Scripts } from './scripts';

export default function Home() {
  return (
    <>
      <div className="lx" id="lx-app" dangerouslySetInnerHTML={{ __html: MARKUP }} suppressHydrationWarning />
      <Scripts />
    </>
  );
}
