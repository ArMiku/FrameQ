import { describe, expect, test } from "vitest";
import {
  canGenerateAiWithAccount,
  canProcessWithAccount,
  createAccountStatusFailure,
  createBrowserPreviewAccountStatus,
  createGuestAccountStatus,
  isBrowserPreviewRuntime,
} from "./accountState";

describe("account state", () => {
  test("blocks processing for guests and inactive users", () => {
    expect(canProcessWithAccount(createGuestAccountStatus())).toBe(false);
    expect(
      canProcessWithAccount({
        authenticated: true,
        email: "user@example.com",
        entitlementStatus: "inactive",
        entitlementExpiresAt: null,
        llmQuotaLimit: 0,
        llmQuotaUsed: 0,
        llmQuotaRemaining: 0,
        llmQuotaResetsAt: null,
        llmConfigured: false,
        lastVerifiedAt: "2026-06-21T08:00:00.000Z",
        canProcess: false,
        canGenerateAi: false,
        serverError: null,
      }),
    ).toBe(false);
  });

  test("allows local processing with active entitlement even when LLM is unavailable", () => {
    const account = {
      authenticated: true,
      email: "user@example.com",
      entitlementStatus: "active",
      entitlementExpiresAt: "2026-07-22T08:00:00.000Z",
      llmQuotaLimit: 20,
      llmQuotaUsed: 20,
      llmQuotaRemaining: 0,
      llmQuotaResetsAt: "2026-07-22T08:00:00.000Z",
      llmConfigured: false,
      lastVerifiedAt: "2026-06-21T08:00:00.000Z",
      canProcess: true,
      canGenerateAi: false,
      serverError: null,
    };

    expect(canProcessWithAccount(account)).toBe(true);
    expect(canGenerateAiWithAccount(account)).toBe(false);
  });

  test("allows AI generation only when the server says the AI gate is ready", () => {
    const account = {
      authenticated: true,
      email: "user@example.com",
      entitlementStatus: "active",
      entitlementExpiresAt: "2026-07-22T08:00:00.000Z",
      llmQuotaLimit: 20,
      llmQuotaUsed: 2,
      llmQuotaRemaining: 18,
      llmQuotaResetsAt: "2026-07-22T08:00:00.000Z",
      llmConfigured: true,
      lastVerifiedAt: "2026-06-21T08:00:00.000Z",
      canProcess: true,
      canGenerateAi: true,
      serverError: null,
    };

    expect(canGenerateAiWithAccount(account)).toBe(true);
  });

  test("blocks processing when account status refresh fails", () => {
    const status = createAccountStatusFailure("Tauri command failed");

    expect(status.serverError).toBe("Tauri command failed");
    expect(canProcessWithAccount(status)).toBe(false);
  });

  test("browser preview account remains limited to browser preview runtime", () => {
    expect(isBrowserPreviewRuntime({ dev: true, runtimeWindow: {} })).toBe(true);
    expect(isBrowserPreviewRuntime({ dev: false, runtimeWindow: {} })).toBe(false);
    expect(isBrowserPreviewRuntime({ dev: true, runtimeWindow: { __TAURI_INTERNALS__: {} } })).toBe(false);
    expect(isBrowserPreviewRuntime({ dev: true, runtimeWindow: { __TAURI__: {} } })).toBe(false);
    expect(isBrowserPreviewRuntime({ dev: true, runtimeWindow: null })).toBe(false);
    expect(canProcessWithAccount(createBrowserPreviewAccountStatus())).toBe(true);
  });
});
