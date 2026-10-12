export interface RedisConnection {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

/** BullMQ wants host/port options, not a URL. */
export function parseRedisUrl(url: string): RedisConnection {
  const parsed = new URL(url);
  const connection: RedisConnection = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
  };
  if (parsed.password) {
    connection.password = decodeURIComponent(parsed.password);
  }
  const db = parsed.pathname.replace('/', '');
  if (db) {
    connection.db = Number(db);
  }
  return connection;
}
