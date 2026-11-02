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
const overrideFile = join(projectRoot, "compose/supabase/postgrest-test.override.yml");
const projectName = `garagem-postgrest-test-${randomBytes(5).toString("hex")}`;
const apiBase = {};
const config = {};

function dockerEnvironment() {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) {
    if (name.startsWith("GARAGEM_LOCAL_") || name.startsWith("GARAGEM_POSTGREST_TEST_")) {
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

async function createVehicle(index, status = "available") {
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
    published: status === "available",
    status,
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

async function callRpc(user, name, args) {
  return requestJson(`${apiBase.rest}/rpc/${name}`, {
    method: "POST",
    token: user.accessToken,
    body: args,
  });
}

function transitionSale(user, saleId, action, sale, payment, key = randomUUID()) {
  return callRpc(user, "transition_sale", {
    p_idempotency_key: key,
    p_sale_id: saleId,
    p_action: action,
    p_expected_sale_updated_at: sale.updated_at,
    p_expected_payment_updated_at: payment.updated_at,
  });
}

function updateSalePayment(user, saleId, sale, payment, overrides = {}) {
  return callRpc(user, "update_sale_payment_with_version", {
    p_idempotency_key: overrides.key ?? randomUUID(),
    p_sale_id: saleId,
    p_expected_sale_updated_at: sale.updated_at,
    p_expected_payment_updated_at: payment.updated_at,
    p_sale_price: 60000,
    p_discount: 1000,
    p_notes: "Venda revisada pelo teste",
    p_payment_method: "financing",
    p_down_payment: 5000,
    p_installments_count: 4,
    p_payment_date: "2026-12-01",
    ...overrides,
  });
}

function checklistItem(vehicleId) {
  return {
    p_idempotency_key: randomUUID(),
    p_vehicle_id: vehicleId,
    p_item: {
      title: "Preparar veículo para venda",
      description: null,
      category: "inspection",
      status: "pending",
      priority: "medium",
      estimated_cost: 100,
      actual_cost: 0,
      due_date: null,
      completion_date: null,
      responsible_employee_id: null,
      notes: null,
      attachments: [],
    },
  };
}

test(
  "sale and vehicle preparation writes remain safe through PostgREST",
  { timeout: 600_000 },
  async (t) => {
    if (process.env.GARAGEM_POSTGREST_TEST_INNER === "1") {
      config.anonKey = process.env.GARAGEM_POSTGREST_TEST_ANON_KEY;
      config.serviceKey = process.env.GARAGEM_POSTGREST_TEST_SERVICE_KEY;
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
      const output = compose(["run", "--rm", "--no-deps", "postgrest-integration"]);
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

    await t.test("null transition action cannot cancel a pending Sale", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(25);
      const created = await callCreateSale(user, saleArguments({ fixtures, vehicle, user }));
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const [sale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status,updated_at&id=eq.${created.data}`,
      );
      const [payment] = await authenticatedRows(
        user,
        "sale_payments",
        `select=id,payment_status,updated_at&sale_id=eq.${created.data}`,
      );
      const invalidAction = await callRpc(user, "transition_sale", {
        p_idempotency_key: randomUUID(),
        p_sale_id: created.data,
        p_action: null,
        p_expected_sale_updated_at: sale.updated_at,
        p_expected_payment_updated_at: payment.updated_at,
      });
      assert.equal(invalidAction.response.ok, false, JSON.stringify(invalidAction.data));

      const [unchangedSale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status&id=eq.${created.data}`,
      );
      const [unchangedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status&id=eq.${vehicle.id}`,
      );
      assert.equal(unchangedSale.status, "pending");
      assert.equal(unchangedVehicle.status, "reserved");
    });

    await t.test("completion and cancellation race to one atomic Sale transition", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(21);
      const created = await callCreateSale(user, saleArguments({ fixtures, vehicle, user }));
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const [sale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status,updated_at&id=eq.${created.data}`,
      );
      const [payment] = await authenticatedRows(
        user,
        "sale_payments",
        `select=id,payment_status,updated_at&sale_id=eq.${created.data}`,
      );

      const outcomes = await Promise.all([
        transitionSale(user, created.data, "complete", sale, payment),
        transitionSale(user, created.data, "cancel", sale, payment),
      ]);
      const winners = outcomes.filter(({ response }) => response.status === 200);
      const conflicts = outcomes.filter(({ response }) => response.status === 409);
      assert.equal(winners.length, 1, JSON.stringify(outcomes.map(({ data }) => data)));
      assert.equal(conflicts.length, 1, JSON.stringify(outcomes.map(({ data }) => data)));

      const [finalSale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status&id=eq.${created.data}`,
      );
      const [finalVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status,published&id=eq.${vehicle.id}`,
      );
      const finalPayments = await authenticatedRows(
        user,
        "sale_payments",
        `select=id,payment_status&sale_id=eq.${created.data}`,
      );
      const commissions = await authenticatedRows(
        user,
        "commissions",
        `select=id&sale_id=eq.${created.data}`,
      );
      const transactions = await authenticatedRows(
        user,
        "financial_transactions",
        `select=id,category&sale_id=eq.${created.data}`,
      );

      assert.equal(finalPayments.length, 1);
      if (finalSale.status === "completed") {
        assert.equal(finalVehicle.status, "sold");
        assert.equal(finalVehicle.published, false);
        assert.equal(finalPayments[0].payment_status, "partial");
        assert.equal(commissions.length, 1);
        assert.equal(transactions.length, 3);
      } else {
        assert.equal(finalSale.status, "canceled");
        assert.equal(finalVehicle.status, "available");
        assert.equal(finalVehicle.published, false);
        assert.equal(finalPayments[0].payment_status, "pending");
        assert.equal(commissions.length, 0);
        assert.equal(transactions.length, 0);
      }
    });

    await t.test("same transition key replays once and rejects a changed action", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(22);
      const created = await callCreateSale(user, saleArguments({ fixtures, vehicle, user }));
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const [sale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status,updated_at&id=eq.${created.data}`,
      );
      const [payment] = await authenticatedRows(
        user,
        "sale_payments",
        `select=id,payment_status,updated_at&sale_id=eq.${created.data}`,
      );
      const key = randomUUID();
      const [first, replay] = await Promise.all([
        transitionSale(user, created.data, "complete", sale, payment, key),
        transitionSale(user, created.data, "complete", sale, payment, key),
      ]);
      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(first.data, created.data);
      assert.equal(replay.data, created.data);

      const changedAction = await transitionSale(user, created.data, "cancel", sale, payment, key);
      assert.equal(changedAction.response.status, 409, JSON.stringify(changedAction.data));

      const commissions = await authenticatedRows(
        user,
        "commissions",
        `select=id&sale_id=eq.${created.data}`,
      );
      const transactions = await authenticatedRows(
        user,
        "financial_transactions",
        `select=id&sale_id=eq.${created.data}`,
      );
      assert.equal(commissions.length, 1);
      assert.equal(transactions.length, 3);
    });

    await t.test("Sale and Payment edits reject stale versions and replay safely", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(23);
      const created = await callCreateSale(user, saleArguments({ fixtures, vehicle, user }));
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const [sale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status,total_value,discount,notes,updated_at&id=eq.${created.data}`,
      );
      const [payment] = await authenticatedRows(
        user,
        "sale_payments",
        `select=id,payment_method,payment_status,down_payment,installments_count,payment_date,remaining_amount,updated_at&sale_id=eq.${created.data}`,
      );
      const directSaleUpdate = await requestJson(`${apiBase.rest}/sales?id=eq.${created.data}`, {
        method: "PATCH",
        token: user.accessToken,
        body: { status: "completed" },
      });
      const directPaymentUpdate = await requestJson(
        `${apiBase.rest}/sale_payments?id=eq.${payment.id}`,
        { method: "PATCH", token: user.accessToken, body: { down_payment: 1 } },
      );
      assert.equal(directSaleUpdate.response.ok, false);
      assert.equal(directPaymentUpdate.response.ok, false);

      const key = randomUUID();
      const args = {
        p_idempotency_key: key,
        p_sale_id: created.data,
        p_expected_sale_updated_at: sale.updated_at,
        p_expected_payment_updated_at: payment.updated_at,
        p_sale_price: 60000,
        p_discount: 1000,
        p_notes: "Venda revisada pelo teste",
        p_payment_method: "financing",
        p_down_payment: 5000,
        p_installments_count: 4,
        p_payment_date: "2026-12-01",
      };
      const first = await callRpc(user, "update_sale_payment_with_version", args);
      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      const replay = await callRpc(user, "update_sale_payment_with_version", args);
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(replay.data, created.data);

      const changedPayload = await callRpc(user, "update_sale_payment_with_version", {
        ...args,
        p_sale_price: 59000,
      });
      assert.equal(changedPayload.response.status, 409, JSON.stringify(changedPayload.data));

      const stale = await updateSalePayment(user, created.data, sale, payment, {
        p_notes: "Tentativa desatualizada",
      });
      assert.equal(stale.response.status, 409, JSON.stringify(stale.data));
      assert.match(JSON.stringify(stale.data), /STALE_RECORD/i);

      const [updatedSale] = await authenticatedRows(
        user,
        "sales",
        `select=id,status,total_value,discount,notes&id=eq.${created.data}`,
      );
      const [updatedPayment] = await authenticatedRows(
        user,
        "sale_payments",
        `select=id,payment_method,payment_status,down_payment,installments_count,payment_date,remaining_amount&sale_id=eq.${created.data}`,
      );
      assert.equal(updatedSale.status, "pending");
      assert.equal(Number(updatedSale.total_value), 59000);
      assert.equal(Number(updatedSale.discount), 1000);
      assert.equal(updatedSale.notes, "Venda revisada pelo teste");
      assert.equal(updatedPayment.payment_method, "financing");
      assert.equal(updatedPayment.payment_status, "pending");
      assert.equal(Number(updatedPayment.down_payment), 5000);
      assert.equal(updatedPayment.installments_count, 4);
      assert.equal(updatedPayment.payment_date, "2026-12-01");
      assert.equal(Number(updatedPayment.remaining_amount), 54000);

      const staleTransition = await transitionSale(user, created.data, "complete", sale, payment);
      assert.equal(staleTransition.response.status, 409, JSON.stringify(staleTransition.data));
    });

    await t.test(
      "failed completion leaves Sale, Vehicle, Payment and finance untouched",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(24);
        const created = await callCreateSale(
          user,
          saleArguments({
            fixtures,
            vehicle,
            user,
            overrides: { p_notes: "__TEST_FORCE_FINANCIAL_FAILURE__" },
          }),
        );
        assert.equal(created.response.status, 200, JSON.stringify(created.data));
        const [sale] = await authenticatedRows(
          user,
          "sales",
          `select=id,status,updated_at&id=eq.${created.data}`,
        );
        const [payment] = await authenticatedRows(
          user,
          "sale_payments",
          `select=id,payment_status,updated_at&sale_id=eq.${created.data}`,
        );
        const failed = await transitionSale(user, created.data, "complete", sale, payment);
        assert.equal(failed.response.ok, false, JSON.stringify(failed.data));

        const [unchangedSale] = await authenticatedRows(
          user,
          "sales",
          `select=id,status&id=eq.${created.data}`,
        );
        const [unchangedPayment] = await authenticatedRows(
          user,
          "sale_payments",
          `select=id,payment_status&sale_id=eq.${created.data}`,
        );
        const [unchangedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status,published&id=eq.${vehicle.id}`,
        );
        const commissions = await authenticatedRows(
          user,
          "commissions",
          `select=id&sale_id=eq.${created.data}`,
        );
        const transactions = await authenticatedRows(
          user,
          "financial_transactions",
          `select=id&sale_id=eq.${created.data}`,
        );
        assert.equal(unchangedSale.status, "pending");
        assert.equal(unchangedPayment.payment_status, "pending");
        assert.equal(unchangedVehicle.status, "reserved");
        assert.equal(unchangedVehicle.published, false);
        assert.equal(commissions.length, 0);
        assert.equal(transactions.length, 0);
      },
    );

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

    await t.test(
      "opening and reopening work returns an available Vehicle to preparation",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(6);
        const created = await callRpc(
          user,
          "create_vehicle_checklist_item",
          checklistItem(vehicle.id),
        );
        assert.equal(created.response.status, 200, JSON.stringify(created.data));
        const item = created.data;
        let [currentVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status,published,updated_at&id=eq.${vehicle.id}`,
        );
        assert.equal(currentVehicle.status, "in_repair");
        assert.equal(currentVehicle.published, false);

        const completed = await callRpc(user, "update_vehicle_checklist_item", {
          p_item_id: item.id,
          p_expected_updated_at: item.updated_at,
          p_changes: { status: "completed", completion_date: "2026-11-02" },
        });
        assert.equal(completed.response.status, 200, JSON.stringify(completed.data));
        const finished = await callRpc(user, "finish_vehicle_preparation", {
          p_vehicle_id: vehicle.id,
          p_expected_updated_at: currentVehicle.updated_at,
        });
        assert.equal(finished.response.status, 200, JSON.stringify(finished.data));
        currentVehicle = finished.data;
        assert.equal(currentVehicle.status, "available");

        const reopened = await callRpc(user, "update_vehicle_checklist_item", {
          p_item_id: item.id,
          p_expected_updated_at: completed.data.updated_at,
          p_changes: { status: "pending", completion_date: null },
        });
        assert.equal(reopened.response.status, 200, JSON.stringify(reopened.data));
        const [reopenedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status,published&id=eq.${vehicle.id}`,
        );
        assert.equal(reopenedVehicle.status, "in_repair");
        assert.equal(reopenedVehicle.published, false);

        const bypassFinish = await requestJson(`${apiBase.rest}/vehicles?id=eq.${vehicle.id}`, {
          method: "PATCH",
          admin: true,
          body: { status: "available", published: false },
        });
        assert.equal(bypassFinish.response.ok, false, JSON.stringify(bypassFinish.data));
      },
    );

    await t.test(
      "repeating checklist creation with the same key returns the same task",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(11);
        const args = checklistItem(vehicle.id);
        const [first, retry] = await Promise.all([
          callRpc(user, "create_vehicle_checklist_item", args),
          callRpc(user, "create_vehicle_checklist_item", args),
        ]);

        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
        assert.equal(retry.data.id, first.data.id);

        const rows = await authenticatedRows(
          user,
          "vehicle_checklist_items",
          `select=id&vehicle_id=eq.${vehicle.id}`,
        );
        assert.equal(rows.length, 1);

        const reusedKeyWithDifferentTask = await callRpc(user, "create_vehicle_checklist_item", {
          ...args,
          p_item: { ...args.p_item, title: "Outra tarefa" },
        });
        assert.equal(reusedKeyWithDifferentTask.response.status, 409);
        assert.match(JSON.stringify(reusedKeyWithDifferentTask.data), /idempotência/i);
        const unchangedRows = await authenticatedRows(
          user,
          "vehicle_checklist_items",
          `select=id&vehicle_id=eq.${vehicle.id}`,
        );
        assert.equal(unchangedRows.length, 1);
      },
    );

    await t.test("stale Vehicle and ChecklistItem writes are rejected", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(7);
      const [loadedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status,cost_price,updated_at&id=eq.${vehicle.id}`,
      );
      const firstSave = await callRpc(user, "update_vehicle_with_version", {
        p_vehicle_id: vehicle.id,
        p_expected_updated_at: loadedVehicle.updated_at,
        p_changes: { cost_price: 51000 },
      });
      assert.equal(firstSave.response.status, 200, JSON.stringify(firstSave.data));
      const staleSave = await callRpc(user, "update_vehicle_with_version", {
        p_vehicle_id: vehicle.id,
        p_expected_updated_at: loadedVehicle.updated_at,
        p_changes: { cost_price: 52000 },
      });
      assert.equal(staleSave.response.status, 409, JSON.stringify(staleSave.data));
      assert.match(JSON.stringify(staleSave.data), /STALE_RECORD/i);
      const [storedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,cost_price&id=eq.${vehicle.id}`,
      );
      assert.equal(Number(storedVehicle.cost_price), 51000);

      const created = await callRpc(
        user,
        "create_vehicle_checklist_item",
        checklistItem(vehicle.id),
      );
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const firstItemSave = await callRpc(user, "update_vehicle_checklist_item", {
        p_item_id: created.data.id,
        p_expected_updated_at: created.data.updated_at,
        p_changes: { status: "in_progress", actual_cost: 50 },
      });
      assert.equal(firstItemSave.response.status, 200, JSON.stringify(firstItemSave.data));
      const staleItemSave = await callRpc(user, "update_vehicle_checklist_item", {
        p_item_id: created.data.id,
        p_expected_updated_at: created.data.updated_at,
        p_changes: { status: "completed", actual_cost: 900 },
      });
      assert.equal(staleItemSave.response.status, 409, JSON.stringify(staleItemSave.data));
      const [storedItem] = await authenticatedRows(
        user,
        "vehicle_checklist_items",
        `select=id,status,actual_cost&id=eq.${created.data.id}`,
      );
      assert.equal(storedItem.status, "in_progress");
      assert.equal(Number(storedItem.actual_cost), 50);
    });

    await t.test("finishing preparation and opening a task serialize on the Vehicle", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(8, "in_repair");
      const [loadedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status,updated_at&id=eq.${vehicle.id}`,
      );
      const [finish, openTask] = await Promise.all([
        callRpc(user, "finish_vehicle_preparation", {
          p_vehicle_id: vehicle.id,
          p_expected_updated_at: loadedVehicle.updated_at,
        }),
        callRpc(user, "create_vehicle_checklist_item", checklistItem(vehicle.id)),
      ]);
      assert.ok(
        finish.response.ok || finish.response.status === 409,
        `Finalização inesperada: ${JSON.stringify(finish.data)}`,
      );
      assert.equal(openTask.response.status, 200, JSON.stringify(openTask.data));

      const [storedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status,published&id=eq.${vehicle.id}`,
      );
      const openItems = await authenticatedRows(
        user,
        "vehicle_checklist_items",
        `select=id,status&vehicle_id=eq.${vehicle.id}&status=not.in.(completed,cancelled)`,
      );
      assert.equal(openItems.length, 1);
      assert.notEqual(storedVehicle.status, "available");
      assert.equal(storedVehicle.published, false);
    });

    await t.test("financial-only users cannot create preparation ChecklistItems", async () => {
      const vehicle = await createVehicle(9);
      const result = await callRpc(
        fixtures.unauthorizedUser,
        "create_vehicle_checklist_item",
        checklistItem(vehicle.id),
      );
      assert.equal(result.response.status, 403, JSON.stringify(result.data));
    });

    await t.test(
      "direct checklist inserts synchronize readiness while stale updates stay blocked",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(10);
        const [loadedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,cost_price&id=eq.${vehicle.id}`,
        );
        const directVehicleUpdate = await requestJson(
          `${apiBase.rest}/vehicles?id=eq.${vehicle.id}`,
          {
            method: "PATCH",
            token: user.accessToken,
            body: { cost_price: 1 },
          },
        );
        assert.equal(
          directVehicleUpdate.response.ok,
          false,
          JSON.stringify(directVehicleUpdate.data),
        );

        const itemInput = checklistItem(vehicle.id);
        const directItemInsert = await requestJson(`${apiBase.rest}/vehicle_checklist_items`, {
          method: "POST",
          token: user.accessToken,
          body: { vehicle_id: vehicle.id, ...itemInput.p_item },
        });
        assert.equal(directItemInsert.response.status, 201, JSON.stringify(directItemInsert.data));
        const directItemUpdate = await requestJson(
          `${apiBase.rest}/vehicle_checklist_items?id=eq.${directItemInsert.data[0].id}`,
          { method: "PATCH", token: user.accessToken, body: { status: "completed" } },
        );
        assert.equal(directItemUpdate.response.ok, false, JSON.stringify(directItemUpdate.data));

        const [storedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,cost_price,status,published&id=eq.${vehicle.id}`,
        );
        assert.equal(Number(storedVehicle.cost_price), Number(loadedVehicle.cost_price));
        assert.equal(storedVehicle.status, "in_repair");
        assert.equal(storedVehicle.published, false);
      },
    );
  },
);
