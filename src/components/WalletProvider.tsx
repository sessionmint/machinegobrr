'use client';

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AddressType, BrowserSDK } from '@phantom/browser-sdk';
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
  return new BrowserSDK({
    providers: ['injected'],
    addressTypes: [AddressType.solana],
    appId: PHANTOM_APP_ID || undefined,
  });
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const sdkRef = useRef<BrowserSDK | null>(null);
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

    if (!discoveredWallets.length) {
      throw new Error('No injected wallet found. Install/enable Phantom and reload.');
    }

    return discoveredWallets;
  }, []);

  const pickWalletId = useCallback(
    (wallets: ReturnType<BrowserSDK['getDiscoveredWallets']>): string => {
      const phantomWallet = wallets.find((wallet) => {
        const id = wallet.id.toLowerCase();
        const name = wallet.name.toLowerCase();
        return id === 'phantom' || name.includes('phantom');
      });

      return phantomWallet?.id || wallets[0].id;
    },
    []
  );

  const connect = useCallback(async () => {
    if (connecting) return;

    setConnecting(true);
    try {
      const sdk = getSdk();
      const discoveredWallets = await discoverInjectedWallets(sdk);
      const walletId = pickWalletId(discoveredWallets);

      await sdk.connect({ provider: 'injected', walletId });
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
