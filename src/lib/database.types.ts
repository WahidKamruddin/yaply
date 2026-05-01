export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          is_online: boolean
          last_seen_at: string | null
          created_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          is_online?: boolean
          last_seen_at?: string | null
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          name: string | null
          is_group: boolean
          created_by: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name?: string | null
          is_group?: boolean
          created_by?: string | null
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string | null
          avatar_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      conversation_members: {
        Row: {
          id: string
          conversation_id: string
          user_id: string
          is_admin: boolean
          is_muted: boolean
          muted_until: string | null
          last_read_at: string | null
          joined_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          is_admin?: boolean
          is_muted?: boolean
          muted_until?: string | null
          last_read_at?: string | null
          joined_at?: string
        }
        Update: {
          is_admin?: boolean
          is_muted?: boolean
          muted_until?: string | null
          last_read_at?: string | null
        }
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string | null
          encrypted_content: string
          message_type: number
          sender_device_id: number
          content_hint: string | null
          encrypted_attachment_ref: string | null
          parent_message_id: string | null
          thread_name: string | null
          deleted_at: string | null
          server_timestamp: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          encrypted_content: string
          message_type?: number
          sender_device_id?: number
          content_hint?: string | null
          encrypted_attachment_ref?: string | null
          parent_message_id?: string | null
          thread_name?: string | null
          deleted_at?: string | null
          server_timestamp?: string
          created_at?: string
        }
        Update: {
          deleted_at?: string | null
          encrypted_content?: string
        }
        Relationships: []
      }
      devices: {
        Row: {
          id: string
          user_id: string
          device_id: number
          identity_key: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_id?: number
          identity_key?: Json | null
          created_at?: string
        }
        Update: {
          identity_key?: Json | null
        }
        Relationships: []
      }
      stickers: {
        Row: {
          id: string
          user_id: string
          storage_path: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          storage_path: string
          name: string
          created_at?: string
        }
        Update: {
          name?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          id: string
          conversation_id: string
          created_by: string
          target_user_id: string | null
          target_type: 'me' | 'all' | 'user'
          message: string
          remind_at: string
          sent: boolean
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          created_by: string
          target_user_id?: string | null
          target_type: 'me' | 'all' | 'user'
          message: string
          remind_at: string
          sent?: boolean
          created_at?: string
        }
        Update: {
          sent?: boolean
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          conversation_id: string
          created_by: string
          assignee_id: string | null
          title: string
          description: string | null
          status: 'todo' | 'in_progress' | 'done'
          due_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          created_by: string
          assignee_id?: string | null
          title: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          due_at?: string | null
          created_at?: string
        }
        Update: {
          assignee_id?: string | null
          title?: string
          description?: string | null
          status?: 'todo' | 'in_progress' | 'done'
          due_at?: string | null
        }
        Relationships: []
      }
      notes: {
        Row: {
          id: string
          conversation_id: string
          created_by: string
          title: string
          content: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          created_by: string
          title: string
          content?: string | null
          created_at?: string
        }
        Update: {
          title?: string
          content?: string | null
        }
        Relationships: []
      }
      albums: {
        Row: {
          id: string
          conversation_id: string
          created_by: string
          title: string
          media_refs: Json
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          created_by: string
          title: string
          media_refs?: Json
          created_at?: string
        }
        Update: {
          title?: string
          media_refs?: Json
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          conversation_id: string
          created_by: string
          title: string
          amount: number | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          created_by: string
          title: string
          amount?: number | null
          created_at?: string
        }
        Update: {
          title?: string
          amount?: number | null
        }
        Relationships: []
      }
      budget_expenses: {
        Row: {
          id: string
          budget_id: string
          paid_by: string
          amount: number
          split_with: Json
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          budget_id: string
          paid_by: string
          amount: number
          split_with?: Json
          description?: string | null
          created_at?: string
        }
        Update: {
          amount?: number
          split_with?: Json
          description?: string | null
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      find_direct_conversation: {
        Args: { user_a: string; user_b: string }
        Returns: string | null
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
