import { CreditCard } from 'lucide-react'
import ComingSoonPanel from './ComingSoonPanel'

export default function BillingSettings() {
  return (
    <ComingSoonPanel
      icon={CreditCard}
      title="Billing"
      description="yaply is free for now. Billing and subscription options will appear here in the future."
    />
  )
}
