import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import {
  CLIENT_HEADER,
  type AdminConfig,
  type AdminConfigUpdate,
  type AdminUsageResponse,
  type ApiErrorBody,
  type CreateUserRequest,
  type MeResponse,
  type ProviderId,
  type ProviderListResponse,
  type ProviderTestResponse,
  type ProviderUpdateRequest,
  type ProviderView,
  type TranslateVariantsRequest,
  type TranslateVariantsResponse,
  type UpdateUserRequest,
  type UserListResponse,
  type UserSettings,
  type UserTokenResponse,
  type UserView,
} from '@verba/shared';
import { tokenRejected } from './connectionSlice';
import type { RootState } from './index';

/** Normalized error every component can render. */
export interface AppError {
  status: number | 'NETWORK' | 'TIMEOUT' | 'PARSE';
  code: ApiErrorBody['error']['code'] | 'NETWORK_ERROR';
  message: string;
  details?: unknown;
}

const REQUEST_TIMEOUT_MS = 45_000;

const rawBaseQuery = fetchBaseQuery({
  baseUrl: '/',
  timeout: REQUEST_TIMEOUT_MS,
  prepareHeaders(headers, { getState }) {
    const { token } = (getState() as RootState).connection;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    headers.set(CLIENT_HEADER, 'web');
    return headers;
  },
});

function toAppError(err: FetchBaseQueryError): AppError {
  if (err.status === 'FETCH_ERROR') {
    return {
      status: 'NETWORK',
      code: 'NETWORK_ERROR',
      message: 'Cannot reach the Verba server. Check that the backend is running and the URL is correct.',
    };
  }
  if (err.status === 'TIMEOUT_ERROR') {
    return { status: 'TIMEOUT', code: 'PROVIDER_TIMEOUT', message: 'The request timed out. Try again.' };
  }
  if (err.status === 'PARSING_ERROR' || err.status === 'CUSTOM_ERROR') {
    return { status: 'PARSE', code: 'INTERNAL', message: 'The server sent an unexpected response.' };
  }
  const body = err.data as Partial<ApiErrorBody> | undefined;
  return {
    status: err.status,
    code: body?.error?.code ?? 'INTERNAL',
    message: body?.error?.message ?? `Request failed (${err.status}).`,
    details: body?.error?.details,
  };
}

/** Prefixes the user-configured server URL and normalizes errors to AppError. */
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, AppError> = async (args, api, extra) => {
  const { apiUrl } = (api.getState() as RootState).connection;
  const req = typeof args === 'string' ? { url: args } : args;
  const result = await rawBaseQuery({ ...req, url: `${apiUrl}/api${req.url}` }, api, extra);
  if (result.error) {
    const error = toAppError(result.error);
    if (error.status === 401) api.dispatch(tokenRejected());
    return { error, meta: result.meta };
  }
  return { data: result.data, meta: result.meta };
};

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return 'Something went wrong.';
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery,
  tagTypes: ['Settings', 'Providers', 'Me', 'Users', 'AdminConfig', 'AdminUsage'],
  endpoints: (build) => ({
    // Translation runs are mutations: never cached, explicit user intent. They refresh provider usage,
    // the caller's remaining credits, and the admin's usage and per-user counters.
    translateVariants: build.mutation<TranslateVariantsResponse, TranslateVariantsRequest>({
      query: (body) => ({ url: '/translate-variants', method: 'POST', body }),
      invalidatesTags: ['Providers', 'Me', 'AdminUsage', 'Users'],
    }),

    settings: build.query<UserSettings, void>({ query: () => '/settings', providesTags: ['Settings'] }),

    providers: build.query<ProviderView[], void>({
      query: () => '/providers',
      transformResponse: (r: ProviderListResponse) => r.items,
      providesTags: ['Providers'],
    }),
    updateProvider: build.mutation<ProviderView, { id: ProviderId; patch: ProviderUpdateRequest }>({
      query: ({ id, patch }) => ({ url: `/providers/${id}`, method: 'PUT', body: patch }),
      invalidatesTags: ['Providers'],
    }),
    testProvider: build.mutation<ProviderTestResponse, ProviderId>({
      query: (id) => ({ url: `/providers/${id}/test`, method: 'POST' }),
      invalidatesTags: ['Providers'],
    }),

    /** The caller's own profile, role and daily credits. */
    me: build.query<MeResponse, void>({ query: () => '/me', providesTags: ['Me'] }),

    // ── Admin: users ────────────────────────────────────────────────
    users: build.query<UserView[], void>({
      query: () => '/admin/users',
      transformResponse: (r: UserListResponse) => r.items,
      providesTags: ['Users'],
    }),
    createUser: build.mutation<UserTokenResponse, CreateUserRequest>({
      query: (body) => ({ url: '/admin/users', method: 'POST', body }),
      invalidatesTags: ['Users', 'AdminUsage'],
    }),
    updateUser: build.mutation<UserView, { id: string; patch: UpdateUserRequest }>({
      query: ({ id, patch }) => ({ url: `/admin/users/${id}`, method: 'PATCH', body: patch }),
      invalidatesTags: ['Users'],
    }),
    /** Issues a new token; the old one stops working. The token is returned once. */
    regenerateUserToken: build.mutation<UserTokenResponse, string>({
      query: (id) => ({ url: `/admin/users/${id}/token`, method: 'POST' }),
      invalidatesTags: ['Users'],
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Users', 'AdminUsage'],
    }),

    // ── Admin: config and usage ─────────────────────────────────────
    adminConfig: build.query<AdminConfig, void>({ query: () => '/admin/config', providesTags: ['AdminConfig'] }),
    updateAdminConfig: build.mutation<AdminConfig, AdminConfigUpdate>({
      query: (body) => ({ url: '/admin/config', method: 'PUT', body }),
      // A default-limit change affects every user's effective limit and the caller's own credits.
      invalidatesTags: ['AdminConfig', 'Users', 'Me', 'AdminUsage'],
    }),
    adminUsage: build.query<AdminUsageResponse, void>({ query: () => '/admin/usage', providesTags: ['AdminUsage'] }),
  }),
});

export const {
  useTranslateVariantsMutation,
  useSettingsQuery,
  useProvidersQuery,
  useUpdateProviderMutation,
  useTestProviderMutation,
  useMeQuery,
  useUsersQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useRegenerateUserTokenMutation,
  useDeleteUserMutation,
  useAdminConfigQuery,
  useUpdateAdminConfigMutation,
  useAdminUsageQuery,
} = api;
