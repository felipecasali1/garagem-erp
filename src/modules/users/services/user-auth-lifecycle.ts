export type ProvisionUserInput = {
  operationId: string;
  employeeId: number;
  email: string;
  password: string;
  accessRole: "admin" | "manager" | "seller" | "financial";
  isAdmin: boolean;
  active: boolean;
};

export type ProvisionOperation = {
  id: string;
  status: "pending" | "completed";
  authUserId: string | null;
  email: string;
  name?: string;
  resultUserId: number | null;
};

export type RemovalOperation = {
  id: string;
  status: "pending" | "completed";
  authUserId: string | null;
};

type ProvisionDependencies = {
  operations: {
    beginProvision(
      input: Omit<ProvisionUserInput, "password" | "email">,
    ): Promise<ProvisionOperation>;
    setProvisionAuthUser(operationId: string, authUserId: string): Promise<void>;
    completeProvision(operationId: string, authUserId: string): Promise<number>;
  };
  auth: {
    findUserByProvisionOperation(operationId: string): Promise<{ id: string } | null>;
    createUser(input: {
      operationId: string;
      email: string;
      password: string;
      name?: string;
    }): Promise<{ id: string }>;
  };
};

type RemovalDependencies = {
  operations: {
    beginRemoval(operationId: string, userId: number): Promise<RemovalOperation>;
    completeRemoval(operationId: string): Promise<void>;
  };
  auth: {
    deleteUser(authUserId: string): Promise<void>;
    userExists(authUserId: string): Promise<boolean>;
  };
};

export async function provisionSystemUser(
  input: ProvisionUserInput,
  { operations, auth }: ProvisionDependencies,
) {
  const operation = await operations.beginProvision({
    operationId: input.operationId,
    employeeId: input.employeeId,
    accessRole: input.accessRole,
    isAdmin: input.isAdmin,
    active: input.active,
  });

  if (operation.status === "completed") {
    if (operation.resultUserId == null) {
      throw new Error("A operação de criação foi concluída sem um User interno associado.");
    }
    return operation.resultUserId;
  }

  let authUserId = operation.authUserId;
  if (!authUserId) {
    const recoveredUser = await auth.findUserByProvisionOperation(operation.id);
    if (recoveredUser) {
      authUserId = recoveredUser.id;
    } else {
      try {
        const createdUser = await auth.createUser({
          operationId: operation.id,
          email: operation.email,
          password: input.password,
          name: operation.name,
        });
        authUserId = createdUser.id;
      } catch (createError) {
        const concurrentlyCreatedUser = await auth.findUserByProvisionOperation(operation.id);
        if (!concurrentlyCreatedUser) throw createError;
        authUserId = concurrentlyCreatedUser.id;
      }
    }
    await operations.setProvisionAuthUser(operation.id, authUserId);
  }

  return operations.completeProvision(operation.id, authUserId);
}

export async function removeSystemUser(
  input: { operationId: string; userId: number },
  { operations, auth }: RemovalDependencies,
) {
  const operation = await operations.beginRemoval(input.operationId, input.userId);
  if (operation.status === "completed") return;

  if (operation.authUserId) {
    try {
      await auth.deleteUser(operation.authUserId);
    } catch (deleteError) {
      const stillExists = await auth.userExists(operation.authUserId);
      if (stillExists) throw deleteError;
    }
  }

  await operations.completeRemoval(operation.id);
}
