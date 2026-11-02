import assert from "node:assert/strict";
import test from "node:test";
import {
  provisionSystemUser,
  removeSystemUser,
  type ProvisionOperation,
  type RemovalOperation,
} from "../../src/modules/users/services/user-auth-lifecycle.js";

const provisionInput = {
  operationId: "op-provision-1",
  employeeId: 12,
  email: "employee@example.test",
  password: "temporary-password",
  accessRole: "seller" as const,
  isAdmin: false,
  active: true,
};

function createProvisionHarness() {
  const operation: ProvisionOperation = {
    id: provisionInput.operationId,
    status: "pending",
    authUserId: null,
    email: provisionInput.email,
    resultUserId: null,
  };
  const authUsers = new Map<string, { id: string; operationId: string }>();
  let failAuthCreate = true;
  let loseCreateResponse = false;
  let conflictAfterAuthCreate = false;
  let failRecordAuthUser = false;
  let internalRows = 0;
  let authCreateCalls = 0;

  const operations = {
    async beginProvision() {
      return operation;
    },
    async setProvisionAuthUser(_operationId: string, authUserId: string) {
      if (failRecordAuthUser) throw new Error("Falha ao persistir o vínculo Auth");
      operation.authUserId = authUserId;
    },
    async completeProvision(_operationId: string, authUserId: string) {
      assert.equal(operation.authUserId, authUserId);
      if (operation.resultUserId) return operation.resultUserId;
      internalRows += 1;
      operation.resultUserId = 100 + internalRows;
      operation.status = "completed";
      return operation.resultUserId;
    },
  };
  const auth = {
    async findUserByProvisionOperation(operationId: string) {
      const user = [...authUsers.values()].find(
        (candidate) => candidate.operationId === operationId,
      );
      return user ? { id: user.id } : null;
    },
    async createUser(input: { operationId: string }) {
      authCreateCalls += 1;
      if (failAuthCreate) throw new Error("Auth indisponível");
      const id = `auth-${authCreateCalls}`;
      authUsers.set(id, { id, operationId: input.operationId });
      if (conflictAfterAuthCreate) {
        conflictAfterAuthCreate = false;
        throw new Error("A conta foi criada por outra requisição concorrente");
      }
      if (loseCreateResponse) throw new Error("Resposta do Auth perdida");
      return { id };
    },
  };

  return {
    auth,
    operations,
    authUsers,
    setFailAuthCreate(value: boolean) {
      failAuthCreate = value;
    },
    setLoseCreateResponse(value: boolean) {
      loseCreateResponse = value;
    },
    setConflictAfterAuthCreate(value: boolean) {
      conflictAfterAuthCreate = value;
    },
    setFailRecordAuthUser(value: boolean) {
      failRecordAuthUser = value;
    },
    get authCreateCalls() {
      return authCreateCalls;
    },
    get internalRows() {
      return internalRows;
    },
    operation,
  };
}

test("failed Auth provisioning stays pending and the same operation can resume", async () => {
  const harness = createProvisionHarness();
  await assert.rejects(provisionSystemUser(provisionInput, harness), /Auth indisponível/);
  assert.equal(harness.operation.status, "pending");
  assert.equal(harness.internalRows, 0);

  harness.setFailAuthCreate(false);
  const result = await provisionSystemUser(provisionInput, harness);
  assert.equal(result, 101);
  assert.equal(harness.operation.status, "completed");
  assert.equal(harness.internalRows, 1);
  assert.equal(harness.authCreateCalls, 2);
});

test("an Auth create response lost in transit is reconciled without a second request", async () => {
  const harness = createProvisionHarness();
  harness.setFailAuthCreate(false);
  harness.setLoseCreateResponse(true);

  const result = await provisionSystemUser(provisionInput, harness);
  assert.equal(result, 101);
  assert.equal(harness.authCreateCalls, 1);
  assert.equal(harness.authUsers.size, 1);
  assert.equal(harness.internalRows, 1);
});

test("a failed database link stays pending and retry completes the existing Auth account", async () => {
  const harness = createProvisionHarness();
  harness.setFailAuthCreate(false);
  harness.setFailRecordAuthUser(true);

  await assert.rejects(
    provisionSystemUser(provisionInput, harness),
    /Falha ao persistir o vínculo Auth/,
  );
  assert.equal(harness.operation.status, "pending");
  assert.equal(harness.internalRows, 0);

  harness.setFailRecordAuthUser(false);
  const result = await provisionSystemUser(provisionInput, harness);
  assert.equal(result, 101);
  assert.equal(harness.authCreateCalls, 1);
  assert.equal(harness.authUsers.size, 1);
  assert.equal(harness.internalRows, 1);
});

test("a concurrent Auth create conflict is reconciled to the account already created", async () => {
  const harness = createProvisionHarness();
  harness.setFailAuthCreate(false);
  harness.setConflictAfterAuthCreate(true);

  const result = await provisionSystemUser(provisionInput, harness);
  assert.equal(result, 101);
  assert.equal(harness.authCreateCalls, 1);
  assert.equal(harness.authUsers.size, 1);
  assert.equal(harness.internalRows, 1);
  assert.equal(harness.operation.status, "completed");
});

function createRemovalHarness() {
  const operation: RemovalOperation = {
    id: "op-remove-1",
    status: "pending",
    authUserId: "auth-user-1",
  };
  let userActive = true;
  let authUserExists = true;
  let deleteError: Error | null = new Error("Auth indisponível");
  let internalDeleted = false;
  let deleteCalls = 0;
  const operations = {
    async beginRemoval() {
      userActive = false;
      return operation;
    },
    async completeRemoval() {
      if (operation.status === "completed") return;
      assert.equal(
        operation.authUserId,
        null,
        "Auth deletion must be confirmed before the User is removed",
      );
      internalDeleted = true;
      operation.status = "completed";
    },
  };
  const auth = {
    async deleteUser() {
      deleteCalls += 1;
      if (deleteError) throw deleteError;
      authUserExists = false;
      operation.authUserId = null;
    },
    async userExists() {
      if (!authUserExists) operation.authUserId = null;
      return authUserExists;
    },
  };

  return {
    auth,
    operations,
    operation,
    setDeleteError(error: Error | null) {
      deleteError = error;
    },
    setAuthUserExists(value: boolean) {
      authUserExists = value;
    },
    get deleteCalls() {
      return deleteCalls;
    },
    get internalDeleted() {
      return internalDeleted;
    },
    get userActive() {
      return userActive;
    },
  };
}

test("Auth deletion failure keeps User pending and suspended until a retry succeeds", async () => {
  const harness = createRemovalHarness();
  await assert.rejects(
    removeSystemUser({ operationId: "op-remove-1", userId: 7 }, harness),
    /Auth indisponível/,
  );
  assert.equal(harness.userActive, false);
  assert.equal(harness.operation.status, "pending");
  assert.equal(harness.internalDeleted, false);

  harness.setDeleteError(null);
  const result = await removeSystemUser({ operationId: "op-remove-1", userId: 7 }, harness);
  assert.equal(result, undefined);
  assert.equal(harness.operation.status, "completed");
  assert.equal(harness.internalDeleted, true);
  assert.equal(harness.deleteCalls, 2);
});

test("a lost Auth delete response is reconciled after Auth confirms the user is absent", async () => {
  const harness = createRemovalHarness();
  harness.setAuthUserExists(false);

  const result = await removeSystemUser({ operationId: "op-remove-1", userId: 7 }, harness);
  assert.equal(result, undefined);
  assert.equal(harness.operation.status, "completed");
  assert.equal(harness.internalDeleted, true);
  assert.equal(harness.deleteCalls, 1);
});
