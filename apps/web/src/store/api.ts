import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
  type FetchBaseQueryError,
} from '@reduxjs/toolkit/query/react';
import {
  CLIENT_HEADER,
  type AdminFeedbackResponse,
  type AdminUsageResponse,
  type ApiErrorBody,
  type AuthConfigResponse,
  type AuthSessionResponse,
  type ChangePasswordRequest,
  type CreateUserRequest,
  type GoogleLoginRequest,
  type LoginRequest,
  type MeResponse,
  type NewSessionResponse,
  type ProviderId,
  type ProviderListResponse,
  type ProviderTestResponse,
  type ProviderUpdateRequest,
  type ProviderView,
  type SignupRequest,
  type TranslateVariantsRequest,
  type TranslateVariantsResponse,
  type UserListResponse,
  type UserPasswordResponse,
  type UserSettings,
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

/** Per-endpoint options. Sign-in endpoints answer 401 for wrong credentials, which must not end the session. */
interface EndpointOptions {
  skipTokenReject?: boolean;
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
const baseQuery: BaseQueryFn<string | FetchArgs, unknown, AppError, EndpointOptions> = async (args, api, options) => {
  const { apiUrl } = (api.getState() as RootState).connection;
  const req = typeof args === 'string' ? { url: args } : args;
  const result = await rawBaseQuery({ ...req, url: `${apiUrl}/api${req.url}` }, api, options);
  if (result.error) {
    const error = toAppError(result.error);
    if (error.status === 401 && !options?.skipTokenReject) api.dispatch(tokenRejected());
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
  tagTypes: ['Settings', 'Providers', 'Me', 'Users', 'AdminUsage', 'AdminFeedback'],
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

    /** The caller's own profile, role, plan, password state and daily credits. */
    me: build.query<MeResponse, void>({ query: () => '/me', providesTags: ['Me'] }),

    // ── Accounts: public sign-in ────────────────────────────────────
    authConfig: build.query<AuthConfigResponse, void>({ query: () => '/auth/config' }),
    signup: build.mutation<AuthSessionResponse, SignupRequest>({
      query: (body) => ({ url: '/auth/signup', method: 'POST', body }),
      extraOptions: { skipTokenReject: true },
    }),
    login: build.mutation<AuthSessionResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      extraOptions: { skipTokenReject: true },
    }),
    googleLogin: build.mutation<AuthSessionResponse, GoogleLoginRequest>({
      query: (body) => ({ url: '/auth/google', method: 'POST', body }),
      extraOptions: { skipTokenReject: true },
    }),

    // ── Accounts: signed in ─────────────────────────────────────────
    logout: build.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      extraOptions: { skipTokenReject: true },
    }),
    /** Clears mustChangePassword on the server; the caller also updates the cached `me` before navigating. */
    changePassword: build.mutation<void, ChangePasswordRequest>({
      query: (body) => ({ url: '/auth/change-password', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    /** Mints an extra session token, e.g. for the Chrome extension. */
    createSession: build.mutation<NewSessionResponse, void>({
      query: () => ({ url: '/auth/sessions', method: 'POST' }),
    }),

    // ── Admin: users ────────────────────────────────────────────────
    users: build.query<UserView[], void>({
      query: () => '/admin/users',
      transformResponse: (r: UserListResponse) => r.items,
      providesTags: ['Users'],
    }),
    createUser: build.mutation<UserPasswordResponse, CreateUserRequest>({
      query: (body) => ({ url: '/admin/users', method: 'POST', body }),
      invalidatesTags: ['Users', 'AdminUsage'],
    }),
    deleteUser: build.mutation<void, string>({
      query: (id) => ({ url: `/admin/users/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Users', 'AdminUsage'],
    }),

    // ── Admin: usage and feedback ───────────────────────────────────
    adminUsage: build.query<AdminUsageResponse, void>({ query: () => '/admin/usage', providesTags: ['AdminUsage'] }),
    adminFeedback: build.query<AdminFeedbackResponse, void>({ query: () => '/admin/feedback', providesTags: ['AdminFeedback'] }),
  }),
});

export const {
  useTranslateVariantsMutation,
  useSettingsQuery,
  useProvidersQuery,
  useUpdateProviderMutation,
  useTestProviderMutation,
  useMeQuery,
  useAuthConfigQuery,
  useSignupMutation,
  useLoginMutation,
  useGoogleLoginMutation,
  useLogoutMutation,
  useChangePasswordMutation,
  useCreateSessionMutation,
  useUsersQuery,
  useCreateUserMutation,
  useDeleteUserMutation,
  useAdminUsageQuery,
  useAdminFeedbackQuery,
} = api;
