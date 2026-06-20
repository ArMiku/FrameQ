import { secureToken } from "./security.js";
import type { OrderRecord, Store } from "./store.js";

const MONTHLY_PASS_AMOUNT_FEN = 990;
const PASS_DAYS = 31;
const ORDER_TTL_MS = 30 * 60 * 1000;

export type NativePaymentInput = {
  outTradeNo: string;
  amountFen: number;
  description: string;
};

export type NativePaymentResult = {
  codeUrl: string;
  providerPayload: unknown;
};

export type BillingServiceOptions = {
  store: Store;
  now?: () => Date;
  createNativePayment: (input: NativePaymentInput) => Promise<NativePaymentResult>;
};

export class BillingService {
  private readonly store: Store;
  private readonly now: () => Date;
  private readonly createNativePayment: (input: NativePaymentInput) => Promise<NativePaymentResult>;

  constructor(options: BillingServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.createNativePayment = options.createNativePayment;
  }

  async createWechatNativeOrder(input: {
    sessionTokenHash: string;
  }): Promise<OrderRecord> {
    const now = this.now();
    const session = await this.store.findSessionByTokenHash(input.sessionTokenHash, now);
    if (!session) {
      throw new Error("Desktop session is invalid or expired.");
    }
    const outTradeNo = `fq_${now.getTime()}_${secureToken().slice(0, 12)}`;
    const payment = await this.createNativePayment({
      outTradeNo,
      amountFen: MONTHLY_PASS_AMOUNT_FEN,
      description: "FrameQ monthly pass",
    });
    return this.store.createOrder({
      userId: session.userId,
      outTradeNo,
      amountFen: MONTHLY_PASS_AMOUNT_FEN,
      status: "pending",
      codeUrl: payment.codeUrl,
      expiresAt: new Date(now.getTime() + ORDER_TTL_MS),
      createdAt: now,
      providerPayload: JSON.stringify(payment.providerPayload),
    });
  }

  async applyPaidOrder(input: {
    outTradeNo: string;
    transactionId: string;
    webhookId: string;
    paidAt: Date;
  }): Promise<{ entitlementExpiresAt: Date }> {
    const now = this.now();
    const recorded = await this.store.createWebhookEvent({
      provider: "wechat",
      eventId: input.webhookId,
      outTradeNo: input.outTradeNo,
      payload: JSON.stringify(input),
      createdAt: now,
    });
    const order = await this.store.findOrderByOutTradeNo(input.outTradeNo);
    if (!order) {
      throw new Error("Order not found.");
    }

    if (recorded && order.status !== "paid") {
      await this.store.markOrderPaid(input.outTradeNo, input.transactionId, input.paidAt);
      const existing = await this.store.getEntitlement(order.userId);
      const base =
        existing && existing.expiresAt > input.paidAt ? existing.expiresAt : input.paidAt;
      await this.store.upsertEntitlement(
        order.userId,
        new Date(base.getTime() + PASS_DAYS * 24 * 60 * 60 * 1000),
        now,
      );
    }

    const entitlement = await this.store.getEntitlement(order.userId);
    if (!entitlement) {
      throw new Error("Entitlement was not created.");
    }
    return { entitlementExpiresAt: entitlement.expiresAt };
  }

  async getOrderStatus(outTradeNo: string): Promise<OrderRecord | null> {
    return this.store.findOrderByOutTradeNo(outTradeNo);
  }
}

export const monthlyPassAmountFen = MONTHLY_PASS_AMOUNT_FEN;

