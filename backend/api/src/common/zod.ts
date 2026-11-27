import { HttpStatus, PipeTransform } from '@nestjs/common';
import { z, ZodTypeAny } from 'zod';
import { ApiError } from './api-exception.filter';

/**
 * Validates a request body/query against a zod schema and returns the parsed
 * value. Failures become 400 VALIDATION_FAILED with per-field messages.
 *   @Body(new ZodPipe(LoginSchema)) body: z.infer<typeof LoginSchema>
 */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (result.success) return result.data;
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join('.') || '_';
      fields[key] ??= issue.code === 'unrecognized_keys' ? `Unknown field(s): ${issue.keys.join(', ')}` : issue.message;
    }
    const first = Object.entries(fields)[0];
    throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', first ? `${first[0]}: ${first[1]}` : 'Invalid request', fields);
  }
}

// Shared field schemas — keep in step with src/openapi/schemas.ts.
export const zEmail = z.string().trim().toLowerCase().email().max(254);
export const zNewPassword = z.string().min(10, 'At least 10 characters').max(128);
export const zId = z.string().min(1).max(64);
export const zToken = z.string().min(16).max(256);
