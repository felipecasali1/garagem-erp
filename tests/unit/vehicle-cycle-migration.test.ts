import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

function readMigrations() {
  const migrationsDirectory = join(process.cwd(), "supabase", "migrations");
  return readdirSync(migrationsDirectory)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(migrationsDirectory, file), "utf8"))
    .join("\n");
}

test("o mesmo veiculo pode iniciar novos ciclos de compra e venda", () => {
  const migrations = readMigrations();

  assert.match(
    migrations,
    /alter table public\.purchases\s+drop constraint if exists purchases_vehicle_id_key/i,
  );
  assert.match(
    migrations,
    /alter table public\.sales\s+drop constraint if exists sales_vehicle_id_key/i,
  );
});
