import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { TrendChart } from './TrendChart'

const meta: Meta<typeof TrendChart> = {
  title: 'UI/TrendChart',
  component: TrendChart,
  tags: ['autodocs'],
  argTypes: {
    loading: { control: 'boolean' },
    data: { control: 'object' },
  },
}

export default meta
type Story = StoryObj<typeof TrendChart>

const weekData = [
  { label: 'Mon', value: 12 },
  { label: 'Tue', value: 18 },
  { label: 'Wed', value: 8 },
  { label: 'Thu', value: 25 },
  { label: 'Fri', value: 15 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 20 },
]

const dataWithGaps = [
  { label: 'Mon', value: 12 },
  { label: 'Tue', value: 0 },
  { label: 'Wed', value: 8 },
  { label: 'Thu', value: 0 },
  { label: 'Fri', value: 15 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 20 },
]

export const WithData: Story = {
  args: { data: weekData },
}

export const WithGap: Story = {
  args: { data: dataWithGaps },
}

export const Loading: Story = {
  args: { loading: true },
}

export const Empty: Story = {
  args: { data: [] },
}

export const AllStates: Story = {
  render: () => (
    <div className="grid grid-cols-2 gap-4 w-[700px]">
      <div>
        <p className="text-forja-text-muted text-xs mb-2 uppercase tracking-wider">With Data</p>
        <TrendChart data={weekData} />
      </div>
      <div>
        <p className="text-forja-text-muted text-xs mb-2 uppercase tracking-wider">With Gap</p>
        <TrendChart data={dataWithGaps} />
      </div>
      <div>
        <p className="text-forja-text-muted text-xs mb-2 uppercase tracking-wider">Loading</p>
        <TrendChart loading />
      </div>
      <div>
        <p className="text-forja-text-muted text-xs mb-2 uppercase tracking-wider">Empty</p>
        <TrendChart data={[]} />
      </div>
    </div>
  ),
}
