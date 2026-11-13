import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type ThemePreference = 'light' | 'dark' | 'system';
const THEME_KEY = 'verba.theme';

export interface Toast {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export interface UiState {
  theme: ThemePreference;
  toasts: Toast[];
}

function loadTheme(): ThemePreference {
  try {
    const t = localStorage.getItem(THEME_KEY);
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* ignore */
  }
  return 'system';
}

export function applyTheme(theme: ThemePreference): void {
  const dark =
    theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
}

let toastSeq = 0;

const uiSlice = createSlice({
  name: 'ui',
  initialState: (): UiState => ({ theme: loadTheme(), toasts: [] }),
  reducers: {
    themeChanged(state, action: PayloadAction<ThemePreference>) {
      state.theme = action.payload;
    },
    toastAdded: {
      reducer(state, action: PayloadAction<Toast>) {
        state.toasts = [...state.toasts.slice(-3), action.payload];
      },
      prepare(toast: Omit<Toast, 'id'>) {
        return { payload: { ...toast, id: `t${++toastSeq}` } };
      },
    },
    toastDismissed(state, action: PayloadAction<string>) {
      state.toasts = state.toasts.filter((t) => t.id !== action.payload);
    },
  },
});

export const { themeChanged, toastAdded, toastDismissed } = uiSlice.actions;
export default uiSlice.reducer;
