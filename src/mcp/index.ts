#!/usr/bin/env node
import {createServer} from 'node:http';
import {
  createMcpHandler
} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {
  hostHeaderValidation,
  localhostHostValidation,
  localhostOriginValidation,
  originValidation,
  toNodeHandler
} from '@modelcontextprotocol/node';
import {createEvidexMcpServer} from './server';

function argumentValue(name: string): string | undefined {
  const args = process.argv.slice(2);
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function positivePort(value: string | undefined): number {
  const port = Number(value || process.env.MCP_PORT || 3002);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('MCP port must be an integer from 1 to 65535');
  }
  return port;
}

function allowedHostnames(host: string): string[] {
  const configured = (process.env.MCP_ALLOWED_HOSTS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (configured.length) return configured;
  if (['127.0.0.1', 'localhost', '::1'].includes(host)) return ['localhost', '127.0.0.1', '[::1]'];
  throw new Error('Set MCP_ALLOWED_HOSTS when binding the HTTP server beyond localhost');
}

function runStdio(): void {
  serveStdio(createEvidexMcpServer, {
    onerror: (error) => console.error('[evidex-mcp] protocol error:', error.message)
  });
  console.error('[evidex-mcp] serving over stdio');
}

function runHttp(): void {
  const port = positivePort(argumentValue('--port'));
  const host = argumentValue('--host') || process.env.MCP_HOST || '127.0.0.1';
  const allowed = allowedHostnames(host);
  const handler = createMcpHandler(createEvidexMcpServer, {
    responseMode: 'json',
    onerror: (error) => console.error('[evidex-mcp] handler error:', error.message)
  });
  const nodeHandler = toNodeHandler(handler, {
    onerror: (error) => console.error('[evidex-mcp] HTTP adapter error:', error.message)
  });
  const localOnly = allowed.length === 3 && allowed.includes('localhost') && allowed.includes('127.0.0.1');
  const validateHost = localOnly ? localhostHostValidation() : hostHeaderValidation(allowed);
  const validateOrigin = localOnly ? localhostOriginValidation() : originValidation(allowed);

  const httpServer = createServer((req, res) => {
    const pathname = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`).pathname;
    if (pathname !== '/mcp') {
      res.writeHead(404, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({error: 'Not found'}));
      return;
    }
    if (!validateHost(req, res) || !validateOrigin(req, res)) return;
    void nodeHandler(req, res);
  });

  httpServer.listen(port, host, () => {
    console.error(`[evidex-mcp] listening on http://${host}:${port}/mcp`);
  });

  const shutdown = async (): Promise<void> => {
    await handler.close();
    httpServer.close();
  };
  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());
}

if (process.argv.includes('--help')) {
  console.log('Usage: node dist/mcp/index.js [--http] [--host 127.0.0.1] [--port 3002]');
  console.log('Without --http, the server uses stdio for local MCP clients.');
} else if (process.argv.includes('--http')) {
  runHttp();
} else {
  runStdio();
}
