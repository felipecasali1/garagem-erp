export type IdempotencyAttempt = {
  fingerprint: string;
  key: string;
};

export function getIdempotencyAttempt(
  payload: object,
  current: IdempotencyAttempt | null,
): IdempotencyAttempt {
  const fingerprint = JSON.stringify(payload);
  if (fingerprint === undefined) {
    throw new Error("Não foi possível identificar os dados desta operação.");
  }

  return current?.fingerprint === fingerprint ? current : { fingerprint, key: crypto.randomUUID() };
}

/** Keep an unresolved attempt in this browser tab until the server confirms it. */
async function storedAttemptKey(namespace: string, userId: string, payload: object) {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `garagem-erp:pending-command:${namespace}:${userId}:${fingerprint}`;
}

function pendingAttemptKeys(namespace: string, userId: string) {
  const prefix = `garagem-erp:pending-command:${namespace}:${userId}:`;
  return Array.from({ length: sessionStorage.length }, (_, index) =>
    sessionStorage.key(index),
  ).filter((key): key is string => key !== null && key.startsWith(prefix));
}

const runningAttempts = new Map<string, number>();

export function hasStoredAttempts(namespace: string, userId: string) {
  return pendingAttemptKeys(namespace, userId).length > 0;
}

export function discardStoredAttempts(namespace: string, userId: string) {
  const keys = pendingAttemptKeys(namespace, userId);
  if (keys.some((key) => (runningAttempts.get(key) ?? 0) > 0)) {
    throw new Error("Aguarde a tentativa em andamento antes de iniciar outra.");
  }
  for (const key of keys) sessionStorage.removeItem(key);
}

export function storedAttemptPayloads<T>(namespace: string, userId: string): T[] {
  return pendingAttemptKeys(namespace, userId).flatMap((storageKey) => {
    try {
      const record = JSON.parse(sessionStorage.getItem(storageKey) ?? "null");
      return record && typeof record.key === "string" && record.payload
        ? [record.payload as T]
        : [];
    } catch {
      return [];
    }
  });
}

export async function discardStoredAttempt(namespace: string, userId: string, payload: object) {
  const storageKey = await storedAttemptKey(namespace, userId, payload);
  if ((runningAttempts.get(storageKey) ?? 0) > 0) return;
  sessionStorage.removeItem(storageKey);
}

export async function runWithStoredAttempt<T>(
  namespace: string,
  userId: string,
  payload: object,
  execute: (key: string) => Promise<T>,
  options?: { exclusive?: boolean; rememberPayload?: boolean; exclusiveMessage?: string },
): Promise<T> {
  const storageKey = await storedAttemptKey(namespace, userId, payload);
  let key: string;
  try {
    if (
      options?.exclusive &&
      pendingAttemptKeys(namespace, userId).some((entry) => entry !== storageKey)
    ) {
      throw new Error(
        options.exclusiveMessage ??
          "Há outro lançamento sem confirmação. Confira o resultado anterior antes de iniciar outro.",
      );
    }
    const stored = sessionStorage.getItem(storageKey);
    const savedRecord = stored && options?.rememberPayload ? JSON.parse(stored) : null;
    key = savedRecord?.key ?? stored ?? crypto.randomUUID();
    sessionStorage.setItem(
      storageKey,
      options?.rememberPayload ? JSON.stringify({ key, payload }) : key,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.startsWith("Há outro lançamento") ||
        error.message === options?.exclusiveMessage)
    )
      throw error;
    throw new Error(
      "O armazenamento desta aba está bloqueado. Habilite-o para continuar com segurança.",
    );
  }
  runningAttempts.set(storageKey, (runningAttempts.get(storageKey) ?? 0) + 1);
  let result: T;
  try {
    result = await execute(key);
  } finally {
    const remaining = (runningAttempts.get(storageKey) ?? 1) - 1;
    if (remaining > 0) runningAttempts.set(storageKey, remaining);
    else runningAttempts.delete(storageKey);
  }
  try {
    const stored = sessionStorage.getItem(storageKey);
    if (stored === key || (options?.rememberPayload && stored && JSON.parse(stored).key === key)) {
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    // A retained key safely replays the result if storage becomes unavailable.
  }
  return result;
}
