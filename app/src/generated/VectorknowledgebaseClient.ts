/** @generated stub from spec — will be replaced by abi-codegen after backend compiles. */

import { MeroJs } from '@calimero-network/mero-react';

// ── Domain types ─────────────────────────────────────────────────────────────

export interface KnowledgeEntry {
  id: string;
  author: string;
  text: string;
  embedding: number[];
  dimension: number;
  tags: string[];
  collection_id: string | null;
  created_at: number;
}

export interface Collection {
  id: string;
  name: string;
  description: string;
  created_at: number;
}

export interface SearchResult {
  entry_id: string;
  score: number;
  text: string;
  tags: string[];
  author: string;
}

export interface StoreStats {
  total_entries: number;
  total_collections: number;
  dimension: number;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class VectorknowledgebaseClient {
  private _mero: MeroJs;
  private _contextId: string;
  private _executorPublicKey: string;

  constructor(mero: MeroJs, contextId: string, executorPublicKey: string) {
    this._mero = mero;
    this._contextId = contextId;
    this._executorPublicKey = executorPublicKey;
  }

  private async execute<T>(method: string, argsJson: string): Promise<T> {
    const result = await this._mero.rpc.execute({
      contextId: this._contextId,
      method,
      argsJson,
      executorPublicKey: this._executorPublicKey,
    });
    return result as T;
  }

  async addEntry(params: {
    text: string;
    embedding: number[];
    tags: string[];
    collection_id: string | null;
  }): Promise<string> {
    return this.execute<string>('add_entry', JSON.stringify(params));
  }

  async searchSimilar(params: {
    query_vector: number[];
    top_k: number;
    collection_id: string | null;
  }): Promise<SearchResult[]> {
    return this.execute<SearchResult[]>('search_similar', JSON.stringify(params));
  }

  async listEntries(params: {
    collection_id: string | null;
    offset: number;
    limit: number;
  }): Promise<KnowledgeEntry[]> {
    return this.execute<KnowledgeEntry[]>('list_entries', JSON.stringify(params));
  }

  async updateEntryTags(params: {
    entry_id: string;
    tags: string[];
  }): Promise<void> {
    await this.execute<void>('update_entry_tags', JSON.stringify(params));
  }

  async removeEntry(params: { entry_id: string }): Promise<void> {
    await this.execute<void>('remove_entry', JSON.stringify(params));
  }

  async createCollection(params: {
    name: string;
    description: string;
  }): Promise<string> {
    return this.execute<string>('create_collection', JSON.stringify(params));
  }

  async listCollections(): Promise<Collection[]> {
    return this.execute<Collection[]>('list_collections', '{}');
  }

  async deleteCollection(params: { collection_id: string }): Promise<void> {
    await this.execute<void>('delete_collection', JSON.stringify(params));
  }

  async getStoreStats(): Promise<StoreStats> {
    return this.execute<StoreStats>('get_store_stats', '{}');
  }
}
