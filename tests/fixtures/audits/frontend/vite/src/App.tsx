import { useState } from 'react';

// Baseline Vite+React fixture for Part 2 generic methodology.
// Part 1 returns no findings for this framework (generic audit not yet implemented).
export default function App() {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>Vite + React Baseline</h1>
      <button onClick={() => setCount((c) => c + 1)}>Count: {count}</button>
    </div>
  );
}
