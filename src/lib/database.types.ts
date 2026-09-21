export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_conversations: {
        Row: {
          context_summary: string | null
          conversation_id: string
          created_at: string | null
          id: string
          model: string | null
          token_count: number | null
          updated_at: string | null
        }
        Insert: {
          context_summary?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          model?: string | null
          token_count?: number | null
          updated_at?: string | null
        }
        Update: {
          context_summary?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          model?: string | null
          token_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      album_media: {
        Row: {
          album_id: string
          created_at: string
          id: string
          media_mime: string
          media_url: string
          message_id: string | null
        }
        Insert: {
          album_id: string
          created_at?: string
          id?: string
          media_mime: string
          media_url: string
          message_id?: string | null
        }
        Update: {
          album_id?: string
          created_at?: string
          id?: string
          media_mime?: string
          media_url?: string
          message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "album_media_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "album_media_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      albums: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          event_id: string | null
          id: string
          locked: boolean
          name: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          event_id?: string | null
          id?: string
          locked?: boolean
          name: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          event_id?: string | null
          id?: string
          locked?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "albums_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "albums_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          currency: string
          event_id: string | null
          id: string
          locked: boolean
          name: string
          splitwise_group_id: string | null
          total_amount: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          currency?: string
          event_id?: string | null
          id?: string
          locked?: boolean
          name: string
          splitwise_group_id?: string | null
          total_amount: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          currency?: string
          event_id?: string | null
          id?: string
          locked?: boolean
          name?: string
          splitwise_group_id?: string | null
          total_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          id: string
          is_muted: boolean | null
          joined_at: string | null
          last_read_at: string | null
          muted_until: string | null
          mute_mentions: boolean
          request_state: string
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          muted_until?: string | null
          mute_mentions?: boolean
          request_state?: string
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          is_muted?: boolean | null
          joined_at?: string | null
          last_read_at?: string | null
          muted_until?: string | null
          mute_mentions?: boolean
          request_state?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string | null
          type: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string | null
          type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          created_at: string | null
          device_id: number
          device_name: string | null
          id: string
          identity_key: string
          key_fingerprint: string | null
          last_active_at: string | null
          platform: string | null
          session_id: string | null
          signed_prekey: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: number
          device_name?: string | null
          id?: string
          identity_key: string
          key_fingerprint?: string | null
          last_active_at?: string | null
          platform?: string | null
          session_id?: string | null
          signed_prekey?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: number
          device_name?: string | null
          id?: string
          identity_key?: string
          key_fingerprint?: string | null
          last_active_at?: string | null
          platform?: string | null
          session_id?: string | null
          signed_prekey?: Json | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_availability: {
        Row: {
          event_id: string
          id: string
          slots: Json
          updated_at: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          slots?: Json
          updated_at?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          slots?: Json
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_availability_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvp: {
        Row: {
          event_id: string
          id: string
          response: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          event_id: string
          id?: string
          response?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          event_id?: string
          id?: string
          response?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvp_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvp_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          conversation_id: string
          created_at: string | null
          created_by: string
          description: string | null
          ends_at: string | null
          id: string
          location: string | null
          locked: boolean
          name: string
          starts_at: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          created_by: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          locked?: boolean
          name: string
          starts_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          location?: string | null
          locked?: boolean
          name?: string
          starts_at?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          budget_id: string
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          description: string
          id: string
          paid_by: string
          split_between: string[]
        }
        Insert: {
          amount: number
          budget_id: string
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description: string
          id?: string
          paid_by: string
          split_between?: string[]
        }
        Update: {
          amount?: number
          budget_id?: string
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          description?: string
          id?: string
          paid_by?: string
          split_between?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "expenses_budget_id_fkey"
            columns: ["budget_id"]
            isOneToOne: false
            referencedRelation: "budgets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      friendships: {
        Row: {
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          recipient_id: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          recipient_id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_envelopes: {
        Row: {
          created_at: string
          eph_pub: string
          id: string
          key_iv: string
          message_id: string
          recipient_fp: string
          recipient_user_id: string
          wrapped_key: string
        }
        Insert: {
          created_at?: string
          eph_pub: string
          id?: string
          key_iv: string
          message_id: string
          recipient_fp: string
          recipient_user_id: string
          wrapped_key: string
        }
        Update: {
          created_at?: string
          eph_pub?: string
          id?: string
          key_iv?: string
          message_id?: string
          recipient_fp?: string
          recipient_user_id?: string
          wrapped_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_envelopes_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_envelopes_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reads: {
        Row: {
          message_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          message_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          message_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reads_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_receipts: {
        Row: {
          device_id: number
          id: string
          message_id: string
          status: string
          timestamp: string | null
          user_id: string
        }
        Insert: {
          device_id: number
          id?: string
          message_id: string
          status: string
          timestamp?: string | null
          user_id: string
        }
        Update: {
          device_id?: number
          id?: string
          message_id?: string
          status?: string
          timestamp?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_receipts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          enc_v: number | null
          id: string
          iv: string | null
          media_mime: string | null
          media_url: string | null
          mentioned_user_ids: string[]
          mentions_everyone: boolean
          reply_to_id: string | null
          sender_id: string | null
          thread_id: string | null
          type: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          enc_v?: number | null
          id?: string
          iv?: string | null
          media_mime?: string | null
          media_url?: string | null
          mentioned_user_ids?: string[]
          mentions_everyone?: boolean
          reply_to_id?: string | null
          sender_id?: string | null
          thread_id?: string | null
          type?: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          enc_v?: number | null
          id?: string
          iv?: string | null
          media_mime?: string | null
          media_url?: string | null
          mentioned_user_ids?: string[]
          mentions_everyone?: boolean
          reply_to_id?: string | null
          sender_id?: string | null
          thread_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          content: string
          conversation_id: string | null
          created_at: string
          event_id: string | null
          id: string
          locked: boolean
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          locked?: boolean
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          locked?: boolean
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pinned_messages: {
        Row: {
          conversation_id: string
          message_id: string
          pinned_at: string
          pinned_by: string | null
        }
        Insert: {
          conversation_id: string
          message_id: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Update: {
          conversation_id?: string
          message_id?: string
          pinned_at?: string
          pinned_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pinned_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pinned_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      polls: {
        Row: {
          conversation_id: string
          created_at: string | null
          created_by: string
          expires_at: string | null
          id: string
          options: Json
          question: string
          votes: Json | null
        }
        Insert: {
          conversation_id: string
          created_at?: string | null
          created_by: string
          expires_at?: string | null
          id?: string
          options: Json
          question: string
          votes?: Json | null
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          created_by?: string
          expires_at?: string | null
          id?: string
          options?: Json
          question?: string
          votes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "polls_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      prekeys: {
        Row: {
          created_at: string | null
          device_id: number
          id: string
          is_consumed: boolean | null
          key_id: number
          public_key: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          device_id: number
          id?: string
          is_consumed?: boolean | null
          key_id: number
          public_key: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          device_id?: number
          id?: string
          is_consumed?: boolean | null
          key_id?: number
          public_key?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prekeys_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          birthdate: string | null
          created_at: string | null
          display_name: string
          id: string
          is_online: boolean
          last_seen_at: string | null
          status: string | null
          updated_at: string | null
          username: string
          username_set: boolean
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string | null
          display_name: string
          id: string
          is_online?: boolean
          last_seen_at?: string | null
          status?: string | null
          updated_at?: string | null
          username: string
          username_set?: boolean
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          birthdate?: string | null
          created_at?: string | null
          display_name?: string
          id?: string
          is_online?: boolean
          last_seen_at?: string | null
          status?: string | null
          updated_at?: string | null
          username?: string
          username_set?: boolean
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          platform: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          platform?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          platform?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_tokens: {
        Row: {
          created_at: string
          device_id: number
          environment: string
          fail_count: number
          id: string
          last_success_at: string | null
          platform: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_id: number
          environment?: string
          fail_count?: number
          id?: string
          last_success_at?: string | null
          platform?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_id?: number
          environment?: string
          fail_count?: number
          id?: string
          last_success_at?: string | null
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_tokens_device_fk"
            columns: ["user_id", "device_id"]
            isOneToOne: true
            referencedRelation: "devices"
            referencedColumns: ["user_id", "device_id"]
          },
        ]
      }
      reminders: {
        Row: {
          attempts: number
          conversation_id: string | null
          created_at: string
          id: string
          locked: boolean
          message: string
          remind_at: string
          sent_at: string | null
          status: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Insert: {
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          locked?: boolean
          message: string
          remind_at: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          user_id: string
        }
        Update: {
          attempts?: number
          conversation_id?: string | null
          created_at?: string
          id?: string
          locked?: boolean
          message?: string
          remind_at?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["reminder_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stickers: {
        Row: {
          created_at: string
          id: string
          name: string
          storage_path: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          storage_path: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          storage_path?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stickers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          conversation_id: string | null
          created_at: string
          created_by: string
          description: string | null
          due_at: string | null
          id: string
          locked: boolean
          priority: Database["public"]["Enums"]["task_priority"]
          status: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_at?: string | null
          id?: string
          locked?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          conversation_id?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_at?: string | null
          id?: string
          locked?: boolean
          priority?: Database["public"]["Enums"]["task_priority"]
          status?: Database["public"]["Enums"]["task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_friend_request: {
        Args: { p_request_id: string }
        Returns: {
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_group_member: {
        Args: { p_conversation_id: string; p_user_id: string }
        Returns: undefined
      }
      are_friends: { Args: { p_a: string; p_b: string }; Returns: boolean }
      block_user: { Args: { p_user_id: string }; Returns: undefined }
      can_send_in_conversation: {
        Args: { p_conversation_id: string; p_user: string }
        Returns: boolean
      }
      consume_prekey: {
        Args: { p_device_id: number; p_user_id: string }
        Returns: {
          key_id: number
          public_key: string
        }[]
      }
      create_group_conversation: {
        Args: { p_member_ids: string[]; p_name: string }
        Returns: string
      }
      dispatch_due_reminders: { Args: never; Returns: number }
      enqueue_push: { Args: { p_body: Json }; Returns: undefined }
      find_or_create_direct_conversation: {
        Args: { target_user_id: string }
        Returns: string
      }
      get_budget_summary: {
        Args: { p_budget_id: string }
        Returns: {
          net_balance: number
          total_owed: number
          total_paid: number
          user_id: string
        }[]
      }
      get_friend_suggestions: {
        Args: { p_limit?: number }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          is_online: boolean
          mutual_friends: number
          shared_groups: number
          username: string
        }[]
      }
      get_relationships: {
        Args: { p_user_ids: string[] }
        Returns: {
          mutual_friends: number
          request_id: string
          status: string
          user_id: string
        }[]
      }
      get_user_conversation_ids: { Args: { uid: string }; Returns: string[] }
      get_user_role_in_conversation: {
        Args: { conv_id: string; uid: string }
        Returns: string
      }
      is_blocked_between: {
        Args: { p_a: string; p_b: string }
        Returns: boolean
      }
      mutual_friend_count: {
        Args: { p_a: string; p_b: string }
        Returns: number
      }
      push_config: { Args: { p_name: string }; Returns: string }
      push_message_context: { Args: { p_message_id: string }; Returns: Json }
      push_simple_notification: {
        Args: { p_kind: string; p_payload: Json }
        Returns: {
          body: string
          conversation_id: string
          device_id: number
          environment: string
          recipient_id: string
          title: string
          token: string
        }[]
      }
      push_targets_for_message: {
        Args: { p_message_id: string }
        Returns: {
          device_id: number
          environment: string
          eph_pub: string
          key_iv: string
          recipient_fp: string
          recipient_id: string
          token: string
          unread_count: number
          wrapped_key: string
        }[]
      }
      push_token_record_failure: {
        Args: { p_token: string }
        Returns: undefined
      }
      revoke_device: { Args: { p_device_id: number }; Returns: undefined }
      search_users: {
        Args: { p_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          id: string
          is_online: boolean
          last_seen_at: string
          username: string
        }[]
      }
      send_friend_request: {
        Args: { p_recipient_id: string }
        Returns: {
          created_at: string
          id: string
          recipient_id: string
          requester_id: string
          status: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "friendships"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      send_message_with_envelopes: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_envelopes: Json
          p_iv: string
          p_media_mime?: string
          p_media_url?: string
          p_mentioned_user_ids?: string[]
          p_mentions_everyone?: boolean
          p_reply_to_id?: string
          p_thread_id?: string
          p_type?: string
        }
        Returns: {
          content: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          enc_v: number | null
          id: string
          iv: string | null
          media_mime: string | null
          media_url: string | null
          mentioned_user_ids: string[]
          mentions_everyone: boolean
          reply_to_id: string | null
          sender_id: string | null
          thread_id: string | null
          type: string
        }
        SetofOptions: {
          from: "*"
          to: "messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sync_direct_request_state: {
        Args: { p_a: string; p_b: string }
        Returns: undefined
      }
    }
    Enums: {
      expense_category:
        | "food"
        | "transport"
        | "entertainment"
        | "utilities"
        | "rent"
        | "health"
        | "shopping"
        | "other"
      reminder_status: "pending" | "sent" | "dismissed"
      task_priority: "low" | "medium" | "high"
      task_status: "todo" | "in_progress" | "done"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      expense_category: [
        "food",
        "transport",
        "entertainment",
        "utilities",
        "rent",
        "health",
        "shopping",
        "other",
      ],
      reminder_status: ["pending", "sent", "dismissed"],
      task_priority: ["low", "medium", "high"],
      task_status: ["todo", "in_progress", "done"],
    },
  },
} as const
