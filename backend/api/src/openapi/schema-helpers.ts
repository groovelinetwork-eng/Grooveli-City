import type { SchemaObject, ReferenceObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

/**
 * Tiny builders so the contract reads close to the TypeScript types in
 * frontend/domain/src/types.ts. Everything here produces plain OpenAPI 3.0
 * schema objects.
 */
export type Schema = SchemaObject | ReferenceObject;

export const ref = (name: string): ReferenceObject => ({ $ref: `#/components/schemas/${name}` });

export const str = (o: SchemaObject = {}): SchemaObject => ({ type: 'string', ...o });
export const text = (maxLength: number, o: SchemaObject = {}): SchemaObject => ({ type: 'string', maxLength, ...o });
export const int = (o: SchemaObject = {}): SchemaObject => ({ type: 'integer', ...o });
export const num = (o: SchemaObject = {}): SchemaObject => ({ type: 'number', ...o });
export const bool = (o: SchemaObject = {}): SchemaObject => ({ type: 'boolean', ...o });
export const id = (description = 'Opaque identifier'): SchemaObject => ({ type: 'string', minLength: 1, maxLength: 64, description });
export const date = (o: SchemaObject = {}): SchemaObject => ({ type: 'string', format: 'date', example: '2026-11-23', ...o });
export const dateTime = (o: SchemaObject = {}): SchemaObject => ({
  type: 'string',
  format: 'date-time',
  example: '2026-11-23T09:30:00.000Z',
  ...o,
});
export const period = (): SchemaObject => ({ type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2026-11', description: 'YYYY-MM' });
export const money = (description = 'Whole naira (NGN) per month'): SchemaObject => ({ type: 'integer', minimum: 0, description });
export const pct = (): SchemaObject => ({ type: 'integer', minimum: 0, maximum: 100 });

export const enumOf = (values: readonly (string | number)[], o: SchemaObject = {}): SchemaObject => ({
  type: typeof values[0] === 'number' ? 'integer' : 'string',
  enum: [...values],
  ...o,
});

export const arr = (items: Schema, o: SchemaObject = {}): SchemaObject => ({ type: 'array', items, ...o });
export const strArr = (maxItems = 50, itemMax = 120): SchemaObject => arr(text(itemMax), { maxItems });
export const idArr = (maxItems = 200): SchemaObject => arr(id(), { maxItems });

/** Nullable wrapper that also works for $ref in OpenAPI 3.0. */
export const nullable = (s: Schema): SchemaObject =>
  '$ref' in s ? { allOf: [s], nullable: true } : { ...s, nullable: true };

/** Map type: Record<string, V>. */
export const record = (value: Schema, o: SchemaObject = {}): SchemaObject => ({
  type: 'object',
  additionalProperties: value,
  ...o,
});

interface ObjOpts {
  /** Property names that are optional (all others are required). */
  optional?: string[];
  /** Reject unknown properties — use for request bodies. */
  strict?: boolean;
  description?: string;
}

export const obj = (props: Record<string, Schema>, opts: ObjOpts = {}): SchemaObject => {
  const optional = new Set(opts.optional ?? []);
  const required = Object.keys(props).filter((k) => !optional.has(k));
  return {
    type: 'object',
    ...(opts.description ? { description: opts.description } : {}),
    properties: props,
    ...(required.length ? { required } : {}),
    ...(opts.strict ? { additionalProperties: false } : {}),
  };
};

/** Same properties, none required — the body of a PATCH. */
export const partial = (s: SchemaObject, description?: string): SchemaObject => {
  const { required: _required, ...rest } = s;
  return { ...rest, additionalProperties: false, minProperties: 1, ...(description ? { description } : {}) };
};

/** Copy of an object schema without some properties. */
export const omit = (s: SchemaObject, keys: string[], opts: { strict?: boolean } = {}): SchemaObject => {
  const props = { ...(s.properties ?? {}) };
  for (const k of keys) delete props[k];
  return {
    ...s,
    properties: props,
    required: (s.required ?? []).filter((r) => !keys.includes(r)),
    ...(opts.strict ? { additionalProperties: false } : {}),
  };
};

/** allOf composition: base & extra. */
export const extend = (base: Schema, extra: Record<string, Schema>, optional: string[] = []): SchemaObject => ({
  allOf: [base, obj(extra, { optional })],
});
