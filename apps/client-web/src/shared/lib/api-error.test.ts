import { describe, it, expect } from "vitest"
import { ApiError, extractErrorCode, translateError } from "./api-error"

describe("ApiError", () => {
  it("stores code and status", () => {
    const err = new ApiError("wrongCredentials", 401)
    expect(err.code).toBe("wrongCredentials")
    expect(err.status).toBe(401)
    expect(err.name).toBe("ApiError")
    expect(err.message).toBe("wrongCredentials")
  })
})

describe("extractErrorCode", () => {
  it("extracts string message", () => {
    expect(extractErrorCode({ message: "wrongCredentials" })).toBe(
      "wrongCredentials",
    )
  })

  it("joins array messages", () => {
    expect(extractErrorCode({ message: ["field1 is required", "field2 is required"] })).toBe(
      "field1 is required, field2 is required",
    )
  })

  it("returns unknownError for null", () => {
    expect(extractErrorCode(null)).toBe("unknownError")
  })

  it("returns unknownError for missing message", () => {
    expect(extractErrorCode({ foo: "bar" })).toBe("unknownError")
  })

  it("returns unknownError for non-object", () => {
    expect(extractErrorCode("string")).toBe("unknownError")
  })
})

describe("translateError", () => {
  it("returns the code as fallback when i18n key not found", () => {
    // i18next is not initialized in test, so it will return the code
    const result = translateError("someUnknownCode")
    expect(result).toBe("someUnknownCode")
  })
})
