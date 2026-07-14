import { describe, expect, test } from "vitest";
import { buildServer } from "../src/server.js";
import { sha256 } from "../src/security.js";
import { MemoryStore } from "../src/store.js";

const now = new Date("2026-06-22T08:00:00.000Z");
const encryptionKey = "0123456789abcdef0123456789abcdef";

async function createAuthorizedUser(store: MemoryStore) {
  const user = await store.upsertUserByEmail("user@example.com", now);
  const sessionToken = "desktop-session-token";
  await store.createSession({
    userId: user.id,
    tokenHash: sha256(sessionToken),
    createdAt: now,
    expiresAt: new Date("2026-07-22T08:00:00.000Z"),
  });
  await store.upsertEntitlement(user.id, new Date("2026-07-22T08:00:00.000Z"), now);
  const entitlement = await store.getEntitlement(user.id);
  if (entitlement) {
    (entitlement as any).llmQuotaLimit = 20;
    (entitlement as any).llmQuotaUsed = 0;
  }
  return { user, sessionToken };
}

function buildTestServer(
  store: MemoryStore,
  options: { anysearchMcpUrl?: string; anysearchApiKey?: string | null } = {},
) {
  return buildServer({
    store,
    sendOtp: async () => {},
    createNativePayment: async () => ({ codeUrl: "unused", providerPayload: {} }),
    adminEmail: "lantianye@163.com",
    llmConfigEncryptionKey: encryptionKey,
    anysearchMcpUrl: options.anysearchMcpUrl,
    anysearchApiKey: options.anysearchApiKey,
    now: () => now,
  } as any);
}

describe("POST /api/desktop/anysearch/checkout", () => {
  test("rejects unauthenticated requests with 401 AUTH_REQUIRED", async () => {
    const store = new MemoryStore();
    const app = buildTestServer(store, {
      anysearchMcpUrl: "https://anysearch.example/mcp",
      anysearchApiKey: "the-key",
    });

    const noToken = await app.inject({
      method: "POST",
      url: "/api/desktop/anysearch/checkout",
    });
    expect(noToken.statusCode).toBe(401);
    expect(noToken.json()).toEqual({ error: "AUTH_REQUIRED" });

    const { sessionToken } = await createAuthorizedUser(store);
    const invalidToken = await app.inject({
      method: "POST",
      url: "/api/desktop/anysearch/checkout",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(invalidToken.statusCode).toBe(401);
    expect(invalidToken.json()).toEqual({ error: "AUTH_REQUIRED" });

    // 不变：sessionToken 仅用于证明有效 token 才放行（上面无效 token 已覆盖）。
    void sessionToken;
  });

  test("returns 400 ANYSEARCH_CONFIG_MISSING when server has no mcp url", async () => {
    const store = new MemoryStore();
    await createAuthorizedUser(store);
    // 显式空 url（handler 走 !anysearchMcpUrl 分支，与 env 未设等价）。
    const app = buildTestServer(store, { anysearchMcpUrl: "", anysearchApiKey: "the-key" });

    const response = await app.inject({
      method: "POST",
      url: "/api/desktop/anysearch/checkout",
      headers: { authorization: "Bearer desktop-session-token" },
      // 请求体故意带 request_id，端点应忽略（anysearch 无 request_id 契约）。
      payload: { request_id: "should-be-ignored" },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "ANYSEARCH_CONFIG_MISSING" });
  });

  test("issues credentials with an api key when configured", async () => {
    const store = new MemoryStore();
    const { user } = await createAuthorizedUser(store);
    const app = buildTestServer(store, {
      anysearchMcpUrl: "https://anysearch.example/mcp",
      anysearchApiKey: "the-key",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/desktop/anysearch/checkout",
      headers: { authorization: "Bearer desktop-session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      mcp_url: "https://anysearch.example/mcp",
      api_key: "the-key",
    });

    // 不计费、不改 entitlement（design D4）：配额与到期日保持不变。
    await expect(store.getEntitlement(user.id)).resolves.toMatchObject({
      llmQuotaLimit: 20,
      llmQuotaUsed: 0,
    });
  });

  test("issues anonymous credentials (api_key null) when no key configured", async () => {
    const store = new MemoryStore();
    const { user } = await createAuthorizedUser(store);
    // 不注入 anysearchApiKey → api_key 应为 null。
    const app = buildTestServer(store, {
      anysearchMcpUrl: "https://anysearch.example/mcp",
    });

    const response = await app.inject({
      method: "POST",
      url: "/api/desktop/anysearch/checkout",
      headers: { authorization: "Bearer desktop-session-token" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      mcp_url: "https://anysearch.example/mcp",
      api_key: null,
    });

    // 仍不计费、不改 entitlement。
    await expect(store.getEntitlement(user.id)).resolves.toMatchObject({
      llmQuotaLimit: 20,
      llmQuotaUsed: 0,
    });
  });
});
