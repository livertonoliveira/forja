'use client';

import { useState } from 'react';

// Correct: 'use client' on a leaf component that genuinely needs interactivity.
export default function Counter() {
  const [count, setCount] = useState(0);
  return (
    <button onClick={() => setCount((c) => c + 1)}>
      Count: {count}
    </button>
  );
}
