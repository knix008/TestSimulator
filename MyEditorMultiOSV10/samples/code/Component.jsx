// JSX — a React component with hooks
import React, { useEffect, useState } from 'react';

export function Clock({ format = 'ko-KR' }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock" title={now.toISOString()}>
      <span>{now.toLocaleTimeString(format)}</span>
      {now.getSeconds() % 2 === 0 && <span className="tick">•</span>}
    </div>
  );
}
