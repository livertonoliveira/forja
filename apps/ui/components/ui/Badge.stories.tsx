import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Badge } from './badge'

const meta: Meta<typeof Badge> = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['pass', 'warn', 'fail', 'unknown', 'default'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Badge>

export const Pass: Story = {
  args: { variant: 'pass', children: 'pass' },
}

export const Warn: Story = {
  args: { variant: 'warn', children: 'warn' },
}

export const Fail: Story = {
  args: { variant: 'fail', children: 'fail' },
}

export const Unknown: Story = {
  args: { variant: 'unknown', children: 'unknown' },
}

export const Default: Story = {
  args: { variant: 'default', children: 'default' },
}

export const AllVariants: Story = {
  render: () => (
    <div className="flex gap-3 flex-wrap">
      <Badge variant="pass">pass</Badge>
      <Badge variant="warn">warn</Badge>
      <Badge variant="fail">fail</Badge>
      <Badge variant="unknown">unknown</Badge>
      <Badge variant="default">default</Badge>
    </div>
  ),
}
