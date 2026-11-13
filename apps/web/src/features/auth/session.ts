import type { AuthSessionResponse } from '@verba/shared';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '@/store';
import { connected } from '@/store/connectionSlice';

/**
 * Stores the session returned by signup, login or Google sign-in, then leaves the auth page.
 * Users who must change their password go there first; everyone else goes to `target`.
 */
export function useFinishSignIn() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const apiUrl = useAppSelector((s) => s.connection.apiUrl);

  return (session: AuthSessionResponse, target: string) => {
    dispatch(connected({ apiUrl, token: session.token }));
    navigate(session.me.mustChangePassword ? '/account/password' : target, { replace: true });
  };
}
