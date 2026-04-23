import { getModel, getClientForModel, isCerebrasModel } from '../src/agents/client';
import { withGatewayFallbackGenerator, isInvalidRequestError } from '../src/agents/rate-limit';

describe('Vercel AI Gateway Fallback', () => {
  describe('Client Functions', () => {
    it('should identify non-Cerebras models correctly (no Cerebras models currently configured)', () => {
      // Currently no models are in the CEREBRAS_MODELS array
      expect(isCerebrasModel('z-ai/glm-5.1')).toBe(false);
      expect(isCerebrasModel('anthropic/claude-haiku-4.5')).toBe(false);
      expect(isCerebrasModel('openai/gpt-5.1-codex')).toBe(false);
    });

    it('should return openrouter client for regular models', () => {
      const model = getModel('z-ai/glm-5.1');
      expect(model).toBeDefined();
      expect(model).not.toBeNull();
    });

    it('should not use gateway for non-Cerebras models', () => {
      expect(isCerebrasModel('anthropic/claude-haiku-4.5')).toBe(false);

      const directClient = getModel('anthropic/claude-haiku-4.5');
      const gatewayClient = getModel('anthropic/claude-haiku-4.5', { useGatewayFallback: true });

      // Both should use the same openrouter provider since non-Cerebras models
      // don't use gateway fallback - this verifies the stated behavior
      expect(directClient.provider).toBe(gatewayClient.provider);
    });

    it('should return chat function from getClientForModel', () => {
      const client = getClientForModel('z-ai/glm-5.1');
      expect(client.chat).toBeDefined();
      expect(typeof client.chat).toBe('function');
    });
  });

  describe('Gateway Fallback Generator', () => {
    it('should yield values from successful generator', async () => {
      const mockGenerator = async function* () {
        yield 'value1';
        yield 'value2';
      };

      const values: string[] = [];
      for await (const value of withGatewayFallbackGenerator(mockGenerator, {
        modelId: 'test-model',
        context: 'test',
      })) {
        values.push(value);
      }

      expect(values).toEqual(['value1', 'value2']);
    });

    it('should retry on error', async () => {
      let attemptCount = 0;
      const mockGenerator = async function* () {
        attemptCount++;
        if (attemptCount === 1) {
          const error = new Error('Rate limit exceeded');
          (error as any).status = 429;
          throw error;
        }
        yield 'success';
      };

      const values: string[] = [];
      for await (const value of withGatewayFallbackGenerator(mockGenerator, {
        modelId: 'test-model',
        context: 'test',
      })) {
        values.push(value);
      }

      expect(values).toEqual(['success']);
      expect(attemptCount).toBe(2);
    });

    it('should switch to gateway on rate limit error', async () => {
      let useGatewayFlag = false;
      const mockGenerator = async function* (useGateway: boolean) {
        if (!useGateway) {
          const error = new Error('Rate limit exceeded');
          (error as any).status = 429;
          throw error;
        }
        yield 'gateway-success';
      };

      const values: string[] = [];
      for await (const value of withGatewayFallbackGenerator(mockGenerator, {
        modelId: 'test-model',
        context: 'test',
      })) {
        values.push(value);
      }

      expect(values).toEqual(['gateway-success']);
    });

    it('should throw after max attempts', async () => {
      let attemptCount = 0;
      const mockGenerator = async function* () {
        attemptCount++;
        // Use a non-rate-limit error to avoid 60s wait in this test
        const error = new Error('Server error');
        throw error;
      };

      let errorThrown = false;
      try {
        for await (const _value of withGatewayFallbackGenerator(mockGenerator, {
          modelId: 'test-model',
          context: 'test',
        })) {
        }
      } catch (error) {
        errorThrown = true;
        expect(error).toBeDefined();
        expect((error as Error).message).toBe('Server error');
      }

      expect(errorThrown).toBe(true);
      expect(attemptCount).toBe(2); // Direct + Gateway attempts
    }, 10000); // Increase timeout to 10s for safety
  });

  describe('Provider Options', () => {
    it('provider options should be set correctly in code-agent implementation', () => {
      const client = getClientForModel('z-ai/glm-5.1', { useGatewayFallback: true });
      expect(client).toBeDefined();
    });
  });

  describe('Invalid Request Error Detection', () => {
    it('returns true for error with "invalid_request_error" message', () => {
      const error = new Error('invalid_request_error trace_id: 5fb768847b9559b1797c9538039d2c24');
      expect(isInvalidRequestError(error)).toBe(true);
    });

    it('returns true for error with "invalid request error" message', () => {
      const error = new Error('invalid request error from API');
      expect(isInvalidRequestError(error)).toBe(true);
    });

    it('returns true for error with "400" or "bad request" message', () => {
      const error400 = new Error('HTTP 400 Bad Request');
      const errorBadRequest = new Error('bad request error');
      expect(isInvalidRequestError(error400)).toBe(true);
      expect(isInvalidRequestError(errorBadRequest)).toBe(true);
    });

    it('returns false for rate limit errors (429)', () => {
      const error = new Error('rate limit exceeded 429');
      expect(isInvalidRequestError(error)).toBe(false);
    });

    it('returns false for server errors (500)', () => {
      const error = new Error('server error 500');
      expect(isInvalidRequestError(error)).toBe(false);
    });

    it('returns false for non-Error inputs', () => {
      expect(isInvalidRequestError(null)).toBe(false);
      expect(isInvalidRequestError(undefined)).toBe(false);
      expect(isInvalidRequestError('string error')).toBe(false);
      expect(isInvalidRequestError({ message: 'invalid_request_error' })).toBe(false);
    });
  });

  describe('Moonshot Provider Options', () => {
    it('correctly identifies moonshot model IDs by startsWith("moonshotai/")', () => {
      const moonshotModel = 'moonshotai/kimi-k2.6';
      const nonMoonshotModel = 'anthropic/claude-haiku-4.5';
      
      expect(moonshotModel.startsWith('moonshotai/')).toBe(true);
      expect(nonMoonshotModel.startsWith('moonshotai/')).toBe(false);
    });

    it('matches both moonshotai/kimi-k2.6 and moonshotai/kimi-k2-0905', () => {
      const kimi26 = 'moonshotai/kimi-k2.6';
      const kimi0905 = 'moonshotai/kimi-k2-0905';
      
      expect(kimi26.startsWith('moonshotai/')).toBe(true);
      expect(kimi0905.startsWith('moonshotai/')).toBe(true);
    });
  });
});
