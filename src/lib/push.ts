/**
 * 服务端 Web Push：使用 VAPID 密钥发送
 */
import webPush from "web-push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

// 仅当 VAPID 配置合法时才开启推送，避免构建阶段因配置错误直接报错
let pushConfigured = false;

if (publicKey && privateKey) {
  try {
    webPush.setVapidDetails("mailto:support@example.com", publicKey, privateKey);
    pushConfigured = true;
  } catch (e) {
    console.error("[push] invalid VAPID keys:", (e as Error).message);
    pushConfigured = false;
  }
}

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function isPushConfigured(): boolean {
  return pushConfigured;
}

export async function sendPushNotification(
  sub: PushSubscriptionRow,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  if (!pushConfigured || !privateKey || !publicKey) return false;
  const subscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    await webPush.sendNotification(
      subscription,
      JSON.stringify(payload),
      { TTL: 86400 }
    );
    return true;
  } catch (e) {
    console.error("[push] send failed", (e as Error).message);
    return false;
  }
}
