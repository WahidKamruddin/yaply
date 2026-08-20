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
          username_set: boolean
          created_at: string
        }
        Insert: {
          id: string
          username: string
          display_name?: string | null
          avatar_url?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          username_set?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          username?: string
          display_name?: string | null
          avatar_url?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          username_set?: boolean
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
          role: string
          is_admin: boolean
          is_muted: boolean
          muted_until: string | null
          last_read_at: string | null
          // 'accepted' | 'pending' | 'declined' — message-request state for this
          // member. 'pending' means they can read but not reply until they accept.
          request_state: string
          joined_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          user_id: string
          role?: string
          is_admin?: boolean
          is_muted?: boolean
          muted_until?: string | null
          last_read_at?: string | null
          request_state?: string
          joined_at?: string
        }
        Update: {
          role?: string
          is_admin?: boolean
          is_muted?: boolean
          muted_until?: string | null
          last_read_at?: string | null
          request_state?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          id: string
          requester_id: string
          recipient_id: string
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          requester_id: string
          recipient_id: string
          status?: string
        }
        Update: {
          status?: string
        }
        Relationships: []
      }
      user_blocks: {
        Row: {
          blocker_id: string
          blocked_id: string
          created_at: string
        }
        Insert: {
          blocker_id: string
          blocked_id: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          sender_id: string | null
          content: string
          iv: string | null
          enc_v: number | null
          type: string
          media_url: string | null
          media_mime: string | null
          reply_to_id: string | null
          thread_id: string | null
          edited_at: string | null
          deleted_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          sender_id: string
          content: string
          iv?: string | null
          enc_v?: number | null
          type?: string
          media_url?: string | null
          media_mime?: string | null
          reply_to_id?: string | null
          thread_id?: string | null
          edited_at?: string | null
          deleted_at?: string | null
          created_at?: string
        }
        Update: {
          deleted_at?: string | null
          edited_at?: string | null
          content?: string
        }
        Relationships: []
      }
      message_envelopes: {
        Row: {
          id: string
          message_id: string
          recipient_user_id: string
          recipient_fp: string
          eph_pub: string
          key_iv: string
          wrapped_key: string
          created_at: string
        }
        Insert: {
          id?: string
          message_id: string
          recipient_user_id: string
          recipient_fp: string
          eph_pub: string
          key_iv: string
          wrapped_key: string
          created_at?: string
        }
        Update: Record<string, never>
        Relationships: []
      }
      devices: {
        Row: {
          id: string
          user_id: string
          device_id: number
          identity_key: string | null
          key_fingerprint: string | null
          signed_prekey: Json | null
          device_name: string | null
          platform: string | null
          session_id: string | null
          push_subscription: Json | null
          last_active_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          device_id?: number
          identity_key?: string | null
          key_fingerprint?: string | null
          signed_prekey?: Json | null
          device_name?: string | null
          platform?: string | null
          session_id?: string | null
          push_subscription?: Json | null
          last_active_at?: string | null
          created_at?: string
        }
        Update: {
          identity_key?: string | null
          key_fingerprint?: string | null
          device_name?: string | null
          platform?: string | null
          session_id?: string | null
          last_active_at?: string | null
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
      revoke_device: {
        Args: { p_device_id: number }
        Returns: undefined
      }
      find_direct_conversation: {
        Args: { user_a: string; user_b: string }
        Returns: string | null
      }
      find_or_create_direct_conversation: {
        Args: { target_user_id: string }
        Returns: string
      }
      create_group_conversation: {
        Args: { p_name: string; p_member_ids: string[] }
        Returns: string
      }
      send_message_with_envelopes: {
        Args: {
          p_conversation_id: string
          p_content: string
          p_iv: string
          p_envelopes: Json
          p_type?: string
          p_reply_to_id?: string | null
          p_thread_id?: string | null
          p_media_url?: string | null
          p_media_mime?: string | null
        }
        Returns: Database['public']['Tables']['messages']['Row']
      }
      add_group_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      send_friend_request: {
        Args: { p_recipient_id: string }
        Returns: Database['public']['Tables']['friendships']['Row']
      }
      accept_friend_request: {
        Args: { p_request_id: string }
        Returns: Database['public']['Tables']['friendships']['Row']
      }
      block_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      get_relationships: {
        Args: { p_user_ids: string[] }
        Returns: Array<{
          user_id: string
          status: string
          request_id: string | null
          mutual_friends: number
        }>
      }
      search_users: {
        Args: { p_query: string }
        Returns: Array<{
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          is_online: boolean
          last_seen_at: string | null
        }>
      }
      get_friend_suggestions: {
        Args: { p_limit?: number }
        Returns: Array<{
          id: string
          username: string
          display_name: string | null
          avatar_url: string | null
          is_online: boolean
          mutual_friends: number
          shared_groups: number
        }>
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
