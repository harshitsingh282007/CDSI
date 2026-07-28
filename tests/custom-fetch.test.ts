import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  ResponseParseError,
  customFetch,
  setAuthTokenGetter,
  setBaseUrl,
} from "../lib/api-client-react/src/custom-fetch";

describe("customFetch", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    setBaseUrl(null);
    setAuthTokenGetter(null);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses JSON responses, including a byte-order mark", async () => {
    fetchMock.mockResolvedValue(
      new Response('\uFEFF{"status":"ok"}', {
        headers: { "content-type": "application/problem+json; charset=utf-8" },
      }),
    );

    await expect(customFetch("/health")).resolves.toEqual({ status: "ok" });
  });

  it("infers text and blob response types from content-type", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("plain response"))
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          headers: { "content-type": "application/pdf" },
        }),
      );

    await expect(customFetch("/text")).resolves.toBe("plain response");
    const blob = await customFetch<Blob>("/report");
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
  });

  it("returns null for responses that cannot contain a body", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response("ignored"));

    await expect(customFetch("/empty")).resolves.toBeNull();
    await expect(customFetch("/head", { method: "HEAD" })).resolves.toBeNull();
  });

  it("applies base URL, inferred JSON headers, and bearer authentication", async () => {
    const tokenGetter = vi.fn().mockResolvedValue("secret-token");
    setBaseUrl("https://api.example.test///");
    setAuthTokenGetter(tokenGetter);
    fetchMock.mockResolvedValue(
      new Response('{"created":true}', {
        headers: { "content-type": "application/json" },
      }),
    );

    await customFetch("/jobs", {
      method: "post",
      body: '{"patient":"Ada"}',
      responseType: "json",
    });

    const [input, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(input).toBe("https://api.example.test/jobs");
    expect(init?.method).toBe("POST");
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("accept")).toBe(
      "application/json, application/problem+json",
    );
    expect(headers.get("authorization")).toBe("Bearer secret-token");
    expect(tokenGetter).toHaveBeenCalledOnce();
  });

  it("preserves explicit headers instead of replacing them", async () => {
    const tokenGetter = vi.fn().mockReturnValue("unused-token");
    setAuthTokenGetter(tokenGetter);
    fetchMock.mockResolvedValue(
      new Response("{}", { headers: { "content-type": "application/json" } }),
    );

    await customFetch("/jobs", {
      headers: {
        authorization: "Basic credentials",
        accept: "text/plain",
      },
      responseType: "json",
    });

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe("Basic credentials");
    expect(headers.get("accept")).toBe("text/plain");
    expect(tokenGetter).not.toHaveBeenCalled();
  });

  it("uses the method and headers from Request inputs", async () => {
    const request = new Request("https://api.example.test/jobs", {
      method: "PATCH",
      headers: { "x-request-id": "request-1" },
    });
    fetchMock.mockResolvedValue(new Response("updated"));

    await expect(customFetch(request)).resolves.toBe("updated");

    const headers = new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(fetchMock.mock.calls[0][1]?.method).toBe("PATCH");
    expect(headers.get("x-request-id")).toBe("request-1");
  });

  it("rejects GET and HEAD requests with a body before calling fetch", async () => {
    await expect(customFetch("/jobs", { body: "{}" })).rejects.toThrow(
      "customFetch: GET requests cannot have a body.",
    );
    await expect(
      customFetch("/jobs", { method: "HEAD", body: "{}" }),
    ).rejects.toThrow("customFetch: HEAD requests cannot have a body.");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("throws ApiError with parsed problem details and request metadata", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        '{"title":"Invalid report","detail":"Missing patient name"}',
        {
          status: 422,
          statusText: "Unprocessable Entity",
          headers: { "content-type": "application/problem+json" },
        },
      ),
    );

    const error = await customFetch("/reports", { method: "POST" }).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      message:
        "HTTP 422 Unprocessable Entity: Invalid report - Missing patient name",
      status: 422,
      method: "POST",
      url: "/reports",
      data: { title: "Invalid report", detail: "Missing patient name" },
    });
  });

  it("keeps malformed error bodies as text", async () => {
    fetchMock.mockResolvedValue(
      new Response('{"broken"', {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "content-type": "application/json" },
      }),
    );

    await expect(customFetch("/broken")).rejects.toMatchObject({
      message: 'HTTP 500 Internal Server Error: {"broken"',
      data: '{"broken"',
    });
  });

  it("throws ResponseParseError for malformed successful JSON", async () => {
    fetchMock.mockResolvedValue(
      new Response("not-json", {
        headers: { "content-type": "application/json" },
      }),
    );

    const error = await customFetch("/broken-json").catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(ResponseParseError);
    expect(error).toMatchObject({
      method: "GET",
      url: "/broken-json",
      rawBody: "not-json",
    });
  });
});
