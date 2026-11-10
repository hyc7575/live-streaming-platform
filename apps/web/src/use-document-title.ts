import { useEffect } from 'react';

const APP_NAME = 'Lime';

// Sets the tab title to `<name> - Lime`, or just `Lime` while `name` is null
// (still loading, or nothing to name). Leaving the screen puts `Lime` back.
export function useDocumentTitle(name: string | null) {
  useEffect(() => {
    document.title = name ? `${name} - ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [name]);
}
