import { LogOut, Megaphone, Menu, MoreHorizontal, X } from 'lucide-react'
import { Suspense, useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'

import { ROLE_LABELS, ROLE_NAVIGATION } from '@/constants/navigation'
import { ROUTE_PATHS } from '@/app/router/route-paths'
import departmentLogo from '@/assets/branding/aids-department-logo.png'
import collegeLogo from '@/assets/branding/kcg-college-logo.png'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { LoadingState } from '@/components/feedback/LoadingState'
import { useAsyncResource } from '@/hooks/useAsyncResource'
import { useAuth } from '@/modules/auth/useAuth'
import { documentReviewRepository } from '@/services/supabase/documentReviewRepository'
import type { NavigationItem, UserRole } from '@/types'

const mobilePriority: Record<UserRole, string[]> = {
  super_admin: ['Dashboard', 'Users', 'Academic Setup', 'Reports'],
  hod: ['Dashboard', 'Attendance', 'Requests', 'Reports'],
  faculty: ['Dashboard', 'Timetable', 'Attendance', 'Marks'],
  lab_assistant: ['Dashboard', 'Lab Timetable', 'Attendance', 'Leave'],
  student: ['Dashboard', 'Timetable', 'Attendance', 'Requests', 'Complaints'],
}

const isActivePath = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`)

/** Mounted only while its Suspense boundary shows the fallback, so its effect lifetime exactly
 *  brackets a lazy route chunk loading — used to drive the top progress bar. */
function RouteLoadingSignal({ onActiveChange }: { onActiveChange: (active: boolean) => void }) {
  useEffect(() => {
    onActiveChange(true)
    return () => onActiveChange(false)
  }, [onActiveChange])
  return <LoadingState label="Loading page…" />
}

function TopProgressBar({ active }: { active: boolean }) {
  return <div aria-hidden="true" className={`fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-transparent transition-opacity duration-200 ${active ? 'opacity-100' : 'opacity-0'}`}>
    {active && <div className="top-progress-bar h-full w-1/3 bg-primary" />}
  </div>
}

function mobileItemsFor(role: UserRole, navigationItems: NavigationItem[]) {
  const priority = mobilePriority[role]
  return priority.map((label) => navigationItems.find((item) => item.label === label)).filter((item): item is NavigationItem => Boolean(item)).slice(0, role === 'student' ? 5 : 4)
}

function Navigation({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const { currentUser } = useAuth()
  const loadJuryEligibility = useCallback(() => currentUser?.role === 'faculty' ? documentReviewRepository.isCurrentUserJuryEligible() : Promise.resolve(false), [currentUser?.role])
  const juryEligibility = useAsyncResource(loadJuryEligibility, 'juryEligibility')
  if (!currentUser) return null
  const navigationItems = ROLE_NAVIGATION[currentUser.role]
    .filter((item) => item.path !== ROUTE_PATHS.facultyJuryReviews || juryEligibility.data)
    .filter((item) => !mobile || currentUser.role !== 'student' || ['Marks', 'Document Status', 'Announcements', 'Complaints'].includes(item.label))

  return <nav aria-label="Role navigation" className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
    <div className="flex flex-col gap-1">
      {navigationItems.map(({ label, path, icon: Icon }) => <NavLink end={path === navigationItems[0]?.path} key={path} onClick={onNavigate} to={path} className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded px-3 text-sm font-semibold transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted hover:bg-background hover:text-text'}`}>
        {Icon && <Icon aria-hidden="true" className="size-4" />} {label}
      </NavLink>)}
    </div>
  </nav>
}

function Sidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  return <aside className={`${mobile ? 'h-full' : 'hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-[var(--sidebar-width)] lg:shrink-0'} flex-col border-r border-border bg-surface`}>
    {/* The department lockup already reads "Department of Artificial Intelligence and Data
        Science", so it replaces the generic icon and wordmark rather than sitting beside it. */}
    <div className="flex h-[var(--header-height)] shrink-0 items-center border-b border-border px-5">
      <img src={departmentLogo} alt="Department of Artificial Intelligence and Data Science" className="h-9 w-auto max-w-full object-contain" />
    </div>
    <Navigation mobile={mobile} onNavigate={onNavigate} />
  </aside>
}

function BottomNavigation({ items, onMore }: { items: NavigationItem[]; onMore: () => void }) {
  const location = useLocation()
  return <nav aria-label="Primary mobile navigation" className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2 shadow-[0_-10px_28px_rgb(18_43_79_/_0.10)] backdrop-blur lg:hidden">
    <div className="mx-auto grid max-w-lg grid-cols-5 gap-1">
      {items.map(({ label, path, icon: Icon }) => {
        const active = label === 'Dashboard' ? location.pathname === path : isActivePath(location.pathname, path)
        return <NavLink key={path} end={label === 'Dashboard'} to={path} className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded px-1 text-[11px] font-bold transition duration-150 active:scale-95 ${active ? 'bg-primary/10 text-primary' : 'text-muted'}`}>
          {Icon && <Icon aria-hidden="true" className="size-5" />}
          <span className="max-w-full truncate">{label.replace('Academic Setup', 'Setup')}</span>
        </NavLink>
      })}
      {items.length < 5 && <button type="button" aria-label="Open full navigation" onClick={onMore} className="flex min-h-14 flex-col items-center justify-center gap-1 rounded px-1 text-[11px] font-bold text-muted transition duration-150 active:scale-95">
        <MoreHorizontal aria-hidden="true" className="size-5" />
        <span>More</span>
      </button>}
    </div>
  </nav>
}

export function AppShell() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [routeLoading, setRouteLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { currentUser, logout } = useAuth()
  useEffect(() => {
    if (!isDrawerOpen) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setIsDrawerOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [isDrawerOpen])
  if (!currentUser) return null
  const handleLogout = () => { logout(); navigate(ROUTE_PATHS.login, { replace: true }) }
  const navigationItems = ROLE_NAVIGATION[currentUser.role]
  const activeItem = navigationItems.findLast((item) => isActivePath(location.pathname, item.path)) ?? navigationItems[0]
  const notificationPath = navigationItems.find((item) => item.label.includes('Announcement') || item.label.includes('Operations'))?.path ?? navigationItems[0]?.path
  const bottomItems = mobileItemsFor(currentUser.role, navigationItems)

  return <div className="flex min-h-dvh bg-background">
    <TopProgressBar active={routeLoading} />
    <Sidebar />
    {isDrawerOpen && <div className="fixed inset-0 z-50 lg:hidden"><button aria-label="Close navigation" className="overlay-in absolute inset-0 bg-text/40" onClick={() => setIsDrawerOpen(false)} /><div className="drawer-panel-in relative h-full w-[min(19rem,86vw)] bg-surface shadow-xl"><div className="absolute right-3 top-3 z-10"><Button aria-label="Close navigation" variant="ghost" className="min-h-9 px-2" onClick={() => setIsDrawerOpen(false)}><X className="size-5" /></Button></div><Sidebar mobile onNavigate={() => setIsDrawerOpen(false)} /></div></div>}
    <div className="min-w-0 flex-1">
      <header className="sticky top-0 z-30 flex h-[var(--header-height)] items-center gap-3 border-b border-border bg-surface/95 px-3 backdrop-blur sm:px-6">
        <Button aria-label="Open navigation" variant="ghost" className="min-h-10 px-2 lg:hidden" onClick={() => setIsDrawerOpen(true)}><Menu className="size-5" /></Button>
        <div className="min-w-0 flex-1 lg:hidden">
          <p className="truncate text-sm font-bold text-text">{activeItem?.label ?? ROLE_LABELS[currentUser.role]}</p>
          <p className="truncate text-xs font-medium text-muted">{ROLE_LABELS[currentUser.role]}</p>
        </div>
        <img src={collegeLogo} alt="KCG College of Technology" className="hidden h-8 w-auto object-contain sm:h-9 lg:block" />
        <div className="ml-auto flex items-center gap-2">
          {notificationPath && (currentUser.role === 'student'
            ? <NavLink aria-label="Open announcements" to={notificationPath} className="grid size-10 place-items-center rounded text-muted transition-colors hover:bg-background hover:text-text"><Megaphone className="size-5" /></NavLink>
            : <NavLink aria-label="Open announcements" to={notificationPath} className="flex min-h-10 items-center gap-2 rounded px-2 text-sm font-semibold text-muted transition-colors hover:bg-background hover:text-text sm:px-3"><Megaphone className="size-5 sm:hidden" aria-hidden="true" /><span className="hidden sm:inline">Announcements</span></NavLink>)}
          <div className="hidden text-right sm:block">
            <p className="text-sm font-semibold text-text">{currentUser.name}</p>
            <Badge tone="primary">{ROLE_LABELS[currentUser.role]}</Badge>
          </div>
          <Button variant="ghost" aria-label="Log out" className="min-h-10 px-2" onClick={handleLogout}><LogOut className="size-5" /><span className="hidden sm:inline">Logout</span></Button>
        </div>
      </header>
      <main className="app-container py-5 pb-[calc(var(--mobile-nav-height)+1.5rem)] sm:py-8 lg:pb-8">
        <div key={location.pathname} className="route-transition">
          <Suspense fallback={<RouteLoadingSignal onActiveChange={setRouteLoading} />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
    </div>
    <BottomNavigation items={bottomItems} onMore={() => setIsDrawerOpen(true)} />
  </div>
}
