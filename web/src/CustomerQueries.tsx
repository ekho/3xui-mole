import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { sessionCleared } from './api/client';

export function CustomerQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  }));
  useEffect(() => {
    const clear = () => client.clear();
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) location.reload();
    };
    window.addEventListener(sessionCleared, clear);
    window.addEventListener('pagehide', clear);
    window.addEventListener('pageshow', restore);
    return () => {
      window.removeEventListener(sessionCleared, clear);
      window.removeEventListener('pagehide', clear);
      window.removeEventListener('pageshow', restore);
      client.clear();
    };
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
