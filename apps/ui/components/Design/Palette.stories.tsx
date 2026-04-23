import * as React from 'react'
import type { Meta, StoryObj } from '@storybook/react'
import { colors } from '@/lib/tokens'
import { typography } from '@/lib/typography'

const meta: Meta = {
  title: 'Design/Palette',
  tags: ['autodocs'],
}

export default meta
type Story = StoryObj

function ColorSwatch({ name, value }: { name: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded border border-forja-border-subtle flex-shrink-0"
        style={{ backgroundColor: value }}
      />
      <div>
        <p className="text-forja-text-primary text-xs font-mono">{name}</p>
        <p className="text-forja-text-muted text-xs font-mono">{value}</p>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-10">
      <h2 className="font-sans text-xs uppercase tracking-[0.2em] text-forja-text-gold mb-4">{title}</h2>
      {children}
    </div>
  )
}

export const FullPalette: Story = {
  render: () => (
    <div className="max-w-3xl space-y-2">
      <Section title="Background">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(colors.bg).map(([k, v]) => (
            <ColorSwatch key={k} name={`bg.${k}`} value={v} />
          ))}
        </div>
      </Section>

      <Section title="Border">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(colors.border).map(([k, v]) => (
            <ColorSwatch key={k} name={`border.${k}`} value={v} />
          ))}
        </div>
      </Section>

      <Section title="Text">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Object.entries(colors.text).map(([k, v]) => (
            <ColorSwatch key={k} name={`text.${k}`} value={v} />
          ))}
        </div>
      </Section>

      <Section title="Gold">
        <div className="grid grid-cols-3 gap-4 max-w-sm">
          {Object.entries(colors.gold).map(([k, v]) => (
            <ColorSwatch key={k} name={`gold.${k}`} value={v} />
          ))}
        </div>
      </Section>

      <Section title="Gate Status">
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          {Object.entries(colors.gate).map(([status, palette]) => (
            <div key={status} className="space-y-2">
              <p className="text-forja-text-secondary text-xs uppercase tracking-wider font-mono">{status}</p>
              {Object.entries(palette).map(([k, v]) => (
                <ColorSwatch key={k} name={k} value={v} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Gold Gradient">
        <div
          className="h-12 w-full max-w-sm rounded-lg"
          style={{ background: `linear-gradient(135deg, ${colors.gold.from}, ${colors.gold.mid}, ${colors.gold.to})` }}
        />
      </Section>

      <Section title="Typography Scale">
        <div className="space-y-6">
          <div>
            <p className="text-forja-text-muted text-xs font-mono mb-3">Display — Fraunces</p>
            {Object.entries(typography.display).map(([size, classes]) => (
              <p key={size} className={`${classes} text-forja-text-primary mb-2`}>
                Display {size}
              </p>
            ))}
          </div>
          <div>
            <p className="text-forja-text-muted text-xs font-mono mb-3">Heading — Inter</p>
            {Object.entries(typography.heading).map(([size, classes]) => (
              <p key={size} className={`${classes} text-forja-text-primary mb-2`}>
                Heading {size}
              </p>
            ))}
          </div>
          <div>
            <p className="text-forja-text-muted text-xs font-mono mb-3">Body — Inter</p>
            {Object.entries(typography.body).map(([size, classes]) => (
              <p key={size} className={`${classes} text-forja-text-secondary mb-1`}>
                Body {size} — The quick brown fox jumps over the lazy dog.
              </p>
            ))}
          </div>
          <div>
            <p className="text-forja-text-muted text-xs font-mono mb-3">Mono — JetBrains Mono</p>
            {Object.entries(typography.mono).map(([size, classes]) => (
              <p key={size} className={`${classes} text-forja-text-primary mb-1`}>
                {`mono.${size} — const x = "hello world"`}
              </p>
            ))}
          </div>
          <div>
            <p className="text-forja-text-muted text-xs font-mono mb-3">Label — Gold Uppercase</p>
            {Object.entries(typography.label).map(([size, classes]) => (
              <p key={size} className={`${classes} mb-1`}>
                Label {size}
              </p>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Shadows">
        <div className="grid grid-cols-3 gap-4 max-w-lg">
          <div className="p-6 rounded-lg bg-forja-bg-surface shadow-surface flex items-center justify-center">
            <p className="text-forja-text-secondary text-xs text-center">shadow-surface</p>
          </div>
          <div className="p-6 rounded-lg bg-forja-bg-surface shadow-gold-glow border border-forja-border-gold flex items-center justify-center">
            <p className="text-forja-text-secondary text-xs text-center">shadow-gold-glow</p>
          </div>
          <div className="p-6 rounded-lg bg-forja-bg-surface shadow-gold-glow-strong border border-forja-border-gold flex items-center justify-center">
            <p className="text-forja-text-secondary text-xs text-center">gold-glow-strong</p>
          </div>
        </div>
      </Section>

      <Section title="Spacing Scale">
        <div className="flex flex-wrap gap-2 items-end">
          {[1, 2, 3, 4, 6, 8, 10, 12, 16, 20, 24].map((n) => (
            <div key={n} className="flex flex-col items-center gap-1">
              <div
                className="bg-forja-border-gold rounded"
                style={{ width: `${n * 4}px`, height: '20px' }}
              />
              <span className="text-forja-text-muted text-[9px] font-mono">{n * 4}px</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  ),
}
