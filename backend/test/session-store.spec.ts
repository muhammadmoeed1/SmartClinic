const redisInstances: any[] = [];
jest.mock('ioredis', () => jest.fn().mockImplementation(() => {
  const instance = {
    set: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    on: jest.fn(),
    disconnect: jest.fn(),
  };
  redisInstances.push(instance);
  return instance;
}));

import { SessionStore } from '../src/ai/session-store';

describe('SessionStore', () => {
  const originalRedisUrl = process.env.REDIS_URL;

  afterEach(() => {
    process.env.REDIS_URL = originalRedisUrl;
    redisInstances.length = 0;
    jest.restoreAllMocks();
  });

  describe('without REDIS_URL (in-memory fallback)', () => {
    beforeEach(() => {
      delete process.env.REDIS_URL;
    });

    it('stores and retrieves a value', async () => {
      const store = new SessionStore<{ a: number }>();
      expect(store.backend).toBe('memory');
      await store.set('id1', { a: 1 }, 60_000);
      expect(await store.get('id1')).toEqual({ a: 1 });
    });

    it('returns null for an unknown id', async () => {
      const store = new SessionStore();
      expect(await store.get('missing')).toBeNull();
    });

    it('expires entries after the TTL', async () => {
      const store = new SessionStore<{ a: number }>();
      const now = Date.now();
      jest.spyOn(Date, 'now').mockReturnValue(now);
      await store.set('id1', { a: 1 }, 1000);

      jest.spyOn(Date, 'now').mockReturnValue(now + 2000);
      expect(await store.get('id1')).toBeNull();
    });

    it('deletes a value', async () => {
      const store = new SessionStore<{ a: number }>();
      await store.set('id1', { a: 1 }, 60_000);
      await store.delete('id1');
      expect(await store.get('id1')).toBeNull();
    });
  });

  describe('with REDIS_URL configured', () => {
    beforeEach(() => {
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    it('delegates to the Redis client with a namespaced key and PX ttl', async () => {
      const store = new SessionStore<{ a: number }>();
      expect(store.backend).toBe('redis');
      const redis = redisInstances[0];

      await store.set('id1', { a: 1 }, 5000);
      expect(redis.set).toHaveBeenCalledWith('smartclinic:session:id1', JSON.stringify({ a: 1 }), 'PX', 5000);

      redis.get.mockResolvedValue(JSON.stringify({ a: 2 }));
      expect(await store.get('id1')).toEqual({ a: 2 });

      await store.delete('id1');
      expect(redis.del).toHaveBeenCalledWith('smartclinic:session:id1');
    });
  });
});
