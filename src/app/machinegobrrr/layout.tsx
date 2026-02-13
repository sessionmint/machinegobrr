import type { ReactNode } from 'react';
import { WalletProvider } from '@/components/WalletProvider';

export default function MachineGoBrrrLayout({ children }: { children: ReactNode }) {
  return <WalletProvider>{children}</WalletProvider>;
}
