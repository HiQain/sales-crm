import { useParams } from 'react-router-dom';
import MyLeadsPage from './MyLeadsPage';

export default function EmployeeUserLeadsPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <MyLeadsPage
      userIdOverride={id}
      title="User Leads"
      searchPlaceholder="Filter user leads..."
    />
  );
}
