import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaPath = join(serverRoot, "prisma", "schema.prisma");
const prismaCliPath = join(serverRoot, "node_modules", "prisma", "build", "index.js");

type TemporaryPrismaClientOptions = {
  beforeConnect?: (directory: string) => void;
};

export async function createTemporaryPrismaClient(options: TemporaryPrismaClientOptions = {}): Promise<{
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}> {
  const directory = mkdtempSync(join(tmpdir(), "frameq-prisma-transaction-"));
  let prisma: PrismaClient | null = null;
  try {
    const databasePath = join(directory, "frameq.sqlite").replace(/\\/g, "/");
    const databaseUrl = `file:${databasePath}`;
    const temporarySchemaPath = join(directory, "schema.prisma");
    const schema = readFileSync(schemaPath, "utf8").replace(
      'url      = env("DATABASE_URL")',
      'url      = "file:./frameq.sqlite"',
    );
    writeFileSync(temporarySchemaPath, schema);
    const migrationSql = execFileSync(
      process.execPath,
      [prismaCliPath, "migrate", "diff", "--from-empty", "--to-schema-datamodel", temporarySchemaPath, "--script"],
      {
        cwd: serverRoot,
        stdio: "pipe",
      },
    ).toString("utf8");
    const database = new DatabaseSync(databasePath);
    try {
      database.exec(migrationSql);
    } finally {
      database.close();
    }

    options.beforeConnect?.(directory);
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    const connectedPrisma = prisma;
    return {
      prisma: connectedPrisma,
      cleanup: async () => {
        try {
          await connectedPrisma.$disconnect();
        } finally {
          rmSync(directory, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    try {
      await prisma?.$disconnect();
    } catch {
      // Preserve the setup failure; the directory is still removed below.
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
    throw error;
  }
}

export function prismaWithInjectedWriteFailure(
  prisma: PrismaClient,
  input: { model: string; methods: string[]; message: string },
): PrismaClient {
  const wrapClient = (target: Record<PropertyKey, unknown>): Record<PropertyKey, unknown> =>
    new Proxy(target, {
      get(currentTarget, property, receiver) {
        if (property === "$transaction") {
          const transaction = Reflect.get(currentTarget, property, receiver) as (
            callback: (transactionClient: Record<PropertyKey, unknown>) => Promise<unknown>,
            ...rest: unknown[]
          ) => Promise<unknown>;
          return async (
            callback: (transactionClient: Record<PropertyKey, unknown>) => Promise<unknown>,
            ...rest: unknown[]
          ) => transaction.call(currentTarget, async (transactionClient) => callback(wrapClient(transactionClient)), ...rest);
        }

        const value = Reflect.get(currentTarget, property, receiver);
        if (String(property) !== input.model || !value || typeof value !== "object") {
          return typeof value === "function" ? value.bind(currentTarget) : value;
        }
        return new Proxy(value as Record<PropertyKey, unknown>, {
          get(delegate, method, delegateReceiver) {
            const operation = Reflect.get(delegate, method, delegateReceiver);
            if (typeof method === "string" && input.methods.includes(method)) {
              return async () => {
                throw new Error(input.message);
              };
            }
            return typeof operation === "function" ? operation.bind(delegate) : operation;
          },
        });
      },
    });

  return wrapClient(prisma as unknown as Record<PropertyKey, unknown>) as unknown as PrismaClient;
}
