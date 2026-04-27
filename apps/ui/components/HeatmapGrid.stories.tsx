import type { Meta, StoryObj } from '@storybook/react'
import HeatmapGrid from './HeatmapGrid'
import type { Finding } from '@/lib/types'

const meta: Meta<typeof HeatmapGrid> = {
  title: 'Components/HeatmapGrid',
  component: HeatmapGrid,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof HeatmapGrid>

const severities = ['critical', 'high', 'medium', 'low'] as const
const categories = ['security', 'performance', 'quality', 'testing']

function makeFindings(count: number): Finding[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `finding-${i}`,
    message: `Finding #${i + 1}: issue detected in module`,
    severity: severities[i % severities.length],
    category: categories[i % categories.length],
    runId: 'run-001',
    file: `src/module-${i % 5}.ts`,
    phase: ['perf', 'security', 'review'][i % 3],
  }))
}

export const Dense: Story = {
  args: {
    findings: makeFindings(40),
  },
}

export const Sparse: Story = {
  args: {
    findings: makeFindings(6),
  },
}

export const Empty: Story = {
  args: {
    findings: [],
  },
}

export const CriticalHeavy: Story = {
  args: {
    findings: [
      ...Array.from({ length: 8 }, (_, i) => ({
        id: `crit-${i}`,
        message: `Critical security issue #${i + 1}`,
        severity: 'critical' as const,
        category: categories[i % categories.length],
        runId: 'run-002',
        file: `src/auth.ts`,
        phase: 'security',
      })),
      ...makeFindings(10),
    ],
  },
}
