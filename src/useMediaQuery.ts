import { useEffect, useState } from 'react';

/** Re-renders when the query starts or stops matching. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Phone-sized. Used where a layout has to change shape, not just reflow. */
export const useIsMobile = () => useMediaQuery('(max-width: 720px)');
