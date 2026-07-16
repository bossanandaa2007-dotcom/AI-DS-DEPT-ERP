import { supabase } from '@/lib/supabase'
import type { Database } from '@/types/database.types'

type Table<Name extends keyof Database['public']['Tables']> = Database['public']['Tables'][Name]
type Row<Name extends keyof Database['public']['Tables']> = Table<Name>['Row']
type Insert<Name extends keyof Database['public']['Tables']> = Table<Name>['Insert']
type Update<Name extends keyof Database['public']['Tables']> = Table<Name>['Update']

export type AcademicData = {
  departments: Row<'departments'>[]; academicYears: Row<'academic_years'>[]; semesters: Row<'semesters'>[]; sections: Row<'sections'>[]; subjects: Row<'subjects'>[]; profiles: Row<'profiles'>[]; enrollments: Row<'enrollments'>[]; assignments: Row<'faculty_assignments'>[]; projects: Row<'projects'>[]; timetable: Row<'timetable_entries'>[]
}

const client = () => { if (!supabase) throw new Error('Supabase is not configured.'); return supabase }
const fail = (error: { message: string; code?: string } | null, fallback: string) => {
  if (!error) return
  if (error.code === '23505' || /duplicate|unique constraint/i.test(error.message)) throw new Error('A matching academic record already exists.')
  if (/policy|permission|authorized/i.test(error.message)) throw new Error('You are not authorized to perform this academic action.')
  throw new Error(error.message || fallback)
}
const datesValid = (starts: string | null | undefined, ends: string | null | undefined) => !starts || !ends || ends > starts

async function list<Name extends keyof Database['public']['Tables']>(table: Name): Promise<Row<Name>[]> {
  const { data, error } = await client().from(table).select('*').order('created_at' as never)
  fail(error, `Unable to load ${table}.`)
  return data as unknown as Row<Name>[]
}
async function create<Name extends keyof Database['public']['Tables']>(table: Name, value: Insert<Name>): Promise<Row<Name>> {
  const { data, error } = await client().from(table).insert(value as never).select().single()
  fail(error, `Unable to create ${table}.`)
  return data as unknown as Row<Name>
}
async function update<Name extends keyof Database['public']['Tables']>(table: Name, id: string, value: Update<Name>): Promise<Row<Name>> {
  const { data, error } = await client().from(table).update(value as never).eq('id' as never, id).select().single()
  fail(error, `Unable to update ${table}.`)
  return data as unknown as Row<Name>
}
async function remove<Name extends keyof Database['public']['Tables']>(table: Name, id: string) { const { error } = await client().from(table).delete().eq('id' as never, id); fail(error, `Unable to remove ${table}.`) }

export const academicRepository = {
  listDepartments: () => list('departments'), createDepartment: (value: Insert<'departments'>) => create('departments', value), updateDepartment: (id: string, value: Update<'departments'>) => update('departments', id, value),
  listAcademicYears: () => list('academic_years'),
  createAcademicYear: (value: Insert<'academic_years'>) => { if (!datesValid(value.starts_on, value.ends_on)) throw new Error('Academic year end date must be after its start date.'); return create('academic_years', value) },
  updateAcademicYear: (id: string, value: Update<'academic_years'>) => { if (!datesValid(value.starts_on, value.ends_on)) throw new Error('Academic year end date must be after its start date.'); return update('academic_years', id, value) },
  async setActiveAcademicYear(id: string, departmentId: string) { const { error: clearError } = await client().from('academic_years').update({ is_active: false }).eq('department_id', departmentId).eq('is_active', true); fail(clearError, 'Unable to change the active academic year.'); return update('academic_years', id, { is_active: true }) },
  deactivateAcademicYear: (id: string) => update('academic_years', id, { is_active: false }),
  listSemesters: () => list('semesters'), createSemester: (value: Insert<'semesters'>) => { if (!datesValid(value.starts_on, value.ends_on)) throw new Error('Semester end date must be after its start date.'); return create('semesters', value) }, updateSemester: (id: string, value: Update<'semesters'>) => { if (!datesValid(value.starts_on, value.ends_on)) throw new Error('Semester end date must be after its start date.'); return update('semesters', id, value) },
  listSections: () => list('sections'),
  async createSection(value: Insert<'sections'>) {
    const [year, semester] = await Promise.all([
      client().from('academic_years').select('department_id').eq('id', value.academic_year_id).maybeSingle(),
      client().from('semesters').select('academic_year_id').eq('id', value.semester_id).maybeSingle(),
    ])
    fail(year.error, 'Unable to validate the academic year.'); fail(semester.error, 'Unable to validate the semester.')
    if (!year.data || !semester.data || year.data.department_id !== value.department_id || semester.data.academic_year_id !== value.academic_year_id) throw new Error('Department, academic year, and semester are not compatible.')
    return create('sections', value)
  },
  async updateSection(id: string, value: Update<'sections'>) {
    const current = (await list('sections')).find((row) => row.id === id)
    if (!current) throw new Error('Section was not found.')
    const candidate = { ...current, ...value }
    const [year, semester] = await Promise.all([
      client().from('academic_years').select('department_id').eq('id', candidate.academic_year_id).maybeSingle(),
      client().from('semesters').select('academic_year_id').eq('id', candidate.semester_id).maybeSingle(),
    ])
    fail(year.error, 'Unable to validate the academic year.'); fail(semester.error, 'Unable to validate the semester.')
    if (!year.data || !semester.data || year.data.department_id !== candidate.department_id || semester.data.academic_year_id !== candidate.academic_year_id) throw new Error('Department, academic year, and semester are not compatible.')
    return update('sections', id, value)
  },
  listSubjects: () => list('subjects'),
  async createSubject(value: Insert<'subjects'>) {
    const { data: semester, error } = await client().from('semesters').select('academic_year_id').eq('id', value.semester_id).maybeSingle()
    fail(error, 'Unable to validate the subject semester.')
    const year = semester ? (await list('academic_years')).find((row) => row.id === semester.academic_year_id) : null
    if (!year || year.department_id !== value.department_id) throw new Error('Subject department and semester are not compatible.')
    return create('subjects', value)
  },
  async updateSubject(id: string, value: Update<'subjects'>) {
    const current = (await list('subjects')).find((row) => row.id === id)
    if (!current) throw new Error('Subject was not found.')
    const candidate = { ...current, ...value }
    const semester = (await list('semesters')).find((row) => row.id === candidate.semester_id)
    const year = semester ? (await list('academic_years')).find((row) => row.id === semester.academic_year_id) : null
    if (!year || year.department_id !== candidate.department_id) throw new Error('Subject department and semester are not compatible.')
    return update('subjects', id, value)
  },
  listProfiles: () => list('profiles'), listStudents: async () => (await list('profiles')).filter((profile) => profile.role === 'student'), listFaculty: async () => (await list('profiles')).filter((profile) => profile.role === 'faculty'), updateProfile: (id: string, value: Update<'profiles'>) => update('profiles', id, value), setProfileActiveStatus: (id: string, status: Database['public']['Enums']['user_status']) => update('profiles', id, { status }),
  listEnrollments: () => list('enrollments'),
  async createEnrollment(value: Insert<'enrollments'>) {
    const [profiles, sections, enrollments] = await Promise.all([list('profiles'), list('sections'), list('enrollments')])
    const student = profiles.find((profile) => profile.id === value.student_id)
    const section = sections.find((item) => item.id === value.section_id)
    if (!student || student.role !== 'student' || student.status !== 'active') throw new Error('Select an active student.')
    if (!section || section.academic_year_id !== value.academic_year_id) throw new Error('The selected section does not match the academic year.')
    if (student.department_id && student.department_id !== section.department_id) throw new Error('Student and section must belong to the same department.')
    if (enrollments.some((entry) => entry.student_id === value.student_id && entry.academic_year_id === value.academic_year_id && entry.status === 'active')) throw new Error('This student already has an active enrollment for the academic year.')
    return create('enrollments', value)
  },
  async updateEnrollment(id: string, value: Update<'enrollments'>) {
    const enrollments = await list('enrollments')
    const current = enrollments.find((entry) => entry.id === id)
    if (!current) throw new Error('Enrollment was not found.')
    const candidate = { ...current, ...value }
    const section = (await list('sections')).find((item) => item.id === candidate.section_id)
    if (!section || section.academic_year_id !== candidate.academic_year_id) throw new Error('The selected section does not match the academic year.')
    const student = (await list('profiles')).find((profile) => profile.id === candidate.student_id)
    if (!student || student.role !== 'student' || (candidate.status === 'active' && student.status !== 'active')) throw new Error('Select an active student.')
    if (student.department_id && student.department_id !== section.department_id) throw new Error('Student and section must belong to the same department.')
    if (candidate.status === 'active' && enrollments.some((entry) => entry.id !== id && entry.student_id === candidate.student_id && entry.academic_year_id === candidate.academic_year_id && entry.status === 'active')) throw new Error('This student already has an active enrollment for the academic year.')
    return update('enrollments', id, value)
  },
  deactivateEnrollment: (id: string) => update('enrollments', id, { status: 'inactive' }),
  removeEnrollment: (id: string) => remove('enrollments', id),
  listFacultyAssignments: () => list('faculty_assignments'),
  async createFacultyAssignment(value: Insert<'faculty_assignments'>) {
    const [profiles, sections, subjects, assignments] = await Promise.all([list('profiles'), list('sections'), list('subjects'), list('faculty_assignments')])
    const faculty = profiles.find((profile) => profile.id === value.faculty_id)
    const section = sections.find((item) => item.id === value.section_id)
    const subject = value.subject_id ? subjects.find((item) => item.id === value.subject_id) : null
    if (!faculty || faculty.role !== 'faculty' || faculty.status !== 'active') throw new Error('Select an active Faculty member.')
    if (!section || section.academic_year_id !== value.academic_year_id || section.semester_id !== value.semester_id) throw new Error('The assignment academic context is invalid.')
    if (faculty.department_id !== section.department_id) throw new Error('Faculty and section must belong to the same department.')
    if (subject && (subject.semester_id !== section.semester_id || subject.department_id !== section.department_id)) throw new Error('Subject and section must share the same semester and department.')
    if (assignments.some((item) => item.is_active && item.faculty_id === value.faculty_id && item.subject_id === (value.subject_id ?? null) && item.section_id === value.section_id && item.assignment_type === value.assignment_type)) throw new Error('This active Faculty assignment already exists.')
    return create('faculty_assignments', value)
  },
  async updateFacultyAssignment(id: string, value: Update<'faculty_assignments'>) {
    const [assignments, profiles, sections, subjects] = await Promise.all([list('faculty_assignments'), list('profiles'), list('sections'), list('subjects')])
    const current = assignments.find((item) => item.id === id)
    if (!current) throw new Error('Faculty assignment was not found.')
    const candidate = { ...current, ...value }
    const faculty = profiles.find((profile) => profile.id === candidate.faculty_id)
    const section = sections.find((item) => item.id === candidate.section_id)
    const subject = candidate.subject_id ? subjects.find((item) => item.id === candidate.subject_id) : null
    if (!faculty || faculty.role !== 'faculty' || faculty.status !== 'active') throw new Error('Select an active Faculty member.')
    if (!section || faculty.department_id !== section.department_id || section.academic_year_id !== candidate.academic_year_id || section.semester_id !== candidate.semester_id) throw new Error('Faculty and section must share a valid department and academic context.')
    if (subject && (subject.department_id !== section.department_id || subject.semester_id !== section.semester_id)) throw new Error('Subject and section must share the same semester and department.')
    if (assignments.some((item) => item.id !== id && item.is_active && item.faculty_id === candidate.faculty_id && item.subject_id === candidate.subject_id && item.section_id === candidate.section_id && item.assignment_type === candidate.assignment_type)) throw new Error('This active Faculty assignment already exists.')
    return update('faculty_assignments', id, value)
  },
  deactivateFacultyAssignment: (id: string) => update('faculty_assignments', id, { is_active: false }),
  removeFacultyAssignment: (id: string) => remove('faculty_assignments', id),
  async assignClassTeacher(value: Omit<Insert<'faculty_assignments'>, 'assignment_type' | 'subject_id'>) {
    const assignments = await list('faculty_assignments')
    const current = assignments.find((item) => item.is_active && item.assignment_type === 'class_teacher' && item.section_id === value.section_id && item.academic_year_id === value.academic_year_id)
    if (current?.faculty_id === value.faculty_id) throw new Error('This Faculty member is already the active Class Teacher.')
    if (current) await update('faculty_assignments', current.id, { is_active: false })
    try { return await this.createFacultyAssignment({ ...value, assignment_type: 'class_teacher', subject_id: null }) } catch (error) { if (current) await update('faculty_assignments', current.id, { is_active: true }); throw error }
  },
  listProjects: () => list('projects'),
  async setProjectFacultyGuide(projectId: string, facultyId: string | null) {
    if (facultyId) {
      const [project, faculty] = await Promise.all([
        client().from('projects').select('*').eq('id', projectId).maybeSingle(),
        client().from('profiles').select('*').eq('id', facultyId).maybeSingle(),
      ])
      fail(project.error, 'Unable to load the project.')
      fail(faculty.error, 'Unable to load the Faculty profile.')
      if (!project.data || !faculty.data || faculty.data.role !== 'faculty' || faculty.data.status !== 'active' || faculty.data.department_id !== project.data.department_id) throw new Error('Select an active Faculty guide from the project department.')
    }
    return update('projects', projectId, { faculty_guide_id: facultyId })
  },
  async setFacultyJuryEligibility(facultyId: string, isEligible: boolean) {
    const [profileResult, assignmentsResult] = await Promise.all([
      client().from('profiles').select('role,status').eq('id', facultyId).maybeSingle(),
      client().from('faculty_assignments').select('id').eq('faculty_id', facultyId).eq('is_active', true),
    ])
    fail(profileResult.error, 'Unable to load the Faculty profile.')
    fail(assignmentsResult.error, 'Unable to load Faculty assignments.')
    if (!profileResult.data || profileResult.data.role !== 'faculty') throw new Error('Only Faculty profiles can be Jury eligible.')
    if (isEligible && profileResult.data.status !== 'active') throw new Error('Inactive Faculty cannot be Jury eligible.')
    if (isEligible && !(assignmentsResult.data ?? []).length) throw new Error('Faculty must have an active assignment before Jury eligibility can be enabled.')
    const { error } = await client().from('faculty_assignments').update({ is_jury_eligible: isEligible }).eq('faculty_id', facultyId).eq('is_active', true)
    fail(error, 'Unable to update Jury eligibility.')
  },
  listTimetableEntries: () => list('timetable_entries'),
  async validateTimetableConflicts(value: Pick<Row<'timetable_entries'>, 'section_id' | 'faculty_id' | 'day_of_week' | 'starts_at' | 'ends_at'>, excludingId?: string) {
    if (value.ends_at <= value.starts_at) throw new Error('End time must be after start time.')
    const entries = await list('timetable_entries')
    const overlaps = (entry: Row<'timetable_entries'>) => entry.day_of_week === value.day_of_week && entry.starts_at < value.ends_at && entry.ends_at > value.starts_at && entry.id !== excludingId
    if (entries.some((entry) => entry.section_id === value.section_id && overlaps(entry))) throw new Error('This section already has an overlapping timetable entry.')
    if (value.faculty_id && entries.some((entry) => entry.faculty_id === value.faculty_id && overlaps(entry))) throw new Error('This Faculty member already has an overlapping timetable entry.')
  },
  async createTimetableEntry(value: Insert<'timetable_entries'>) { await this.validateTimetableConflicts({ ...value, faculty_id: value.faculty_id ?? null }); return create('timetable_entries', value) },
  async updateTimetableEntry(id: string, value: Update<'timetable_entries'>) { const existing = (await list('timetable_entries')).find((entry) => entry.id === id); if (!existing) throw new Error('Timetable entry was not found.'); const candidate = { ...existing, ...value }; await this.validateTimetableConflicts(candidate, id); return update('timetable_entries', id, value) }, deleteTimetableEntry: (id: string) => remove('timetable_entries', id),
  async loadAcademicData(): Promise<AcademicData> { const [departments, academicYears, semesters, sections, subjects, profiles, enrollments, assignments, projects, timetable] = await Promise.all([list('departments'), list('academic_years'), list('semesters'), list('sections'), list('subjects'), list('profiles'), list('enrollments'), list('faculty_assignments'), list('projects'), list('timetable_entries')]); return { departments, academicYears, semesters, sections, subjects, profiles, enrollments, assignments, projects, timetable } },
}
