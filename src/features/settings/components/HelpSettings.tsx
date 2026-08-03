import { HelpCircle } from 'lucide-react'
import ComingSoonPanel from './ComingSoonPanel'

export default function HelpSettings() {
  return (
    <ComingSoonPanel
      icon={HelpCircle}
      title="Help"
      description="A help center is on the way. In the meantime, use Report a Problem to reach out."
    />
  )
}
