import {randomUUID} from 'node:crypto';

export const DOCUMENT_TTL_MS = 15 * 60 * 1000;
const MAX_DOCUMENTS = 32;
const MAX_STORED_BYTES = 64 * 1024 * 1024;

export type StoredDocument = {
  id: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  expiresAt: number;
};

const documents = new Map<string, StoredDocument>();

function removeExpired(now: number): void {
  for (const [id, document] of documents) {
    if (document.expiresAt <= now) documents.delete(id);
  }
}

function storedBytes(): number {
  let total = 0;
  for (const document of documents.values()) total += document.buffer.length;
  return total;
}

function trimStore(): void {
  while (documents.size > MAX_DOCUMENTS || storedBytes() > MAX_STORED_BYTES) {
    const oldestId = documents.keys().next().value as string | undefined;
    if (!oldestId) return;
    documents.delete(oldestId);
  }
}

export function newDocumentId(): string {
  return randomUUID();
}

export function storeDocument(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
  now = Date.now()
): StoredDocument {
  removeExpired(now);
  const document = {
    id: newDocumentId(),
    buffer,
    fileName,
    mimeType,
    expiresAt: now + DOCUMENT_TTL_MS
  };
  documents.set(document.id, document);
  trimStore();
  return document;
}

export function getDocument(id: string, now = Date.now()): StoredDocument | undefined {
  removeExpired(now);
  return documents.get(id);
}
