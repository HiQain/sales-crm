import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

const ZONES = [
  { label: 'EST', zone: 'America/New_York' },
  { label: 'CST', zone: 'America/Chicago' },
  { label: 'MST', zone: 'America/Denver' },
  { label: 'PST', zone: 'America/Los_Angeles' },
  { label: 'PKT', zone: 'Asia/Karachi' },
];

export default function TimeZoneBar() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div
      className="flex select-none items-center justify-center gap-0 border-b border-white/10 bg-[#1a1f2e] px-4 py-2 text-xs text-white/80"
      id="timezone-bar"
    >
      {ZONES.map((zone, index) => (
        <span key={zone.label} className="flex items-center">
          {index > 0 && <span className="mx-4 text-white/20">|</span>}
          <span className="mr-1.5 font-medium tracking-wider text-white">{zone.label}</span>
          <span className="font-semibold text-white/90">
            {formatInTimeZone(time, zone.zone, 'h:mm a')}
          </span>
        </span>
      ))}
    </div>
  );
}
