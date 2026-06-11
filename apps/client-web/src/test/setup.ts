import "@testing-library/jest-dom/vitest"
import { vi } from "vitest"

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(globalThis, "localStorage", { value: localStorageMock })

// Mock window.location
Object.defineProperty(window, "location", {
  value: {
    ...window.location,
    assign: vi.fn(),
    reload: vi.fn(),
  },
  writable: true,
})

// Mock import.meta.env
vi.stubEnv("VITE_API_BASE_URL", "http://localhost:3000")
