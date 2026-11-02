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
