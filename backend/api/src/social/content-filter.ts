import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../common/api-exception.filter';
import { env } from '../config/env';

/**
 * Basic automated checks before user text is published (community posts,
 * messages). Anything that gets through can be reported and removed by
 * moderators. A provider-based classifier can be added here later.
 */
export function assertAcceptableText(text: string, field = 'text') {
  const lower = text.toLowerCase();
  const urls = text.match(/https?:\/\/|www\./gi)?.length ?? 0;
  const reject = (message: string): never => {
    throw new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, { [field]: message });
  };
  if (urls > 2) reject('Too many links');
  if (/(.)\1{14,}/.test(text)) reject('Looks like spam (repeated characters)');
  const blocked = env().CONTENT_BLOCKLIST.find((term) => lower.includes(term));
  if (blocked) reject('This text breaks the community rules');
}
