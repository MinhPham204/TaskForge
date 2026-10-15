import { createHash, createHmac, randomInt, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  HttpException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RedisService } from '../../../common/services/redis.service';

export const resetDigest = (value: string): string =>
  createHash('sha256').update(value).digest('hex');
const key = (kind: string, value: string) =>
  `auth-reset:${kind}:${resetDigest(value)}`;
const LIMIT = `
local n = tonumber(redis.call('GET', KEYS[1]) or '0')
if n >= tonumber(ARGV[1]) then return redis.call('TTL', KEYS[1]) end
redis.call('INCR', KEYS[1])
if n == 0 then redis.call('EXPIRE', KEYS[1], 900) end
return 0`;
const SEND = `
local wait = redis.call('TTL', KEYS[1])
if wait > 0 then return wait end
local n = tonumber(redis.call('GET', KEYS[2]) or '0')
if n >= 5 then return redis.call('TTL', KEYS[2]) end
redis.call('SET', KEYS[1], '1', 'EX', 60)
redis.call('INCR', KEYS[2])
if n == 0 then redis.call('EXPIRE', KEYS[2], 900) end
return 0`;
const FINISH = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local c = cjson.decode(raw)
if c.generation ~= ARGV[1] then return 0 end
if ARGV[2] == 'delete' then redis.call('DEL', KEYS[1]); return 1 end
c.active = true
redis.call('SET', KEYS[1], cjson.encode(c), 'KEEPTTL')
return 1`;
const VERIFY = `
local raw = redis.call('GET', KEYS[1])
if not raw then return '' end
local c = cjson.decode(raw)
if not c.active then return '' end
c.attempts = c.attempts + 1
if c.digest ~= ARGV[1] then
  if c.attempts >= 5 then redis.call('DEL', KEYS[1])
  else redis.call('SET', KEYS[1], cjson.encode(c), 'KEEPTTL') end
  return ''
end
redis.call('DEL', KEYS[1])
return cjson.encode(c)`;

export class PasswordResetChallenges {
  constructor(
    private readonly redis: RedisService,
    private readonly secret: string,
  ) {}

  private codeDigest(email: string, otp: string): string {
    return createHmac('sha256', this.secret)
      .update(`password-reset:${email}:${otp}`)
      .digest('hex');
  }

  private async run(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    try {
      return await this.redis.resetScript(script, keys, args);
    } catch {
      throw new ServiceUnavailableException({
        code: 'RESET_UNAVAILABLE',
        message:
          'Password reset is temporarily unavailable. Please try again later.',
      });
    }
  }

  private limited(wait: unknown): void {
    if (Number(wait) > 0)
      throw new HttpException(
        {
          code: 'RESET_RATE_LIMITED',
          message: 'Too many reset attempts. Please wait before trying again.',
          retryAfter: Number(wait),
        },
        429,
      );
  }

  async reserve(email: string, ip: string): Promise<void> {
    this.limited(await this.run(LIMIT, [key('send-ip', ip)], ['20']));
    this.limited(
      await this.run(
        SEND,
        [key('cooldown', email), key('send-window', email)],
        [],
      ),
    );
  }

  async create(email: string, userId: string, passwordHash: string) {
    const otp = randomInt(100000, 1000000).toString();
    const generation = randomUUID();
    await this.run(
      "return redis.call('SET', KEYS[1], ARGV[1], 'EX', 300)",
      [key('challenge', email)],
      [
        JSON.stringify({
          generation,
          digest: this.codeDigest(email, otp),
          userId,
          credential: resetDigest(passwordHash),
          attempts: 0,
          active: false,
        }),
      ],
    );
    return { otp, generation };
  }

  async finish(
    email: string,
    generation: string,
    delivered: boolean,
  ): Promise<void> {
    await this.run(
      FINISH,
      [key('challenge', email)],
      [generation, delivered ? 'activate' : 'delete'],
    );
  }

  async consume(
    email: string,
    otp: string,
    ip: string,
  ): Promise<{ userId: string; credential: string }> {
    this.limited(await this.run(LIMIT, [key('verify-ip', ip)], ['30']));
    const raw = await this.run(
      VERIFY,
      [key('challenge', email)],
      [this.codeDigest(email, otp)],
    );
    if (typeof raw !== 'string' || !raw)
      throw new BadRequestException({
        code: 'RESET_CODE_INVALID',
        message: 'Reset code is invalid or expired. Request a new code.',
      });
    return JSON.parse(raw) as { userId: string; credential: string };
  }
}
