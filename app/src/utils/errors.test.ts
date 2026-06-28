import { describe, it, expect } from 'vitest';
import { describeError, bytesToText } from './errors';

// The exact payload the node returned for a non-moderator delete attempt.
const DELETE_BYTES = [123, 34, 100, 97, 116, 97, 34, 58, 34, 100, 101, 108, 101, 116, 101, 95, 114, 111, 111, 109, 58, 32, 99, 97, 108, 108, 101, 114, 32, 105, 115, 32, 110, 111, 116, 32, 97, 32, 114, 111, 111, 109, 32, 109, 111, 100, 101, 114, 97, 116, 111, 114, 34, 44, 34, 107, 105, 110, 100, 34, 58, 34, 70, 111, 114, 98, 105, 100, 100, 101, 110, 34, 125];

describe('describeError', () => {
  it('passes through plain strings', () => {
    expect(describeError('boom')).toBe('boom');
  });

  it('handles null/undefined', () => {
    expect(describeError(null)).toBe('Unknown error');
    expect(describeError(undefined)).toBe('Unknown error');
  });

  it('uses Error.message', () => {
    expect(describeError(new Error('nope'))).toBe('nope');
  });

  it('appends contract detail from RpcError.data (ChatError shape)', () => {
    const rpc = {
      name: 'RpcError',
      message: 'FunctionCallError',
      data: { kind: 'Forbidden', data: 'add_moderator: caller is not a room moderator' },
    };
    const out = describeError(rpc);
    expect(out).toContain('FunctionCallError');
    expect(out).toContain('Forbidden');
    expect(out).toContain('caller is not a room moderator');
  });

  it('does not duplicate detail already in the message', () => {
    const rpc = { message: 'Forbidden: x', data: 'Forbidden: x' };
    expect(describeError(rpc)).toBe('Forbidden: x');
  });

  it('falls back to a string data payload', () => {
    expect(describeError({ message: '', data: 'raw detail' })).toBe('raw detail');
  });

  it('falls back to the error type when nothing else is present', () => {
    expect(describeError({ type: 'TimeoutError' })).toBe('TimeoutError');
  });

  it('stringifies an unknown object payload', () => {
    const out = describeError({ message: 'wrap', data: { foo: 'bar' } });
    expect(out).toContain('wrap');
    expect(out).toContain('bar');
  });

  it('bytesToText decodes ASCII codes', () => {
    expect(bytesToText(DELETE_BYTES)).toBe(
      '{"data":"delete_room: caller is not a room moderator","kind":"Forbidden"}',
    );
  });

  it('decodes a byte-array payload in the message wrapper', () => {
    const msg = `the method call returned an error: ${JSON.stringify(DELETE_BYTES)}`;
    expect(describeError(msg)).toBe('Forbidden: delete_room: caller is not a room moderator');
  });

  it('decodes a byte-array payload in RpcError.data', () => {
    const out = describeError({ message: 'FunctionCallError', data: DELETE_BYTES });
    expect(out).toContain('Forbidden');
    expect(out).toContain('delete_room: caller is not a room moderator');
  });

  it('passes plain messages through untouched', () => {
    expect(describeError('the method call returned an error: boom')).toBe(
      'the method call returned an error: boom',
    );
  });
});
