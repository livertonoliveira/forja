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
      desc: 'Eventos webhook mortos — {count} total',
      no_events: 'Nenhum evento morto',
      no_events_desc: 'Todos os webhooks estão saudáveis.',
      load_more: 'Carregar mais',
      columns: {
        type: 'Tipo',
        status: 'Status',
        attempts: 'Tentativas',
        last_error: 'Último Erro',
        date: 'Data',
        actions: 'Ações',
      },
      status: {
        dead: 'morto',
        reprocessed: 'reprocessado',
        ignored: 'ignorado',
      },
      actions: {
        reprocess: 'Reprocessar',
        ignore: 'Ignorar',
        copy: 'Copiar JSON',
        close: 'Fechar',
        reprocessing: 'Reprocessando…',
        ignoring: 'Ignorando…',
        copied: 'Copiado!',
      },
      modal: {
        title: 'Payload do Evento',
      },
      filters: {
        all_statuses: 'Todos os status',
        all_types: 'Todos os tipos',
      },
    },
    common: {
      settings: 'Configurações',
      lang: 'EN',
      langFull: 'Switch to English',
    },
    commandPalette: {
      placeholder: 'Buscar comandos, runs, findings…',
      noResults: 'Nenhum resultado para',
      tryDifferentTerm: 'Tente um termo diferente',
      groups: {
        navigation: 'Navegação',
        recentRuns: 'Runs Recentes',
        findings: 'Findings',
        actions: 'Ações',
        help: 'Ajuda',
      },
      footer: {
        navigate: 'navegar',
        select: 'selecionar',
        close: 'fechar',
      },
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
      desc: 'Dead webhook events — {count} total',
      no_events: 'No dead events',
      no_events_desc: 'All webhooks are healthy.',
      load_more: 'Load more',
      columns: {
        type: 'Type',
        status: 'Status',
        attempts: 'Attempts',
        last_error: 'Last Error',
        date: 'Date',
        actions: 'Actions',
      },
      status: {
        dead: 'dead',
        reprocessed: 'reprocessed',
        ignored: 'ignored',
      },
      actions: {
        reprocess: 'Reprocess',
        ignore: 'Ignore',
        copy: 'Copy JSON',
        close: 'Close',
        reprocessing: 'Reprocessing…',
        ignoring: 'Ignoring…',
        copied: 'Copied!',
      },
      modal: {
        title: 'Event Payload',
      },
      filters: {
        all_statuses: 'All statuses',
        all_types: 'All types',
      },
    },
    common: {
      settings: 'Settings',
      lang: 'PT',
      langFull: 'Mudar para Português',
    },
    commandPalette: {
      placeholder: 'Search commands, runs, findings…',
      noResults: 'No results for',
      tryDifferentTerm: 'Try a different term',
      groups: {
        navigation: 'Navigation',
        recentRuns: 'Recent Runs',
        findings: 'Findings',
        actions: 'Actions',
        help: 'Help',
      },
      footer: {
        navigate: 'navigate',
        select: 'select',
        close: 'close',
      },
    },
  },
} as const satisfies Record<Locale, object>;

export type Translations = typeof translations['pt'];
