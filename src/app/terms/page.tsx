"use client";

/**
 * 用户协议（PRD 四-A 合规与声明）
 */
import Link from "next/link";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">用户协议</h1>
        <p className="text-sm text-neutral-400 mb-6">更新日期：2026-02-28</p>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">一、服务说明</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            「小熊猫」是一款智能日程与任务管理产品，提供自然语言解析、冲突检测、AI 建议、推送提醒、长期目标规划等功能。使用本服务即表示你同意本协议及我们的{" "}
            <Link href="/privacy" className="underline">隐私政策</Link>。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">二、账号与安全</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            你可通过邮箱或第三方（如 Google）注册与登录。请妥善保管账号信息；因你自身原因导致的泄露或未授权使用，我们无法承担责任。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">三、使用规范</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            你应合法、合规使用本服务，不得利用本产品从事违法、侵权或干扰服务正常运行的行为。我们保留在合理范围内限制或终止违规账号的权利。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">四、付费与试用</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            部分高级能力可能需订阅付费版本；具体价格与规则以定价页与支付页为准。若提供试用，试用期或试用次数结束后将按当前套餐计费或恢复免费版限制。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">五、免责与变更</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            AI 生成内容仅供参考，重要决策请自行核实。我们可能因产品迭代更新本协议与隐私政策，重大变更会通过应用或邮件等方式通知。
          </p>
        </section>

        <p className="mt-6">
          <Link href="/" className="text-amber-400 hover:underline">返回首页</Link>
        </p>
      </div>
    </div>
  );
}
