import type { ProductCandidate } from '@/domain/product-recognition';
import { createClient } from '@supabase/supabase-js';

import {
  lookupSharedProductByIdentifier,
  lookupSharedProductsByText,
  lookupProductsByVisualFallback,
  refreshSharedProductByIdentifier,
  submitConfirmedWebProduct,
  submitWrongProductGuess,
  textLookupRequestBody,
  wrongGuessSubmissionBody,
  VisualLookupError,
} from './shared-product-api';

const mockGetSession = jest.fn();
const mockGetUser = jest.fn();
const mockSignInAnonymously = jest.fn();
const mockSignOut = jest.fn();
const mockInvoke = jest.fn();
const mockSupabase = {
  auth: {
    getSession: mockGetSession,
    getUser: mockGetUser,
    signInAnonymously: mockSignInAnonymously,
    signOut: mockSignOut,
  },
  functions: { invoke: mockInvoke },
};

jest.mock('expo-sqlite/localStorage/install', () => ({}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(),
}));

const mockCreateClient = jest.mocked(createClient);

beforeAll(() => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-key';
  mockCreateClient.mockReturnValue(
    mockSupabase as unknown as ReturnType<typeof createClient>,
  );
});

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { user: { id: 'u1' } } },
  });
  mockGetUser.mockResolvedValue({
    data: { user: { id: 'u1' } },
    error: null,
  });
  mockSignInAnonymously.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

describe('shared product submissions', () => {
  it('uses text mode with normalized OCR text', () => {
    expect(
      textLookupRequestBody('CeraVe\nSoin pour le visage\nCleanser'),
    ).toEqual({ mode: 'text', value: 'cerave cleanser' });
  });

  it('builds an immediate wrong_guess submission without photo data', () => {
    const candidate: ProductCandidate = {
      id: 'shared-product-id',
      name: 'Foaming Facial Cleanser',
      brand: 'CeraVe',
      category: 'Nettoyant',
      imageUrl: 'https://example.com/product.jpg',
      score: 0.92,
      source: 'shared',
    };

    const body = wrongGuessSubmissionBody(
      candidate,
      'CeraVe\nFoaming Facial Cleanser\n236 ml',
    );

    expect(body).toEqual({
      reason: 'wrong_guess',
      proposedProductId: 'shared-product-id',
      identifierValue: 'cerave foaming facial cleanser',
      name: 'Foaming Facial Cleanser',
      brand: 'CeraVe',
      category: 'Nettoyant',
    });
    expect(body).not.toHaveProperty('image');
    expect(body).not.toHaveProperty('imageUrl');
  });
});

describe('shared catalogue network lookup', () => {
  it('maps an identifier match and infers a missing category', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        matches: [
          {
            id: 'shared-product',
            name: 'Foaming Facial Cleanser',
            brand: 'CeraVe',
            category: null,
            imageUrl: null,
          },
        ],
      },
      error: null,
    });

    await expect(
      lookupSharedProductByIdentifier('3606000537194'),
    ).resolves.toMatchObject({
      name: 'Foaming Facial Cleanser',
      category: 'Nettoyant',
      barcode: '3606000537194',
    });
    expect(mockInvoke).toHaveBeenCalledWith(
      'product-lookup',
      expect.objectContaining({
        body: { mode: 'identifier', value: '3606000537194' },
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it('returns null for a definitive shared catalogue miss', async () => {
    mockInvoke.mockResolvedValue({ data: { matches: [] }, error: null });

    await expect(
      lookupSharedProductByIdentifier('12345678'),
    ).resolves.toBeNull();
  });

  it('refreshes completed fields without starting another enrichment job', async () => {
    mockInvoke.mockResolvedValue({ data: { matches: [] }, error: null });

    await refreshSharedProductByIdentifier('3606000537194');

    expect(mockInvoke).toHaveBeenCalledWith(
      'product-lookup',
      expect.objectContaining({
        body: {
          mode: 'identifier_refresh',
          value: '3606000537194',
        },
      }),
    );
  });

  it('creates an anonymous session only when needed', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockInvoke.mockResolvedValue({ data: { matches: [] }, error: null });

    await lookupSharedProductsByText('CeraVe cleanser');

    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('replaces a stale anonymous session after a backend reset', async () => {
    mockGetUser.mockResolvedValueOnce({
      data: { user: null },
      error: new Error('user_not_found'),
    });
    mockInvoke.mockResolvedValue({ data: { matches: [] }, error: null });

    await lookupSharedProductsByText('CeraVe cleanser');

    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'local' });
    expect(mockSignInAnonymously).toHaveBeenCalledTimes(1);
  });

  it('propagates authentication and function errors to orchestration', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } });
    mockSignInAnonymously.mockResolvedValueOnce({
      error: new Error('auth_failed'),
    });
    await expect(lookupSharedProductsByText('CeraVe cleanser')).rejects.toThrow(
      'auth_failed',
    );

    mockGetSession.mockResolvedValueOnce({
      data: { session: { user: { id: 'u1' } } },
    });
    mockInvoke.mockResolvedValueOnce({
      data: null,
      error: new Error('function_failed'),
    });
    await expect(lookupSharedProductsByText('CeraVe cleanser')).rejects.toThrow(
      'function_failed',
    );
  });

  it('maps ranked text candidates returned by the shared function', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        matches: [
          {
            id: 'shared-product',
            name: 'Foaming Facial Cleanser',
            brand: 'CeraVe',
            category: null,
            imageUrl: null,
            score: 0.91,
          },
        ],
      },
      error: null,
    });

    await expect(
      lookupSharedProductsByText('CeraVe cleanser'),
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'shared-product',
        category: 'Nettoyant',
        score: 0.91,
        source: 'shared',
      }),
    ]);
  });

  it('maps the visual fallback without exposing provider internals', async () => {
    mockInvoke.mockResolvedValue({
      data: {
        matches: [
          {
            id: 'google-web:serum',
            name: 'Hydrating Serum',
            brand: 'Example Brand',
            category: 'Sérum',
            imageUrl: 'https://example-brand.com/serum.png',
            sourceUrl: 'https://example-brand.com/products/serum',
            score: 0.82,
            ingredientsText: 'Aqua, Glycerin',
            ingredientsSource: 'manufacturer',
          },
        ],
      },
      error: null,
    });

    await expect(
      lookupProductsByVisualFallback({
        imageBase64: 'encoded-image',
        mimeType: 'image/jpeg',
        recognizedText: 'Example Brand serum',
        requestId: 'visual-test-1',
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        candidates: [
          expect.objectContaining({
            source: 'google-web',
            imageSourceUrl: 'https://example-brand.com/products/serum',
            ingredientsText: 'Aqua, Glycerin',
          }),
        ],
      }),
    );
  });

  it('preserves the visual quota error for a recoverable scanner state', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(JSON.stringify({ error: 'quota_reached' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
      },
    });

    await expect(
      lookupProductsByVisualFallback({
        imageBase64: 'encoded-image',
        mimeType: 'image/jpeg',
        recognizedText: 'Example Brand serum',
        requestId: 'visual-test-2',
      }),
    ).rejects.toEqual(new VisualLookupError('quota_reached'));
  });

  it('classifies a transport failure thrown before the relay responds', async () => {
    mockInvoke.mockRejectedValue(new TypeError('Network request failed'));

    await expect(
      lookupProductsByVisualFallback({
        imageBase64: 'encoded-image',
        mimeType: 'image/jpeg',
        recognizedText: 'Example Brand serum',
        requestId: 'visual-test-3',
      }),
    ).rejects.toEqual(new VisualLookupError('network_unavailable'));
  });

  it('submits corrections only for shared candidates', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
    const candidate: ProductCandidate = {
      id: 'shared-product',
      name: 'Foaming Facial Cleanser',
      brand: 'CeraVe',
      category: 'Nettoyant',
      imageUrl: null,
      score: 0.91,
      source: 'shared',
    };

    await submitWrongProductGuess(candidate, 'CeraVe cleanser');
    await submitWrongProductGuess(
      { ...candidate, source: 'open-beauty-facts' },
      'CeraVe cleanser',
    );

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    expect(mockInvoke).toHaveBeenCalledWith(
      'product-submission',
      expect.objectContaining({
        body: expect.objectContaining({ reason: 'wrong_guess' }),
      }),
    );
  });

  it('submits a confirmed web candidate as pending provenance only', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
    const candidate: ProductCandidate = {
      id: 'google-web:serum',
      name: 'Hydrating Serum',
      brand: 'Example Brand',
      category: 'Sérum',
      imageUrl: 'https://example-brand.com/serum.png',
      imageSourceUrl: 'https://example-brand.com/products/serum',
      ingredientsText: null,
      ingredientsSource: null,
      ingredientsSourceUrl: null,
      score: 0.82,
      source: 'google-web',
    };

    await submitConfirmedWebProduct(candidate, 'Example Brand serum');

    expect(mockInvoke).toHaveBeenCalledWith(
      'product-submission',
      expect.objectContaining({
        body: expect.objectContaining({
          reason: 'new_product',
          imageSourceUrl: 'https://example-brand.com/products/serum',
        }),
        signal: expect.any(AbortSignal),
      }),
    );
    expect(mockInvoke.mock.calls[0][1].body).not.toHaveProperty('imageBase64');
  });

  it('preserves a scanned manufacturer code in a confirmed web submission', async () => {
    mockInvoke.mockResolvedValue({ data: { status: 'pending' }, error: null });
    const candidate: ProductCandidate = {
      id: 'google-web:aroma-zone',
      name: 'Sérum concentré de jeunesse',
      brand: 'AROMA-ZONE',
      category: 'Sérum',
      imageUrl: 'https://example.com/product.webp',
      imageSourceUrl: 'https://example.com/product',
      score: 0.9,
      source: 'google-web',
    };

    await submitConfirmedWebProduct(candidate, 'AROMA-ZONE Sérum', '05110');

    expect(mockInvoke).toHaveBeenCalledWith(
      'product-submission',
      expect.objectContaining({
        body: expect.objectContaining({ identifierValue: '05110' }),
      }),
    );
  });
});
