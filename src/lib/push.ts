/**
 * 服务端 Web Push：使用 VAPID 密钥发送
 */
import webPush from "web-push";

const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;

if (publicKey && privateKey) {
  webPush.setVapidDetails("mailto:support@example.com", publicKey, privateKey);
}

export type PushSubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function isPushConfigured(): boolean {
  return Boolean(publicKey && privateKey);
}

export async function sendPushNotification(
  sub: PushSubscriptionRow,
  payload: { title: string; body: string; url?: string }
): Promise<boolean> {
  if (!privateKey || !publicKey) return false;
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
