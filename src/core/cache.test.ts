import { beforeEach, describe, expect, it } from "vitest";
import { clearReportCache, readReport, writeReport } from "./cache.js";
import { TReport } from "./types.js";

const report = { profile: { login: "x" } } as TReport;
const T0 = 1_000_000;
const TTL = 30 * 60 * 1000;

// Minimal in-memory sessionStorage stand-in.
class FakeStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

beforeEach(() => {
  (globalThis as { sessionStorage?: unknown }).sessionStorage = new FakeStorage();
  clearReportCache();
});

describe("report cache", () => {
  it("returns a stored report within the TTL", () => {
    writeReport("u|anon", report, T0);
    expect(readReport("u|anon", T0 + 1000)).toBe(report);
  });

  it("expires entries after the TTL", () => {
    writeReport("u|anon", report, T0);
    expect(readReport("u|anon", T0 + TTL + 1)).toBeNull();
  });

  it("clears all entries", () => {
    writeReport("u|anon", report, T0);
    clearReportCache();
    expect(readReport("u|anon", T0 + 1000)).toBeNull();
  });

  it("reads from sessionStorage when memory is cold (survives reload)", () => {
    // Pre-seed L2 only; clearReportCache already emptied L1.
    const entry = JSON.stringify({ report, expires: T0 + TTL });
    const store = (globalThis as { sessionStorage: FakeStorage }).sessionStorage;
    store.setItem("devpulse-report:u|anon", entry);
    expect(readReport("u|anon", T0 + 1000)).toEqual(report);
  });
});
