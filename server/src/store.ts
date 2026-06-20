import { randomUUID } from "node:crypto";

export type UserRecord = {
  id: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
};

export type EmailOtpRecord = {
  id: string;
  email: string;
  state: string;
  codeHash: string;
  ip: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type DesktopLoginTicketRecord = {
  id: string;
  ticketHash: string;
  state: string;
  userId: string;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
};

export type SessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type OrderRecord = {
  id: string;
  userId: string;
  outTradeNo: string;
  amountFen: number;
  status: "pending" | "paid" | "expired" | "cancelled";
  codeUrl: string;
  expiresAt: Date;
  createdAt: Date;
  paidAt: Date | null;
  transactionId: string | null;
  providerPayload: string;
};

export type EntitlementRecord = {
  id: string;
  userId: string;
  status: "active" | "inactive";
  expiresAt: Date;
  updatedAt: Date;
};

export type WebhookEventRecord = {
  id: string;
  provider: string;
  eventId: string;
  outTradeNo: string;
  payload: string;
  createdAt: Date;
};

export type Store = {
  upsertUserByEmail(email: string, now: Date): Promise<UserRecord>;
  getUserById(userId: string): Promise<UserRecord | null>;
  createEmailOtp(input: Omit<EmailOtpRecord, "id" | "attempts" | "consumedAt">): Promise<EmailOtpRecord>;
  findLatestUsableOtp(email: string, state: string, now: Date): Promise<EmailOtpRecord | null>;
  incrementOtpAttempts(otpId: string): Promise<EmailOtpRecord>;
  consumeOtp(otpId: string, now: Date): Promise<void>;
  createDesktopLoginTicket(input: Omit<DesktopLoginTicketRecord, "id" | "consumedAt">): Promise<DesktopLoginTicketRecord>;
  consumeDesktopLoginTicket(ticketHash: string, state: string, now: Date): Promise<DesktopLoginTicketRecord | null>;
  createSession(input: Omit<SessionRecord, "id" | "revokedAt">): Promise<SessionRecord>;
  findSessionByTokenHash(tokenHash: string, now: Date): Promise<SessionRecord | null>;
  revokeSession(tokenHash: string, now: Date): Promise<void>;
  createOrder(input: Omit<OrderRecord, "id" | "paidAt" | "transactionId">): Promise<OrderRecord>;
  findOrderByOutTradeNo(outTradeNo: string): Promise<OrderRecord | null>;
  markOrderPaid(outTradeNo: string, transactionId: string, paidAt: Date): Promise<OrderRecord>;
  getEntitlement(userId: string): Promise<EntitlementRecord | null>;
  upsertEntitlement(userId: string, expiresAt: Date, now: Date): Promise<EntitlementRecord>;
  createWebhookEvent(input: Omit<WebhookEventRecord, "id" | "createdAt"> & { createdAt: Date }): Promise<boolean>;
};

export class MemoryStore implements Store {
  users: UserRecord[] = [];
  emailOtps: EmailOtpRecord[] = [];
  desktopLoginTickets: DesktopLoginTicketRecord[] = [];
  sessions: SessionRecord[] = [];
  orders: OrderRecord[] = [];
  entitlements: EntitlementRecord[] = [];
  webhookEvents: WebhookEventRecord[] = [];

  async upsertUserByEmail(email: string, now: Date): Promise<UserRecord> {
    const existing = this.users.find((user) => user.email === email);
    if (existing) {
      existing.updatedAt = now;
      return existing;
    }
    const user = { id: randomUUID(), email, createdAt: now, updatedAt: now };
    this.users.push(user);
    return user;
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    return this.users.find((user) => user.id === userId) ?? null;
  }

  async createEmailOtp(input: Omit<EmailOtpRecord, "id" | "attempts" | "consumedAt">): Promise<EmailOtpRecord> {
    const otp = { ...input, id: randomUUID(), attempts: 0, consumedAt: null };
    this.emailOtps.push(otp);
    return otp;
  }

  async findLatestUsableOtp(email: string, state: string, now: Date): Promise<EmailOtpRecord | null> {
    return (
      [...this.emailOtps]
        .reverse()
        .find(
          (otp) =>
            otp.email === email &&
            otp.state === state &&
            otp.consumedAt === null &&
            otp.attempts < 5 &&
            otp.expiresAt > now,
        ) ?? null
    );
  }

  async incrementOtpAttempts(otpId: string): Promise<EmailOtpRecord> {
    const otp = this.emailOtps.find((record) => record.id === otpId);
    if (!otp) {
      throw new Error("OTP record not found.");
    }
    otp.attempts += 1;
    return otp;
  }

  async consumeOtp(otpId: string, now: Date): Promise<void> {
    const otp = this.emailOtps.find((record) => record.id === otpId);
    if (otp) {
      otp.consumedAt = now;
    }
  }

  async createDesktopLoginTicket(
    input: Omit<DesktopLoginTicketRecord, "id" | "consumedAt">,
  ): Promise<DesktopLoginTicketRecord> {
    const ticket = { ...input, id: randomUUID(), consumedAt: null };
    this.desktopLoginTickets.push(ticket);
    return ticket;
  }

  async consumeDesktopLoginTicket(
    ticketHash: string,
    state: string,
    now: Date,
  ): Promise<DesktopLoginTicketRecord | null> {
    const ticket =
      this.desktopLoginTickets.find(
        (record) =>
          record.ticketHash === ticketHash &&
          record.state === state &&
          record.consumedAt === null &&
          record.expiresAt > now,
      ) ?? null;
    if (ticket) {
      ticket.consumedAt = now;
    }
    return ticket;
  }

  async createSession(input: Omit<SessionRecord, "id" | "revokedAt">): Promise<SessionRecord> {
    const session = { ...input, id: randomUUID(), revokedAt: null };
    this.sessions.push(session);
    return session;
  }

  async findSessionByTokenHash(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    return (
      this.sessions.find(
        (session) => session.tokenHash === tokenHash && session.revokedAt === null && session.expiresAt > now,
      ) ?? null
    );
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    const session = this.sessions.find((record) => record.tokenHash === tokenHash);
    if (session) {
      session.revokedAt = now;
    }
  }

  async createOrder(input: Omit<OrderRecord, "id" | "paidAt" | "transactionId">): Promise<OrderRecord> {
    const order = { ...input, id: randomUUID(), paidAt: null, transactionId: null };
    this.orders.push(order);
    return order;
  }

  async findOrderByOutTradeNo(outTradeNo: string): Promise<OrderRecord | null> {
    return this.orders.find((order) => order.outTradeNo === outTradeNo) ?? null;
  }

  async markOrderPaid(outTradeNo: string, transactionId: string, paidAt: Date): Promise<OrderRecord> {
    const order = await this.findOrderByOutTradeNo(outTradeNo);
    if (!order) {
      throw new Error("Order not found.");
    }
    order.status = "paid";
    order.transactionId = transactionId;
    order.paidAt = paidAt;
    return order;
  }

  async getEntitlement(userId: string): Promise<EntitlementRecord | null> {
    return this.entitlements.find((entitlement) => entitlement.userId === userId) ?? null;
  }

  async upsertEntitlement(userId: string, expiresAt: Date, now: Date): Promise<EntitlementRecord> {
    const existing = await this.getEntitlement(userId);
    if (existing) {
      existing.status = expiresAt > now ? "active" : "inactive";
      existing.expiresAt = expiresAt;
      existing.updatedAt = now;
      return existing;
    }
    const entitlement: EntitlementRecord = {
      id: randomUUID(),
      userId,
      status: expiresAt > now ? "active" : "inactive",
      expiresAt,
      updatedAt: now,
    };
    this.entitlements.push(entitlement);
    return entitlement;
  }

  async createWebhookEvent(
    input: Omit<WebhookEventRecord, "id" | "createdAt"> & { createdAt: Date },
  ): Promise<boolean> {
    if (
      this.webhookEvents.some(
        (event) => event.provider === input.provider && event.eventId === input.eventId,
      )
    ) {
      return false;
    }
    this.webhookEvents.push({ ...input, id: randomUUID() });
    return true;
  }
}

