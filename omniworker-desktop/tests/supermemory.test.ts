import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import {
  ingestConversation,
  readMemory,
  getMemoryHealth,
  getMemoryGraph,
  hybridSearch
} from "../src/main/memory";
import { profileHome } from "../src/main/utils";

describe("SuperMemory Local Engine and FTS Verification", () => {
  const testProfile = "test_supermemory_temp";
  const profileDir = profileHome(testProfile);
  const dbPath = join(profileDir, "state.db");

  beforeAll(() => {
    // Clean up any stale test profile directory
    if (existsSync(profileDir)) {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up after test run
    if (existsSync(profileDir)) {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  it("should successfully ingest conversation, create database, and populate facts", async () => {
    const messages = [
      { role: "user", content: "Hi! My name is Alice, and I prefer PostgreSQL." },
      { role: "assistant", content: "Hello Alice! PostgreSQL is an excellent database choice." },
      { role: "user", content: "Yes, we use PostgreSQL because I decided to build our new app using React." }
    ];

    // Ingest the conversation
    const result = await ingestConversation(messages, "test-session-123", testProfile);
    expect(result.chunksStored).toBeGreaterThan(0);
    expect(result.factsExtracted).toBeGreaterThan(0);

    // Verify state.db was created
    expect(existsSync(dbPath)).toBe(true);

    // Read memories and check stats
    const memoryInfo = await readMemory(testProfile);
    expect(memoryInfo.stats.memoryChunks).toBeGreaterThan(0);
    expect(memoryInfo.stats.memoryFacts).toBeGreaterThan(0);

    // Check health stats specifically
    const health = await getMemoryHealth(testProfile);
    expect(health.activeFacts).toBeGreaterThan(0);
    expect(health.totalChunks).toBeGreaterThan(0);

    // Verify fact graph retrieval
    const graph = await getMemoryGraph(testProfile);
    expect(graph.length).toBeGreaterThan(0);

    // Verify FTS / Hybrid Search works
    const searchResults = await hybridSearch("PostgreSQL", 20, testProfile);
    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].content).toContain("PostgreSQL");
  });
});
