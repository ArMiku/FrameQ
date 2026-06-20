import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

export function resolveDatabaseUrl(): string {
  const configured = process.env.DATABASE_URL;
  if (configured && configured.trim()) {
    return configured;
  }
  const serverRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const sqlitePath = resolve(serverRoot, "data", "frameq.sqlite").replace(/\\/g, "/");
  mkdirSync(dirname(sqlitePath), { recursive: true });
  return `file:${sqlitePath}`;
}

export async function createPrismaClient(): Promise<PrismaClient> {
  process.env.DATABASE_URL = resolveDatabaseUrl();
  const prisma = new PrismaClient();
  await prisma.$connect();
  await prisma.$executeRawUnsafe("PRAGMA journal_mode=WAL");
  await prisma.$executeRawUnsafe("PRAGMA busy_timeout=5000");
  return prisma;
}
