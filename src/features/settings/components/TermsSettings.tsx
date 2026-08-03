import { FileText } from 'lucide-react'
import ComingSoonPanel from './ComingSoonPanel'

export default function TermsSettings() {
  return (
    <ComingSoonPanel
      icon={FileText}
      title="Terms of Service"
      description="Our terms of service are being finalized and will be published here soon."
    />
  )
}
