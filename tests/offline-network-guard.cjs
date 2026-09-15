// Preloaded by offline-runner.mjs. Loopback remains available for cache-php.
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const allowed = host => host == null || host === '' || ['localhost', '127.0.0.1', '::1'].includes(String(host).replace(/^\[|\]$/g, ''));
let violations = 0;
const denied = target => { violations++; throw new Error(`offline test network guard blocked external request: ${target}`); };
function hostOf(input, options) {
  if (typeof input === 'string') { try { return new URL(input).hostname; } catch { return options?.hostname || options?.host; } }
  if (input && typeof input === 'object') return input.hostname || input.host || input.href && new URL(input.href).hostname;
  return options?.hostname || options?.host;
}
for (const mod of [http, https]) for (const method of ['request', 'get']) {
  const original = mod[method];
  mod[method] = function(input, options, ...rest) {
    const host = hostOf(input, options);
    if (!allowed(host)) return denied(host || input);
    return original.call(this, input, options, ...rest);
  };
}
for (const method of ['connect', 'createConnection']) {
  const original = net[method];
  net[method] = function(...args) {
    const input = args[0]; const host = typeof input === 'object' ? input.host || input.hostname : args[1];
    if (!allowed(host)) return denied(host || input);
    return original.apply(this, args);
  };
}
const socketConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args) {
  const input = args[0]; const host = typeof input === 'object' ? input.host || input.hostname : args[1];
  if (!allowed(host)) return denied(host || input);
  return socketConnect.apply(this, args);
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const host = hostOf(input instanceof URL ? input.href : typeof input === 'string' ? input : input?.url);
  if (!allowed(host)) return denied(host || input);
  return originalFetch(input, init);
};
process.on('beforeExit', () => { if (violations) process.exitCode = 97; });
