import { Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../../providers/redis.provider';

/**
 * Wrapper service cho IORedis — cung cấp các method type-safe,
 * có thể inject vào bất kỳ service nào trong ứng dụng.
 */
@Injectable()
export class RedisService {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  // ─── Key/Value ────────────────────────────────────────────────────────────────

  /** Lưu giá trị với TTL (giây) */
  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    await this.redis.setex(key, ttlSeconds, value);
    this.logger.debug(`SET ${key} (TTL: ${ttlSeconds}s)`);
  }

  /** Lấy giá trị theo key, trả null nếu không tồn tại */
  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  /** Xóa một hoặc nhiều key */
  async del(...keys: string[]): Promise<void> {
    await this.redis.del(...keys);
    this.logger.debug(`DEL ${keys.join(', ')}`);
  }

  /** Kiểm tra key tồn tại */
  async exists(key: string): Promise<boolean> {
    const count = await this.redis.exists(key);
    return count > 0;
  }

  /** Lấy TTL còn lại của key (giây). -1 = không có TTL, -2 = key không tồn tại */
  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  // ─── OTP helpers (dùng trong AuthService) ────────────────────────────────────

  /** Lưu OTP đăng ký (prefix: otp:{email}) */
  async setOtp(email: string, otp: string, ttlSeconds = 300): Promise<void> {
    await this.setEx(`otp:${email}`, ttlSeconds, otp);
  }

  /** Lấy OTP đăng ký */
  async getOtp(email: string): Promise<string | null> {
    return this.get(`otp:${email}`);
  }

  /** Xóa OTP đăng ký sau khi verify */
  async deleteOtp(email: string): Promise<void> {
    await this.del(`otp:${email}`);
  }

  /** Lưu OTP reset password (prefix: reset-otp:{email}) */
  async setResetOtp(
    email: string,
    otp: string,
    ttlSeconds = 300,
  ): Promise<void> {
    await this.setEx(`reset-otp:${email}`, ttlSeconds, otp);
  }

  /** Lấy OTP reset password */
  async getResetOtp(email: string): Promise<string | null> {
    return this.get(`reset-otp:${email}`);
  }

  /** Xóa OTP reset password */
  async deleteResetOtp(email: string): Promise<void> {
    await this.del(`reset-otp:${email}`);
  }

  /** Reset-only atomic scripts. Never log keys, arguments or credentials. */
  async resetScript(
    script: string,
    keys: string[],
    args: string[],
  ): Promise<unknown> {
    return this.redis.eval(script, keys.length, ...keys, ...args);
  }
}
