import { createPrismaClient } from "./database.js";
import { createOtpSender } from "./email.js";
import { PrismaStore } from "./prismaStore.js";
import { buildServer } from "./server.js";
import { createWechatNativePayment, createWechatNotificationParser } from "./wechat.js";

const port = Number(process.env.FRAMEQ_SERVER_PORT ?? 8787);
const host = process.env.FRAMEQ_SERVER_HOST ?? "127.0.0.1";

const prisma = await createPrismaClient();
const app = buildServer({
  store: new PrismaStore(prisma),
  sendOtp: createOtpSender(),
  createNativePayment: createWechatNativePayment(),
  parseWechatNotification: createWechatNotificationParser(),
});

await app.listen({ host, port });
console.log(`[frameq-server] listening on http://${host}:${port}`);
