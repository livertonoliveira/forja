import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { Command } from 'commander';
import { createStoreFromConfig } from '../../store/factory.js';
import { loadConfig } from '../../config/loader.js';
import { PipelineFSM, InvalidTransitionError, type PipelineState } from '../../engine/fsm.js';
import { CheckpointManager } from '../../engine/checkpoint.js';
import { PhaseIdempotencyGuard, cleanPhaseData } from '../../engine/idempotency.js';
import { DualWriter } from '../../trace/dual-writer.js';
import { TraceWriter } from '../../trace/writer.js';
import { setPhaseTimeout } from '../../engine/timeout.js';
import { PhaseTimeoutsSchema, PhasesEnabledSchema, SUPPORTED_ARTIFACT_LANGUAGES, type ArtifactLanguage } from '../../schemas/config.js';
import { buildLanguageInstruction } from '../../config/i18n.js';
import { loadModelsPolicy, getModelForPhase, type ModelsPolicy } from '../../policy/models-policy.js';
import { isProjectCapped, evaluate } from '../../cost/alerts-evaluator.js';
import { initOTel, readOTelConfig, shutdownOTel } from '../../otel/index.js';
import { withSpan } from '../../otel/tracer.js';

const MODELS_POLICY_PATH = join(dirname(fileURLToPath(import.meta.url)), '../../../policies/models.yaml');

// PIPELINE_SEQUENCE uses FSM state names ('dev'); policies/*.yaml uses canonical phase names ('develop').
const PHASE_POLICY_NAMES: Partial<Record<PipelineState, string>> = {
  dev: 'develop',
};

// spec and quality phases (perf, security, review) are driven by external agents
export const PIPELINE_SEQUENCE: PipelineState[] = ['dev', 'test', 'homolog', 'pr', 'done'];

export const runCommand = new Command('run')
  .description('Run a Linear issue through the full pipeline')
  .argument('<issue-id>', 'Issue ID to run through the pipeline')
  .option('--model <model>', 'Model to use')
  .option('--dry-run', 'Dry run mode')
  .option('--force', 'Re-run all phases regardless of existing checkpoints')
  .option('--force-phase <phase>', 'Re-run a specific phase, clearing its previous data')
  .option('--timeout-phase <phase:seconds>', 'Override timeout for a phase, e.g. dev:900')
  .action(async (issueId: string, options: { model?: string; dryRun?: boolean; force?: boolean; forcePhase?: string; timeoutPhase?: string }) => {
    // Parse timeout overrides: --timeout-phase phase:seconds
    const timeoutOverrides: Partial<Record<string, number>> = {};
    if (options.timeoutPhase) {
      const colonIdx = options.timeoutPhase.indexOf(':');
      if (colonIdx !== -1) {
        const phaseKey = options.timeoutPhase.slice(0, colonIdx);
        const seconds = parseInt(options.timeoutPhase.slice(colonIdx + 1), 10);
        if (!isNaN(seconds) && seconds > 0) {
          if (!PIPELINE_SEQUENCE.includes(phaseKey as PipelineState)) {
            console.warn(`[forja] --timeout-phase: '${phaseKey}' is not a run-driven phase and will be ignored`);
          } else {
            timeoutOverrides[phaseKey] = seconds;
          }
        }
      }
    }

    // Resolve effective timeouts (defaults from schema, overridden by CLI flag)
    const defaultTimeouts = PhaseTimeoutsSchema.parse({});
    const effectiveTimeouts: Record<string, number> = { ...defaultTimeouts, ...timeoutOverrides };

    const loadedConfigEarly = await loadConfig();
    const projectId = loadedConfigEarly.projectId;
    const capCheck = await isProjectCapped(projectId).catch(() => ({ capped: false, currentCost: 0, limit: 0 }));
    if (capCheck.capped) {
      console.error(`[forja] Budget cap reached for project ${projectId}. Current cost: $${capCheck.currentCost.toFixed(4)}, limit: $${capCheck.limit}`);
      process.exit(2);
    }

    console.log(`[forja] starting run for issue ${issueId}`);

    let modelsPolicy: ModelsPolicy | null = null;
    try {
      modelsPolicy = await loadModelsPolicy(MODELS_POLICY_PATH);
    } catch {
      console.warn('[forja] could not load models policy — FORJA_MODEL will not be set per phase');
    }

    const loadedConfig = loadedConfigEarly;
    initOTel(readOTelConfig());

    const enabledPhases = PhasesEnabledSchema.parse(loadedConfig.phases ?? {}) as Record<string, boolean | undefined>;
    const activeSequence = PIPELINE_SEQUENCE.filter((phase) => enabledPhases[phase] !== false);
    const skippedPhases = PIPELINE_SEQUENCE.filter((phase) => enabledPhases[phase] === false);
    if (skippedPhases.length > 0) {
      console.log(`[forja] phases disabled by config: ${skippedPhases.join(', ')}`);
    }

    const rawArtifactLanguage = loadedConfig.artifactLanguage ?? 'en';
    const isValidLang = (SUPPORTED_ARTIFACT_LANGUAGES as readonly string[]).includes(rawArtifactLanguage);
    if (!isValidLang) {
      console.warn(`[forja] Unsupported artifact_language "${rawArtifactLanguage}". Supported: ${SUPPORTED_ARTIFACT_LANGUAGES.join(', ')}. Falling back to "en".`);
    }
    const artifactLanguage: ArtifactLanguage = isValidLang ? (rawArtifactLanguage as ArtifactLanguage) : 'en';
    process.env.FORJA_ARTIFACT_LANGUAGE = artifactLanguage;
    process.env.FORJA_LANGUAGE_INSTRUCTION = buildLanguageInstruction(artifactLanguage);

    const store = await createStoreFromConfig();

    const run = await store.createRun({
      issueId,
      projectId,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: 'init',
      gitBranch: null,
      gitSha: null,
      model: options.model ?? null,
      totalCost: '0',
      totalTokens: 0,
    });

    console.log(`[forja] run ${run.id} started for issue ${issueId}`);

    const fsm = new PipelineFSM(store, run.id);
    const dualWriter = new DualWriter(new TraceWriter(run.id), store, run.id);
    const checkpointManager = new CheckpointManager(store, run.id);
    const guard = new PhaseIdempotencyGuard(checkpointManager);

    if (options.forcePhase) {
      await cleanPhaseData(store, run.id, options.forcePhase as PipelineState, checkpointManager);
      console.log(`[forja] cleared data for phase '${options.forcePhase}'`);
    }

    try {
      await withSpan(
        'forja.run',
        { 'forja.run.id': run.id, 'forja.project': projectId, 'forja.issue_id': issueId },
        async (runSpan) => {
          for (const phase of activeSequence) {
            const forceThis = options.force || options.forcePhase === phase;
            if (!(await guard.shouldRun(phase, { force: forceThis }))) {
              continue;
            }

            const phaseTimeout = effectiveTimeouts[phase];
            if (phaseTimeout !== undefined) {
              setPhaseTimeout(phase, phaseTimeout);
            }

            // Clear model env vars first so a previous phase's model never leaks into this phase.
            delete process.env.FORJA_MODEL;
            delete process.env.FORJA_EXPECTED_MODEL;

            const phasePolicyName = PHASE_POLICY_NAMES[phase] ?? phase;
            const phaseModel =
              options.model ?? (modelsPolicy ? getModelForPhase(phasePolicyName, modelsPolicy) : undefined);
            if (phaseModel) {
              process.env.FORJA_MODEL = phaseModel;
              process.env.FORJA_EXPECTED_MODEL = phaseModel;
            }

            await withSpan(
              `forja.phase.${phase}`,
              { 'forja.phase': phase, 'forja.run.id': run.id },
              async (phaseSpan) => {
                await dualWriter.writePhaseStart(phase);
                await fsm.transition(phase);
                console.log(`[forja] → ${phase}`);

                await dualWriter.writePhaseEnd(phase, 'success');
                await dualWriter.writeCheckpoint(phase);

                const phaseId = dualWriter.getPhaseId(phase);
                if (phaseId) {
                  await checkpointManager.save(phase, phaseId);
                }

                phaseSpan.setAttribute('forja.gate.status', 'success');
              },
            );

            if (options.dryRun) {
              runSpan.setAttribute('forja.dry_run', true);
              break;
            }
          }

          try {
            await evaluate();
          } catch (err) {
            console.warn('[forja] alerts evaluator failed:', err instanceof Error ? err.message : String(err));
          }
        },
      );
    } catch (err) {
      if (err instanceof InvalidTransitionError) {
        console.error(`[forja] ${err.message}`);
        process.exitCode = 1;
      } else {
        throw err;
      }
    } finally {
      await shutdownOTel();
      await store.close();
    }
  });
