import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const composeFile = join(projectRoot, "docker-compose.yml");
const overrideFile = join(projectRoot, "compose/supabase/sale-test.override.yml");
const projectName = `garagem-sale-test-${randomBytes(5).toString("hex")}`;
const apiBase = {};
const config = {};

function dockerEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GARAGEM_LOCAL_") || name.startsWith("GARAGEM_SALES_TEST_")) {
      delete environment[name];
    }
  }
  return environment;
}

function legacyJwt(role, secret) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ role, iss: "supabase", iat: issuedAt, exp: issuedAt + 3600 }),
  ).toString("base64url");
  const content = `${header}.${payload}`;
  const signature = createHmac("sha256", secret).update(content).digest("base64url");
  return `${content}.${signature}`;
}

function runDocker(args, { input } = {}) {
  const result = spawnSync("docker", args, {
    cwd: projectRoot,
    encoding: "utf8",
    input,
    env: dockerEnvironment(),
    timeout: 600_000,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const output = [result.stderr, result.stdout].filter(Boolean).join("\n");
    throw new Error(
      `docker ${args.slice(0, 3).join(" ")} falhou (código ${result.status}).\n${output}`,
    );
  }
  return result.stdout.trim();
}

function compose(args, options) {
  return runDocker(
    [
      "compose",
      "--project-name",
      projectName,
      "--env-file",
      config.envFile,
      "--file",
      composeFile,
      "--file",
      overrideFile,
      ...args,
    ],
    options,
  );
}

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

async function initializeDisposableCompose() {
  const tempDirectory = await mkdtemp(join(tmpdir(), `${projectName}-`));
  config.tempDirectory = tempDirectory;
  config.envFile = join(tempDirectory, "compose.env");
  const jwtSecret = randomBytes(48).toString("base64url");
  Object.assign(config, {
    anonKey: legacyJwt("anon", jwtSecret),
    serviceKey: legacyJwt("service_role", jwtSecret),
    jwtSecret,
    dbPassword: randomSecret(),
  });
  const values = {
    GARAGEM_LOCAL_DB_PASSWORD: config.dbPassword,
    GARAGEM_LOCAL_JWT_SECRET: jwtSecret,
    GARAGEM_LOCAL_ANON_KEY: config.anonKey,
    GARAGEM_LOCAL_SERVICE_ROLE_KEY: config.serviceKey,
    GARAGEM_LOCAL_META_CRYPTO_KEY: randomBytes(32).toString("base64url"),
    GARAGEM_LOCAL_DASHBOARD_USERNAME: "integration-test",
    GARAGEM_LOCAL_DASHBOARD_PASSWORD: randomSecret(24),
    GARAGEM_LOCAL_APP_PORT: "3101",
    GARAGEM_LOCAL_API_PORT: "8000",
    GARAGEM_LOCAL_NETWORK_NAME: `${projectName}-network`,
    GARAGEM_LOCAL_DB_VOLUME_NAME: `${projectName}-db`,
  };
  await writeFile(
    config.envFile,
    `${Object.entries(values)
      .map(([name, value]) => `${name}=${value}`)
      .join("\n")}\n`,
    { mode: 0o600 },
  );

  compose(["up", "--detach", "--wait", "db", "auth"]);
  compose(["run", "--rm", "migrations"]);
  compose(["up", "--detach", "--wait", "rest"]);
  compose(["run", "--rm", "sales-test-fixture"]);
}

async function requestJson(url, { method = "GET", token, body, admin = false } = {}) {
  const headers = {
    apikey: admin ? config.serviceKey : config.anonKey,
    Authorization: `Bearer ${token ?? (admin ? config.serviceKey : config.anonKey)}`,
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method === "POST" && url.startsWith(apiBase.rest)) headers.Prefer = "return=representation";
  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { response, data };
}

async function restInsert(table, row) {
  const { response, data } = await requestJson(`${apiBase.rest}/${table}`, {
    method: "POST",
    admin: true,
    body: row,
  });
  assert.equal(response.status, 201, `Seed ${table} falhou: ${JSON.stringify(data)}`);
  return Array.isArray(data) ? data[0] : data;
}

async function createAuthenticatedUser(index, role = "seller") {
  const email = `sale-test-${index}@example.test`;
  const password = `${randomSecret(12)}Aa1!`;
  const created = await requestJson(`${apiBase.auth}/admin/users`, {
    method: "POST",
    admin: true,
    body: { email, password, email_confirm: true },
  });
  assert.equal(
    created.response.status,
    200,
    `Criação Auth falhou: ${JSON.stringify(created.data)}`,
  );

  const person = await restInsert("people", {
    name: `Usuário teste ${index}`,
    type: "individual",
  });
  const employee = await restInsert("employees", {
    person_id: person.id,
    position: "Vendedor",
    salary: 0,
    commission_rate: 200,
    commission_type: "fixed",
    hired_at: "2026-01-01",
  });
  await restInsert("users", {
    auth_user_id: created.data.id,
    person_id: person.id,
    employee_id: employee.id,
    access_role: role,
    active: true,
  });

  const loggedIn = await requestJson(`${apiBase.auth}/token?grant_type=password`, {
    method: "POST",
    body: { email, password },
  });
  assert.equal(
    loggedIn.response.status,
    200,
    `Login Auth falhou: ${JSON.stringify(loggedIn.data)}`,
  );
  return { accessToken: loggedIn.data.access_token, employeeId: employee.id };
}

async function createVehicle(index) {
  return restInsert("vehicles", {
    plate: `TST${String(index).padStart(4, "0")}`,
    brand: "Toyota",
    model: `Corolla Teste ${index}`,
    color: "Prata",
    fuel_type: "flex",
    transmission: "automatic",
    manufacture_year: 2024,
    model_year: 2025,
    current_mileage: 100,
    cost_price: 50000,
    sale_price: 65000,
    published: true,
    status: "available",
  });
}

async function seedFixtures() {
  const customerPerson = await restInsert("people", {
    name: "Cliente teste de reserva",
    type: "individual",
  });
  const customer = await restInsert("customers", { person_id: customerPerson.id, active: true });
  const users = [await createAuthenticatedUser(1), await createAuthenticatedUser(2)];
  const unauthorizedUser = await createAuthenticatedUser(3, "financial");
  const vehicles = [];
  for (let index = 1; index <= 5; index += 1) vehicles.push(await createVehicle(index));
  return { customerId: customer.id, users, unauthorizedUser, vehicles };
}

function saleArguments({ fixtures, vehicle, user, key = randomUUID(), overrides = {} }) {
  return {
    p_idempotency_key: key,
    p_vehicle_id: vehicle.id,
    p_customer_id: fixtures.customerId,
    p_employee_id: user.employeeId,
    p_status: "pending",
    p_sale_date: "2026-11-02",
    p_sale_price: 65000,
    p_discount: 0,
    p_notes: "Venda via teste de integração",
    p_payment_method: "financing",
    p_payment_status: "pending",
    p_down_payment: 10000,
    p_installments_count: 1,
    p_payment_date: "2026-11-02",
    ...overrides,
  };
}

async function callCreateSale(user, args) {
  return requestJson(`${apiBase.rest}/rpc/create_sale_with_reservation`, {
    method: "POST",
    token: user.accessToken,
    body: args,
  });
}

async function authenticatedRows(user, table, query) {
  const { response, data } = await requestJson(`${apiBase.rest}/${table}?${query}`, {
    token: user.accessToken,
  });
  assert.equal(response.status, 200, `Leitura ${table} falhou: ${JSON.stringify(data)}`);
  return data;
}

test(
  "create Sale reserves the Vehicle atomically and safely handles concurrent retries",
  { timeout: 600_000 },
  async (t) => {
    if (process.env.GARAGEM_SALES_TEST_INNER === "1") {
      config.anonKey = process.env.GARAGEM_SALES_TEST_ANON_KEY;
      config.serviceKey = process.env.GARAGEM_SALES_TEST_SERVICE_KEY;
      apiBase.auth = "http://auth:9999";
      apiBase.rest = "http://rest:3000";
    } else {
      t.after(async () => {
        try {
          compose(["down", "--volumes", "--remove-orphans"]);
        } finally {
          if (config.tempDirectory)
            await rm(config.tempDirectory, { recursive: true, force: true });
        }
      });

      await initializeDisposableCompose();
      const output = compose(["run", "--rm", "--no-deps", "sales-integration"]);
      process.stdout.write(`${output}\n`);
      return;
    }

    const fixtures = await seedFixtures();

    await t.test("concurrent users cannot create two Sales for one Vehicle", async () => {
      const vehicle = fixtures.vehicles[0];
      const outcomes = await Promise.all([
        callCreateSale(
          fixtures.users[0],
          saleArguments({ fixtures, vehicle, user: fixtures.users[0] }),
        ),
        callCreateSale(
          fixtures.users[1],
          saleArguments({ fixtures, vehicle, user: fixtures.users[1] }),
        ),
      ]);
      const success = outcomes.filter(({ response }) => response.ok);
      const conflicts = outcomes.filter(({ response }) => response.status === 409);

      assert.equal(success.length, 1, JSON.stringify(outcomes.map((item) => item.data)));
      assert.equal(conflicts.length, 1, JSON.stringify(outcomes.map((item) => item.data)));
      assert.match(JSON.stringify(conflicts[0].data), /disponível|reservado/i);
      assert.equal(typeof success[0].data, "number");

      const sales = await authenticatedRows(
        fixtures.users[0],
        "sales",
        `select=id,status&vehicle_id=eq.${vehicle.id}`,
      );
      const payments = await authenticatedRows(
        fixtures.users[0],
        "sale_payments",
        `select=id,sale_id&sale_id=eq.${success[0].data}`,
      );
      const [reservedVehicle] = await authenticatedRows(
        fixtures.users[0],
        "vehicles",
        `select=id,status,published&id=eq.${vehicle.id}`,
      );

      assert.equal(sales.length, 1);
      assert.equal(payments.length, 1);
      assert.equal(reservedVehicle.status, "reserved");
      assert.equal(reservedVehicle.published, false);
    });

    await t.test("the same key replays the original Sale and rejects changed data", async () => {
      const vehicle = fixtures.vehicles[1];
      const key = randomUUID();
      const args = saleArguments({
        fixtures,
        vehicle,
        user: fixtures.users[0],
        key,
        overrides: { p_installments_count: 3 },
      });
      const [first, replay] = await Promise.all([
        callCreateSale(fixtures.users[0], args),
        callCreateSale(fixtures.users[0], args),
      ]);
      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(first.data, replay.data);
      const [payment] = await authenticatedRows(
        fixtures.users[0],
        "sale_payments",
        `select=id,installments_count&sale_id=eq.${first.data}`,
      );
      assert.equal(payment.installments_count, 3);

      const changedPayload = await callCreateSale(fixtures.users[0], {
        ...args,
        p_sale_price: 64000,
      });
      assert.equal(changedPayload.response.status, 409, JSON.stringify(changedPayload.data));
      assert.match(JSON.stringify(changedPayload.data), /idempot|chave/i);
    });

    await t.test("a new key is a new intent but cannot sell a reserved Vehicle", async () => {
      const vehicle = fixtures.vehicles[1];
      const duplicateIntent = await callCreateSale(
        fixtures.users[1],
        saleArguments({ fixtures, vehicle, user: fixtures.users[1] }),
      );
      assert.equal(duplicateIntent.response.status, 409, JSON.stringify(duplicateIntent.data));
      const sales = await authenticatedRows(
        fixtures.users[0],
        "sales",
        `select=id&vehicle_id=eq.${vehicle.id}`,
      );
      assert.equal(sales.length, 1);
    });

    await t.test(
      "failed financial effect rolls back Sale, Payment and Vehicle reservation",
      async () => {
        const vehicle = fixtures.vehicles[2];
        const args = saleArguments({
          fixtures,
          vehicle,
          user: fixtures.users[0],
          overrides: {
            p_status: "completed",
            p_notes: "__TEST_FORCE_FINANCIAL_FAILURE__",
          },
        });
        const paymentsBefore = await authenticatedRows(
          fixtures.users[0],
          "sale_payments",
          "select=id",
        );
        const failed = await callCreateSale(fixtures.users[0], args);
        assert.equal(failed.response.ok, false, JSON.stringify(failed.data));
        const sales = await authenticatedRows(
          fixtures.users[0],
          "sales",
          `select=id&vehicle_id=eq.${vehicle.id}`,
        );
        const [unchangedVehicle] = await authenticatedRows(
          fixtures.users[0],
          "vehicles",
          `select=id,status,published&id=eq.${vehicle.id}`,
        );
        const paymentsAfter = await authenticatedRows(
          fixtures.users[0],
          "sale_payments",
          "select=id",
        );
        assert.equal(sales.length, 0);
        assert.equal(paymentsAfter.length, paymentsBefore.length);
        assert.equal(unchangedVehicle.status, "available");
        assert.equal(unchangedVehicle.published, true);

        const retry = await callCreateSale(fixtures.users[0], {
          ...args,
          p_notes: "Falha anterior foi revertida",
        });
        assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
        const payments = await authenticatedRows(
          fixtures.users[0],
          "sale_payments",
          `select=id&sale_id=eq.${retry.data}`,
        );
        assert.equal(payments.length, 1);
      },
    );

    await t.test("completed Sale creates its initial financial effects atomically", async () => {
      const manager = await createAuthenticatedUser(4, "manager");
      const vehicle = fixtures.vehicles[3];
      const result = await callCreateSale(
        manager,
        saleArguments({
          fixtures,
          vehicle,
          user: manager,
          overrides: {
            p_status: "completed",
            p_payment_method: "financing",
            p_down_payment: 10000,
          },
        }),
      );
      assert.equal(result.response.status, 200, JSON.stringify(result.data));

      const [completedVehicle] = await authenticatedRows(
        manager,
        "vehicles",
        `select=id,status,published&id=eq.${vehicle.id}`,
      );
      const transactions = await authenticatedRows(
        manager,
        "financial_transactions",
        `select=id,type,category,amount,status&sale_id=eq.${result.data}`,
      );
      const commissions = await authenticatedRows(
        manager,
        "commissions",
        `select=id,amount&sale_id=eq.${result.data}`,
      );
      assert.equal(completedVehicle.status, "sold");
      assert.equal(completedVehicle.published, false);
      assert.equal(transactions.length, 3);
      assert.equal(commissions.length, 1);
    });

    await t.test("financial-only users cannot create a Sale", async () => {
      const result = await callCreateSale(
        fixtures.unauthorizedUser,
        saleArguments({
          fixtures,
          vehicle: fixtures.vehicles[4],
          user: fixtures.unauthorizedUser,
        }),
      );
      assert.equal(result.response.status, 403, JSON.stringify(result.data));
    });
  },
);
