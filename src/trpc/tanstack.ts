import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { queryClient } from './query-client';
import type { AppRouter } from './routers/_app';

// This will be used to create the tRPC client in TanStack Start
export const trpc = createTRPCOptionsProxy<AppRouter>({
  queryClient,
});
