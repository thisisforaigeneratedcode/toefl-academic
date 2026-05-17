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
  public: {
    Tables: {
      apicosts: {
        Row: {
          api_earnings_kes: number
          booking_id: string | null
          combined_fee_kes: number
          created_at: string
          id: string
          owner_earnings_kes: number
          owner_withdrawal_receipt: string | null
          owner_withdrawn: boolean
          owner_withdrawn_at: string | null
          partner_earnings_kes: number
          partner_withdrawal_receipt: string | null
          partner_withdrawn: boolean
          partner_withdrawn_at: string | null
          payment_id: string
          pretium_fee_kes: number
          transaction_amount_kes: number
          type: string
          user_id: string | null
          withdrawal_receipt: string | null
          withdrawn: boolean
          withdrawn_at: string | null
        }
        Insert: {
          api_earnings_kes: number
          booking_id?: string | null
          combined_fee_kes: number
          created_at?: string
          id?: string
          owner_earnings_kes?: number
          owner_withdrawal_receipt?: string | null
          owner_withdrawn?: boolean
          owner_withdrawn_at?: string | null
          partner_earnings_kes?: number
          partner_withdrawal_receipt?: string | null
          partner_withdrawn?: boolean
          partner_withdrawn_at?: string | null
          payment_id: string
          pretium_fee_kes: number
          transaction_amount_kes: number
          type: string
          user_id?: string | null
          withdrawal_receipt?: string | null
          withdrawn?: boolean
          withdrawn_at?: string | null
        }
        Update: {
          api_earnings_kes?: number
          booking_id?: string | null
          combined_fee_kes?: number
          created_at?: string
          id?: string
          owner_earnings_kes?: number
          owner_withdrawal_receipt?: string | null
          owner_withdrawn?: boolean
          owner_withdrawn_at?: string | null
          partner_earnings_kes?: number
          partner_withdrawal_receipt?: string | null
          partner_withdrawn?: boolean
          partner_withdrawn_at?: string | null
          payment_id?: string
          pretium_fee_kes?: number
          transaction_amount_kes?: number
          type?: string
          user_id?: string | null
          withdrawal_receipt?: string | null
          withdrawn?: boolean
          withdrawn_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "apicosts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          amount_kes: number | null
          created_at: string
          id: string
          level: Database["public"]["Enums"]["test_level"]
          mpesa_receipt: string | null
          notes: string | null
          paid_at: string | null
          payment_id: string | null
          payment_status: string
          phone: string | null
          scheduled_at: string
          status: Database["public"]["Enums"]["booking_status"]
          user_id: string
        }
        Insert: {
          amount_kes?: number | null
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["test_level"]
          mpesa_receipt?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_status?: string
          phone?: string | null
          scheduled_at: string
          status?: Database["public"]["Enums"]["booking_status"]
          user_id: string
        }
        Update: {
          amount_kes?: number | null
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["test_level"]
          mpesa_receipt?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_id?: string | null
          payment_status?: string
          phone?: string | null
          scheduled_at?: string
          status?: Database["public"]["Enums"]["booking_status"]
          user_id?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          attempt_id: string
          band: string
          candidate_name: string
          certificate_number: string
          id: string
          issued_at: string
          level: Database["public"]["Enums"]["test_level"]
          listening_pct: number | null
          overall_pct: number | null
          reading_pct: number | null
          revoked: boolean
          score: number | null
          speaking_pct: number | null
          total: number | null
          user_id: string
          valid_until: string
          writing_pct: number | null
        }
        Insert: {
          attempt_id: string
          band: string
          candidate_name: string
          certificate_number: string
          id?: string
          issued_at?: string
          level: Database["public"]["Enums"]["test_level"]
          listening_pct?: number | null
          overall_pct?: number | null
          reading_pct?: number | null
          revoked?: boolean
          score?: number | null
          speaking_pct?: number | null
          total?: number | null
          user_id: string
          valid_until?: string
          writing_pct?: number | null
        }
        Update: {
          attempt_id?: string
          band?: string
          candidate_name?: string
          certificate_number?: string
          id?: string
          issued_at?: string
          level?: Database["public"]["Enums"]["test_level"]
          listening_pct?: number | null
          overall_pct?: number | null
          reading_pct?: number | null
          revoked?: boolean
          score?: number | null
          speaking_pct?: number | null
          total?: number | null
          user_id?: string
          valid_until?: string
          writing_pct?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "exam_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_attempts: {
        Row: {
          admin_band: string | null
          admin_notes: string | null
          answers: Json
          approval_status: string
          approved_at: string | null
          approved_by: string | null
          booking_id: string | null
          created_at: string
          final_band: string | null
          graded_at: string | null
          id: string
          level: Database["public"]["Enums"]["test_level"]
          listening_prompt_text: string | null
          listening_response: string | null
          mcq_score: number | null
          mcq_total: number | null
          question_ids: string[]
          reading_audio_url: string | null
          reading_passage: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["exam_status"]
          submitted_at: string | null
          user_id: string
          writing_prompt: string | null
          writing_response: string | null
          writing_score: number | null
        }
        Insert: {
          admin_band?: string | null
          admin_notes?: string | null
          answers?: Json
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string | null
          created_at?: string
          final_band?: string | null
          graded_at?: string | null
          id?: string
          level: Database["public"]["Enums"]["test_level"]
          listening_prompt_text?: string | null
          listening_response?: string | null
          mcq_score?: number | null
          mcq_total?: number | null
          question_ids?: string[]
          reading_audio_url?: string | null
          reading_passage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          submitted_at?: string | null
          user_id: string
          writing_prompt?: string | null
          writing_response?: string | null
          writing_score?: number | null
        }
        Update: {
          admin_band?: string | null
          admin_notes?: string | null
          answers?: Json
          approval_status?: string
          approved_at?: string | null
          approved_by?: string | null
          booking_id?: string | null
          created_at?: string
          final_band?: string | null
          graded_at?: string | null
          id?: string
          level?: Database["public"]["Enums"]["test_level"]
          listening_prompt_text?: string | null
          listening_response?: string | null
          mcq_score?: number | null
          mcq_total?: number | null
          question_ids?: string[]
          reading_audio_url?: string | null
          reading_passage?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["exam_status"]
          submitted_at?: string | null
          user_id?: string
          writing_prompt?: string | null
          writing_response?: string | null
          writing_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_attempts_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          country: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          full_name: string
          id: string
          updated_at: string
        }
        Insert: {
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          full_name: string
          id: string
          updated_at?: string
        }
        Update: {
          country?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          full_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          audio_url: string | null
          correct_option: string
          created_at: string
          id: string
          level: Database["public"]["Enums"]["test_level"]
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          passage: string | null
          prompt: string
          section: string
        }
        Insert: {
          audio_url?: string | null
          correct_option: string
          created_at?: string
          id?: string
          level: Database["public"]["Enums"]["test_level"]
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          passage?: string | null
          prompt: string
          section: string
        }
        Update: {
          audio_url?: string | null
          correct_option?: string
          created_at?: string
          id?: string
          level?: Database["public"]["Enums"]["test_level"]
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          passage?: string | null
          prompt?: string
          section?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      support_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          read_by_admin: boolean
          read_by_user: boolean
          sender_id: string
          sender_role: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          read_by_admin?: boolean
          read_by_user?: boolean
          sender_id: string
          sender_role: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          read_by_admin?: boolean
          read_by_user?: boolean
          sender_id?: string
          sender_role?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      booking_status: "pending" | "confirmed" | "completed" | "cancelled"
      exam_status: "not_started" | "in_progress" | "submitted" | "graded"
      test_level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      booking_status: ["pending", "confirmed", "completed", "cancelled"],
      exam_status: ["not_started", "in_progress", "submitted", "graded"],
      test_level: ["A1", "A2", "B1", "B2", "C1", "C2"],
    },
  },
} as const
