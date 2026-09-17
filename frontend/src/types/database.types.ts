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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_attendance_correction: {
        Args: {
          p_approve: boolean
          p_comments?: string
          p_correction_id: string
        }
        Returns: undefined
      }
      approve_mark_correction: {
        Args: {
          p_approve: boolean
          p_comments?: string
          p_correction_id: string
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
      can_teach: {
        Args: { section: string; subject: string }
        Returns: boolean
      }
      can_update_own_profile: {
        Args: { candidate: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: boolean
      }
      can_view_section: { Args: { section: string }; Returns: boolean }
      current_department_id: { Args: never; Returns: string }
      current_profile_id: { Args: never; Returns: string }
      current_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      finalize_attendance_session: {
        Args: { p_session_id: string }
        Returns: undefined
      }
      finalize_marks: { Args: { p_assessment_id: string }; Returns: undefined }
      lock_attendance_for_section: {
        Args: { p_section_id: string }
        Returns: number
      }
      lock_marks_for_section: {
        Args: { p_section_id: string }
        Returns: number
      }
      unlock_attendance_for_section: {
        Args: { p_section_id: string }
        Returns: number
      }
      unlock_marks_for_section: {
        Args: { p_section_id: string }
        Returns: number
      }
      has_role: {
        Args: { roles: Database["public"]["Enums"]["app_role"][] }
        Returns: boolean
      }
      is_class_teacher: { Args: { section: string }; Returns: boolean }
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
      attendance_status: "present" | "late" | "absent"
      correction_status: "pending" | "approved" | "rejected"
      faculty_responsibility:
        | "subject_faculty"
        | "class_teacher"
        | "faculty_guide"
        | "lab_faculty"
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
      attendance_status: ["present", "late", "absent"],
      correction_status: ["pending", "approved", "rejected"],
      faculty_responsibility: [
        "subject_faculty",
        "class_teacher",
        "faculty_guide",
        "lab_faculty",
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
      ],
      request_type: ["student_leave", "staff_leave", "gate_pass", "od"],
      user_status: ["active", "inactive", "suspended"],
    },
  },
} as const
