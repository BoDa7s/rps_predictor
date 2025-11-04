import type { Session } from "@supabase/supabase-js";
import { supabaseClient, isSupabaseConfigured } from "./supabaseClient";

export const api = {
  login: "/api/auth_login",
  signup: "/api/auth_signup",
  resetPassword: "/api/auth_reset_password",
  recoverUsername: "/api/auth_recover_username",
  autoLocalAuth: "/api/auto_local_auth",
  localAccounts: "/api/local_accounts",
} as const;

type ApiRoute = keyof typeof api;

interface EdgeFunctionResponse<T> {
  data: T | null;
  error: string | null;
  status: number | null;
}

interface EdgeErrorShape {
  error?: string;
  message?: string;
  code?: string;
  status?: number;
}

const ERROR_MESSAGE_MAP: Record<string, string> = {
  "username already exists": "That username is taken—try another.",
  "username already taken": "That username is taken—try another.",
  "duplicate username": "That username is taken—try another.",
  "username taken": "That username is taken—try another.",
  "invalid credentials": "Password incorrect.",
  "password incorrect": "Password incorrect.",
  "invalid password": "Password incorrect.",
  "user not found": "Password incorrect.",
  "recovery not unique": "We couldn’t uniquely identify you—add more detail.",
  "multiple matches": "We couldn’t uniquely identify you—add more detail.",
};

function mapEdgeError(error: unknown): string {
  if (!error) {
    return "Something went wrong. Please try again.";
  }

  const raw = typeof error === "string" ? error : (error as EdgeErrorShape).message ?? (error as EdgeErrorShape).error;
  const normalized = raw?.toString().trim();

  if (!normalized) {
    return "Something went wrong. Please try again.";
  }

  const friendly = ERROR_MESSAGE_MAP[normalized.toLowerCase()];
  return friendly ?? normalized;
}

async function callEdgeFunction<T, P extends Record<string, unknown>>(
  route: ApiRoute,
  payload: P,
): Promise<EdgeFunctionResponse<T>> {
  if (!isSupabaseConfigured) {
    return { data: null, error: "Supabase is not configured.", status: null };
  }
  try {
    const response = await fetch(api[route], {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const text = await response.text();
    let asJson: any = null;
    if (text) {
      try {
        asJson = JSON.parse(text);
      } catch {
        asJson = null;
      }
    }

    if (!response.ok) {
      return {
        data: null,
        error: mapEdgeError(asJson ?? { message: response.statusText }),
        status: response.status,
      };
    }

    return { data: (asJson as T) ?? null, error: null, status: response.status };
  } catch (error) {
    return { data: null, error: mapEdgeError(error), status: null };
  }
}

export interface EdgeSessionTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface AuthSessionResponse {
  session: EdgeSessionTokens;
  user?: Session["user"];
  message?: string;
}

export interface SignupPayload extends Record<string, unknown> {
  firstName: string;
  lastInitial: string;
  grade: string;
  age: string;
  username: string;
  password: string;
  school?: string;
  priorExperience?: string;
}

export interface LoginPayload extends Record<string, unknown> {
  username: string;
  password: string;
}

export interface RecoverUsernamePayload extends Record<string, unknown> {
  firstName: string;
  lastInitial: string;
  grade: string;
  password: string;
}

export interface ResetPasswordPayload extends Record<string, unknown> {
  firstName: string;
  lastInitial: string;
  grade: string;
  username: string;
  newPassword: string;
}

export interface RecoverUsernameResult {
  username: string;
}

interface ResetPasswordEdgeResult {
  success?: boolean;
  ok?: boolean;
}

export interface ResetPasswordResult {
  success: boolean;
}

export interface AutoLocalAuthPayload extends Record<string, unknown> {
  localProfileId: string;
  firstName?: string;
  lastInitial?: string;
  grade?: string;
  age?: string;
  school?: string;
  priorExperience?: string;
  appMetadata?: Record<string, unknown>;
}

export interface LocalAccountsRequestPayload extends Record<string, unknown> {
  deviceId: string;
}

export interface LocalAccountEntry {
  localProfileId: string;
  authUserId: string | null;
  username: string | null;
  firstName: string | null;
  lastInitial: string | null;
  grade: string | null;
  age: string | null;
  school: string | null;
  priorExperience: string | null;
  trainingCount: number | null;
  trainingCompleted: boolean | null;
  lastPlayedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface LocalAccountsResponse {
  accounts: LocalAccountEntry[];
}

export async function signup(payload: SignupPayload): Promise<EdgeFunctionResponse<AuthSessionResponse>> {
  return callEdgeFunction<AuthSessionResponse, SignupPayload>("signup", payload);
}

export async function login(payload: LoginPayload): Promise<EdgeFunctionResponse<AuthSessionResponse>> {
  return callEdgeFunction<AuthSessionResponse, LoginPayload>("login", payload);
}

export async function recoverUsername(
  payload: RecoverUsernamePayload,
): Promise<EdgeFunctionResponse<RecoverUsernameResult>> {
  return callEdgeFunction<RecoverUsernameResult, RecoverUsernamePayload>("recoverUsername", payload);
}

export async function resetPassword(
  payload: ResetPasswordPayload,
): Promise<EdgeFunctionResponse<ResetPasswordResult>> {
  const result = await callEdgeFunction<ResetPasswordEdgeResult, ResetPasswordPayload>(
    "resetPassword",
    payload,
  );

  if (!result.data) {
    return { data: null, error: result.error, status: result.status };
  }

  const success = Boolean(result.data.success ?? result.data.ok);
  return {
    data: { success },
    error: result.error,
    status: result.status,
  };
}

export async function setEdgeSession(tokens: EdgeSessionTokens): Promise<Session | null> {
  if (!supabaseClient) {
    throw new Error("Supabase is not configured.");
  }
  const { data, error } = await supabaseClient.auth.setSession(tokens);
  if (error) {
    throw error;
  }
  return data.session;
}

export async function autoLocalAuth(
  payload: AutoLocalAuthPayload,
): Promise<EdgeFunctionResponse<AuthSessionResponse>> {
  const normalizedPayload = {
    local_profile_id: payload.localProfileId,
    first_name: payload.firstName,
    last_initial: payload.lastInitial,
    grade: payload.grade,
    age: payload.age,
    school: payload.school,
    prior_experience: payload.priorExperience,
    app_metadata: payload.appMetadata,
  } satisfies Record<string, unknown>;
  return callEdgeFunction<AuthSessionResponse, typeof normalizedPayload>("autoLocalAuth", normalizedPayload);
}

export async function fetchLocalAccounts(
  payload: LocalAccountsRequestPayload,
): Promise<EdgeFunctionResponse<LocalAccountsResponse>> {
  const normalizedPayload = { device_id: payload.deviceId } satisfies Record<string, unknown>;
  return callEdgeFunction<LocalAccountsResponse, typeof normalizedPayload>("localAccounts", normalizedPayload);
}
