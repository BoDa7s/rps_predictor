declare module "@supabase/supabase-js" {
  export type Session = {
    user?: { id?: string; email?: string | null } | null;
    [key: string]: unknown;
  };

  export interface SupabaseAuthSubscription {
    subscription: { unsubscribe(): void };
  }

  export interface SupabaseAuthClient {
    signInWithPassword(input: { email: string; password: string }): Promise<{ data: { session: Session | null }; error: unknown }>;
    signUp(input: {
      email: string;
      password: string;
      options?: { data?: Record<string, unknown> };
    }): Promise<{ data: { session: Session | null; user?: { id?: string | null } | null }; error: unknown }>;
    signOut(): Promise<{ error: unknown }>;
    getSession(): Promise<{ data: { session: Session | null } }>;
    onAuthStateChange(
      callback: (event: unknown, session: Session | null) => void,
    ): { data: SupabaseAuthSubscription };
    setSession(tokens: unknown): Promise<{ data: { session: Session | null }; error: unknown }>;
  }

  export interface SupabaseQueryBuilder {
    upsert(values: Record<string, unknown>): Promise<{ error: unknown }>;
  }

  export interface SupabaseClient {
    auth: SupabaseAuthClient;
    from(table: string): SupabaseQueryBuilder;
  }

  export function createClient(
    url: string,
    anonKey: string,
    options?: Record<string, unknown>,
  ): SupabaseClient;
}
