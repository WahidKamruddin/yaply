import { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useSetAtom } from 'jotai'
import {
  Calendar,
  ChevronRight,
  DollarSign,
  Image as ImageIcon,
  Users,
} from 'lucide-react'
import Avatar from '@/components/Avatar'
import Skeleton from '@/components/Skeleton'
import {
  activeConversationIdAtom,
  conversationPanelOpenAtom,
  conversationPanelTabAtom,
} from '@/features/chat/store/chat.atoms'
import { useSharedContext } from '../hooks/useSharedContext'

interface Props {
  currentUserId: string
  userId: string
}

type SectionId = 'groups' | 'events' | 'albums' | 'budgets'

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/**
 * Everything the viewer has in common with the profile's owner. Read-only by
 * design — each row deep-links into the conversation that owns it rather than
 * editing anything in place.
 */
export default function SharedContext({ currentUserId, userId }: Props) {
  const navigate = useNavigate()
  const setActiveId = useSetAtom(activeConversationIdAtom)
  const setPanelOpen = useSetAtom(conversationPanelOpenAtom)
  const setPanelTab = useSetAtom(conversationPanelTabAtom)
  const { groups, content, isLoading } = useSharedContext(currentUserId, userId)
  const [open, setOpen] = useState<SectionId | null>('groups')

  async function openConversation(conversationId: string, tab?: string) {
    setActiveId(conversationId)
    if (tab) {
      setPanelOpen(true)
      setPanelTab(tab)
    }
    await navigate({ to: '/chat' })
  }

  if (isLoading) {
    return (
      <div className="mt-6 space-y-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    )
  }

  const sections: Array<{
    id: SectionId
    label: string
    Icon: React.ElementType
    count: number
    body: React.ReactNode
  }> = [
    {
      id: 'groups',
      label: 'Groups',
      Icon: Users,
      count: groups.length,
      body: groups.map((g) => (
        <button
          key={g.id}
          onClick={() => void openConversation(g.id)}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-tint transition-colors text-left"
        >
          <Avatar src={g.avatarUrl} alt={g.name ?? 'Group'} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{g.name ?? 'Group'}</p>
            <p className="text-[10px] text-text-subtle">
              {g.members.length} member{g.members.length === 1 ? '' : 's'}
            </p>
          </div>
          <ChevronRight size={14} className="text-text-subtle flex-shrink-0" />
        </button>
      )),
    },
    {
      id: 'events',
      label: 'Events',
      Icon: Calendar,
      count: content.events.length,
      body: content.events.map((e) => (
        <button
          key={e.id}
          onClick={() => void openConversation(e.conversation_id, 'events')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-tint transition-colors text-left"
        >
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${
              e.status === 'confirmed' ? 'bg-green-500' : 'bg-[#5b8def]'
            }`}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{e.name}</p>
            <p className="text-[10px] text-text-subtle truncate">
              {[formatDate(e.starts_at) ?? e.status, e.conversation?.name].filter(Boolean).join(' · ')}
            </p>
          </div>
          <ChevronRight size={14} className="text-text-subtle flex-shrink-0" />
        </button>
      )),
    },
    {
      id: 'albums',
      label: 'Albums',
      Icon: ImageIcon,
      count: content.albums.length,
      body: content.albums.map((a) => {
        const cover = a.album_media?.[0]?.media_url
        return (
          <button
            key={a.id}
            onClick={() => void openConversation(a.conversation_id, 'albums')}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-tint transition-colors text-left"
          >
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-tint border border-border flex items-center justify-center flex-shrink-0">
              {cover ? (
                <img src={cover} alt="" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon size={13} className="text-text-subtle" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text truncate">{a.name}</p>
              <p className="text-[10px] text-text-subtle truncate">{a.conversation?.name ?? 'Direct message'}</p>
            </div>
            <ChevronRight size={14} className="text-text-subtle flex-shrink-0" />
          </button>
        )
      }),
    },
    {
      id: 'budgets',
      label: 'Budgets',
      Icon: DollarSign,
      count: content.budgets.length,
      body: content.budgets.map((b) => (
        <button
          key={b.id}
          onClick={() => void openConversation(b.conversation_id, 'budgets')}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-tint transition-colors text-left"
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-text truncate">{b.name}</p>
            <p className="text-[10px] text-text-subtle truncate">{b.conversation?.name ?? 'Direct message'}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-sm font-semibold text-[#5b8def]">${b.total_amount.toFixed(2)}</p>
            <p className="text-[10px] text-text-subtle">{b.currency}</p>
          </div>
        </button>
      )),
    },
  ]

  const total = sections.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-text-subtle px-1 mb-2">
        Shared
      </h2>

      {total === 0 ? (
        <p className="text-xs text-text-subtle px-1 py-3">Nothing shared yet.</p>
      ) : (
        <div className="space-y-1">
          {sections.map(({ id, label, Icon, count, body }) => (
            <div key={id} className="border border-border rounded-xl overflow-hidden">
              <button
                onClick={() => setOpen((cur) => (cur === id ? null : id))}
                disabled={count === 0}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-tint transition-colors disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <Icon size={14} className="text-text-subtle flex-shrink-0" />
                <span className="text-sm font-medium text-text">{label}</span>
                <span className="text-xs text-text-subtle">({count})</span>
                <ChevronRight
                  size={14}
                  className={`ml-auto text-text-subtle transition-transform ${
                    open === id && count > 0 ? 'rotate-90' : ''
                  }`}
                />
              </button>
              {open === id && count > 0 && (
                <div className="border-t border-border p-1">{body}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
