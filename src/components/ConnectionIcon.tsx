import { colors } from '@/theme';

type Props = {
  online: boolean;
};

export function ConnectionIcon({ online }: Props) {
  const label = online ? 'Online' : 'Offline';
  const color = online ? colors.online : colors.offline;
  return (
    <span className="connection-icon" role="img" aria-label={label} title={label}>
      {online ? <CloudDone color={color} /> : <CloudOffline color={color} />}
    </span>
  );
}

function CloudDone({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 18h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.5A3.5 3.5 0 0 0 6.5 18Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m8.5 13.2 2.1 2.1 4-4" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CloudOffline({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6.5 18h11a4 4 0 0 0 .4-8 5.5 5.5 0 0 0-10.6-1.5A3.5 3.5 0 0 0 6.5 18Z"
        stroke={color}
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="m9 11.5 6 6M15 11.5l-6 6" stroke={color} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}
