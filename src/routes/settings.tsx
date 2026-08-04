import { createFileRoute, redirect, useNavigate, Link } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { ArrowLeft, User as UserIcon, CreditCard, Shield, FileText, HelpCircle, Bug } from 'lucide-react'
import { getSession, getUser, onAuthStateChange } from '@/lib/auth'
import AccountSettings from '@/features/settings/components/AccountSettings'
import BillingSettings from '@/features/settings/components/BillingSettings'
import PrivacyPolicySettings from '@/features/settings/components/PrivacyPolicySettings'
import TermsSettings from '@/features/settings/components/TermsSettings'
import HelpSettings from '@/features/settings/components/HelpSettings'
import ReportProblemSettings from '@/features/settings/components/ReportProblemSettings'
import LoadingScreen from '@/components/LoadingScreen'
import type { User } from '@supabase/supabase-js'

export const Route = createFileRoute('/settings')({
  beforeLoad: async () => {
    if (typeof document === 'undefined') return // SSR — no localStorage, client handles it
    const session = await getSession()
    if (!session) throw redirect({ to: '/auth' })
  },
  component: SettingsPage,
})

type Tab = 'account' | 'billing' | 'privacy' | 'terms' | 'help' | 'report'

const TABS: Array<{ id: Tab; label: string; Icon: React.ElementType }> = [
  { id: 'account', label: 'Account', Icon: UserIcon },
  { id: 'billing', label: 'Billing', Icon: CreditCard },
  { id: 'privacy', label: 'Privacy Policy', Icon: Shield },
  { id: 'terms', label: 'Terms of Service', Icon: FileText },
  { id: 'help', label: 'Help', Icon: HelpCircle },
  { id: 'report', label: 'Report a Problem', Icon: Bug },
]

function SettingsPage() {
  const navigate = useNavigate()
  const [user, setUser] = useState<User | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('account')

  useEffect(() => {
    void getUser().then(setUser)

    const { data: listener } = onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (!session) void navigate({ to: '/auth' })
    })

    return () => listener.subscription.unsubscribe()
  }, [navigate])

  if (!user) return <LoadingScreen />

  return (
    <div className="h-[100dvh] flex flex-col bg-background overflow-hidden">
      <div
        className="flex items-center gap-3 px-4 py-3 border-b border-border bg-surface flex-shrink-0"
        style={{ paddingTop: `max(0.75rem, var(--safe-top))` }}
      >
        <Link
          to="/chat"
          className="w-9 h-9 flex items-center justify-center rounded-full text-text-subtle hover:text-text hover:bg-tint transition-colors"
        >
          <ArrowLeft size={18} />
        </Link>
        <h1 className="text-base font-semibold font-display text-text">Settings</h1>
      </div>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Tab nav */}
        <nav className="md:w-56 flex-shrink-0 border-b md:border-b-0 md:border-r border-border bg-surface overflow-x-auto md:overflow-y-auto">
          <div className="flex md:flex-col p-2 gap-0.5">
            {TABS.map(({ id, label, Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-left whitespace-nowrap transition-colors flex-shrink-0 ${
                  activeTab === id
                    ? 'bg-primary-tint text-primary-text'
                    : 'text-text-muted hover:bg-tint hover:text-text'
                }`}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </nav>

        {/* Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'account' && <AccountSettings userId={user.id} userEmail={user.email ?? ''} />}
          {activeTab === 'billing' && <BillingSettings />}
          {activeTab === 'privacy' && <PrivacyPolicySettings />}
          {activeTab === 'terms' && <TermsSettings />}
          {activeTab === 'help' && <HelpSettings />}
          {activeTab === 'report' && <ReportProblemSettings />}
        </div>
      </div>
    </div>
  )
}
