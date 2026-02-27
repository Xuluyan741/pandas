import type { ActionHint } from "@/lib/ai/types";
import type { SkillRiskLevel } from "@/lib/skills/types";

/**
 * Deep Link 生成上下文
 * 当前版本只使用原始自然语言文本，后续可加入解析出的城市/日期等字段
 */
export interface DeepLinkContext {
  rawText: string;
}

export interface DeepLinkResult {
  url: string;
  appName: string;
  title: string;
  description: string;
  riskLevel: SkillRiskLevel;
}

/**
 * 根据动作类型生成预填参数的 Deep Link
 * 注意：仅做跳转与搜索，不自动下单/支付。
 */
export function buildDeepLink(
  action: ActionHint,
  ctx: DeepLinkContext,
): DeepLinkResult {
  const text = ctx.rawText.trim();

  switch (action) {
    case "ride_hailing": {
      const encoded = encodeURIComponent(text || "出发地到目的地");
      return {
        url: `https://ride.amap.com/search?from=panda-assistant&q=${encoded}`,
        appName: "高德打车",
        title: "打开打车页面",
        description: "我会帮你打开高德打车搜索页，你可以在里面选择具体路线和时间。",
        riskLevel: "medium",
      };
    }
    case "food_delivery": {
      const encoded = encodeURIComponent(text || "附近外卖");
      return {
        url: `https://waimai.meituan.com/search?keyword=${encoded}`,
        appName: "美团外卖",
        title: "打开订餐页面",
        description: "我会帮你打开美团外卖搜索页，你可以自己选择商家并下单。",
        riskLevel: "medium",
      };
    }
    case "train_ticket": {
      const encoded = encodeURIComponent(text || "火车票");
      return {
        url: `https://www.12306.cn/index/index.html?from=panda-assistant&q=${encoded}`,
        appName: "12306 购票",
        title: "打开火车票查询",
        description: "我会帮你打开 12306 或相关购票页面，你可以自行选择车次并完成支付。",
        riskLevel: "high",
      };
    }
    case "meeting": {
      const encoded = encodeURIComponent(text || "会议");
      return {
        url: `https://meeting.tencent.com/?from=panda-assistant&q=${encoded}`,
        appName: "腾讯会议",
        title: "打开会议创建页面",
        description: "我会帮你打开腾讯会议主页，你可以创建会议或查看会议号。",
        riskLevel: "low",
      };
    }
    case "shopping": {
      const encoded = encodeURIComponent(text || "商品");
      return {
        url: `https://s.taobao.com/search?q=${encoded}`,
        appName: "淘宝",
        title: "打开购物搜索",
        description: "我会帮你打开淘宝搜索页，你可以浏览和选择商品，是否购买完全由你决定。",
        riskLevel: "high",
      };
    }
    case "none":
    default:
      return {
        url: "",
        appName: "",
        title: "",
        description: "",
        riskLevel: "low",
      };
  }
}

