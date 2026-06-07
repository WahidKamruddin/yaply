import { useState, useRef, useEffect } from 'react'
import { useAtom } from 'jotai'
import { X, Bell, Calendar, Image, CheckSquare, FileText, DollarSign, MoreHorizontal } from 'lucide-react'
import ReminderList from './panel/ReminderList'
import EventList from './panel/EventList'
import AlbumList from './panel/AlbumList'
import TaskList from './panel/TaskList'
import NoteList from './panel/NoteList'
import BudgetList from './panel/BudgetList'
import type { MemberSummary } from '../types'
import { conversationPanelTabAtom } from '../store/chat.atoms'

type Tab = 'reminders' | 'events' | 'albums' | 'tasks' | 'notes' | 'budgets'

const PRIMARY_TABS: Array<{ id: Tab; label: string; Icon: React.ElementType }> = [
  { id: 'reminders', label: 'Reminders', Icon: Bell },
  { id: 'events',    label: 'Events',    Icon: Calendar },
  { id: 'albums',    label: 'Albums',    Icon: Image },
]

const SECONDARY_TABS: Array<{ id: Tab; label: string; Icon: React.ElementType }> = [
  { id: 'tasks',   label: 'Tasks',   Icon: CheckSquare },
  { id: 'notes',   label: 'Notes',   Icon: FileText },
  { id: 'budgets', label: 'Budgets', Icon: DollarSign },
]

interface Props {
  conversationId: string
  currentUserId: string
  members: MemberSummary[]
  onClose: () => void
}

export default function ConversationPanel({ conversationId, currentUserId, members, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('reminders')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [requestedTab, setRequestedTab] = useAtom(conversationPanelTabAtom)

  // Consume deep-link tab requests from system message clicks
  useEffect(() => {
    if (requestedTab) {
      const allTabs = [...PRIMARY_TABS, ...SECONDARY_TABS]
      const match = allTabs.find((t) => t.id === requestedTab)
      if (match) setActiveTab(match.id)
      setRequestedTab(null)
    }
  }, [requestedTab, setRequestedTab])

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  const isSecondaryActive = SECONDARY_TABS.some((t) => t.id === activeTab)

  return (
    <div className="flex flex-col w-72 flex-shrink-0 h-full bg-white border-l border-[#dce7f8]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#dce7f8]">
        <span className="text-sm font-semibold text-[#1a2744]">Details</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full text-[#9ab0cc] hover:text-[#1a2744] hover:bg-[#edf1fa] transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex items-end border-b border-[#dce7f8]">
        {PRIMARY_TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex-1 flex flex-col items-center gap-0.5 px-1 pt-2 pb-1.5 text-xs font-medium transition-colors min-w-0 border-b-2 ${
              activeTab === id
                ? 'border-[#5b8def] text-[#5b8def]'
                : 'border-transparent text-[#9ab0cc] hover:text-[#6b84ab]'
            }`}
          >
            <Icon size={14} />
            <span className="truncate">{label}</span>
          </button>
        ))}

        {/* Hamburger more button */}
        <div ref={menuRef} className="relative flex-shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex flex-col items-center gap-0.5 px-3 pt-2 pb-1.5 text-xs font-medium transition-colors border-b-2 ${
              isSecondaryActive
                ? 'border-[#5b8def] text-[#5b8def]'
                : 'border-transparent text-[#9ab0cc] hover:text-[#6b84ab]'
            }`}
          >
            <MoreHorizontal size={14} />
            <span>{isSecondaryActive ? SECONDARY_TABS.find((t) => t.id === activeTab)?.label : 'More'}</span>
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-[#dce7f8] rounded-xl shadow-lg shadow-[#dce7f8]/60 overflow-hidden z-20">
              {SECONDARY_TABS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => { setActiveTab(id); setMenuOpen(false) }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-xs transition-colors text-left ${
                    activeTab === id
                      ? 'bg-[#edf3ff] text-[#5b8def] font-medium'
                      : 'text-[#6b84ab] hover:bg-[#f3f7ff]'
                  }`}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'reminders' && <ReminderList conversationId={conversationId} currentUserId={currentUserId} />}
        {activeTab === 'events'    && <EventList    conversationId={conversationId} currentUserId={currentUserId} members={members} />}
        {activeTab === 'albums'    && <AlbumList    conversationId={conversationId} currentUserId={currentUserId} />}
        {activeTab === 'tasks'     && <TaskList     conversationId={conversationId} currentUserId={currentUserId} />}
        {activeTab === 'notes'     && <NoteList     conversationId={conversationId} currentUserId={currentUserId} />}
        {activeTab === 'budgets'   && <BudgetList   conversationId={conversationId} currentUserId={currentUserId} />}
      </div>
    </div>
  )
}
