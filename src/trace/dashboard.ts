import { z } from 'zod';
import { readTrace } from './reader.js';
import { FindingWriter } from './finding-writer.js';
import { CostAccumulator } from '../cost/accumulator.js';
import { TraceEvent, CURRENT_SCHEMA_VERSION } from '../schemas/index.js';

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins > 0) return `${mins}m ${String(secs).padStart(2, '0')}s`;
  return `${secs}s`;
}

function formatDate(ts: string): string {
  const d = new Date(ts);
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm} UTC`;
}

function toStr(val: unknown, fallback = 'N/A'): string {
  return typeof val === 'string' && val.length > 0 ? val : fallback;
}

interface PhaseRow {
  phase: string;
  startTs: string | null;
  endTs: string | null;
  status: string | null;
  gate: string | null;
}

function buildGateByPhase(events: TraceEvent[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const e of events) {
    if (e.eventType === 'gate') {
      const phase = typeof e.payload['phase'] === 'string' ? e.payload['phase'] : null;
      const decision = typeof e.payload['decision'] === 'string' ? e.payload['decision'] : null;
      if (phase && decision) map.set(phase, decision);
    }
  }
  return map;
}

function buildPhaseRows(events: TraceEvent[], gateByPhase: Map<string, string>): PhaseRow[] {
  const phases = new Map<string, PhaseRow>();

  for (const e of events) {
    const phase = typeof e.payload['phase'] === 'string' ? e.payload['phase'] : null;
    if (!phase) continue;

    if (e.eventType === 'phase_start') {
      if (!phases.has(phase)) {
        phases.set(phase, { phase, startTs: e.ts, endTs: null, status: null, gate: null });
      } else {
        phases.get(phase)!.startTs = e.ts;
      }
    }

    if (e.eventType === 'phase_end') {
      if (!phases.has(phase)) {
        phases.set(phase, { phase, startTs: null, endTs: e.ts, status: null, gate: null });
      }
      const row = phases.get(phase)!;
      row.endTs = e.ts;
      row.status = typeof e.payload['status'] === 'string' ? e.payload['status'] : null;
    }
  }

  for (const row of phases.values()) {
    row.gate = gateByPhase.get(row.phase) ?? null;
  }

  return Array.from(phases.values());
}

function renderGate(gate: string | null): string {
  if (!gate) return '—';
  if (gate === 'pass') return '✅ aprovado';
  if (gate === 'warn') return '⚠️ aviso';
  if (gate === 'fail') return '❌ reprovado';
  return gate;
}

function renderPhaseStatus(status: string | null): string {
  if (!status) return '—';
  if (status === 'success') return '✅ pronto';
  if (status === 'failed') return '❌ falhou';
  return status;
}

export async function generateDashboard(runId: string): Promise<string> {
  z.string().uuid().parse(runId);

  const [events, findings, { totalUsd, byPhase: costByPhase }] = await Promise.all([
    readTrace(runId).catch((err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') return [] as TraceEvent[];
      throw err;
    }),
    FindingWriter.readAll(runId),
    new CostAccumulator().getTotal(runId),
  ]);

  const runStart = events.find((e) => e.eventType === 'run_start');
  const runEnd = events.find((e) => e.eventType === 'run_end');

  const issue = toStr(runStart?.payload['issue']);
  const branch = toStr(runStart?.payload['branch']);
  const model = toStr(runStart?.payload['model']);
  const startedTs = runStart?.ts ?? events[0]?.ts ?? null;
  const endedTs = runEnd?.ts ?? events[events.length - 1]?.ts ?? null;

  const durationMs =
    startedTs && endedTs ? new Date(endedTs).getTime() - new Date(startedTs).getTime() : null;

  const runStatus = (() => {
    const s = runEnd?.payload['status'];
    if (s === 'success') return '✅ passou';
    if (s === 'failed') return '❌ falhou';
    const anyFailed = events.some((e) => e.eventType === 'phase_end' && e.payload['status'] === 'failed');
    return anyFailed ? '❌ falhou' : events.length > 0 ? '🔄 em andamento' : '—';
  })();

  const gateByPhase = buildGateByPhase(events);
  const phaseRows = buildPhaseRows(events, gateByPhase);

  const findingCounts = findings.reduce<Record<string, number>>(
    (acc, f) => { acc[f.severity] = (acc[f.severity] ?? 0) + 1; return acc; },
    {},
  );

  const lines: string[] = [];

  lines.push(`# Relatório de Run — ${runId}`);
  lines.push('');
  lines.push(`**Issue:** ${issue}`);
  lines.push(`**Branch:** ${branch}`);
  lines.push(`**Status:** ${runStatus}`);
  lines.push(`**Iniciado:** ${startedTs ? formatDate(startedTs) : 'N/A'}`);
  lines.push(`**Duração:** ${durationMs !== null ? formatDuration(durationMs) : 'N/A'}`);
  lines.push(`**Custo Total:** $${totalUsd.toFixed(4)}`);
  lines.push(`**Modelo:** ${model}`);
  lines.push('');

  lines.push('## Timeline de Fases');
  lines.push('');
  lines.push('| Fase | Status | Duração | Tokens | Custo | Gate |');
  lines.push('|------|--------|---------|--------|-------|------|');

  if (phaseRows.length === 0) {
    lines.push('| — | — | — | — | — | — |');
  } else {
    for (const row of phaseRows) {
      const dur =
        row.startTs && row.endTs
          ? formatDuration(new Date(row.endTs).getTime() - new Date(row.startTs).getTime())
          : '—';
      const phaseCost = costByPhase[row.phase];
      const tokens = phaseCost ? phaseCost.tokens.toLocaleString('pt-BR') : '—';
      const cost = phaseCost ? `$${phaseCost.usd.toFixed(4)}` : '—';
      lines.push(
        `| ${row.phase} | ${renderPhaseStatus(row.status)} | ${dur} | ${tokens} | ${cost} | ${renderGate(row.gate)} |`,
      );
    }
  }

  lines.push('');
  lines.push('## Resumo de Findings');
  lines.push('');
  lines.push('| Severidade | Quantidade |');
  lines.push('|------------|------------|');

  const severityLabels: Array<[string, string]> = [
    ['critical', 'crítico'],
    ['high', 'alto'],
    ['medium', 'médio'],
    ['low', 'baixo'],
  ];

  for (const [sev, label] of severityLabels) {
    lines.push(`| ${label} | ${findingCounts[sev] ?? 0} |`);
  }

  const frontMatter = [
    '---',
    `schemaVersion: "${CURRENT_SCHEMA_VERSION}"`,
    `runId: "${runId}"`,
    `createdAt: "${new Date().toISOString()}"`,
    '---',
    '',
  ].join('\n');

  return frontMatter + lines.join('\n');
}
