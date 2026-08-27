import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { ArrowLeft, ArrowRight, Briefcase, Eye, EyeOff, GraduationCap, LockKeyhole, Mail } from 'lucide-react'
import { Navigate, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { getDefaultRouteForRole, resolveLoginEmail } from '@/lib/auth'
import { NeuralField } from '@/modules/auth/NeuralField'
import { WelcomeRobot } from '@/modules/auth/WelcomeRobot'
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

/**
 * The page is one fixed viewport playing a short sequence, not a scrolling document. A tiny state
 * machine steps through the phases: `boot` is the centred robot wave, `welcome` reveals the hero
 * title (with the robot peeking in from the top-left), `choice` waits for a role, `form` is terminal.
 * `boot` and `welcome` advance on their own timers.
 *
 * Under `prefers-reduced-motion` the sequence skips `boot` and starts on `welcome`, no timer is ever
 * scheduled, and a "Continue" button is the only way forward — nothing moves unless the user acts.
 */
type ScenePhase = 'boot' | 'welcome' | 'choice' | 'form'
const SCENE_ORDER: ScenePhase[] = ['boot', 'welcome', 'choice', 'form']
const BOOT_MS = 4000
const WELCOME_MS = 4200

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

const choiceContent: Record<LoginMode, { label: string; blurb: string; Icon: typeof GraduationCap }> = {
  student: { label: 'Student', blurb: 'Register-number sign-in for academic records and department services.', Icon: GraduationCap },
  staff: { label: 'Staff', blurb: 'HOD, faculty, lab assistants and system administrators.', Icon: Briefcase },
}

function detectReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Both marks are wide horizontal lockups, so they are sized by height and left to keep their
 *  own aspect ratio. Constraining them to a square box crushes them. */
function CollegeLogo({ className = 'h-12' }: { className?: string }) {
  return <img src={collegeLogo} alt="KCG College of Technology" className={`${className} w-auto object-contain`} />
}

function DepartmentLogo({ className = 'h-9' }: { className?: string }) {
  return <img src={departmentLogo} alt="Department of Artificial Intelligence and Data Science" className={`${className} w-auto object-contain`} />
}

/** One stacked phase layer. Its position in `SCENE_ORDER` relative to the active phase decides
 *  whether it is waiting ahead (`future`), on screen (`current`), or has flown past (`past`). */
function SceneLayer({ target, phase, className = '', children }: { target: ScenePhase; phase: ScenePhase; className?: string; children: ReactNode }) {
  const delta = SCENE_ORDER.indexOf(target) - SCENE_ORDER.indexOf(phase)
  const state = delta === 0 ? 'current' : delta > 0 ? 'future' : 'past'
  return (
    <div className={`scene-layer scene-layer--${state} absolute inset-0 grid place-items-center ${className}`} inert={state !== 'current'}>
      {children}
    </div>
  )
}

export function LoginPage() {
  const { currentUser, login, isRestoring } = useAuth()
  const navigate = useNavigate()
  const [reduced] = useState(detectReducedMotion)
  const [phase, setPhase] = useState<ScenePhase>(reduced ? 'welcome' : 'boot')
  const [mode, setMode] = useState<LoginMode>('staff')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [recoveryMessage, setRecoveryMessage] = useState('')
  const { register, handleSubmit, setError, clearErrors, setFocus, formState: { errors, isSubmitting } } = useForm<LoginValues>()
  const selectedMode = modeContent[mode]

  // The viewport stays locked to one screen for the whole sequence — there is no page scroll at
  // any phase, so the lock added here is never lifted until the component unmounts.
  useEffect(() => {
    document.documentElement.classList.add('login-viewport-lock')
    return () => document.documentElement.classList.remove('login-viewport-lock')
  }, [])

  // Timed auto-advance for the opening sequence. Never scheduled under reduced motion, where the
  // scene begins on `welcome` and the "Continue" button is the only way forward.
  useEffect(() => {
    if (reduced) return
    if (phase === 'boot') { const timer = setTimeout(() => setPhase('welcome'), BOOT_MS); return () => clearTimeout(timer) }
    if (phase === 'welcome') { const timer = setTimeout(() => setPhase('choice'), WELCOME_MS); return () => clearTimeout(timer) }
  }, [phase, reduced])

  // Send focus to the first field once the form has flown in.
  useEffect(() => {
    if (phase !== 'form') return
    const timer = setTimeout(() => setFocus('email'), 80)
    return () => clearTimeout(timer)
  }, [phase, setFocus])

  if (currentUser) return <Navigate replace to={getDefaultRouteForRole(currentUser.role)} />

  const reached = (target: ScenePhase) => SCENE_ORDER.indexOf(phase) >= SCENE_ORDER.indexOf(target)
  // `boot` sits the robot on a near-solid wash; the campus rises as the title takes over.
  const scrimOpacity = phase === 'boot' ? 0.82 : phase === 'form' ? 0.72 : 0.56
  const cameraPush = reduced ? undefined : `scale(${1 + SCENE_ORDER.indexOf(phase) * 0.035})`
  const skipBoot = () => setPhase((current) => (current === 'boot' ? 'welcome' : current))

  const chooseMode = (next: LoginMode) => { setMode(next); setRecoveryMessage(''); clearErrors('root'); setPhase('form') }
  const backToChoice = () => { setRecoveryMessage(''); clearErrors('root'); setPhase('choice') }
  const switchMode = () => { setMode((current) => current === 'staff' ? 'student' : 'staff'); setRecoveryMessage(''); clearErrors('root') }

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

  return (
    <main className="fixed inset-0 h-screen max-h-screen w-full overflow-hidden overscroll-none bg-[#04122a] text-white supports-[height:100dvh]:h-[100dvh] supports-[height:100dvh]:max-h-[100dvh]">
      {/* Layer 1 — ambient campus. The Ken Burns loop only starts once the title takes over, so the
          boot phase keeps the whole frame budget for the robot. */}
      <div className="absolute inset-0 overflow-hidden transition-transform duration-[1400ms] ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ transform: cameraPush }}>
        <img src={campusPhoto} alt="" aria-hidden="true" className={`absolute inset-0 size-full object-cover ${reduced || phase === 'boot' ? 'scale-[1.04]' : 'scene-ken-burns'}`} />
      </div>

      {/* Layer 2 — legibility. The flat wash deepens as the sequence moves from ambient footage
          toward the form; the vertical gradient and vignette are constant. */}
      <div className="absolute inset-0 bg-[#04122a] transition-opacity duration-[900ms] ease-[cubic-bezier(0.16,1,0.3,1)]" style={{ opacity: scrimOpacity }} />
      <div className="absolute inset-0 bg-gradient-to-t from-[#04122a]/80 via-transparent to-[#04122a]/40" />

      {/* Layer 3 — ambient neural texture. Starts with the title and runs continuously from there;
          it is not mounted during boot so its render loop can't compete with the robot. */}
      {reached('welcome') && <NeuralField reduced={reduced} />}

      <div className="absolute inset-0 [background:radial-gradient(120%_120%_at_50%_38%,transparent_42%,rgba(2,9,22,0.6)_100%)]" />

      {/* Layer 4 — the centred welcome robot. Login-only; skipped entirely under reduced motion.
          Tapping anywhere jumps past it. */}
      {!reduced && !reached('choice') && (
        <SceneLayer target="boot" phase={phase} className="p-6">
          <div className="relative grid place-items-center">
            <div className="pointer-events-none absolute size-[min(80vw,440px)] rounded-full [background:radial-gradient(circle,rgba(127,211,223,0.18),transparent_66%)]" />
            <WelcomeRobot mode="center" className="robot-center-in w-[min(52vw,232px)]" />
          </div>
          {phase === 'boot' && (
            <button type="button" onClick={skipBoot} aria-label="Skip welcome animation" className="absolute inset-0 z-10 cursor-pointer" />
          )}
        </SceneLayer>
      )}

      {/* Layer 4a — welcome. The robot tucks into the top-left of the title block (positioned
          against the block itself, so it tracks the title on every screen size). */}
      <SceneLayer target="welcome" phase={phase} className="px-6">
        {reached('welcome') && (
          <div className="relative mx-auto max-w-3xl text-center">
            <div className={`pointer-events-none absolute left-0 top-[-3.4rem] z-0 w-[54px] sm:left-[7%] sm:top-[-3.9rem] sm:w-[104px] ${reduced ? '' : 'robot-peek-in'}`}>
              <WelcomeRobot mode="peek" decorative className={reduced ? '' : 'robot-peek'} />
            </div>
            <p className="scene-rise relative z-[1] text-xs font-semibold uppercase tracking-[0.34em] text-white/70 sm:text-sm" style={{ animationDelay: '60ms' }}>KCG College of Technology</p>
            <h1 className="relative z-[1] mt-5 text-balance text-3xl font-bold leading-tight tracking-tight sm:text-5xl xl:text-[3.5rem]">
              <span className="scene-rise block" style={{ animationDelay: '150ms' }}>Welcome to the</span>
              <span className="scene-rise block" style={{ animationDelay: '290ms' }}>Department of Artificial Intelligence</span>
              <span className="scene-rise block" style={{ animationDelay: '430ms' }}>
                <span className="scene-shimmer">&amp; Data Science</span>
              </span>
            </h1>
            {reduced && (
              <button type="button" onClick={() => setPhase('choice')} className="scene-rise mt-9 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-7 text-base font-semibold text-[#09234b] shadow-lg transition hover:bg-[#eaf1ff]" style={{ animationDelay: '120ms' }}>
                Continue <ArrowRight className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </SceneLayer>

      {/* Layer 4b — role choice. */}
      <SceneLayer target="choice" phase={phase} className="px-6">
        {reached('choice') && (
          <div className="w-full max-w-3xl">
            <h2 className="scene-rise text-center text-2xl font-bold tracking-tight sm:text-3xl" style={{ animationDelay: '40ms' }}>How are you signing in?</h2>
            <p className="scene-rise mt-2 text-center text-sm text-white/70 sm:text-base" style={{ animationDelay: '120ms' }}>Choose your role to continue to the sign-in form.</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {(['student', 'staff'] as LoginMode[]).map((role, index) => {
                const { label, blurb, Icon } = choiceContent[role]
                return (
                  <button key={role} type="button" onClick={() => chooseMode(role)} className="scene-rise group flex flex-col items-start gap-3 rounded-2xl border border-white/15 bg-white/[0.12] p-6 text-left backdrop-blur-sm transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-[#7fd3df]/70 hover:bg-white/[0.16] hover:shadow-[0_18px_44px_-18px_rgba(127,211,223,0.55)] focus-visible:-translate-y-0.5 focus-visible:border-[#7fd3df]/70" style={{ animationDelay: `${180 + index * 110}ms` }}>
                    <span className="scene-badge-pulse flex size-12 items-center justify-center rounded-xl bg-[#107b8f] text-white transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105">
                      <Icon className="size-6" aria-hidden="true" />
                    </span>
                    <span className="text-lg font-bold">{label}</span>
                    <span className="text-sm leading-5 text-white/70">{blurb}</span>
                    <span className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-[#7fd3df]">Continue <ArrowRight className="size-4 transition duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:translate-x-0.5" aria-hidden="true" /></span>
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </SceneLayer>

      {/* Layer 4c — the login form. Existing auth flow, re-skinned to sit on the scene. */}
      <SceneLayer target="form" phase={phase} className="px-4 sm:px-6">
        {phase === 'form' && (
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-white/60 bg-white/95 p-6 text-[#09234b] shadow-[0_30px_80px_-20px_rgb(4_18_42/0.7)] sm:p-8">
              <button type="button" onClick={backToChoice} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#54709b] transition hover:text-[#1248ef]">
                <ArrowLeft className="size-4" aria-hidden="true" /> Back
              </button>
              <h2 className="mt-3 text-xl font-bold sm:text-2xl">{selectedMode.heading}</h2>
              <p className="mt-1 text-sm leading-5 text-[#54709b] sm:text-base">{selectedMode.description}</p>

              <form className="mt-5 space-y-4 sm:space-y-5" onSubmit={handleSubmit(submit)} noValidate>
                <div>
                  <label className="block text-sm font-semibold text-[#102b55]" htmlFor="login-email">{mode === 'student' ? 'Register Number' : 'Staff ID'}</label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[#8aa0bd]" aria-hidden="true" />
                    <Input id="login-email" type="text" inputMode={mode === 'student' ? 'numeric' : 'text'} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" placeholder={selectedMode.emailPlaceholder} className="min-h-12 border-[#d9e3f3] bg-[#eaf1ff] pl-11 text-base placeholder:text-[#6e83a5] focus:bg-white" {...register('email', { onChange: () => clearErrors('root') })} />
                  </div>
                  {errors.email && <p className="mt-2 text-sm text-error">{errors.email.message}</p>}
                </div>

                <div>
                  <div className="flex items-center justify-between gap-3">
                    <label className="block text-sm font-semibold text-[#102b55]" htmlFor="login-password">Password</label>
                    <button type="button" className="text-sm font-semibold text-[#1248ef] hover:underline" onClick={() => setRecoveryMessage('Password recovery is currently handled through the department IT support team.')}>Forgot password?</button>
                  </div>
                  <div className="relative mt-1.5">
                    <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-[#8aa0bd]" aria-hidden="true" />
                    <Input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" className="min-h-12 border-[#d9e3f3] bg-[#eaf1ff] pl-11 pr-11 text-base focus:bg-white" {...register('password', { onChange: () => clearErrors('root') })} />
                    <button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-2.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded text-[#6e83a5] hover:bg-white hover:text-[#102b55]" onClick={() => setShowPassword((visible) => !visible)}>
                      {showPassword ? <EyeOff className="size-5" aria-hidden="true" /> : <Eye className="size-5" aria-hidden="true" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-2 text-sm text-error">{errors.password.message}</p>}
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#425d85]">
                  <input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} className="size-5 rounded border-[#8090a8] text-[#2450e8] focus:ring-[#2450e8]" />
                  Remember me
                </label>

                {recoveryMessage && <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm leading-5 text-information">{recoveryMessage}</p>}
                {errors.root && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-error">{errors.root.message}</p>}

                <Button className="min-h-12 w-full rounded-md bg-[#2450e8] text-base hover:bg-[#153ad0] sm:min-h-14" type="submit" disabled={isSubmitting || isRestoring}>
                  {isRestoring ? 'Restoring session...' : isSubmitting ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>

              <button type="button" className="mt-4 w-full text-center text-sm text-[#425d85] hover:text-[#1248ef]" onClick={switchMode}>
                {selectedMode.toggle.split('?')[0]}?<span className="ml-1 font-semibold text-[#1248ef]">{selectedMode.toggle.split('? ')[1]}</span>
              </button>

              <div className="mt-5 flex justify-center border-t border-[#e6ebf3] pt-4">
                <DepartmentLogo className="h-8" />
              </div>
            </div>
          </div>
        )}
      </SceneLayer>

      {/* Persistent brand bugs, above every layer — they fade in with the title, not over the
          robot. The department bug also steps aside for the form, which carries its own lockup. */}
      {phase !== 'boot' && (
        <>
          <div className="scene-rise absolute left-5 top-5 z-20 rounded-lg bg-white/95 px-3 py-2 shadow-lg sm:left-8 sm:top-7" style={{ animationDelay: '120ms' }}>
            <CollegeLogo className="h-8 sm:h-10" />
          </div>
          <div className={`scene-rise absolute bottom-5 right-5 z-20 rounded-lg bg-white/95 px-3 py-2 shadow-lg transition-opacity duration-500 sm:bottom-7 sm:right-8 ${phase === 'form' ? 'hidden' : 'hidden sm:block'}`} style={{ animationDelay: '240ms' }}>
            <DepartmentLogo className="h-7 sm:h-8" />
          </div>
        </>
      )}

      {/* Timed-sequence progress hairline — omitted under reduced motion and the robot-driven boot. */}
      {!reduced && phase !== 'boot' && <div className="scene-progress" data-phase={phase} aria-hidden="true" />}
    </main>
  )
}
