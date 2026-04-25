export interface CheckResult {
  status: 'pass' | 'warn' | 'fail'
  message: string
  remediation?: string
}

export interface DoctorCheck {
  name: string
  run(): Promise<CheckResult>
}

const checks: DoctorCheck[] = []

export function registerCheck(check: DoctorCheck): void {
  checks.push(check)
}

export function getChecks(): DoctorCheck[] {
  return checks
}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const timer = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), ms),
  )
  return Promise.race([promise, timer])
}
