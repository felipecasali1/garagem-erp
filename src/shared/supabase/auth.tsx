import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import type { EmployeeAccessRole } from "@/modules/employees/types";
import { supabase } from "@/shared/supabase/client";

type SignInInput = {
  email: string;
  password: string;
};

type AuthContextValue = {
  loading: boolean;
  session: Session | null;
  accessRole: EmployeeAccessRole | null;
  isAdmin: boolean;
  accessError: string | null;
  signIn: (input: SignInInput) => Promise<void>;
  signOut: () => Promise<void>;
};

type SystemUserProfile = {
  id: number;
  active: boolean;
  access_role: EmployeeAccessRole;
  is_admin: boolean;
  auth_user_id: string | null;
  person_id: number;
  employee_id: number | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<SystemUserProfile | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);

  async function syncProfile(nextSession: Session | null) {
    if (!nextSession) {
      setSession(null);
      setProfile(null);
      setAccessError(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("users")
      .select("id, active, access_role, is_admin, auth_user_id, person_id, employee_id")
      .eq("auth_user_id", nextSession.user.id)
      .maybeSingle();

    if (error) {
      setAccessError(error.message);
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    if (!data) {
      setAccessError("Seu acesso ao sistema não está configurado.");
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    if (!data.active) {
      setAccessError("Seu acesso está desativado. Fale com um administrador.");
      await supabase.auth.signOut();
      setSession(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    setProfile(data satisfies SystemUserProfile);
    setAccessError(null);
    setSession(nextSession);
    setLoading(false);
  }

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error(error);
      }
      void syncProfile(data.session ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      void syncProfile(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(input: SignInInput) {
    setAccessError(null);
    const { error } = await supabase.auth.signInWithPassword(input);
    if (error) throw error;
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }

  return (
    <AuthContext.Provider
      value={{
        loading,
        session,
        accessRole: profile?.access_role ?? null,
        isAdmin: profile?.access_role === "admin",
        accessError,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return value;
}
