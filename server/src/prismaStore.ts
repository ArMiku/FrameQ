import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  DesktopLoginTicketRecord,
  EmailOtpRecord,
  EntitlementRecord,
  OrderRecord,
  SessionRecord,
  Store,
  UserRecord,
  WebhookEventRecord,
} from "./store.js";

export class PrismaStore implements Store {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertUserByEmail(email: string, now: Date): Promise<UserRecord> {
    return this.prisma.user.upsert({
      where: { email },
      update: { updatedAt: now },
      create: {
        id: randomUUID(),
        email,
        createdAt: now,
        updatedAt: now,
      },
    });
  }

  async getUserById(userId: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  async createEmailOtp(input: Omit<EmailOtpRecord, "id" | "attempts" | "consumedAt">): Promise<EmailOtpRecord> {
    return this.prisma.emailOtp.create({
      data: { ...input, id: randomUUID(), attempts: 0, consumedAt: null },
    });
  }

  async findLatestUsableOtp(email: string, state: string, now: Date): Promise<EmailOtpRecord | null> {
    return this.prisma.emailOtp.findFirst({
      where: {
        email,
        state,
        consumedAt: null,
        attempts: { lt: 5 },
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async incrementOtpAttempts(otpId: string): Promise<EmailOtpRecord> {
    return this.prisma.emailOtp.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
    });
  }

  async consumeOtp(otpId: string, now: Date): Promise<void> {
    await this.prisma.emailOtp.update({
      where: { id: otpId },
      data: { consumedAt: now },
    });
  }

  async createDesktopLoginTicket(
    input: Omit<DesktopLoginTicketRecord, "id" | "consumedAt">,
  ): Promise<DesktopLoginTicketRecord> {
    return this.prisma.desktopLoginTicket.create({
      data: { ...input, id: randomUUID(), consumedAt: null },
    });
  }

  async consumeDesktopLoginTicket(
    ticketHash: string,
    state: string,
    now: Date,
  ): Promise<DesktopLoginTicketRecord | null> {
    const ticket = await this.prisma.desktopLoginTicket.findFirst({
      where: {
        ticketHash,
        state,
        consumedAt: null,
        expiresAt: { gt: now },
      },
    });
    if (!ticket) {
      return null;
    }
    return this.prisma.desktopLoginTicket.update({
      where: { id: ticket.id },
      data: { consumedAt: now },
    });
  }

  async createSession(input: Omit<SessionRecord, "id" | "revokedAt">): Promise<SessionRecord> {
    return this.prisma.session.create({
      data: { ...input, id: randomUUID(), revokedAt: null },
    });
  }

  async findSessionByTokenHash(tokenHash: string, now: Date): Promise<SessionRecord | null> {
    return this.prisma.session.findFirst({
      where: {
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
  }

  async revokeSession(tokenHash: string, now: Date): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash },
      data: { revokedAt: now },
    });
  }

  async createOrder(input: Omit<OrderRecord, "id" | "paidAt" | "transactionId">): Promise<OrderRecord> {
    const order = await this.prisma.order.create({
      data: { ...input, id: randomUUID(), paidAt: null, transactionId: null },
    });
    return order as OrderRecord;
  }

  async findOrderByOutTradeNo(outTradeNo: string): Promise<OrderRecord | null> {
    const order = await this.prisma.order.findUnique({ where: { outTradeNo } });
    return order as OrderRecord | null;
  }

  async markOrderPaid(outTradeNo: string, transactionId: string, paidAt: Date): Promise<OrderRecord> {
    const order = await this.prisma.order.update({
      where: { outTradeNo },
      data: { status: "paid", transactionId, paidAt },
    });
    return order as OrderRecord;
  }

  async getEntitlement(userId: string): Promise<EntitlementRecord | null> {
    const entitlement = await this.prisma.entitlement.findUnique({ where: { userId } });
    return entitlement as EntitlementRecord | null;
  }

  async upsertEntitlement(userId: string, expiresAt: Date, now: Date): Promise<EntitlementRecord> {
    const entitlement = await this.prisma.entitlement.upsert({
      where: { userId },
      update: {
        status: expiresAt > now ? "active" : "inactive",
        expiresAt,
        updatedAt: now,
      },
      create: {
        id: randomUUID(),
        userId,
        status: expiresAt > now ? "active" : "inactive",
        expiresAt,
        updatedAt: now,
      },
    });
    return entitlement as EntitlementRecord;
  }

  async createWebhookEvent(
    input: Omit<WebhookEventRecord, "id" | "createdAt"> & { createdAt: Date },
  ): Promise<boolean> {
    try {
      await this.prisma.webhookEvent.create({
        data: { ...input, id: randomUUID() },
      });
      return true;
    } catch (error) {
      if (String(error).includes("Unique constraint")) {
        return false;
      }
      throw error;
    }
  }
}
