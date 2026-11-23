import { createContext, useContext } from 'react';

export interface GuestContextValue {
  /** True while nobody is signed in: the few free prompts apply. */
  isGuest: boolean;
  /** Opens the sign-in (or sign-up) form in place of the tools. */
  openAuth: (mode: 'signin' | 'signup') => void;
}

const GuestContext = createContext<GuestContextValue>({ isGuest: false, openAuth: () => undefined });

export const GuestProvider = GuestContext.Provider;

export function useGuest(): GuestContextValue {
  return useContext(GuestContext);
}
