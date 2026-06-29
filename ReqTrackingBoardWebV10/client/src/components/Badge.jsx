import { getStatusBadge, getPriorityBadge } from '../utils/helpers';

export function StatusBadge({ status }) {
  return <span className={`badge badge-${getStatusBadge(status)}`}>{status}</span>;
}

export function PriorityBadge({ priority }) {
  return <span className={`badge badge-${getPriorityBadge(priority)}`}>{priority}</span>;
}
