import { createApp } from './app.js';
import { config } from './config/index.js';
import { logger } from './shared/logger/index.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const app = createApp();

const server = app.listen(config.http.port, () => {
  logger.info(
    { port: config.http.port, environment: config.env },
    `SetuX backend listening on http://localhost:${config.http.port}${config.http.apiPrefix}`,
  );
});

/**
 * Stops accepting new connections, drains in-flight requests, then exits.
 * A hung drain is force-terminated so a deploy can never stall indefinitely.
 */
const shutdown = (signal: NodeJS.Signals): void => {
  logger.info({ signal }, 'Shutdown signal received, closing server');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  server.close((err) => {
    if (err) {
      logger.error({ err }, 'Error while closing server');
      process.exit(1);
    }
    logger.info('Server closed cleanly');
    process.exit(0);
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception, exiting');
  process.exit(1);
});
