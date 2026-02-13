'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddressType, BrowserSDK, isMobileDevice } from '@phantom/browser-sdk';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import { PHANTOM_APP_ID } from '@/lib/constants';

interface PhantomWalletContextValue {
  address: string | null;
  publicKey: PublicKey | null;
  connected: boolean;
  connecting: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<Uint8Array>;
  signAndSendTransaction: (transaction: Transaction | VersionedTransaction) => Promise<string>;
}

const PhantomWalletContext = createContext<PhantomWalletContextValue | null>(null);

function createPhantomSdk(): BrowserSDK {
  const redirectUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/machinegobrrr`
      : undefined;
  return new BrowserSDK({
    // "deeplink" enables mobile support when the Phantom extension isn't installed.
    providers: ['injected', 'deeplink'],
    addressTypes: [AddressType.solana],
    appId: PHANTOM_APP_ID || undefined,
    authOptions: redirectUrl ? { redirectUrl } : undefined,
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const sdkRef = useRef<BrowserSDK | null>(null);
  const autoConnectAttemptedRef = useRef(false);
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const getSdk = useCallback((): BrowserSDK => {
    if (!sdkRef.current) {
      sdkRef.current = createPhantomSdk();
    }
    return sdkRef.current;
  }, []);

  const resolveConnectedAddress = useCallback(async (sdk: BrowserSDK): Promise<string | null> => {
    return sdk.solana.getPublicKey();
  }, []);

  const discoverInjectedWallets = useCallback(async (sdk: BrowserSDK) => {
    await sdk.discoverWallets();
    const discoveredWallets = sdk.getDiscoveredWallets();

    return discoveredWallets;
  }, []);

  const pickWalletId = useCallback(
    (wallets: ReturnType<BrowserSDK['getDiscoveredWallets']>): string | null => {
      const phantomWallet = wallets.find((wallet) => {
        const id = wallet.id.toLowerCase();
        const name = wallet.name.toLowerCase();
        return id === 'phantom' || name.includes('phantom');
      });

      return phantomWallet?.id ?? null;
    },
    []
  );

  useEffect(() => {
    if (autoConnectAttemptedRef.current) return;
    autoConnectAttemptedRef.current = true;

    const sdk = getSdk();
    let cancelled = false;

    (async () => {
      try {
        await sdk.autoConnect();
        const nextAddress = await resolveConnectedAddress(sdk);
        if (!cancelled && nextAddress) {
          setAddress(nextAddress);
        }
      } catch {
        // No existing session (or autoConnect not supported for current provider set).
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getSdk, resolveConnectedAddress]);

  const connect = useCallback(async () => {
    if (connecting) return;

    setConnecting(true);
    try {
      const sdk = getSdk();
      const discoveredWallets = await discoverInjectedWallets(sdk);
      const walletId = pickWalletId(discoveredWallets);

      if (walletId) {
        await sdk.connect({ provider: 'injected', walletId });
      } else if (isMobileDevice()) {
        // Mobile fallback - opens Phantom via deep link when extension injection isn't available.
        await sdk.connect({ provider: 'deeplink' });
      } else {
        throw new Error('Phantom wallet not found. Install/enable Phantom and reload.');
      }

      const nextAddress = await resolveConnectedAddress(sdk);
      if (!nextAddress) {
        throw new Error('Unable to get connected Phantom address');
      }
      setAddress(nextAddress);
    } finally {
      setConnecting(false);
    }
  }, [connecting, discoverInjectedWallets, getSdk, pickWalletId, resolveConnectedAddress]);

  const disconnect = useCallback(async () => {
    const sdk = getSdk();
    await sdk.disconnect();
    setAddress(null);
  }, [getSdk]);

  const signMessage = useCallback(
    async (message: string): Promise<Uint8Array> => {
      const sdk = getSdk();
      const nextAddress = address || (await resolveConnectedAddress(sdk));
      if (!nextAddress) {
        throw new Error('Connect Phantom first');
      }

      const result = await sdk.solana.signMessage(message);
      return result.signature;
    },
    [address, getSdk, resolveConnectedAddress]
  );

  const signAndSendTransaction = useCallback(
    async (transaction: Transaction | VersionedTransaction): Promise<string> => {
      const sdk = getSdk();
      const nextAddress = address || (await resolveConnectedAddress(sdk));
      if (!nextAddress) {
        throw new Error('Connect Phantom first');
      }

      const result = await sdk.solana.signAndSendTransaction(transaction);
      return result.signature;
    },
    [address, getSdk, resolveConnectedAddress]
  );

  const value = useMemo<PhantomWalletContextValue>(() => {
    const publicKey = address ? new PublicKey(address) : null;
    return {
      address,
      publicKey,
      connected: Boolean(address),
      connecting,
      connect,
      disconnect,
      signMessage,
      signAndSendTransaction,
    };
  }, [address, connecting, connect, disconnect, signMessage, signAndSendTransaction]);

  return (
    <PhantomWalletContext.Provider value={value}>
      {children}
    </PhantomWalletContext.Provider>
  );
}

export function usePhantomWallet(): PhantomWalletContextValue {
  const context = useContext(PhantomWalletContext);
  if (!context) {
    throw new Error('usePhantomWallet must be used inside WalletProvider');
  }
  return context;
}
