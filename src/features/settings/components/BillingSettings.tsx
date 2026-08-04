import { Check, Sparkles } from 'lucide-react'

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    current: true,
    features: [
      'Unlimited direct messages & groups',
      'End-to-end encrypted text',
      'Tasks, Notes, Reminders, Events',
      'Albums & Budgets',
    ],
  },
  {
    name: 'Plus',
    price: '$4',
    period: '/month',
    current: false,
    features: [
      'Everything in Free',
      'Larger media uploads',
      'Custom stickers',
      'Priority support',
    ],
  },
]

export default function BillingSettings() {
  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2.5 mb-1">
        <span className="w-8 h-8 flex items-center justify-center rounded-full bg-tint flex-shrink-0">
          <Sparkles size={15} className="text-text-subtle" />
        </span>
        <p className="text-sm font-semibold text-text">Plan & billing</p>
      </div>
      <p className="text-sm text-text-subtle mb-5">
        yaply is free while we're building out the core experience. Paid plans are a preview of what's coming — nothing here is billed yet.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl border p-5 ${plan.current ? 'border-[#5b8def]/50 bg-primary-tint' : 'border-border bg-card'}`}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-text">{plan.name}</p>
              {plan.current && (
                <span className="text-[10px] font-medium uppercase tracking-wide text-primary-text bg-primary-tint-strong px-2 py-0.5 rounded-full">
                  Current
                </span>
              )}
            </div>
            <p className="text-2xl font-semibold text-text mb-3">
              {plan.price}
              <span className="text-sm font-normal text-text-subtle">{plan.period}</span>
            </p>
            <ul className="space-y-1.5 mb-4">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-1.5 text-xs text-text-muted">
                  <Check size={13} className="text-accent-mint flex-shrink-0 mt-0.5" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              disabled
              className={`w-full py-2 rounded-xl text-sm font-medium transition-colors ${
                plan.current
                  ? 'bg-tint text-text-subtle cursor-default'
                  : 'bg-primary text-white opacity-50 cursor-not-allowed'
              }`}
            >
              {plan.current ? 'Current plan' : 'Coming soon'}
            </button>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-sm font-semibold text-text mb-1">Payment method</p>
        <p className="text-xs text-text-subtle">No payment method on file — you're not being charged.</p>
      </div>
    </div>
  )
}
