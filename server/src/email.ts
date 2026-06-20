import nodemailer from "nodemailer";

export function createOtpSender() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !user || !pass || !from) {
    return async (email: string, code: string) => {
      console.log(`[frameq-server] OTP for ${email}: ${code}`);
    };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return async (email: string, code: string) => {
    await transporter.sendMail({
      from,
      to: email,
      subject: "FrameQ login code",
      text: `Your FrameQ login code is ${code}. It expires in 10 minutes.`,
    });
  };
}

