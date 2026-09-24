import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
}

// Bare icon button with a padded hit area. The negative margin cancels the
// padding, so swapping a plain <button> for this doesn't shift the layout.
export default function IconButton({ className = '', type = 'button', ...props }: IconButtonProps) {
  return (
    <button
      type={type}
      className={`flex-shrink-0 p-1.5 -m-1.5 rounded-lg text-text-subtle hover:text-text hover:bg-tint transition active:scale-95 ${className}`}
      {...props}
    />
  )
}
