import nodemailer from "nodemailer";

type OtpSenderEnvKey = "SMTP_HOST" | "SMTP_PORT" | "SMTP_USER" | "SMTP_PASS" | "SMTP_FROM";

export type OtpSenderEnv = Partial<Record<OtpSenderEnvKey, string | undefined>>;

type SmtpTransportOptions = {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
};

type LoginCodeMessage = {
  from: string;
  to: string;
  subject: string;
  text: string;
  html: string;
};

type MailTransport = {
  sendMail(message: LoginCodeMessage): Promise<unknown>;
};

type MailTransportFactory = (options: SmtpTransportOptions) => MailTransport;

export function createOtpSender(
  env: OtpSenderEnv = process.env,
  createTransport: MailTransportFactory = (options) => nodemailer.createTransport(options),
) {
  const host = cleanEnvValue(env.SMTP_HOST);
  const user = cleanEnvValue(env.SMTP_USER);
  const pass = cleanEnvValue(env.SMTP_PASS);
  const configuredFrom = cleanEnvValue(env.SMTP_FROM);
  const from = configuredFrom || user;
  const hasAnySmtpSetting = [host, user, pass, configuredFrom].some(Boolean);

  if (!host || !user || !pass || !from) {
    if (hasAnySmtpSetting) {
      throw new Error("SMTP configuration is incomplete.");
    }
    return async (email: string, code: string) => {
      console.log(`[frameq-server] OTP for ${email}: ${code}`);
    };
  }

  const port = Number(cleanEnvValue(env.SMTP_PORT) || 587);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port.");
  }

  const transporter = createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return async (email: string, code: string) => {
    await transporter.sendMail(buildLoginCodeMessage({ from, to: email, code }));
  };
}

export function buildLoginCodeMessage(input: {
  from: string;
  to: string;
  code: string;
}): LoginCodeMessage {
  return {
    from: input.from,
    to: input.to,
    subject: "FrameQ login code",
    text: [
      `Your FrameQ login code is: ${input.code}`,
      "",
      "This code expires in 10 minutes. If you did not request it, you can ignore this email.",
    ].join("\n"),
    html: [
      "<!doctype html>",
      '<div style="font-family:Arial,sans-serif;line-height:1.6;color:#171717">',
      "<h2>FrameQ login code</h2>",
      "<p>Your verification code is:</p>",
      `<p style="font-size:28px;font-weight:700;letter-spacing:4px">${input.code}</p>`,
      "<p>This code expires in 10 minutes. If you did not request it, you can ignore this email.</p>",
      "</div>",
    ].join(""),
  };
}

function cleanEnvValue(value: string | undefined): string {
  return value?.trim() ?? "";
}
