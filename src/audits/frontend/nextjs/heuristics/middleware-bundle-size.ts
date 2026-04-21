import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AuditContext, AuditFinding } from '../../../../plugin/types.js';
import { collectFrontendFiles, validateCwd } from '../../utils.js';

const HEAVY_LIBS = [
  'lodash', 'moment', 'moment-timezone', 'date-fns', 'axios',
  '@mui/', '@chakra-ui/', '@emotion/', 'styled-components',
  'react-dom', 'sharp', 'fs-extra', 'rimraf', 'glob',
  'pg', 'mysql', 'mysql2', 'mongodb', '@prisma/client', 'prisma',
  'typeorm', 'sequelize', 'mongoose', 'drizzle-orm',
  'yup', 'joi', 'class-validator',
];

export async function detectMiddlewareBundleSize(ctx: AuditContext): Promise<AuditFinding[]> {
  validateCwd(ctx.cwd);

  let files: string[];
  try {
    files = collectFrontendFiles(ctx.cwd, ctx.abortSignal)
      .filter((f) => /middleware.*\.[jt]sx?$/.test(f));
  } catch {
    return [];
  }

  if (files.length === 0) {
    // Fallback: explicit middleware locations
    const candidates = [
      join(ctx.cwd, 'middleware.ts'),
      join(ctx.cwd, 'middleware.js'),
      join(ctx.cwd, 'src', 'middleware.ts'),
      join(ctx.cwd, 'src', 'middleware.js'),
    ];
    files = candidates.filter((f) => {
      try {
        readFileSync(f);
        return true;
      } catch {
        return false;
      }
    });
  }

  const findings: AuditFinding[] = [];

  for (const filePath of files) {
    if (ctx.abortSignal.aborted) break;

    let content: string;
    try {
      content = readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const heavyImports: string[] = [];
    let match: RegExpExecArray | null;
    const importRe = /^import\s+.*from\s+['"]([^'"]+)['"]/gm;

    while ((match = importRe.exec(content)) !== null) {
      const pkg = match[1];
      if (HEAVY_LIBS.some((lib) => pkg === lib || pkg.startsWith(lib + '/'))) {
        heavyImports.push(pkg);
      }
    }

    if (heavyImports.length === 0) continue;

    findings.push({
      severity: 'high',
      title: `Middleware imports heavy libraries: ${heavyImports.join(', ')}`,
      category: 'performance:middleware-bundle-size',
      filePath: relative(ctx.cwd, filePath),
      description:
        `Next.js middleware runs on every request in the Edge Runtime. ` +
        `Importing large libraries (${heavyImports.join(', ')}) inflates the middleware bundle, ` +
        `increases cold-start latency, and may exceed the 1 MB Edge Runtime size limit. ` +
        `Replace with lightweight Edge-compatible alternatives or move the logic to a Route Handler.`,
    });
  }

  return findings;
}
