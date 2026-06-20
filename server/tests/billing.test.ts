import { describe, expect, test } from "vitest";
import { BillingService } from "../src/billing.js";
import { MemoryStore } from "../src/store.js";

const now = new Date("2026-06-21T08:00:00.000Z");

describe("WeChat monthly pass billing", () => {
  test("creates a 990 fen native order for the signed-in user", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUserByEmail("user@example.com", now);
    const session = await store.createSession({
      userId: user.id,
      tokenHash: "hash",
      createdAt: now,
      expiresAt: new Date("2026-07-21T08:00:00.000Z"),
    });
    const billing = new BillingService({
      store,
      now: () => now,
      createNativePayment: async ({ amountFen, description, outTradeNo }) => ({
        codeUrl: `weixin://wxpay/bizpayurl?pr=${outTradeNo}`,
        providerPayload: { amountFen, description },
      }),
    });

    const order = await billing.createWechatNativeOrder({
      sessionTokenHash: session.tokenHash,
    });

    expect(order.amountFen).toBe(990);
    expect(order.codeUrl).toContain("weixin://wxpay");
    expect(order.status).toBe("pending");
    expect(store.orders[0]?.providerPayload).toContain("FrameQ monthly pass");
  });

  test("applies paid webhook idempotently and extends entitlement by 31 days", async () => {
    const store = new MemoryStore();
    const user = await store.upsertUserByEmail("user@example.com", now);
    const order = await store.createOrder({
      userId: user.id,
      outTradeNo: "fq_test_order",
      amountFen: 990,
      status: "pending",
      codeUrl: "weixin://wxpay/bizpayurl?pr=fq_test_order",
      expiresAt: new Date("2026-06-21T08:30:00.000Z"),
      createdAt: now,
      providerPayload: "{}",
    });
    const billing = new BillingService({
      store,
      now: () => now,
      createNativePayment: async () => {
        throw new Error("not used");
      },
    });

    const first = await billing.applyPaidOrder({
      outTradeNo: order.outTradeNo,
      transactionId: "wx-tx-1",
      webhookId: "webhook-1",
      paidAt: new Date("2026-06-21T08:05:00.000Z"),
    });
    const replay = await billing.applyPaidOrder({
      outTradeNo: order.outTradeNo,
      transactionId: "wx-tx-1",
      webhookId: "webhook-1",
      paidAt: new Date("2026-06-21T08:06:00.000Z"),
    });

    expect(first.entitlementExpiresAt.toISOString()).toBe("2026-07-22T08:05:00.000Z");
    expect(replay.entitlementExpiresAt.toISOString()).toBe("2026-07-22T08:05:00.000Z");
    expect(store.entitlements).toHaveLength(1);
    expect(store.webhookEvents).toHaveLength(1);
  });
});

