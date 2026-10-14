import { useEffect, useState } from 'react';

const QUERY = '(max-width: 767px)';

/** true quando a tela é de celular (abaixo do breakpoint "md" do Tailwind). */
export function useIsMobile(): boolean {
  const get = () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(QUERY).matches : false);
  const [mobile, setMobile] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setMobile(mq.matches);
    onChange();
    mq.addEventListener ? mq.addEventListener('change', onChange) : mq.addListener(onChange);
    return () => (mq.removeEventListener ? mq.removeEventListener('change', onChange) : mq.removeListener(onChange));
  }, []);
  return mobile;
}
