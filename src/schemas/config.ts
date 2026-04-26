import { z } from 'zod';

export const SUPPORTED_ARTIFACT_LANGUAGES = ['en', 'pt-BR', 'es', 'fr', 'de', 'ja', 'zh-CN'] as const;

export type ArtifactLanguage = (typeof SUPPORTED_ARTIFACT_LANGUAGES)[number];

export const JiraConfigSchema = z.object({
  baseUrl: z.string().url(),
  email: z.string().email(),
  token: z.string().min(1),
  projectKey: z.string().min(1),
})

export const GitLabConfigSchema = z.object({
  baseUrl: z.string().url(),
  token: z.string().min(1),
})

export const AzureDevOpsConfigSchema = z.object({
  orgUrl: z.string().url(),
  project: z.string().min(1),
  token: z.string().min(1),
})

export const BitbucketConfigSchema = z.object({
  workspace: z.string().min(1),
  repoSlug: z.string().min(1),
  username: z.string().min(1),
  appPassword: z.string().min(1),
})

export type JiraConfig = z.infer<typeof JiraConfigSchema>
export type GitLabConfig = z.infer<typeof GitLabConfigSchema>
export type AzureDevOpsConfig = z.infer<typeof AzureDevOpsConfigSchema>
export type BitbucketConfig = z.infer<typeof BitbucketConfigSchema>

export const PhaseTimeoutsSchema = z.object({
  dev: z.number().int().positive().default(600),
  test: z.number().int().positive().default(300),
  perf: z.number().int().positive().default(180),
  security: z.number().int().positive().default(180),
  review: z.number().int().positive().default(180),
  homolog: z.number().int().positive().default(60),
  pr: z.number().int().positive().default(120),
});

export const ConfigSchema = z.object({
  storeUrl: z.string(),
  retentionDays: z.number().int().default(90),
  phasesDir: z.string(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
  teamId: z.string(),
  linearToken: z.string().optional(),
  jira: JiraConfigSchema.optional(),
  gitlab: GitLabConfigSchema.optional(),
  azure: AzureDevOpsConfigSchema.optional(),
  bitbucket: BitbucketConfigSchema.optional(),
  timeouts: PhaseTimeoutsSchema.default({}),
  pluginHookTimeoutMs: z.number().int().positive().default(5000),
  artifact_language: z.enum(SUPPORTED_ARTIFACT_LANGUAGES).default('en'),
});

export type Config = z.infer<typeof ConfigSchema>;
export type PhaseTimeouts = z.infer<typeof PhaseTimeoutsSchema>;
