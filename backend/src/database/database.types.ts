/**
 * Generated database types for the SetuX `public` schema.
 *
 * Source of truth: the migrations under `supabase/migrations/`. This file is
 * produced from the live schema (Supabase type generation) and must be
 * regenerated whenever a migration changes the schema — see
 * `docs/DATABASE/database-setup.md`.
 *
 * Do not hand-edit table shapes here to work around a type error; fix the
 * migration and regenerate.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          onboarding_status: Database['public']['Enums']['onboarding_status'];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          onboarding_status?: Database['public']['Enums']['onboarding_status'];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          onboarding_status?: Database['public']['Enums']['onboarding_status'];
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          code: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          code: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          code?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      departments: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          code: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          code: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          organization_id?: string;
          name?: string;
          code?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      citizen_profiles: {
        Row: {
          id: string;
          user_id: string;
          full_name: string;
          government_id: string;
          mobile_number: string;
          date_of_birth: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          full_name: string;
          government_id: string;
          mobile_number: string;
          date_of_birth?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          full_name?: string;
          government_id?: string;
          mobile_number?: string;
          date_of_birth?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      government_profiles: {
        Row: {
          id: string;
          user_id: string;
          organization_id: string;
          department_id: string;
          full_name: string;
          employee_id: string;
          designation: string;
          official_mobile_number: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          organization_id: string;
          department_id: string;
          full_name: string;
          employee_id: string;
          designation: string;
          official_mobile_number: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          organization_id?: string;
          department_id?: string;
          full_name?: string;
          employee_id?: string;
          designation?: string;
          official_mobile_number?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      services: {
        Row: {
          id: string;
          code: string;
          name: string;
          description: string;
          department: string;
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          description: string;
          department: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          description?: string;
          department?: string;
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      data_sources: {
        Row: {
          id: string;
          code: string;
          name: string;
          type: Database['public']['Enums']['data_source_type'];
          status: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          name: string;
          type: Database['public']['Enums']['data_source_type'];
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          code?: string;
          name?: string;
          type?: Database['public']['Enums']['data_source_type'];
          status?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      service_requirements: {
        Row: {
          id: string;
          service_id: string;
          requirement_code: string;
          name: string;
          description: string | null;
          requirement_type: string;
          data_source_id: string | null;
          required: boolean;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_id: string;
          requirement_code: string;
          name: string;
          description?: string | null;
          requirement_type: string;
          data_source_id?: string | null;
          required?: boolean;
          display_order: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service_id?: string;
          requirement_code?: string;
          name?: string;
          description?: string | null;
          requirement_type?: string;
          data_source_id?: string | null;
          required?: boolean;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'service_requirements_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'service_requirements_data_source_id_fkey';
            columns: ['data_source_id'];
            isOneToOne: false;
            referencedRelation: 'data_sources';
            referencedColumns: ['id'];
          },
        ];
      };
      applications: {
        Row: {
          id: string;
          application_number: string;
          citizen_id: string;
          service_id: string;
          status: Database['public']['Enums']['application_status'];
          current_workflow_step: string | null;
          submitted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_number?: string;
          citizen_id: string;
          service_id: string;
          status?: Database['public']['Enums']['application_status'];
          current_workflow_step?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_number?: string;
          citizen_id?: string;
          service_id?: string;
          status?: Database['public']['Enums']['application_status'];
          current_workflow_step?: string | null;
          submitted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      consents: {
        Row: {
          id: string;
          application_id: string;
          citizen_id: string;
          data_source_id: string;
          purpose: string;
          status: Database['public']['Enums']['consent_status'];
          version: string;
          granted_at: string | null;
          revoked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          citizen_id: string;
          data_source_id: string;
          purpose: string;
          status?: Database['public']['Enums']['consent_status'];
          version?: string;
          granted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          citizen_id?: string;
          data_source_id?: string;
          purpose?: string;
          status?: Database['public']['Enums']['consent_status'];
          version?: string;
          granted_at?: string | null;
          revoked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      data_retrievals: {
        Row: {
          id: string;
          application_id: string;
          data_source_id: string;
          consent_id: string | null;
          request_reference: string | null;
          status: Database['public']['Enums']['retrieval_status'];
          attempt_number: number;
          response_metadata: Json | null;
          error_code: string | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          data_source_id: string;
          consent_id?: string | null;
          request_reference?: string | null;
          status?: Database['public']['Enums']['retrieval_status'];
          attempt_number?: number;
          response_metadata?: Json | null;
          error_code?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          data_source_id?: string;
          consent_id?: string | null;
          request_reference?: string | null;
          status?: Database['public']['Enums']['retrieval_status'];
          attempt_number?: number;
          response_metadata?: Json | null;
          error_code?: string | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_data: {
        Row: {
          id: string;
          application_id: string;
          field_code: string;
          field_value: Json;
          source_id: string | null;
          source_type: string | null;
          source_reference: string | null;
          verification_status: Database['public']['Enums']['data_verification_status'];
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          field_code: string;
          field_value: Json;
          source_id?: string | null;
          source_type?: string | null;
          source_reference?: string | null;
          verification_status?: Database['public']['Enums']['data_verification_status'];
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          field_code?: string;
          field_value?: Json;
          source_id?: string | null;
          source_type?: string | null;
          source_reference?: string | null;
          verification_status?: Database['public']['Enums']['data_verification_status'];
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      verifications: {
        Row: {
          id: string;
          application_id: string;
          verification_type: string;
          status: Database['public']['Enums']['verification_status'];
          source_id: string | null;
          result: Json | null;
          verified_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          verification_type: string;
          status?: Database['public']['Enums']['verification_status'];
          source_id?: string | null;
          result?: Json | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          verification_type?: string;
          status?: Database['public']['Enums']['verification_status'];
          source_id?: string | null;
          result?: Json | null;
          verified_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_reviews: {
        Row: {
          id: string;
          application_id: string;
          reviewer_id: string;
          department_id: string | null;
          decision: Database['public']['Enums']['review_decision'];
          remarks: string | null;
          reviewed_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          reviewer_id: string;
          department_id?: string | null;
          decision: Database['public']['Enums']['review_decision'];
          remarks?: string | null;
          reviewed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          reviewer_id?: string;
          department_id?: string | null;
          decision?: Database['public']['Enums']['review_decision'];
          remarks?: string | null;
          reviewed_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      application_events: {
        Row: {
          id: string;
          application_id: string;
          event_type: string;
          actor_user_id: string | null;
          step_code: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          application_id: string;
          event_type: string;
          actor_user_id?: string | null;
          step_code?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          application_id?: string;
          event_type?: string;
          actor_user_id?: string | null;
          step_code?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
      notifications: {
        Row: {
          id: string;
          user_id: string;
          application_id: string | null;
          type: string;
          title: string;
          message: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          application_id?: string | null;
          type: string;
          title: string;
          message: string;
          read_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          application_id?: string | null;
          type?: string;
          title?: string;
          message?: string;
          read_at?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_logs: {
        Row: {
          id: string;
          actor_user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          correlation_id: string | null;
          metadata: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          correlation_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          actor_user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          correlation_id?: string | null;
          metadata?: Json | null;
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: {
      next_application_number: {
        Args: Record<string, never>;
        Returns: string;
      };
      complete_citizen_onboarding: {
        Args: {
          p_user_id: string;
          p_full_name: string;
          p_government_id: string;
          p_mobile_number: string;
          p_date_of_birth: string;
        };
        Returns: undefined;
      };
      complete_government_onboarding: {
        Args: {
          p_user_id: string;
          p_organization_id: string;
          p_department_id: string;
          p_full_name: string;
          p_employee_id: string;
          p_designation: string;
          p_official_mobile_number: string;
        };
        Returns: undefined;
      };
      create_citizen_application: {
        Args: { p_citizen_id: string; p_service_id: string };
        Returns: Database['public']['Tables']['applications']['Row'][];
      };
      save_citizen_application_draft: {
        Args: { p_application_id: string; p_citizen_id: string; p_fields: Json };
        Returns: undefined;
      };
      submit_citizen_application: {
        Args: { p_application_id: string; p_citizen_id: string };
        Returns: Database['public']['Tables']['applications']['Row'][];
      };
    };
    Enums: {
      user_role: 'CITIZEN' | 'GOVERNMENT_OFFICER';
      onboarding_status: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
      application_status:
        | 'DRAFT'
        | 'CONSENT_PENDING'
        | 'DATA_RETRIEVAL'
        | 'VERIFICATION'
        | 'READY_FOR_SUBMISSION'
        | 'SUBMITTED'
        | 'UNDER_REVIEW'
        | 'REQUESTED_INFO'
        | 'WAITING_FOR_DEPARTMENT'
        | 'RETRYING'
        | 'FAILED'
        | 'APPROVED'
        | 'REJECTED'
        | 'CANCELLED';
      consent_status: 'PENDING' | 'GRANTED' | 'DENIED' | 'REVOKED' | 'EXPIRED';
      verification_status: 'PENDING' | 'PROCESSING' | 'VERIFIED' | 'FAILED' | 'REQUIRES_ACTION';
      data_verification_status: 'PENDING' | 'VERIFIED' | 'FAILED' | 'NOT_AVAILABLE';
      retrieval_status: 'PENDING' | 'IN_PROGRESS' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'RETRYING';
      data_source_type: 'DIGILOCKER' | 'GOVERNMENT_API' | 'LEGACY_SYSTEM' | 'MOCK_API';
      review_decision: 'APPROVED' | 'REJECTED' | 'REQUESTED_INFO';
    };
    CompositeTypes: Record<never, never>;
  };
};

/** Row shape of a table, as returned by SELECT. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];

/** Payload shape accepted by INSERT (server-defaulted columns optional). */
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];

/** Payload shape accepted by UPDATE (all columns optional). */
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];

/** A controlled value domain backed by a PostgreSQL enum. */
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];
