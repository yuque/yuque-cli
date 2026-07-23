import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * In-process mock of the Yuque Open API for functional tests. Routes are
 * registered per `METHOD /api/v2/...` path; every incoming request is recorded
 * so tests can assert the exact wire traffic the real CLI binary produced.
 */

export interface RecordedRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}

export interface RouteResponse {
  status?: number;
  /** JSON-serialized as-is; list/detail endpoints expect the { data } envelope. */
  body?: unknown;
  headers?: Record<string, string>;
}

export type RouteHandler =
  RouteResponse | ((request: RecordedRequest, hit: number) => RouteResponse);

export class FixtureServer {
  readonly requests: RecordedRequest[] = [];
  private readonly routes = new Map<string, { handler: RouteHandler; hits: number }>();
  private server: Server | undefined;

  /** `path` is the pathname without query, e.g. `/api/v2/user`. */
  route(method: string, path: string, handler: RouteHandler): this {
    this.routes.set(`${method.toUpperCase()} ${path}`, { handler, hits: 0 });
    return this;
  }

  requestsFor(method: string, path: string): RecordedRequest[] {
    return this.requests.filter(
      (request) => request.method === method.toUpperCase() && request.path === path
    );
  }

  async start(): Promise<string> {
    this.server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const raw = Buffer.concat(chunks).toString('utf8');
        let body: unknown;
        try {
          body = raw === '' ? undefined : JSON.parse(raw);
        } catch {
          body = raw;
        }
        const recorded: RecordedRequest = {
          method: (req.method ?? 'GET').toUpperCase(),
          path: url.pathname,
          query: Object.fromEntries(url.searchParams),
          headers: req.headers,
          body,
        };
        this.requests.push(recorded);

        const route = this.routes.get(`${recorded.method} ${recorded.path}`);
        const response: RouteResponse = route
          ? typeof route.handler === 'function'
            ? route.handler(recorded, ++route.hits)
            : route.handler
          : {
              status: 404,
              body: { message: `no fixture for ${recorded.method} ${recorded.path}` },
            };

        res.writeHead(response.status ?? 200, {
          'Content-Type': 'application/json',
          ...response.headers,
        });
        res.end(JSON.stringify(response.body ?? {}));
      });
    });
    await new Promise<void>((resolve) => this.server?.listen(0, '127.0.0.1', resolve));
    const { port } = this.server?.address() as AddressInfo;
    return `http://127.0.0.1:${port}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((resolve, reject) =>
      this.server ? this.server.close((error) => (error ? reject(error) : resolve())) : resolve()
    );
  }
}
