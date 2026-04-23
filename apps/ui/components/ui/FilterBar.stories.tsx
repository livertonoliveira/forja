import * as React from 'react'
import { useState } from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { FilterBar } from './FilterBar'

const meta: Meta<typeof FilterBar> = {
  title: 'UI/FilterBar',
  component: FilterBar,
  tags: ['autodocs'],
  argTypes: {
    filters: { control: 'object' },
    activeFilters: { control: 'object' },
    onFilterChange: { action: 'onFilterChange' },
    onReset: { action: 'onReset' },
  },
  args: {
    onFilterChange: fn(),
    onReset: fn(),
  },
}

export default meta
type Story = StoryObj<typeof FilterBar>

const defaultFilters = [
  { label: 'Pass', value: 'pass', variant: 'pass' as const },
  { label: 'Warn', value: 'warn', variant: 'warn' as const },
  { label: 'Fail', value: 'fail', variant: 'fail' as const },
  { label: 'Unknown', value: 'unknown', variant: 'unknown' as const },
  { label: 'Frontend', value: 'frontend' },
  { label: 'Backend', value: 'backend' },
  { label: 'Security', value: 'security' },
]

export const AllEmpty: Story = {
  args: {
    filters: defaultFilters,
    activeFilters: [],
  },
}

export const SomeApplied: Story = {
  args: {
    filters: defaultFilters,
    activeFilters: ['pass', 'frontend'],
  },
}

export const ResetState: Story = {
  args: {
    filters: defaultFilters,
    activeFilters: ['fail', 'warn', 'security'],
  },
}

export const Interactive: Story = {
  render: () => {
    const [active, setActive] = useState<string[]>([])
    return (
      <div className="space-y-4">
        <FilterBar
          filters={defaultFilters}
          activeFilters={active}
          onFilterChange={setActive}
          onReset={() => setActive([])}
        />
        <p className="text-forja-text-muted text-xs font-mono">
          Active: [{active.map((v) => `"${v}"`).join(', ')}]
        </p>
      </div>
    )
  },
}
