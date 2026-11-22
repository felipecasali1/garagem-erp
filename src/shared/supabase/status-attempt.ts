import {
  discardStoredAttempt,
  runWithStoredAttempt,
  storedAttemptPayloads,
} from "@/shared/lib/idempotency";
import { supabase } from "@/shared/supabase/client";

export class StatusCommandError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function currentUserId() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (!data.session?.user.id)
    throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  return data.session.user.id;
}

export async function getPendingStatusAttempt<T>(namespace: string): Promise<T | null> {
  return storedAttemptPayloads<T>(namespace, await currentUserId())[0] ?? null;
}

export async function runStatusAttempt<T, P extends object>(
  namespace: string,
  payload: P,
  execute: (key: string) => Promise<T>,
) {
  const userId = await currentUserId();
  const pending = storedAttemptPayloads<P>(namespace, userId);
  const recovered = pending.some((item) => JSON.stringify(item) === JSON.stringify(payload));
  try {
    const value = await runWithStoredAttempt(namespace, userId, payload, execute, {
      rememberPayload: true,
      exclusive: true,
      exclusiveMessage:
        "Existe uma tentativa anterior sem confirmação. Recupere-a antes de iniciar outra.",
    });
    return { value, recovered };
  } catch (error) {
    if (
      error instanceof StatusCommandError &&
      error.code &&
      /^(22|23|40|42|PT409)/.test(error.code)
    ) {
      await discardStoredAttempt(namespace, userId, payload);
    }
    throw error;
  }
}
