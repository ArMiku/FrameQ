import { existsSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { createTemporaryPrismaClient } from "./prismaTestHarness.js";

describe("temporary Prisma transaction fixture", () => {
  test("removes its temporary directory when setup fails before the fixture is returned", async () => {
    let temporaryDirectory: string | null = null;
    let fixture: Awaited<ReturnType<typeof createTemporaryPrismaClient>> | null = null;
    let failure: unknown;

    try {
      fixture = await createTemporaryPrismaClient({
        beforeConnect: (directory: string) => {
          temporaryDirectory = directory;
          throw new Error("injected temporary fixture setup failure");
        },
      });
    } catch (error) {
      failure = error;
    } finally {
      await fixture?.cleanup();
    }

    expect(failure).toMatchObject({ message: "injected temporary fixture setup failure" });
    expect(temporaryDirectory).not.toBeNull();
    expect(existsSync(temporaryDirectory ?? "")).toBe(false);
  });
});
