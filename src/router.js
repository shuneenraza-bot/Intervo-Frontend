import { useEffect, useState } from "react";

/*
 * Minimal hash router so the browser back button works across the auth pages:
 *   #/        landing page
 *   #/login   sign in
 *   #/signup  create an account
 *   #/dashboard  signed-in app (pages inside it are still switched in state)
 */

const readPath = () => window.location.hash.replace(/^#/, "") || "/";

/** Current hash path, e.g. "/login". Re-renders on back/forward and on navigate(). */
export function useHashPath() {
  const [path, setPath] = useState(readPath);
  useEffect(() => {
    const onChange = () => setPath(readPath());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return path;
}

/** Goes to `path`. `replace` swaps the current history entry (used for redirects). */
export function navigate(path, { replace = false } = {}) {
  if (readPath() === path) return;
  if (replace) window.location.replace(`#${path}`);
  else window.location.hash = path;
}
