import { Command } from 'commander'
import '../doctor/checks/index.js'
import { getChecks, type CheckResult } from '../doctor/check.js'

type CheckOutput = CheckResult & { name: string }

async function runAllChecks(): Promise<CheckOutput[]> {
  const checks = getChecks()
  const settled = await Promise.allSettled(
    checks.map((c) =>
      c
        .run()
        .then((r): CheckOutput => ({ name: c.name, ...r }))
        .catch((e: unknown): CheckOutput => ({
          name: c.name,
          status: 'fail',
          message: e instanceof Error ? e.message : String(e),
          remediation: undefined,
        })),
    ),
  )
  return settled.map((s): CheckOutput =>
    s.status === 'fulfilled'
      ? s.value
      : { name: 'unknown', status: 'fail', message: 'check failed unexpectedly', remediation: undefined },
  )
}

export const doctorCommand = new Command('doctor')
  .description('Run installation diagnostics')
  .option('--json', 'Output results as JSON')
  .action(async (options: { json?: boolean }) => {
    const results = await runAllChecks()

    const failCount = results.filter((r) => r.status === 'fail').length
    const warnCount = results.filter((r) => r.status === 'warn').length
    const code = failCount > 0 ? 2 : warnCount > 0 ? 1 : 0

    if (options.json) {
      console.log(JSON.stringify(results, null, 2))
      process.exit(code)
    }

    for (const r of results) {
      if (r.status === 'pass') {
        console.log(`✓ ${r.name} — ${r.message}`)
      } else if (r.status === 'warn') {
        console.log(`⚠ ${r.name} — ${r.message}`)
        if (r.remediation) console.log(`  → ${r.remediation}`)
      } else {
        console.log(`✗ ${r.name} — ${r.message}`)
        if (r.remediation) console.log(`  → ${r.remediation}`)
      }
    }

    if (failCount > 0) {
      console.log(`\n[forja] ${failCount} error(s), ${warnCount} warning(s)`)
    } else if (warnCount > 0) {
      console.log(`\n[forja] ${warnCount} warning(s)`)
    } else {
      console.log('\n[forja] All checks passed')
    }

    process.exit(code)
  })
