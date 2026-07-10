import { describe, expect, test } from "vitest";
import { ActivationCodeService } from "../src/activation.js";
import { BillingService } from "../src/billing.js";
import { sha256 } from "../src/security.js";
import { buildServer } from "../src/server.js";
import { type AdminEntitlementAdjustmentRecord, MemoryStore } from "../src/store.js";

const now = new Date("2026-07-10T08:00:00.000Z");
const paidAt = new Date("2026-07-10T08:05:00.000Z");

class FailOnceOrderUpdateStore extends MemoryStore {
  private fail = true;

  override async markOrderPaid(outTradeNo: string, transactionId: string, settledAt: Date) {
    if (this.fail) {
      this.fail = false;
      throw new Error("injected order update failure");
    }
    return super.markOrderPaid(outTradeNo, transactionId, settledAt);
  }
}

class FailOnceEntitlementWriteStore extends MemoryStore {
  private fail = true;

  override async upsertEntitlement(
    userId: string,
    expiresAt: Date,
    updatedAt: Date,
    quota: { llmQuotaLimit?: number; llmQuotaUsed?: number } = {},
  ) {
    if (this.fail) {
      this.fail = false;
      throw new Error("injected entitlement write failure");
    }
    return super.upsertEntitlement(userId, expiresAt, updatedAt, quota);
  }
}

class FailAuditWriteStore extends MemoryStore {
  override async createAdminEntitlementAdjustment(
    _input: AdminEntitlementAdjustmentRecord,
  ): Promise<AdminEntitlementAdjustmentRecord> {
    throw new Error("injected audit write failure");
  }
}

function billingFor(store: MemoryStore): BillingService {
  return new BillingService({
    store,
    now: () => now,
    createNativePayment: async () => ({ codeUrl: "unused", providerPayload: {} }),
  });
}

async function createPendingOrder(store: MemoryStore) {
  const user = await store.upsertUserByEmail("payment@example.com", now);
  const order = await store.createOrder({
    userId: user.id,
    outTradeNo: "fq_transaction_safety",
    amountFen: 990,
    status: "pending",
    codeUrl: "weixin://wxpay/bizpayurl?pr=fq_transaction_safety",
    expiresAt: new Date("2026-07-10T08:30:00.000Z"),
    createdAt: now,
    providerPayload: "{}",
  });
  return { user, order };
}

describe("transactional entitlement boundaries in MemoryStore", () => {
  test("rolls back a recorded webhook when the order write fails and safely retries once", async () => {
    const store = new FailOnceOrderUpdateStore();
    const { order } = await createPendingOrder(store);
    const billing = billingFor(store);
    const event = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-transaction-1",
      webhookId: "wechat-event-1",
      paidAt,
    };

    await expect(billing.applyPaidOrder(event)).rejects.toThrow("injected order update failure");

    expect(store.webhookEvents).toHaveLength(0);
    expect(store.orders[0]).toMatchObject({ status: "pending", transactionId: null, paidAt: null });
    expect(store.entitlements).toHaveLength(0);

    await expect(billing.applyPaidOrder(event)).resolves.toMatchObject({
      entitlementExpiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
    expect(store.webhookEvents).toHaveLength(1);
    expect(store.entitlements).toHaveLength(1);
  });

  test("rolls back the paid-order transition when entitlement extension fails", async () => {
    const store = new FailOnceEntitlementWriteStore();
    const { order } = await createPendingOrder(store);
    const billing = billingFor(store);
    const event = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-transaction-entitlement-failure",
      webhookId: "wechat-event-entitlement-failure",
      paidAt,
    };

    await expect(billing.applyPaidOrder(event)).rejects.toThrow("injected entitlement write failure");

    expect(store.webhookEvents).toHaveLength(0);
    expect(store.orders[0]).toMatchObject({ status: "pending", transactionId: null, paidAt: null });
    expect(store.entitlements).toHaveLength(0);
    await expect(billing.applyPaidOrder(event)).resolves.toMatchObject({
      entitlementExpiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
  });

  test("completes a verified replay of a deterministic legacy pending payment event once", async () => {
    const store = new MemoryStore();
    const { order } = await createPendingOrder(store);
    const event = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-legacy-transaction",
      webhookId: "wechat-legacy-event",
      paidAt,
    };
    await store.createWebhookEvent({
      provider: "wechat",
      eventId: event.webhookId,
      outTradeNo: event.outTradeNo,
      payload: JSON.stringify(event),
      createdAt: now,
    });

    await expect(billingFor(store).applyPaidOrder(event)).resolves.toMatchObject({
      entitlementExpiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
    expect(store.webhookEvents).toHaveLength(1);
    expect(store.orders[0]).toMatchObject({ status: "paid", transactionId: event.transactionId });
    expect(store.entitlements).toHaveLength(1);
  });

  test("does not restore a paid order with no original webhook evidence", async () => {
    const store = new MemoryStore();
    const { order } = await createPendingOrder(store);
    await store.markOrderPaid(order.outTradeNo, "wx-paid-without-webhook", paidAt);

    await expect(
      billingFor(store).applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-paid-without-webhook",
        webhookId: "wechat-new-event",
        paidAt,
      }),
    ).rejects.toThrow("Order cannot be settled in its current state.");
    expect(store.webhookEvents).toHaveLength(0);
    expect(store.entitlements).toHaveLength(0);
  });

  test("records a distinct valid webhook replay without extending the entitlement twice", async () => {
    const store = new MemoryStore();
    const { order } = await createPendingOrder(store);
    const billing = billingFor(store);
    const first = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-recorded-replay",
      webhookId: "wechat-recorded-replay-first",
      paidAt,
    };

    await billing.applyPaidOrder(first);
    const expiry = store.entitlements[0]?.expiresAt;
    await expect(
      billing.applyPaidOrder({ ...first, webhookId: "wechat-recorded-replay-second" }),
    ).resolves.toMatchObject({ entitlementExpiresAt: expiry });

    expect(store.webhookEvents).toHaveLength(2);
    expect(store.entitlements[0]?.expiresAt).toEqual(expiry);
  });

  test("rejects a replay whose webhook ID is bound to a different transaction", async () => {
    const store = new MemoryStore();
    const { order } = await createPendingOrder(store);
    await store.createWebhookEvent({
      provider: "wechat",
      eventId: "wechat-bound-event",
      outTradeNo: order.outTradeNo,
      payload: JSON.stringify({ transactionId: "wx-original-transaction" }),
      createdAt: now,
    });

    await expect(
      billingFor(store).applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-conflicting-transaction",
        webhookId: "wechat-bound-event",
        paidAt,
      }),
    ).rejects.toThrow("Payment transaction does not match order.");
    expect(store.orders[0]).toMatchObject({ status: "pending", transactionId: null, paidAt: null });
    expect(store.entitlements).toHaveLength(0);
  });

  test("does not recover a paid order from a legacy webhook without a transaction binding", async () => {
    const store = new MemoryStore();
    const { order } = await createPendingOrder(store);
    await store.createWebhookEvent({
      provider: "wechat",
      eventId: "wechat-webhook-without-transaction",
      outTradeNo: order.outTradeNo,
      payload: JSON.stringify({ outTradeNo: order.outTradeNo }),
      createdAt: now,
    });
    await store.markOrderPaid(order.outTradeNo, "wx-unverified-legacy-transaction", paidAt);

    await expect(
      billingFor(store).applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-unverified-legacy-transaction",
        webhookId: "wechat-webhook-without-transaction",
        paidAt,
      }),
    ).rejects.toThrow("Payment transaction does not match order.");
    expect(store.entitlements).toHaveLength(0);
  });

  test("rolls back activation redemption when entitlement quota grant fails", async () => {
    const store = new FailOnceEntitlementWriteStore();
    const user = await store.upsertUserByEmail("activation@example.com", now);
    const session = await store.createSession({
      userId: user.id,
      tokenHash: "activation-session",
      createdAt: now,
      expiresAt: new Date("2026-08-10T08:00:00.000Z"),
    });
    const activation = new ActivationCodeService({ store, now: () => now });
    const code = await activation.generateCode();

    await expect(
      activation.redeemCode({ sessionTokenHash: session.tokenHash, code: code.code }),
    ).rejects.toThrow("injected entitlement write failure");

    expect(store.activationCodes[0]).toMatchObject({
      status: "active",
      redeemedAt: null,
      redeemedByUserId: null,
    });
    expect(await store.getEntitlement(user.id)).toBeNull();

    await expect(
      activation.redeemCode({ sessionTokenHash: session.tokenHash, code: code.code }),
    ).resolves.toMatchObject({ entitlementExpiresAt: new Date("2026-08-10T08:00:00.000Z") });
  });

  test("does not persist administrator compensation when its required audit write fails", async () => {
    const store = new FailAuditWriteStore();
    const user = await store.upsertUserByEmail("compensation@example.com", now);
    const adminToken = "admin-transaction-token";
    const csrfToken = "admin-transaction-csrf";
    await store.createAdminSession({
      email: "lantianye@163.com",
      tokenHash: sha256(adminToken),
      csrfTokenHash: sha256(csrfToken),
      createdAt: now,
      expiresAt: new Date("2026-07-10T20:00:00.000Z"),
    });
    const app = buildServer({
      store,
      now: () => now,
      adminEmail: "lantianye@163.com",
      sendOtp: async () => {},
      createNativePayment: async () => ({ codeUrl: "unused", providerPayload: {} }),
    });

    const response = await app.inject({
      method: "POST",
      url: `/admin/api/users/${user.id}/entitlement-adjustments`,
      headers: {
        cookie: `frameq_admin_session=${adminToken}; frameq_admin_csrf=${csrfToken}`,
        "x-frameq-csrf": csrfToken,
      },
      payload: { extend_days: 7, quota_add: 5, reason: "manual_repair" },
    });

    expect(response.statusCode).toBe(500);
    expect(await store.getEntitlement(user.id)).toBeNull();
    expect(store.adminEntitlementAdjustments).toHaveLength(0);
  });

  test("rejects a concurrent distinct transaction instead of settling the order twice", async () => {
    const store = new MemoryStore();
    const { order } = await createPendingOrder(store);
    const billing = billingFor(store);

    const results = await Promise.allSettled([
      billing.applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-transaction-first",
        webhookId: "wechat-event-first",
        paidAt,
      }),
      billing.applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-transaction-second",
        webhookId: "wechat-event-second",
        paidAt,
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(store.entitlements).toHaveLength(1);
    expect(store.entitlements[0]?.expiresAt).toEqual(new Date("2026-08-10T08:05:00.000Z"));
  });

  test("permits only one concurrent redemption of the same activation code", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUserByEmail("concurrent-activation@example.com", now);
    const session = await store.createSession({
      userId: user.id,
      tokenHash: "concurrent-activation-session",
      createdAt: now,
      expiresAt: new Date("2026-08-10T08:00:00.000Z"),
    });
    const activation = new ActivationCodeService({ store, now: () => now });
    const code = await activation.generateCode();

    const results = await Promise.allSettled([
      activation.redeemCode({ sessionTokenHash: session.tokenHash, code: code.code }),
      activation.redeemCode({ sessionTokenHash: session.tokenHash, code: code.code }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(await store.getEntitlement(user.id)).toMatchObject({ llmQuotaLimit: 20, llmQuotaUsed: 0 });
  });
});
