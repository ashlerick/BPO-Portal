import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth } from './auth/RequireAuth'
import { ThemeProvider } from './theme/ThemeContext'
import { PortalLayout } from './layouts/PortalLayout'
import { AnnouncementsPage } from './pages/announcements/AnnouncementsPage'
import { AttendancePage } from './pages/attendance/AttendancePage'
import { AuditLogsPage } from './pages/audit-logs/AuditLogsPage'
import { BenefitsPage } from './pages/benefits/BenefitsPage'
import { CalendarPage } from './pages/calendar/CalendarPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { DocumentsPage } from './pages/documents/DocumentsPage'
import { ForgotPasswordPage } from './pages/forgot-password/ForgotPasswordPage'
import { HrisPage } from './pages/hris/HrisPage'
import { EmployeeRecordPage } from './pages/hris/EmployeeRecordPage'
import { BenefitsAdminPage } from './pages/hr/BenefitsAdminPage'
import { ChecklistPage } from './pages/hr/ChecklistPage'
import { HrRequestsPage } from './pages/hr-requests/HrRequestsPage'
import { EmployeeRelationsPage } from './pages/employee-relations/EmployeeRelationsPage'
import { PayrollPage } from './pages/payroll/PayrollPage'
import { PerformancePage } from './pages/performance/PerformancePage'
import { RecruitmentPage } from './pages/recruitment/RecruitmentPage'
import { LeaveRequestsPage } from './pages/leave/LeaveRequestsPage'
import { LoginPage } from './pages/login/LoginPage'
import { NotificationsPage } from './pages/notifications/NotificationsPage'
import { ProfilePage } from './pages/profile/ProfilePage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { SetPasswordPage } from './pages/set-password/SetPasswordPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { UsersPage } from './pages/users/UsersPage'

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ThemeProvider>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/set-password" element={<SetPasswordPage />} />
            <Route
              element={
                <RequireAuth>
                  <PortalLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<DashboardPage />} />
              <Route path="/announcements" element={<AnnouncementsPage />} />
              <Route path="/benefits" element={<BenefitsPage />} />
              <Route path="/hris" element={<HrisPage />} />
              <Route path="/hris/:id" element={<EmployeeRecordPage />} />
              <Route path="/hr-requests" element={<HrRequestsPage />} />
              <Route path="/performance" element={<PerformancePage />} />
              <Route
                path="/recruitment"
                element={
                  <RequireAuth roles={['hr', 'admin']}>
                    <RecruitmentPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/onboarding"
                element={
                  <RequireAuth roles={['hr', 'admin']}>
                    <ChecklistPage kind="onboarding" />
                  </RequireAuth>
                }
              />
              <Route
                path="/offboarding"
                element={
                  <RequireAuth roles={['hr', 'admin']}>
                    <ChecklistPage kind="offboarding" />
                  </RequireAuth>
                }
              />
              <Route
                path="/benefits-admin"
                element={
                  <RequireAuth roles={['hr', 'admin']}>
                    <BenefitsAdminPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/employee-relations"
                element={
                  <RequireAuth roles={['hr', 'admin']}>
                    <EmployeeRelationsPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/payroll"
                element={
                  <RequireAuth roles={['hr', 'admin']}>
                    <PayrollPage />
                  </RequireAuth>
                }
              />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/documents" element={<DocumentsPage />} />
              <Route path="/leave" element={<LeaveRequestsPage />} />
              <Route path="/attendance" element={<AttendancePage />} />
              <Route path="/notifications" element={<NotificationsPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route
                path="/users"
                element={
                  <RequireAuth roles={['admin']}>
                    <UsersPage />
                  </RequireAuth>
                }
              />
              <Route
                path="/audit-logs"
                element={
                  <RequireAuth roles={['admin']}>
                    <AuditLogsPage />
                  </RequireAuth>
                }
              />
            </Route>
          </Routes>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
