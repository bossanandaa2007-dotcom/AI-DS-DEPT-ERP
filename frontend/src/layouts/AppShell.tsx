import { LogOut, Menu, X } from 'lucide-react'
import { useCallback, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'

import { ROLE_LABELS, ROLE_NAVIGATION } from '@/constants/navigation'
import { ROUTE_PATHS } from '@/app/router/route-paths'
import departmentLogo from '@/assets/branding/aids-department-logo.png'
import collegeLogo from '@/assets/branding/kcg-college-logo.png'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { documentReviewRepository } from '@/services/supabase/documentReviewRepository'

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser } = useAuth()
  const loadJuryEligibility = useCallback(() => currentUser?.role === 'faculty' ? documentReviewRepository.isCurrentUserJuryEligible() : Promise.resolve(false), [currentUser?.role])
  const juryEligibility = useAsyncResource(loadJuryEligibility)
  if (!currentUser) return null
  const navigationItems = ROLE_NAVIGATION[currentUser.role].filter((item) => item.path !== ROUTE_PATHS.facultyJuryReviews || juryEligibility.data)

  return <nav aria-label="Role navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
    <div className="flex flex-col gap-1">
      {navigationItems.map(({ label, path, icon: Icon }) => <NavLink end={path === navigationItems[0]?.path} key={path} onClick={onNavigate} to={path} className={({ isActive }) => `flex min-h-10 items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-background hover:text-text'}`}>
        {Icon && <Icon aria-hidden="true" className="size-4" />} {label}
      </NavLink>)}
    </div>
  </nav>
}

function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return <aside className={`${mobile ? 'h-full' : 'hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-[var(--sidebar-width)] lg:shrink-0'} flex-col border-r border-border bg-surface`}>
    {/* The department lockup already reads "Department of Artificial Intelligence and Data
        Science", so it replaces the generic icon and wordmark rather than sitting beside it. */}
    <div className="flex h-[var(--header-height)] shrink-0 items-center border-b border-border px-5">
      <img src={departmentLogo} alt="Department of Artificial Intelligence and Data Science" className="h-9 w-auto max-w-full object-contain" />
    </div>
    <Navigation onNavigate={onNavigate} />
  </aside>
}

export function AppShell() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const navigate = useNavigate()
  const { currentUser, logout } = useAuth()
  if (!currentUser) return null
  const handleLogout = () => { logout(); navigate(ROUTE_PATHS.login, { replace: true }) }

  return <div className="flex min-h-screen bg-background">
    <Sidebar />
    {isDrawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="absolute inset-0 bg-text/40" onClick={() => setIsDrawerOpen(false)} /><div className="relative h-full w-[min(18rem,85vw)] bg-surface shadow-xl"><div className="absolute right-3 top-3"><Button aria-label="Close navigation" variant="ghost" className="px-2" onClick={() => setIsDrawerOpen(false)}><X className="size-5" /></Button></div><Sidebar mobile onNavigate={() => setIsDrawerOpen(false)} /></div></div>}
    <div className="min-w-0 flex-1"><header className="flex h-[var(--header-height)] items-center justify-between border-b border-border bg-surface px-4 sm:px-6"><Button aria-label="Open navigation" variant="ghost" className="px-2 lg:hidden" onClick={() => setIsDrawerOpen(true)}><Menu className="size-5" /></Button><img src={collegeLogo} alt="KCG College of Technology" className="h-8 w-auto object-contain sm:h-9" /><div className="ml-auto flex items-center gap-3"><div className="hidden text-right sm:block"><p className="text-sm font-semibold text-text">{currentUser.name}</p><Badge tone="primary">{ROLE_LABELS[currentUser.role]}</Badge></div><Button variant="ghost" aria-label="Log out" className="px-2" onClick={handleLogout}><LogOut className="size-5" /><span className="hidden sm:inline">Logout</span></Button></div></header><main className="app-container py-6 sm:py-8"><Outlet /></main></div>
  </div>
}
