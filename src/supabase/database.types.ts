/* eslint-disable */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      budgets: {
        Row: {
          associated_card: string | null;
          couple_id: string | null;
          created_at: string;
          default_split_method: string | null;
          id: string;
          limit: number;
          name: string;
          owner_id: string;
          type: string;
          user_id: string | null;
        };
        Insert: {
          associated_card?: string | null;
          couple_id?: string | null;
          created_at?: string;
          default_split_method?: string | null;
          id?: string;
          limit: number;
          name: string;
          owner_id: string;
          type: string;
          user_id?: string | null;
        };
        Update: {
          associated_card?: string | null;
          couple_id?: string | null;
          created_at?: string;
          default_split_method?: string | null;
          id?: string;
          limit?: number;
          name?: string;
          owner_id?: string;
          type?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'budgets_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'budgets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'family_members';
            referencedColumns: ['id'];
          },
        ];
      };
      couples: {
        Row: {
          created_at: string;
          id: string;
          invite_code: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          invite_code: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          invite_code?: string;
        };
        Relationships: [];
      };
      deductions: {
        Row: {
          amount: number;
          couple_id: string | null;
          created_at: string;
          date: string;
          description: string | null;
          id: string;
          owner_id: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          couple_id?: string | null;
          created_at?: string;
          date: string;
          description?: string | null;
          id?: string;
          owner_id: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          couple_id?: string | null;
          created_at?: string;
          date?: string;
          description?: string | null;
          id?: string;
          owner_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'deductions_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'deductions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'family_members';
            referencedColumns: ['id'];
          },
        ];
      };
      expense_categories: {
        Row: {
          id: number;
          name: string;
        };
        Insert: {
          id: number;
          name: string;
        };
        Update: {
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      expenses: {
        Row: {
          amount: number;
          assigned_user_id: string | null;
          batch_id: string | null;
          batch_name: string | null;
          budget_id: string | null;
          category_id: number | null;
          couple_id: string | null;
          created_at: string;
          date: string;
          description: string;
          id: string;
          is_credit: boolean | null;
          is_recurring: boolean | null;
          owner_id: string;
          paid_by: string;
          recurrence_end_date: string | null;
          recurrence_interval: string | null;
          split_method: string;
        };
        Insert: {
          amount: number;
          assigned_user_id?: string | null;
          batch_id?: string | null;
          batch_name?: string | null;
          budget_id?: string | null;
          category_id?: number | null;
          couple_id?: string | null;
          created_at?: string;
          date: string;
          description: string;
          id?: string;
          is_credit?: boolean | null;
          is_recurring?: boolean | null;
          owner_id: string;
          paid_by: string;
          recurrence_end_date?: string | null;
          recurrence_interval?: string | null;
          split_method: string;
        };
        Update: {
          amount?: number;
          assigned_user_id?: string | null;
          batch_id?: string | null;
          batch_name?: string | null;
          budget_id?: string | null;
          category_id?: number | null;
          couple_id?: string | null;
          created_at?: string;
          date?: string;
          description?: string;
          id?: string;
          is_credit?: boolean | null;
          is_recurring?: boolean | null;
          owner_id?: string;
          paid_by?: string;
          recurrence_end_date?: string | null;
          recurrence_interval?: string | null;
          split_method?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'expenses_assigned_user_id_fkey';
            columns: ['assigned_user_id'];
            isOneToOne: false;
            referencedRelation: 'family_members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_budget_id_fkey';
            columns: ['budget_id'];
            isOneToOne: false;
            referencedRelation: 'budgets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'expenses_paid_by_fkey';
            columns: ['paid_by'];
            isOneToOne: false;
            referencedRelation: 'family_members';
            referencedColumns: ['id'];
          },
        ];
      };
      family_members: {
        Row: {
          couple_id: string | null;
          created_at: string;
          id: string;
          linked_user_id: string | null;
          name: string;
          owner_id: string;
        };
        Insert: {
          couple_id?: string | null;
          created_at?: string;
          id?: string;
          linked_user_id?: string | null;
          name: string;
          owner_id: string;
        };
        Update: {
          couple_id?: string | null;
          created_at?: string;
          id?: string;
          linked_user_id?: string | null;
          name?: string;
          owner_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'family_members_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
        ];
      };
      incomes: {
        Row: {
          amount: number;
          couple_id: string | null;
          created_at: string;
          date: string;
          description: string | null;
          id: string;
          owner_id: string;
          user_id: string;
        };
        Insert: {
          amount: number;
          couple_id?: string | null;
          created_at?: string;
          date: string;
          description?: string | null;
          id?: string;
          owner_id: string;
          user_id: string;
        };
        Update: {
          amount?: number;
          couple_id?: string | null;
          created_at?: string;
          date?: string;
          description?: string | null;
          id?: string;
          owner_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'incomes_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'incomes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'family_members';
            referencedColumns: ['id'];
          },
        ];
      };
      partner_requests: {
        Row: {
          created_at: string | null;
          id: string;
          receiver_email: string;
          receiver_id: string | null;
          sender_id: string;
          status: string | null;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          receiver_email: string;
          receiver_id?: string | null;
          sender_id: string;
          status?: string | null;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          receiver_email?: string;
          receiver_id?: string | null;
          sender_id?: string;
          status?: string | null;
        };
        Relationships: [];
      };
      premium_audit_log: {
        Row: {
          changed_at: string | null;
          changed_by: string | null;
          id: string;
          new_value: boolean | null;
          old_value: boolean | null;
          user_id: string | null;
        };
        Insert: {
          changed_at?: string | null;
          changed_by?: string | null;
          id?: string;
          new_value?: boolean | null;
          old_value?: boolean | null;
          user_id?: string | null;
        };
        Update: {
          changed_at?: string | null;
          changed_by?: string | null;
          id?: string;
          new_value?: boolean | null;
          old_value?: boolean | null;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'premium_audit_log_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'premium_audit_log_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          couple_id: string | null;
          created_at: string;
          default_split_method: string | null;
          email: string | null;
          full_name: string | null;
          has_seen_onboarding: boolean | null;
          id: string;
          is_premium: boolean | null;
          phone: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          couple_id?: string | null;
          created_at?: string;
          default_split_method?: string | null;
          email?: string | null;
          full_name?: string | null;
          has_seen_onboarding?: boolean | null;
          id: string;
          is_premium?: boolean | null;
          phone?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          couple_id?: string | null;
          created_at?: string;
          default_split_method?: string | null;
          email?: string | null;
          full_name?: string | null;
          has_seen_onboarding?: boolean | null;
          id?: string;
          is_premium?: boolean | null;
          phone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_couple_id_fkey';
            columns: ['couple_id'];
            isOneToOne: false;
            referencedRelation: 'couples';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_partner_invite_rpc: {
        Args: { p_request_id: string };
        Returns: boolean;
      };
      add_expense_rpc:
        | {
            Args: {
              p_amount: number;
              p_assigned_user_id?: string;
              p_batch_id?: string;
              p_batch_name?: string;
              p_budget_id?: string;
              p_date: string;
              p_description: string;
              p_expense_id: string;
              p_is_credit?: boolean;
              p_is_recurring: boolean;
              p_paid_by: string;
              p_recurrence_end_date?: string;
              p_recurrence_interval?: string;
              p_split_method: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_amount: number;
              p_assigned_user_id: string;
              p_batch_id: string;
              p_batch_name: string;
              p_budget_id: string;
              p_category_id?: number;
              p_date: string;
              p_description: string;
              p_expense_id: string;
              p_is_credit: boolean;
              p_is_recurring: boolean;
              p_paid_by: string;
              p_recurrence_end_date: string;
              p_recurrence_interval: string;
              p_split_method: string;
            };
            Returns: undefined;
          };
      create_budget_rpc: {
        Args: {
          p_associated_card?: string;
          p_budget_id: string;
          p_default_split_method?: string;
          p_limit: number;
          p_name: string;
          p_type: string;
          p_user_id?: string;
        };
        Returns: undefined;
      };
      delete_budget_rpc: { Args: { p_budget_id: string }; Returns: undefined };
      delete_expense_rpc: {
        Args: { p_expense_id: string };
        Returns: undefined;
      };
      delete_expenses_batch_rpc: {
        Args: { p_expense_ids: string[] };
        Returns: undefined;
      };
      get_auth_couple_id: { Args: never; Returns: string };
      get_budgets_rpc: {
        Args: never;
        Returns: {
          associated_card: string;
          couple_id: string;
          created_at: string;
          default_split_method: string;
          id: string;
          limit: number;
          name: string;
          owner_id: string;
          type: string;
          user_id: string;
        }[];
      };
      get_categories_rpc: { Args: never; Returns: Json };
      get_couple_id_rpc: { Args: never; Returns: string };
      get_current_user_profile: {
        Args: never;
        Returns: {
          avatar_url: string | null;
          couple_id: string | null;
          created_at: string;
          default_split_method: string | null;
          email: string | null;
          full_name: string | null;
          has_seen_onboarding: boolean | null;
          id: string;
          is_premium: boolean | null;
          phone: string | null;
        }[];
        SetofOptions: {
          from: '*';
          to: 'profiles';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_dashboard_data: { Args: { p_couple_id: string }; Returns: Json };
      get_deductions_rpc: {
        Args: never;
        Returns: {
          amount: number;
          couple_id: string;
          created_at: string;
          date: string;
          description: string;
          id: string;
          user_id: string;
        }[];
      };
      get_family_members_rpc: {
        Args: never;
        Returns: {
          couple_id: string | null;
          created_at: string;
          id: string;
          linked_user_id: string | null;
          name: string;
          owner_id: string;
        }[];
        SetofOptions: {
          from: '*';
          to: 'family_members';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_household_ids_rpc: {
        Args: never;
        Returns: {
          user_id: string;
        }[];
      };
      get_incomes_rpc: {
        Args: never;
        Returns: {
          amount: number;
          couple_id: string;
          created_at: string;
          date: string;
          description: string;
          id: string;
          user_id: string;
        }[];
      };
      get_linked_partner_email_rpc: { Args: never; Returns: string };
      get_pending_invites_rpc: {
        Args: never;
        Returns: {
          created_at: string;
          id: string;
          receiver_email: string;
          sender_email: string;
          sender_id: string;
          status: string;
        }[];
      };
      initialize_user_data: {
        Args: { p_email: string; p_full_name: string; p_invite_code?: string };
        Returns: Json;
      };
      is_user_premium: { Args: { user_id: string }; Returns: boolean };
      join_couple_by_code: { Args: { p_code: string }; Returns: boolean };
      send_partner_invite_rpc: {
        Args: { p_receiver_email: string };
        Returns: undefined;
      };
      split_recurring_expense_rpc: {
        Args: {
          p_cutoff_date: string;
          p_new_expense: Json;
          p_old_expense_id: string;
        };
        Returns: undefined;
      };
      stop_recurring_expense_rpc: {
        Args: { p_end_date: string; p_expense_id: string };
        Returns: undefined;
      };
      sync_deductions: {
        Args: { p_couple_id: string; p_items: Json; p_user_id: string };
        Returns: undefined;
      };
      sync_incomes: {
        Args: { p_couple_id: string; p_items: Json; p_user_id: string };
        Returns: undefined;
      };
      update_budget_rpc: {
        Args: {
          p_associated_card?: string;
          p_budget_id: string;
          p_default_split_method?: string;
          p_limit: number;
          p_name: string;
          p_type: string;
          p_user_id?: string;
        };
        Returns: undefined;
      };
      update_expense_rpc:
        | {
            Args: {
              p_amount: number;
              p_assigned_user_id?: string;
              p_budget_id?: string;
              p_date: string;
              p_description: string;
              p_expense_id: string;
              p_is_credit?: boolean;
              p_is_recurring: boolean;
              p_paid_by: string;
              p_recurrence_end_date?: string;
              p_recurrence_interval?: string;
              p_split_method: string;
            };
            Returns: undefined;
          }
        | {
            Args: {
              p_amount: number;
              p_assigned_user_id: string;
              p_budget_id: string;
              p_category_id?: number;
              p_date: string;
              p_description: string;
              p_expense_id: string;
              p_is_credit: boolean;
              p_is_recurring: boolean;
              p_paid_by: string;
              p_recurrence_end_date: string;
              p_recurrence_interval: string;
              p_split_method: string;
            };
            Returns: undefined;
          };
      update_user_profile_rpc: {
        Args: {
          p_avatar_url?: string;
          p_default_split_method?: string;
          p_full_name?: string;
          p_phone?: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
