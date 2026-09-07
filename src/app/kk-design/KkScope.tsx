'use client';
// KK-UI-GOVERNOR generated - landing-page scope boundary.
// Every rule in ./theme.css is prefixed with [data-kk-scope="landing"], so wrapping ONLY the
// landing page in <KkScope> guarantees no other route (dashboard, settings, auth) can change.
import React from 'react';
import './theme.css';

type KkScopeProps = React.HTMLAttributes<HTMLElement> & { as?: React.ElementType; children?: React.ReactNode };
export function KkScope({ children, as = 'div', className = '', ...rest }: KkScopeProps) {
  // The tag is widened deliberately: a union of every intrinsic element breaks JSX inference.
  const Tag = as as any;
  return (
    <Tag data-kk-scope="landing" className={className} {...rest}>
      {children}
    </Tag>
  );
}
export default KkScope;
