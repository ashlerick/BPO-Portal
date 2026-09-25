import { PageHeader } from '../../components/ui/PageHeader'
import { MyProfile } from '../hris/HrisPage'

export function ProfilePage() {
  return (
    <div>
      <PageHeader title="My Profile" />
      <MyProfile />
    </div>
  )
}
