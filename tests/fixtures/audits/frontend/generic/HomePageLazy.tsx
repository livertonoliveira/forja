import React from 'react';

const HeavyComponent = React.lazy(() => import('./HeavyComponent'));

export default function HomePageLazy() {
  return (
    <React.Suspense fallback={<div>Loading...</div>}>
      <HeavyComponent />
    </React.Suspense>
  );
}
