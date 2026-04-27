import type { Logger } from '../../plugin/types.js';

export interface MigrationContext {
  from: { schemaVersion: string; payload: unknown };
  to: { schemaVersion: string };
  logger: Logger;
}

export interface Migration {
  from: string;
  to: string;
  apply(ctx: MigrationContext): unknown;
  describe(): string;
}

function assertPlainObject(value: unknown, context: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context}: payload must be a plain object, got ${value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value}`);
  }
}

export function addField<T>(name: string, defaultValue: T, from: string, to: string): Migration {
  const clonedDefault = structuredClone(defaultValue);
  return {
    from,
    to,
    apply(ctx: MigrationContext): unknown {
      if (ctx.from.schemaVersion === to) return ctx.from.payload;
      assertPlainObject(ctx.from.payload, `addField("${name}")`);
      if (Object.prototype.hasOwnProperty.call(ctx.from.payload, name)) {
        return ctx.from.payload;
      }
      return { ...ctx.from.payload, [name]: clonedDefault };
    },
    describe(): string {
      return `addField("${name}", ${JSON.stringify(defaultValue)}) [${from} → ${to}]`;
    },
  };
}

export function renameField(oldName: string, newName: string, from: string, to: string): Migration {
  return {
    from,
    to,
    apply(ctx: MigrationContext): unknown {
      if (ctx.from.schemaVersion === to) return ctx.from.payload;
      assertPlainObject(ctx.from.payload, `renameField("${oldName}" → "${newName}")`);
      const hasOld = Object.prototype.hasOwnProperty.call(ctx.from.payload, oldName);
      const hasNew = Object.prototype.hasOwnProperty.call(ctx.from.payload, newName);
      if (!hasOld && hasNew) return ctx.from.payload;
      if (!hasOld) {
        throw new Error(`renameField: field "${oldName}" not found in payload and "${newName}" is also absent`);
      }
      if (hasOld && hasNew) {
        ctx.logger.warn(`renameField: both "${oldName}" and "${newName}" exist — "${newName}" will be overwritten with "${oldName}"'s value`);
      }
      const { [oldName]: value, ...rest } = ctx.from.payload;
      return { ...rest, [newName]: value };
    },
    describe(): string {
      return `renameField("${oldName}" → "${newName}") [${from} → ${to}]`;
    },
  };
}

export function removeField(name: string, from: string, to: string): Migration {
  return {
    from,
    to,
    apply(ctx: MigrationContext): unknown {
      if (ctx.from.schemaVersion === to) return ctx.from.payload;
      assertPlainObject(ctx.from.payload, `removeField("${name}")`);
      if (!Object.prototype.hasOwnProperty.call(ctx.from.payload, name)) {
        return ctx.from.payload;
      }
      const { [name]: _removed, ...rest } = ctx.from.payload;
      return rest;
    },
    describe(): string {
      return `removeField("${name}") [${from} → ${to}]`;
    },
  };
}

export function transformPayload(fn: (payload: unknown) => unknown, from: string, to: string): Migration {
  if (typeof fn !== 'function') {
    throw new Error(`transformPayload: fn must be a function, got ${typeof fn}`);
  }
  return {
    from,
    to,
    apply(ctx: MigrationContext): unknown {
      if (ctx.from.schemaVersion === to) return ctx.from.payload;
      return fn(ctx.from.payload);
    },
    describe(): string {
      return `transformPayload(fn) [${from} → ${to}]`;
    },
  };
}

export function composeMigrations(...migrations: Migration[]): Migration {
  if (migrations.length === 0) {
    throw new Error('composeMigrations: migrations array must not be empty');
  }

  for (let i = 0; i < migrations.length - 1; i++) {
    const current = migrations[i];
    const next = migrations[i + 1];
    if (current.to !== next.from) {
      throw new Error(
        `composeMigrations: incompatible adjacent migrations — migration[${i}].to is "${current.to}" but migration[${i + 1}].from is "${next.from}"`
      );
    }
  }

  const composedFrom = migrations[0].from;
  const composedTo = migrations[migrations.length - 1].to;

  return {
    from: composedFrom,
    to: composedTo,
    apply(ctx: MigrationContext): unknown {
      if (ctx.from.schemaVersion === composedTo) return ctx.from.payload;
      let payload = ctx.from.payload;
      let currentVersion = ctx.from.schemaVersion;
      for (const migration of migrations) {
        payload = migration.apply({
          from: { schemaVersion: currentVersion, payload },
          to: { schemaVersion: migration.to },
          logger: ctx.logger,
        });
        currentVersion = migration.to;
      }
      return payload;
    },
    describe(): string {
      return migrations.map((m) => m.describe()).join(' → ');
    },
  };
}
