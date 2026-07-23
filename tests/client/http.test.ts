import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from 'axios';
import { YuqueHttp } from '../../src/client/http.js';
import { YuqueError } from '../../src/errors.js';

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>();
  return {
    default: {
      ...actual.default,
      create: vi.fn(),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

const mockedAxios = vi.mocked(axios, { partial: true });

function axiosFailure(status: number, message = 'boom', headers: Record<string, string> = {}) {
  const error = new Error(message) as Error & {
    isAxiosError: boolean;
    response: { status: number; data: { message: string }; headers: Record<string, string> };
  };
  error.isAxiosError = true;
  error.response = { status, data: { message }, headers };
  return error;
}

function networkFailure(code: string, message = 'socket hang up') {
  const error = new Error(message) as Error & { isAxiosError: boolean; code: string };
  error.isAxiosError = true;
  error.code = code;
  return error;
}

describe('YuqueHttp', () => {
  const request = vi.fn();
  const sleep = vi.fn(() => Promise.resolve());

  beforeEach(() => {
    request.mockReset();
    sleep.mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockedAxios.create.mockReturnValue({ request } as any);
  });

  function makeHttp(maxRetries = 3) {
    return new YuqueHttp({
      token: 't',
      host: 'https://www.yuque.com',
      maxRetries,
      sleep,
    });
  }

  it('configures baseURL with /api/v2 and the auth header', () => {
    makeHttp();
    expect(mockedAxios.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://www.yuque.com/api/v2',
        headers: expect.objectContaining({ 'X-Auth-Token': 't' }),
      })
    );
  });

  it('returns response.data on success', async () => {
    request.mockResolvedValueOnce({ data: { data: { id: 1 } } });
    await expect(makeHttp().get('/user')).resolves.toEqual({ data: { id: 1 } });
  });

  it('retries 429 with backoff then succeeds', async () => {
    request
      .mockRejectedValueOnce(axiosFailure(429, 'rate limited'))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await expect(makeHttp().get('/user')).resolves.toEqual({ data: 'ok' });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After seconds', async () => {
    request
      .mockRejectedValueOnce(axiosFailure(429, 'rate limited', { 'retry-after': '2' }))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await makeHttp().get('/user');
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('caps Retry-After delays at 10 seconds', async () => {
    request
      .mockRejectedValueOnce(axiosFailure(429, 'rate limited', { 'retry-after': '60' }))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await makeHttp().get('/user');
    expect(sleep).toHaveBeenCalledWith(10000);
  });

  it('backs off exponentially and caps the delay at 4000ms', async () => {
    request.mockRejectedValue(axiosFailure(429, 'rate limited'));
    await expect(makeHttp(4).get('/user')).rejects.toBeInstanceOf(YuqueError);
    expect(sleep.mock.calls).toEqual([[500], [1000], [2000], [4000]]);
  });

  it.each([502, 503, 504])('retries GET on %i then succeeds', async (status) => {
    request
      .mockRejectedValueOnce(axiosFailure(status, 'upstream error'))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await expect(makeHttp().get('/user')).resolves.toEqual({ data: 'ok' });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry 500', async () => {
    request.mockRejectedValue(axiosFailure(500, 'server error'));
    await expect(makeHttp().get('/user')).rejects.toMatchObject({ statusCode: 500 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries GET network errors without a response', async () => {
    request
      .mockRejectedValueOnce(networkFailure('ECONNRESET'))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await expect(makeHttp().get('/user')).resolves.toEqual({ data: 'ok' });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('does not retry canceled requests', async () => {
    request.mockRejectedValue(networkFailure('ERR_CANCELED', 'canceled'));
    await expect(makeHttp().get('/user')).rejects.toBeInstanceOf(YuqueError);
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry a POST that failed without a response and flags the ambiguity', async () => {
    request.mockRejectedValue(networkFailure('ECONNABORTED', 'timeout of 30000ms exceeded'));
    const error = await makeHttp()
      .post('/repos/g/r/docs', { title: 'T' })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YuqueError);
    expect((error as YuqueError).message).toBe(
      'timeout of 30000ms exceeded (the request may still have been applied — verify before retrying)'
    );
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it.each(['post', 'put', 'delete'] as const)('does not retry %s on 502', async (method) => {
    request.mockRejectedValue(axiosFailure(502, 'bad gateway'));
    await expect(makeHttp()[method]('/repos/1')).rejects.toMatchObject({ statusCode: 502 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('still retries POST on 429 (request was not processed)', async () => {
    request
      .mockRejectedValueOnce(axiosFailure(429, 'rate limited'))
      .mockResolvedValueOnce({ data: { data: 'ok' } });
    await expect(makeHttp().post('/repos', { name: 'n' })).resolves.toEqual({ data: 'ok' });
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries and throws a YuqueError with the 429 hint', async () => {
    request.mockRejectedValue(axiosFailure(429, 'rate limited'));
    const error = await makeHttp(2)
      .get('/user')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YuqueError);
    expect(error).toMatchObject({
      statusCode: 429,
      message: 'rate limited (rate limited by the Yuque API — wait a moment and retry)',
    });
    expect(request).toHaveBeenCalledTimes(3); // 1 attempt + 2 retries
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('maxRetries=0 disables retries entirely', async () => {
    request.mockRejectedValue(axiosFailure(429, 'rate limited'));
    await expect(makeHttp(0).get('/user')).rejects.toMatchObject({ statusCode: 429 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry non-retryable statuses', async () => {
    request.mockRejectedValue(axiosFailure(404, 'not found'));
    await expect(makeHttp().get('/nope')).rejects.toMatchObject({ statusCode: 404 });
    expect(request).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('appends a status hint to API error messages', async () => {
    request.mockRejectedValue(axiosFailure(401, 'invalid token'));
    await expect(makeHttp().get('/user')).rejects.toThrow(/token invalid or expired/);
  });
});
