"use client";

/**
 * 隐私政策（PRD 四-A 合规与声明）
 * 覆盖：数据收集、AI 调用、推送、导出与删除
 */
import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">隐私政策</h1>
        <p className="text-sm text-neutral-400 mb-6">更新日期：2026-02-28</p>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">一、我们收集的数据</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            为提供智能日程与 AI 服务，我们会收集并存储：账号信息（邮箱、昵称、头像）、你创建的项目与任务内容、长期目标、偏好设置。
            我们不会将任务全文、语音内容写入日志或用于训练第三方模型；埋点仅记录脱敏后的用户标识与事件类型（如「解析成功」「冲突建议」），用于产品改进与留存统计。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">二、AI 调用与第三方</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            日程解析、冲突建议、对话回复等能力依赖第三方 AI 服务（如 DeepSeek）。你输入的文字会经我们服务器转发至该服务以生成结果；我们不会将你的数据用于训练对方模型。具体供应商与数据处理方式以各服务商政策为准。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">三、推送通知</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            若你授权浏览器或设备的推送权限，我们会向你发送日程提醒、进度汇报、关怀类通知。推送内容基于你的任务与目标生成，仅在我们的服务内使用，不会提供给第三方用于营销。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">四、导出与删除</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            你可在应用内查看、编辑和删除自己的项目和任务。如需导出全部数据或注销账号并删除个人数据，请通过设置页或联系我们的支持渠道提出申请，我们将在合理期限内处理。
          </p>
        </section>

        <section className="space-y-4 mb-8">
          <h2 className="text-lg font-medium">五、安全与存储</h2>
          <p className="text-neutral-300 text-sm leading-relaxed">
            我们采用行业通用措施保护数据安全；数据库与 API Key 等敏感配置不会写入日志。HTTP 安全头（如 X-Frame-Options、X-Content-Type-Options）已启用以降低劫持与嗅探风险。
          </p>
        </section>

        <p className="text-neutral-500 text-sm">
          如有疑问，请参阅 <Link href="/terms" className="underline">用户协议</Link> 或联系产品方。
        </p>
        <p className="mt-6">
          <Link href="/" className="text-amber-400 hover:underline">返回首页</Link>
        </p>
      </div>
    </div>
  );
}
