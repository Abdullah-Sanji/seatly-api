/**
 * KEYS[1] = hold:{eventId}:{seatId}
 * KEYS[2] = holds:user:{userId}:{eventId}
 * ARGV[1] = "{userId}:{holdToken}"   ARGV[2] = ttl seconds   ARGV[3] = seatId   ARGV[4] = max seats
 * Returns 1 = held, 0 = someone (maybe you) already holds it, -1 = user is at the limit.
 */
export const HOLD_LUA = `
if redis.call('SCARD', KEYS[2]) >= tonumber(ARGV[4]) then
  return -1
end
local ok = redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2])
if not ok then
  return 0
end
redis.call('SADD', KEYS[2], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[2])
return 1
`;

/**
 * KEYS[1] = hold key   KEYS[2] = user set
 * ARGV[1] = userId     ARGV[2] = seatId
 * Deletes the hold only if its value starts with "{userId}:" and returns 1.
 * If the caller does not own the seat (key gone or owned by someone else) the seat is still
 * dropped from the caller's set, since they do not hold it either way; returns 0.
 */
export const RELEASE_LUA = `
local v = redis.call('GET', KEYS[1])
local prefix = ARGV[1] .. ':'
if v and string.sub(v, 1, string.len(prefix)) == prefix then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', KEYS[2], ARGV[2])
  return 1
end
-- Caller does not own this seat: drop any stale entry from their set.
redis.call('SREM', KEYS[2], ARGV[2])
return 0
`;

/**
 * KEYS[1] = hold key   KEYS[2] = user set
 * ARGV[1] = expected value "{userId}:{holdToken}"   ARGV[2] = seatId   ARGV[3] = userId
 * Deletes the hold only if the value matches exactly, so a stale job never removes a newer hold.
 * On a mismatch the set entry is dropped only when the key is gone (TTL beat the job) or owned by
 * another user; a newer hold by the same user keeps its entry.
 */
export const EXPIRE_LUA = `
local v = redis.call('GET', KEYS[1])
if v == ARGV[1] then
  redis.call('DEL', KEYS[1])
  redis.call('SREM', KEYS[2], ARGV[2])
  return 1
end
-- Value gone (TTL beat the job) or owned by someone else: drop the stale set entry.
-- A newer hold by the same user keeps its entry.
local prefix = ARGV[3] .. ':'
if (not v) or string.sub(v, 1, string.len(prefix)) ~= prefix then
  redis.call('SREM', KEYS[2], ARGV[2])
end
return 0
`;
