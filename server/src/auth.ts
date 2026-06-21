import { constantTimeEqual, otpCode, secureToken, sha256 } from "./security.js";
import type { Store } from "./store.js";

const OTP_TTL_MS = 10 * 60 * 1000;
const TICKET_TTL_MS = 5 * 60 * 1000;
const SESSION_TTL_MS = 90 * 24 * 60 * 60 * 1000;
const RESEND_WINDOW_MS = 60 * 1000;

export type AuthServiceOptions = {
  store: Store;
  now?: () => Date;
  sendOtp: (email: string, code: string) => Promise<void>;
};

export class AuthService {
  private readonly store: Store;
  private readonly now: () => Date;
  private readonly sendOtp: (email: string, code: string) => Promise<void>;
  private readonly recentStarts = new Map<string, Date>();

  constructor(options: AuthServiceOptions) {
    this.store = options.store;
    this.now = options.now ?? (() => new Date());
    this.sendOtp = options.sendOtp;
  }

  async startEmailLogin(input: { email: string; ip: string; state: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    validateState(input.state);
    const now = this.now();
    const rateKey = `${email}:${input.ip}`;
    const lastStart = this.recentStarts.get(rateKey);
    if (lastStart && now.getTime() - lastStart.getTime() < RESEND_WINDOW_MS) {
      throw new Error("Please wait before requesting another verification code.");
    }

    const code = otpCode();
    const otp = await this.store.createEmailOtp({
      email,
      state: input.state,
      codeHash: sha256(code),
      ip: input.ip,
      expiresAt: new Date(now.getTime() + OTP_TTL_MS),
      createdAt: now,
    });
    try {
      await this.sendOtp(email, code);
      this.recentStarts.set(rateKey, now);
    } catch {
      await this.store.consumeOtp(otp.id, now).catch(() => undefined);
      throw new Error("Could not send verification code. Please try again later.");
    }
  }

  async verifyEmailCode(input: {
    email: string;
    code: string;
    state: string;
  }): Promise<{ ticket: string; redirectUrl: string }> {
    const email = normalizeEmail(input.email);
    validateState(input.state);
    if (!/^\d{6}$/.test(input.code)) {
      throw new Error("Verification code is invalid or expired.");
    }

    const now = this.now();
    const otp = await this.store.findLatestUsableOtp(email, input.state, now);
    if (!otp) {
      throw new Error("Verification code is invalid or expired.");
    }
    await this.store.incrementOtpAttempts(otp.id);
    if (!constantTimeEqual(otp.codeHash, sha256(input.code))) {
      throw new Error("Verification code is invalid or expired.");
    }

    await this.store.consumeOtp(otp.id, now);
    const user = await this.store.upsertUserByEmail(email, now);
    const ticket = secureToken("flt_");
    await this.store.createDesktopLoginTicket({
      ticketHash: sha256(ticket),
      state: input.state,
      userId: user.id,
      expiresAt: new Date(now.getTime() + TICKET_TTL_MS),
      createdAt: now,
    });

    return {
      ticket,
      redirectUrl: `frameq://auth/callback?ticket=${encodeURIComponent(ticket)}&state=${encodeURIComponent(input.state)}`,
    };
  }

  async exchangeDesktopTicket(input: {
    ticket: string;
    state: string;
  }): Promise<{ sessionToken: string; email: string; expiresAt: Date }> {
    validateState(input.state);
    if (!input.ticket.startsWith("flt_")) {
      throw new Error("Login ticket is invalid or expired.");
    }
    const now = this.now();
    const ticket = await this.store.consumeDesktopLoginTicket(sha256(input.ticket), input.state, now);
    if (!ticket) {
      throw new Error("Login ticket is invalid or expired.");
    }

    const user = await this.store.getUserById(ticket.userId);
    if (!user) {
      throw new Error("Login ticket is invalid or expired.");
    }
    const sessionToken = secureToken("fq_");
    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    await this.store.createSession({
      userId: user.id,
      tokenHash: sha256(sessionToken),
      createdAt: now,
      expiresAt,
    });

    return { sessionToken, email: user.email, expiresAt };
  }
}

export function normalizeEmail(email: string): string {
  const value = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value) || value.length > 254) {
    throw new Error("A valid email address is required.");
  }
  return value;
}

export function validateState(state: string): void {
  if (!/^[a-zA-Z0-9._~-]{8,160}$/.test(state)) {
    throw new Error("Login state is invalid.");
  }
}
