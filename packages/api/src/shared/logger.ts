import { config } from './config.js';

export const loggerConfig =
  config.NODE_ENV === 'test'
    ? false
    : config.NODE_ENV === 'production'
      ? true
      : ({ transport: { target: 'pino-pretty' } } as const);
