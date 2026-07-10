import { afterEach, describe, expect, test } from "vitest";
import { ActivationCodeService } from "../src/activation.js";
import { BillingService } from "../src/billing.js";
import { PrismaStore } from "../src/prismaStore.js";
import { sha256 } from "../src/security.js";
import { buildServer } from "../src/server.js";
import { createTemporaryPrismaClient, prismaWithInjectedWriteFailure } from "./prismaTestHarness.js";

const now = new Date("2026-07-10T08:00:00.000Z");
const paidAt = new Date("2026-07-10T08:05:00.000Z");

const fixtures: Array<{ cleanup: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((fixture) => fixture.cleanup()));
});

function billingFor(store: PrismaStore): BillingService {
  return new BillingService({
    store,
    now: () => now,
    createNativePayment: async () => ({ codeUrl: "unused", providerPayload: {} }),
  });
}

async function pendingOrder(store: PrismaStore) {
  const user = await store.upsertUserByEmail("prisma-payment@example.com", now);
  const order = await store.createOrder({
    userId: user.id,
    outTradeNo: "fq_prisma_transaction_safety",
    amountFen: 990,
    status: "pending",
    codeUrl: "weixin://wxpay/bizpayurl?pr=fq_prisma_transaction_safety",
    expiresAt: new Date("2026-07-10T08:30:00.000Z"),
    createdAt: now,
    providerPayload: "{}",
  });
  return { user, order };
}

describe("PrismaStore transactional entitlement boundaries", () => {
  test("rolls back webhook persistence when the transactional order update fails", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const verifiedStore = new PrismaStore(fixture.prisma);
    const { order } = await pendingOrder(verifiedStore);
    const failingStore = new PrismaStore(
      prismaWithInjectedWriteFailure(fixture.prisma, {
        model: "order",
        methods: ["update", "updateMany"],
        message: "injected Prisma order write failure",
      }),
    );
    const event = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-prisma-transaction",
      webhookId: "wechat-prisma-event",
      paidAt,
    };

    await expect(billingFor(failingStore).applyPaidOrder(event)).rejects.toThrow(
      "injected Prisma order write failure",
    );

    expect(await fixture.prisma.webhookEvent.count()).toBe(0);
    await expect(verifiedStore.findOrderByOutTradeNo(order.outTradeNo)).resolves.toMatchObject({
      status: "pending",
      transactionId: null,
    });
    expect(await verifiedStore.getEntitlement(order.userId)).toBeNull();

    await expect(billingFor(verifiedStore).applyPaidOrder(event)).resolves.toMatchObject({
      entitlementExpiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
  });

  test("rolls back paid order and webhook when the transactional entitlement update fails", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const verifiedStore = new PrismaStore(fixture.prisma);
    const { order } = await pendingOrder(verifiedStore);
    const failingStore = new PrismaStore(
      prismaWithInjectedWriteFailure(fixture.prisma, {
        model: "entitlement",
        methods: ["upsert"],
        message: "injected Prisma payment entitlement write failure",
      }),
    );
    const event = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-prisma-entitlement-transaction",
      webhookId: "wechat-prisma-entitlement-event",
      paidAt,
    };

    await expect(billingFor(failingStore).applyPaidOrder(event)).rejects.toThrow(
      "injected Prisma payment entitlement write failure",
    );

    expect(await fixture.prisma.webhookEvent.count()).toBe(0);
    await expect(verifiedStore.findOrderByOutTradeNo(order.outTradeNo)).resolves.toMatchObject({
      status: "pending",
      transactionId: null,
    });
    expect(await verifiedStore.getEntitlement(order.userId)).toBeNull();
  });

  test("does not restore a paid order with no original webhook evidence", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const store = new PrismaStore(fixture.prisma);
    const { order } = await pendingOrder(store);
    await store.markOrderPaid(order.outTradeNo, "wx-prisma-paid-without-webhook", paidAt);

    await expect(
      billingFor(store).applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-prisma-paid-without-webhook",
        webhookId: "wechat-prisma-new-event",
        paidAt,
      }),
    ).rejects.toThrow("Order cannot be settled in its current state.");
    expect(await fixture.prisma.webhookEvent.count()).toBe(0);
    expect(await store.getEntitlement(order.userId)).toBeNull();
  });

  test("does not recover a paid order from a legacy webhook without a transaction binding", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const store = new PrismaStore(fixture.prisma);
    const { order } = await pendingOrder(store);
    await fixture.prisma.webhookEvent.create({
      data: {
        id: "legacy-webhook-without-transaction",
        provider: "wechat",
        eventId: "wechat-prisma-webhook-without-transaction",
        outTradeNo: order.outTradeNo,
        payload: JSON.stringify({ outTradeNo: order.outTradeNo }),
        createdAt: now,
      },
    });
    await store.markOrderPaid(order.outTradeNo, "wx-prisma-unverified-legacy-transaction", paidAt);

    await expect(
      billingFor(store).applyPaidOrder({
        outTradeNo: order.outTradeNo,
        transactionId: "wx-prisma-unverified-legacy-transaction",
        webhookId: "wechat-prisma-webhook-without-transaction",
        paidAt,
      }),
    ).rejects.toThrow("Payment transaction does not match order.");
    expect(await store.getEntitlement(order.userId)).toBeNull();
  });

  test("rolls back activation redemption when the transactional entitlement write fails", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const verifiedStore = new PrismaStore(fixture.prisma);
    const user = await verifiedStore.upsertUserByEmail("prisma-activation@example.com", now);
    const session = await verifiedStore.createSession({
      userId: user.id,
      tokenHash: "prisma-activation-session",
      createdAt: now,
      expiresAt: new Date("2026-08-10T08:00:00.000Z"),
    });
    const normalActivation = new ActivationCodeService({ store: verifiedStore, now: () => now });
    const code = await normalActivation.generateCode();
    const failingStore = new PrismaStore(
      prismaWithInjectedWriteFailure(fixture.prisma, {
        model: "entitlement",
        methods: ["upsert"],
        message: "injected Prisma entitlement write failure",
      }),
    );

    await expect(
      new ActivationCodeService({ store: failingStore, now: () => now }).redeemCode({
        sessionTokenHash: session.tokenHash,
        code: code.code,
      }),
    ).rejects.toThrow("injected Prisma entitlement write failure");

    await expect(verifiedStore.findActivationCodeByHash(sha256(code.code))).resolves.toMatchObject({
      status: "active",
      redeemedAt: null,
      redeemedByUserId: null,
    });
    expect(await verifiedStore.getEntitlement(user.id)).toBeNull();
  });

  test("rolls back administrator compensation when the required Prisma audit write fails", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const verifiedStore = new PrismaStore(fixture.prisma);
    const user = await verifiedStore.upsertUserByEmail("prisma-compensation@example.com", now);
    const adminToken = "prisma-admin-token";
    const csrfToken = "prisma-admin-csrf";
    await verifiedStore.createAdminSession({
      email: "lantianye@163.com",
      tokenHash: sha256(adminToken),
      csrfTokenHash: sha256(csrfToken),
      createdAt: now,
      expiresAt: new Date("2026-07-10T20:00:00.000Z"),
    });
    const failingStore = new PrismaStore(
      prismaWithInjectedWriteFailure(fixture.prisma, {
        model: "adminEntitlementAdjustment",
        methods: ["create"],
        message: "injected Prisma audit write failure",
      }),
    );
    const app = buildServer({
      store: failingStore,
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
    await app.close();

    expect(response.statusCode).toBe(500);
    expect(await verifiedStore.getEntitlement(user.id)).toBeNull();
    expect(await fixture.prisma.adminEntitlementAdjustment.count()).toBe(0);
  });

  test("settles concurrent real SQLite webhooks at most once and keeps their retries safe", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const store = new PrismaStore(fixture.prisma);
    const { order } = await pendingOrder(store);
    const billing = billingFor(store);
    const events = [
      {
        outTradeNo: order.outTradeNo,
        transactionId: "wx-concurrent-prisma-transaction",
        webhookId: "wechat-concurrent-prisma-first",
        paidAt,
      },
      {
        outTradeNo: order.outTradeNo,
        transactionId: "wx-concurrent-prisma-transaction",
        webhookId: "wechat-concurrent-prisma-second",
        paidAt,
      },
    ];

    const initialResults = await Promise.allSettled(events.map((event) => billing.applyPaidOrder(event)));
    expect(initialResults.some((result) => result.status === "fulfilled")).toBe(true);
    for (const event of events) {
      await expect(billing.applyPaidOrder(event)).resolves.toMatchObject({
        entitlementExpiresAt: new Date("2026-08-10T08:05:00.000Z"),
      });
    }

    await expect(store.findOrderByOutTradeNo(order.outTradeNo)).resolves.toMatchObject({
      status: "paid",
      transactionId: "wx-concurrent-prisma-transaction",
    });
    await expect(store.getEntitlement(order.userId)).resolves.toMatchObject({
      expiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
    expect(await fixture.prisma.webhookEvent.count()).toBe(2);
  });

  test("keeps exact-same-event concurrent webhook delivery idempotent", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const store = new PrismaStore(fixture.prisma);
    const { order } = await pendingOrder(store);
    const event = {
      outTradeNo: order.outTradeNo,
      transactionId: "wx-same-event-prisma-transaction",
      webhookId: "wechat-same-event-prisma",
      paidAt,
    };

    const results = await Promise.allSettled([
      billingFor(store).applyPaidOrder(event),
      billingFor(store).applyPaidOrder(event),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).not.toHaveLength(0);
    await expect(billingFor(store).applyPaidOrder(event)).resolves.toMatchObject({
      entitlementExpiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
    expect(await fixture.prisma.webhookEvent.count()).toBe(1);
    await expect(store.getEntitlement(order.userId)).resolves.toMatchObject({
      expiresAt: new Date("2026-08-10T08:05:00.000Z"),
    });
  });

  test("permits only one concurrent real SQLite activation redemption", async () => {
    const fixture = await createTemporaryPrismaClient();
    fixtures.push(fixture);
    const store = new PrismaStore(fixture.prisma);
    const user = await store.upsertUserByEmail("prisma-concurrent-activation@example.com", now);
    const session = await store.createSession({
      userId: user.id,
      tokenHash: "prisma-concurrent-activation-session",
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
    await expect(store.getEntitlement(user.id)).resolves.toMatchObject({
      llmQuotaLimit: 20,
      llmQuotaUsed: 0,
    });
  });
});
