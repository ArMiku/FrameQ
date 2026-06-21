import { describe, expect, test } from "vitest";
import { createOtpSender } from "../src/email.js";

describe("OTP email sender", () => {
  test("requires complete SMTP configuration when SMTP is enabled", () => {
    expect(() =>
      createOtpSender(
        {
          SMTP_HOST: "smtp.example.com",
          SMTP_PORT: "587",
          SMTP_USER: "mailer@example.com",
          SMTP_PASS: "",
          SMTP_FROM: "FrameQ <mailer@example.com>",
        },
        () => {
          throw new Error("should not create transport");
        },
      ),
    ).toThrow("SMTP configuration is incomplete.");
  });

  test("sends a formatted login code email through the configured SMTP transport", async () => {
    const sentMessages: unknown[] = [];
    const transportOptions: unknown[] = [];
    const sender = createOtpSender(
      {
        SMTP_HOST: "smtp.example.com",
        SMTP_PORT: "465",
        SMTP_USER: "mailer@example.com",
        SMTP_PASS: "app-password",
        SMTP_FROM: "FrameQ <mailer@example.com>",
      },
      (options) => {
        transportOptions.push(options);
        return {
          sendMail: async (message: unknown) => {
            sentMessages.push(message);
          },
        };
      },
    );

    await sender("USER@Example.COM", "123456");

    expect(transportOptions[0]).toMatchObject({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "mailer@example.com", pass: "app-password" },
    });
    expect(sentMessages[0]).toMatchObject({
      from: "FrameQ <mailer@example.com>",
      to: "USER@Example.COM",
      subject: "FrameQ login code",
    });
    expect(JSON.stringify(sentMessages[0])).toContain("123456");
    expect(JSON.stringify(sentMessages[0])).toContain("10 minutes");
  });
});
