import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Skeleton } from './skeleton'

const meta: Meta<typeof Skeleton> = {
  title: 'UI/Skeleton',
  component: Skeleton,
  tags: ['autodocs'],
  argTypes: {
    className: { control: 'text' },
  },
}

export default meta
type Story = StoryObj<typeof Skeleton>

export const Default: Story = {
  args: { className: 'h-4 w-48' },
}

export const Circle: Story = {
  args: { className: 'h-12 w-12 rounded-full' },
}

export const LargeBlock: Story = {
  args: { className: 'h-32 w-full max-w-md' },
}

export const ShimmerInAction: Story = {
  render: () => (
    <div className="space-y-2 w-96">
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
}

export const CardLoading: Story = {
  render: () => (
    <div className="w-80 rounded-lg border border-forja-border-subtle p-6 space-y-3">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-8 w-24" />
    </div>
  ),
}

export const Heights: Story = {
  render: () => (
    <div className="space-y-2 w-64">
      <Skeleton className="h-2 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  ),
}
