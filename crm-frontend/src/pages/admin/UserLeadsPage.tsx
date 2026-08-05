import { useParams } from 'react-router-dom';
import LeadsPage from './LeadsPage';

export default function UserLeadsPage() {
  const { id } = useParams<{ id: string }>();

  return <LeadsPage userId={id} />;
}
