'use client';

import { EventEmitter } from 'events';
import { FirestorePermissionError } from './errors';

type ErrorEvents = {
  'permission-error': (error: FirestorePermissionError) => void;
};

class ErrorEmitter extends EventEmitter {
  emit<K extends keyof ErrorEvents>(event: K, ...args: Parameters<ErrorEvents[K]>): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ErrorEvents>(event: K, listener: ErrorEvents[K]): this {
    return super.on(event, listener);
  }
}

export const errorEmitter = new ErrorEmitter();
