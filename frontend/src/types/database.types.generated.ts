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
      academic_years: {
        Row: {
          created_at: string
          department_id: string
          ends_on: string
          id: string
          is_active: boolean
          name: string
          starts_on: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          ends_on: string
          id?: string
          is_active?: boolean
          name: string
          starts_on: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          ends_on?: string
          id?: string
          is_active?: boolean
          name?: string
          starts_on?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          profile_id: string
          read_at: string
        }
        Insert: {
          announcement_id: string
          profile_id: string
          read_at?: string
        }
        Update: {
          announcement_id?: string
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_recipients: {
        Row: {
          announcement_id: string
          profile_id: string
          read_at: string | null
        }
        Insert: {
          announcement_id: string
          profile_id: string
          read_at?: string | null
        }
        Update: {
          announcement_id?: string
          profile_id?: string
          read_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "announcement_recipients_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcement_recipients_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audience: string
          author_id: string
          category: string
          created_at: string
          department_id: string
          expiry_date: string | null
          id: string
          message: string
          priority: string
          publish_date: string
          target: Json
          title: string
          updated_at: string
        }
        Insert: {
          audience?: string
          author_id: string
          category: string
          created_at?: string
          department_id: string
          expiry_date?: string | null
          id?: string
          message: string
          priority?: string
          publish_date?: string
          target?: Json
          title: string
          updated_at?: string
        }
        Update: {
          audience?: string
          author_id?: string
          category?: string
          created_at?: string
          department_id?: string
          expiry_date?: string | null
          id?: string
          message?: string
          priority?: string
          publish_date?: string
          target?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "announcements_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          assessment_date: string
          assessment_type: Database["public"]["Enums"]["assessment_type"]
          created_at: string
          faculty_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          maximum_marks: number
          section_id: string
          status: Database["public"]["Enums"]["assessment_status"]
          subject_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assessment_date: string
          assessment_type: Database["public"]["Enums"]["assessment_type"]
          created_at?: string
          faculty_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          maximum_marks: number
          section_id: string
          status?: Database["public"]["Enums"]["assessment_status"]
          subject_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assessment_date?: string
          assessment_type?: Database["public"]["Enums"]["assessment_type"]
          created_at?: string
          faculty_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          maximum_marks?: number
          section_id?: string
          status?: Database["public"]["Enums"]["assessment_status"]
          subject_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          bucket_id: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["attachment_entity"]
          faculty_review_comment: string | null
          faculty_reviewed_at: string | null
          faculty_reviewed_by: string | null
          faculty_reviewer_id: string | null
          filename: string
          id: string
          is_active: boolean
          jury_review_comment: string | null
          jury_reviewed_at: string | null
          jury_reviewed_by: string | null
          jury_reviewer_id: string | null
          mime_type: string
          object_path: string
          owner_id: string
          replacement_for_attachment_id: string | null
          requires_jury_review: boolean
          size_bytes: number
          verification_status: Database["public"]["Enums"]["attachment_verification_status"]
          verified_at: string | null
        }
        Insert: {
          bucket_id: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["attachment_entity"]
          faculty_review_comment?: string | null
          faculty_reviewed_at?: string | null
          faculty_reviewed_by?: string | null
          faculty_reviewer_id?: string | null
          filename: string
          id?: string
          is_active?: boolean
          jury_review_comment?: string | null
          jury_reviewed_at?: string | null
          jury_reviewed_by?: string | null
          jury_reviewer_id?: string | null
          mime_type: string
          object_path: string
          owner_id: string
          replacement_for_attachment_id?: string | null
          requires_jury_review?: boolean
          size_bytes: number
          verification_status?: Database["public"]["Enums"]["attachment_verification_status"]
          verified_at?: string | null
        }
        Update: {
          bucket_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["attachment_entity"]
          faculty_review_comment?: string | null
          faculty_reviewed_at?: string | null
          faculty_reviewed_by?: string | null
          faculty_reviewer_id?: string | null
          filename?: string
          id?: string
          is_active?: boolean
          jury_review_comment?: string | null
          jury_reviewed_at?: string | null
          jury_reviewed_by?: string | null
          jury_reviewer_id?: string | null
          mime_type?: string
          object_path?: string
          owner_id?: string
          replacement_for_attachment_id?: string | null
          requires_jury_review?: boolean
          size_bytes?: number
          verification_status?: Database["public"]["Enums"]["attachment_verification_status"]
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachments_faculty_reviewed_by_fkey"
            columns: ["faculty_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_faculty_reviewer_id_fkey"
            columns: ["faculty_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_jury_reviewed_by_fkey"
            columns: ["jury_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_jury_reviewer_id_fkey"
            columns: ["jury_reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_replacement_for_attachment_id_fkey"
            columns: ["replacement_for_attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_correction_requests: {
        Row: {
          attendance_record_id: string
          corrected_status: Database["public"]["Enums"]["attendance_status"]
          created_at: string
          decision: Database["public"]["Enums"]["correction_decision"]
          id: string
          original_status: Database["public"]["Enums"]["attendance_status"]
          reason: string
          reviewed_at: string | null
          reviewer_id: string | null
          student_id: string
        }
        Insert: {
          attendance_record_id: string
          corrected_status: Database["public"]["Enums"]["attendance_status"]
          created_at?: string
          decision?: Database["public"]["Enums"]["correction_decision"]
          id?: string
          original_status: Database["public"]["Enums"]["attendance_status"]
          reason: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          student_id: string
        }
        Update: {
          attendance_record_id?: string
          corrected_status?: Database["public"]["Enums"]["attendance_status"]
          created_at?: string
          decision?: Database["public"]["Enums"]["correction_decision"]
          id?: string
          original_status?: Database["public"]["Enums"]["attendance_status"]
          reason?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_correction_requests_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "attendance_correction_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      attendance_corrections: {
        Row: {
          attendance_record_id: string
          created_at: string
          history: Json
          id: string
          original_status: Database["public"]["Enums"]["attendance_status"]
          reason: string
          requested_status: Database["public"]["Enums"]["attendance_status"]
          requester_id: string
          reviewed_at: string | null
          reviewer_comments: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["correction_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          attendance_record_id: string
          created_at?: string
          history?: Json
          id?: string
          original_status: Database["public"]["Enums"]["attendance_status"]
          reason: string
          requested_status: Database["public"]["Enums"]["attendance_status"]
          requester_id: string
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          attendance_record_id?: string
          created_at?: string
          history?: Json
          id?: string
          original_status?: Database["public"]["Enums"]["attendance_status"]
          reason?: string
          requested_status?: Database["public"]["Enums"]["attendance_status"]
          requester_id?: string
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_corrections_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_corrections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_history: {
        Row: {
          action: string
          actor_id: string | null
          attendance_record_id: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["attendance_status"] | null
          old_status: Database["public"]["Enums"]["attendance_status"] | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          attendance_record_id?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["attendance_status"] | null
          old_status?: Database["public"]["Enums"]["attendance_status"] | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          attendance_record_id?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["attendance_status"] | null
          old_status?: Database["public"]["Enums"]["attendance_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_history_attendance_record_id_fkey"
            columns: ["attendance_record_id"]
            isOneToOne: false
            referencedRelation: "attendance_records"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          check_in_time: string | null
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
          verification_data: Json
        }
        Insert: {
          check_in_time?: string | null
          created_at?: string
          id?: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
          verification_data?: Json
        }
        Update: {
          check_in_time?: string | null
          created_at?: string
          id?: string
          session_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
          verification_data?: Json
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "attendance_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_records_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_sessions: {
        Row: {
          attendance_date: string
          created_at: string
          faculty_id: string
          finalized_at: string | null
          finalized_by: string | null
          id: string
          period: number | null
          section_id: string
          session_type: Database["public"]["Enums"]["attendance_session_type"]
          status: Database["public"]["Enums"]["attendance_session_status"]
          subject_id: string | null
          timetable_entry_id: string | null
          updated_at: string
        }
        Insert: {
          attendance_date: string
          created_at?: string
          faculty_id: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          period?: number | null
          section_id: string
          session_type: Database["public"]["Enums"]["attendance_session_type"]
          status?: Database["public"]["Enums"]["attendance_session_status"]
          subject_id?: string | null
          timetable_entry_id?: string | null
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          created_at?: string
          faculty_id?: string
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          period?: number | null
          section_id?: string
          session_type?: Database["public"]["Enums"]["attendance_session_type"]
          status?: Database["public"]["Enums"]["attendance_session_status"]
          subject_id?: string | null
          timetable_entry_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_sessions_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_finalized_by_fkey"
            columns: ["finalized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_sessions_timetable_entry_id_fkey"
            columns: ["timetable_entry_id"]
            isOneToOne: false
            referencedRelation: "timetable_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          id: string
          module: string
          record_reference: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          module: string
          record_reference: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          id?: string
          module?: string
          record_reference?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      class_teacher_allocations: {
        Row: {
          academic_year_id: string
          created_at: string
          faculty_id: string
          id: string
          section_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          faculty_id: string
          id?: string
          section_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          faculty_id?: string
          id?: string
          section_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_teacher_allocations_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_teacher_allocations_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "class_teacher_allocations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_messages: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
          thread_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "communication_messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communication_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "communication_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_threads: {
        Row: {
          created_at: string
          id: string
          subject: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          subject?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          subject?: string | null
        }
        Relationships: []
      }
      competition_registrations: {
        Row: {
          competition_id: string
          id: string
          proof_metadata: Json | null
          status: Database["public"]["Enums"]["request_status"]
          student_id: string
        }
        Insert: {
          competition_id: string
          id?: string
          proof_metadata?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          student_id: string
        }
        Update: {
          competition_id?: string
          id?: string
          proof_metadata?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "competition_registrations_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "competition_registrations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      competitions: {
        Row: {
          created_at: string
          department_id: string
          details: Json
          event_date: string
          id: string
          name: string
          organizer: string
          updated_at: string
          venue: string | null
        }
        Insert: {
          created_at?: string
          department_id: string
          details?: Json
          event_date: string
          id?: string
          name: string
          organizer: string
          updated_at?: string
          venue?: string | null
        }
        Update: {
          created_at?: string
          department_id?: string
          details?: Json
          event_date?: string
          id?: string
          name?: string
          organizer?: string
          updated_at?: string
          venue?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "competitions_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_history: {
        Row: {
          actor_id: string | null
          complaint_id: string
          created_at: string
          id: string
          response: string | null
          status: string
        }
        Insert: {
          actor_id?: string | null
          complaint_id: string
          created_at?: string
          id?: string
          response?: string | null
          status: string
        }
        Update: {
          actor_id?: string | null
          complaint_id?: string
          created_at?: string
          id?: string
          response?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_history_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_to: string | null
          category: string
          created_at: string
          department_id: string
          description: string
          id: string
          response: string | null
          status: string
          student_id: string
          subject: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          category: string
          created_at?: string
          department_id: string
          description: string
          id?: string
          response?: string | null
          status?: string
          student_id: string
          subject: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          category?: string
          created_at?: string
          department_id?: string
          description?: string
          id?: string
          response?: string | null
          status?: string
          student_id?: string
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_attendance_sessions: {
        Row: {
          attendance_date: string
          finalized_at: string | null
          id: string
          locked: boolean
          section_id: string
          verifier_id: string
        }
        Insert: {
          attendance_date: string
          finalized_at?: string | null
          id?: string
          locked?: boolean
          section_id: string
          verifier_id: string
        }
        Update: {
          attendance_date?: string
          finalized_at?: string | null
          id?: string
          locked?: boolean
          section_id?: string
          verifier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_attendance_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_attendance_sessions_verifier_id_fkey"
            columns: ["verifier_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      departments: {
        Row: {
          code: string
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          academic_year_id: string
          created_at: string
          id: string
          section_id: string
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          id?: string
          section_id: string
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          id?: string
          section_id?: string
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty_assignments: {
        Row: {
          academic_year_id: string
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          created_at: string
          faculty_id: string
          id: string
          is_active: boolean
          is_jury_eligible: boolean
          section_id: string
          semester_id: string
          subject_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          assignment_type: Database["public"]["Enums"]["assignment_type"]
          created_at?: string
          faculty_id: string
          id?: string
          is_active?: boolean
          is_jury_eligible?: boolean
          section_id: string
          semester_id: string
          subject_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          assignment_type?: Database["public"]["Enums"]["assignment_type"]
          created_at?: string
          faculty_id?: string
          id?: string
          is_active?: boolean
          is_jury_eligible?: boolean
          section_id?: string
          semester_id?: string
          subject_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_assignments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_assignments_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_assignments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_assignments_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_assignments_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty_profiles: {
        Row: {
          created_at: string
          designation: string | null
          employee_number: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          designation?: string | null
          employee_number: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          designation?: string | null
          employee_number?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      faculty_subject_allocations: {
        Row: {
          created_at: string
          faculty_id: string
          id: string
          responsibility: Database["public"]["Enums"]["faculty_responsibility"]
          section_id: string
          subject_id: string
        }
        Insert: {
          created_at?: string
          faculty_id: string
          id?: string
          responsibility?: Database["public"]["Enums"]["faculty_responsibility"]
          section_id: string
          subject_id: string
        }
        Update: {
          created_at?: string
          faculty_id?: string
          id?: string
          responsibility?: Database["public"]["Enums"]["faculty_responsibility"]
          section_id?: string
          subject_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "faculty_subject_allocations_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "faculty_subject_allocations_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "faculty_subject_allocations_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_pass_requests: {
        Row: {
          created_at: string
          emergency_details: string | null
          exit_time: string
          expected_return_time: string
          id: string
          locked: boolean
          pass_date: string
          reason: string
          status: Database["public"]["Enums"]["request_status"]
          student_id: string
        }
        Insert: {
          created_at?: string
          emergency_details?: string | null
          exit_time: string
          expected_return_time: string
          id?: string
          locked?: boolean
          pass_date: string
          reason: string
          status?: Database["public"]["Enums"]["request_status"]
          student_id: string
        }
        Update: {
          created_at?: string
          emergency_details?: string | null
          exit_time?: string
          expected_return_time?: string
          id?: string
          locked?: boolean
          pass_date?: string
          reason?: string
          status?: Database["public"]["Enums"]["request_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_pass_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      lab_assistant_profiles: {
        Row: {
          created_at: string
          employee_number: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          employee_number: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          employee_number?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lab_assistant_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          document_metadata: Json | null
          from_date: string
          id: string
          locked: boolean
          reason: string
          requester_id: string
          status: Database["public"]["Enums"]["request_status"]
          to_date: string
        }
        Insert: {
          created_at?: string
          document_metadata?: Json | null
          from_date: string
          id?: string
          locked?: boolean
          reason: string
          requester_id: string
          status?: Database["public"]["Enums"]["request_status"]
          to_date: string
        }
        Update: {
          created_at?: string
          document_metadata?: Json | null
          from_date?: string
          id?: string
          locked?: boolean
          reason?: string
          requester_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_correction_requests: {
        Row: {
          corrected_mark: number | null
          created_at: string
          decision: Database["public"]["Enums"]["correction_decision"]
          id: string
          old_mark: number | null
          reason: string
          reviewed_at: string | null
          reviewer_id: string | null
          student_id: string
          student_mark_id: string
        }
        Insert: {
          corrected_mark?: number | null
          created_at?: string
          decision?: Database["public"]["Enums"]["correction_decision"]
          id?: string
          old_mark?: number | null
          reason: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          student_id: string
          student_mark_id: string
        }
        Update: {
          corrected_mark?: number | null
          created_at?: string
          decision?: Database["public"]["Enums"]["correction_decision"]
          id?: string
          old_mark?: number | null
          reason?: string
          reviewed_at?: string | null
          reviewer_id?: string | null
          student_id?: string
          student_mark_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mark_correction_requests_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mark_correction_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "mark_correction_requests_student_mark_id_fkey"
            columns: ["student_mark_id"]
            isOneToOne: false
            referencedRelation: "student_marks"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_corrections: {
        Row: {
          created_at: string
          history: Json
          id: string
          mark_id: string
          original_marks: number | null
          reason: string
          requested_marks: number | null
          requester_id: string
          reviewed_at: string | null
          reviewer_comments: string | null
          reviewer_id: string | null
          status: Database["public"]["Enums"]["correction_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          history?: Json
          id?: string
          mark_id: string
          original_marks?: number | null
          reason: string
          requested_marks?: number | null
          requester_id: string
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          history?: Json
          id?: string
          mark_id?: string
          original_marks?: number | null
          reason?: string
          requested_marks?: number | null
          requester_id?: string
          reviewed_at?: string | null
          reviewer_comments?: string | null
          reviewer_id?: string | null
          status?: Database["public"]["Enums"]["correction_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mark_corrections_mark_id_fkey"
            columns: ["mark_id"]
            isOneToOne: false
            referencedRelation: "marks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mark_corrections_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mark_corrections_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mark_corrections_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      mark_history: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          new_mark: number | null
          old_mark: number | null
          student_mark_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_mark?: number | null
          old_mark?: number | null
          student_mark_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          new_mark?: number | null
          old_mark?: number | null
          student_mark_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mark_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mark_history_student_mark_id_fkey"
            columns: ["student_mark_id"]
            isOneToOne: false
            referencedRelation: "student_marks"
            referencedColumns: ["id"]
          },
        ]
      }
      marks: {
        Row: {
          absent: boolean
          assessment_id: string
          created_at: string
          id: string
          is_locked: boolean
          obtained_marks: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          absent?: boolean
          assessment_id: string
          created_at?: string
          id?: string
          is_locked?: boolean
          obtained_marks?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          absent?: boolean
          assessment_id?: string
          created_at?: string
          id?: string
          is_locked?: boolean
          obtained_marks?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          archived_at: string | null
          created_at: string
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          sender_id: string
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          sender_id: string
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          notification_id: string
          profile_id: string
          read_at: string
        }
        Insert: {
          notification_id: string
          profile_id: string
          read_at?: string
        }
        Update: {
          notification_id?: string
          profile_id?: string
          read_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_reads_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          notification_type: string
          read_at: string | null
          recipient_id: string
          title: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          notification_type: string
          read_at?: string | null
          recipient_id: string
          title: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          notification_type?: string
          read_at?: string | null
          recipient_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      od_requests: {
        Row: {
          certificate_metadata: Json | null
          competition_registration_id: string | null
          created_at: string
          id: string
          locked: boolean
          project_id: string | null
          proof_metadata: Json | null
          status: Database["public"]["Enums"]["request_status"]
          student_id: string
        }
        Insert: {
          certificate_metadata?: Json | null
          competition_registration_id?: string | null
          created_at?: string
          id?: string
          locked?: boolean
          project_id?: string | null
          proof_metadata?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          student_id: string
        }
        Update: {
          certificate_metadata?: Json | null
          competition_registration_id?: string | null
          created_at?: string
          id?: string
          locked?: boolean
          project_id?: string | null
          proof_metadata?: Json | null
          status?: Database["public"]["Enums"]["request_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "od_requests_competition_registration_id_fkey"
            columns: ["competition_registration_id"]
            isOneToOne: false
            referencedRelation: "competition_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "od_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "od_requests_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      portion_completion: {
        Row: {
          completed_topic: string
          completion_percentage: number
          created_at: string
          faculty_id: string
          id: string
          next_topic: string | null
          planned_topic: string
          section_id: string
          subject_id: string
          timetable_entry_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          completed_topic: string
          completion_percentage: number
          created_at?: string
          faculty_id: string
          id?: string
          next_topic?: string | null
          planned_topic: string
          section_id: string
          subject_id: string
          timetable_entry_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          completed_topic?: string
          completion_percentage?: number
          created_at?: string
          faculty_id?: string
          id?: string
          next_topic?: string | null
          planned_topic?: string
          section_id?: string
          subject_id?: string
          timetable_entry_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portion_completion_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "portion_completion_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_completion_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_completion_timetable_entry_id_fkey"
            columns: ["timetable_entry_id"]
            isOneToOne: true
            referencedRelation: "timetable_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      portion_updates: {
        Row: {
          completed_topic: string
          completion_percentage: number
          created_at: string
          faculty_id: string
          id: string
          next_topic: string | null
          planned_topic: string
          section_id: string
          subject_id: string
          timetable_entry_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          completed_topic: string
          completion_percentage: number
          created_at?: string
          faculty_id: string
          id?: string
          next_topic?: string | null
          planned_topic: string
          section_id: string
          subject_id: string
          timetable_entry_id: string
          unit: string
          updated_at?: string
        }
        Update: {
          completed_topic?: string
          completion_percentage?: number
          created_at?: string
          faculty_id?: string
          id?: string
          next_topic?: string | null
          planned_topic?: string
          section_id?: string
          subject_id?: string
          timetable_entry_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portion_updates_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_updates_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_updates_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portion_updates_timetable_entry_id_fkey"
            columns: ["timetable_entry_id"]
            isOneToOne: false
            referencedRelation: "timetable_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          date_of_birth: string | null
          department_id: string | null
          designation: string | null
          email: string
          employee_or_register_number: string | null
          faculty_responsibilities: Database["public"]["Enums"]["faculty_responsibility"][]
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["app_role"]
          section_id: string | null
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          designation?: string | null
          email: string
          employee_or_register_number?: string | null
          faculty_responsibilities?: Database["public"]["Enums"]["faculty_responsibility"][]
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          section_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          date_of_birth?: string | null
          department_id?: string | null
          designation?: string | null
          email?: string
          employee_or_register_number?: string | null
          faculty_responsibilities?: Database["public"]["Enums"]["faculty_responsibility"][]
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          section_id?: string | null
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          project_id: string
          student_id: string
        }
        Insert: {
          created_at?: string
          project_id: string
          student_id: string
        }
        Update: {
          created_at?: string
          project_id?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          department_id: string
          description: string
          faculty_guide_id: string | null
          id: string
          name: string
          status: string
          student_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id: string
          description: string
          faculty_guide_id?: string | null
          id?: string
          name: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          description?: string
          faculty_guide_id?: string | null
          id?: string
          name?: string
          status?: string
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_faculty_guide_id_fkey"
            columns: ["faculty_guide_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      request_approvals: {
        Row: {
          created_at: string
          decision: Database["public"]["Enums"]["request_status"]
          id: string
          note: string | null
          request_id: string
          request_kind: string
          reviewer_id: string
          stage: string
        }
        Insert: {
          created_at?: string
          decision: Database["public"]["Enums"]["request_status"]
          id?: string
          note?: string | null
          request_id: string
          request_kind: string
          reviewer_id: string
          stage: string
        }
        Update: {
          created_at?: string
          decision?: Database["public"]["Enums"]["request_status"]
          id?: string
          note?: string | null
          request_id?: string
          request_kind?: string
          reviewer_id?: string
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_approvals_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_history: {
        Row: {
          action: string
          actor_id: string | null
          actor_role: Database["public"]["Enums"]["app_role"] | null
          comments: string | null
          created_at: string
          id: string
          new_status: Database["public"]["Enums"]["request_status"] | null
          previous_status: Database["public"]["Enums"]["request_status"] | null
          request_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["request_status"] | null
          previous_status?: Database["public"]["Enums"]["request_status"] | null
          request_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_role?: Database["public"]["Enums"]["app_role"] | null
          comments?: string | null
          created_at?: string
          id?: string
          new_status?: Database["public"]["Enums"]["request_status"] | null
          previous_status?: Database["public"]["Enums"]["request_status"] | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          id: string
          note: string | null
          request_id: string
          request_kind: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          request_id: string
          request_kind: string
          status: Database["public"]["Enums"]["request_status"]
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          id?: string
          note?: string | null
          request_id?: string
          request_kind?: string
          status?: Database["public"]["Enums"]["request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "request_status_history_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          created_at: string
          current_approval_level: number
          details: Json
          from_date: string | null
          id: string
          is_locked: boolean
          reason: string
          request_type: Database["public"]["Enums"]["request_type"]
          requester_id: string
          status: Database["public"]["Enums"]["request_status"]
          to_date: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_approval_level?: number
          details?: Json
          from_date?: string | null
          id?: string
          is_locked?: boolean
          reason: string
          request_type: Database["public"]["Enums"]["request_type"]
          requester_id: string
          status?: Database["public"]["Enums"]["request_status"]
          to_date?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_approval_level?: number
          details?: Json
          from_date?: string | null
          id?: string
          is_locked?: boolean
          reason?: string
          request_type?: Database["public"]["Enums"]["request_type"]
          requester_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          to_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sections: {
        Row: {
          academic_year_id: string
          capacity: number | null
          created_at: string
          department_id: string
          id: string
          name: string
          semester_id: string
          updated_at: string
          year_number: number
        }
        Insert: {
          academic_year_id: string
          capacity?: number | null
          created_at?: string
          department_id: string
          id?: string
          name: string
          semester_id: string
          updated_at?: string
          year_number: number
        }
        Update: {
          academic_year_id?: string
          capacity?: number | null
          created_at?: string
          department_id?: string
          id?: string
          name?: string
          semester_id?: string
          updated_at?: string
          year_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "sections_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sections_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      semesters: {
        Row: {
          academic_year_id: string
          created_at: string
          ends_on: string | null
          id: string
          name: string
          number: number
          starts_on: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name: string
          number: number
          starts_on?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          ends_on?: string | null
          id?: string
          name?: string
          number?: number
          starts_on?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "semesters_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          attendance_date: string
          check_in_time: string | null
          check_out_time: string | null
          created_at: string
          id: string
          notes: string | null
          profile_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at: string
        }
        Insert: {
          attendance_date: string
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          profile_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          check_in_time?: string | null
          check_out_time?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          profile_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_daily_checkins: {
        Row: {
          attendance_date: string
          checked_in_at: string
          id: string
          locked: boolean
          section_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Insert: {
          attendance_date?: string
          checked_in_at?: string
          id?: string
          locked?: boolean
          section_id: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
        }
        Update: {
          attendance_date?: string
          checked_in_at?: string
          id?: string
          locked?: boolean
          section_id?: string
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_daily_checkins_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_daily_checkins_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_enrollments: {
        Row: {
          academic_year_id: string
          id: string
          section_id: string
          status: string
          student_id: string
        }
        Insert: {
          academic_year_id: string
          id?: string
          section_id: string
          status?: string
          student_id: string
        }
        Update: {
          academic_year_id?: string
          id?: string
          section_id?: string
          status?: string
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_enrollments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_enrollments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_marks: {
        Row: {
          absent: boolean
          assessment_id: string
          created_at: string
          id: string
          locked: boolean
          mark: number | null
          student_id: string
          updated_at: string
        }
        Insert: {
          absent?: boolean
          assessment_id: string
          created_at?: string
          id?: string
          locked?: boolean
          mark?: number | null
          student_id: string
          updated_at?: string
        }
        Update: {
          absent?: boolean
          assessment_id?: string
          created_at?: string
          id?: string
          locked?: boolean
          mark?: number | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_marks_assessment_id_fkey"
            columns: ["assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_marks_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "student_profiles"
            referencedColumns: ["profile_id"]
          },
        ]
      }
      student_profiles: {
        Row: {
          admission_year: number
          created_at: string
          profile_id: string
          register_number: string
          updated_at: string
        }
        Insert: {
          admission_year: number
          created_at?: string
          profile_id: string
          register_number: string
          updated_at?: string
        }
        Update: {
          admission_year?: number
          created_at?: string
          profile_id?: string
          register_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_profiles_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subject_attendance_sessions: {
        Row: {
          attendance_date: string
          faculty_id: string
          finalized_at: string | null
          id: string
          locked: boolean
          section_id: string
          subject_id: string
          timetable_entry_id: string
        }
        Insert: {
          attendance_date: string
          faculty_id: string
          finalized_at?: string | null
          id?: string
          locked?: boolean
          section_id: string
          subject_id: string
          timetable_entry_id: string
        }
        Update: {
          attendance_date?: string
          faculty_id?: string
          finalized_at?: string | null
          id?: string
          locked?: boolean
          section_id?: string
          subject_id?: string
          timetable_entry_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subject_attendance_sessions_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "faculty_profiles"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "subject_attendance_sessions_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_attendance_sessions_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subject_attendance_sessions_timetable_entry_id_fkey"
            columns: ["timetable_entry_id"]
            isOneToOne: false
            referencedRelation: "timetable_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          credits: number
          department_id: string
          id: string
          is_lab: boolean
          name: string
          semester_id: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credits?: number
          department_id: string
          id?: string
          is_lab?: boolean
          name: string
          semester_id: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credits?: number
          department_id?: string
          id?: string
          is_lab?: boolean
          name?: string
          semester_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subjects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subjects_semester_id_fkey"
            columns: ["semester_id"]
            isOneToOne: false
            referencedRelation: "semesters"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable_entries: {
        Row: {
          created_at: string
          day_of_week: number
          ends_at: string
          faculty_id: string | null
          id: string
          lab: string | null
          lab_assistant_id: string | null
          period: number
          room: string
          section_id: string
          starts_at: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          day_of_week: number
          ends_at: string
          faculty_id?: string | null
          id?: string
          lab?: string | null
          lab_assistant_id?: string | null
          period: number
          room: string
          section_id: string
          starts_at: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          day_of_week?: number
          ends_at?: string
          faculty_id?: string | null
          id?: string
          lab?: string | null
          lab_assistant_id?: string | null
          period?: number
          room?: string
          section_id?: string
          starts_at?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_entries_faculty_id_fkey"
            columns: ["faculty_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_lab_assistant_id_fkey"
            columns: ["lab_assistant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_entries_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      years: {
        Row: {
          department_id: string
          id: string
          name: string
          number: number
        }
        Insert: {
          department_id: string
          id?: string
          name: string
          number: number
        }
        Update: {
          department_id?: string
          id?: string
          name?: string
          number?: number
        }
        Relationships: [
          {
            foreignKeyName: "years_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_attendance_correction:
        | {
            Args: {
              p_approve: boolean
              p_comments?: string
              p_correction_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_decision: Database["public"]["Enums"]["correction_decision"]
              p_request: string
            }
            Returns: undefined
          }
      approve_mark_correction:
        | {
            Args: {
              p_approve: boolean
              p_comments?: string
              p_correction_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_decision: Database["public"]["Enums"]["correction_decision"]
              p_request: string
            }
            Returns: undefined
          }
      assign_attachment_reviewers: {
        Args: {
          p_attachment_id: string
          p_faculty_reviewer_id: string
          p_jury_reviewer_id?: string
        }
        Returns: undefined
      }
      can_access_announcement: {
        Args: { audience: string; department: string; target: Json }
        Returns: boolean
      }
      can_manage_department: { Args: { department: string }; Returns: boolean }
      can_manage_project: { Args: { p_project_id: string }; Returns: boolean }
      can_review_request: { Args: { p_request_id: string }; Returns: boolean }
      can_send_direct_message: {
        Args: { p_recipient: string; p_sender: string }
        Returns: boolean
      }
      can_teach: {
        Args: { section: string; subject: string }
        Returns: boolean
      }
      can_update_own_profile: {
        Args: { candidate: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      can_view_document: {
        Args: { p_bucket: string; p_name: string; p_owner: string }
        Returns: boolean
      }
      can_view_section: { Args: { section: string }; Returns: boolean }
      can_view_student: { Args: { p_student: string }; Returns: boolean }
      current_department_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      finalize_assessment: {
        Args: { p_assessment: string }
        Returns: undefined
      }
      finalize_attendance: { Args: { p_session: string }; Returns: undefined }
      finalize_attendance_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      finalize_marks: { Args: { p_assessment_id: string }; Returns: undefined }
      has_role: {
        Args: { roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      is_class_teacher: { Args: { section: string }; Returns: boolean }
      is_department_admin: { Args: never; Returns: boolean }
      is_enrolled_in: { Args: { p_section: string }; Returns: boolean }
      is_hod: { Args: never; Returns: boolean }
      is_project_member: {
        Args: { p_profile_id?: string; p_project_id: string }
        Returns: boolean
      }
      is_subject_faculty: {
        Args: { p_section: string; p_subject: string }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      owns_document_path: { Args: { p_name: string }; Returns: boolean }
      register_attachment_replacement: {
        Args: {
          p_original_attachment_id: string
          p_replacement_attachment_id: string
        }
        Returns: undefined
      }
      require_active_faculty_reviewer: {
        Args: {
          p_department_id: string
          p_profile_id: string
          p_require_jury_eligibility?: boolean
        }
        Returns: undefined
      }
      review_attachment_as_faculty: {
        Args: {
          p_attachment_id: string
          p_comments?: string
          p_decision: Database["public"]["Enums"]["attachment_review_decision"]
        }
        Returns: undefined
      }
      review_attachment_as_jury: {
        Args: {
          p_attachment_id: string
          p_comments?: string
          p_decision: Database["public"]["Enums"]["attachment_review_decision"]
        }
        Returns: undefined
      }
      student_daily_check_in: {
        Args: { p_session_id: string }
        Returns: {
          check_in_time: string | null
          created_at: string
          id: string
          session_id: string
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
          verification_data: Json
        }
        SetofOptions: {
          from: "*"
          to: "attendance_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transition_request: {
        Args: {
          p_kind: string
          p_note?: string
          p_request: string
          p_status: Database["public"]["Enums"]["request_status"]
        }
        Returns: undefined
      }
      transition_request_status: {
        Args: {
          p_comments?: string
          p_new_status: Database["public"]["Enums"]["request_status"]
          p_request_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "super_admin" | "hod" | "faculty" | "lab_assistant" | "student"
      assessment_status: "draft" | "completed" | "finalized"
      assessment_type:
        | "internal_test"
        | "assignment"
        | "quiz"
        | "practical"
        | "model_exam"
      assignment_type:
        | "subject_faculty"
        | "class_teacher"
        | "faculty_guide"
        | "lab_faculty"
      attachment_entity:
        | "request"
        | "complaint"
        | "announcement"
        | "project"
        | "competition"
      attachment_review_decision: "approved" | "rejected"
      attachment_verification_status:
        | "pending_faculty_review"
        | "faculty_rejected"
        | "pending_jury_review"
        | "jury_rejected"
        | "verified"
        | "replaced"
        | "requires_jury_review"
      attendance_session_status: "draft" | "open" | "finalized" | "locked"
      attendance_session_type: "daily" | "subject" | "lab"
      attendance_status: "present" | "late" | "absent" | "pending_verification"
      correction_decision: "pending" | "approved" | "rejected"
      correction_status: "pending" | "approved" | "rejected"
      faculty_responsibility:
        | "subject_faculty"
        | "class_teacher"
        | "faculty_guide"
        | "lab_faculty"
        | "general_faculty"
      request_status:
        | "draft"
        | "submitted"
        | "class_teacher_approved"
        | "faculty_approved"
        | "faculty_rejected"
        | "hod_approved"
        | "hod_rejected"
        | "provisional_approved"
        | "certificate_pending"
        | "certificate_verified"
        | "finalized"
        | "rejected"
        | "cancelled"
        | "expired"
      request_type: "student_leave" | "staff_leave" | "gate_pass" | "od"
      user_status: "active" | "inactive" | "suspended"
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
      app_role: ["super_admin", "hod", "faculty", "lab_assistant", "student"],
      assessment_status: ["draft", "completed", "finalized"],
      assessment_type: [
        "internal_test",
        "assignment",
        "quiz",
        "practical",
        "model_exam",
      ],
      assignment_type: [
        "subject_faculty",
        "class_teacher",
        "faculty_guide",
        "lab_faculty",
      ],
      attachment_entity: [
        "request",
        "complaint",
        "announcement",
        "project",
        "competition",
      ],
      attachment_review_decision: ["approved", "rejected"],
      attachment_verification_status: [
        "pending_faculty_review",
        "faculty_rejected",
        "pending_jury_review",
        "jury_rejected",
        "verified",
        "replaced",
        "requires_jury_review",
      ],
      attendance_session_status: ["draft", "open", "finalized", "locked"],
      attendance_session_type: ["daily", "subject", "lab"],
      attendance_status: ["present", "late", "absent", "pending_verification"],
      correction_decision: ["pending", "approved", "rejected"],
      correction_status: ["pending", "approved", "rejected"],
      faculty_responsibility: [
        "subject_faculty",
        "class_teacher",
        "faculty_guide",
        "lab_faculty",
        "general_faculty",
      ],
      request_status: [
        "draft",
        "submitted",
        "class_teacher_approved",
        "faculty_approved",
        "faculty_rejected",
        "hod_approved",
        "hod_rejected",
        "provisional_approved",
        "certificate_pending",
        "certificate_verified",
        "finalized",
        "rejected",
        "cancelled",
        "expired",
      ],
      request_type: ["student_leave", "staff_leave", "gate_pass", "od"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
