import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getDefaultRouteForRole, resolveLoginEmail } from '@/lib/auth'
import { useAuth } from '@/modules/auth/useAuth'

import campusPhoto from '@/assets/branding/kcg-campus.jpg'
import departmentLogo from '@/assets/branding/aids-department-logo.png'
import collegeLogo from '@/assets/branding/kcg-college-logo.png'

// A User ID needs no shape validation beyond being present: it is a register number or a staff
// ID, and Supabase decides whether the account exists. Anything stricter would reject a valid
// account that simply does not look the way this form expects.
const loginSchema = z.object({ email: z.string().trim().min(1, 'Enter your User ID.'), password: z.string().min(1, 'Enter your password.') })
type LoginValues = z.infer<typeof loginSchema>
type LoginMode = 'staff' | 'student'

const modeContent: Record<LoginMode, { heading: string; description: string; emailPlaceholder: string; toggle: string }> = {
  staff: {
    heading: 'Staff Login',
    description: 'HOD, faculty, lab assistants and system administrators can sign in here.',
    emailPlaceholder: 'Enter your staff ID (e.g. divya_aids)',
    toggle: 'Student? Use student login',
  },
  student: {
    heading: 'Student Login',
    description: 'Students can sign in to access academic records and department services.',
    emailPlaceholder: 'Enter your register number',
    toggle: 'Staff member? Use staff login',
  },
}

/** Both marks are wide horizontal lockups, so they are sized by height and left to keep their
 *  own aspect ratio. Constraining them to a square box crushes them. */
function CollegeLogo({ className = 'h-14' }: { className?: string }) {
  return <img src={collegeLogo} alt="KCG College of Technology" className={`${className} w-auto object-contain`} />
}
function DepartmentLogo({ className = 'h-9' }: { className?: string }) {
  return <img src={departmentLogo} alt="Department of Artificial Intelligence and Data Science" className={`${className} w-auto object-contain`} />
}

export function LoginPage() {
  const { currentUser, login, isRestoring } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<LoginMode>('staff')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const { register, handleSubmit, setError, clearErrors, formState: { errors, isSubmitting } } = useForm<LoginValues>()
  const selectedMode = modeContent[mode]

  if (currentUser) return <Navigate replace to={getDefaultRouteForRole(currentUser.role)} />

  const switchMode = () => {
    setMode((current) => current === 'staff' ? 'student' : 'staff')
    setRecoveryMessage('')
    clearErrors('root')
  }

  const submit = async (values: LoginValues) => {
    const parsed = loginSchema.safeParse(values)
    if (!parsed.success) {
      parsed.error.issues.forEach((issue) => setError(issue.path[0] as keyof LoginValues, { message: issue.message }))
      return
    }
    try {
      const user = await login(resolveLoginEmail(values.email), values.password)
      navigate(getDefaultRouteForRole(user.role), { replace: true })
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Unable to sign in.' })
    }
  }

  return <main className="min-h-screen bg-[#f6f8fc] lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,36rem)] xl:grid-cols-[minmax(0,1.1fr)_minmax(0,40rem)]">
    {/* Campus panel. Desktop only — below lg the same photo runs as a banner above the card. */}
    <aside className="relative hidden lg:block">
      <img src={campusPhoto} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
      {/* A light brand tint over the whole photo keeps the campus visible, and a scrim weighted
          to the left carries the contrast for the white type. Darkening the photo uniformly
          enough to read the small caps line washed the campus out altogether. */}
      <div className="absolute inset-0 bg-[#09234b]/45" />
      <div className="absolute inset-0 bg-gradient-to-r from-[#04122a]/88 via-[#04122a]/55 to-transparent" />
      <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
        <span className="w-fit rounded-lg bg-white/95 px-4 py-3 shadow-lg"><CollegeLogo className="h-14" /></span>
        <div className="max-w-md">
          <h2 className="text-4xl font-bold leading-tight tracking-tight text-white xl:text-[2.75rem]">KCG College of Technology</h2>
          <p className="mt-4 text-lg leading-7 text-white/90">Department of Artificial Intelligence and Data Science</p>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-white/75">Department ERP · Odd Semester 2026&ndash;27</p>
        </div>
        <span className="w-fit rounded-lg bg-white/95 px-4 py-3 shadow-lg"><DepartmentLogo className="h-8" /></span>
      </div>
    </aside>

    <div className="grid place-items-center px-5 py-10 sm:px-9 sm:py-12">
    <div className="w-full max-w-[40rem] lg:max-w-[32rem]">
      {/* Mobile and tablet keep the photo as a compact banner so the branding is not desktop-only. */}
      <div className="relative mb-6 h-32 overflow-hidden rounded-xl sm:h-40 lg:hidden">
        <img src={campusPhoto} alt="" aria-hidden="true" className="absolute inset-0 size-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09234b]/85 to-[#09234b]/40" />
        <span className="absolute bottom-4 left-4 rounded-lg bg-white/95 px-3 py-2 shadow-md"><CollegeLogo className="h-9" /></span>
      </div>
      <header className="border-l-[5px] border-[#2450e8] pl-5">
        <h1 className="text-3xl font-bold tracking-tight text-[#09234b] sm:text-[2rem]">KCG College of Technology ERP</h1>
        <p className="mt-2 text-base leading-6 text-[#54709b]">AI&amp;DS Department ERP System — sign in to continue to your assigned workspace.</p>
      </header>

      <section className="mt-6 rounded-xl border border-[#dfe5ef] bg-white px-7 py-8 shadow-[0_16px_36px_rgb(21_49_91/0.09)] sm:px-8 sm:py-9">
        <h2 className="text-2xl font-bold text-[#09234b]">{selectedMode.heading}</h2>
        <p className="mt-1.5 max-w-md text-base leading-6 text-[#54709b]">{selectedMode.description}</p>

        <form className="mt-8 space-y-7" onSubmit={handleSubmit(submit)} noValidate>
          <div>
            <label className="block text-base font-semibold text-[#102b55]" htmlFor="login-email">{mode === 'student' ? 'Register Number' : 'Staff ID'}</label>
            <div className="relative mt-2"><Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8aa0bd]" aria-hidden="true" /><Input id="login-email" type="text" inputMode={mode === 'student' ? 'numeric' : 'text'} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder={selectedMode.emailPlaceholder} className="min-h-14 border-[#d9e3f3] bg-[#eaf1ff] pl-12 text-base placeholder:text-[#6e83a5] focus:bg-white" {...register('email', { onChange: () => clearErrors('root') })} /></div>
            {errors.email && <p className="mt-2 text-sm text-error">{errors.email.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3"><label className="block text-base font-semibold text-[#102b55]" htmlFor="login-password">Password</label><button type="button" className="text-sm font-semibold text-[#1248ef] hover:underline" onClick={() => setRecoveryMessage('Password recovery is currently handled through the department IT support team.')}>Forgot password?</button></div>
            <div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8aa0bd]" aria-hidden="true" /><Input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="min-h-14 border-[#d9e3f3] bg-[#eaf1ff] pl-12 pr-12 text-base focus:bg-white" {...register('password', { onChange: () => clearErrors('root') })} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[#6e83a5] hover:bg-white hover:text-[#102b55]" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}</button></div>
            {errors.password && <p className="mt-2 text-sm text-error">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between gap-3"><label className="flex cursor-pointer items-center gap-2 text-base text-[#425d85]"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-5 rounded border-[#8090a8] text-[#2450e8] focus:ring-[#2450e8]" />Remember me</label></div>
          {recoveryMessage && <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm leading-5 text-information">{recoveryMessage}</p>}
          {errors.root && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-error">{errors.root.message}</p>}
          <Button className="min-h-14 w-full rounded-md bg-[#2450e8] text-base hover:bg-[#153ad0]" type="submit" disabled={isSubmitting || isRestoring}>{isRestoring ? 'Restoring session…' : isSubmitting ? 'Signing in…' : 'Sign In'}</Button>
        </form>

        <button type="button" className="mt-7 w-full text-center text-base text-[#425d85] hover:text-[#1248ef]" onClick={switchMode}>{selectedMode.toggle.split('?')[0]}?<span className="ml-1 font-semibold text-[#1248ef]">{selectedMode.toggle.split('? ')[1]}</span></button>
        <div className="mt-7 flex justify-center border-t border-[#e6ebf3] pt-5">
          <DepartmentLogo className="h-9" />
        </div>
      </section>
    </div>
    </div>
  </main>
}
