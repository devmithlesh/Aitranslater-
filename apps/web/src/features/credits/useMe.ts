import { useMeQuery } from '@/store/api';

/** The signed-in caller's profile, role and credits, plus a shortcut for the admin check. */
export function useMe() {
  const query = useMeQuery();
  return {
    me: query.data,
    isAdmin: query.data?.role === 'admin',
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}
