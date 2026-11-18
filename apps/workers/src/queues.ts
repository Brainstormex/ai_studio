import { Redis } from "ioredis";
import { Queue, Worker, type Processor } from "bullmq";
import { QUEUE, type QueueName } from "@studio/shared";

export const redisConnection = new Redis(process.env.REDIS_URL ?? "redis://127.0.0.1:6379", {
  maxRetriesPerRequest: null,
  retryStrategy(times) {
    if (times > 20) return null;
    return Math.min(times * 250, 5000);
  },
});

redisConnection.on("error", (error) => {
  console.error("Redis error:", error.message);
});

export function createQueue(name: QueueName) {
  return new Queue(name, { connection: redisConnection });
}

export function createWorker(
  name: QueueName,
  processor: Processor,
  concurrency = 1,
  options?: { lockDuration?: number },
) {
  return new Worker(name, processor, {
    connection: redisConnection,
    concurrency,
    ...(options?.lockDuration ? { lockDuration: options.lockDuration } : {}),
  });
}

export const ALL_QUEUES = Object.values(QUEUE);
