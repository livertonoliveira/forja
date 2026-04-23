import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './table'
import { Badge } from './badge'

const FAKE_ROWS = Array.from({ length: 20 }, (_, i) => ({
  id: `run-${String(i + 1).padStart(3, '0')}`,
  name: `Pipeline Run #${i + 1}`,
  status: (['pass', 'warn', 'fail', 'unknown'] as const)[i % 4],
  duration: `${(i % 9) * 20 + 15}s`,
  date: new Date(Date.UTC(2026, 3, 22) - i * 86400000).toLocaleDateString(),
}))

const meta: Meta<typeof Table> = {
  title: 'UI/Table',
  component: Table,
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj<typeof Table>

export const Default: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Duration</TableHead>
          <TableHead>Date</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FAKE_ROWS.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-mono text-xs">{row.id}</TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>
              <Badge variant={row.status}>{row.status}</Badge>
            </TableCell>
            <TableCell className="font-mono">{row.duration}</TableCell>
            <TableCell className="text-forja-text-secondary">{row.date}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const WithSelection: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <input type="checkbox" className="accent-forja-border-gold" />
          </TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Duration</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {FAKE_ROWS.slice(0, 5).map((row, i) => (
          <TableRow key={row.id} className={i === 1 ? 'bg-forja-bg-overlay' : ''}>
            <TableCell>
              <input type="checkbox" defaultChecked={i === 1} className="accent-forja-border-gold" />
            </TableCell>
            <TableCell>{row.name}</TableCell>
            <TableCell>
              <Badge variant={row.status}>{row.status}</Badge>
            </TableCell>
            <TableCell className="font-mono">{row.duration}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  ),
}

export const Empty: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell colSpan={3} className="text-center text-forja-text-muted py-12">
            No pipeline runs found.
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
}
