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

async function createAuthAccount(email, password, userMetadata = {}, appMetadata = {}) {
  const created = await requestJson(`${apiBase.auth}/admin/users`, {
    method: "POST",
    admin: true,
    body: {
      email,
      password,
      email_confirm: true,
      user_metadata: userMetadata,
      app_metadata: appMetadata,
    },
  });
  assert.equal(
    created.response.status,
    200,
    `Criação Auth falhou: ${JSON.stringify(created.data)}`,
  );
  return created.data;
}

async function createEmployeeWithoutUser(index, email) {
  const person = await restInsert("people", {
    name: `Funcionário de lifecycle ${index}`,
    type: "individual",
    email,
  });
  const employee = await restInsert("employees", {
    person_id: person.id,
    position: "Vendedor",
    salary: 0,
    commission_rate: 0,
    commission_type: "fixed",
    active: true,
    hired_at: "2026-01-01",
  });
  return { person, employee };
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

async function createSupplier(index) {
  const person = await restInsert("people", {
    name: `Fornecedor teste ${index}`,
    type: "company",
  });
  return restInsert("suppliers", {
    person_id: person.id,
    supplier_type: "company",
    active: true,
  });
}

async function seedFixtures() {
  const customerPerson = await restInsert("people", {
    name: "Cliente teste de reserva",
    type: "individual",
  });
  const customer = await restInsert("customers", { person_id: customerPerson.id, active: true });
  const users = [await createAuthenticatedUser(1), await createAuthenticatedUser(2)];
  const financialOnlyUser = await createAuthenticatedUser(3, "financial");
  const managerUser = await createAuthenticatedUser(6, "manager");
  const supplier = await createSupplier(1);
  const vehicles = [];
  for (let index = 1; index <= 5; index += 1) vehicles.push(await createVehicle(index));
  return {
    customerId: customer.id,
    supplierId: supplier.id,
    users,
    financialOnlyUser,
    managerUser,
    vehicles,
  };
}

function personConfigurationArguments({ key = randomUUID(), cpf, name, roles, address }) {
  return {
    p_idempotency_key: key,
    p_person: {
      name,
      type: "individual",
      cpf,
      cnpj: null,
      phone: "67988887777",
      email: `${cpf}@example.test`,
    },
    p_roles: roles,
    p_primary_address: address,
  };
}

function primaryAddress(street) {
  return {
    street,
    number: "123",
    complement: "Casa",
    neighborhood: "Centro",
    city: "Campo Grande",
    state: "MS",
    zip_code: "79000000",
  };
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

function purchaseArguments({ fixtures, vehicle, key = randomUUID(), overrides = {} }) {
  return {
    p_idempotency_key: key,
    p_supplier_id: fixtures.supplierId,
    p_vehicle_id: vehicle.id,
    p_expected_vehicle_updated_at: vehicle.updated_at,
    p_total_value: 42000,
    p_purchase_date: "2026-11-02",
    p_status: "pending",
    p_notes: "Compra via teste de integração",
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

async function callCreatePurchase(user, args) {
  return callRpc(user, "create_purchase_atomically", args);
}

function transitionPurchase(user, purchaseId, action, expectedUpdatedAt, key = randomUUID()) {
  return callRpc(user, "transition_purchase", {
    p_idempotency_key: key,
    p_purchase_id: purchaseId,
    p_action: action,
    p_expected_updated_at: expectedUpdatedAt,
  });
}

function updatePurchase(user, purchaseId, expectedUpdatedAt, fixtures, overrides = {}) {
  return callRpc(user, "update_purchase_with_version", {
    p_idempotency_key: overrides.key ?? randomUUID(),
    p_purchase_id: purchaseId,
    p_expected_updated_at: expectedUpdatedAt,
    p_supplier_id: overrides.supplierId ?? fixtures.supplierId,
    p_total_value: overrides.totalValue ?? 39000,
    p_purchase_date: overrides.purchaseDate ?? "2026-11-03",
    p_notes: overrides.notes ?? "Compra revisada pelo teste",
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

async function callAdminRpc(name, args) {
  return requestJson(`${apiBase.rest}/rpc/${name}`, {
    method: "POST",
    admin: true,
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

function transitionFinancialTransaction(
  user,
  transactionId,
  action,
  expectedUpdatedAt,
  key = randomUUID(),
) {
  return callRpc(user, "transition_financial_transaction", {
    p_idempotency_key: key,
    p_transaction_id: transactionId,
    p_action: action,
    p_expected_updated_at: expectedUpdatedAt,
  });
}

function updateManualFinancialTransaction(user, transaction, overrides = {}) {
  return callRpc(user, "update_manual_financial_transaction_with_version", {
    p_idempotency_key: overrides.key ?? randomUUID(),
    p_transaction_id: transaction.id,
    p_expected_updated_at: overrides.expectedUpdatedAt ?? transaction.updated_at,
    p_amount: overrides.amount ?? 275,
    p_transaction_date: overrides.transactionDate ?? "2026-11-03",
    p_due_date: overrides.dueDate ?? "2026-11-30",
    p_description: overrides.description ?? "Despesa revisada pelo teste",
    p_related: overrides.related ?? "Fornecedor de teste",
  });
}

function settleInstallment(user, installment, key = randomUUID()) {
  return callRpc(user, "settle_installment", {
    p_idempotency_key: key,
    p_installment_id: installment.id,
    p_expected_updated_at: installment.updated_at,
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

function vehicleConfigurationArguments(index, key = randomUUID(), overrides = {}) {
  return {
    p_idempotency_key: key,
    p_vehicle: {
      plate: `CFG${String(index).padStart(4, "0")}`,
      chassis: null,
      vin: null,
      brand: "Honda",
      model: `Civic Configuração ${index}`,
      version: null,
      color: "Preto",
      fuel_type: "flex",
      transmission: "automatic",
      current_mileage: 100,
      manufacture_year: 2024,
      model_year: 2025,
      cost_price: 50000,
      sale_price: 65000,
      image: null,
      notes: null,
    },
    p_accessories: ["Teto solar", `Acessório ${index}`],
    p_checklist_items: [
      {
        title: `Inspeção inicial ${index}`,
        description: null,
        category: "inspection",
        priority: "medium",
        estimated_cost: 100,
        due_date: null,
        notes: null,
      },
    ],
    ...overrides,
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

    await t.test(
      "concurrent CompanySettings creation leaves one row and an authorized User can edit it",
      async () => {
        const user = fixtures.managerUser;
        const attempts = [
          {
            legal_name: "Garagem concorrente A",
            cnpj: "88999999000101",
            city: "Campo Grande",
          },
          {
            legal_name: "Garagem concorrente B",
            cnpj: "88999999000102",
            city: "Dourados",
          },
        ];
        const results = await Promise.all(
          attempts.map((body) =>
            requestJson(`${apiBase.rest}/company_settings`, {
              method: "POST",
              token: user.accessToken,
              body,
            }),
          ),
        );

        assert.equal(
          results.filter((result) => result.response.status === 201).length,
          1,
          JSON.stringify(results.map((result) => result.data)),
        );
        assert.equal(
          results.filter((result) => result.response.status === 409).length,
          1,
          JSON.stringify(results.map((result) => result.data)),
        );

        const listed = await requestJson(
          `${apiBase.rest}/company_settings?select=id,legal_name,cnpj`,
          { token: user.accessToken },
        );
        assert.equal(listed.response.status, 200, JSON.stringify(listed.data));
        assert.equal(listed.data.length, 1);

        const settingsId = listed.data[0].id;
        const edited = await requestJson(`${apiBase.rest}/company_settings?id=eq.${settingsId}`, {
          method: "PATCH",
          token: user.accessToken,
          body: { legal_name: "Garagem autorizada editada" },
        });
        assert.equal(edited.response.ok, true, JSON.stringify(edited.data));

        const confirmed = await requestJson(
          `${apiBase.rest}/company_settings?select=id,legal_name&id=eq.${settingsId}`,
          { token: user.accessToken },
        );
        assert.equal(confirmed.response.status, 200, JSON.stringify(confirmed.data));
        assert.equal(confirmed.data.length, 1);
        assert.equal(confirmed.data[0].legal_name, "Garagem autorizada editada");
      },
    );

    await t.test(
      "User provisioning stays pending through Auth downtime and resumes once",
      async () => {
        const operationId = randomUUID();
        const email = `user-lifecycle-${randomUUID()}@example.test`;
        const password = `${randomSecret(12)}Aa1!`;
        const { employee } = await createEmployeeWithoutUser("criação", email);
        const arguments_ = {
          p_operation_id: operationId,
          p_employee_id: employee.id,
          p_access_role: "seller",
          p_is_admin: false,
          p_active: true,
        };

        const pending = await callAdminRpc("begin_user_provisioning", arguments_);
        assert.equal(pending.response.status, 200, JSON.stringify(pending.data));
        assert.equal(pending.data.status, "pending");
        assert.equal(pending.data.auth_user_id, null);

        const prematureCompletion = await callAdminRpc("complete_user_provisioning", {
          p_operation_id: operationId,
          p_auth_user_id: randomUUID(),
        });
        assert.equal(prematureCompletion.response.ok, false);

        const authUser = await createAuthAccount(
          email,
          password,
          {
            name: "Funcionário de lifecycle criação",
          },
          {
            garagem_erp_provision_operation_id: operationId,
          },
        );
        const resumed = await callAdminRpc("begin_user_provisioning", arguments_);
        assert.equal(resumed.response.status, 200, JSON.stringify(resumed.data));
        assert.equal(resumed.data.operation_id, operationId);
        assert.equal(resumed.data.status, "pending");

        const linkedAuth = await callAdminRpc("record_user_auth_provisioned", {
          p_operation_id: operationId,
          p_auth_user_id: authUser.id,
        });
        assert.equal(linkedAuth.response.ok, true, JSON.stringify(linkedAuth.data));
        const completed = await callAdminRpc("complete_user_provisioning", {
          p_operation_id: operationId,
          p_auth_user_id: authUser.id,
        });
        assert.equal(completed.response.status, 200, JSON.stringify(completed.data));
        const userId = completed.data;

        const replay = await callAdminRpc("begin_user_provisioning", arguments_);
        assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
        assert.equal(replay.data.status, "completed");
        assert.equal(replay.data.result_user_id, userId);

        const internalUsers = await requestJson(
          `${apiBase.rest}/users?select=id,auth_user_id,employee_id&employee_id=eq.${employee.id}`,
          { admin: true },
        );
        assert.equal(internalUsers.response.status, 200, JSON.stringify(internalUsers.data));
        assert.equal(internalUsers.data.length, 1);
        assert.equal(internalUsers.data[0].auth_user_id, authUser.id);

        const removalId = randomUUID();
        const beginRemoval = await callAdminRpc("begin_user_removal", {
          p_operation_id: removalId,
          p_user_id: userId,
        });
        assert.equal(beginRemoval.response.status, 200, JSON.stringify(beginRemoval.data));
        assert.equal(beginRemoval.data.auth_user_id, authUser.id);

        const suspended = await requestJson(`${apiBase.rest}/users?id=eq.${userId}&select=active`, {
          admin: true,
        });
        assert.equal(suspended.data[0].active, false);

        const prematureRemoval = await callAdminRpc("complete_user_removal", {
          p_operation_id: removalId,
        });
        assert.equal(prematureRemoval.response.ok, false);

        const deletedAuth = await requestJson(`${apiBase.auth}/admin/users/${authUser.id}`, {
          method: "DELETE",
          admin: true,
        });
        assert.equal(deletedAuth.response.ok, true, JSON.stringify(deletedAuth.data));
        const completedRemoval = await callAdminRpc("complete_user_removal", {
          p_operation_id: removalId,
        });
        assert.equal(completedRemoval.response.ok, true, JSON.stringify(completedRemoval.data));

        const removedUsers = await requestJson(`${apiBase.rest}/users?select=id&id=eq.${userId}`, {
          admin: true,
        });
        assert.equal(removedUsers.data.length, 0);
        const removalReplay = await callAdminRpc("begin_user_removal", {
          p_operation_id: removalId,
          p_user_id: userId,
        });
        assert.equal(removalReplay.response.status, 200, JSON.stringify(removalReplay.data));
        assert.equal(removalReplay.data.status, "completed");

        const lostResponseRetry = await callAdminRpc("begin_user_removal", {
          p_operation_id: randomUUID(),
          p_user_id: userId,
        });
        assert.equal(
          lostResponseRetry.response.status,
          200,
          JSON.stringify(lostResponseRetry.data),
        );
        assert.equal(lostResponseRetry.data.operation_id, removalId);
        assert.equal(lostResponseRetry.data.status, "completed");
      },
    );

    await t.test(
      "Employee deactivation suspends User and reactivation leaves it suspended",
      async () => {
        const email = `employee-status-${randomUUID()}@example.test`;
        const { person, employee } = await createEmployeeWithoutUser("status", email);
        const authUser = await createAuthAccount(email, `${randomSecret(12)}Aa1!`);
        const user = await restInsert("users", {
          auth_user_id: authUser.id,
          person_id: person.id,
          employee_id: employee.id,
          access_role: "seller",
          active: true,
        });

        const deactivated = await callRpc(fixtures.managerUser, "set_employee_active_status", {
          p_employee_id: employee.id,
          p_active: false,
        });
        assert.equal(deactivated.response.ok, true, JSON.stringify(deactivated.data));

        const suspendedUser = await requestJson(
          `${apiBase.rest}/users?id=eq.${user.id}&select=active`,
          { admin: true },
        );
        assert.equal(suspendedUser.data[0].active, false);

        const directReactivation = await requestJson(`${apiBase.rest}/users?id=eq.${user.id}`, {
          method: "PATCH",
          token: fixtures.managerUser.accessToken,
          body: { active: true },
        });
        assert.equal(directReactivation.response.ok, false);

        const blockedReactivation = await callAdminRpc("set_system_user_active", {
          p_user_id: user.id,
          p_active: true,
        });
        assert.equal(blockedReactivation.response.ok, false);

        const reactivatedEmployee = await callRpc(
          fixtures.managerUser,
          "set_employee_active_status",
          { p_employee_id: employee.id, p_active: true },
        );
        assert.equal(
          reactivatedEmployee.response.ok,
          true,
          JSON.stringify(reactivatedEmployee.data),
        );

        const stillSuspendedUser = await requestJson(
          `${apiBase.rest}/users?id=eq.${user.id}&select=active`,
          { admin: true },
        );
        assert.equal(stillSuspendedUser.data[0].active, false);

        const explicitlyActivated = await callAdminRpc("set_system_user_active", {
          p_user_id: user.id,
          p_active: true,
        });
        assert.equal(
          explicitlyActivated.response.ok,
          true,
          JSON.stringify(explicitlyActivated.data),
        );
        const activeUser = await requestJson(
          `${apiBase.rest}/users?id=eq.${user.id}&select=active`,
          { admin: true },
        );
        assert.equal(activeUser.data[0].active, true);
      },
    );

    await t.test(
      "An Auth-only account cannot read protected system data without an internal User",
      async () => {
        const email = `unlinked-auth-${randomUUID()}@example.test`;
        const password = `${randomSecret(12)}Aa1!`;
        await createAuthAccount(email, password);
        const login = await requestJson(`${apiBase.auth}/token?grant_type=password`, {
          method: "POST",
          body: { email, password },
        });
        assert.equal(login.response.status, 200, JSON.stringify(login.data));

        const users = await requestJson(`${apiBase.rest}/users?select=id`, {
          token: login.data.access_token,
        });
        assert.equal(users.response.status, 200, JSON.stringify(users.data));
        assert.deepEqual(users.data, []);
      },
    );

    await t.test(
      "Person, multiple business roles and primary Address commit once on retry",
      async () => {
        const args = personConfigurationArguments({
          cpf: "71000000001",
          name: "Pessoa com vários papéis",
          roles: [
            { role: "customer", notes: "Cliente da garagem" },
            {
              role: "employee",
              position: "Vendedor",
              salary: 3000,
              commission_rate: 2,
              commission_type: "percentage",
              active: true,
              hired_at: "2026-10-01",
            },
            { role: "supplier", supplier_type: "individual", notes: "Também fornecedor" },
          ],
          address: primaryAddress("Rua dos Testes"),
        });
        const user = fixtures.managerUser;
        const [first, retry] = await Promise.all([
          callRpc(user, "create_person_configuration", args),
          callRpc(user, "create_person_configuration", args),
        ]);

        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
        assert.deepEqual(retry.data, first.data);
        assert.ok(first.data.person_id);
        assert.ok(first.data.customer_id);
        assert.ok(first.data.employee_id);
        assert.ok(first.data.supplier_id);

        const people = await authenticatedRows(
          user,
          "people",
          `select=id,name,cpf&cpf=eq.${args.p_person.cpf}`,
        );
        const customers = await authenticatedRows(
          user,
          "customers",
          `select=id&person_id=eq.${first.data.person_id}`,
        );
        const employees = await authenticatedRows(
          user,
          "employees",
          `select=id&person_id=eq.${first.data.person_id}`,
        );
        const suppliers = await authenticatedRows(
          user,
          "suppliers",
          `select=id&person_id=eq.${first.data.person_id}`,
        );
        const addresses = await authenticatedRows(
          user,
          "addresses",
          `select=id,street,is_primary&person_id=eq.${first.data.person_id}`,
        );

        assert.equal(people.length, 1);
        assert.equal(customers.length, 1);
        assert.equal(employees.length, 1);
        assert.equal(suppliers.length, 1);
        assert.equal(addresses.length, 1);
        assert.equal(addresses[0].street, "Rua dos Testes");
        assert.equal(addresses[0].is_primary, true);

        const changedRetry = await callRpc(user, "create_person_configuration", {
          ...args,
          p_person: { ...args.p_person, name: "Conteúdo diferente" },
        });
        assert.equal(changedRetry.response.status, 409);
      },
    );

    await t.test("concurrent requests with distinct roles reuse the same Person", async () => {
      const user = fixtures.managerUser;
      const customerArgs = personConfigurationArguments({
        cpf: "71000000005",
        name: "Pessoa com papéis concorrentes",
        roles: [{ role: "customer", notes: "Cliente" }],
        address: primaryAddress("Rua Compartilhada"),
      });
      const supplierArgs = personConfigurationArguments({
        cpf: "71000000005",
        name: "Pessoa com papéis concorrentes",
        roles: [{ role: "supplier", supplier_type: "individual", notes: "Fornecedor" }],
        address: primaryAddress("Rua Compartilhada"),
      });
      const [customerResult, supplierResult] = await Promise.all([
        callRpc(user, "create_person_configuration", customerArgs),
        callRpc(user, "create_person_configuration", supplierArgs),
      ]);

      assert.equal(customerResult.response.status, 200, JSON.stringify(customerResult.data));
      assert.equal(supplierResult.response.status, 200, JSON.stringify(supplierResult.data));
      assert.equal(customerResult.data.person_id, supplierResult.data.person_id);

      const personId = customerResult.data.person_id;
      const people = await authenticatedRows(
        user,
        "people",
        `select=id&cpf=eq.${customerArgs.p_person.cpf}`,
      );
      const customers = await authenticatedRows(
        user,
        "customers",
        `select=id&person_id=eq.${personId}`,
      );
      const suppliers = await authenticatedRows(
        user,
        "suppliers",
        `select=id&person_id=eq.${personId}`,
      );
      const addresses = await authenticatedRows(
        user,
        "addresses",
        `select=id&person_id=eq.${personId}`,
      );
      assert.equal(people.length, 1);
      assert.equal(customers.length, 1);
      assert.equal(suppliers.length, 1);
      assert.equal(addresses.length, 1);
    });

    await t.test("adding a role without Person notes preserves existing notes", async () => {
      const user = fixtures.managerUser;
      const customerArgs = personConfigurationArguments({
        cpf: "71000000006",
        name: "Pessoa com observação",
        roles: [{ role: "customer", notes: "Cliente" }],
        address: primaryAddress("Rua das Observações"),
      });
      customerArgs.p_person.notes = "Observação pessoal existente";
      const customer = await callRpc(user, "create_person_configuration", customerArgs);
      assert.equal(customer.response.status, 200, JSON.stringify(customer.data));

      const supplierArgs = personConfigurationArguments({
        cpf: customerArgs.p_person.cpf,
        name: customerArgs.p_person.name,
        roles: [{ role: "supplier", supplier_type: "individual", notes: "Fornecedor" }],
        address: primaryAddress("Rua das Observações"),
      });
      const supplier = await callRpc(user, "create_person_configuration", supplierArgs);
      assert.equal(supplier.response.status, 200, JSON.stringify(supplier.data));
      assert.equal(supplier.data.person_id, customer.data.person_id);

      const people = await authenticatedRows(
        user,
        "people",
        `select=notes&cpf=eq.${customerArgs.p_person.cpf}`,
      );
      assert.equal(people[0].notes, "Observação pessoal existente");
    });

    await t.test(
      "a duplicate business role conflict rolls back Person and Address changes",
      async () => {
        const user = fixtures.users[0];
        const original = personConfigurationArguments({
          cpf: "71000000002",
          name: "Pessoa original",
          roles: [{ role: "customer", notes: "Cadastro inicial" }],
          address: primaryAddress("Rua Original"),
        });
        const created = await callRpc(user, "create_person_configuration", original);
        assert.equal(created.response.status, 200, JSON.stringify(created.data));

        const duplicateRole = await callRpc(user, "create_person_configuration", {
          ...original,
          p_idempotency_key: randomUUID(),
          p_person: { ...original.p_person, name: "Nome não deve ser salvo" },
          p_roles: [{ role: "customer", notes: "Nota não deve ser salva" }],
          p_primary_address: primaryAddress("Rua não deve ser salva"),
        });
        assert.equal(duplicateRole.response.status, 409);

        const people = await authenticatedRows(
          user,
          "people",
          `select=id,name&cpf=eq.${original.p_person.cpf}`,
        );
        const addresses = await authenticatedRows(
          user,
          "addresses",
          `select=street&person_id=eq.${created.data.person_id}`,
        );
        const customers = await authenticatedRows(
          user,
          "customers",
          `select=id,notes&person_id=eq.${created.data.person_id}`,
        );
        assert.equal(people[0].name, "Pessoa original");
        assert.equal(addresses.length, 1);
        assert.equal(addresses[0].street, "Rua Original");
        assert.equal(customers.length, 1);
        assert.equal(customers[0].notes, "Cadastro inicial");
      },
    );

    await t.test(
      "concurrent creation of the same business role leaves one complete record",
      async () => {
        const user = fixtures.users[0];
        const firstArgs = personConfigurationArguments({
          cpf: "71000000007",
          name: "Pessoa em disputa de papel",
          roles: [{ role: "customer", notes: "Primeira tentativa" }],
          address: primaryAddress("Rua da Disputa"),
        });
        const secondArgs = {
          ...firstArgs,
          p_idempotency_key: randomUUID(),
          p_person: { ...firstArgs.p_person, name: "Outra tentativa" },
          p_roles: [{ role: "customer", notes: "Segunda tentativa" }],
          p_primary_address: primaryAddress("Rua da Disputa 2"),
        };
        const results = await Promise.all([
          callRpc(user, "create_person_configuration", firstArgs),
          callRpc(user, "create_person_configuration", secondArgs),
        ]);

        assert.equal(results.filter((result) => result.response.status === 200).length, 1);
        assert.equal(results.filter((result) => result.response.status === 409).length, 1);
        const winner = results.find((result) => result.response.status === 200);
        assert.ok(winner);
        const winningArguments = results[0] === winner ? firstArgs : secondArgs;

        const people = await authenticatedRows(
          user,
          "people",
          `select=id,name&cpf=eq.${firstArgs.p_person.cpf}`,
        );
        const customers = await authenticatedRows(
          user,
          "customers",
          `select=id,notes&person_id=eq.${winner.data.person_id}`,
        );
        const addresses = await authenticatedRows(
          user,
          "addresses",
          `select=id,street&person_id=eq.${people[0].id}`,
        );
        assert.equal(people.length, 1);
        assert.equal(people[0].name, winningArguments.p_person.name);
        assert.equal(customers.length, 1);
        assert.equal(customers[0].notes, winningArguments.p_roles[0].notes);
        assert.equal(addresses.length, 1);
        assert.equal(addresses[0].street, winningArguments.p_primary_address.street);
      },
    );

    await t.test(
      "invalid role data and unauthorized Employee creation leave no partial Person",
      async () => {
        const manager = fixtures.managerUser;
        const invalidEmployee = personConfigurationArguments({
          cpf: "71000000003",
          name: "Pessoa com papel inválido",
          roles: [
            {
              role: "employee",
              position: "Vendedor",
              salary: 3000,
              commission_rate: 2,
              commission_type: "invalid_type",
              active: true,
              hired_at: "2026-10-01",
            },
          ],
          address: primaryAddress("Rua temporária"),
        });
        const failed = await callRpc(manager, "create_person_configuration", invalidEmployee);
        assert.equal(failed.response.ok, false, JSON.stringify(failed.data));

        const sellerAttempt = await callRpc(fixtures.users[0], "create_person_configuration", {
          ...personConfigurationArguments({
            cpf: "71000000004",
            name: "Funcionário sem permissão",
            roles: [
              {
                role: "employee",
                position: "Vendedor",
                salary: 3000,
                commission_rate: 2,
                commission_type: "percentage",
                active: true,
                hired_at: "2026-10-01",
              },
            ],
            address: primaryAddress("Rua sem permissão"),
          }),
        });
        assert.equal(sellerAttempt.response.status, 403);

        const leftoverPeople = await requestJson(
          `${apiBase.rest}/people?select=id&cpf=in.(71000000003,71000000004)`,
          { admin: true },
        );
        assert.equal(leftoverPeople.response.status, 200, JSON.stringify(leftoverPeople.data));
        assert.equal(leftoverPeople.data.length, 0);
      },
    );

    await t.test("direct inserts cannot bypass the atomic Person configuration RPC", async () => {
      const user = fixtures.users[0];
      const directInsert = await requestJson(`${apiBase.rest}/people`, {
        method: "POST",
        token: user.accessToken,
        body: { name: "Inserção direta não permitida", type: "individual" },
      });
      assert.equal(directInsert.response.ok, false);
    });

    await t.test("Purchase creation replays once and rejects changed data", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(31, "evaluating");
      const args = purchaseArguments({ fixtures, vehicle, key: randomUUID() });
      const [first, replay] = await Promise.all([
        callCreatePurchase(user, args),
        callCreatePurchase(user, args),
      ]);

      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(first.data, replay.data);

      const changedPayload = await callCreatePurchase(user, {
        ...args,
        p_total_value: 41000,
      });
      assert.equal(changedPayload.response.status, 409, JSON.stringify(changedPayload.data));
      assert.match(JSON.stringify(changedPayload.data), /idempotência/i);

      const purchases = await authenticatedRows(
        user,
        "purchases",
        `select=id,status,total_value,financial_transaction_id&vehicle_id=eq.${vehicle.id}`,
      );
      assert.equal(purchases.length, 1);
      assert.equal(purchases[0].status, "pending");
      assert.equal(Number(purchases[0].total_value), 42000);
      assert.equal(purchases[0].financial_transaction_id, null);

      const [storedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status&id=eq.${vehicle.id}`,
      );
      assert.equal(storedVehicle.status, "evaluating");
    });

    await t.test("creating a completed Purchase commits Vehicle and expense once", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(33, "evaluating");
      const args = purchaseArguments({
        fixtures,
        vehicle,
        key: randomUUID(),
        overrides: { p_status: "completed" },
      });
      const first = await callCreatePurchase(user, args);
      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      const replay = await callCreatePurchase(user, args);
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(replay.data, first.data);

      const [purchase] = await authenticatedRows(
        user,
        "purchases",
        `select=id,status,total_value,financial_transaction_id&id=eq.${first.data}`,
      );
      const [vehicleAfter] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status,cost_price,published&id=eq.${vehicle.id}`,
      );
      const transactions = await authenticatedRows(
        user,
        "financial_transactions",
        `select=id,type,category,status,amount,purchase_id&purchase_id=eq.${first.data}`,
      );

      assert.equal(purchase.status, "completed");
      assert.ok(purchase.financial_transaction_id);
      assert.equal(vehicleAfter.status, "available");
      assert.equal(Number(vehicleAfter.cost_price), 42000);
      assert.equal(vehicleAfter.published, false);
      assert.equal(transactions.length, 1);
      assert.equal(transactions[0].type, "expense");
      assert.equal(transactions[0].category, "vehicle_purchase");
      assert.equal(transactions[0].status, "paid");
      assert.equal(Number(transactions[0].amount), 42000);
    });

    await t.test("concurrent Purchase creation cannot start two active cycles", async () => {
      const vehicle = await createVehicle(32, "evaluating");
      const outcomes = await Promise.all([
        callCreatePurchase(fixtures.users[0], purchaseArguments({ fixtures, vehicle })),
        callCreatePurchase(fixtures.users[1], purchaseArguments({ fixtures, vehicle })),
      ]);
      const success = outcomes.filter(({ response }) => response.ok);
      const conflicts = outcomes.filter(({ response }) => response.status === 409);

      assert.equal(success.length, 1, JSON.stringify(outcomes.map((item) => item.data)));
      assert.equal(conflicts.length, 1, JSON.stringify(outcomes.map((item) => item.data)));
      assert.equal(typeof success[0].data, "number");

      const purchases = await authenticatedRows(
        fixtures.users[0],
        "purchases",
        `select=id,status&vehicle_id=eq.${vehicle.id}`,
      );
      assert.equal(purchases.length, 1);
      assert.equal(purchases[0].status, "pending");
    });

    await t.test(
      "Vehicle archive cannot strand a pending Purchase, and legacy archive remains cancelable",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(38, "evaluating");
        const created = await callCreatePurchase(user, purchaseArguments({ fixtures, vehicle }));
        assert.equal(created.response.status, 200, JSON.stringify(created.data));

        const archiveAttempt = await callRpc(user, "archive_vehicle_with_version", {
          p_vehicle_id: vehicle.id,
          p_expected_updated_at: vehicle.updated_at,
        });
        assert.equal(archiveAttempt.response.status, 409, JSON.stringify(archiveAttempt.data));
        assert.match(JSON.stringify(archiveAttempt.data), /VEHICLE_HAS_PENDING_PURCHASE/i);

        const legacyArchive = await requestJson(`${apiBase.rest}/vehicles?id=eq.${vehicle.id}`, {
          method: "PATCH",
          admin: true,
          body: { status: "archived" },
        });
        assert.equal(legacyArchive.response.ok, true, JSON.stringify(legacyArchive.data));

        const [purchase] = await authenticatedRows(
          user,
          "purchases",
          `select=id,updated_at&id=eq.${created.data}`,
        );
        const canceled = await transitionPurchase(
          user,
          created.data,
          "cancel",
          purchase.updated_at,
        );
        assert.equal(canceled.response.status, 200, JSON.stringify(canceled.data));

        const [storedPurchase] = await authenticatedRows(
          user,
          "purchases",
          `select=id,status&id=eq.${created.data}`,
        );
        const [storedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status&id=eq.${vehicle.id}`,
        );
        assert.equal(storedPurchase.status, "canceled");
        assert.equal(storedVehicle.status, "evaluating");
      },
    );

    await t.test("completion and cancellation race to one Purchase transition", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(34, "evaluating");
      const created = await callCreatePurchase(user, purchaseArguments({ fixtures, vehicle }));
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const [purchaseBefore] = await authenticatedRows(
        user,
        "purchases",
        `select=id,updated_at&id=eq.${created.data}`,
      );

      const outcomes = await Promise.all([
        transitionPurchase(user, created.data, "complete", purchaseBefore.updated_at),
        transitionPurchase(fixtures.users[1], created.data, "cancel", purchaseBefore.updated_at),
      ]);
      const success = outcomes.filter(({ response }) => response.ok);
      const conflicts = outcomes.filter(({ response }) => response.status === 409);
      assert.equal(success.length, 1, JSON.stringify(outcomes.map((item) => item.data)));
      assert.equal(conflicts.length, 1, JSON.stringify(outcomes.map((item) => item.data)));

      const [purchase] = await authenticatedRows(
        user,
        "purchases",
        `select=id,status,financial_transaction_id&id=eq.${created.data}`,
      );
      const [storedVehicle] = await authenticatedRows(
        user,
        "vehicles",
        `select=id,status,cost_price&id=eq.${vehicle.id}`,
      );
      const transactions = await authenticatedRows(
        user,
        "financial_transactions",
        `select=id,category,purchase_id&purchase_id=eq.${created.data}`,
      );

      if (purchase.status === "completed") {
        assert.equal(storedVehicle.status, "available");
        assert.equal(Number(storedVehicle.cost_price), 42000);
        assert.ok(purchase.financial_transaction_id);
        assert.equal(transactions.length, 1);
      } else {
        assert.equal(purchase.status, "canceled");
        assert.equal(storedVehicle.status, "evaluating");
        assert.equal(transactions.length, 0);
      }
    });

    await t.test(
      "the same transition key replays completion without duplicating expense",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(37, "evaluating");
        const created = await callCreatePurchase(user, purchaseArguments({ fixtures, vehicle }));
        assert.equal(created.response.status, 200, JSON.stringify(created.data));
        const [purchase] = await authenticatedRows(
          user,
          "purchases",
          `select=id,updated_at&id=eq.${created.data}`,
        );
        const key = randomUUID();
        const [first, replay] = await Promise.all([
          transitionPurchase(user, created.data, "complete", purchase.updated_at, key),
          transitionPurchase(user, created.data, "complete", purchase.updated_at, key),
        ]);
        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
        assert.equal(first.data, created.data);
        assert.equal(replay.data, created.data);

        const changedAction = await transitionPurchase(
          user,
          created.data,
          "cancel",
          purchase.updated_at,
          key,
        );
        assert.equal(changedAction.response.status, 409, JSON.stringify(changedAction.data));

        const transactions = await authenticatedRows(
          user,
          "financial_transactions",
          `select=id,purchase_id&purchase_id=eq.${created.data}`,
        );
        assert.equal(transactions.length, 1);
      },
    );

    await t.test("Purchase edits replay safely and reject stale values", async () => {
      const user = fixtures.users[0];
      const vehicle = await createVehicle(35, "evaluating");
      const created = await callCreatePurchase(user, purchaseArguments({ fixtures, vehicle }));
      assert.equal(created.response.status, 200, JSON.stringify(created.data));
      const [purchaseBefore] = await authenticatedRows(
        user,
        "purchases",
        `select=id,updated_at,total_value&id=eq.${created.data}`,
      );
      const updateArgs = {
        key: randomUUID(),
        totalValue: 38000,
        purchaseDate: "2026-11-04",
        notes: "Valor conferido",
      };
      const [first, replay] = await Promise.all([
        updatePurchase(user, created.data, purchaseBefore.updated_at, fixtures, updateArgs),
        updatePurchase(user, created.data, purchaseBefore.updated_at, fixtures, updateArgs),
      ]);
      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(first.data, created.data);
      assert.equal(replay.data, created.data);

      const changedPayload = await updatePurchase(
        user,
        created.data,
        purchaseBefore.updated_at,
        fixtures,
        { ...updateArgs, totalValue: 37000 },
      );
      assert.equal(changedPayload.response.status, 409, JSON.stringify(changedPayload.data));

      const directStatusUpdate = await requestJson(
        `${apiBase.rest}/purchases?id=eq.${created.data}`,
        {
          method: "PATCH",
          token: user.accessToken,
          body: { status: "completed" },
        },
      );
      assert.equal(directStatusUpdate.response.ok, false, JSON.stringify(directStatusUpdate.data));

      const staleSave = await updatePurchase(
        user,
        created.data,
        purchaseBefore.updated_at,
        fixtures,
        { totalValue: 36000 },
      );
      assert.equal(staleSave.response.status, 409, JSON.stringify(staleSave.data));
      assert.match(JSON.stringify(staleSave.data), /STALE_RECORD/i);

      const [storedPurchase] = await authenticatedRows(
        user,
        "purchases",
        `select=id,status,total_value,purchase_date,notes&id=eq.${created.data}`,
      );
      assert.equal(storedPurchase.status, "pending");
      assert.equal(Number(storedPurchase.total_value), 38000);
      assert.equal(storedPurchase.purchase_date, "2026-11-04");
      assert.equal(storedPurchase.notes, "Valor conferido");
    });

    await t.test(
      "a sold Vehicle can start a new Purchase cycle and cancellation restores sold status",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(36, "evaluating");
        const firstPurchase = await callCreatePurchase(
          user,
          purchaseArguments({
            fixtures,
            vehicle,
            overrides: { p_status: "completed" },
          }),
        );
        assert.equal(firstPurchase.response.status, 200, JSON.stringify(firstPurchase.data));

        const sale = await callCreateSale(
          user,
          saleArguments({ fixtures, vehicle: { ...vehicle, status: "available" }, user }),
        );
        assert.equal(sale.response.status, 200, JSON.stringify(sale.data));
        const [saleRow] = await authenticatedRows(
          user,
          "sales",
          `select=id,status,updated_at&id=eq.${sale.data}`,
        );
        const [payment] = await authenticatedRows(
          user,
          "sale_payments",
          `select=id,payment_status,updated_at&sale_id=eq.${sale.data}`,
        );
        const completedSale = await transitionSale(user, sale.data, "complete", saleRow, payment);
        assert.equal(completedSale.response.status, 200, JSON.stringify(completedSale.data));

        const [soldVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status,updated_at&id=eq.${vehicle.id}`,
        );
        assert.equal(soldVehicle.status, "sold");
        const secondPurchase = await callCreatePurchase(
          user,
          purchaseArguments({
            fixtures,
            vehicle: soldVehicle,
            overrides: { p_total_value: 45000 },
          }),
        );
        assert.equal(secondPurchase.response.status, 200, JSON.stringify(secondPurchase.data));

        const [reacquiredVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status&id=eq.${vehicle.id}`,
        );
        assert.equal(reacquiredVehicle.status, "evaluating");
        const history = await authenticatedRows(
          user,
          "purchases",
          `select=id,status,vehicle_id&vehicle_id=eq.${vehicle.id}&order=id.asc`,
        );
        assert.equal(history.length, 2);
        assert.equal(history[0].id, firstPurchase.data);
        assert.equal(history[0].status, "completed");
        assert.equal(history[1].id, secondPurchase.data);
        assert.equal(history[1].status, "pending");

        const [secondPurchaseRow] = await authenticatedRows(
          user,
          "purchases",
          `select=id,updated_at&id=eq.${secondPurchase.data}`,
        );
        const canceled = await transitionPurchase(
          user,
          secondPurchase.data,
          "cancel",
          secondPurchaseRow.updated_at,
        );
        assert.equal(canceled.response.status, 200, JSON.stringify(canceled.data));
        const [vehicleAfterCancellation] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status&id=eq.${vehicle.id}`,
        );
        assert.equal(vehicleAfterCancellation.status, "sold");
      },
    );

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
        fixtures.financialOnlyUser,
        saleArguments({
          fixtures,
          vehicle: fixtures.vehicles[4],
          user: fixtures.financialOnlyUser,
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
        fixtures.financialOnlyUser,
        "create_vehicle_checklist_item",
        checklistItem(vehicle.id),
      );
      assert.equal(result.response.status, 403, JSON.stringify(result.data));
    });

    await t.test(
      "Vehicle configuration creation is atomic and idempotent across Accessories and ChecklistItems",
      async () => {
        const user = fixtures.users[0];
        const args = vehicleConfigurationArguments(1);
        const [first, retry] = await Promise.all([
          callRpc(user, "create_vehicle_configuration", args),
          callRpc(user, "create_vehicle_configuration", args),
        ]);

        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
        assert.equal(retry.data, first.data);

        const vehicleId = first.data;
        const vehicles = await authenticatedRows(
          user,
          "vehicles",
          `select=id,status,published&plate=eq.${args.p_vehicle.plate}`,
        );
        const links = await authenticatedRows(
          user,
          "vehicle_accessories",
          `select=id,active,accessory_id&vehicle_id=eq.${vehicleId}`,
        );
        const checklist = await authenticatedRows(
          user,
          "vehicle_checklist_items",
          `select=id,title,status&vehicle_id=eq.${vehicleId}`,
        );

        assert.equal(vehicles.length, 1);
        assert.equal(vehicles[0].id, vehicleId);
        assert.equal(vehicles[0].status, "in_repair");
        assert.equal(vehicles[0].published, false);
        assert.equal(links.length, 2);
        assert.ok(links.every((link) => link.active));
        assert.equal(checklist.length, 1);
        assert.equal(checklist[0].status, "pending");

        const reusedKeyWithDifferentConfiguration = await callRpc(
          user,
          "create_vehicle_configuration",
          {
            ...args,
            p_vehicle: { ...args.p_vehicle, model: "Outro modelo" },
          },
        );
        assert.equal(reusedKeyWithDifferentConfiguration.response.status, 409);

        const unchangedChecklist = await authenticatedRows(
          user,
          "vehicle_checklist_items",
          `select=id&vehicle_id=eq.${vehicleId}`,
        );
        assert.equal(unchangedChecklist.length, 1);
      },
    );

    await t.test(
      "a failed initial ChecklistItem leaves no partial Vehicle or Accessory",
      async () => {
        const user = fixtures.users[0];
        const args = vehicleConfigurationArguments(2, randomUUID(), {
          p_accessories: ["Acessório deve sofrer rollback"],
          p_checklist_items: [
            {
              title: "Categoria inválida",
              category: "not_a_checklist_category",
              priority: "medium",
              estimated_cost: 100,
            },
          ],
        });
        const failed = await callRpc(user, "create_vehicle_configuration", args);
        assert.equal(failed.response.ok, false, JSON.stringify(failed.data));

        const vehicles = await requestJson(
          `${apiBase.rest}/vehicles?select=id&plate=eq.${args.p_vehicle.plate}`,
          { admin: true },
        );
        const accessories = await requestJson(
          `${apiBase.rest}/accessories?select=id&name=eq.${encodeURIComponent(args.p_accessories[0])}`,
          { admin: true },
        );
        assert.equal(vehicles.response.status, 200, JSON.stringify(vehicles.data));
        assert.equal(accessories.response.status, 200, JSON.stringify(accessories.data));
        assert.equal(vehicles.data.length, 0);
        assert.equal(accessories.data.length, 0);
      },
    );

    await t.test(
      "Vehicle edits replay once and stale edits leave Accessories unchanged",
      async () => {
        const user = fixtures.users[0];
        const vehicle = await createVehicle(64);
        const [loaded] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,sale_price,updated_at&id=eq.${vehicle.id}`,
        );
        const args = {
          p_idempotency_key: randomUUID(),
          p_vehicle_id: vehicle.id,
          p_expected_updated_at: loaded.updated_at,
          p_changes: { sale_price: 62000 },
          p_accessories: ["Câmera de ré", "Sensor de estacionamento"],
        };
        const [first, retry] = await Promise.all([
          callRpc(user, "update_vehicle_configuration", args),
          callRpc(user, "update_vehicle_configuration", args),
        ]);
        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(retry.response.status, 200, JSON.stringify(retry.data));
        assert.equal(first.data, vehicle.id);
        assert.equal(retry.data, vehicle.id);

        const [updatedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=id,sale_price,updated_at&id=eq.${vehicle.id}`,
        );
        const savedLinks = await authenticatedRows(
          user,
          "vehicle_accessories",
          `select=id,active,accessory_id&vehicle_id=eq.${vehicle.id}`,
        );
        assert.equal(Number(updatedVehicle.sale_price), 62000);
        assert.equal(savedLinks.length, 2);
        assert.ok(savedLinks.every((link) => link.active));

        const staleEdit = await callRpc(user, "update_vehicle_configuration", {
          ...args,
          p_idempotency_key: randomUUID(),
          p_expected_updated_at: loaded.updated_at,
          p_changes: { sale_price: 63000 },
          p_accessories: ["Acessório de rascunho"],
        });
        assert.equal(staleEdit.response.status, 409);

        const [unchangedVehicle] = await authenticatedRows(
          user,
          "vehicles",
          `select=sale_price&id=eq.${vehicle.id}`,
        );
        const unchangedLinks = await authenticatedRows(
          user,
          "vehicle_accessories",
          `select=id,active,accessory_id&vehicle_id=eq.${vehicle.id}`,
        );
        assert.equal(Number(unchangedVehicle.sale_price), 62000);
        assert.equal(unchangedLinks.length, 2);
        assert.ok(unchangedLinks.every((link) => link.active));
      },
    );

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

    await t.test(
      "financial obligations settle idempotently and serialize against cancellation",
      async () => {
        const financeUser = fixtures.financialOnlyUser;
        const secondFinanceUser = await createAuthenticatedUser(5, "financial");
        const settlement = await restInsert("financial_transactions", {
          type: "expense",
          category: "other",
          status: "pending",
          amount: 420,
          transaction_date: "2026-11-02",
          due_date: "2026-11-20",
          description: "Obrigação para teste de quitação",
        });
        const [loadedSettlement] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,paid_at,updated_at&id=eq.${settlement.id}`,
        );
        const sellerCannotSettle = await transitionFinancialTransaction(
          fixtures.users[0],
          settlement.id,
          "settle",
          loadedSettlement.updated_at,
        );
        assert.equal(
          sellerCannotSettle.response.status,
          403,
          JSON.stringify(sellerCannotSettle.data),
        );
        const key = randomUUID();
        const [first, replay] = await Promise.all([
          transitionFinancialTransaction(
            financeUser,
            settlement.id,
            "settle",
            loadedSettlement.updated_at,
            key,
          ),
          transitionFinancialTransaction(
            financeUser,
            settlement.id,
            "settle",
            loadedSettlement.updated_at,
            key,
          ),
        ]);
        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
        assert.equal(first.data, settlement.id);
        assert.equal(replay.data, settlement.id);

        const reusedKeyWithDifferentAction = await transitionFinancialTransaction(
          financeUser,
          settlement.id,
          "cancel",
          loadedSettlement.updated_at,
          key,
        );
        assert.equal(reusedKeyWithDifferentAction.response.status, 409);

        const staleCancel = await transitionFinancialTransaction(
          secondFinanceUser,
          settlement.id,
          "cancel",
          loadedSettlement.updated_at,
        );
        assert.equal(staleCancel.response.status, 409, JSON.stringify(staleCancel.data));
        assert.match(JSON.stringify(staleCancel.data), /STALE_RECORD/i);

        const [settled] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,paid_at,updated_at&id=eq.${settlement.id}`,
        );
        assert.equal(settled.status, "paid");
        assert.ok(settled.paid_at);
        const cannotCancelSettled = await transitionFinancialTransaction(
          financeUser,
          settlement.id,
          "cancel",
          settled.updated_at,
        );
        assert.equal(
          cannotCancelSettled.response.status,
          409,
          JSON.stringify(cannotCancelSettled.data),
        );
        assert.match(JSON.stringify(cannotCancelSettled.data), /NOT_CANCELLABLE/i);

        const racingObligation = await restInsert("financial_transactions", {
          type: "expense",
          category: "other",
          status: "pending",
          amount: 510,
          transaction_date: "2026-11-02",
          due_date: "2026-11-22",
          description: "Obrigação para corrida de quitação/cancelamento",
        });
        const [loadedRace] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,updated_at&id=eq.${racingObligation.id}`,
        );
        const outcomes = await Promise.all([
          transitionFinancialTransaction(
            financeUser,
            racingObligation.id,
            "settle",
            loadedRace.updated_at,
          ),
          transitionFinancialTransaction(
            secondFinanceUser,
            racingObligation.id,
            "cancel",
            loadedRace.updated_at,
          ),
        ]);
        assert.equal(
          outcomes.filter(({ response }) => response.status === 200).length,
          1,
          JSON.stringify(outcomes.map(({ data }) => data)),
        );
        assert.equal(
          outcomes.filter(({ response }) => response.status === 409).length,
          1,
          JSON.stringify(outcomes.map(({ data }) => data)),
        );
        const [raceResult] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,paid_at&id=eq.${racingObligation.id}`,
        );
        assert.ok(["paid", "canceled"].includes(raceResult.status));
        assert.equal(raceResult.paid_at !== null, raceResult.status === "paid");
      },
    );

    await t.test(
      "settling a Commission obligation updates Commission in the same command",
      async () => {
        const seller = fixtures.users[0];
        const financeUser = fixtures.financialOnlyUser;
        const vehicle = await createVehicle(61);
        const created = await callCreateSale(
          seller,
          saleArguments({ fixtures, vehicle, user: seller }),
        );
        assert.equal(created.response.status, 200, JSON.stringify(created.data));
        const [sale] = await authenticatedRows(
          seller,
          "sales",
          `select=id,status,updated_at&id=eq.${created.data}`,
        );
        const [payment] = await authenticatedRows(
          seller,
          "sale_payments",
          `select=id,payment_status,updated_at&sale_id=eq.${created.data}`,
        );
        const completed = await transitionSale(seller, created.data, "complete", sale, payment);
        assert.equal(completed.response.status, 200, JSON.stringify(completed.data));

        const commissions = await authenticatedRows(
          financeUser,
          "commissions",
          `select=id,status,paid_at&sale_id=eq.${created.data}`,
        );
        assert.equal(commissions.length, 1);
        const commissionTransactions = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,paid_at,updated_at&commission_id=eq.${commissions[0].id}`,
        );
        assert.equal(commissionTransactions.length, 1);
        const commissionTransaction = commissionTransactions[0];
        const key = randomUUID();
        const [first, replay] = await Promise.all([
          transitionFinancialTransaction(
            financeUser,
            commissionTransaction.id,
            "settle",
            commissionTransaction.updated_at,
            key,
          ),
          transitionFinancialTransaction(
            financeUser,
            commissionTransaction.id,
            "settle",
            commissionTransaction.updated_at,
            key,
          ),
        ]);
        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        assert.equal(replay.response.status, 200, JSON.stringify(replay.data));

        const [settledTransaction] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,paid_at&commission_id=eq.${commissions[0].id}`,
        );
        const [settledCommission] = await authenticatedRows(
          financeUser,
          "commissions",
          `select=id,status,paid_at&id=eq.${commissions[0].id}`,
        );
        assert.equal(settledTransaction.status, "paid");
        assert.equal(settledCommission.status, "paid");
        assert.equal(settledCommission.paid_at, settledTransaction.paid_at);

        const directCommissionUpdate = await requestJson(
          `${apiBase.rest}/commissions?id=eq.${commissions[0].id}`,
          {
            method: "PATCH",
            token: financeUser.accessToken,
            body: { status: "pending", paid_at: null },
          },
        );
        assert.equal(directCommissionUpdate.response.ok, false);
      },
    );

    await t.test(
      "manual financial edits replay and reject stale values without losing the result",
      async () => {
        const financeUser = fixtures.financialOnlyUser;
        const transaction = await restInsert("financial_transactions", {
          type: "expense",
          category: "other",
          status: "pending",
          amount: 180,
          transaction_date: "2026-11-02",
          due_date: "2026-11-25",
          description: "Lançamento manual original",
          related: "Fornecedor original",
        });
        const [loaded] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,amount,transaction_date,due_date,description,related,updated_at&id=eq.${transaction.id}`,
        );
        const directUpdate = await requestJson(
          `${apiBase.rest}/financial_transactions?id=eq.${transaction.id}`,
          { method: "PATCH", token: financeUser.accessToken, body: { amount: 1 } },
        );
        assert.equal(directUpdate.response.ok, false);

        const key = randomUUID();
        const args = {
          p_idempotency_key: key,
          p_transaction_id: transaction.id,
          p_expected_updated_at: loaded.updated_at,
          p_amount: 275,
          p_transaction_date: "2026-11-03",
          p_due_date: "2026-11-30",
          p_description: "Despesa revisada pelo teste",
          p_related: "Fornecedor de teste",
        };
        const first = await callRpc(
          financeUser,
          "update_manual_financial_transaction_with_version",
          args,
        );
        assert.equal(first.response.status, 200, JSON.stringify(first.data));
        const replay = await callRpc(
          financeUser,
          "update_manual_financial_transaction_with_version",
          args,
        );
        assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
        assert.equal(replay.data, transaction.id);

        const changedPayload = await callRpc(
          financeUser,
          "update_manual_financial_transaction_with_version",
          { ...args, p_amount: 300 },
        );
        assert.equal(changedPayload.response.status, 409, JSON.stringify(changedPayload.data));

        const stale = await updateManualFinancialTransaction(financeUser, loaded, {
          amount: 350,
          expectedUpdatedAt: loaded.updated_at,
        });
        assert.equal(stale.response.status, 409, JSON.stringify(stale.data));
        assert.match(JSON.stringify(stale.data), /STALE_RECORD/i);

        const [updated] = await authenticatedRows(
          financeUser,
          "financial_transactions",
          `select=id,status,amount,transaction_date,due_date,description,related&id=eq.${transaction.id}`,
        );
        assert.equal(updated.status, "pending");
        assert.equal(Number(updated.amount), 275);
        assert.equal(updated.transaction_date, "2026-11-03");
        assert.equal(updated.due_date, "2026-11-30");
        assert.equal(updated.description, "Despesa revisada pelo teste");
        assert.equal(updated.related, "Fornecedor de teste");
      },
    );

    await t.test("Installment ownership, numbering, and full settlement are enforced", async () => {
      const financeUser = fixtures.financialOnlyUser;
      const seller = fixtures.users[0];
      const transaction = await restInsert("financial_transactions", {
        type: "income",
        category: "other",
        status: "pending",
        amount: 900,
        transaction_date: "2026-11-02",
        due_date: "2026-12-02",
        description: "Obrigação parcelada de teste",
      });
      const vehicle = await createVehicle(62);
      const createdSale = await callCreateSale(
        seller,
        saleArguments({
          fixtures,
          vehicle,
          user: seller,
          overrides: { p_down_payment: 64100 },
        }),
      );
      assert.equal(createdSale.response.status, 200, JSON.stringify(createdSale.data));
      const [sale] = await authenticatedRows(
        seller,
        "sales",
        `select=id,status,updated_at&id=eq.${createdSale.data}`,
      );
      const [payment] = await authenticatedRows(
        seller,
        "sale_payments",
        `select=id,payment_status,remaining_amount,updated_at&sale_id=eq.${createdSale.data}`,
      );
      const completed = await transitionSale(seller, createdSale.data, "complete", sale, payment);
      assert.equal(completed.response.status, 200, JSON.stringify(completed.data));
      const [completedPayment] = await authenticatedRows(
        seller,
        "sale_payments",
        `select=id,payment_status,remaining_amount,updated_at&sale_id=eq.${createdSale.data}`,
      );
      assert.equal(completedPayment.payment_status, "partial");
      assert.equal(Number(completedPayment.remaining_amount), 900);
      const installmentFields = {
        number: 1,
        total_installments: 2,
        amount: 450,
        due_date: "2026-12-02",
        status: "pending",
        description: "Parcela de teste",
      };

      const noOwner = await requestJson(`${apiBase.rest}/installments`, {
        method: "POST",
        admin: true,
        body: installmentFields,
      });
      assert.equal(noOwner.response.ok, false);
      const twoOwners = await requestJson(`${apiBase.rest}/installments`, {
        method: "POST",
        admin: true,
        body: {
          ...installmentFields,
          transaction_id: transaction.id,
          sale_payment_id: payment.id,
        },
      });
      assert.equal(twoOwners.response.ok, false);

      const transactionOwned = await restInsert("installments", {
        ...installmentFields,
        transaction_id: transaction.id,
      });
      const duplicateTransactionNumber = await requestJson(`${apiBase.rest}/installments`, {
        method: "POST",
        admin: true,
        body: { ...installmentFields, transaction_id: transaction.id },
      });
      assert.equal(duplicateTransactionNumber.response.ok, false);
      const secondTransactionOwned = await restInsert("installments", {
        ...installmentFields,
        number: 2,
        due_date: "2027-01-02",
        transaction_id: transaction.id,
      });

      const salePaymentOwned = await restInsert("installments", {
        ...installmentFields,
        sale_payment_id: completedPayment.id,
      });
      const duplicateSalePaymentNumber = await requestJson(`${apiBase.rest}/installments`, {
        method: "POST",
        admin: true,
        body: { ...installmentFields, sale_payment_id: completedPayment.id },
      });
      assert.equal(duplicateSalePaymentNumber.response.ok, false);
      const secondSalePaymentOwned = await restInsert("installments", {
        ...installmentFields,
        number: 2,
        due_date: "2027-01-02",
        sale_payment_id: completedPayment.id,
      });

      const [parentTransaction] = await authenticatedRows(
        financeUser,
        "financial_transactions",
        `select=id,status,updated_at&id=eq.${transaction.id}`,
      );
      const cannotSettleParent = await transitionFinancialTransaction(
        financeUser,
        transaction.id,
        "settle",
        parentTransaction.updated_at,
      );
      assert.equal(
        cannotSettleParent.response.status,
        409,
        JSON.stringify(cannotSettleParent.data),
      );
      assert.match(JSON.stringify(cannotSettleParent.data), /HAS_INSTALLMENTS/i);

      const [saleReceivable] = await authenticatedRows(
        financeUser,
        "financial_transactions",
        `select=id,status,updated_at&sale_id=eq.${createdSale.data}&category=eq.vehicle_sale&status=eq.pending`,
      );
      const cannotSettleSaleReceivable = await transitionFinancialTransaction(
        financeUser,
        saleReceivable.id,
        "settle",
        saleReceivable.updated_at,
      );
      assert.equal(
        cannotSettleSaleReceivable.response.status,
        409,
        JSON.stringify(cannotSettleSaleReceivable.data),
      );
      assert.match(JSON.stringify(cannotSettleSaleReceivable.data), /HAS_INSTALLMENTS/i);

      const [loadedInstallment] = await authenticatedRows(
        financeUser,
        "installments",
        `select=id,status,amount,paid_at,updated_at&id=eq.${transactionOwned.id}`,
      );
      const key = randomUUID();
      const [first, replay] = await Promise.all([
        settleInstallment(financeUser, loadedInstallment, key),
        settleInstallment(financeUser, loadedInstallment, key),
      ]);
      assert.equal(first.response.status, 200, JSON.stringify(first.data));
      assert.equal(replay.response.status, 200, JSON.stringify(replay.data));
      assert.equal(first.data, transactionOwned.id);
      assert.equal(replay.data, transactionOwned.id);

      const [parentAfterFirstInstallment] = await authenticatedRows(
        financeUser,
        "financial_transactions",
        `select=id,status,paid_at&id=eq.${transaction.id}`,
      );
      assert.equal(parentAfterFirstInstallment.status, "pending");
      assert.equal(parentAfterFirstInstallment.paid_at, null);

      const secondPart = await settleInstallment(financeUser, secondTransactionOwned);
      assert.equal(secondPart.response.status, 200, JSON.stringify(secondPart.data));
      const [settledParent] = await authenticatedRows(
        financeUser,
        "financial_transactions",
        `select=id,status,paid_at&id=eq.${transaction.id}`,
      );
      assert.equal(settledParent.status, "paid");
      assert.ok(settledParent.paid_at);

      const secondSettlement = await settleInstallment(financeUser, loadedInstallment);
      assert.equal(secondSettlement.response.status, 409, JSON.stringify(secondSettlement.data));
      assert.match(
        JSON.stringify(secondSettlement.data),
        /STALE_RECORD|INSTALLMENT_ORIGIN_NOT_SETTLEABLE/i,
      );

      const partialSettlement = await callRpc(financeUser, "settle_installment", {
        p_idempotency_key: randomUUID(),
        p_installment_id: loadedInstallment.id,
        p_expected_updated_at: loadedInstallment.updated_at,
        p_received_amount: 1,
      });
      assert.equal(partialSettlement.response.ok, false);

      const directInstallmentUpdate = await requestJson(
        `${apiBase.rest}/installments?id=eq.${loadedInstallment.id}`,
        {
          method: "PATCH",
          token: financeUser.accessToken,
          body: { amount: 1, status: "pending", paid_at: null },
        },
      );
      assert.equal(directInstallmentUpdate.response.ok, false);

      const [settledInstallment] = await authenticatedRows(
        financeUser,
        "installments",
        `select=id,status,amount,paid_at&id=eq.${loadedInstallment.id}`,
      );
      assert.equal(settledInstallment.status, "paid");
      assert.equal(Number(settledInstallment.amount), 450);
      assert.ok(settledInstallment.paid_at);

      const [loadedSaleInstallment] = await authenticatedRows(
        financeUser,
        "installments",
        `select=id,status,amount,paid_at,updated_at&id=eq.${salePaymentOwned.id}`,
      );
      const saleInstallmentResult = await settleInstallment(financeUser, loadedSaleInstallment);
      assert.equal(
        saleInstallmentResult.response.status,
        200,
        JSON.stringify(saleInstallmentResult.data),
      );
      const [paymentAfterFirstInstallment] = await authenticatedRows(
        financeUser,
        "sale_payments",
        `select=id,payment_status,remaining_amount&id=eq.${completedPayment.id}`,
      );
      assert.equal(paymentAfterFirstInstallment.payment_status, "partial");
      assert.equal(Number(paymentAfterFirstInstallment.remaining_amount), 450);

      const saleInstallmentSecondResult = await settleInstallment(
        financeUser,
        secondSalePaymentOwned,
      );
      assert.equal(
        saleInstallmentSecondResult.response.status,
        200,
        JSON.stringify(saleInstallmentSecondResult.data),
      );
      const [settledPayment] = await authenticatedRows(
        financeUser,
        "sale_payments",
        `select=id,payment_status,remaining_amount&id=eq.${completedPayment.id}`,
      );
      assert.equal(settledPayment.payment_status, "paid");
      assert.equal(Number(settledPayment.remaining_amount), 0);
      const [settledSaleReceivable] = await authenticatedRows(
        financeUser,
        "financial_transactions",
        `select=id,status,paid_at&id=eq.${saleReceivable.id}`,
      );
      assert.equal(settledSaleReceivable.status, "paid");
      assert.ok(settledSaleReceivable.paid_at);
    });
  },
);
