import { ArrowLeft, ArrowRight, GraduationCap, Pencil, Plus, Power, RefreshCw, Search, ShieldCheck, Users, UserPlus, Wrench } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { ROUTE_PATHS } from '@/app/router/route-paths'
import { DataTable } from '@/components/common/DataTable'
import { Modal } from '@/components/common/Modal'
import { PageHeader } from '@/components/common/PageHeader'
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog'
import { EmptyState } from '@/components/feedback/EmptyState'
import { ErrorState } from '@/components/feedback/ErrorState'
import { LoadingState } from '@/components/feedback/LoadingState'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { USER_ROLES } from '@/constants/roles'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { findAiDsDepartment } from '@/lib/departments'
import { useAuth } from '@/modules/auth/useAuth'
import { academicRepository, type ManagedProfile, type ProfileManagementData } from '@/services/supabase/academicRepository'
import { userProvisioningService, type FacultyTeachingScopeInput, type ProvisionAccountInput } from '@/services/supabase/userProvisioningService'
import type { Database } from '@/types/database.types'

type AppRole = Database['public']['Enums']['app_role']
type Responsibility = Database['public']['Enums']['faculty_responsibility']
type CreateMode = 'user' | 'faculty'
type ProfileStatus = ManagedProfile['status']
type StatusFilter = 'all' | ProfileStatus
type UserCategoryKey = 'students' | 'faculty' | 'lab-assistants' | 'hods'

type UserCategory = {
  key: UserCategoryKey
  title: string
  description: string
  roles: AppRole[]
  icon: typeof Users
}

type FormState = {
  fullName: string
  userId: string
  dateOfBirth: string
  role: AppRole
  departmentId: string
  sectionId: string
  academicYearId: string
  studyYear: string
  phone: string
  designation: string
  responsibilities: Responsibility[]
}

const userCategories: UserCategory[] = [
  { key: 'students', title: 'Students', description: 'Manage student accounts, registration IDs, and sections.', roles: ['student'], icon: GraduationCap },
  { key: 'faculty', title: 'Faculty', description: 'Manage teaching faculty accounts and responsibilities.', roles: ['faculty'], icon: Users },
  { key: 'lab-assistants', title: 'Lab Assistants', description: 'Manage lab assistant accounts and lab access.', roles: ['lab_assistant'], icon: Wrench },
  { key: 'hods', title: 'HODs', description: 'Manage Head of Department accounts.', roles: ['hod'], icon: ShieldCheck },
]

const roles: Exclude<AppRole, 'super_admin'>[] = ['student', 'faculty', 'lab_assistant', 'hod']
const addUserRoles: Array<Extract<AppRole, 'student' | 'hod'>> = ['student', 'hod']
const facultyResponsibilities: Responsibility[] = ['subject_faculty', 'class_teacher', 'faculty_guide', 'lab_faculty']
const blankForm = (mode: CreateMode): FormState => ({ fullName: '', userId: '', dateOfBirth: '', role: mode === 'faculty' ? 'faculty' : 'student', departmentId: '', sectionId: '', academicYearId: '', studyYear: '', phone: '', designation: '', responsibilities: [] })
const findUserCategory = (key: string | undefined) => userCategories.find((category) => category.key === key)
const roleLabel = (role: string) => role === 'super_admin' ? 'Admin' : role.replaceAll('_', ' ')
const isFacultyDetailsRole = (role: AppRole) => role === 'faculty' || role === 'hod' || role === 'lab_assistant'
const isPermissionError = (message: string) => /permission|authorized|forbidden|row-level security|access denied/i.test(message)

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-1">{children}</div></label>
}

export function ProvisionForm({ data, mode, onClose, onCreated }: { data: ProfileManagementData; mode: CreateMode; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<FormState>(() => blankForm(mode))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const compatibleYears = data.academicYears.filter((year) => year.department_id === form.departmentId)
  const compatibleSections = data.sections.filter((section) => section.department_id === form.departmentId && section.academic_year_id === form.academicYearId)
  const set = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm((current) => ({ ...current, [key]: value }))
  const toggleResponsibility = (value: Responsibility) => setForm((current) => ({ ...current, responsibilities: current.responsibilities.includes(value) ? current.responsibilities.filter((item) => item !== value) : [...current.responsibilities, value] }))
  const submit = async () => {
    if (!form.fullName.trim() || !form.userId.trim() || !form.dateOfBirth || !form.departmentId) { setMessage('Complete the required account details.'); return }
    if (form.role === 'student' && (!form.sectionId || !form.academicYearId)) { setMessage('Student accounts require an academic year and section.'); return }
    setSaving(true); setMessage('')
    const input: ProvisionAccountInput = {
      fullName: form.fullName.trim(), userId: form.userId.trim(), dateOfBirth: form.dateOfBirth, role: form.role, departmentId: form.departmentId,
      ...(form.role === 'student' ? { sectionId: form.sectionId, academicYearId: form.academicYearId } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(isFacultyDetailsRole(form.role) && form.designation.trim() ? { designation: form.designation.trim() } : {}),
      ...(isFacultyDetailsRole(form.role) ? { responsibilities: form.responsibilities } : {}),
    }
    try { await userProvisioningService.createAccount(input); await onCreated(); onClose() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to provision the account.') } finally { setSaving(false) }
  }

  return <div className="space-y-4">
    <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-information">The initial permanent password is derived from the DOB in DDMMYYYY format. It is never displayed or stored in this application.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Full name"><Input value={form.fullName} onChange={(event) => set('fullName', event.target.value)} /></Field>
      <Field label={form.role === 'student' ? 'Register Number' : 'Faculty / Employee ID'}><Input value={form.userId} onChange={(event) => set('userId', event.target.value)} /></Field>
      <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} /></Field>
      {mode === 'user' && <Field label="Role"><Select value={form.role} onChange={(event) => { const role = event.target.value as AppRole; setForm((current) => ({ ...current, role, sectionId: role === 'student' ? current.sectionId : '', academicYearId: role === 'student' ? current.academicYearId : '', responsibilities: isFacultyDetailsRole(role) ? current.responsibilities : [] })) }}>{roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select></Field>}
      <Field label="Department"><Select value={form.departmentId} onChange={(event) => setForm((current) => ({ ...current, departmentId: event.target.value, sectionId: '', academicYearId: '' }))}><option value="">Select department</option>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></Field>
      <Field label="Phone"><Input type="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
      {form.role === 'student' && <><Field label="Academic year"><Select value={form.academicYearId} onChange={(event) => setForm((current) => ({ ...current, academicYearId: event.target.value, sectionId: '' }))}><option value="">Select academic year</option>{compatibleYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></Field><Field label="Section"><Select value={form.sectionId} onChange={(event) => set('sectionId', event.target.value)}><option value="">Select section</option>{compatibleSections.map((section) => <option key={section.id} value={section.id}>Year {section.year_number} · {section.name}</option>)}</Select></Field></>}
      {isFacultyDetailsRole(form.role) && <><Field label="Designation"><Input value={form.designation} onChange={(event) => set('designation', event.target.value)} /></Field><div><p className="text-sm font-semibold">Responsibilities</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{facultyResponsibilities.map((item) => <label key={item} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={form.responsibilities.includes(item)} onChange={() => toggleResponsibility(item)} /> {roleLabel(item)}</label>)}</div></div></>}
    </div>
    {message && <p className="text-sm text-error">{message}</p>}
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? 'Provisioning…' : mode === 'faculty' ? 'Add Faculty' : 'Add User'}</Button></div>
  </div>
}

// Kept as a module compatibility export; Add Faculty renders AddFacultyProvisionForm below.
void ProvisionForm

type FacultyFormState = {
  fullName: string
  facultyId: string
  dateOfBirth: string
  phone: string
  designation: string
  employmentType: string
  joiningDate: string
  academicYearId: string
  teachingYears: number[]
  sectionIds: string[]
  effectiveFrom: string
  effectiveTo: string
  isActive: boolean
  responsibilities: Responsibility[]
}

const blankFacultyForm = (): FacultyFormState => ({ fullName: '', facultyId: '', dateOfBirth: '', phone: '', designation: '', employmentType: '', joiningDate: '', academicYearId: '', teachingYears: [], sectionIds: [], effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '', isActive: true, responsibilities: [] })

function AddFacultyProvisionForm({ data, onClose, onCreated }: { data: ProfileManagementData; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<FacultyFormState>(blankFacultyForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [fullNameError, setFullNameError] = useState('')
  const aiDsDepartment = findAiDsDepartment(data.departments)
  const academicYears = data.academicYears.filter((year) => year.department_id === aiDsDepartment?.id)
  const availableSections = data.sections.filter((section) => section.department_id === aiDsDepartment?.id && section.academic_year_id === form.academicYearId && section.is_active && form.teachingYears.includes(section.year_number))
  const validFullName = (value: string) => /^[A-Za-z .'-]+$/.test(value.trim())
  const toggleTeachingYear = (year: number) => setForm((current) => {
    const teachingYears = current.teachingYears.includes(year) ? current.teachingYears.filter((item) => item !== year) : [...current.teachingYears, year]
    const allowedSections = new Set(data.sections.filter((section) => section.academic_year_id === current.academicYearId && teachingYears.includes(section.year_number)).map((section) => section.id))
    return { ...current, teachingYears, sectionIds: current.sectionIds.filter((sectionId) => allowedSections.has(sectionId)) }
  })
  const toggleSection = (sectionId: string) => setForm((current) => ({ ...current, sectionIds: current.sectionIds.includes(sectionId) ? current.sectionIds.filter((item) => item !== sectionId) : [...current.sectionIds, sectionId] }))
  const toggleResponsibility = (responsibility: Responsibility) => setForm((current) => ({ ...current, responsibilities: current.responsibilities.includes(responsibility) ? current.responsibilities.filter((item) => item !== responsibility) : [...current.responsibilities, responsibility] }))
  const submit = async () => {
    if (saving) return
    const fullName = form.fullName.trim()
    if (!validFullName(fullName)) { setFullNameError('Use letters, spaces, apostrophes, hyphens, and periods only.'); return }
    if (!aiDsDepartment) { setMessage('The AI-DS department is not configured.'); return }
    if (!fullName || !form.facultyId.trim() || !form.dateOfBirth || !form.phone.trim() || !form.designation.trim() || !form.employmentType || !form.joiningDate || !form.academicYearId || !form.teachingYears.length || !form.sectionIds.length || !form.effectiveFrom) { setMessage('Complete all required Faculty details and select at least one teaching scope.'); return }
    if (form.effectiveTo && form.effectiveTo < form.effectiveFrom) { setMessage('Effective To cannot be before Effective From.'); return }
    const scopes: FacultyTeachingScopeInput[] = form.sectionIds.map((sectionId) => {
      const section = data.sections.find((item) => item.id === sectionId)
      return { academicYearId: form.academicYearId, studyYear: section?.year_number ?? 0, sectionId, effectiveFrom: form.effectiveFrom, ...(form.effectiveTo ? { effectiveTo: form.effectiveTo } : {}), isActive: form.isActive }
    })
    if (scopes.some((scope) => scope.studyYear < 1 || scope.studyYear > 4)) { setMessage('Each selected Section must belong to Study Year 1, 2, 3, or 4.'); return }
    setSaving(true); setMessage('')
    try {
      await userProvisioningService.createAccount({ fullName, userId: form.facultyId.trim(), dateOfBirth: form.dateOfBirth, role: 'faculty', departmentId: aiDsDepartment.id, phone: form.phone.trim(), designation: form.designation.trim(), employmentType: form.employmentType, joiningDate: form.joiningDate, isActive: form.isActive, teachingScopes: scopes, responsibilities: form.responsibilities })
      await onCreated(); onClose()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to provision the Faculty account.') } finally { setSaving(false) }
  }

  return <div className="space-y-4">
    <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-information">AI-DS is assigned automatically. Faculty teaching scopes do not allocate subjects. The initial permanent password is derived from DOB in DDMMYYYY format and is never displayed or stored in this application.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Full Name"><Input aria-describedby={fullNameError ? 'add-faculty-full-name-error' : undefined} aria-invalid={Boolean(fullNameError)} value={form.fullName} onChange={(event) => { setForm((current) => ({ ...current, fullName: event.target.value })); if (fullNameError) setFullNameError('') }} /></Field>
      {fullNameError && <p id="add-faculty-full-name-error" className="-mt-3 text-sm text-error md:col-span-2">{fullNameError}</p>}
      <Field label="Faculty ID"><Input value={form.facultyId} onChange={(event) => setForm((current) => ({ ...current, facultyId: event.target.value }))} /></Field>
      <Field label="Date of Birth"><Input type="date" value={form.dateOfBirth} onChange={(event) => setForm((current) => ({ ...current, dateOfBirth: event.target.value }))} /></Field>
      <Field label="Phone Number"><Input type="tel" value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} /></Field>
      <Field label="Designation"><Input value={form.designation} onChange={(event) => setForm((current) => ({ ...current, designation: event.target.value }))} /></Field>
      <Field label="Employment Type"><Select value={form.employmentType} onChange={(event) => setForm((current) => ({ ...current, employmentType: event.target.value }))}><option value="">Select Employment Type</option><option value="full_time">Full-time</option><option value="part_time">Part-time</option><option value="contract">Contract</option><option value="visiting">Visiting</option></Select></Field>
      <Field label="Joining Date"><Input type="date" value={form.joiningDate} onChange={(event) => setForm((current) => ({ ...current, joiningDate: event.target.value, effectiveFrom: current.effectiveFrom || event.target.value }))} /></Field>
      <Field label="Academic Year"><Select value={form.academicYearId} onChange={(event) => setForm((current) => ({ ...current, academicYearId: event.target.value, sectionIds: [] }))}><option value="">Select Academic Year</option>{academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></Field>
      <Field label="Effective From"><Input type="date" value={form.effectiveFrom} onChange={(event) => setForm((current) => ({ ...current, effectiveFrom: event.target.value }))} /></Field>
      <Field label="Effective To (optional)"><Input type="date" value={form.effectiveTo} onChange={(event) => setForm((current) => ({ ...current, effectiveTo: event.target.value }))} /></Field>
      <div className="md:col-span-2"><p className="text-sm font-semibold">Teaching Years</p><div className="mt-2 flex flex-wrap gap-4">{[1, 2, 3, 4].map((year) => <label key={year} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={form.teachingYears.includes(year)} onChange={() => toggleTeachingYear(year)} /> Year {year}</label>)}</div></div>
      <div className="md:col-span-2"><p className="text-sm font-semibold">Assigned Sections</p><p className="mt-1 text-xs text-muted">Only active AI-DS Sections in the selected Academic Year and Teaching Years are available.</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{availableSections.map((section) => <label key={section.id} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={form.sectionIds.includes(section.id)} onChange={() => toggleSection(section.id)} /> Year {section.year_number} · {section.name}</label>)}{form.academicYearId && form.teachingYears.length > 0 && !availableSections.length && <p className="text-sm text-muted">No compatible active Sections are available.</p>}</div></div>
      <div className="md:col-span-2"><p className="text-sm font-semibold">Responsibilities</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{facultyResponsibilities.map((responsibility) => <label key={responsibility} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={form.responsibilities.includes(responsibility)} onChange={() => toggleResponsibility(responsibility)} /> {roleLabel(responsibility)}</label>)}</div></div>
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))} /> Active Status</label>
    </div>
    {message && <p role="alert" className="text-sm text-error">{message}</p>}
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? 'Creating Faculty…' : 'Add Faculty'}</Button></div>
  </div>
}

function AddUserProvisionForm({ data, onClose, onCreated }: { data: ProfileManagementData; onClose: () => void; onCreated: () => Promise<void> }) {
  const [form, setForm] = useState<FormState>(() => blankForm('user'))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [fullNameError, setFullNameError] = useState('')
  const aiDsDepartment = findAiDsDepartment(data.departments)
  const compatibleYears = data.academicYears.filter((year) => year.department_id === aiDsDepartment?.id)
  const compatibleSections = data.sections.filter((section) => section.department_id === aiDsDepartment?.id && section.academic_year_id === form.academicYearId && section.year_number === Number(form.studyYear))
  const set = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => setForm((current) => ({ ...current, [key]: value }))
  const validFullName = (value: string) => /^[A-Za-z .'-]+$/.test(value.trim())
  const submit = async () => {
    if (saving) return
    const fullName = form.fullName.trim()
    if (!validFullName(fullName)) { setFullNameError('Use letters, spaces, apostrophes, hyphens, and periods only.'); return }
    if (!aiDsDepartment) { setMessage('The AI-DS department is not configured.'); return }
    if (!fullName || !form.userId.trim() || !form.dateOfBirth) { setMessage('Complete the required account details.'); return }
    if (form.role === 'student' && (!form.academicYearId || !form.studyYear || !form.sectionId)) { setMessage('Students require an Academic Year, Study Year, and Section.'); return }
    setSaving(true); setMessage('')
    const input: ProvisionAccountInput = {
      fullName,
      userId: form.userId.trim(),
      dateOfBirth: form.dateOfBirth,
      role: form.role,
      departmentId: aiDsDepartment.id,
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.role === 'student' ? { sectionId: form.sectionId, academicYearId: form.academicYearId, studyYear: Number(form.studyYear) } : {}),
    }
    try { await userProvisioningService.createAccount(input); await onCreated(); onClose() } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to provision the account.') } finally { setSaving(false) }
  }

  return <div className="space-y-4">
    <p className="rounded-md bg-blue-50 px-3 py-2 text-sm text-information">AI-DS is assigned automatically. The initial permanent password is derived from DOB in DDMMYYYY format and is never displayed or stored in this application.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Full name"><Input aria-describedby={fullNameError ? 'add-user-full-name-error' : undefined} aria-invalid={Boolean(fullNameError)} value={form.fullName} onChange={(event) => { set('fullName', event.target.value); if (fullNameError) setFullNameError('') }} /></Field>
      {fullNameError && <p id="add-user-full-name-error" className="-mt-3 text-sm text-error md:col-span-2">{fullNameError}</p>}
      <Field label={form.role === 'student' ? 'Register Number' : 'Employee / User ID'}><Input value={form.userId} onChange={(event) => set('userId', event.target.value)} /></Field>
      <Field label="Date of birth"><Input type="date" value={form.dateOfBirth} onChange={(event) => set('dateOfBirth', event.target.value)} /></Field>
      <Field label="Role"><Select value={form.role} onChange={(event) => { const role = event.target.value as Extract<AppRole, 'student' | 'hod'>; setForm((current) => ({ ...current, role, academicYearId: role === 'student' ? current.academicYearId : '', studyYear: role === 'student' ? current.studyYear : '', sectionId: role === 'student' ? current.sectionId : '' })) }}>{addUserRoles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}</Select></Field>
      <Field label="Phone"><Input type="tel" value={form.phone} onChange={(event) => set('phone', event.target.value)} /></Field>
      {form.role === 'student' && <><Field label="Academic Year"><Select value={form.academicYearId} onChange={(event) => setForm((current) => ({ ...current, academicYearId: event.target.value, sectionId: '' }))}><option value="">Select Academic Year</option>{compatibleYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}</Select></Field><Field label="Study Year"><Select value={form.studyYear} onChange={(event) => setForm((current) => ({ ...current, studyYear: event.target.value, sectionId: '' }))}><option value="">Select Study Year</option>{[1, 2, 3, 4].map((year) => <option key={year} value={year}>{year}</option>)}</Select></Field><Field label="Section"><Select value={form.sectionId} onChange={(event) => set('sectionId', event.target.value)}><option value="">Select Section</option>{compatibleSections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</Select></Field></>}
    </div>
    {message && <p role="alert" className="text-sm text-error">{message}</p>}
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void submit()}>{saving ? 'Creating account…' : 'Add User'}</Button></div>
  </div>
}

function EditProfileForm({ profile, data, canManageProfileAdministration, onClose, onSaved }: { profile: ManagedProfile; data: ProfileManagementData; canManageProfileAdministration: boolean; onClose: () => void; onSaved: () => Promise<void> }) {
  const [fullName, setFullName] = useState(profile.full_name)
  const [departmentId, setDepartmentId] = useState(profile.department_id ?? '')
  const [sectionId, setSectionId] = useState(profile.section_id ?? '')
  const [phone, setPhone] = useState(profile.phone ?? '')
  const [designation, setDesignation] = useState(profile.designation ?? '')
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>(profile.faculty_responsibilities)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const sections = data.sections.filter((section) => section.department_id === departmentId)
  const toggle = (value: Responsibility) => setResponsibilities((items) => items.includes(value) ? items.filter((item) => item !== value) : [...items, value])
  const save = async () => {
    if (fullName.trim().length < 2) { setMessage('Enter a valid profile name.'); return }
    setSaving(true); setMessage('')
    try {
      await userProvisioningService.updateProfile(profile.id, canManageProfileAdministration ? { full_name: fullName.trim(), department_id: departmentId || null, section_id: profile.role === 'student' ? sectionId || null : null, phone: phone.trim() || null, designation: isFacultyDetailsRole(profile.role) ? designation.trim() || null : null, faculty_responsibilities: isFacultyDetailsRole(profile.role) ? responsibilities : [] } : { full_name: fullName.trim(), phone: phone.trim() || null })
      await onSaved(); onClose()
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Unable to update the profile.') } finally { setSaving(false) }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted">Register Number or Faculty / Employee ID and DOB are permanent account credentials and cannot be changed here.</p>
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Full name"><Input value={fullName} onChange={(event) => setFullName(event.target.value)} /></Field>
      {canManageProfileAdministration && <Field label="Department"><Select value={departmentId} onChange={(event) => { setDepartmentId(event.target.value); setSectionId('') }}><option value="">No department</option>{data.departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</Select></Field>}
      {canManageProfileAdministration && profile.role === 'student' && <Field label="Section"><Select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">No section</option>{sections.map((section) => <option key={section.id} value={section.id}>Year {section.year_number} · {section.name}</option>)}</Select></Field>}
      <Field label="Phone"><Input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} /></Field>
      {canManageProfileAdministration && isFacultyDetailsRole(profile.role) && <><Field label="Designation"><Input value={designation} onChange={(event) => setDesignation(event.target.value)} /></Field><div><p className="text-sm font-semibold">Responsibilities</p><div className="mt-2 grid gap-2 sm:grid-cols-2">{facultyResponsibilities.map((item) => <label key={item} className="flex items-center gap-2 text-sm font-normal"><input type="checkbox" checked={responsibilities.includes(item)} onChange={() => toggle(item)} /> {roleLabel(item)}</label>)}</div></div></>}
    </div>
    {message && <p className="text-sm text-error">{message}</p>}
    <div className="flex justify-end gap-3"><Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button><Button disabled={saving} onClick={() => void save()}>{saving ? 'Saving…' : 'Save profile'}</Button></div>
  </div>
}

function ProfileLoadError({ error, onRetry, category }: { error: string; onRetry: () => void; category?: UserCategory }) {
  const permissionError = isPermissionError(error)
  return <Card><div role="alert" className="space-y-4"><div><h2 className="font-semibold text-text">{permissionError ? 'You do not have permission to view these users' : `Unable to load ${category?.title.toLowerCase() ?? 'user profiles'}`}</h2><p className="mt-1 text-sm text-muted">{error}</p></div><Button variant="secondary" onClick={onRetry}><RefreshCw className="size-4" /> Retry</Button></div></Card>
}

function UserManagementActions({ canProvision, onCreate, onRefresh }: { canProvision: boolean; onCreate: (mode: CreateMode) => void; onRefresh: () => void }) {
  return <div className="flex flex-wrap gap-2">{canProvision && <><Button variant="secondary" onClick={() => onCreate('user')}><Plus className="size-4" /> Add User</Button><Button onClick={() => onCreate('faculty')}><UserPlus className="size-4" /> Add Faculty</Button></>}<Button variant="secondary" onClick={onRefresh}><RefreshCw className="size-4" /> Refresh</Button></div>
}

function UserManagementContent({ category }: { category?: UserCategory }) {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => academicRepository.loadProfileManagementData(), []))
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'all' | AppRole>('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const [editing, setEditing] = useState<ManagedProfile | null>(null)
  const [statusTarget, setStatusTarget] = useState<ManagedProfile | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; tone: 'success' | 'error' } | null>(null)
  const canManageProfileAdministration = currentUser?.role === USER_ROLES.superAdmin
  const canProvision = canManageProfileAdministration && currentUser.status === 'active'
  const users = useMemo(() => (resource.data?.profiles ?? []).filter((user) => {
    if (!canManageProfileAdministration && user.id !== currentUser?.id) return false
    const matchesCategory = category ? category.roles.includes(user.role) : role === 'all' || user.role === role
    const matchesStatus = !category || status === 'all' || user.status === status
    return matchesCategory && matchesStatus && `${user.full_name} ${user.employee_or_register_number ?? ''}`.toLowerCase().includes(query.toLowerCase())
  }), [canManageProfileAdministration, category, currentUser?.id, query, resource.data?.profiles, role, status])

  if (resource.isLoading) return <LoadingState label={`Loading ${category?.title.toLowerCase() ?? 'user profiles'}…`} />
  if (resource.error) return <ProfileLoadError error={resource.error} onRetry={() => void resource.reload()} category={category} />
  const data = resource.data
  if (!data) return null
  const department = (id: string | null) => data.departments.find((item) => item.id === id)?.name ?? '—'
  const headerTitle = category ? category.title : canManageProfileAdministration ? 'User management' : 'My profile'
  const headerDescription = category ? `Manage ${category.title.toLowerCase()} accounts by registration or employee ID.` : canManageProfileAdministration ? 'Provision and manage ERP accounts. Credentials use the permanent DOB-derived password policy.' : 'View and update your own profile details.'
  const changeActive = async () => {
    if (!statusTarget) return
    if (currentUser?.role === USER_ROLES.superAdmin && statusTarget.id === currentUser.id) {
      setStatusTarget(null)
      setMessage({ text: 'You cannot deactivate your own Admin account.', tone: 'error' })
      return
    }
    setStatusSaving(true); setMessage(null)
    try {
      await userProvisioningService.setAccountActive(statusTarget.id, statusTarget.status !== 'active')
      await resource.reload()
      setStatusTarget(null)
      setMessage({ text: `Account ${statusTarget.status === 'active' ? 'deactivated' : 'activated'}.`, tone: 'success' })
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : 'Unable to update the account status.', tone: 'error' }) } finally { setStatusSaving(false) }
  }

  return <div className="space-y-6">
    <PageHeader title={headerTitle} description={headerDescription} actions={<div className="flex flex-wrap gap-2">{category && <Link to={ROUTE_PATHS.superAdminUsers} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text transition-colors hover:bg-background"><ArrowLeft className="size-4" /> All categories</Link>}<UserManagementActions canProvision={canProvision} onCreate={setCreateMode} onRefresh={() => void resource.reload()} /></div>} />
    {message && <p role="status" className={`text-sm ${message.tone === 'success' ? 'text-success' : 'text-error'}`}>{message.text}</p>}
    <Card>
      <div className="grid gap-3 md:grid-cols-[1fr_12rem]">
        <label className="relative"><span className="sr-only">Search profiles</span><Search className="absolute left-3 top-3 size-4 text-muted" /><Input className="pl-9" placeholder="Search name or Register / Faculty ID" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        {category ? <Select aria-label="Filter profiles by status" value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="suspended">Suspended</option></Select> : <Select aria-label="Filter profiles by role" value={role} onChange={(event) => setRole(event.target.value as 'all' | AppRole)}><option value="all">All roles</option>{roles.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</Select>}
      </div>
      <div className="mt-5"><DataTable rows={users} empty={<EmptyState title={query || status !== 'all' ? 'No matching profiles' : `No ${category?.title.toLowerCase() ?? 'profiles'} yet`} />} columns={[
        { header: 'Profile', render: (user) => <p className="font-semibold">{user.full_name}</p> },
        { header: 'Role / ID', render: (user) => <div><p>{roleLabel(user.role)}</p><p className="text-xs text-muted">{user.employee_or_register_number ?? 'Not assigned'}</p></div> },
        { header: 'Department', render: (user) => department(user.department_id) },
        { header: 'Status', render: (user) => <Badge tone={user.status === 'active' ? 'success' : user.status === 'suspended' ? 'warning' : 'muted'}>{user.status}</Badge> },
        { header: 'Actions', render: (user) => {
          const isCurrentAdmin = currentUser?.role === USER_ROLES.superAdmin && user.id === currentUser.id
          const canEdit = canManageProfileAdministration || user.id === currentUser?.id
          const canChangeStatus = canManageProfileAdministration
          const action = user.status === 'active' ? 'Deactivate' : 'Activate'
          const actionLabel = isCurrentAdmin ? 'You cannot deactivate your own Admin account' : `${action} ${user.full_name}`
          return <div className="flex gap-1">{canEdit && <Button aria-label={`Edit ${user.full_name}`} title={`Edit ${user.full_name}`} className="min-h-8 px-2" variant="ghost" onClick={() => setEditing(user)}><Pencil className="size-4" /></Button>}{canChangeStatus && <Button aria-label={actionLabel} title={actionLabel} className="min-h-8 px-2" variant="ghost" disabled={statusSaving || isCurrentAdmin} onClick={() => setStatusTarget(user)}><Power className="size-4" /></Button>}</div>
        } },
      ]} /></div>
    </Card>
    <Modal isOpen={createMode !== null} title={createMode === 'faculty' ? 'Add Faculty' : 'Add User'} onClose={() => setCreateMode(null)}>{createMode === 'user' ? <AddUserProvisionForm data={data} onClose={() => setCreateMode(null)} onCreated={resource.reload} /> : createMode === 'faculty' ? <AddFacultyProvisionForm data={data} onClose={() => setCreateMode(null)} onCreated={resource.reload} /> : null}</Modal>
    <Modal isOpen={Boolean(editing)} title="Edit profile" onClose={() => setEditing(null)}>{editing && <EditProfileForm profile={editing} data={data} canManageProfileAdministration={canManageProfileAdministration} onClose={() => setEditing(null)} onSaved={resource.reload} />}</Modal>
    <ConfirmDialog isOpen={Boolean(statusTarget)} title={statusTarget?.status === 'active' ? 'Deactivate account?' : 'Activate account?'} description={statusTarget?.status === 'active' ? 'The user will be prevented from signing in until reactivated.' : 'The user will be permitted to sign in immediately.'} confirmLabel={statusTarget?.status === 'active' ? 'Deactivate' : 'Activate'} onCancel={() => setStatusTarget(null)} onConfirm={() => void changeActive()} />
  </div>
}

export function UserManagementPage() {
  const { currentUser } = useAuth()
  if (currentUser?.role !== USER_ROLES.superAdmin) return <UserManagementContent />
  return <UserCategoryOverview />
}

function UserCategoryOverview() {
  const { currentUser } = useAuth()
  const resource = useAsyncResource(useCallback(() => academicRepository.loadProfileManagementData(), []))
  const [createMode, setCreateMode] = useState<CreateMode | null>(null)
  const canProvision = currentUser?.role === USER_ROLES.superAdmin && currentUser.status === 'active'
  if (resource.isLoading) return <LoadingState label="Loading user categories…" />
  if (resource.error) return <ProfileLoadError error={resource.error} onRetry={() => void resource.reload()} />
  const data = resource.data
  if (!data) return null

  return <div className="space-y-6">
    <PageHeader title="User management" description="Select a category to view and manage its ERP accounts." actions={<UserManagementActions canProvision={canProvision} onCreate={setCreateMode} onRefresh={() => void resource.reload()} />} />
    <div className="grid gap-4 sm:grid-cols-2">
      {userCategories.map((category) => {
        const Icon = category.icon
        const count = data.profiles.filter((profile) => category.roles.includes(profile.role)).length
        return <Link key={category.key} to={ROUTE_PATHS.superAdminUserCategory.replace(':category', category.key)} className="group rounded-xl border border-border bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-secondary hover:shadow-md">
          <div className="flex items-start justify-between gap-4"><span className="grid size-11 place-items-center rounded-lg bg-primary/10 text-primary"><Icon aria-hidden="true" className="size-5" /></span><ArrowRight aria-hidden="true" className="mt-1 size-5 text-muted transition-transform group-hover:translate-x-1 group-hover:text-secondary" /></div>
          <h2 className="mt-5 text-lg font-bold text-text">{category.title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{category.description}</p>
          <p className="mt-5 text-sm font-semibold text-secondary">{count} {count === 1 ? 'user' : 'users'}</p>
        </Link>
      })}
    </div>
    <Modal isOpen={createMode !== null} title={createMode === 'faculty' ? 'Add Faculty' : 'Add User'} onClose={() => setCreateMode(null)}>{createMode === 'user' ? <AddUserProvisionForm data={data} onClose={() => setCreateMode(null)} onCreated={resource.reload} /> : createMode === 'faculty' ? <AddFacultyProvisionForm data={data} onClose={() => setCreateMode(null)} onCreated={resource.reload} /> : null}</Modal>
  </div>
}

export function UserCategoryPage() {
  const { category: categoryKey } = useParams()
  const category = findUserCategory(categoryKey)
  if (!category) return <ErrorState title="User category not found" description="Choose one of the available user categories." />
  return <UserManagementContent category={category} />
}
