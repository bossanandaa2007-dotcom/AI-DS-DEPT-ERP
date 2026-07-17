import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getDefaultRouteForRole } from '@/lib/auth'
import { useAuth } from '@/modules/auth/useAuth'

const brandingAssets = import.meta.glob('../../assets/branding/*', { eager: true, import: 'default', query: '?url' }) as Record<string, string>
const collegeLogo = brandingAssets['../../assets/branding/kcg-college-logo.png']
const departmentLogo = brandingAssets['../../assets/branding/aids-department-logo.png']
const loginSchema = z.object({ email: z.string().email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') })
type LoginValues = z.infer<typeof loginSchema>
type LoginMode = 'staff' | 'student'

const modeContent: Record<LoginMode, { heading: string; description: string; emailPlaceholder: string; toggle: string }> = {
  staff: {
    heading: 'Staff Login',
    description: 'HOD, faculty, lab assistants and system administrators can sign in here.',
    emailPlaceholder: 'Enter your institutional staff email',
    toggle: 'Student? Use student login',
  },
  student: {
    heading: 'Student Login',
    description: 'Students can sign in to access academic records and department services.',
    emailPlaceholder: 'Enter your student email address',
    toggle: 'Staff member? Use staff login',
  },
}

function CollegeMark() {
  return <div className="flex size-[4.5rem] items-center justify-center rounded-md border border-slate-200 bg-white p-1 shadow-sm"><div className="flex size-full items-center justify-center rounded bg-primary text-center text-[11px] font-black leading-3 text-white">KCG<br />CT</div></div>
}

export function LoginPage() {
  const { currentUser, login, isRestoring, restorationError, retrySessionRestore } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
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
      const user = await login(values.email, values.password, mode)
      const defaultRoute = getDefaultRouteForRole(user.role)
      const requestedPath = typeof location.state === 'object' && location.state && 'from' in location.state && typeof location.state.from === 'string' ? location.state.from : null
      navigate(requestedPath?.startsWith(defaultRoute) ? requestedPath : defaultRoute, { replace: true })
    } catch (error) {
      setError('root', { message: error instanceof Error ? error.message : 'Unable to sign in.' })
    }
  }

  return <main className="grid min-h-screen place-items-center bg-[#f6f8fc] px-5 py-10 sm:px-9 sm:py-12">
    <div className="w-full max-w-[40rem]">
      <header className="border-l-[5px] border-[#2450e8] pl-5">
        {collegeLogo ? <img src={collegeLogo} alt="KCG College of Technology logo" className="size-[4.5rem] rounded-md border border-slate-200 bg-white object-contain p-1 shadow-sm" /> : <CollegeMark />}
        <h1 className="mt-5 text-3xl font-bold tracking-tight text-[#09234b] sm:text-[2rem]">KCG College of Technology ERP</h1>
        <p className="mt-2 text-base leading-6 text-[#54709b]">AI&amp;DS Department ERP System — sign in to continue to your assigned workspace.</p>
      </header>

      <section className="mt-6 rounded-xl border border-[#dfe5ef] bg-white px-7 py-8 shadow-[0_16px_36px_rgb(21_49_91/0.09)] sm:px-8 sm:py-9">
        <h2 className="text-2xl font-bold text-[#09234b]">{selectedMode.heading}</h2>
        <p className="mt-1.5 max-w-md text-base leading-6 text-[#54709b]">{selectedMode.description}</p>

        <form className="mt-8 space-y-7" onSubmit={handleSubmit(submit)} noValidate>
          <div>
            <label className="block text-base font-semibold text-[#102b55]" htmlFor="login-email">Email Address</label>
            <div className="relative mt-2"><Mail className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8aa0bd]" aria-hidden="true" /><Input id="login-email" type="email" autoComplete="email" placeholder={selectedMode.emailPlaceholder} className="min-h-14 border-[#d9e3f3] bg-[#eaf1ff] pl-12 text-base placeholder:text-[#6e83a5] focus:bg-white" {...register('email', { onChange: () => clearErrors('root') })} /></div>
            {errors.email && <p className="mt-2 text-sm text-error">{errors.email.message}</p>}
          </div>

          <div>
            <div className="flex items-center justify-between gap-3"><label className="block text-base font-semibold text-[#102b55]" htmlFor="login-password">Password</label><button type="button" className="text-sm font-semibold text-[#1248ef] hover:underline" onClick={() => setRecoveryMessage('Password recovery is currently handled through the department IT support team.')}>Forgot password?</button></div>
            <div className="relative mt-2"><LockKeyhole className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#8aa0bd]" aria-hidden="true" /><Input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="min-h-14 border-[#d9e3f3] bg-[#eaf1ff] px-12 text-base focus:bg-white" {...register('password', { onChange: () => clearErrors('root') })} /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[#6e83a5] hover:bg-white hover:text-[#102b55]" onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}</button></div>
            {errors.password && <p className="mt-2 text-sm text-error">{errors.password.message}</p>}
          </div>

          <div className="flex items-center justify-between gap-3"><label className="flex cursor-pointer items-center gap-2 text-base text-[#425d85]"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-5 rounded border-[#8090a8] text-[#2450e8] focus:ring-[#2450e8]" />Remember me</label></div>
          {recoveryMessage && <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm leading-5 text-information">{recoveryMessage}</p>}
          {restorationError && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-error">{restorationError} <button type="button" className="font-semibold underline" onClick={() => void retrySessionRestore()}>Retry</button></p>}
          {errors.root && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-error">{errors.root.message}</p>}
          <Button className="min-h-14 w-full rounded-md bg-[#2450e8] text-base hover:bg-[#153ad0]" type="submit" disabled={isSubmitting || isRestoring}>{isRestoring ? 'Restoring session…' : isSubmitting ? 'Signing in…' : 'Sign In'}</Button>
        </form>

        <button type="button" className="mt-7 w-full text-center text-base text-[#425d85] hover:text-[#1248ef]" onClick={switchMode}>{selectedMode.toggle.split('?')[0]}?<span className="ml-1 font-semibold text-[#1248ef]">{selectedMode.toggle.split('? ')[1]}</span></button>
        <div className="mt-7 border-t border-[#e6ebf3] pt-5 text-center">
          {departmentLogo ? <img src={departmentLogo} alt="Department of Artificial Intelligence and Data Science logo" className="mx-auto h-9 w-auto max-w-[15rem] object-contain" /> : <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#60789c]">Department of Artificial Intelligence and Data Science</p>}
        </div>
      </section>
    </div>
  </main>
}
