import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './card'
import { Button } from './button'
import { Skeleton } from './skeleton'

const meta: Meta<typeof Card> = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
  argTypes: {
    variant: {
      control: 'select',
      options: ['default', 'premium'],
    },
  },
}

export default meta
type Story = StoryObj<typeof Card>

export const Default: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Pipeline Run #042</CardTitle>
        <CardDescription>Last run 2 minutes ago.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-forja-text-secondary text-sm">3 phases completed, 0 findings.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">View Details</Button>
      </CardFooter>
    </Card>
  ),
  args: { variant: 'default' },
}

export const Premium: Story = {
  render: (args) => (
    <Card {...args} className="w-80">
      <CardHeader>
        <CardTitle>Design System M1</CardTitle>
        <CardDescription>Luxury dark theme, gold accents.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-forja-text-secondary text-sm">Premium gradient surface with backdrop blur.</p>
      </CardContent>
    </Card>
  ),
  args: { variant: 'premium' },
}

export const WithSkeletonLoading: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <Skeleton className="h-5 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-4 w-full mb-2" />
        <Skeleton className="h-4 w-3/4 mb-2" />
        <Skeleton className="h-4 w-1/2" />
      </CardContent>
      <CardFooter>
        <Skeleton className="h-8 w-24" />
      </CardFooter>
    </Card>
  ),
}

export const HoverState: Story = {
  render: () => (
    <div className="flex gap-4 flex-wrap">
      <Card className="w-64 cursor-pointer">
        <CardHeader>
          <CardTitle>Hover Me</CardTitle>
          <CardDescription>Gold border + glow on hover.</CardDescription>
        </CardHeader>
      </Card>
      <Card variant="premium" className="w-64 cursor-pointer">
        <CardHeader>
          <CardTitle>Premium Hover</CardTitle>
          <CardDescription>Gradient + glow effect.</CardDescription>
        </CardHeader>
      </Card>
    </div>
  ),
}
