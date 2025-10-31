import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabaseClient } from "../lib/supabaseClient";
import type { EdgeSessionTokens } from "../lib/edgeFunctions";

export interface DemographicsProfile {
  user_id: string;
  first_name: string;
  last_initial: string;
  grade: string;
  age: string | null;
  school?: string | null;
  prior_experience?: string | null;
  trained?: boolean | null;
  training_count?: number | null;
  training_completed?: boolean | null;
}

export interface AuthContextValue {
  user: User | null;
  profile: DemographicsProfile | null;
  loading: boolean;
  setSessionFromFunction: (tokens: EdgeSessionTokens) => Promise<Session | null>;
  refreshProfile: () => Promise<DemographicsProfile | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function fetchProfile(userId: string): Promise<DemographicsProfile | null> {
  const client = supabaseClient;
  if (!client) return null;

  const { data, error } = await client
    .from("demographics_profiles")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as DemographicsProfile | null) ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<DemographicsProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const applySession = useCallback(
    async (session: Session | null) => {
      if (!mountedRef.current) return session;
      const nextUser = session?.user ?? null;
      setUser(nextUser);
      if (nextUser) {
        try {
          const nextProfile = await fetchProfile(nextUser.id);
          if (mountedRef.current) {
            setProfile(nextProfile);
          }
        } catch (error) {
          console.error("Failed to load profile", error);
          if (mountedRef.current) {
            setProfile(null);
          }
        }
      } else {
        setProfile(null);
      }
      return session;
    },
    [],
  );

  useEffect(() => {
    if (!supabaseClient) {
      if (mountedRef.current) {
        setLoading(false);
        setUser(null);
        setProfile(null);
      }
      return () => undefined;
    }

    let active = true;
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error) throw error;
        if (!active) return;
        await applySession(data.session ?? null);
      } catch (error) {
        console.error("Failed to restore session", error);
        if (active && mountedRef.current) {
          setUser(null);
          setProfile(null);
        }
      } finally {
        if (active && mountedRef.current) {
          setLoading(false);
        }
      }
    })();

    const { data: listener } = supabaseClient.auth.onAuthStateChange(async (_event: unknown, nextSession: Session | null) => {
      await applySession(nextSession ?? null);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [applySession]);

  const setSessionFromFunction = useCallback(
    async (tokens: EdgeSessionTokens) => {
      if (!supabaseClient) {
        throw new Error("Supabase authentication is not available.");
      }
      setLoading(true);
      try {
        const { data, error } = await supabaseClient.auth.setSession(tokens);
        if (error) {
          throw error;
        }
        await applySession(data.session ?? null);
        return data.session ?? null;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [applySession],
  );

  const refreshProfile = useCallback(async () => {
    if (!supabaseClient) {
      if (mountedRef.current) {
        setProfile(null);
        setLoading(false);
      }
      return null;
    }
    if (!user) {
      setProfile(null);
      return null;
    }
    setLoading(true);
    try {
      const nextProfile = await fetchProfile(user.id);
      if (mountedRef.current) {
        setProfile(nextProfile);
      }
      return nextProfile;
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [user]);

  const signOut = useCallback(async () => {
    if (!supabaseClient) {
      if (mountedRef.current) {
        setUser(null);
        setProfile(null);
      }
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        throw error;
      }
      if (mountedRef.current) {
        setUser(null);
        setProfile(null);
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, profile, loading, setSessionFromFunction, refreshProfile, signOut }),
    [loading, profile, refreshProfile, setSessionFromFunction, signOut, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
