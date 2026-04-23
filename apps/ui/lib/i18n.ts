export type Locale = 'pt' | 'en';

export const translations = {
  pt: {
    nav: {
      pipeline: 'Pipeline',
      observability: 'Observabilidade',
      runs: 'Execuções',
      issues: 'Tarefas',
      cost: 'Custo',
      heatmap: 'Mapa de Achados',
      dlq: 'Fila Morta',
    },
    search: {
      placeholder: 'Buscar execuções, achados, tarefas…',
      noResults: 'Nenhum resultado encontrado.',
      runs: 'Execuções',
      issues: 'Tarefas',
    },
    runs: {
      title: 'Execuções Recentes',
      columns: {
        issue: 'Tarefa',
        status: 'Status',
        duration: 'Duração',
        cost: 'Custo',
        gate: 'Gate',
        started: 'Início',
      },
      empty: 'Nenhuma execução encontrada.',
      inProgress: 'em andamento',
    },
    issues: {
      title: 'Tarefas',
      columns: {
        issue: 'Tarefa',
        runs: 'Execuções',
        lastGate: 'Último Gate',
        lastRun: 'Última Execução',
      },
      empty: 'Nenhuma tarefa encontrada.',
    },
    cost: {
      title: 'Custo',
    },
    heatmap: {
      title: 'Mapa de Achados',
    },
    dlq: {
      title: 'Fila Morta',
      empty: 'Nenhuma execução com falha.',
      description: 'Execuções que falharam e precisam de atenção.',
    },
    common: {
      settings: 'Configurações',
      lang: 'EN',
      langFull: 'Switch to English',
    },
  },
  en: {
    nav: {
      pipeline: 'Pipeline',
      observability: 'Observability',
      runs: 'Runs',
      issues: 'Issues',
      cost: 'Cost',
      heatmap: 'Findings Heatmap',
      dlq: 'Dead Letter Queue',
    },
    search: {
      placeholder: 'Search runs, findings, issues…',
      noResults: 'No results found.',
      runs: 'Runs',
      issues: 'Issues',
    },
    runs: {
      title: 'Recent Runs',
      columns: {
        issue: 'Issue',
        status: 'Status',
        duration: 'Duration',
        cost: 'Cost',
        gate: 'Gate',
        started: 'Started',
      },
      empty: 'No runs found.',
      inProgress: 'in progress',
    },
    issues: {
      title: 'Issues',
      columns: {
        issue: 'Issue',
        runs: 'Runs',
        lastGate: 'Last Gate',
        lastRun: 'Last Run',
      },
      empty: 'No issues found.',
    },
    cost: {
      title: 'Cost',
    },
    heatmap: {
      title: 'Findings Heatmap',
    },
    dlq: {
      title: 'Dead Letter Queue',
      empty: 'No failed runs.',
      description: 'Runs that failed and need attention.',
    },
    common: {
      settings: 'Settings',
      lang: 'PT',
      langFull: 'Mudar para Português',
    },
  },
} as const satisfies Record<Locale, object>;

export type Translations = typeof translations['pt'];
