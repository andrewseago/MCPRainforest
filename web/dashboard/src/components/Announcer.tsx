import { useCallback, useState } from "react";

export function useAnnounce() {
  const [message, setMessage] = useState("");
  const announce = useCallback((msg: string) => {
    // Reset first so repeated identical messages are re-announced.
    setMessage("");
    window.setTimeout(() => setMessage(msg), 30);
  }, []);
  return { message, announce };
}

export function Announcer({ message }: { message: string }) {
  return (
    <div aria-atomic="true" aria-live="polite" className="sr-only">
      {message}
    </div>
  );
}
