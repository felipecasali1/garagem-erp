import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

function requireEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Defina ${name} antes de executar a validação do primeiro usuário.`);
  }
  return value;
}

async function request(url, options) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(5_000),
  });
  const body = await response.text();
  let payload;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = body;
  }
  return { response, payload };
}

async function promptCredentials() {
  const readline = createInterface({ input, output });
  try {
    const email = await readline.question("E-mail do primeiro usuário Auth: ");
    const password = process.env.LOCAL_SETUP_USER_PASSWORD?.trim()
      ? process.env.LOCAL_SETUP_USER_PASSWORD.trim()
      : await readline.question("Senha do primeiro usuário Auth (não será salva): ");
    return { email: email.trim(), password };
  } finally {
    readline.close();
  }
}

async function main() {
  const apiUrl = requireEnvironment("VITE_SUPABASE_URL").replace(/\/+$/, "");
  const anonKey = requireEnvironment("VITE_SUPABASE_ANON_KEY");
  const credentials = await promptCredentials();

  const login = await request(`${apiUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "content-type": "application/json",
    },
    body: JSON.stringify(credentials),
  });
  if (!login.response.ok || !login.payload?.access_token || !login.payload?.user?.id) {
    throw new Error(
      `O login Auth falhou (HTTP ${login.response.status}). Verifique o e-mail, a senha e a confirmação do usuário no Studio.`,
    );
  }

  const accessToken = login.payload.access_token;
  const userId = encodeURIComponent(login.payload.user.id);
  const headers = {
    apikey: anonKey,
    Authorization: `Bearer ${accessToken}`,
  };
  const internalUser = await request(
    `${apiUrl}/rest/v1/users?auth_user_id=eq.${userId}&select=id,active&limit=1`,
    { headers },
  );
  if (
    !internalUser.response.ok ||
    !Array.isArray(internalUser.payload) ||
    internalUser.payload.length !== 1
  ) {
    throw new Error(
      "O login Auth funcionou, mas não existe um User interno vinculado. Execute bootstrap_internal_user com o mesmo e-mail.",
    );
  }
  if (internalUser.payload[0].active !== true) {
    throw new Error("O User interno existe, mas está inativo.");
  }

  const authorizedVehicleRead = await request(`${apiUrl}/rest/v1/vehicles?select=id&limit=1`, {
    headers,
  });
  if (!authorizedVehicleRead.response.ok) {
    throw new Error(
      `O usuário autenticado não conseguiu consultar o estoque de veículos (HTTP ${authorizedVehicleRead.response.status}).`,
    );
  }

  console.log(
    "Validação concluída: Auth, User interno ativo e leitura autorizada de veículos funcionaram.",
  );
}

main().catch((error) => {
  console.error(
    `Validação do primeiro usuário falhou: ${error instanceof Error ? error.message : error}`,
  );
  process.exitCode = 1;
});
