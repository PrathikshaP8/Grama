import { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { sha256 } from './crypto.js';

const GENESIS = '0'.repeat(64);

export async function appendAudit(params: {
  actorId?: Types.ObjectId | string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const last = await AuditLog.findOne().sort({ createdAt: -1, _id: -1 });
  const prevHash = last?.hash ?? GENESIS;
  const payload = JSON.stringify({
    actorId: params.actorId?.toString(),
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata ?? {},
    prevHash,
    ts: Date.now(),
  });
  const hash = sha256(payload);
  await AuditLog.create({
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    metadata: params.metadata,
    prevHash,
    hash,
  });
}
