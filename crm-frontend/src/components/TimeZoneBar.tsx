import { useState, useEffect } from 'react';
import { formatInTimeZone } from 'date-fns-tz';

const ZONES = [
  { name: 'EST', zone: 'America/New_York' },
  { name: 'CST', zone: 'America/Chicago' },
  { name: 'MST', zone: 'America/Denver' },
  { name: 'PST', zone: 'America/Los_Angeles' },
  { name: 'PKT', zone: 'Asia/Karachi' },
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
    <header 
      className="w-full h-12 bg-slate-900/90 backdrop-blur-[20px] border-b border-cyan-400/20 flex items-center justify-center space-x-6 text-[10px] md:text-xs font-bold tracking-widest uppercase z-50 shadow-xl"
      id="timezone-bar"
    >
      {ZONES.map((zone, index) => (
        <div key={zone.name} className="flex items-center gap-2">
          <span className="text-slate-100">{zone.name}</span>
          <span className={zone.name === 'PKT' ? 'text-emerald-300' : 'text-cyan-300'}>
            {formatInTimeZone(time, zone.zone, 'h:mm a')}
          </span>
          {index < ZONES.length - 1 && (
            <div className="h-4 w-[1px] bg-white/30 ml-6 hidden md:block" />
          )}
        </div>
      ))}
    </header>
  );
}
