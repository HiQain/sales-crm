import { useParams, useNavigate } from 'react-router-dom';
import LeadsPage from './LeadsPage';
import { ArrowLeft } from 'lucide-react';

export default function UserLeadsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 pt-6">
        <button 
          onClick={() => navigate('/admin/users')}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors text-sm font-bold uppercase tracking-widest mb-2"
        >
          <ArrowLeft size={16} />
          Back to Users
        </button>
      </div>
      <LeadsPage userId={id} />
    </div>
  );
}
