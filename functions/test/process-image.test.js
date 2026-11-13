import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { processImageHandler } from '../src/process-image.js';

const request = {
  async json() {
    return { filename: 'test.jpg', width: 400, height: 300 };
  },
};

const context = {
  log() {},
};

describe('process-image function', () => {
  it('reports a cold start only for the first request in a process', async () => {
    const firstResponse = await processImageHandler(request, context);
    const secondResponse = await processImageHandler(request, context);

    assert.equal(firstResponse.jsonBody.coldStart, true);
    assert.equal(secondResponse.jsonBody.coldStart, false);
  });
});
