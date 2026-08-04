export interface PasswordCheck {
  key: string
  label: string
  met: boolean
}

export type PasswordStrength = 'weak' | 'fair' | 'good' | 'strong'

const MIN_LENGTH = 8

export function getPasswordChecks(password: string): PasswordCheck[] {
  return [
    { key: 'length', label: 'At least 8 characters', met: password.length >= MIN_LENGTH },
    { key: 'upper', label: 'An uppercase letter', met: /[A-Z]/.test(password) },
    { key: 'lower', label: 'A lowercase letter', met: /[a-z]/.test(password) },
    { key: 'number', label: 'A number', met: /[0-9]/.test(password) },
    { key: 'symbol', label: 'A symbol (!@#$…)', met: /[^A-Za-z0-9]/.test(password) },
  ]
}

// All five checks must pass for a password to be accepted on signup.
export function isPasswordStrongEnough(password: string): boolean {
  return getPasswordChecks(password).every((c) => c.met)
}

export function getPasswordStrength(password: string): { strength: PasswordStrength; score: number } {
  if (!password) return { strength: 'weak', score: 0 }
  const metCount = getPasswordChecks(password).filter((c) => c.met).length
  if (metCount <= 2) return { strength: 'weak', score: metCount }
  if (metCount === 3) return { strength: 'fair', score: metCount }
  if (metCount === 4) return { strength: 'good', score: metCount }
  return { strength: 'strong', score: metCount }
}
