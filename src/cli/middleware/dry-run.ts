export const DRY_RUN_ACTIONS = {
  GITHUB_CREATE_CHECK: 'github:createCheck',
  SLACK_NOTIFY: 'slack:notifySlack',
  WEBHOOK_HTTP_POST: 'webhook:httpPost',
  COST_WRITE_EVENT: 'cost:writeCostEvent',
} as const

export type DryRunAction = typeof DRY_RUN_ACTIONS[keyof typeof DRY_RUN_ACTIONS]

export class DryRunInterceptor {
  private static enabled = false

  static enable(): void {
    this.enabled = true
  }

  static isEnabled(): boolean {
    return this.enabled
  }

  /** @internal — use only in tests and CLI lifecycle hooks */
  static reset(): void {
    this.enabled = false
  }

  static intercept(actionName: DryRunAction | string, fn: () => Promise<void>): Promise<void> {
    if (this.enabled) {
      process.stdout.write(`[DRY-RUN] would execute: ${actionName}\n`)
      return Promise.resolve()
    }
    return fn()
  }
}
