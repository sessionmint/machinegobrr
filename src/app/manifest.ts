import { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SessionMint.fun',
    short_name: 'SessionMint',
    description: 'MachineGoBrr hosted on SessionMint.fun',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0c',
    theme_color: '#0a0a0c',
    icons: [
      {
        src: '/logo-fav.jpg',
        sizes: '634x634',
        type: 'image/jpeg',
      },
      {
        src: '/logo-fav.jpg',
        sizes: '634x634',
        type: 'image/jpeg',
      },
      {
        src: '/logo-fav.jpg',
        sizes: '634x634',
        type: 'image/jpeg',
      },
    ],
  };
}
