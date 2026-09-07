// KK-UI-GOVERNOR generated (modern / landing) — dependency-free design system component. Safe to edit; re-runs replace files that keep this header.
import React from 'react';
export type KkButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; icon?: boolean };
export function KkButton({ variant = 'primary', size = 'md', icon = false, className = '', type = 'button', ...rest }: KkButtonProps) {
  const cls = ['kk-btn', variant !== 'primary' ? 'kk-btn--' + variant : '', size !== 'md' ? 'kk-btn--' + size : '', icon ? 'kk-btn--icon' : '', className].filter(Boolean).join(' ');
  return <button type={type} className={cls} {...rest} />;
}
export default KkButton;
