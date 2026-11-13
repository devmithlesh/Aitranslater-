import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector } from 'react-redux';
import { api } from './api';
import connectionReducer, { persistConnection } from './connectionSlice';
import uiReducer, { applyTheme } from './uiSlice';

export const store = configureStore({
  reducer: {
    connection: connectionReducer,
    ui: uiReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefault) => getDefault().concat(api.middleware),
});

// Persist connection + theme whenever they change.
let prevConnection = store.getState().connection;
let prevTheme = store.getState().ui.theme;
store.subscribe(() => {
  const { connection, ui } = store.getState();
  if (connection !== prevConnection) {
    const previous = prevConnection;
    // Update before dispatching: dispatch re-runs this listener synchronously,
    // and a stale prevConnection would recurse until the stack overflows.
    prevConnection = connection;
    persistConnection(connection);
    if (connection.token !== previous.token || connection.apiUrl !== previous.apiUrl) {
      // A new server/token invalidates every cached response.
      store.dispatch(api.util.resetApiState());
    }
  }
  if (ui.theme !== prevTheme) {
    prevTheme = ui.theme;
    applyTheme(ui.theme);
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
