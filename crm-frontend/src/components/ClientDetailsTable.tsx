import { useMemo } from 'react';
import { ArrowRightLeft, Pencil, PenLine, Plus, Trash2 } from 'lucide-react';
import type { ClientJourney, ClientOption } from '../types';
import { formatDateDisplay } from '../utils/date';
import { getClientKey, UNNAMED_CLIENT } from '../utils/clients';

interface ClientDetailsTableProps {
  records: ClientJourney[];
  clients: ClientOption[];
  searchText: string;
  onEdit: (record: ClientJourney) => void;
  onDelete: (record: ClientJourney) => void;
  onMove: (record: ClientJourney) => void;
  onRenameClient: (client: ClientOption) => void;
  onAddForClient: (client: ClientOption) => void;
}

interface BusinessGroup {
  businessName: string;
  records: ClientJourney[];
}

interface ClientGroup {
  client: ClientOption;
  businesses: BusinessGroup[];
  total: number;
}

const money = (value: unknown) =>
  `$${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Empty = () => <span className="text-slate-400">—</span>;

export default function ClientDetailsTable({
  records,
  clients,
  searchText,
  onEdit,
  onDelete,
  onMove,
  onRenameClient,
  onAddForClient,
}: ClientDetailsTableProps) {
  const groups = useMemo<ClientGroup[]>(() => {
    const query = searchText.trim().toLowerCase();
    const filtered = query
      ? records.filter((record) =>
        [record.client_name, record.business_name, record.credit_card_info, record.email, record.phone,
          record.sales, record.lead, record.service, record.status]
          .some((field) => String(field ?? '').toLowerCase().includes(query)))
      : records;

    const recordsByClient = new Map<string, ClientJourney[]>();
    filtered.forEach((record) => {
      const key = getClientKey(record);
      if (!recordsByClient.has(key)) recordsByClient.set(key, []);
      recordsByClient.get(key)!.push(record);
    });

    // `clients` is already sorted by name; keep that order.
    return clients
      .filter((client) => recordsByClient.has(client.key))
      .map((client) => {
        const businesses = new Map<string, BusinessGroup>();
        recordsByClient.get(client.key)!.forEach((record) => {
          const businessName = (record.business_name || '').trim();
          const businessKey = businessName.toLowerCase();
          if (!businesses.has(businessKey)) businesses.set(businessKey, { businessName, records: [] });
          businesses.get(businessKey)!.records.push(record);
        });
        const businessList = [...businesses.values()];
        return {
          client,
          businesses: businessList,
          total: businessList.reduce((sum, business) => sum + business.records.length, 0),
        };
      });
  }, [records, clients, searchText]);

  if (groups.length === 0) {
    return (
      <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-1 text-center">
        <p className="text-sm font-semibold text-slate-600">
          {searchText.trim() ? 'No clients match your search.' : 'No client journeys yet.'}
        </p>
        {!searchText.trim() && (
          <p className="text-sm text-slate-400">Use “Add Client Journeys” to add rows for a client.</p>
        )}
      </div>
    );
  }

  const headerCell = 'sticky top-0 z-10 whitespace-nowrap border-b border-l border-slate-300 bg-slate-50 px-3 py-2.5 text-left text-xs font-bold text-slate-600 first:border-l-0';
  const bodyCell = 'border-b border-l border-slate-300 px-3 py-2 align-top';
  const iconButton = 'rounded p-1.5 transition';

  return (
    <div className="h-full overflow-auto">
      <table className="w-full min-w-[1250px] border-separate border-spacing-0 text-[13px] text-slate-700">
        <thead>
          <tr>
            <th className={headerCell}>Client</th>
            <th className={headerCell}>Business</th>
            <th className={headerCell}>Date</th>
            <th className={headerCell}>Credit Card Info.</th>
            <th className={headerCell}>Email</th>
            <th className={headerCell}>Phone</th>
            <th className={headerCell}>Sales</th>
            <th className={headerCell}>Agent</th>
            <th className={headerCell}>Service</th>
            <th className={headerCell}>Status</th>
            <th className={`${headerCell} text-right`}>Paid</th>
            <th className={`${headerCell} text-right`}>Balance</th>
            <th className={`${headerCell} text-right`}>Total</th>
            <th className={`${headerCell} text-center`}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ client, businesses, total }, clientIndex) => {
            let clientCellRendered = false;
            const stripe = clientIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/70';
            const isLinked = client.id != null && client.name !== UNNAMED_CLIENT;
            const isDuplicateName = client.nameNumber != null;

            return businesses.map((business) => business.records.map((record, recordIndex) => {
              const showClientCell = !clientCellRendered;
              clientCellRendered = true;
              const card = (record.credit_card_info || '').trim();
              const isPaid = String(record.status || '').trim().toLowerCase() === 'paid';

              return (
                <tr key={record.id} className={stripe}>
                  {showClientCell && (
                    <td
                      rowSpan={total}
                      title={isDuplicateName ? 'Another client has the same name' : undefined}
                      className={`${bodyCell} relative border-l-0 ${isDuplicateName ? 'bg-rose-200' : stripe}`}
                    >
                      {isDuplicateName && (
                        <span className="absolute right-2 top-2 rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-rose-700">
                          #{client.nameNumber}
                        </span>
                      )}
                      <div className={`flex flex-col items-start gap-1 ${isDuplicateName ? 'pr-8' : ''}`}>
                        <span className="group/name flex items-start gap-1">
                          <span className={`font-semibold ${isDuplicateName ? 'text-rose-700' : 'text-slate-800'}`}>{client.name}</span>
                          {isLinked && (
                            <button
                              type="button"
                              onClick={() => onRenameClient(client)}
                              aria-label={`Rename ${client.name}`}
                              title="Rename client"
                              className="rounded p-0.5 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-indigo-600 focus:opacity-100 group-hover/name:opacity-100"
                            >
                              <PenLine size={12} />
                            </button>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {total} {total === 1 ? 'row' : 'rows'}
                        </span>
                        {isLinked && (
                          <button
                            type="button"
                            onClick={() => onAddForClient(client)}
                            className="-ml-1.5 inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-indigo-600 transition hover:bg-indigo-50"
                          >
                            <Plus size={12} /> Add
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                  {recordIndex === 0 && (
                    <td rowSpan={business.records.length} className={bodyCell}>
                      {business.businessName ? <span className="font-medium">{business.businessName}</span> : <Empty />}
                    </td>
                  )}
                  <td className={`${bodyCell} whitespace-nowrap`}>{record.record_date ? formatDateDisplay(record.record_date) : <Empty />}</td>
                  <td className={bodyCell}>{card ? <span className="break-all">{card}</span> : <Empty />}</td>
                  <td className={`${bodyCell} break-all`}>{record.email || <Empty />}</td>
                  <td className={`${bodyCell} whitespace-nowrap`}>{record.phone || <Empty />}</td>
                  <td className={bodyCell}>{record.sales || <Empty />}</td>
                  <td className={bodyCell}>{record.lead || <Empty />}</td>
                  <td className={bodyCell}>{record.service || <Empty />}</td>
                  <td className={bodyCell}>
                    {record.status ? (
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium capitalize ${isPaid ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                        {record.status}
                      </span>
                    ) : <Empty />}
                  </td>
                  <td className={`${bodyCell} whitespace-nowrap text-right tabular-nums`}>{money(record.paid)}</td>
                  <td className={`${bodyCell} whitespace-nowrap text-right tabular-nums`}>{money(record.balance)}</td>
                  <td className={`${bodyCell} whitespace-nowrap text-right font-medium tabular-nums`}>{money(record.total)}</td>
                  <td className={bodyCell}>
                    <div className="flex justify-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => onEdit(record)}
                        aria-label="Edit row"
                        title="Edit"
                        className={`${iconButton} text-slate-500 hover:bg-indigo-50 hover:text-indigo-600`}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onMove(record)}
                        aria-label="Move row to another client"
                        title="Move to another client"
                        className={`${iconButton} text-slate-500 hover:bg-amber-50 hover:text-amber-700`}
                      >
                        <ArrowRightLeft size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(record)}
                        aria-label="Delete row"
                        title="Delete"
                        className={`${iconButton} text-rose-500 hover:bg-rose-50`}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            }));
          })}
        </tbody>
      </table>
    </div>
  );
}
