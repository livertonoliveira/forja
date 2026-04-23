import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetClose } from './sheet'
import { Button } from './button'
import { Badge } from './badge'

const meta: Meta<typeof Sheet> = {
  title: 'UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Sheet>

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open Sheet</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Pipeline Details</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 mt-4">
          <p className="text-forja-text-secondary text-sm">Sheet body content. This panel slides in from the right.</p>
          <div className="flex gap-2">
            <Badge variant="pass">pass</Badge>
            <span className="text-forja-text-secondary text-sm">3 phases completed</span>
          </div>
        </div>
        <div className="absolute bottom-6 right-6 flex gap-2">
          <SheetClose asChild>
            <Button variant="ghost" size="sm">Close</Button>
          </SheetClose>
          <Button size="sm">Save</Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const WithHeaderBodyFooter: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button>Open Full Sheet</Button>
      </SheetTrigger>
      <SheetContent className="flex flex-col">
        <SheetHeader>
          <SheetTitle>Run #042 — Full Report</SheetTitle>
          <p className="text-forja-text-secondary text-sm">Completed in 142s · April 22, 2026</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto mt-4 space-y-3">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="rounded-md border border-forja-border-subtle p-3">
              <p className="text-forja-text-primary text-sm font-medium">Phase {i + 1}</p>
              <p className="text-forja-text-muted text-xs mt-1">Details for pipeline phase {i + 1}.</p>
            </div>
          ))}
        </div>
        <div className="border-t border-forja-border-subtle pt-4 mt-4 flex justify-end gap-2">
          <SheetClose asChild>
            <Button variant="ghost" size="sm">Dismiss</Button>
          </SheetClose>
          <Button size="sm">Export</Button>
        </div>
      </SheetContent>
    </Sheet>
  ),
}

export const WithLongScrollableContent: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline">Open (Long Content)</Button>
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>All Findings</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto mt-4 space-y-2">
          {Array.from({ length: 30 }, (_, i) => (
            <div key={i} className="border-b border-forja-border-subtle pb-3">
              <div className="flex items-center gap-2">
                <Badge variant={(['pass', 'warn', 'fail', 'unknown'] as const)[i % 4]}>
                  {(['pass', 'warn', 'fail', 'unknown'] as const)[i % 4]}
                </Badge>
                <span className="text-forja-text-primary text-xs">Finding #{i + 1}</span>
              </div>
              <p className="text-forja-text-muted text-xs mt-1">src/module-{i}.ts line {i * 3 + 10}</p>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  ),
}
