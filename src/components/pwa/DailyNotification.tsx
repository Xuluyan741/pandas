"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useStore } from "@/store/useStore";
import { getTodayPriorities } from "@/lib/daily-digest";
import { subscribePush } from "@/lib/push-client";

const STORAGE_KEY = "pwa-daily-digest-date";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function DailyNotification() {
  const { status } = useSession();
  const { tasks } = useStore();
  const didRun = useRef(false);
  const didRegisterPush = useRef(false);

  // 每日一次：打开时弹本地通知
  useEffect(() => {
    if (status !== "authenticated" || tasks.length === 0) return;
    if (didRun.current) return;
    didRun.current = true;

    const key = todayKey();
    try {
      if (localStorage.getItem(STORAGE_KEY) === key) return;
    } catch {
      return;
    }

    const show = () => {
      const { title, body } = getTodayPriorities(tasks);
      try {
        new Notification(title, { body, icon: "/icons/icon-192.png", tag: "daily" });
        localStorage.setItem(STORAGE_KEY, key);
      } catch {
        // ignore
      }
    };

    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      show();
      subscribePush();
      return;
    }
    if (Notification.permission === "default") {
      Notification.requestPermission().then((p) => {
        if (p === "granted") {
          show();
          subscribePush();
        }
      });
    }
  }, [status, tasks]);

  // 权限已授予时：向服务端注册推送订阅，以便定时任务能发到手机
  useEffect(() => {
    if (status !== "authenticated") return;
    if (didRegisterPush.current) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    didRegisterPush.current = true;
    subscribePush();
  }, [status]);

  return null;
}
